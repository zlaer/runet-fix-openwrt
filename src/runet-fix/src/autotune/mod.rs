pub mod prober;

use self::prober::probe_https;
use crate::os::uci;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::Duration;

const LOCK_DIR: &str = "/var/lock/runet-fix-autotune";
const NFQUEUE_TABLE: &str = "/proc/net/netfilter/nfnetlink_queue";

pub struct PresetScore {
    pub preset: String,
    pub yt_code: String,
    pub yt_ms: u64,
    pub dc_code: String,
    pub dc_ms: u64,
    pub score: u64,
}

fn find_nfqws() -> Option<String> {
    for b in &[
        "/usr/bin/nfqws",
        "/opt/zapret/nfq/nfqws",
        "/usr/bin/nfqws2",
        "/opt/zapret2/nfq2/nfqws2",
    ] {
        if std::path::Path::new(b).exists() {
            return Some(b.to_string());
        }
    }
    None
}

/// Simple directory lock so two autotune runs cannot fight over the same NFQUEUE.
struct AutotuneLock;

impl AutotuneLock {
    /// Returns Err(pid) when another live instance owns the lock.
    fn acquire() -> Result<Self, String> {
        let path = std::path::Path::new(LOCK_DIR);
        if path.exists() {
            let pid = std::fs::read_to_string(path.join("pid"))
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            if !pid.is_empty() && std::path::Path::new(&format!("/proc/{}", pid)).exists() {
                return Err(pid);
            }
            // Stale lock (owner died) - drop it and take over.
            let _ = std::fs::remove_dir_all(path);
        }
        std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
        std::fs::write(path.join("pid"), std::process::id().to_string())
            .map_err(|e| e.to_string())?;
        Ok(AutotuneLock)
    }
}

impl Drop for AutotuneLock {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(LOCK_DIR);
    }
}

/// True while some line of nfnetlink_queue still belongs to `qnum`.
fn queue_busy(qnum: &str) -> bool {
    let data = match std::fs::read_to_string(NFQUEUE_TABLE) {
        Ok(d) => d,
        Err(_) => return false,
    };
    for line in data.lines().skip(1) {
        if let Some(first) = line.split_whitespace().next() {
            if first == qnum {
                return true;
            }
        }
    }
    false
}

/// Wait (max ~3s) until the queue is released after the child died.
fn wait_queue_released(qnum: &str) {
    for _ in 0..60 {
        if !queue_busy(qnum) {
            return;
        }
        thread::sleep(Duration::from_millis(50));
    }
}

/// Stop only the procd-managed zapret instance, keeping firewall rules intact.
/// Removing the whole service would also drop the nft/iptables rules that send
/// traffic to the queue, so the candidate probes would bypass DPI entirely.
fn stop_zapret_instance() {
    let _ = Command::new("ubus")
        .args([
            "call",
            "service",
            "delete",
            r#"{"name":"runet-fix","instance":"zapret"}"#,
        ])
        .output();
}

fn spawn_candidate_nfqws(nfq_bin: &str, preset: &str, qnum: &str) -> Option<Child> {
    let bin_dir = "/usr/share/runet-fix/bin";
    let exclude = "/usr/share/runet-fix/lists/zapret-exclude.txt";
    let desync = crate::zapret::get_zapret_args(preset, None);

    let mut args: Vec<String> = vec![
        format!("--qnum={}", qnum),
        "--filter-udp=443".to_string(),
        "--dpi-desync=fake".to_string(),
        "--dpi-desync-repeats=11".to_string(),
    ];
    let quic_bin = format!("{}/quic_initial_www_google_com.bin", bin_dir);
    if std::path::Path::new(&quic_bin).exists() {
        args.push(format!("--dpi-desync-fake-quic={}", quic_bin));
    }

    args.push("--new".to_string());
    args.push("--filter-tcp=80,443".to_string());
    for part in desync.split_whitespace() {
        args.push(part.to_string());
    }

    if std::path::Path::new(exclude).exists() {
        if let Ok(metadata) = std::fs::metadata(exclude) {
            if metadata.len() > 0 {
                args.push(format!("--hostlist-exclude={}", exclude));
            }
        }
    }

    Command::new(nfq_bin)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .ok()
}

pub fn run(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let mut is_json = false;
    let mut do_apply = false;

    for a in args {
        if a == "--json" {
            is_json = true;
        } else if a == "--apply" {
            do_apply = true;
        }
    }

    let _lock = match AutotuneLock::acquire() {
        Ok(lock) => lock,
        Err(_pid) => {
            if is_json {
                println!("{{\"error\":\"autotune already running\"}}");
            } else {
                println!(
                    "Autotune is already running (lock: {}). Aborting.",
                    LOCK_DIR
                );
            }
            return Ok(());
        }
    };

    let orig_preset =
        uci::get("runet-fix.zapret.preset").unwrap_or_else(|| "youtube_4k".to_string());
    let qnum = uci::get("runet-fix.zapret.qnum")
        .filter(|s| s.parse::<u16>().map(|v| v > 0).unwrap_or(false))
        .unwrap_or_else(|| "200".to_string());
    let nfq_bin = find_nfqws();

    let candidates = [
        "flowseal_general",
        "youtube_4k",
        "general_alt",
        "general_alt11",
        "general_fake_tls_auto",
        "fakedsplit_badseq",
    ];

    if !is_json {
        println!("=== [runet-fix Zapret Native Autotune & Preset Benchmark] ===");
    }

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    let mut best_preset = String::new();
    let mut best_score: u64 = 999999;
    let mut results: Vec<PresetScore> = Vec::new();

    // The procd instance owns the queue; remove just that instance so the
    // firewall keeps redirecting traffic to NFQUEUE for our probe candidates.
    if nfq_bin.is_some() {
        stop_zapret_instance();
        wait_queue_released(&qnum);
    }

    for p in candidates {
        if !is_json {
            print!("Testing preset '{}'... ", p);
            let _ = std::io::Write::flush(&mut std::io::stdout());
        }

        let mut child = if let Some(ref bin) = nfq_bin {
            let c = spawn_candidate_nfqws(bin, p, &qnum);
            thread::sleep(Duration::from_millis(60));
            c
        } else {
            uci::set("runet-fix.zapret.preset", p);
            let _ = Command::new("/etc/init.d/runet-fix")
                .arg("restart")
                .output();
            thread::sleep(Duration::from_secs(1));
            None
        };

        let (yt, dc) = runtime.block_on(async {
            tokio::join!(
                probe_https("www.youtube.com", 443, 1500),
                probe_https("gateway.discord.gg", 443, 1500)
            )
        });

        if let Some(ref mut c) = child {
            let _ = c.kill();
            let _ = c.wait();
        }
        if nfq_bin.is_some() {
            wait_queue_released(&qnum);
        }

        let mut score: u64 = 999999;
        if yt.success && yt.status_code != "000" {
            score = yt.latency_ms + dc.latency_ms;
        }

        if score < best_score {
            best_score = score;
            best_preset = p.to_string();
        }

        if !is_json {
            println!(
                "YouTube: HTTP {} ({}ms), Discord: HTTP {} ({}ms) [score: {}]",
                yt.status_code, yt.latency_ms, dc.status_code, dc.latency_ms, score
            );
        }

        results.push(PresetScore {
            preset: p.to_string(),
            yt_code: yt.status_code,
            yt_ms: yt.latency_ms,
            dc_code: dc.status_code,
            dc_ms: dc.latency_ms,
            score,
        });
    }

    // Apply or restore
    let service_action = if nfq_bin.is_some() {
        "start"
    } else {
        "restart"
    };
    if do_apply && !best_preset.is_empty() {
        uci::set("runet-fix.zapret.preset", &best_preset);
        uci::commit("runet-fix");
        let _ = Command::new("/etc/init.d/runet-fix")
            .arg(service_action)
            .output();
        if !is_json {
            println!(
                ">>> Best preset '{}' applied to UCI configuration!",
                best_preset
            );
        }
    } else {
        uci::set("runet-fix.zapret.preset", &orig_preset);
        uci::commit("runet-fix");
        let _ = Command::new("/etc/init.d/runet-fix")
            .arg(service_action)
            .output();
    }

    if is_json {
        let mut json_arr = Vec::new();
        for r in &results {
            json_arr.push(format!(
                "{{\"preset\":\"{}\",\"yt_code\":\"{}\",\"yt_ms\":{},\"dc_code\":\"{}\",\"dc_ms\":{},\"score\":{}}}",
                crate::util::json_escape(&r.preset),
                crate::util::json_escape(&r.yt_code),
                r.yt_ms,
                crate::util::json_escape(&r.dc_code),
                r.dc_ms,
                r.score
            ));
        }
        let applied_int = if do_apply { 1 } else { 0 };
        println!(
            "{{\"results\":[{}],\"best_preset\":\"{}\",\"applied\":{}}}",
            json_arr.join(","),
            crate::util::json_escape(&best_preset),
            applied_int
        );
    } else {
        println!("==========================================================");
        println!(
            "Recommended fastest preset: {} (score: {})",
            best_preset, best_score
        );
        if !do_apply {
            println!("Run with --apply to automatically activate this preset.");
        }
        println!("==========================================================");
    }

    Ok(())
}

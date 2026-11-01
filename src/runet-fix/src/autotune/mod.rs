pub mod prober;

use std::process::Command;
use std::thread;
use std::time::Duration;
use crate::os::uci;
use self::prober::probe_https;

pub struct PresetScore {
    pub preset: String,
    pub yt_code: String,
    pub yt_ms: u64,
    pub dc_code: String,
    pub dc_ms: u64,
    pub score: u64,
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

    let orig_preset = uci::get("runet-fix.zapret.preset").unwrap_or_else(|| "youtube_4k".to_string());
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

    for p in candidates {
        if !is_json {
            print!("Testing preset '{}'... ", p);
            let _ = std::io::Write::flush(&mut std::io::stdout());
        }

        uci::set("runet-fix.zapret.preset", p);
        let _ = Command::new("/etc/init.d/runet-fix").arg("restart").output();
        thread::sleep(Duration::from_secs(1));

        let (yt, dc) = runtime.block_on(async {
            let yt = probe_https("www.youtube.com", 443, 2500).await;
            let dc = probe_https("gateway.discord.gg", 443, 2500).await;
            (yt, dc)
        });

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
    if do_apply && !best_preset.is_empty() {
        uci::set("runet-fix.zapret.preset", &best_preset);
        uci::commit("runet-fix");
        let _ = Command::new("/etc/init.d/runet-fix").arg("restart").output();
        if !is_json {
            println!(">>> Best preset '{}' applied to UCI configuration!", best_preset);
        }
    } else {
        uci::set("runet-fix.zapret.preset", &orig_preset);
        uci::commit("runet-fix");
        let _ = Command::new("/etc/init.d/runet-fix").arg("restart").output();
    }

    if is_json {
        let mut json_arr = Vec::new();
        for r in &results {
            json_arr.push(format!(
                "{{\"preset\":\"{}\",\"yt_code\":\"{}\",\"yt_ms\":{},\"dc_code\":\"{}\",\"dc_ms\":{},\"score\":{}}}",
                r.preset, r.yt_code, r.yt_ms, r.dc_code, r.dc_ms, r.score
            ));
        }
        let applied_int = if do_apply { 1 } else { 0 };
        println!(
            "{{\"results\":[{}],\"best_preset\":\"{}\",\"applied\":{}}}",
            json_arr.join(","),
            best_preset,
            applied_int
        );
    } else {
        println!("==========================================================");
        println!("Recommended fastest preset: {} (score: {})", best_preset, best_score);
        if !do_apply {
            println!("Run with --apply to automatically activate this preset.");
        }
        println!("==========================================================");
    }

    Ok(())
}

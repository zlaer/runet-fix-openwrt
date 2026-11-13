pub mod fetcher;
pub mod parser;
pub mod whitelist;

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::Path;
use std::process::Command;
use std::time::Instant;

use self::fetcher::{fetch_url_lines, read_local_file_lines};
use self::parser::extract_domain;
use self::whitelist::WhitelistMatcher;
use crate::os::meminfo::get_available_ram_kb;
use crate::os::uci;

const CONF_DIR: &str = "/tmp/dnsmasq.d";
const CONF_FILE: &str = "/tmp/dnsmasq.d/runet-fix-adblock.conf";
const COUNT_FILE: &str = "/tmp/runet-fix-adblock.count";
const LOCK_DIR: &str = "/var/lock/runet-fix-adblock";

const WHITELIST_PATH: &str = "/usr/share/runet-fix/lists/adblock-whitelist.txt";
const BLACKLIST_PATH: &str = "/usr/share/runet-fix/lists/adblock-blacklist.txt";
const RU_CURATED_PATH: &str = "/usr/share/runet-fix/lists/adblock-ru-curated.txt";

const STEVENBLACK_UNIFIED: &str =
    "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts";
const ADGUARD_RU_FIRSTPARTY: &str =
    "https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/CyrillicFilters/RussianFilter/sections/adservers_firstparty.txt";
const NOCOIN_MINERS: &str =
    "https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/hosts.txt";

struct AdblockLock;

impl AdblockLock {
    fn acquire() -> Result<Self, String> {
        let path = Path::new(LOCK_DIR);
        if path.exists() {
            let pid = fs::read_to_string(path.join("pid"))
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            if !pid.is_empty() && Path::new(&format!("/proc/{}", pid)).exists() {
                return Err(pid);
            }
            let _ = fs::remove_dir_all(path);
        }
        fs::create_dir_all(path).map_err(|e| e.to_string())?;
        fs::write(path.join("pid"), std::process::id().to_string()).map_err(|e| e.to_string())?;
        Ok(AdblockLock)
    }
}

impl Drop for AdblockLock {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(LOCK_DIR);
    }
}

fn sync_cron() {
    let auto_update =
        uci::get("runet-fix.adblock.auto_update").unwrap_or_else(|| "weekly".to_string());
    let cron_path = "/etc/crontabs/root";
    let _ = fs::create_dir_all("/etc/crontabs");
    let current = fs::read_to_string(cron_path).unwrap_or_default();
    let new_lines: Vec<&str> = current
        .lines()
        .filter(|l| !l.contains("runet-fix-adblock"))
        .collect();

    let cron_entry = match auto_update.as_str() {
        "daily" => Some("0 4 * * * /usr/share/runet-fix/scripts/update-adblock.sh >/dev/null 2>&1 # runet-fix-adblock"),
        "weekly" => Some("0 4 * * 0 /usr/share/runet-fix/scripts/update-adblock.sh >/dev/null 2>&1 # runet-fix-adblock"),
        _ => None,
    };

    let mut content = new_lines.join("\n");
    if let Some(entry) = cron_entry {
        if !content.is_empty() {
            content.push('\n');
        }
        content.push_str(entry);
        content.push('\n');
        let _ = Command::new("/etc/init.d/cron").arg("enable").status();
    } else if !content.is_empty() {
        content.push('\n');
    }

    if fs::write(cron_path, content).is_ok() {
        let _ = Command::new("/etc/init.d/cron").arg("restart").status();
    }
}

pub fn run(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let _lock = match AdblockLock::acquire() {
        Ok(lock) => lock,
        Err(pid) => {
            eprintln!(
                "[runet-fix:adblock] Another adblock update is running (PID {}). Aborting.",
                pid
            );
            return Err("Adblock update already running".into());
        }
    };

    sync_cron();

    let start_time = Instant::now();

    let mut profile =
        uci::get("runet-fix.adblock.profile").unwrap_or_else(|| "standard".to_string());
    let enabled = uci::get("runet-fix.adblock.enabled").unwrap_or_else(|| "1".to_string()) == "1";
    let enable_ru =
        uci::get("runet-fix.adblock.enable_ru").unwrap_or_else(|| "1".to_string()) == "1";

    // CLI overrides
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--profile" && i + 1 < args.len() {
            profile = args[i + 1].clone();
            i += 2;
        } else {
            i += 1;
        }
    }

    if !enabled {
        println!("[runet-fix:adblock] Adblock is disabled in UCI configuration. Cleaning up...");
        let _ = fs::remove_file(CONF_FILE);
        let _ = fs::remove_file(COUNT_FILE);
        let _ = Command::new("/etc/init.d/dnsmasq").arg("restart").status();
        return Ok(());
    }

    // Safeguard: Check available RAM on low-spec routers (<12MB RAM)
    let avail_kb = get_available_ram_kb();
    if avail_kb < 12288 && profile != "micro" {
        println!(
            "[runet-fix:adblock] Warning: Low available memory ({} kB < 12 MB). Automatically downgrading to micro profile (<2MB RAM) to prevent OOM panic.",
            avail_kb
        );
        profile = "micro".to_string();
    }

    let _ = fs::create_dir_all(CONF_DIR);

    // 1. Load Whitelist
    let mut whitelist = WhitelistMatcher::new();
    whitelist.load_from_file(WHITELIST_PATH);
    if whitelist.count() > 0 {
        println!(
            "[runet-fix:adblock] Loaded {} whitelist rules (with hierarchical subdomain matching)",
            whitelist.count()
        );
    }

    let mut blocked_domains: HashSet<String> = HashSet::with_capacity(80000);

    // 2. Fetch Base Adblock List (StevenBlack) unless Micro profile
    if profile != "micro" {
        println!("[runet-fix:adblock] Fetching StevenBlack base adblock list...");
        let _ = fetch_url_lines(STEVENBLACK_UNIFIED, |line| {
            if let Some(domain) = extract_domain(line) {
                if !whitelist.is_whitelisted(&domain) {
                    blocked_domains.insert(domain);
                }
            }
        });
    } else {
        println!("[runet-fix:adblock] Micro profile active (<2MB RAM) - loading curated Russian ad/tracker filters...");
    }

    // 3. Russian Filters
    if enable_ru {
        println!("[runet-fix:adblock] Adding Russian AdList & AdGuard filters...");
        let _ = fetch_url_lines(ADGUARD_RU_FIRSTPARTY, |line| {
            if let Some(domain) = extract_domain(line) {
                if !whitelist.is_whitelisted(&domain) {
                    blocked_domains.insert(domain);
                }
            }
        });

        if Path::new(RU_CURATED_PATH).exists() {
            read_local_file_lines(RU_CURATED_PATH, |line| {
                if let Some(domain) = extract_domain(line) {
                    if !whitelist.is_whitelisted(&domain) {
                        blocked_domains.insert(domain);
                    }
                }
            });
        }
    }

    // 4. Aggressive profile additions (Crypto miners)
    if profile == "aggressive" {
        println!("[runet-fix:adblock] Adding Anti-Coinminer protection...");
        let _ = fetch_url_lines(NOCOIN_MINERS, |line| {
            if let Some(domain) = extract_domain(line) {
                if !whitelist.is_whitelisted(&domain) {
                    blocked_domains.insert(domain);
                }
            }
        });
    }

    // 5. Custom Blacklist
    if Path::new(BLACKLIST_PATH).exists() {
        read_local_file_lines(BLACKLIST_PATH, |line| {
            if let Some(domain) = extract_domain(line) {
                if !whitelist.is_whitelisted(&domain) {
                    blocked_domains.insert(domain);
                }
            }
        });
    }

    let total = blocked_domains.len();
    println!(
        "[runet-fix:adblock] Total unique ad domains blocked: {}",
        total
    );

    // Safeguard: Do not replace running configuration if sources failed or count is suspiciously low
    let min_threshold = if profile == "micro" { 500 } else { 5000 };
    if total < min_threshold {
        eprintln!(
            "[runet-fix:adblock] Error: Domain count ({}) below safety threshold ({}). Aborting to preserve existing configuration.",
            total, min_threshold
        );
        return Err(format!("Domain count {} below threshold {}", total, min_threshold).into());
    }

    // 6. Write formatted dnsmasq configuration atomically via temp file
    let tmp_conf = format!("{}.tmp.{}", CONF_FILE, std::process::id());
    {
        let file = File::create(&tmp_conf)?;
        let mut writer = BufWriter::with_capacity(65536, file);
        for domain in &blocked_domains {
            writeln!(writer, "address=/{domain}/0.0.0.0")?;
        }
        writer.flush()?;
    }
    fs::rename(&tmp_conf, CONF_FILE)?;

    // Save count file for LuCI dashboard
    let _ = fs::write(COUNT_FILE, format!("{}\n", total));

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(CONF_FILE, fs::Permissions::from_mode(0o644));
        let _ = fs::set_permissions(COUNT_FILE, fs::Permissions::from_mode(0o644));
    }

    // 7. Reload dnsmasq. A full restart drops DNS for the whole LAN.
    println!("[runet-fix:adblock] Reloading dnsmasq configuration...");
    let reloaded = Command::new("/etc/init.d/dnsmasq")
        .arg("reload")
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !reloaded {
        let restarted = Command::new("/etc/init.d/dnsmasq")
            .arg("restart")
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !restarted {
            let _ = Command::new("killall").args(["-HUP", "dnsmasq"]).status();
        }
    }

    let elapsed = start_time.elapsed();
    println!(
        "[runet-fix:adblock] Adblock compilation completed in {:.2}s. (Profile: {}, Rules: {})",
        elapsed.as_secs_f64(),
        profile,
        total
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adblock_fixture_compilation() {
        let raw_fixture = "\
# Comment line
0.0.0.0 doubleclick.net
127.0.0.1 adservice.google.com
||badtracker.ru^
*.tracking.sub.example.com
! ABP comment
0.0.0.0 whitelisted.com
0.0.0.0 sub.whitelisted.com
";
        let whitelist_fixture = "\
whitelisted.com
";
        let mut wl = WhitelistMatcher::new();
        for line in whitelist_fixture.lines() {
            wl.add_domain(line);
        }

        let mut blocked = HashSet::new();
        for line in raw_fixture.lines() {
            if let Some(dom) = extract_domain(line) {
                if !wl.is_whitelisted(&dom) {
                    blocked.insert(dom);
                }
            }
        }

        let mut sorted: Vec<_> = blocked.into_iter().collect();
        sorted.sort();

        assert_eq!(
            sorted,
            vec![
                "adservice.google.com",
                "badtracker.ru",
                "doubleclick.net",
                "tracking.sub.example.com",
            ]
        );
    }
}

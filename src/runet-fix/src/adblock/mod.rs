pub mod fetcher;
pub mod parser;
pub mod whitelist;

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::Path;
use std::process::Command;
use std::time::Instant;

use crate::os::meminfo::get_available_ram_kb;
use crate::os::uci;
use self::fetcher::{fetch_url_lines, read_local_file_lines};
use self::parser::extract_domain;
use self::whitelist::WhitelistMatcher;

const CONF_DIR: &str = "/tmp/dnsmasq.d";
const CONF_FILE: &str = "/tmp/dnsmasq.d/runet-fix-adblock.conf";
const COUNT_FILE: &str = "/tmp/runet-fix-adblock.count";

const WHITELIST_PATH: &str = "/usr/share/runet-fix/lists/adblock-whitelist.txt";
const BLACKLIST_PATH: &str = "/usr/share/runet-fix/lists/adblock-blacklist.txt";
const RU_CURATED_PATH: &str = "/usr/share/runet-fix/lists/adblock-ru-curated.txt";

const STEVENBLACK_UNIFIED: &str =
    "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts";
const ADGUARD_RU_FIRSTPARTY: &str =
    "https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/CyrillicFilters/RussianFilter/sections/adservers_firstparty.txt";
const NOCOIN_MINERS: &str =
    "https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/hosts.txt";

pub fn run(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let start_time = Instant::now();

    let mut profile = uci::get("runet-fix.adblock.profile").unwrap_or_else(|| "standard".to_string());
    let enabled = uci::get("runet-fix.adblock.enabled").unwrap_or_else(|| "1".to_string()) == "1";
    let enable_ru = uci::get("runet-fix.adblock.enable_ru").unwrap_or_else(|| "1".to_string()) == "1";

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
        fetch_url_lines(STEVENBLACK_UNIFIED, |line| {
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
        fetch_url_lines(ADGUARD_RU_FIRSTPARTY, |line| {
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
        fetch_url_lines(NOCOIN_MINERS, |line| {
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

    // 6. Write formatted dnsmasq configuration directly
    let file = File::create(CONF_FILE)?;
    let mut writer = BufWriter::with_capacity(65536, file);
    for domain in &blocked_domains {
        writeln!(writer, "address=/{}/", domain)?;
    }
    writer.flush()?;

    // Save count file for LuCI dashboard
    let _ = fs::write(COUNT_FILE, format!("{}\n", total));

    // 7. Restart or notify dnsmasq
    println!("[runet-fix:adblock] Notifying dnsmasq...");
    let _ = Command::new("killall").args(&["-HUP", "dnsmasq"]).status();

    let elapsed = start_time.elapsed();
    println!(
        "[runet-fix:adblock] Adblock compilation completed in {:.2}s. (Profile: {}, Rules: {})",
        elapsed.as_secs_f64(),
        profile,
        total
    );

    Ok(())
}

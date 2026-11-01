use std::fs;
use std::net::TcpStream;
use std::process::Command;
use crate::autotune::prober::probe_https;

pub fn run(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let is_json = args.iter().any(|a| a == "--json");

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    let (yt, dc) = runtime.block_on(async {
        let yt = probe_https("www.youtube.com", 443, 2500).await;
        let dc = probe_https("gateway.discord.gg", 443, 2500).await;
        (yt, dc)
    });

    let yt_ok = if yt.success && yt.status_code != "000" { 1 } else { 0 };
    let dc_ok = if dc.success && dc.status_code != "000" { 1 } else { 0 };

    // Check Telegram local port 1443
    let tg_ok = if TcpStream::connect("127.0.0.1:1443").is_ok() { 1 } else { 0 };

    // Read stats JSON
    let tg_stats = fs::read_to_string("/tmp/tg-ws-proxy-stats.json")
        .unwrap_or_else(|_| "{}".to_string())
        .trim()
        .to_string();

    // DNS check via nslookup
    let dns_ok = match Command::new("nslookup").args(&["google.com", "127.0.0.1"]).output() {
        Ok(out) => if out.status.success() { 1 } else { 0 },
        Err(_) => 0,
    };

    // Adblock check via nslookup
    let ad_ok = match Command::new("nslookup").args(&["ad.ae.doubleclick.net", "127.0.0.1"]).output() {
        Ok(out) => {
            let s = String::from_utf8_lossy(&out.stdout);
            if s.contains("NXDOMAIN") || s.contains("0.0.0.0") { 1 } else { 0 }
        }
        Err(_) => 0,
    };

    if is_json {
        let json = format!(
            "{{\"youtube\":{{\"ok\":{},\"code\":\"{}\",\"ms\":{}}},\"discord\":{{\"ok\":{},\"code\":\"{}\",\"ms\":{}}},\"telegram\":{{\"ok\":{},\"stats\":{}}},\"dns\":{{\"ok\":{},\"adblock_ok\":{}}}}}\n",
            yt_ok, yt.status_code, yt.latency_ms,
            dc_ok, dc.status_code, dc.latency_ms,
            tg_ok, tg_stats,
            dns_ok, ad_ok
        );
        print!("{}", json);
        let _ = fs::write("/tmp/runet-fix-test.json", &json);
    } else {
        println!("=== [runet-fix Connectivity Diagnostics] ===");
        print!("Checking DNS resolution (google.com)... ");
        if dns_ok == 1 { println!("OK"); } else { println!("FAIL"); }

        print!("Checking Adblock NXDOMAIN (ad.ae.doubleclick.net)... ");
        if ad_ok == 1 { println!("OK (Blocked)"); } else { println!("FAIL (Allowed)"); }

        print!("Testing YouTube HTTPS connection (port 443)... ");
        if yt_ok == 1 {
            println!("HTTP {} ({}ms)", yt.status_code, yt.latency_ms);
        } else {
            println!("FAIL");
        }

        print!("Testing Discord Gateway (gateway.discord.gg:443)... ");
        if dc_ok == 1 {
            println!("HTTP {} ({}ms)", dc.status_code, dc.latency_ms);
        } else {
            println!("FAIL");
        }

        print!("Testing Telegram local transparent proxy daemon (127.0.0.1:1443)... ");
        if tg_ok == 1 { println!("OK (Listening)"); } else { println!("FAIL (Stopped)"); }
        println!("=============================================");
    }

    Ok(())
}

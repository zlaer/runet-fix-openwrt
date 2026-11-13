use crate::autotune::prober::probe_https;
use std::fs;
use std::net::TcpStream;
use std::process::Command;

pub fn run(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let is_json = args.iter().any(|a| a == "--json");

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    let (yt, dc) = runtime.block_on(async {
        let yt = probe_https("www.youtube.com", 443, 3500).await;
        let dc = probe_https("gateway.discord.gg", 443, 3500).await;
        (yt, dc)
    });

    let yt_ok = if yt.success && yt.status_code != "000" {
        1
    } else {
        0
    };
    let dc_ok = if dc.success && dc.status_code != "000" {
        1
    } else {
        0
    };

    // Check Telegram local port from UCI (fallback 1443)
    let tg_port =
        crate::os::uci::get("runet-fix.telegram.port").unwrap_or_else(|| "1443".to_string());
    let tg_addr = format!("127.0.0.1:{}", tg_port);
    let tg_ok = if TcpStream::connect(&tg_addr).is_ok() {
        1
    } else {
        0
    };

    // Read stats JSON with validation
    let raw_stats =
        fs::read_to_string("/tmp/tg-ws-proxy-stats.json").unwrap_or_else(|_| "{}".to_string());
    let tg_stats = if crate::util::is_valid_json_object(&raw_stats) {
        raw_stats.trim().to_string()
    } else {
        "{}".to_string()
    };

    // DNS check via nslookup
    let dns_ok = match Command::new("nslookup")
        .args(["google.com", "127.0.0.1"])
        .output()
    {
        Ok(out) => {
            if out.status.success() {
                1
            } else {
                0
            }
        }
        Err(_) => 0,
    };

    // Adblock check via nslookup
    let ad_ok = match Command::new("nslookup")
        .args(["ad.ae.doubleclick.net", "127.0.0.1"])
        .output()
    {
        Ok(out) => {
            let s = String::from_utf8_lossy(&out.stdout);
            if s.contains("NXDOMAIN") || s.contains("0.0.0.0") {
                1
            } else {
                0
            }
        }
        Err(_) => 0,
    };

    if is_json {
        let yt_code_escaped = crate::util::json_escape(&yt.status_code);
        let dc_code_escaped = crate::util::json_escape(&dc.status_code);
        let json = format!(
            "{{\"youtube\":{{\"ok\":{},\"code\":\"{}\",\"ms\":{}}},\"discord\":{{\"ok\":{},\"code\":\"{}\",\"ms\":{}}},\"telegram\":{{\"ok\":{},\"stats\":{}}},\"dns\":{{\"ok\":{},\"adblock_ok\":{}}}}}\n",
            yt_ok, yt_code_escaped, yt.latency_ms,
            dc_ok, dc_code_escaped, dc.latency_ms,
            tg_ok, tg_stats,
            dns_ok, ad_ok
        );
        print!("{}", json);
        let _ = fs::write("/tmp/runet-fix-test.json", &json);
    } else {
        println!("=== [runet-fix Connectivity Diagnostics] ===");
        print!("Checking DNS resolution (google.com)... ");
        if dns_ok == 1 {
            println!("OK");
        } else {
            println!("FAIL");
        }

        print!("Checking Adblock NXDOMAIN (ad.ae.doubleclick.net)... ");
        if ad_ok == 1 {
            println!("OK (Blocked)");
        } else {
            println!("FAIL (Allowed)");
        }

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

        print!(
            "Testing Telegram local transparent proxy daemon ({})... ",
            tg_addr
        );
        if tg_ok == 1 {
            println!("OK (Listening)");
        } else {
            println!("FAIL (Stopped)");
        }
        println!("=============================================");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_corrupt_tg_stats_falls_back_to_empty_object() {
        let corrupt = "invalid \"json\nwith unclosed quote and newline";
        let stats = if crate::util::is_valid_json_object(corrupt) {
            corrupt.to_string()
        } else {
            "{}".to_string()
        };
        assert_eq!(stats, "{}");

        let json = format!(
            "{{\"youtube\":{{\"ok\":0,\"code\":\"000\",\"ms\":0}},\"discord\":{{\"ok\":0,\"code\":\"000\",\"ms\":0}},\"telegram\":{{\"ok\":0,\"stats\":{}}},\"dns\":{{\"ok\":0,\"adblock_ok\":0}}}}",
            stats
        );
        assert!(crate::util::is_valid_json_object(&json));
    }
}

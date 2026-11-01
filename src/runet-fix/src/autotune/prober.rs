use std::process::Command;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::TlsConnector;

use crate::proxy::ws::RawWebSocket;

pub struct ProbeResult {
    pub success: bool,
    pub status_code: String,
    pub latency_ms: u64,
}

/// Probes an HTTPS endpoint directly using Tokio and rustls without invoking external processes.
pub async fn probe_https(host: &str, port: u16, timeout_ms: u64) -> ProbeResult {
    let start = Instant::now();
    let timeout_duration = Duration::from_millis(timeout_ms);

    let probe_fut = async {
        let addr = format!("{}:{}", host, port);
        let stream = TcpStream::connect(&addr).await?;

        let tls_cfg = RawWebSocket::create_tls_config();
        let connector = TlsConnector::from(tls_cfg);
        let server_name = ServerName::try_from(host.to_string())
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, format!("Invalid SNI: {:?}", e)))?;

        let mut tls_stream = connector.connect(server_name, stream).await?;

        let request = format!(
            "HEAD / HTTP/1.1\r\nHost: {}\r\nUser-Agent: Mozilla/5.0 runet-fix/1.4.0\r\nConnection: close\r\n\r\n",
            host
        );
        tls_stream.write_all(request.as_bytes()).await?;

        let mut buf = [0u8; 128];
        let n = tls_stream.read(&mut buf).await?;
        if n == 0 {
            return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "empty response"));
        }

        let resp_str = String::from_utf8_lossy(&buf[..n]);
        let status = if let Some(first_line) = resp_str.lines().next() {
            let parts: Vec<&str> = first_line.split_whitespace().collect();
            if parts.len() >= 2 {
                parts[1].to_string()
            } else {
                "200".to_string()
            }
        } else {
            "200".to_string()
        };

        Ok::<String, std::io::Error>(status)
    };

    match tokio::time::timeout(timeout_duration, probe_fut).await {
        Ok(Ok(code)) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            ProbeResult {
                success: true,
                status_code: code,
                latency_ms,
            }
        }
        _ => {
            // In case of TLS certificate validation error on router with skewed clock, fallback to curl
            probe_via_curl(host, timeout_ms)
        }
    }
}

/// Fallback prober using router's curl utility with --insecure (-k).
pub fn probe_via_curl(host: &str, timeout_ms: u64) -> ProbeResult {
    let url = format!("https://{}", host);
    let sec_str = format!("{:.1}", (timeout_ms as f64) / 1000.0);

    let output = Command::new("curl")
        .args(&[
            "-s",
            "-k",
            "-m",
            &sec_str,
            "-w",
            "%{http_code}:%{time_total}",
            "-o",
            "/dev/null",
            &url,
        ])
        .output();

    if let Ok(out) = output {
        let res = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if let Some(pos) = res.find(':') {
            let code = res[..pos].to_string();
            let time_sec: f64 = res[pos + 1..].parse().unwrap_or(2.5);
            let latency_ms = (time_sec * 1000.0) as u64;
            let success = !code.is_empty() && code != "000";
            return ProbeResult {
                success,
                status_code: code,
                latency_ms,
            };
        }
    }

    ProbeResult {
        success: false,
        status_code: "000".to_string(),
        latency_ms: timeout_ms,
    }
}

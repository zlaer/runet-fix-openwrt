use std::sync::Arc;

#[cfg(unix)]
use std::fs;
#[cfg(unix)]
use std::path::Path;
#[cfg(unix)]
use std::sync::atomic::Ordering;
#[cfg(unix)]
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
#[cfg(unix)]
use tokio::net::UnixListener;
#[cfg(unix)]
use crate::proxy::pool::WsConnectionPool;
#[cfg(unix)]
use crate::proxy::{ACTIVE_SESSIONS, POOL_HITS, POOL_MISSES, TOTAL_SESSIONS};

pub const IPC_SOCKET_PATH: &str = "/var/run/runet-fix.sock";

#[cfg(unix)]
pub async fn run_ipc_server(_pool: Arc<WsConnectionPool>) {
    if Path::new(IPC_SOCKET_PATH).exists() {
        let _ = fs::remove_file(IPC_SOCKET_PATH);
    }

    let listener = match UnixListener::bind(IPC_SOCKET_PATH) {
        Ok(l) => l,
        Err(e) => {
            log::warn!("Failed to bind IPC socket {}: {}", IPC_SOCKET_PATH, e);
            return;
        }
    };

    log::info!("IPC Unix Domain Socket active at {}", IPC_SOCKET_PATH);

    let start_time = std::time::Instant::now();

    loop {
        let (stream, _) = match listener.accept().await {
            Ok(conn) => conn,
            Err(_) => {
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                continue;
            }
        };

        tokio::spawn(async move {
            let (read_half, mut write_half) = stream.into_split();
            let mut reader = BufReader::new(read_half);
            let mut line = String::new();

            if reader.read_line(&mut line).await.is_ok() {
                let cmd = line.trim();
                let resp = match cmd {
                    "status" | "{\"cmd\":\"status\"}" => {
                        let active = ACTIVE_SESSIONS.load(Ordering::Relaxed);
                        let total = TOTAL_SESSIONS.load(Ordering::Relaxed);
                        let hits = POOL_HITS.load(Ordering::Relaxed);
                        let misses = POOL_MISSES.load(Ordering::Relaxed);
                        let uptime = start_time.elapsed().as_secs();

                        let adb_rules = fs::read_to_string("/tmp/runet-fix-adblock.count")
                            .unwrap_or_else(|_| "0".to_string())
                            .trim()
                            .to_string();

                        let preset = crate::os::uci::get("runet-fix.zapret.preset")
                            .unwrap_or_else(|| "youtube_4k".to_string());

                        format!(
                            "{{\"status\":\"ok\",\"version\":\"1.4.0\",\"uptime_secs\":{},\"active_sessions\":{},\"total_sessions\":{},\"pool_hits\":{},\"pool_misses\":{},\"adblock_rules\":{},\"preset\":\"{}\"}}\n",
                            uptime, active, total, hits, misses, adb_rules, preset
                        )
                    }
                    _ => "{\"status\":\"error\",\"message\":\"unknown command\"}\n".to_string(),
                };

                let _ = write_half.write_all(resp.as_bytes()).await;
            }
        });
    }
}

#[cfg(not(unix))]
pub async fn run_ipc_server<T>(_pool: T) {}

/// Client query to the daemon socket (returns response in milliseconds if daemon is active).
pub fn query_daemon_socket(cmd: &str) -> Option<String> {
    #[cfg(unix)]
    {
        use std::io::{BufRead, Write};
        use std::os::unix::net::UnixStream as StdUnixStream;
        use std::time::Duration;

        let mut stream = StdUnixStream::connect(IPC_SOCKET_PATH).ok()?;
        stream.set_read_timeout(Some(Duration::from_millis(500))).ok()?;
        stream.set_write_timeout(Some(Duration::from_millis(500))).ok()?;

        stream.write_all(format!("{}\n", cmd).as_bytes()).ok()?;
        stream.flush().ok()?;

        let mut reader = std::io::BufReader::new(stream);
        let mut resp = String::new();
        reader.read_line(&mut resp).ok()?;
        if !resp.trim().is_empty() {
            return Some(resp.trim().to_string());
        }
    }
    let _ = cmd;
    None
}

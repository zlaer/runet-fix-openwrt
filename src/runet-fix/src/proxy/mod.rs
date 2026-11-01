pub mod bridge;
pub mod config;
pub mod handshake;
pub mod orig_dst;
pub mod pool;
pub mod ws;

use std::io;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::io::AsyncReadExt;
use tokio::net::TcpListener;

use self::bridge::bridge_stream;
pub use self::config::AppConfig;
use self::handshake::{
    build_crypto_context, generate_relay_init, parse_client_handshake,
    HANDSHAKE_LEN, PROTO_TAG_ABRIDGED, PROTO_TAG_INTERMEDIATE,
};
use self::orig_dst::{dc_from_ip, get_original_dst};
use self::pool::WsConnectionPool;
use self::ws::RawWebSocket;

pub static ACTIVE_SESSIONS: AtomicUsize = AtomicUsize::new(0);
pub static TOTAL_SESSIONS: AtomicU64 = AtomicU64::new(0);
pub static POOL_HITS: AtomicU64 = AtomicU64::new(0);
pub static POOL_MISSES: AtomicU64 = AtomicU64::new(0);

pub fn dump_stats_file() {
    let active = ACTIVE_SESSIONS.load(Ordering::Relaxed);
    let total = TOTAL_SESSIONS.load(Ordering::Relaxed);
    let hits = POOL_HITS.load(Ordering::Relaxed);
    let misses = POOL_MISSES.load(Ordering::Relaxed);

    let json = format!(
        "{{\"active_sessions\":{},\"total_sessions\":{},\"pool_hits\":{},\"pool_misses\":{}}}\n",
        active, total, hits, misses
    );
    let _ = std::fs::write("/tmp/tg-ws-proxy-stats.json", json);
}

pub struct SessionGuard;
impl Drop for SessionGuard {
    fn drop(&mut self) {
        ACTIVE_SESSIONS.fetch_sub(1, Ordering::Relaxed);
        dump_stats_file();
    }
}

pub fn run(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    let mut args_refs: Vec<&str> = vec!["tg-ws-proxy"];
    for a in args {
        args_refs.push(a.as_str());
    }

    let cfg: AppConfig = argh::FromArgs::from_args(&[], &args_refs)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, e.output))?;

    let workers = cfg.get_worker_list();
    log::info!(
        "Starting runet-fix proxy daemon on {}:{} (pool_size={}, domains={}, workers={})",
        cfg.listen,
        cfg.port,
        cfg.pool_size,
        cfg.get_domain_list().len(),
        workers.len()
    );

    dump_stats_file();

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    runtime.block_on(async_main(cfg))?;
    Ok(())
}

async fn async_main(cfg: AppConfig) -> io::Result<()> {
    let bind_addr = format!("{}:{}", cfg.listen, cfg.port);
    let listener = TcpListener::bind(&bind_addr).await?;
    log::info!("Transparent MTProto proxy listening on {}", bind_addr);

    let tls_config = RawWebSocket::create_tls_config();
    let pool = WsConnectionPool::new(
        cfg.pool_size,
        cfg.get_domain_list(),
        cfg.get_worker_list(),
        tls_config.clone(),
    );
    let secret_bytes = cfg.get_secret_bytes().map(Arc::new);

    // Spawn IPC Unix domain socket server
    tokio::spawn(crate::ipc::run_ipc_server(pool.clone()));

    loop {
        let (mut client_stream, peer_addr) = match listener.accept().await {
            Ok(conn) => conn,
            Err(e) => {
                log::warn!("Listener accept error: {}", e);
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                continue;
            }
        };

        let pool_ref = pool.clone();
        let secret_ref = secret_bytes.clone();

        tokio::spawn(async move {
            let label = peer_addr.to_string();

            // 1. Inspect SO_ORIGINAL_DST
            let orig_dst = get_original_dst(&client_stream).ok();
            if let Some(dst) = orig_dst {
                log::debug!("[{}] Redirected from original dst: {}", label, dst);
            }

            // 2. Read 64-byte Obfuscated2 client handshake
            let mut handshake_buf = [0u8; HANDSHAKE_LEN];
            if let Err(e) = client_stream.read_exact(&mut handshake_buf).await {
                log::debug!("[{}] Failed to read 64-byte handshake: {}", label, e);
                return;
            }

            // 3. Try transparent mode handshake first, then fallback to configured MTProxy secret
            let (parsed, secret_used) = match parse_client_handshake(&handshake_buf, None) {
                Some(p) => (p, None),
                None => match secret_ref.as_ref().and_then(|s| parse_client_handshake(&handshake_buf, Some(s))) {
                    Some(p) => (p, secret_ref.as_ref().map(|v| v.as_slice())),
                    None => {
                        log::warn!(
                            "[{}] Invalid MTProto handshake from client (protocol mismatch)",
                            label
                        );
                        return;
                    }
                },
            };

            let mut dc_id = orig_dst
                .map(|d| dc_from_ip(*d.ip()))
                .unwrap_or(parsed.dc_id);
            if dc_id == 0 {
                dc_id = 2;
            }

            log::info!(
                "[{}] Telegram session for DC{} (proto=0x{:08X}, media={}, transparent={})",
                label,
                dc_id,
                parsed.proto_tag,
                parsed.is_media,
                secret_used.is_none()
            );

            let upstream_proto = if parsed.proto_tag == PROTO_TAG_ABRIDGED {
                PROTO_TAG_INTERMEDIATE
            } else {
                parsed.proto_tag
            };

            // 4. Acquire WebSocket connection from pool or create fresh one
            let mut ws = match pool_ref.take(dc_id).await {
                Some(conn) => {
                    POOL_HITS.fetch_add(1, Ordering::Relaxed);
                    log::debug!("[{}] Reusing warm WS connection from pool for DC{}", label, dc_id);
                    conn
                }
                None => {
                    POOL_MISSES.fetch_add(1, Ordering::Relaxed);
                    log::debug!("[{}] Pool empty, opening fresh WS connection for DC{}", label, dc_id);
                    match pool_ref.create_connection(dc_id).await {
                        Ok(conn) => conn,
                        Err(e) => {
                            log::error!("[{}] Failed to connect upstream WS for DC{}: {}", label, dc_id, e);
                            return;
                        }
                    }
                }
            };

            // 5. Generate and send upstream 64-byte relay_init
            let (relay_init, tg_enc, tg_dec) = generate_relay_init(upstream_proto, dc_id as i16);
            if let Err(e) = ws.send_binary(&relay_init).await {
                log::warn!("[{}] Failed to send relay_init to upstream: {}", label, e);
                return;
            }

            // 6. Build complete cryptographic context
            let ctx = build_crypto_context(
                &parsed.client_dec_prekey_iv,
                secret_used,
                tg_enc,
                tg_dec,
            );

            // 7. Track session and start bi-directional streaming bridge
            ACTIVE_SESSIONS.fetch_add(1, Ordering::Relaxed);
            TOTAL_SESSIONS.fetch_add(1, Ordering::Relaxed);
            dump_stats_file();
            let _guard = SessionGuard;

            let (client_read, client_write) = client_stream.into_split();
            if let Err(e) = bridge_stream(
                client_read,
                client_write,
                ws,
                ctx,
                parsed.proto_tag,
                &label,
            )
            .await
            {
                log::debug!("[{}] Session ended: {}", label, e);
            }
        });
    }
}

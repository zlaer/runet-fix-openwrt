mod bridge;
mod config;
mod handshake;
mod orig_dst;
mod pool;
mod ws;

use std::io;
use std::sync::Arc;
use tokio::io::AsyncReadExt;
use tokio::net::TcpListener;

use crate::bridge::bridge_stream;
use crate::config::AppConfig;
use crate::handshake::{
    build_crypto_context, generate_relay_init, parse_client_handshake,
    HANDSHAKE_LEN, PROTO_TAG_ABRIDGED, PROTO_TAG_INTERMEDIATE,
};
use crate::orig_dst::{dc_from_ip, get_original_dst};
use crate::pool::WsConnectionPool;
use crate::ws::RawWebSocket;

fn init_logging(level: &str) {
    let mut builder = env_logger::Builder::new();
    let filter = match level.to_lowercase().as_str() {
        "debug" => log::LevelFilter::Debug,
        "warn" => log::LevelFilter::Warn,
        "error" => log::LevelFilter::Error,
        _ => log::LevelFilter::Info,
    };
    builder.filter_level(filter);
    builder.format_timestamp_secs();
    builder.init();
}

fn main() -> io::Result<()> {
    let cfg: AppConfig = argh::from_env();
    init_logging(&cfg.log_level);

    log::info!(
        "Starting tg-ws-proxy-rs v0.2.0 on {}:{} (pool_size={}, domains={})",
        cfg.listen,
        cfg.port,
        cfg.pool_size,
        cfg.get_domain_list().len()
    );

    // Build ultra-low-memory single-threaded or 2-thread async runtime
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;

    runtime.block_on(async_main(cfg))
}

async fn async_main(cfg: AppConfig) -> io::Result<()> {
    let bind_addr = format!("{}:{}", cfg.listen, cfg.port);
    let listener = TcpListener::bind(&bind_addr).await?;
    log::info!("Transparent MTProto proxy listening on {}", bind_addr);

    let tls_config = RawWebSocket::create_tls_config();
    let pool = WsConnectionPool::new(cfg.pool_size, cfg.get_domain_list(), tls_config.clone());
    let secret_bytes = cfg.get_secret_bytes().map(Arc::new);

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
        let tls_ref = tls_config.clone();

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

            // 3. Try transparent mode handshake first (direct client connection),
            // then fallback to configured MTProxy secret
            let handshake_res = parse_client_handshake(&handshake_buf, None).or_else(|| {
                secret_ref
                    .as_ref()
                    .and_then(|s| parse_client_handshake(&handshake_buf, Some(s)))
            });

            let parsed = match handshake_res {
                Some(p) => p,
                None => {
                    log::warn!(
                        "[{}] Invalid MTProto handshake from client (protocol mismatch)",
                        label
                    );
                    return;
                }
            };

            // Derive target DC ID from original IP if available, otherwise from decrypted header
            let dc_id = orig_dst
                .map(|d| dc_from_ip(*d.ip()))
                .unwrap_or(parsed.dc_id);

            log::info!(
                "[{}] Telegram session for DC{} (proto=0x{:08X}, media={})",
                label,
                dc_id,
                parsed.proto_tag,
                parsed.is_media
            );

            // Upstream WebSocket relay always expects INTERMEDIATE framing
            let upstream_proto = if parsed.proto_tag == PROTO_TAG_ABRIDGED {
                PROTO_TAG_INTERMEDIATE
            } else {
                parsed.proto_tag
            };

            // 4. Acquire WebSocket connection from warm pool or create fresh one
            let mut ws = match pool_ref.take(dc_id).await {
                Some(conn) => {
                    log::debug!("[{}] Reusing warm WS connection from pool for DC{}", label, dc_id);
                    conn
                }
                None => {
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
            let secret_slice = secret_ref.as_ref().map(|s| s.as_slice());
            let ctx = build_crypto_context(
                &parsed.client_dec_prekey_iv,
                secret_slice,
                tg_enc,
                tg_dec,
            );

            // 7. Split client TCP stream and start bi-directional bridge
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

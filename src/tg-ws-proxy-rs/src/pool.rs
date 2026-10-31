use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio_rustls::rustls::ClientConfig;

use crate::orig_dst::default_ip_for_dc;
use crate::ws::RawWebSocket;

pub struct WsConnectionPool {
    pool: Arc<Mutex<HashMap<u8, Vec<RawWebSocket>>>>,
    pool_size: usize,
    domains: Vec<String>,
    tls_config: Arc<ClientConfig>,
}

impl WsConnectionPool {
    pub fn new(pool_size: usize, domains: Vec<String>, tls_config: Arc<ClientConfig>) -> Arc<Self> {
        let pool = Arc::new(Self {
            pool: Arc::new(Mutex::new(HashMap::new())),
            pool_size,
            domains,
            tls_config,
        });

        if pool_size > 0 {
            let pool_clone = pool.clone();
            tokio::spawn(async move {
                pool_clone.maintenance_loop().await;
            });
        }

        pool
    }

    /// Retrieves an already-connected WebSocket from the warm pool for the specified DC.
    pub async fn take(&self, dc: u8) -> Option<RawWebSocket> {
        let mut lock = self.pool.lock().await;
        if let Some(list) = lock.get_mut(&dc) {
            list.pop()
        } else {
            None
        }
    }

    /// Background task that keeps connections alive with PING and refills depleted pools.
    async fn maintenance_loop(&self) {
        let mut ticker = tokio::time::interval(Duration::from_secs(25));
        loop {
            ticker.tick().await;

            // 1. Keep-alive ping for active connections in pool
            {
                let mut lock = self.pool.lock().await;
                for (_dc, list) in lock.iter_mut() {
                    let mut i = 0;
                    while i < list.len() {
                        if list[i].send_ping().await.is_err() {
                            list.swap_remove(i);
                        } else {
                            i += 1;
                        }
                    }
                }
            }

            // 2. Refill pools for DC 1..=5 up to pool_size
            for dc in 1..=5 {
                let current_count = {
                    let lock = self.pool.lock().await;
                    lock.get(&dc).map(|v| v.len()).unwrap_or(0)
                };

                if current_count < self.pool_size {
                    if let Ok(ws) = self.create_connection(dc).await {
                        let mut lock = self.pool.lock().await;
                        lock.entry(dc).or_default().push(ws);
                        log::debug!("Refilled warm WS connection for DC{}", dc);
                    }
                }
            }
        }
    }

    /// Opens a fresh WebSocket connection to Cloudflare or official Telegram endpoint.
    pub async fn create_connection(&self, dc: u8) -> std::io::Result<RawWebSocket> {
        let path = "/apiws";

        // Try configured custom/fallback domains first
        for domain in &self.domains {
            let host = format!("kws{}.{}", dc, domain);
            if let Ok(ws) = RawWebSocket::connect(
                &host,
                &host,
                443,
                path,
                Some(self.tls_config.clone()),
                Duration::from_secs(8),
            )
            .await
            {
                return Ok(ws);
            }
        }

        // Direct web.telegram.org fallback
        let tg_host = format!("kws{}.web.telegram.org", dc);
        RawWebSocket::connect(
            &tg_host,
            &tg_host,
            443,
            path,
            Some(self.tls_config.clone()),
            Duration::from_secs(8),
        )
        .await
    }
}

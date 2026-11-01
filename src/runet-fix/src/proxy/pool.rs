use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tokio_rustls::rustls::ClientConfig;

use super::orig_dst::default_ip_for_dc;
use super::ws::RawWebSocket;

pub struct WsConnectionPool {
    pool: Arc<Mutex<HashMap<u8, Vec<RawWebSocket>>>>,
    pool_size: usize,
    domains: Vec<String>,
    workers: Vec<String>,
    tls_config: Arc<ClientConfig>,
    last_accessed: Arc<Mutex<HashMap<u8, Instant>>>,
}

impl WsConnectionPool {
    pub fn new(
        pool_size: usize,
        domains: Vec<String>,
        workers: Vec<String>,
        tls_config: Arc<ClientConfig>,
    ) -> Arc<Self> {
        let pool = Arc::new(Self {
            pool: Arc::new(Mutex::new(HashMap::new())),
            pool_size,
            domains,
            workers,
            tls_config,
            last_accessed: Arc::new(Mutex::new(HashMap::new())),
        });

        if pool_size > 0 {
            let pool_clone = pool.clone();
            tokio::spawn(async move {
                pool_clone.maintenance_loop().await;
            });
        }

        pool
    }

    /// Records access to a DC and retrieves an already-connected WebSocket from the warm pool.
    pub async fn take(&self, dc: u8) -> Option<RawWebSocket> {
        {
            let mut access_lock = self.last_accessed.lock().await;
            access_lock.insert(dc, Instant::now());
        }

        let mut lock = self.pool.lock().await;
        if let Some(list) = lock.get_mut(&dc) {
            list.pop()
        } else {
            None
        }
    }

    /// Background task that keeps connections alive with PING and refills depleted pools on demand.
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

            // 2. Refill pools:
            // DC 2 and DC 4 are core (95% of traffic in CIS) -> always refill up to pool_size.
            // DC 1, DC 3, DC 5 are demand-driven -> only refill if active in the last 15 minutes.
            let now = Instant::now();
            let accessed_map = {
                let lock = self.last_accessed.lock().await;
                lock.clone()
            };

            for dc in 1..=5 {
                let should_refill = if dc == 2 || dc == 4 {
                    true
                } else if let Some(&last_time) = accessed_map.get(&dc) {
                    now.duration_since(last_time) < Duration::from_secs(900)
                } else {
                    false
                };

                if !should_refill {
                    continue;
                }

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

    /// Opens a fresh WebSocket connection to Cloudflare Worker, Cloudflare relay, or official Telegram endpoint.
    pub async fn create_connection(&self, dc: u8) -> std::io::Result<RawWebSocket> {
        let fallback_ip = default_ip_for_dc(dc);

        // 1. Try configured personal Cloudflare Workers first (if provided)
        for worker in &self.workers {
            let path = format!("/apiws?dst={}&dc={}", fallback_ip, dc);
            if let Ok(ws) = RawWebSocket::connect(
                worker,
                worker,
                443,
                &path,
                Some(self.tls_config.clone()),
                Duration::from_secs(8),
            )
            .await
            {
                log::debug!("Connected upstream via Cloudflare Worker {} for DC{}", worker, dc);
                return Ok(ws);
            }
        }

        // 2. Try configured/built-in Cloudflare relay domains (kws{dc}.{domain}/apiws)
        let path = "/apiws";
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

        // 3. Direct web.telegram.org fallback
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

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tokio::task::JoinSet;
use tokio_rustls::rustls::ClientConfig;

use super::orig_dst::default_ip_for_dc;
use super::ws::RawWebSocket;

/// Maximum number of upstream connections opened (or pinged) concurrently per tick.
const REFILL_CONCURRENCY: usize = 4;

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
    async fn maintenance_loop(self: Arc<Self>) {
        let mut ticker = tokio::time::interval(Duration::from_secs(25));
        loop {
            ticker.tick().await;

            // 1. Ping one idle socket per DC and leave the rest in the pool.
            //    The mutex is released before the PING, so a new client can still
            //    take a warm connection during the check.
            let candidates = {
                let mut lock = self.pool.lock().await;
                take_one_per_dc(&mut lock)
            };
            let healthy = Self::ping_batch(candidates).await;
            {
                let mut lock = self.pool.lock().await;
                for (dc, ws) in healthy {
                    lock.entry(dc).or_default().push(ws);
                }
            }

            // 2. Refill pools in a single batch (not one connection per tick):
            // DC 2 and DC 4 are core (95% of traffic in CIS) -> always refill up to pool_size.
            // DC 1, DC 3, DC 5 are demand-driven -> only refill if active in the last 15 minutes.
            let now = Instant::now();
            let accessed_map = {
                let lock = self.last_accessed.lock().await;
                lock.clone()
            };

            let deficits = {
                let lock = self.pool.lock().await;
                let mut deficits = Vec::new();
                for dc in 1..=5u8 {
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

                    let current_count = lock.get(&dc).map_or(0, |v| v.len());
                    if current_count < self.pool_size {
                        deficits.push((dc, self.pool_size - current_count));
                    }
                }
                deficits
            };

            if deficits.is_empty() {
                continue;
            }

            let mut pending = Vec::new();
            for (dc, count) in deficits {
                for _ in 0..count {
                    pending.push(dc);
                }
            }

            let mut tasks = JoinSet::new();
            let mut refilled = Vec::new();
            loop {
                while tasks.len() < REFILL_CONCURRENCY {
                    match pending.pop() {
                        Some(dc) => {
                            let pool = Arc::clone(&self);
                            tasks.spawn(async move { (dc, pool.create_connection(dc).await) });
                        }
                        None => break,
                    }
                }

                match tasks.join_next().await {
                    Some(Ok((dc, Ok(ws)))) => {
                        log::debug!("Refilled warm WS connection for DC{}", dc);
                        refilled.push((dc, ws));
                    }
                    Some(Ok((dc, Err(e)))) => {
                        log::debug!("Failed to refill warm WS connection for DC{}: {}", dc, e);
                    }
                    Some(Err(e)) => log::warn!("Warm pool refill task failed: {}", e),
                    None => break,
                }
            }

            if !refilled.is_empty() {
                let mut lock = self.pool.lock().await;
                for (dc, ws) in refilled {
                    lock.entry(dc).or_default().push(ws);
                }
            }
        }
    }

    /// Pings a batch of connections outside of the pool lock, with bounded concurrency.
    async fn ping_batch(candidates: Vec<(u8, RawWebSocket)>) -> Vec<(u8, RawWebSocket)> {
        let mut pending = candidates;
        let mut tasks = JoinSet::new();
        let mut healthy = Vec::new();
        loop {
            while tasks.len() < REFILL_CONCURRENCY {
                match pending.pop() {
                    Some((dc, mut ws)) => {
                        tasks.spawn(async move {
                            let ok = ws.send_ping().await.is_ok();
                            (dc, ws, ok)
                        });
                    }
                    None => break,
                }
            }

            match tasks.join_next().await {
                Some(Ok((dc, ws, true))) => healthy.push((dc, ws)),
                Some(Ok((_, _, false))) => {}
                Some(Err(e)) => log::warn!("Warm pool ping task failed: {}", e),
                None => break,
            }
        }
        healthy
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
                log::debug!(
                    "Connected upstream via Cloudflare Worker {} for DC{}",
                    worker,
                    dc
                );
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

/// Pops one idle connection per DC.
///
/// The caller owns the returned connections and can release the lock before
/// performing network I/O (PING). Every other socket stays in the pool.
fn take_one_per_dc<T>(pool: &mut HashMap<u8, Vec<T>>) -> Vec<(u8, T)> {
    let mut taken = Vec::new();
    for (dc, list) in pool.iter_mut() {
        if let Some(conn) = list.pop() {
            taken.push((*dc, conn));
        }
    }
    taken
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_take_one_per_dc_leaves_the_rest() {
        let mut pool: HashMap<u8, Vec<u32>> = HashMap::new();
        pool.insert(2, vec![10, 11]);
        pool.insert(4, vec![20]);

        let mut taken = take_one_per_dc(&mut pool);
        taken.sort_by_key(|(dc, id)| (*dc, *id));

        assert_eq!(taken, vec![(2, 11), (4, 20)]);
        assert_eq!(pool.get(&2).map(|v| v.as_slice()), Some(&[10][..]));
        assert!(pool.get(&4).unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_candidates_are_selected_without_holding_lock() {
        let pool = Arc::new(Mutex::new(HashMap::from([(2u8, vec![10u32, 11])])));

        let candidates = {
            let mut guard = pool.lock().await;
            take_one_per_dc(&mut guard)
        };

        // The guard is released before a "ping" would start, so the pool stays usable.
        let acquired = tokio::time::timeout(Duration::from_millis(100), pool.lock()).await;
        assert!(acquired.is_ok());
        drop(acquired);
        assert_eq!(candidates, vec![(2, 11)]);
        let guard = pool.lock().await;
        assert_eq!(guard.get(&2).map(|v| v.as_slice()), Some(&[10][..]));
    }
}

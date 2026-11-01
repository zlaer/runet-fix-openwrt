use argh::FromArgs;

#[derive(FromArgs, Clone, Debug)]
/// High-performance Telegram Transparent Proxy & WebSocket Bridge
pub struct AppConfig {
    /// port to listen on (default: 1443)
    #[argh(option, short = 'p', default = "1443")]
    pub port: u16,

    /// bind address (default: 0.0.0.0)
    #[argh(option, short = 'l', default = "\"0.0.0.0\".to_string()")]
    pub listen: String,

    /// hex secret for MTProto Proxy mode (optional)
    #[argh(option, short = 's')]
    pub secret: Option<String>,

    /// size of pre-warmed connection pool per DC (default: 2)
    #[argh(option, default = "2")]
    pub pool_size: usize,

    /// comma-separated list of Cloudflare fallback / worker domains
    #[argh(option)]
    pub domains: Option<String>,

    /// comma-separated list of custom Cloudflare Worker domains (e.g. my-tg.workers.dev)
    #[argh(option, short = 'w')]
    pub workers: Option<String>,

    /// fake TLS SNI masking domain (optional)
    #[argh(option)]
    pub fake_tls_domain: Option<String>,

    /// log level: info, debug, warn, error (default: info)
    #[argh(option, default = "\"info\".to_string()")]
    pub log_level: String,
}

impl AppConfig {
    pub fn get_secret_bytes(&self) -> Option<Vec<u8>> {
        self.secret.as_ref().and_then(|s| {
            let clean = s.trim().trim_start_matches("dd").trim_start_matches("ee");
            hex_decode(clean)
        })
    }

    pub fn get_domain_list(&self) -> Vec<String> {
        let mut list = Vec::new();
        if let Some(ref d) = self.domains {
            for item in d.split(&[',', ';', ' '][..]) {
                let trimmed = item.trim();
                if !trimmed.is_empty() {
                    list.push(trimmed.to_string());
                }
            }
        }

        // Built-in resilient Cloudflare endpoints if no custom domains provided
        if list.is_empty() {
            list.push("cakeisalie.co.uk".to_string());
            list.push("kartoshka.co.uk".to_string());
            list.push("noskomnadzor.co.uk".to_string());
            list.push("onedaychamp.co.uk".to_string());
            list.push("fixtelega.co.uk".to_string());
            list.push("stopblocking.co.uk".to_string());
        }

        list
    }

    pub fn get_worker_list(&self) -> Vec<String> {
        let mut list = Vec::new();
        if let Some(ref w) = self.workers {
            for item in w.split(&[',', ';', ' '][..]) {
                let trimmed = item.trim();
                if !trimmed.is_empty() {
                    list.push(trimmed.to_string());
                }
            }
        }
        list
    }
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

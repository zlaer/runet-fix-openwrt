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
    #[allow(dead_code)]
    pub fake_tls_domain: Option<String>,

    /// log level: info, debug, warn, error (default: info)
    #[argh(option, default = "\"info\".to_string()")]
    pub log_level: String,
}

impl AppConfig {
    pub fn get_secret_bytes(&self) -> Option<Vec<u8>> {
        self.secret.as_deref().and_then(parse_secret)
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
    if !s.len().is_multiple_of(2) {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

/// Parses an MTProto proxy secret.
///
/// A `dd`/`ee` prefix is only a marker when it is followed by exactly one
/// 16-byte key (34 hex chars total). Otherwise the whole string is treated as a
/// raw secret, so keys that merely start with those bytes stay intact.
fn parse_secret(s: &str) -> Option<Vec<u8>> {
    let s = s.trim();
    let marker = s
        .get(..2)
        .filter(|prefix| prefix.eq_ignore_ascii_case("dd") || prefix.eq_ignore_ascii_case("ee"));
    let body = if s.len() == 34 && marker.is_some() {
        &s[2..]
    } else {
        s
    };

    let bytes = hex_decode(body)?;
    (bytes.len() == 16).then_some(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_decode() {
        assert_eq!(hex_decode("01020a"), Some(vec![0x01, 0x02, 0x0a]));
        assert_eq!(hex_decode("invalid"), None);
        assert_eq!(hex_decode("123"), None);
    }

    #[test]
    fn test_secret_parsing() {
        let mut cfg = AppConfig {
            port: 1443,
            listen: "0.0.0.0".to_string(),
            secret: Some("75febd06a20f38f1d1151919a0540b13".to_string()),
            pool_size: 2,
            domains: None,
            workers: None,
            fake_tls_domain: None,
            log_level: "info".to_string(),
        };
        assert_eq!(cfg.get_secret_bytes().unwrap().len(), 16);

        // Prepend dd (Fake-TLS prefix)
        cfg.secret = Some("dd75febd06a20f38f1d1151919a0540b13".to_string());
        assert_eq!(cfg.get_secret_bytes().unwrap().len(), 16);
    }

    #[test]
    fn test_secret_prefix_markers() {
        // dd / ee are markers only in a 34-char string (2 prefix + 32 hex chars).
        let key = hex_decode("75febd06a20f38f1d1151919a0540b13").unwrap();
        assert_eq!(
            parse_secret("dd75febd06a20f38f1d1151919a0540b13"),
            Some(key.clone())
        );
        assert_eq!(
            parse_secret("ee75febd06a20f38f1d1151919a0540b13"),
            Some(key)
        );
    }

    #[test]
    fn test_secret_starting_with_prefix_is_raw() {
        // A raw 16-byte key may legitimately start with 0xdd or 0xee.
        let raw_dd = parse_secret("dd5ebd06a20f38f1d1151919a0540b13").unwrap();
        assert_eq!(raw_dd.len(), 16);
        assert_eq!(raw_dd[0], 0xdd);

        let raw_ee = parse_secret("ee5ebd06a20f38f1d1151919a0540b13").unwrap();
        assert_eq!(raw_ee.len(), 16);
        assert_eq!(raw_ee[0], 0xee);
    }

    #[test]
    fn test_secret_invalid_input() {
        assert_eq!(parse_secret(""), None);
        assert_eq!(parse_secret("dd"), None);
        assert_eq!(parse_secret("not-a-hex-secret"), None);
        // Marker-like length, but the remainder is not valid hex.
        assert_eq!(parse_secret(&format!("dd{}", "z".repeat(32))), None);
    }

    #[test]
    fn test_domain_list_parsing() {
        let cfg = AppConfig {
            port: 1443,
            listen: "0.0.0.0".to_string(),
            secret: None,
            pool_size: 2,
            domains: Some("a.com, b.com; c.com".to_string()),
            workers: Some("w1.workers.dev, w2.workers.dev".to_string()),
            fake_tls_domain: None,
            log_level: "info".to_string(),
        };

        assert_eq!(cfg.get_domain_list(), vec!["a.com", "b.com", "c.com"]);
        assert_eq!(
            cfg.get_worker_list(),
            vec!["w1.workers.dev", "w2.workers.dev"]
        );
    }
}

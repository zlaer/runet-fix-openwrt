/// Extracts a clean domain name from a raw line in /etc/hosts, ABP, or plain list formats.
pub fn extract_domain(line: &str) -> Option<String> {
    let mut s = line.trim();

    // Strip comments (#, !, ;, [)
    if let Some(pos) = s.find(|c| c == '#' || c == '!' || c == ';') {
        s = s[..pos].trim();
    }
    if s.is_empty() || s.starts_with('[') {
        return None;
    }

    // Strip Adblock Plus prefix: ||domain^
    if let Some(stripped) = s.strip_prefix("||") {
        s = stripped;
    }

    // Strip ABP modifiers and suffixes (^, ^$third-party, etc.)
    if let Some(pos) = s.find('^') {
        s = &s[..pos];
    } else if let Some(pos) = s.find('$') {
        s = &s[..pos];
    }

    // Strip standard hosts IP prefixes: 0.0.0.0 or 127.0.0.1
    if let Some(stripped) = s.strip_prefix("0.0.0.0") {
        s = stripped.trim_start();
    } else if let Some(stripped) = s.strip_prefix("127.0.0.1") {
        s = stripped.trim_start();
    }

    // Strip wildcard prefix: *.domain
    if let Some(stripped) = s.strip_prefix("*.") {
        s = stripped;
    }

    let s = s.trim();
    if s.is_empty() {
        return None;
    }

    // Validate domain syntax
    if !is_valid_domain(s) {
        return None;
    }

    Some(s.to_ascii_lowercase())
}

/// Validates whether a string constitutes a valid DNS domain name.
pub fn is_valid_domain(s: &str) -> bool {
    if s.len() < 3 || s.len() > 253 {
        return false;
    }
    if !s.contains('.') {
        return false;
    }
    // Must not start or end with dot or hyphen
    if s.starts_with('.') || s.ends_with('.') || s.starts_with('-') || s.ends_with('-') {
        return false;
    }
    // Check characters (ascii alphanumeric, dot, hyphen, underscore)
    for b in s.bytes() {
        if !(b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b'_') {
            return false;
        }
    }
    // Check Top-Level Domain (TLD)
    if let Some(last_dot) = s.rfind('.') {
        let tld = &s[last_dot + 1..];
        if tld.len() < 2 || !tld.chars().all(|c| c.is_ascii_alphabetic()) {
            return false;
        }
    }
    // Filter out standard loopback/broadcast names
    if s == "localhost" || s == "broadcasthost" || s.ends_with(".local") {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_domain() {
        assert_eq!(extract_domain("0.0.0.0 doubleclick.net"), Some("doubleclick.net".to_string()));
        assert_eq!(extract_domain("127.0.0.1 adservice.google.com # comment"), Some("adservice.google.com".to_string()));
        assert_eq!(extract_domain("||an.yandex.ru^$third-party"), Some("an.yandex.ru".to_string()));
        assert_eq!(extract_domain("! This is a comment"), None);
        assert_eq!(extract_domain("# Another comment"), None);
        assert_eq!(extract_domain("0.0.0.0 0.0.0.0"), None);
    }
}

use std::collections::HashSet;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

pub struct WhitelistMatcher {
    domains: HashSet<String>,
}

impl WhitelistMatcher {
    pub fn new() -> Self {
        Self {
            domains: HashSet::new(),
        }
    }

    /// Adds a domain to the whitelist, stripping comments.
    pub fn add_domain(&mut self, domain: &str) {
        let trimmed = domain.trim();
        if let Some(pos) = trimmed.find(['#', '!', ';']) {
            let d = trimmed[..pos].trim();
            if !d.is_empty() {
                self.domains.insert(d.to_ascii_lowercase());
            }
        } else if !trimmed.is_empty() {
            self.domains.insert(trimmed.to_ascii_lowercase());
        }
    }

    /// Loads whitelist domains from a file.
    pub fn load_from_file<P: AsRef<Path>>(&mut self, path: P) {
        if let Ok(file) = File::open(path) {
            let reader = BufReader::new(file);
            for line in reader.lines().map_while(Result::ok) {
                self.add_domain(&line);
            }
        }
    }

    /// Checks if a domain or any of its parent domains are whitelisted.
    /// E.g. if "yandex.ru" is whitelisted, "mc.yandex.ru" is also whitelisted.
    pub fn is_whitelisted(&self, domain: &str) -> bool {
        if self.domains.is_empty() {
            return false;
        }

        if self.domains.contains(domain) {
            return true;
        }

        // Subdomain checking without allocations
        let mut current = domain;
        while let Some(idx) = current.find('.') {
            current = &current[idx + 1..];
            if self.domains.contains(current) {
                return true;
            }
        }

        false
    }

    pub fn count(&self) -> usize {
        self.domains.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_whitelist_subdomain_matching() {
        let mut wl = WhitelistMatcher::new();
        wl.domains.insert("gosuslugi.ru".to_string());
        wl.domains.insert("sberbank.ru".to_string());

        assert!(wl.is_whitelisted("gosuslugi.ru"));
        assert!(wl.is_whitelisted("esia.gosuslugi.ru"));
        assert!(wl.is_whitelisted("sub.esia.gosuslugi.ru"));
        assert!(wl.is_whitelisted("online.sberbank.ru"));

        assert!(!wl.is_whitelisted("fakegosuslugi.ru"));
        assert!(!wl.is_whitelisted("gosuslugi.ru.evil.com"));
        assert!(!wl.is_whitelisted("google.com"));
    }

    #[test]
    fn test_empty_whitelist() {
        let wl = WhitelistMatcher::new();
        assert!(!wl.is_whitelisted("anything.com"));
        assert_eq!(wl.count(), 0);
    }
}

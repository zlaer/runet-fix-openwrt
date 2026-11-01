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

    /// Loads whitelist domains from a file.
    pub fn load_from_file<P: AsRef<Path>>(&mut self, path: P) {
        if let Ok(file) = File::open(path) {
            let reader = BufReader::new(file);
            for line in reader.lines().flatten() {
                let trimmed = line.trim();
                if let Some(pos) = trimmed.find(|c| c == '#' || c == '!' || c == ';') {
                    let d = trimmed[..pos].trim();
                    if !d.is_empty() {
                        self.domains.insert(d.to_ascii_lowercase());
                    }
                } else if !trimmed.is_empty() {
                    self.domains.insert(trimmed.to_ascii_lowercase());
                }
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

use std::process::Command;

/// Reads an option from UCI configuration (e.g. "runet-fix.zapret.preset").
pub fn get(key: &str) -> Option<String> {
    let output = Command::new("uci")
        .args(&["-q", "get", key])
        .output()
        .ok()?;

    if output.status.success() {
        let val = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !val.is_empty() {
            return Some(val);
        }
    }
    None
}

/// Sets an option in UCI configuration.
pub fn set(key: &str, val: &str) -> bool {
    let arg = format!("{}={}", key, val);
    let status = Command::new("uci")
        .args(&["set", &arg])
        .status();

    match status {
        Ok(s) => s.success(),
        Err(_) => false,
    }
}

/// Commits UCI changes for a package (e.g. "runet-fix").
pub fn commit(pkg: &str) -> bool {
    let status = Command::new("uci")
        .args(&["commit", pkg])
        .status();

    match status {
        Ok(s) => s.success(),
        Err(_) => false,
    }
}

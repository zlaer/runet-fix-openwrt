use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};

/// Fetches lines from an HTTPS/HTTP URL using available system utilities (curl, uclient-fetch, wget).
pub fn fetch_url_lines<F>(url: &str, mut line_callback: F)
where
    F: FnMut(&str),
{
    // Try curl first (fastest, supports gzip decompression --compressed)
    if let Ok(mut child) = Command::new("curl")
        .args(&[
            "-s",
            "-k",
            "-L",
            "--compressed",
            "--connect-timeout",
            "8",
            "--max-time",
            "30",
            url,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                line_callback(&line);
            }
            let _ = child.wait();
            return;
        }
    }

    // Fallback to uclient-fetch (built-in OpenWrt client)
    if let Ok(mut child) = Command::new("uclient-fetch")
        .args(&["-q", "--no-check-certificate", "-O", "-", url])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                line_callback(&line);
            }
            let _ = child.wait();
            return;
        }
    }

    // Fallback to wget
    if let Ok(mut child) = Command::new("wget")
        .args(&["-q", "--no-check-certificate", "-O", "-", url])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                line_callback(&line);
            }
            let _ = child.wait();
        }
    }
}

/// Reads lines from a local file.
pub fn read_local_file_lines<P: AsRef<Path>, F>(path: P, mut line_callback: F)
where
    F: FnMut(&str),
{
    if let Ok(file) = File::open(path) {
        let reader = BufReader::new(file);
        for line in reader.lines().flatten() {
            line_callback(&line);
        }
    }
}

use std::fs;

/// Returns available RAM in kilobytes.
///
/// On Linux, attempts to read `MemAvailable` from `/proc/meminfo`.
/// If `MemAvailable` is absent (older kernels), computes `MemFree + Buffers + Cached`.
pub fn get_available_ram_kb() -> usize {
    if let Ok(content) = fs::read_to_string("/proc/meminfo") {
        let mut mem_free = 0;
        let mut buffers = 0;
        let mut cached = 0;

        for line in content.lines() {
            let mut parts = line.split_whitespace();
            if let Some(key) = parts.next() {
                if key == "MemAvailable:" {
                    if let Some(val_str) = parts.next() {
                        if let Ok(val) = val_str.parse::<usize>() {
                            return val;
                        }
                    }
                } else if key == "MemFree:" {
                    if let Some(val_str) = parts.next() {
                        mem_free = val_str.parse::<usize>().unwrap_or(0);
                    }
                } else if key == "Buffers:" {
                    if let Some(val_str) = parts.next() {
                        buffers = val_str.parse::<usize>().unwrap_or(0);
                    }
                } else if key == "Cached:" {
                    if let Some(val_str) = parts.next() {
                        cached = val_str.parse::<usize>().unwrap_or(0);
                    }
                }
            }
        }

        let total_avail = mem_free + buffers + cached;
        if total_avail > 0 {
            return total_avail;
        }
    }

    // Default fallback if /proc/meminfo is inaccessible (e.g. non-Linux / test environment)
    131072 // 128 MB in kB
}

/// Minimal JSON string escaping without adding any new external dependencies.
pub fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\x08' => out.push_str("\\b"),
            '\x0c' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                use std::fmt::Write;
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out
}

/// Simple validation for raw JSON objects before embedding them into a parent JSON document.
/// Returns true only if the string is non-empty, enclosed in matching braces, and contains
/// well-formed string quotes and brace nesting.
pub fn is_valid_json_object(s: &str) -> bool {
    let s = s.trim();
    if !s.starts_with('{') || !s.ends_with('}') {
        return false;
    }
    let mut in_str = false;
    let mut escaped = false;
    let mut depth: i32 = 0;
    for c in s.chars() {
        if in_str {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_str = false;
            } else if (c as u32) < 0x20 {
                // Raw control characters (newlines etc.) are illegal in JSON strings
                return false;
            }
        } else {
            match c {
                '"' => in_str = true,
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth < 0 {
                        return false;
                    }
                }
                c if (c as u32) < 0x20 && c != '\t' && c != '\r' && c != '\n' => {
                    return false;
                }
                _ => {}
            }
        }
    }
    !in_str && depth == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_escape() {
        assert_eq!(json_escape("hello"), "hello");
        assert_eq!(json_escape("hello \"world\""), "hello \\\"world\\\"");
        assert_eq!(json_escape("a\\b\nc\rd\te"), "a\\\\b\\nc\\rd\\te");
    }

    #[test]
    fn test_is_valid_json_object() {
        assert!(is_valid_json_object("{}"));
        assert!(is_valid_json_object("{\"a\": 1, \"b\": \"test\"}"));
        assert!(!is_valid_json_object(""));
        assert!(!is_valid_json_object("{invalid"));
        assert!(!is_valid_json_object("{\"unclosed\": 1"));
        assert!(!is_valid_json_object("{\"bad_newline\": \"line1\nline2\"}"));
    }
}

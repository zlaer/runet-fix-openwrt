#!/bin/sh
set -e

PASSED=0
FAILED=0
SKIPPED=0

step() {
    NAME="$1"
    CMD="$2"
    printf "==> [CHECK] %-45s ... " "$NAME"
    if eval "$CMD" >/dev/null 2>&1; then
        echo "OK"
        PASSED=$((PASSED + 1))
    else
        echo "FAIL"
        echo "Command failed: $CMD"
        eval "$CMD" || true
        FAILED=$((FAILED + 1))
        exit 1
    fi
}

step_optional() {
    NAME="$1"
    TOOL="$2"
    CMD="$3"
    printf "==> [CHECK] %-45s ... " "$NAME"
    if command -v "$TOOL" >/dev/null 2>&1; then
        if eval "$CMD" >/dev/null 2>&1; then
            echo "OK"
            PASSED=$((PASSED + 1))
        else
            echo "FAIL"
            echo "Command failed: $CMD"
            eval "$CMD" || true
            FAILED=$((FAILED + 1))
            exit 1
        fi
    else
        echo "SKIP (tool '$TOOL' not found)"
        SKIPPED=$((SKIPPED + 1))
    fi
}

echo "=== Running Runet-Fix Unified Verification Suite ==="

# 1. Version consistency
step "Version consistency (check-version.sh)" "sh scripts/check-version.sh"

# 2. Documentation parity
step "Documentation parity (check-docs.sh)" "sh scripts/check-docs.sh"

# 3. Shell syntax & CLI smoke tests
step "Shell syntax & CLI tests (test-cli.sh)" "sh scripts/test-cli.sh"

# 4. LuCI no legacy I18N/lang in files/www
step "LuCI views: no legacy I18N tables" "! grep -rn 'I18N\\|runet_fix_lang' files/www/"

# 5. Node.js syntax check on all JS views
step_optional "LuCI views: node --check" "node" 'for f in files/www/luci-static/resources/view/runet-fix/*.js; do node --check "$f"; done'

# 6. Python bytecode compilation
PYTHON_CMD="python"
if ! command -v python >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
fi
step_optional "Python fallback: compileall" "$PYTHON_CMD" "$PYTHON_CMD -m compileall files/usr/share/runet-fix/tg_ws_proxy"

# 7. Python unit tests
step_optional "Python fallback: unittests" "$PYTHON_CMD" "$PYTHON_CMD -m unittest discover -s files/usr/share/runet-fix/tg_ws_proxy -t files/usr/share/runet-fix -p 'test_*.py'"

# 8. Rust code formatting check
step_optional "Rust: cargo fmt --check" "cargo" "cargo fmt --manifest-path src/runet-fix/Cargo.toml -- --check"

# 9. Rust clippy linting
step_optional "Rust: cargo clippy (-D warnings)" "cargo" "cargo clippy --manifest-path src/runet-fix/Cargo.toml --all-targets -- -D warnings"

# 10. Rust unit tests
step_optional "Rust: cargo test" "cargo" "cargo test --manifest-path src/runet-fix/Cargo.toml"

# 11. Shellcheck (optional)
step_optional "Shellcheck: POSIX scripts" "shellcheck" "shellcheck -S warning -e SC2034,SC2155,SC2046,SC2086,SC3043,SC2039 files/usr/share/runet-fix/scripts/*.sh files/etc/init.d/runet-fix files/usr/bin/runet-fix install.sh"

# 12. Gettext PO syntax check
step_optional "Gettext: msgfmt --check po/ru/runet-fix.po" "msgfmt" "msgfmt --check -o /dev/null po/ru/runet-fix.po"

echo "===================================================="
echo "Verification finished: $PASSED passed, $FAILED failed, $SKIPPED skipped."
echo "===================================================="

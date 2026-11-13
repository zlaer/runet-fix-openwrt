#!/bin/sh
set -e

echo "[test-cli] Checking syntax with sh -n..."
for f in files/usr/share/runet-fix/scripts/*.sh \
         files/etc/init.d/runet-fix \
         files/etc/uci-defaults/99-runet-fix \
         files/usr/bin/runet-fix \
         install.sh \
         scripts/*.sh; do
    [ -f "$f" ] || continue
    sh -n "$f"
done
echo "[test-cli] All shell scripts passed sh -n"

echo "[test-cli] Testing CLI argument parsing..."

# Test help command
out=$(sh files/usr/bin/runet-fix help)
case "$out" in
    *"Usage: runet-fix"*) ;;
    *) echo "FAIL: runet-fix help did not output usage"; exit 1 ;;
esac

out=$(sh files/usr/bin/runet-fix --help)
case "$out" in
    *"Usage: runet-fix"*) ;;
    *) echo "FAIL: runet-fix --help did not output usage"; exit 1 ;;
esac

# Test unknown argument returns non-zero
if sh files/usr/bin/runet-fix --invalid-argument >/dev/null 2>&1; then
    echo "FAIL: runet-fix --invalid-argument unexpectedly exited 0"; exit 1
fi

# Test version returns string or unknown
ver=$(sh files/usr/bin/runet-fix version)
if [ -z "$ver" ]; then
    echo "FAIL: runet-fix version output empty"; exit 1
fi

# Test version --json
ver_json=$(sh files/usr/bin/runet-fix version --json)
case "$ver_json" in
    *'{"version":'*'}') ;;
    *) echo "FAIL: runet-fix version --json malformed: $ver_json"; exit 1 ;;
esac

echo "[test-cli] CLI smoke and argument parsing passed successfully!"

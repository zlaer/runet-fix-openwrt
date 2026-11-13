#!/bin/sh
# update-adblock.sh - Adblock updater wrapper for OpenWrt dnsmasq
# Part of the runet-fix all-in-one suite.

AUTO_UPDATE=$(uci -q get runet-fix.adblock.auto_update || echo "weekly")
CRON_FILE="/etc/crontabs/root"
mkdir -p /etc/crontabs
touch "$CRON_FILE"
sed -i '/runet-fix-adblock/d' "$CRON_FILE"

case "$AUTO_UPDATE" in
    daily)
        echo "0 4 * * * /usr/share/runet-fix/scripts/update-adblock.sh >/dev/null 2>&1 # runet-fix-adblock" >> "$CRON_FILE"
        /etc/init.d/cron enable >/dev/null 2>&1 || true
        /etc/init.d/cron restart >/dev/null 2>&1 || true
        ;;
    weekly)
        echo "0 4 * * 0 /usr/share/runet-fix/scripts/update-adblock.sh >/dev/null 2>&1 # runet-fix-adblock" >> "$CRON_FILE"
        /etc/init.d/cron enable >/dev/null 2>&1 || true
        /etc/init.d/cron restart >/dev/null 2>&1 || true
        ;;
    disabled|none|*)
        /etc/init.d/cron restart >/dev/null 2>&1 || true
        ;;
esac

if [ -x /usr/bin/runet-fix-core ]; then
    /usr/bin/runet-fix-core adblock "$@"
    RET=$?
    [ $RET -eq 0 ] && /etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
    exit $RET
fi

if command -v runet-fix-core >/dev/null 2>&1; then
    runet-fix-core adblock "$@"
    RET=$?
    [ $RET -eq 0 ] && /etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
    exit $RET
fi

if [ -x /usr/bin/runet-fix ]; then
    /usr/bin/runet-fix adblock "$@"
    RET=$?
    [ $RET -eq 0 ] && /etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
    exit $RET
fi

echo "[runet-fix:adblock] Error: runet-fix-core binary not found. Adblock list compilation requires the Rust core engine." >&2
logger -t runet-fix "Adblock update failed: runet-fix-core binary not found" 2>/dev/null || true
exit 1

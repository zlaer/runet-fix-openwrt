#!/bin/sh
# /usr/share/runet-fix/scripts/uninstall.sh - Complete Clean Uninstallation for runet-fix
# Removes all services, nftables rules, cron tasks, dnsmasq adblock files, configs, and LuCI web views.

logger -t runet-fix "Starting clean uninstallation..."

PURGE_ZAPRET=0
for arg in "$@"; do
    case "$arg" in
        --purge-zapret) PURGE_ZAPRET=1 ;;
    esac
done

# 1. Stop all services and disable init script gracefully
if [ -x /etc/init.d/runet-fix ]; then
    /etc/init.d/runet-fix stop >/dev/null 2>&1
    /etc/init.d/runet-fix disable >/dev/null 2>&1
fi

# Terminate only runet-fix specific nfqws processes (holding runet-fix lists or args)
for p in $(pgrep -f "runet-fix|zapret-hosts" 2>/dev/null); do
    if [ "$p" != "$$" ] && [ "$p" != "$PPID" ]; then
        kill -9 "$p" 2>/dev/null || true
    fi
done

# Terminate runet-fix proxies/core
killall runet-fix-core 2>/dev/null || true
pkill -f "runet-fix-core" 2>/dev/null || true
pkill -f "tg_ws_proxy" 2>/dev/null || true
pkill -f "tg-ws-proxy" 2>/dev/null || true

# 2. Clean up firewall / nftables
if [ -x /usr/share/runet-fix/scripts/runet-fix-firewall.sh ]; then
    /usr/share/runet-fix/scripts/runet-fix-firewall.sh stop >/dev/null 2>&1
fi
nft delete table inet runet_fix >/dev/null 2>&1 || true
nft delete table ip runet_fix >/dev/null 2>&1 || true
nft delete table ip6 runet_fix >/dev/null 2>&1 || true

# 3. Clean up crontab
if [ -f /etc/crontabs/root ]; then
    sed -i '/runet-fix/d' /etc/crontabs/root 2>/dev/null
    /etc/init.d/cron restart >/dev/null 2>&1 || true
fi

# 4. Clean up adblock artifacts and dnsmasq
rm -f /tmp/dnsmasq.d/runet-fix-adblock.conf /tmp/dnsmasq.d/runet-fix-filter.conf
rm -f /tmp/runet-fix-adblock.count /tmp/runet-fix-hosts.count
rm -f /tmp/runet-fix-test.json /tmp/runet-fix-update.json /tmp/tg-ws-proxy-stats.json
if dnsmasq --test >/dev/null 2>&1; then
    /etc/init.d/dnsmasq reload >/dev/null 2>&1 || /etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
fi

# 5. Remove LuCI UI files and menu/ACL configurations
rm -rf /www/luci-static/resources/view/runet-fix
rm -f /usr/share/luci/menu.d/luci-app-runet-fix.json
rm -f /usr/share/rpcd/acl.d/luci-app-runet-fix.json

# Clear LuCI cache
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache /tmp/luci-cache

# 6. Backup and remove uci config
if [ -f /etc/config/runet-fix ]; then
    BACKUP_CFG="/etc/config/runet-fix.bak.$(date +%s)"
    cp -p /etc/config/runet-fix "$BACKUP_CFG" 2>/dev/null || cp /etc/config/runet-fix "$BACKUP_CFG"
    echo "Configuration backed up to: $BACKUP_CFG"
    rm -f /etc/config/runet-fix
fi
rm -f /etc/init.d/runet-fix

# 7. Check if /opt/zapret was managed by runet-fix
if [ "$PURGE_ZAPRET" = "1" ] || [ -f /opt/zapret/.runet-fix-managed ]; then
    echo "Removing runet-fix managed /opt/zapret..."
    rm -rf /opt/zapret
fi

# 8. Restart rpcd so ACL and menu are immediately purged
/etc/init.d/rpcd restart >/dev/null 2>&1 || true

logger -t runet-fix "Uninstallation finished successfully."

# 9. Remove bin and share directories
rm -f /usr/bin/runet-fix /usr/bin/runet-fix-core /usr/bin/tg-ws-proxy
rm -rf /usr/share/runet-fix

exit 0

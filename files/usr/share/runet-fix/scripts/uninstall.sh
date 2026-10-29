#!/bin/sh
# /usr/share/runet-fix/scripts/uninstall.sh - Complete Clean Uninstallation for runet-fix
# Removes all services, nftables rules, cron tasks, dnsmasq adblock files, configs, and LuCI web views.

logger -t runet-fix "Starting complete clean uninstallation..."

# 1. Stop all services and disable init script
if [ -x /etc/init.d/runet-fix ]; then
    /etc/init.d/runet-fix stop >/dev/null 2>&1
    /etc/init.d/runet-fix disable >/dev/null 2>&1
fi

# Kill any leftover daemons
killall nfqws >/dev/null 2>&1
killall tg-transproxy >/dev/null 2>&1
pkill -f tg_ws_transparent.py >/dev/null 2>&1

# 2. Clean up firewall / nftables
if [ -x /usr/share/runet-fix/scripts/runet-fix-firewall.sh ]; then
    /usr/share/runet-fix/scripts/runet-fix-firewall.sh stop >/dev/null 2>&1
fi
nft delete table inet runet_fix >/dev/null 2>&1
nft delete table ip runet_fix >/dev/null 2>&1
nft delete table ip6 runet_fix >/dev/null 2>&1

# 3. Clean up crontab
if [ -f /etc/crontabs/root ]; then
    sed -i '/runet-fix/d' /etc/crontabs/root 2>/dev/null
    /etc/init.d/cron restart >/dev/null 2>&1
fi

# 4. Clean up adblock artifacts and dnsmasq
rm -f /tmp/dnsmasq.d/runet-fix-adblock.conf
rm -f /tmp/runet-fix-adblock.count
rm -f /tmp/runet-fix-test.json
/etc/init.d/dnsmasq restart >/dev/null 2>&1

# 5. Remove LuCI UI files and menu/ACL configurations
rm -rf /www/luci-static/resources/view/runet-fix
rm -f /usr/share/luci/menu.d/luci-app-runet-fix.json
rm -f /usr/share/rpcd/acl.d/luci-app-runet-fix.json

# Clear LuCI cache
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache /tmp/luci-cache

# 6. Remove service init and uci config
rm -f /etc/init.d/runet-fix
rm -f /etc/config/runet-fix

# 7. Restart rpcd so ACL and menu are immediately purged
/etc/init.d/rpcd restart >/dev/null 2>&1

logger -t runet-fix "Uninstallation finished successfully."

# 8. Remove bin and share directories
rm -f /usr/bin/runet-fix
rm -rf /usr/share/runet-fix

exit 0

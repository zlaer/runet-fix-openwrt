#!/bin/sh
# update-adblock.sh - High-speed, Low-RAM Adblock generator for OpenWrt dnsmasq
# Part of the runet-fix all-in-one suite.

CONF_DIR="/tmp/dnsmasq.d"
CONF_FILE="$CONF_DIR/runet-fix-adblock.conf"
TEMP_RAW="/tmp/adblock_raw.tmp"
TEMP_DOMAINS="/tmp/adblock_domains.tmp"
WHITELIST="/usr/share/runet-fix/lists/adblock-whitelist.txt"
BLACKLIST="/usr/share/runet-fix/lists/adblock-blacklist.txt"
RU_CURATED="/usr/share/runet-fix/lists/adblock-ru-curated.txt"

# Reliable GitHub Raw sources
STEVENBLACK_UNIFIED="https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
ADGUARD_RU_FIRSTPARTY="https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/CyrillicFilters/RussianFilter/sections/adservers_firstparty.txt"
NOCOIN_MINERS="https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/hosts.txt"

mkdir -p "$CONF_DIR"
mkdir -p /usr/share/runet-fix/lists

fetch_file() {
    local url="$1"
    local dest="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -s -k -L --connect-timeout 8 --max-time 30 -o "$dest" "$url"
    elif command -v uclient-fetch >/dev/null 2>&1; then
        uclient-fetch -q --no-check-certificate -O "$dest" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q --no-check-certificate -O "$dest" "$url"
    else
        return 1
    fi
}

echo "[runet-fix:adblock] Updating adblock lists..."

# Read configuration from UCI
PROFILE=$(uci -q get runet-fix.adblock.profile || echo "standard")
ENABLED=$(uci -q get runet-fix.adblock.enabled || echo "1")
ENABLE_RU=$(uci -q get runet-fix.adblock.enable_ru || echo "1")
AUTO_UPDATE=$(uci -q get runet-fix.adblock.auto_update || echo "weekly")

# Check available memory to prevent OOM panic on 64MB routers
AVAIL_KB=$(awk '/MemAvailable/ { print $2 }' /proc/meminfo 2>/dev/null)
if [ -z "$AVAIL_KB" ]; then
    FREE_KB=$(awk '/MemFree/ { print $2 }' /proc/meminfo 2>/dev/null || echo "0")
    BUFF_KB=$(awk '/Buffers/ { print $2 }' /proc/meminfo 2>/dev/null || echo "0")
    CACHE_KB=$(awk '/^Cached/ { print $2 }' /proc/meminfo 2>/dev/null || echo "0")
    AVAIL_KB=$((FREE_KB + BUFF_KB + CACHE_KB))
fi

if [ -n "$AVAIL_KB" ] && [ "$AVAIL_KB" -gt 0 ] && [ "$AVAIL_KB" -lt 12288 ] && [ "$PROFILE" != "micro" ]; then
    echo "[runet-fix:adblock] Warning: Low available memory (${AVAIL_KB} kB < 12 MB). Automatically downgrading to micro profile (<2MB RAM) to prevent OOM panic."
    PROFILE="micro"
fi

# Sync crontab schedule
CRON_FILE="/etc/crontabs/root"
mkdir -p /etc/crontabs
touch "$CRON_FILE"
sed -i '/runet-fix-adblock/d' "$CRON_FILE"

case "$AUTO_UPDATE" in
    daily)
        echo "0 4 * * * /usr/share/runet-fix/scripts/update-adblock.sh >/dev/null 2>&1 # runet-fix-adblock" >> "$CRON_FILE"
        /etc/init.d/cron enable >/dev/null 2>&1
        /etc/init.d/cron restart >/dev/null 2>&1
        ;;
    weekly)
        echo "0 4 * * 0 /usr/share/runet-fix/scripts/update-adblock.sh >/dev/null 2>&1 # runet-fix-adblock" >> "$CRON_FILE"
        /etc/init.d/cron enable >/dev/null 2>&1
        /etc/init.d/cron restart >/dev/null 2>&1
        ;;
    disabled|none|*)
        /etc/init.d/cron restart >/dev/null 2>&1
        ;;
esac

if [ "$ENABLED" != "1" ]; then
    echo "[runet-fix:adblock] Adblock is disabled in config. Cleaning up..."
    rm -f "$CONF_FILE" /tmp/runet-fix-adblock.count
    /etc/init.d/dnsmasq restart >/dev/null 2>&1
    exit 0
fi

rm -f "$TEMP_RAW" "$TEMP_DOMAINS"
touch "$TEMP_RAW"

# 1. Fetch StevenBlack Unified Base List (skipped in micro profile)
if [ "$PROFILE" != "micro" ]; then
    echo "[runet-fix:adblock] Fetching base adblock list..."
    fetch_file "$STEVENBLACK_UNIFIED" "/tmp/base.tmp" && cat "/tmp/base.tmp" >> "$TEMP_RAW"
    rm -f "/tmp/base.tmp"
else
    echo "[runet-fix:adblock] Micro profile active (<2MB RAM) - loading curated Russian ad/tracker filters..."
fi

# 2. Russian Filters (RU AdList & Trackers)
if [ "$ENABLE_RU" = "1" ]; then
    echo "[runet-fix:adblock] Adding Russian AdList & AdGuard filters..."
    fetch_file "$ADGUARD_RU_FIRSTPARTY" "/tmp/adg_ru.tmp" && cat "/tmp/adg_ru.tmp" >> "$TEMP_RAW"
    rm -f "/tmp/adg_ru.tmp"
    if [ -s "$RU_CURATED" ]; then
        cat "$RU_CURATED" >> "$TEMP_RAW"
    fi
fi

# 3. Aggressive profile additions (Crypto miners)
if [ "$PROFILE" = "aggressive" ]; then
    echo "[runet-fix:adblock] Adding Anti-Coinminer protection..."
    fetch_file "$NOCOIN_MINERS" "/tmp/nocoin.tmp" && cat "/tmp/nocoin.tmp" >> "$TEMP_RAW"
    rm -f "/tmp/nocoin.tmp"
fi

# 4. Append user custom blacklist
if [ -s "$BLACKLIST" ]; then
    cat "$BLACKLIST" >> "$TEMP_RAW"
fi

# Parse, clean, and deduplicate domains using awk
awk '
    # Strip comments and whitespace
    {
        sub(/[#;!].*$/, "")
        gsub(/^[[:space:]]+|[[:space:]]+$/, "")
        # Remove standard hosts prefixes like 0.0.0.0 or 127.0.0.1
        sub(/^0\.0\.0\.0[[:space:]]+/, "")
        sub(/^127\.0\.0\.1[[:space:]]+/, "")
        sub(/^\*\./, "")
        sub(/^\|\|/, "")
        sub(/\^.*$/, "")
    }
    # Validate domain name syntax
    /^[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}$/ {
        if (!seen[tolower($0)]++) {
            print tolower($0)
        }
    }
' "$TEMP_RAW" > "$TEMP_DOMAINS"

# Apply whitelist if present (exact domain and parent domain wildcard matching)
if [ -s "$WHITELIST" ]; then
    echo "[runet-fix:adblock] Applying whitelist (with subdomain protection)..."
    awk '
        NR == FNR {
            sub(/[#;!].*$/, "")
            gsub(/^[[:space:]]+|[[:space:]]+$/, "")
            if ($0 != "") {
                white[tolower($0)] = 1
            }
            next
        }
        {
            dom = tolower($0)
            if (white[dom]) next
            n = split(dom, parts, ".")
            cur = parts[n]
            is_white = 0
            for (i = n - 1; i >= 1; i--) {
                cur = parts[i] "." cur
                if (white[cur]) {
                    is_white = 1
                    break
                }
            }
            if (!is_white) {
                print dom
            }
        }
    ' "$WHITELIST" "$TEMP_DOMAINS" > "${TEMP_DOMAINS}.clean"
    mv "${TEMP_DOMAINS}.clean" "$TEMP_DOMAINS"
fi

TOTAL=$(wc -l < "$TEMP_DOMAINS")
echo "[runet-fix:adblock] Total unique ad domains blocked: $TOTAL"

# Format into dnsmasq address=/domain/ syntax (redirects to 0.0.0.0 and ::)
awk '{ print "address=/" $0 "/" }' "$TEMP_DOMAINS" > "$CONF_FILE"
echo "$TOTAL" > /tmp/runet-fix-adblock.count

rm -f "$TEMP_RAW" "$TEMP_DOMAINS"

# Tell dnsmasq to restart configuration
echo "[runet-fix:adblock] Restarting dnsmasq..."
/etc/init.d/dnsmasq restart >/dev/null 2>&1

echo "[runet-fix:adblock] Update completed successfully."

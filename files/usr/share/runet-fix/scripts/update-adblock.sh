#!/bin/sh
# update-adblock.sh - High-speed, Low-RAM Adblock generator for OpenWrt dnsmasq
# Part of the runet-fix all-in-one suite.

CONF_DIR="/tmp/dnsmasq.d"
CONF_FILE="$CONF_DIR/runet-fix-adblock.conf"
TEMP_RAW="/tmp/adblock_raw.tmp"
TEMP_DOMAINS="/tmp/adblock_domains.tmp"
WHITELIST="/usr/share/runet-fix/lists/adblock-whitelist.txt"
BLACKLIST="/usr/share/runet-fix/lists/adblock-blacklist.txt"

# Default high-efficiency sources
OISD_SMALL="https://small.oisd.nl/domainswild"
ADGUARD_RU="https://adguardteam.github.io/HostlistsRegistry/assets/filter_34.txt"
ADGUARD_DEFAULT="https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt"

mkdir -p "$CONF_DIR"
mkdir -p /usr/share/runet-fix/lists

fetch_file() {
    local url="$1"
    local dest="$2"
    if command -v uclient-fetch >/dev/null 2>&1; then
        uclient-fetch -q --no-check-certificate -O "$dest" "$url"
    elif command -v curl >/dev/null 2>&1; then
        curl -s -k -L -o "$dest" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q --no-check-certificate -O "$dest" "$url"
    else
        return 1
    fi
}

echo "[runet-fix:adblock] Updating adblock lists..."

# Read profile from UCI
PROFILE=$(uci -q get runet-fix.adblock.profile || echo "standard")
ENABLED=$(uci -q get runet-fix.adblock.enabled || echo "1")

if [ "$ENABLED" != "1" ]; then
    echo "[runet-fix:adblock] Adblock is disabled in config. Cleaning up..."
    rm -f "$CONF_FILE" /tmp/runet-fix-adblock.count
    /etc/init.d/dnsmasq reload >/dev/null 2>&1 || killall -SIGHUP dnsmasq 2>/dev/null
    exit 0
fi

rm -f "$TEMP_RAW" "$TEMP_DOMAINS"
touch "$TEMP_RAW"

# Download selected profiles
case "$PROFILE" in
    light)
        echo "[runet-fix:adblock] Fetching OISD Small list..."
        fetch_file "$OISD_SMALL" "/tmp/oisd.tmp" && cat "/tmp/oisd.tmp" >> "$TEMP_RAW"
        rm -f "/tmp/oisd.tmp"
        ;;
    aggressive)
        echo "[runet-fix:adblock] Fetching OISD + AdGuard RU + Global filters..."
        fetch_file "$OISD_SMALL" "/tmp/oisd.tmp" && cat "/tmp/oisd.tmp" >> "$TEMP_RAW"
        fetch_file "$ADGUARD_RU" "/tmp/adg_ru.tmp" && cat "/tmp/adg_ru.tmp" >> "$TEMP_RAW"
        fetch_file "$ADGUARD_DEFAULT" "/tmp/adg_def.tmp" && cat "/tmp/adg_def.tmp" >> "$TEMP_RAW"
        rm -f "/tmp/oisd.tmp" "/tmp/adg_ru.tmp" "/tmp/adg_def.tmp"
        ;;
    standard|*)
        echo "[runet-fix:adblock] Fetching OISD + AdGuard RU filters..."
        fetch_file "$OISD_SMALL" "/tmp/oisd.tmp" && cat "/tmp/oisd.tmp" >> "$TEMP_RAW"
        fetch_file "$ADGUARD_RU" "/tmp/adg_ru.tmp" && cat "/tmp/adg_ru.tmp" >> "$TEMP_RAW"
        rm -f "/tmp/oisd.tmp" "/tmp/adg_ru.tmp"
        ;;
esac

# Append user custom blacklist
if [ -s "$BLACKLIST" ]; then
    cat "$BLACKLIST" >> "$TEMP_RAW"
fi

# Parse, clean, and deduplicate domains using awk
awk '
    # Strip comments and whitespace
    {
        sub(/[#;].*$/, "")
        gsub(/^[[:space:]]+|[[:space:]]+$/, "")
        # Remove standard hosts prefixes like 0.0.0.0 or 127.0.0.1
        sub(/^0\.0\.0\.0[[:space:]]+/, "")
        sub(/^127\.0\.0\.1[[:space:]]+/, "")
        sub(/^\*\./, "")
        sub(/^\|\|/, "")
        sub(/\^$/, "")
    }
    # Validate domain name syntax
    /^[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}$/ {
        if (!seen[tolower($0)]++) {
            print tolower($0)
        }
    }
' "$TEMP_RAW" > "$TEMP_DOMAINS"

# Apply whitelist if present
if [ -s "$WHITELIST" ]; then
    echo "[runet-fix:adblock] Applying whitelist..."
    grep -v -F -f "$WHITELIST" "$TEMP_DOMAINS" > "${TEMP_DOMAINS}.clean"
    mv "${TEMP_DOMAINS}.clean" "$TEMP_DOMAINS"
fi

TOTAL=$(wc -l < "$TEMP_DOMAINS")
echo "[runet-fix:adblock] Total unique ad domains blocked: $TOTAL"

# Format into dnsmasq address=/domain/ syntax (redirects to 0.0.0.0 and ::)
awk '{ print "address=/" $0 "/" }' "$TEMP_DOMAINS" > "$CONF_FILE"
echo "$TOTAL" > /tmp/runet-fix-adblock.count

rm -f "$TEMP_RAW" "$TEMP_DOMAINS"

# Tell dnsmasq to reload configuration
echo "[runet-fix:adblock] Reloading dnsmasq..."
/etc/init.d/dnsmasq reload >/dev/null 2>&1 || killall -SIGHUP dnsmasq 2>/dev/null

echo "[runet-fix:adblock] Update completed successfully."

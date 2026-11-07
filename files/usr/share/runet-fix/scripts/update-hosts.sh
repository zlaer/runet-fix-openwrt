#!/bin/sh
# update-hosts.sh - Curated AntiFilter Community blocked domains updater for Zapret
# Part of the runet-fix all-in-one suite.

HOSTLIST_FILE="/usr/share/runet-fix/lists/zapret-hosts.txt"
TEMP_RAW="/tmp/zapret_hosts_raw.tmp"
TEMP_MERGED="/tmp/zapret_hosts_merged.tmp"
COUNT_FILE="/tmp/runet-fix-hosts.count"

# AntiFilter Community list URL
ANTIFILTER_URL="https://community.antifilter.download/list/domains.lst"

mkdir -p /usr/share/runet-fix/lists
mkdir -p /tmp/runet-fix

fetch_file() {
    local url="$1"
    local dest="$2"
    rm -f "$dest"

    if command -v uclient-fetch >/dev/null 2>&1; then
        if uclient-fetch -q -O "$dest" "$url" 2>/dev/null && [ -s "$dest" ]; then
            return 0
        fi
    fi

    if command -v wget >/dev/null 2>&1; then
        if wget -q -O "$dest" "$url" 2>/dev/null && [ -s "$dest" ]; then
            return 0
        fi
    fi

    if command -v curl >/dev/null 2>&1; then
        if curl -s -f -L --connect-timeout 8 --max-time 30 -o "$dest" "$url" 2>/dev/null && [ -s "$dest" ]; then
            return 0
        fi
    fi

    echo "[runet-fix:hosts] Error: Failed to fetch $url (TLS verification or network error)" >&2
    rm -f "$dest"
    return 1
}

echo "[runet-fix:hosts] Updating Zapret target hostlist from AntiFilter Community..."

FETCH_OK=0
if fetch_file "$ANTIFILTER_URL" "$TEMP_RAW"; then
    FETCH_OK=1
fi

touch "$HOSTLIST_FILE"
rm -f "$TEMP_MERGED"

# 1. Preserve existing domains from user hostlist
cat "$HOSTLIST_FILE" 2>/dev/null >> "$TEMP_MERGED"

# 2. Append newly downloaded AntiFilter Community domains if fetch succeeded
if [ "$FETCH_OK" = "1" ] && [ -s "$TEMP_RAW" ]; then
    cat "$TEMP_RAW" >> "$TEMP_MERGED"
fi

# 3. Ensure core base streaming and messenger domains are always present
cat << 'EOF_BASE' >> "$TEMP_MERGED"
youtube.com
googlevideo.com
ytimg.com
ggpht.com
googleapis.com
googleusercontent.com
discord.com
discord.gg
discordapp.com
discordapp.net
discord.media
discord-attachments-uploads-prd.storage.googleapis.com
twitter.com
x.com
t.co
twimg.com
instagram.com
cdninstagram.com
facebook.com
fbcdn.net
notion.so
medium.com
rutracker.org
flibusta.is
nnmclub.to
kinozal.tv
lostfilm.tv
hdrezka.ag
torproject.org
cloudflare-ech.com
EOF_BASE

# 4. Clean, trim and deduplicate
tr -d '\r' < "$TEMP_MERGED" | sed 's/^[ \t]*//;s/[ \t]*$//' | \
    grep -v '^#' | grep -v '^$' | grep '\.' | sort -u > "$HOSTLIST_FILE"

rm -f "$TEMP_RAW" "$TEMP_MERGED"

TOTAL_COUNT=$(wc -l < "$HOSTLIST_FILE" | tr -d ' ')
echo "$TOTAL_COUNT" > "$COUNT_FILE"
chmod 644 "$HOSTLIST_FILE" 2>/dev/null || true
echo "[runet-fix:hosts] Zapret hostlist successfully updated: $TOTAL_COUNT active domains."

# 5. Sync crontab schedule
AUTO_UPDATE=$(uci -q get runet-fix.zapret.auto_update_hosts || echo "weekly")
CRON_FILE="/etc/crontabs/root"
mkdir -p /etc/crontabs
touch "$CRON_FILE"
sed -i '/runet-fix-hosts/d' "$CRON_FILE"

case "$AUTO_UPDATE" in
    daily)
        echo "0 5 * * * /usr/share/runet-fix/scripts/update-hosts.sh >/dev/null 2>&1 # runet-fix-hosts" >> "$CRON_FILE"
        /etc/init.d/cron enable >/dev/null 2>&1
        /etc/init.d/cron restart >/dev/null 2>&1
        ;;
    weekly)
        echo "0 5 * * 0 /usr/share/runet-fix/scripts/update-hosts.sh >/dev/null 2>&1 # runet-fix-hosts" >> "$CRON_FILE"
        /etc/init.d/cron enable >/dev/null 2>&1
        /etc/init.d/cron restart >/dev/null 2>&1
        ;;
    disabled|none|*)
        /etc/init.d/cron restart >/dev/null 2>&1
        ;;
esac

# 6. If Zapret is running in list mode, restart to apply new hostlist
MODE=$(uci -q get runet-fix.zapret.mode || echo "all")
ZAPRET_ENABLED=$(uci -q get runet-fix.zapret.enabled || echo "1")
if [ "$ZAPRET_ENABLED" = "1" ] && [ "$MODE" = "list" ]; then
    echo "[runet-fix:hosts] Restarting Zapret to apply updated hostlist..."
    /etc/init.d/runet-fix restart >/dev/null 2>&1 || true
fi

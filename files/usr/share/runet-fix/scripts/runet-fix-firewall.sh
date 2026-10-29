#!/bin/sh
# runet-fix-firewall.sh - Universal Firewall integration (nftables / iptables)
# Part of the runet-fix all-in-one suite for OpenWrt.

TABLE_NAME="runet_fix"
QNUM=200
TG_PORT="${TG_PORT:-1443}"

# Determine firewall implementation
is_fw4() {
    command -v nft >/dev/null 2>&1 && [ -f /etc/nftables.d/README -o -f /usr/share/firewall4/main.nft ]
}

# Telegram IP subnets
TELEGRAM_SUBNETS="
91.108.4.0/22
91.108.8.0/22
91.108.12.0/22
91.108.16.0/22
91.108.20.0/22
91.108.56.0/22
149.154.160.0/20
185.76.151.0/24
"

# ==============================================================================
# NFTABLES (fw4 - OpenWrt 22.03+)
# ==============================================================================
start_nft() {
    stop_nft >/dev/null 2>&1

    # Load configuration values from UCI
    local main_enabled=$(uci -q get runet-fix.main.enabled || echo "1")
    if [ "$main_enabled" != "1" ]; then
        echo "[runet-fix] Master switch disabled. Firewall rules cleaned."
        return 0
    fi

    local zapret_enabled=$(uci -q get runet-fix.zapret.enabled || echo "1")
    local zapret_mode=$(uci -q get runet-fix.zapret.mode || echo "all")
    local tg_enabled=$(uci -q get runet-fix.telegram.enabled || echo "1")
    local tg_port=$(uci -q get runet-fix.telegram.port || echo "1443")
    local discord_fix=$(uci -q get runet-fix.zapret.discord_fix || echo "1")

    if [ "$zapret_enabled" != "1" ] && [ "$tg_enabled" != "1" ]; then
        echo "[runet-fix] Both Zapret and Telegram disabled. Firewall rules cleaned."
        return 0
    fi

    echo "[runet-fix] Applying nftables rules (fw4)..."

    # Create dedicated table
    nft add table inet $TABLE_NAME

    # 1. Telegram Subnets Set
    nft "add set inet $TABLE_NAME telegram_v4 { type ipv4_addr; flags interval; }"
    for net in $TELEGRAM_SUBNETS; do
        nft "add element inet $TABLE_NAME telegram_v4 { $net }"
    done

    # 2. Telegram Transparent Redirection (NAT PREROUTING for LAN clients)
    if [ "$tg_enabled" = "1" ]; then
        nft "add chain inet $TABLE_NAME tg_nat_pre { type nat hook prerouting priority dstnat; policy accept; }"
        nft "add rule inet $TABLE_NAME tg_nat_pre ip daddr @telegram_v4 tcp dport { 80, 443, 5222, 8443 } counter redirect to :$tg_port"
        echo "[runet-fix] Telegram transparent redirection active -> :$tg_port"
    fi

    # 3. Zapret DPI Bypass (NFQUEUE)
    if [ "$zapret_enabled" = "1" ]; then
        nft "add chain inet $TABLE_NAME zapret_mangle { type filter hook forward priority mangle; policy accept; }"
        
        # Exclude Telegram subnets from forward NFQUEUE only if tg-ws-proxy is handling them
        if [ "$tg_enabled" = "1" ]; then
            nft "add rule inet $TABLE_NAME zapret_mangle ip daddr @telegram_v4 return"
        fi
        
        # Exclude local private LAN subnets
        nft "add rule inet $TABLE_NAME zapret_mangle ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8 } return"

        # Intercept HTTP/HTTPS (only first 20 packets of connection for DPI handshake desync)
        nft "add rule inet $TABLE_NAME zapret_mangle tcp dport { 80, 443 } ct original packets < 20 counter queue num $QNUM bypass"
        
        # Discord Voice and Media UDP
        if [ "$discord_fix" = "1" ]; then
            nft "add rule inet $TABLE_NAME zapret_mangle udp dport { 50000-50100, 19294-19344 } ct original packets < 10 counter queue num $QNUM bypass"
        fi
        
        # QUIC (UDP 443)
        nft "add rule inet $TABLE_NAME zapret_mangle udp dport 443 ct original packets < 10 counter queue num $QNUM bypass"

        # Local output mangle (so router itself benefits from desync and health probe works)
        nft "add chain inet $TABLE_NAME zapret_mangle_out { type filter hook output priority mangle; policy accept; }"
        nft "add rule inet $TABLE_NAME zapret_mangle_out ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8 } return"
        nft "add rule inet $TABLE_NAME zapret_mangle_out meta mark 0x40000000 return"
        nft "add rule inet $TABLE_NAME zapret_mangle_out tcp dport { 80, 443 } ct original packets < 20 counter queue num $QNUM bypass"
        nft "add rule inet $TABLE_NAME zapret_mangle_out udp dport 443 ct original packets < 10 counter queue num $QNUM bypass"
        echo "[runet-fix] Zapret NFQUEUE ($QNUM) active (Forward + Output)"
    fi

    # 4. Port 53 DNS redirection (forces all clients through dnsmasq, prevents hardcoded DNS bypass)
    local adb_enabled=$(uci -q get runet-fix.adblock.enabled || echo "1")
    if [ "$adb_enabled" = "1" ]; then
        nft "add chain inet $TABLE_NAME dns_nat_pre { type nat hook prerouting priority dstnat; policy accept; }"
        nft "add rule inet $TABLE_NAME dns_nat_pre udp dport 53 counter redirect to :53"
        nft "add rule inet $TABLE_NAME dns_nat_pre tcp dport 53 counter redirect to :53"
        echo "[runet-fix] DNS interception active -> local dnsmasq :53"
    fi
}

stop_nft() {
    echo "[runet-fix] Removing nftables table $TABLE_NAME..."
    nft delete table inet $TABLE_NAME >/dev/null 2>&1 || true
}

# ==============================================================================
# IPTABLES (fw3 - OpenWrt 21.02 and legacy)
# ==============================================================================
start_ipt() {
    stop_ipt >/dev/null 2>&1

    local main_enabled=$(uci -q get runet-fix.main.enabled || echo "1")
    if [ "$main_enabled" != "1" ]; then
        echo "[runet-fix] Master switch disabled. Firewall rules cleaned."
        return 0
    fi

    local zapret_enabled=$(uci -q get runet-fix.zapret.enabled || echo "1")
    local tg_enabled=$(uci -q get runet-fix.telegram.enabled || echo "1")
    local tg_port=$(uci -q get runet-fix.telegram.port || echo "1443")
    local discord_fix=$(uci -q get runet-fix.zapret.discord_fix || echo "1")

    if [ "$zapret_enabled" != "1" ] && [ "$tg_enabled" != "1" ]; then
        echo "[runet-fix] Both Zapret and Telegram disabled. Firewall rules cleaned."
        return 0
    fi

    echo "[runet-fix] Applying iptables rules (fw3)..."

    # Create ipset for telegram
    ipset create tg_subnets hash:net -exist
    for net in $TELEGRAM_SUBNETS; do
        ipset add tg_subnets $net -exist
    done

    # Telegram Redirect
    if [ "$tg_enabled" = "1" ]; then
        iptables -t nat -N RUNET_TG 2>/dev/null || iptables -t nat -F RUNET_TG
        iptables -t nat -A RUNET_TG -p tcp -m multiport --dports 80,443,5222,8443 -j REDIRECT --to-ports $tg_port
        iptables -t nat -I PREROUTING -m set --match-set tg_subnets dst -j RUNET_TG
    fi

    # Zapret NFQUEUE
    if [ "$zapret_enabled" = "1" ]; then
        iptables -t mangle -N RUNET_ZAPRET 2>/dev/null || iptables -t mangle -F RUNET_ZAPRET
        if [ "$tg_enabled" = "1" ]; then
            iptables -t mangle -A RUNET_ZAPRET -m set --match-set tg_subnets dst -j RETURN
        fi
        iptables -t mangle -A RUNET_ZAPRET -d 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8 -j RETURN
        iptables -t mangle -A RUNET_ZAPRET -p tcp -m multiport --dports 80,443 -m connbytes --connbytes 1:20 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
        if [ "$discord_fix" = "1" ]; then
            iptables -t mangle -A RUNET_ZAPRET -p udp --dport 50000:50100 -m connbytes --connbytes 1:10 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
            iptables -t mangle -A RUNET_ZAPRET -p udp --dport 19294:19344 -m connbytes --connbytes 1:10 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
        fi
        iptables -t mangle -I FORWARD -j RUNET_ZAPRET
    fi

    # DNS Redirection (port 53)
    local adb_enabled=$(uci -q get runet-fix.adblock.enabled || echo "1")
    if [ "$adb_enabled" = "1" ]; then
        iptables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-ports 53 2>/dev/null || true
        iptables -t nat -A PREROUTING -p tcp --dport 53 -j REDIRECT --to-ports 53 2>/dev/null || true
    fi
}

stop_ipt() {
    echo "[runet-fix] Flushing iptables rules..."
    iptables -t nat -D PREROUTING -m set --match-set tg_subnets dst -j RUNET_TG 2>/dev/null || true
    iptables -t nat -D OUTPUT -m set --match-set tg_subnets dst -j RUNET_TG 2>/dev/null || true
    iptables -t nat -F RUNET_TG 2>/dev/null || true
    iptables -t nat -X RUNET_TG 2>/dev/null || true

    iptables -t mangle -D FORWARD -j RUNET_ZAPRET 2>/dev/null || true
    iptables -t mangle -F RUNET_ZAPRET 2>/dev/null || true
    iptables -t mangle -X RUNET_ZAPRET 2>/dev/null || true

    ipset destroy tg_subnets 2>/dev/null || true
}

case "$1" in
    start)
        if is_fw4; then
            start_nft
        else
            start_ipt
        fi
        ;;
    stop)
        if is_fw4; then
            stop_nft
        else
            stop_ipt
        fi
        ;;
    restart)
        $0 stop
        $0 start
        ;;
    status)
        if is_fw4; then
            nft list table inet $TABLE_NAME 2>/dev/null || echo "Firewall table $TABLE_NAME is inactive"
        else
            iptables -t nat -L RUNET_TG 2>/dev/null || echo "RUNET_TG is inactive"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac

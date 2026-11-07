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

# Telegram IP subnets (IPv4 and IPv6)
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

TELEGRAM_V6_SUBNETS="
2001:67c:4e8::/48
2001:b28:f23d::/48
2001:b28:f23f::/48
"

# ==============================================================================
# NFTABLES (fw4 - OpenWrt 22.03+)
# ==============================================================================
start_nft() {
    # Load configuration values from UCI
    local main_enabled=$(uci -q get runet-fix.main.enabled)
    [ -z "$main_enabled" ] && main_enabled="1"
    if [ "$main_enabled" != "1" ]; then
        stop_nft >/dev/null 2>&1
        echo "[runet-fix] Master switch disabled. Firewall rules cleaned."
        return 0
    fi

    local zapret_enabled=$(uci -q get runet-fix.zapret.enabled)
    [ -z "$zapret_enabled" ] && zapret_enabled="1"
    local zapret_mode=$(uci -q get runet-fix.zapret.mode || echo "all")
    local tg_enabled=$(uci -q get runet-fix.telegram.enabled)
    [ -z "$tg_enabled" ] && tg_enabled="1" 
    local tg_port=$(uci -q get runet-fix.telegram.port || echo "1443")
    local discord_fix=$(uci -q get runet-fix.zapret.discord_fix || echo "1")
    local game_fix=$(uci -q get runet-fix.zapret.game_fix || echo "0")
    local excl_ips=$(uci -q get runet-fix.zapret.excluded_ips)
    local excl_macs=$(uci -q get runet-fix.zapret.excluded_macs)
    local adb_enabled=$(uci -q get runet-fix.adblock.enabled)
    [ -z "$adb_enabled" ] && adb_enabled="1"

    if [ "$zapret_enabled" != "1" ] && [ "$tg_enabled" != "1" ]; then
        stop_nft >/dev/null 2>&1
        echo "[runet-fix] Both Zapret and Telegram disabled. Firewall rules cleaned."
        return 0
    fi

    echo "[runet-fix] Compiling and applying atomic nftables rules (fw4)..."

    # Clean existing table before atomic replacement
    nft delete table inet $TABLE_NAME 2>/dev/null || true

    local NFT_CONF="/tmp/runet-fix-nft.conf"
    cat << 'EOF_HDR' > "$NFT_CONF"
table inet runet_fix {
    set telegram_v4 {
        type ipv4_addr
        flags interval
        elements = {
            91.108.4.0/22, 91.108.8.0/22, 91.108.12.0/22,
            91.108.16.0/22, 91.108.20.0/22, 91.108.56.0/22,
            149.154.160.0/20, 185.76.151.0/24
        }
    }
    set telegram_v6 {
        type ipv6_addr
        flags interval
        elements = {
            2001:67c:4e8::/48, 2001:b28:f23d::/48, 2001:b28:f23f::/48
        }
    }
EOF_HDR

    # Excluded Devices Sets (Device Bypass by IP / MAC)
    local has_excl_ips=0
    if [ -n "$excl_ips" ]; then
        echo "    set excluded_ips { type ipv4_addr; flags interval; elements = { $(echo $excl_ips | sed 's/ /, /g') } }" >> "$NFT_CONF"
        has_excl_ips=1
        echo "[runet-fix] Device bypass active for IPs: $excl_ips"
    fi

    local has_excl_macs=0
    if [ -n "$excl_macs" ]; then
        echo "    set excluded_macs { type ether_addr; elements = { $(echo $excl_macs | sed 's/ /, /g') } }" >> "$NFT_CONF"
        has_excl_macs=1
        echo "[runet-fix] Device bypass active for MACs: $excl_macs"
    fi

    # Telegram Transparent Redirection (NAT PREROUTING for LAN clients) & IPv6 Leak Prevention
    if [ "$tg_enabled" = "1" ]; then
        cat << EOF_TG >> "$NFT_CONF"
    chain tg_nat_pre {
        type nat hook prerouting priority dstnat; policy accept;
$([ "$has_excl_ips" = "1" ] && echo "        ip saddr @excluded_ips return")
$([ "$has_excl_macs" = "1" ] && echo "        ether saddr @excluded_macs return")
        ip daddr @telegram_v4 tcp dport { 80, 443, 5222, 8443 } counter redirect to :$tg_port
    }
    chain tg_reject_v6 {
        type filter hook forward priority mangle; policy accept;
$([ "$has_excl_ips" = "1" ] && echo "        ip saddr @excluded_ips return")
$([ "$has_excl_macs" = "1" ] && echo "        ether saddr @excluded_macs return")
        ip6 daddr @telegram_v6 reject with icmpv6 type admin-prohibited
    }
    chain tg_reject_v6_out {
        type filter hook output priority mangle; policy accept;
        ip6 daddr @telegram_v6 reject with icmpv6 type admin-prohibited
    }
EOF_TG
        echo "[runet-fix] Telegram transparent redirection active -> :$tg_port (with IPv6 fallback)"
    fi

    # Zapret DPI Bypass (NFQUEUE)
    if [ "$zapret_enabled" = "1" ]; then
        local tcp_ports="80, 443"
        if [ "$discord_fix" = "1" ]; then
            tcp_ports="80, 443, 2053, 2083, 2087, 2096, 8443"
        fi

        cat << EOF_ZP >> "$NFT_CONF"
    chain zapret_mangle {
        type filter hook forward priority mangle; policy accept;
$([ "$has_excl_ips" = "1" ] && echo "        ip saddr @excluded_ips return")
$([ "$has_excl_macs" = "1" ] && echo "        ether saddr @excluded_macs return")
$([ "$tg_enabled" = "1" ] && echo "        ip daddr @telegram_v4 return")
        ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8 } return
        tcp dport { $tcp_ports } ct original packets < 20 counter queue num $QNUM bypass
$([ "$discord_fix" = "1" ] && echo "        udp dport { 19294-19344, 50000-50100 } ct original packets < 10 counter queue num $QNUM bypass")
$([ "$game_fix" = "1" ] && echo "        udp dport { 27015-27050, 7777-7780 } ct original packets < 10 counter queue num $QNUM bypass")
        udp dport 443 ct original packets < 10 counter queue num $QNUM bypass
    }
    chain zapret_mangle_out {
        type filter hook output priority mangle; policy accept;
        mark 0x40000000 return
        ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8 } return
$([ "$tg_enabled" = "1" ] && echo "        ip daddr @telegram_v4 return")
        tcp dport { 80, 443 } ct original packets < 20 counter queue num $QNUM bypass
    }
EOF_ZP
        echo "[runet-fix] Zapret NFQUEUE ($QNUM) active (Forward + Output)"
    fi

    # Port 53 DNS redirection (forces all clients through dnsmasq)
    if [ "$adb_enabled" = "1" ]; then
        cat << 'EOF_DNS' >> "$NFT_CONF"
    chain dns_nat_pre {
        type nat hook prerouting priority dstnat; policy accept;
        udp dport 53 counter redirect to :53
        tcp dport 53 counter redirect to :53
    }
EOF_DNS
        echo "[runet-fix] DNS interception active -> local dnsmasq :53"
    fi

    echo "}" >> "$NFT_CONF"

    if nft -f "$NFT_CONF"; then
        rm -f "$NFT_CONF"
        echo "[runet-fix] Atomic nftables configuration applied successfully."
    else
        echo "[runet-fix] Error: Failed to apply atomic nftables configuration! (inspect $NFT_CONF)" >&2
        return 1
    fi
}

stop_nft() {
    echo "[runet-fix] Removing nftables table $TABLE_NAME..."
    nft delete table inet $TABLE_NAME >/dev/null 2>&1 || true
    rm -f /tmp/runet-fix-nft.conf
}

# ==============================================================================
# IPTABLES (fw3 - OpenWrt 21.02 and legacy)
# ==============================================================================
start_ipt() {
    stop_ipt >/dev/null 2>&1

    local main_enabled=$(uci -q get runet-fix.main.enabled)
    [ -z "$main_enabled" ] && main_enabled="1"
    if [ "$main_enabled" != "1" ]; then
        echo "[runet-fix] Master switch disabled. Firewall rules cleaned."
        return 0
    fi

    local zapret_enabled=$(uci -q get runet-fix.zapret.enabled)
    [ -z "$zapret_enabled" ] && zapret_enabled="1"
    local tg_enabled=$(uci -q get runet-fix.telegram.enabled)
    [ -z "$tg_enabled" ] && tg_enabled="1" 
    local tg_port=$(uci -q get runet-fix.telegram.port || echo "1443")
    local discord_fix=$(uci -q get runet-fix.zapret.discord_fix || echo "1")
    local game_fix=$(uci -q get runet-fix.zapret.game_fix || echo "0")
    local excl_ips=$(uci -q get runet-fix.zapret.excluded_ips)

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
        for ip in $excl_ips; do
            iptables -t nat -A RUNET_TG -s "$ip" -j RETURN
        done
        iptables -t nat -A RUNET_TG -p tcp -m multiport --dports 80,443,5222,8443 -j REDIRECT --to-ports $tg_port
        iptables -t nat -I PREROUTING -m set --match-set tg_subnets dst -j RUNET_TG

        # Telegram IPv6 leak prevention (fw3): force clients to fallback to IPv4 transparent proxy
        if command -v ip6tables >/dev/null 2>&1; then
            for net in $TELEGRAM_V6_SUBNETS; do
                ip6tables -I FORWARD -d "$net" -p tcp -j REJECT --reject-with icmp6-adm-prohibited 2>/dev/null || true
                ip6tables -I OUTPUT -d "$net" -p tcp -j REJECT --reject-with icmp6-adm-prohibited 2>/dev/null || true
            done
        fi
    fi

    # Zapret NFQUEUE
    if [ "$zapret_enabled" = "1" ]; then
        iptables -t mangle -N RUNET_ZAPRET 2>/dev/null || iptables -t mangle -F RUNET_ZAPRET
        for ip in $excl_ips; do
            iptables -t mangle -A RUNET_ZAPRET -s "$ip" -j RETURN
        done
        if [ "$tg_enabled" = "1" ]; then
            iptables -t mangle -A RUNET_ZAPRET -m set --match-set tg_subnets dst -j RETURN
        fi
        iptables -t mangle -A RUNET_ZAPRET -m mark --mark 0x40000000 -j RETURN
        iptables -t mangle -A RUNET_ZAPRET -d 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8 -j RETURN
        local tcp_ports="80,443"
        if [ "$discord_fix" = "1" ]; then
            tcp_ports="80,443,2053,2083,2087,2096,8443"
        fi
        iptables -t mangle -A RUNET_ZAPRET -p tcp -m multiport --dports $tcp_ports -m connbytes --connbytes 1:20 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
        if [ "$discord_fix" = "1" ]; then
            iptables -t mangle -A RUNET_ZAPRET -p udp --dport 50000:50100 -m connbytes --connbytes 1:10 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
            iptables -t mangle -A RUNET_ZAPRET -p udp --dport 19294:19344 -m connbytes --connbytes 1:10 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
        fi
        if [ "$game_fix" = "1" ]; then
            iptables -t mangle -A RUNET_ZAPRET -p udp --dport 27015:27050 -m connbytes --connbytes 1:10 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
            iptables -t mangle -A RUNET_ZAPRET -p udp --dport 7777:7780 -m connbytes --connbytes 1:10 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
        fi
        iptables -t mangle -A RUNET_ZAPRET -p udp --dport 443 -m connbytes --connbytes 1:10 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
        iptables -t mangle -I FORWARD -j RUNET_ZAPRET
        iptables -t mangle -I OUTPUT -j RUNET_ZAPRET
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
    iptables -t mangle -D OUTPUT -j RUNET_ZAPRET 2>/dev/null || true
    iptables -t mangle -F RUNET_ZAPRET 2>/dev/null || true
    iptables -t mangle -X RUNET_ZAPRET 2>/dev/null || true

    ipset destroy tg_subnets 2>/dev/null || true

    if command -v ip6tables >/dev/null 2>&1; then
        for net in $TELEGRAM_V6_SUBNETS; do
            ip6tables -D FORWARD -d "$net" -p tcp -j REJECT --reject-with icmp6-adm-prohibited 2>/dev/null || true
            ip6tables -D OUTPUT -d "$net" -p tcp -j REJECT --reject-with icmp6-adm-prohibited 2>/dev/null || true
        done
    fi
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

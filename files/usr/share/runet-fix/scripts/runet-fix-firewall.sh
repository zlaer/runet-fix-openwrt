#!/bin/sh
# runet-fix-firewall.sh - Universal Firewall integration (nftables / iptables)
# Part of the runet-fix all-in-one suite for OpenWrt.

TABLE_NAME="runet_fix"
TG_PORT="${TG_PORT:-1443}"

# Read and validate QNUM (1-65535, fallback 200)
get_qnum() {
    local q=$(uci -q get runet-fix.zapret.qnum)
    case "$q" in
        ''|*[!0-9]*)
            [ -n "$q" ] && logger -t runet-fix "Invalid QNUM '$q', falling back to 200" 2>/dev/null
            echo "200"
            return
            ;;
    esac
    if [ "$q" -ge 1 ] && [ "$q" -le 65535 ]; then
        echo "$q"
    else
        logger -t runet-fix "QNUM '$q' out of range (1-65535), falling back to 200" 2>/dev/null
        echo "200"
    fi
}
QNUM=$(get_qnum)

# A non-numeric UCI port must not be interpolated into nftables or iptables.
get_tg_port() {
    local p
    p=$(uci -q get runet-fix.telegram.port)
    case "$p" in
        ''|*[!0-9]*)
            echo "1443"
            return
            ;;
    esac
    if [ "$p" -ge 1 ] && [ "$p" -le 65535 ]; then
        echo "$p"
    else
        echo "1443"
    fi
}

# LAN bridges that may be redirected. UCI list, then network.lan, then br-lan.
# Names are restricted so they can be interpolated into nftables and iptables.
lan_iface_list() {
    local raw iface
    raw=$(uci -q get runet-fix.main.lan_ifaces)
    if [ -z "$raw" ]; then
        raw=$(uci -q get network.lan.device)
    fi
    if [ -z "$raw" ]; then
        raw=$(uci -q get network.lan.ifname)
    fi
    [ -z "$raw" ] && raw="br-lan"
    for iface in $raw; do
        case "$iface" in
            *[!A-Za-z0-9._-]*) continue ;;
            ''|.*) continue ;;
        esac
        [ "${#iface}" -gt 15 ] && continue
        printf '%s\n' "$iface"
    done
}

# nft match for the validated LAN interfaces: iifname "br-lan"
# or iifname { "br-lan", "br-guest" }.
nft_iif_match() {
    local n=0 iface single acc
    acc=""
    single=""
    for iface in $(lan_iface_list); do
        n=$((n + 1))
        single=$iface
        if [ "$n" -eq 1 ]; then
            acc="\"$iface\""
        else
            acc="$acc, \"$iface\""
        fi
    done
    if [ "$n" -le 1 ]; then
        [ -n "$single" ] || single="br-lan"
        printf 'iifname "%s"\n' "$single"
    else
        printf 'iifname { %s }\n' "$acc"
    fi
}

# queue keeps the old NFQUEUE behaviour. Anything else drops UDP 443
# so clients fall back to TCP, which nfqws can desynchronize.
quic_mode() {
    local mode
    mode=$(uci -q get runet-fix.zapret.quic_mode)
    case "$mode" in
        queue) printf '%s\n' queue ;;
        *) printf '%s\n' drop ;;
    esac
}

# $1 raw UCI value, $2 fallback. Prints an nft port list such as
# 27015-27050,7777-7780. Rejects anything that is not a port or a range.
sanitize_port_list() {
    local raw default cleaned part a b old_ifs
    raw=$1
    default=$2
    cleaned=$(printf '%s' "$raw" | tr -d ' \t')
    [ -z "$cleaned" ] && cleaned=$default
    case "$cleaned" in
        *[!0-9,-]*)
            printf '%s\n' "$default"
            return
            ;;
    esac
    old_ifs=$IFS
    IFS=,
    # shellcheck disable=SC2086
    set -- $cleaned
    IFS=$old_ifs
    [ "$#" -ge 1 ] || {
        printf '%s\n' "$default"
        return
    }
    for part in "$@"; do
        case "$part" in
            ''|-*|*-|*--*)
                printf '%s\n' "$default"
                return
                ;;
            *-*)
                a=${part%%-*}
                b=${part#*-}
                case "$b" in
                    *-*|'')
                        printf '%s\n' "$default"
                        return
                        ;;
                esac
                ;;
            *)
                a=$part
                b=$part
                ;;
        esac
        case "$a$b" in
            *[!0-9]*|'')
                printf '%s\n' "$default"
                return
                ;;
        esac
        if [ "$a" -lt 1 ] || [ "$a" -gt 65535 ] || [ "$b" -lt 1 ] || [ "$b" -gt 65535 ] || [ "$a" -gt "$b" ]; then
            printf '%s\n' "$default"
            return
        fi
    done
    printf '%s\n' "$cleaned"
}

# Remove both the old interface-agnostic hooks and the LAN-scoped ones.
clear_forwarded_hooks() {
    local iface seen
    seen=""
    iptables -t mangle -D FORWARD -j RUNET_ZAPRET 2>/dev/null || true
    while iptables -t nat -D PREROUTING -m set --match-set tg_subnets dst -j RUNET_TG 2>/dev/null; do :; done
    while iptables -t nat -D PREROUTING -p udp --dport 53 -j REDIRECT --to-ports 53 2>/dev/null; do :; done
    while iptables -t nat -D PREROUTING -p tcp --dport 53 -j REDIRECT --to-ports 53 2>/dev/null; do :; done
    # Always clear br-lan as well: an upgrade or a changed UCI list must not
    # leave the previous LAN jump in place.
    for iface in $(lan_iface_list) br-lan; do
        case " $seen " in
            *" $iface "*) continue ;;
        esac
        seen="$seen $iface"
        iptables -t mangle -D FORWARD -i "$iface" -j RUNET_ZAPRET 2>/dev/null || true
        while iptables -t nat -D PREROUTING -i "$iface" -m set --match-set tg_subnets dst -j RUNET_TG 2>/dev/null; do :; done
        while iptables -t nat -D PREROUTING -i "$iface" -p udp --dport 53 -j REDIRECT --to-ports 53 2>/dev/null; do :; done
        while iptables -t nat -D PREROUTING -i "$iface" -p tcp --dport 53 -j REDIRECT --to-ports 53 2>/dev/null; do :; done
    done
}

# Helper to execute iptables and log errors
ipt_apply() {
    if ! iptables "$@"; then
        logger -t runet-fix "Failed to apply iptables rule: $*" 2>/dev/null || echo "[runet-fix] Error applying iptables $*" >&2
        return 1
    fi
    return 0
}

validate_ip_or_cidr() {
    local val="$1"
    [ -z "$val" ] && return 1
    case "$val" in
        *[!0-9./]*|*..*|*//*|"") return 1 ;;
    esac
    local ip_part="${val%/*}"
    local cidr_part=""
    if [ "$ip_part" != "$val" ]; then
        cidr_part="${val#*/}"
        case "$cidr_part" in
            ""|*[!0-9]*) return 1 ;;
        esac
        [ "$cidr_part" -ge 0 ] 2>/dev/null && [ "$cidr_part" -le 32 ] 2>/dev/null || return 1
    fi
    local o1 o2 o3 o4 old_ifs
    old_ifs=$IFS
    IFS=.
    # shellcheck disable=SC2086
    set -- $ip_part
    IFS=$old_ifs
    [ "$#" -eq 4 ] || return 1
    o1=$1
    o2=$2
    o3=$3
    o4=$4
    [ -n "$o1" ] && [ -n "$o2" ] && [ -n "$o3" ] && [ -n "$o4" ] || return 1
    [ "$o1" -ge 0 ] 2>/dev/null && [ "$o1" -le 255 ] 2>/dev/null || return 1
    [ "$o2" -ge 0 ] 2>/dev/null && [ "$o2" -le 255 ] 2>/dev/null || return 1
    [ "$o3" -ge 0 ] 2>/dev/null && [ "$o3" -le 255 ] 2>/dev/null || return 1
    [ "$o4" -ge 0 ] 2>/dev/null && [ "$o4" -le 255 ] 2>/dev/null || return 1
    return 0
}

validate_mac() {
    local val="$1"
    [ -z "$val" ] && return 1
    echo "$val" | grep -Eiq '^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$' || return 1
    return 0
}

filter_exclusions() {
    local raw_ips="$1"
    local raw_macs="$2"
    valid_excl_ips=""
    valid_excl_macs=""

    for item in $raw_ips; do
        item=$(echo "$item" | tr -d '", \t\r\n')
        [ -z "$item" ] && continue
        if validate_ip_or_cidr "$item"; then
            valid_excl_ips="$valid_excl_ips $item"
        else
            logger -t runet-fix "Dropping invalid excluded IP/CIDR: '$item'" 2>/dev/null
            echo "[runet-fix] Warning: Dropping invalid excluded IP/CIDR: '$item'" >&2
        fi
    done
    valid_excl_ips="${valid_excl_ips# }"

    for item in $raw_macs; do
        item=$(echo "$item" | tr -d '", \t\r\n')
        [ -z "$item" ] && continue
        if validate_mac "$item"; then
            valid_excl_macs="$valid_excl_macs $(echo "$item" | tr 'A-Z' 'a-z')"
        else
            logger -t runet-fix "Dropping invalid excluded MAC: '$item'" 2>/dev/null
            echo "[runet-fix] Warning: Dropping invalid excluded MAC: '$item'" >&2
        fi
    done
    valid_excl_macs="${valid_excl_macs# }"
}

# Determine firewall implementation
is_fw4() {
    command -v nft >/dev/null 2>&1 && { [ -f /etc/nftables.d/README ] || [ -f /usr/share/firewall4/main.nft ]; }
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
    local QNUM=$(get_qnum)
    local tg_enabled=$(uci -q get runet-fix.telegram.enabled)
    [ -z "$tg_enabled" ] && tg_enabled="1" 
    local tg_port
    tg_port=$(get_tg_port)
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

    local nft_iif game_ports quic_rule
    nft_iif=$(nft_iif_match)
    game_ports=$(sanitize_port_list "$(uci -q get runet-fix.zapret.game_udp_ports)" "27015-27050,7777-7780")
    if [ "$(quic_mode)" = "queue" ]; then
        quic_rule="udp dport 443 ct original packets < 10 counter queue num $QNUM bypass"
    else
        quic_rule="udp dport 443 counter reject"
    fi

    local NFT_CONF="/tmp/runet-fix-nft.conf"
    # destroy and recreate belong to one nft -f transaction. A bad file rolls
    # back and leaves the previous table in place. destroy is a no-op if the
    # table does not exist yet (nftables 1.0+, fw4).
    cat << EOF_HDR > "$NFT_CONF"
destroy table inet $TABLE_NAME
table inet $TABLE_NAME {
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
    filter_exclusions "$excl_ips" "$excl_macs"

    local has_excl_ips=0
    if [ -n "$valid_excl_ips" ]; then
        echo "    set excluded_ips { type ipv4_addr; flags interval; elements = { $(echo $valid_excl_ips | sed 's/ /, /g') } }" >> "$NFT_CONF"
        has_excl_ips=1
        echo "[runet-fix] Device bypass active for IPs: $valid_excl_ips"
    fi

    local has_excl_macs=0
    if [ -n "$valid_excl_macs" ]; then
        echo "    set excluded_macs { type ether_addr; elements = { $(echo $valid_excl_macs | sed 's/ /, /g') } }" >> "$NFT_CONF"
        has_excl_macs=1
        echo "[runet-fix] Device bypass active for MACs: $valid_excl_macs"
    fi

    # Telegram Transparent Redirection (NAT PREROUTING & NAT OUTPUT) & IPv6 Leak Prevention
    if [ "$tg_enabled" = "1" ]; then
        cat << EOF_TG >> "$NFT_CONF"
    chain tg_nat_pre {
        type nat hook prerouting priority dstnat; policy accept;
$([ "$has_excl_ips" = "1" ] && echo "        ip saddr @excluded_ips return")
$([ "$has_excl_macs" = "1" ] && echo "        ether saddr @excluded_macs return")
        $nft_iif ip daddr @telegram_v4 tcp dport { 80, 443, 5222, 8443 } counter redirect to :$tg_port
    }
    chain tg_nat_out {
        type nat hook output priority dstnat; policy accept;
        mark 0x40000000 return
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
        ip6 daddr fe80::/10 return
        ip6 daddr fc00::/7 return
        $nft_iif tcp dport { $tcp_ports } ct original packets < 20 counter queue num $QNUM bypass
$([ "$discord_fix" = "1" ] && echo "        $nft_iif udp dport { 19294-19344, 50000-50100 } ct original packets < 10 counter queue num $QNUM bypass")
$([ "$game_fix" = "1" ] && echo "        $nft_iif udp dport { $game_ports } ct original packets < 10 counter queue num $QNUM bypass")
        $nft_iif $quic_rule
    }
    chain zapret_mangle_out {
        type filter hook output priority mangle; policy accept;
        mark 0x40000000 return
        ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8 } return
        ip6 daddr fe80::/10 return
        ip6 daddr fc00::/7 return
$([ "$tg_enabled" = "1" ] && echo "        ip daddr @telegram_v4 return")
        tcp dport { 80, 443 } ct original packets < 20 counter queue num $QNUM bypass
    }
EOF_ZP
        echo "[runet-fix] Zapret NFQUEUE ($QNUM) active (Forward + Output)"
    fi

    # Port 53 DNS redirection (forces all clients through dnsmasq)
    if [ "$adb_enabled" = "1" ]; then
        cat << EOF_DNS >> "$NFT_CONF"
    chain dns_nat_pre {
        type nat hook prerouting priority dstnat; policy accept;
        $nft_iif udp dport 53 counter redirect to :53
        $nft_iif tcp dport 53 counter redirect to :53
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
    local tg_port
    tg_port=$(get_tg_port)
    local discord_fix=$(uci -q get runet-fix.zapret.discord_fix || echo "1")
    local game_fix=$(uci -q get runet-fix.zapret.game_fix || echo "0")
    local excl_ips=$(uci -q get runet-fix.zapret.excluded_ips)
    local excl_macs=$(uci -q get runet-fix.zapret.excluded_macs)
    filter_exclusions "$excl_ips" "$excl_macs"
    local QNUM=$(get_qnum)

    if [ "$zapret_enabled" != "1" ] && [ "$tg_enabled" != "1" ]; then
        echo "[runet-fix] Both Zapret and Telegram disabled. Firewall rules cleaned."
        return 0
    fi

    echo "[runet-fix] Applying iptables rules (fw3)..."

    # Create ipset for telegram
    ipset create tg_subnets hash:net -exist 2>/dev/null || true
    for net in $TELEGRAM_SUBNETS; do
        ipset add tg_subnets $net -exist 2>/dev/null || true
    done

    # Telegram Redirect (PREROUTING for LAN and OUTPUT for local router traffic)
    if [ "$tg_enabled" = "1" ]; then
        iptables -t nat -N RUNET_TG 2>/dev/null || iptables -t nat -F RUNET_TG
        iptables -t nat -N RUNET_TG_OUT 2>/dev/null || iptables -t nat -F RUNET_TG_OUT

        while iptables -t nat -D OUTPUT -m set --match-set tg_subnets dst -j RUNET_TG_OUT 2>/dev/null; do :; done

        for mac in $valid_excl_macs; do
            ipt_apply -t nat -A RUNET_TG -m mac --mac-source "$mac" -j RETURN
        done
        for ip in $valid_excl_ips; do
            ipt_apply -t nat -A RUNET_TG -s "$ip" -j RETURN
        done
        ipt_apply -t nat -A RUNET_TG -p tcp -m multiport --dports 80,443,5222,8443 -j REDIRECT --to-ports "$tg_port"
        for iface in $(lan_iface_list); do
            ipt_apply -t nat -I PREROUTING -i "$iface" -m set --match-set tg_subnets dst -j RUNET_TG
        done

        # Router local Telegram traffic proxying (RUNET_TG_OUT)
        ipt_apply -t nat -A RUNET_TG_OUT -m mark --mark 0x40000000 -j RETURN
        ipt_apply -t nat -A RUNET_TG_OUT -p tcp -m multiport --dports 80,443,5222,8443 -j REDIRECT --to-ports "$tg_port"
        ipt_apply -t nat -I OUTPUT -m set --match-set tg_subnets dst -j RUNET_TG_OUT

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
        iptables -t mangle -N RUNET_ZAPRET_OUT 2>/dev/null || iptables -t mangle -F RUNET_ZAPRET_OUT

        # FORWARD chain rules (RUNET_ZAPRET)
        for mac in $valid_excl_macs; do
            ipt_apply -t mangle -A RUNET_ZAPRET -m mac --mac-source "$mac" -j RETURN
        done
        for ip in $valid_excl_ips; do
            ipt_apply -t mangle -A RUNET_ZAPRET -s "$ip" -j RETURN
        done
        if [ "$tg_enabled" = "1" ]; then
            ipt_apply -t mangle -A RUNET_ZAPRET -m set --match-set tg_subnets dst -j RETURN
        fi
        for cidr in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 127.0.0.0/8; do
            ipt_apply -t mangle -A RUNET_ZAPRET -d "$cidr" -j RETURN
        done
        local tcp_ports="80,443"
        if [ "$discord_fix" = "1" ]; then
            tcp_ports="80,443,2053,2083,2087,2096,8443"
        fi
        ipt_apply -t mangle -A RUNET_ZAPRET -p tcp -m multiport --dports $tcp_ports -m connbytes --connbytes 1:20 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
        if [ "$discord_fix" = "1" ]; then
            ipt_apply -t mangle -A RUNET_ZAPRET -p udp --dport 50000:50100 -m connbytes --connbytes 1:10 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
            ipt_apply -t mangle -A RUNET_ZAPRET -p udp --dport 19294:19344 -m connbytes --connbytes 1:10 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
        fi
        if [ "$game_fix" = "1" ]; then
            local game_ports spec dport old_ifs
            game_ports=$(sanitize_port_list "$(uci -q get runet-fix.zapret.game_udp_ports)" "27015-27050,7777-7780")
            old_ifs=$IFS
            IFS=,
            for spec in $game_ports; do
                dport=$(printf '%s' "$spec" | tr '-' ':')
                ipt_apply -t mangle -A RUNET_ZAPRET -p udp --dport "$dport" -m connbytes --connbytes 1:10 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
            done
            IFS=$old_ifs
        fi
        if [ "$(quic_mode)" = "queue" ]; then
            ipt_apply -t mangle -A RUNET_ZAPRET -p udp --dport 443 -m connbytes --connbytes 1:10 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
        else
            ipt_apply -t mangle -A RUNET_ZAPRET -p udp --dport 443 -j DROP
        fi
        for iface in $(lan_iface_list); do
            ipt_apply -t mangle -I FORWARD -i "$iface" -j RUNET_ZAPRET
        done

        # OUTPUT chain rules (RUNET_ZAPRET_OUT, mirrors zapret_mangle_out in nft)
        ipt_apply -t mangle -A RUNET_ZAPRET_OUT -m mark --mark 0x40000000 -j RETURN
        for cidr in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 127.0.0.0/8; do
            ipt_apply -t mangle -A RUNET_ZAPRET_OUT -d "$cidr" -j RETURN
        done
        if [ "$tg_enabled" = "1" ]; then
            ipt_apply -t mangle -A RUNET_ZAPRET_OUT -m set --match-set tg_subnets dst -j RETURN
        fi
        ipt_apply -t mangle -A RUNET_ZAPRET_OUT -p tcp -m multiport --dports 80,443 -m connbytes --connbytes 1:20 --connbytes-dir original --connbytes-mode packets -j NFQUEUE --queue-num $QNUM --queue-bypass
        ipt_apply -t mangle -I OUTPUT -j RUNET_ZAPRET_OUT
    fi

    # DNS Redirection (port 53)
    local adb_enabled=$(uci -q get runet-fix.adblock.enabled || echo "1")
    if [ "$adb_enabled" = "1" ]; then
        for iface in $(lan_iface_list); do
            ipt_apply -t nat -A PREROUTING -i "$iface" -p udp --dport 53 -j REDIRECT --to-ports 53
            ipt_apply -t nat -A PREROUTING -i "$iface" -p tcp --dport 53 -j REDIRECT --to-ports 53
        done
    fi
}

stop_ipt() {
    echo "[runet-fix] Flushing iptables rules..."
    clear_forwarded_hooks
    while iptables -t nat -D OUTPUT -m set --match-set tg_subnets dst -j RUNET_TG_OUT 2>/dev/null; do :; done
    iptables -t nat -F RUNET_TG 2>/dev/null || true
    iptables -t nat -X RUNET_TG 2>/dev/null || true
    iptables -t nat -F RUNET_TG_OUT 2>/dev/null || true
    iptables -t nat -X RUNET_TG_OUT 2>/dev/null || true

    iptables -t mangle -D FORWARD -j RUNET_ZAPRET 2>/dev/null || true
    iptables -t mangle -D OUTPUT -j RUNET_ZAPRET 2>/dev/null || true
    iptables -t mangle -F RUNET_ZAPRET 2>/dev/null || true
    iptables -t mangle -X RUNET_ZAPRET 2>/dev/null || true

    iptables -t mangle -D OUTPUT -j RUNET_ZAPRET_OUT 2>/dev/null || true
    iptables -t mangle -F RUNET_ZAPRET_OUT 2>/dev/null || true
    iptables -t mangle -X RUNET_ZAPRET_OUT 2>/dev/null || true

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
        qnum=$(get_qnum)
        q_status="inactive"
        if grep -qw "$qnum" /proc/net/netfilter/nfnetlink_queue 2>/dev/null; then
            q_status="active"
        fi
        echo "Zapret QNUM: $qnum (queue $q_status)"
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

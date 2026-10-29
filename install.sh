#!/bin/sh
# install.sh - Automated installer for runet-fix on running OpenWrt routers
# Usage via SSH: sh -c "$(curl -fsSL https://raw.githubusercontent.com/.../install.sh)"

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "${BLUE}======================================================${NC}"
echo "${BLUE}       RUNET-FIX ALL-IN-ONE OPENWRT INSTALLER        ${NC}"
echo "${BLUE} Zapret (DPI) + Transparent Telegram WS + Smart Adblock ${NC}"
echo "${BLUE}======================================================${NC}"

# Check root privileges
if [ "$(id -u)" != "0" ]; then
    echo "${RED}Error: This script must be run as root on the router.${NC}"
    exit 1
fi

# Detect architecture
ARCH=$(opkg print-architecture | awk 'NR==1{print $2}' 2>/dev/null || uname -m)
echo "${YELLOW}Detected architecture: $ARCH${NC}"

# Check firewall version
if command -v nft >/dev/null 2>&1; then
    echo "${GREEN}Detected Firewall 4 (nftables)${NC}"
    FW_PKGS="kmod-nft-queue"
else
    echo "${YELLOW}Detected Firewall 3 (iptables)${NC}"
    FW_PKGS="iptables-mod-nfqueue kmod-ipt-nfqueue"
fi

echo "${YELLOW}[1/5] Updating opkg package lists...${NC}"
opkg update || true

echo "${YELLOW}[2/5] Installing prerequisite kernel modules and tools...${NC}"
opkg install ipset curl ca-bundle $FW_PKGS || true

# Optional python or native binary support
if ! command -v python3 >/dev/null 2>&1 && [ ! -f /usr/bin/tg-transproxy ]; then
    echo "${YELLOW}Installing lightweight Python 3 for Telegram WS proxy...${NC}"
    opkg install python3-base python3-asyncio python3-ssl || true
fi

echo "${YELLOW}[3/5] Setting up directory structure...${NC}"
mkdir -p /usr/share/runet-fix/scripts
mkdir -p /usr/share/runet-fix/lists
mkdir -p /usr/share/luci/menu.d
mkdir -p /usr/share/rpcd/acl.d
mkdir -p /www/luci-static/resources/view/runet-fix
mkdir -p /etc/config
mkdir -p /tmp/dnsmasq.d

# If running from local clone, copy files directly
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$REPO_DIR/files" ]; then
    echo "${GREEN}Installing from local repository files...${NC}"
    cp -r "$REPO_DIR/files/usr/bin/"* /usr/bin/ 2>/dev/null || true
    cp -r "$REPO_DIR/files/usr/share/runet-fix/"* /usr/share/runet-fix/
    cp -r "$REPO_DIR/files/usr/share/luci/menu.d/"* /usr/share/luci/menu.d/
    cp -r "$REPO_DIR/files/usr/share/rpcd/acl.d/"* /usr/share/rpcd/acl.d/
    cp -r "$REPO_DIR/files/www/luci-static/resources/view/runet-fix/"* /www/luci-static/resources/view/runet-fix/
    cp -r "$REPO_DIR/files/etc/init.d/runet-fix" /etc/init.d/
    [ -f /etc/config/runet-fix ] || cp "$REPO_DIR/files/etc/config/runet-fix" /etc/config/
fi

echo "${YELLOW}[4/5] Checking for Zapret nfqws binary...${NC}"
if ! command -v nfqws >/dev/null 2>&1 && [ ! -f /opt/zapret/nfq/nfqws ]; then
    echo "${YELLOW}Zapret binary not found. Installing standalone zapret...${NC}"
    mkdir -p /opt/zapret/nfq
    # Fetch architecture appropriate nfqws binary from bol-van zapret repository
    ZAPRET_URL="https://github.com/bol-van/zapret/raw/master/binaries"
    case "$ARCH" in
        mips_24kc|mips)
            curl -s -L -k "$ZAPRET_URL/mips/nfqws" -o /opt/zapret/nfq/nfqws || true
            ;;
        mipsel_24kc|mipsel)
            curl -s -L -k "$ZAPRET_URL/mipsle/nfqws" -o /opt/zapret/nfq/nfqws || true
            ;;
        aarch64_cortex-a53|aarch64)
            curl -s -L -k "$ZAPRET_URL/aarch64/nfqws" -o /opt/zapret/nfq/nfqws || true
            ;;
        arm_cortex-a7*|arm_cortex-a9*|arm)
            curl -s -L -k "$ZAPRET_URL/armhf/nfqws" -o /opt/zapret/nfq/nfqws || true
            ;;
        x86_64)
            curl -s -L -k "$ZAPRET_URL/x86_64/nfqws" -o /opt/zapret/nfq/nfqws || true
            ;;
    esac
    chmod +x /opt/zapret/nfq/nfqws 2>/dev/null || true
fi

echo "${YELLOW}[5/5] Activating services and configuring permissions...${NC}"
chmod +x /usr/bin/runet-fix
chmod +x /usr/share/runet-fix/scripts/*
chmod +x /usr/share/runet-fix/tg_ws_proxy/main.py 2>/dev/null || true
chmod +x /etc/init.d/runet-fix

# Run uci-defaults to refresh LuCI cache
rm -f /tmp/luci-indexcache
killall -HUP rpcd 2>/dev/null || true

/etc/init.d/runet-fix enable
/etc/init.d/runet-fix restart

echo "${GREEN}======================================================${NC}"
echo "${GREEN}         INSTALLATION COMPLETED SUCCESSFULLY!         ${NC}"
echo "${GREEN}======================================================${NC}"
echo ""
echo "Open the LuCI web interface in your browser:"
echo "  -> Services -> Runet Fix"
echo ""
echo "Or check status from CLI:"
echo "  # runet-fix status"
echo "  # runet-fix test"
echo ""

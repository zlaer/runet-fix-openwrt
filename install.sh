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

# Package manager abstraction (supports OpenWrt opkg and modern OpenWrt apk)
pkg_update() {
    if command -v apk >/dev/null 2>&1; then
        apk update || true
    elif command -v opkg >/dev/null 2>&1; then
        opkg update || true
    fi
}

pkg_install() {
    if command -v apk >/dev/null 2>&1; then
        apk add "$@" || true
    elif command -v opkg >/dev/null 2>&1; then
        opkg install "$@" || true
    fi
}

# Detect architecture reliably across all OpenWrt releases
ARCH=""
if [ -f /etc/openwrt_release ]; then
    . /etc/openwrt_release
    ARCH="$DISTRIB_ARCH"
fi
[ -z "$ARCH" ] && ARCH=$(uname -m 2>/dev/null || echo "unknown")
echo "${YELLOW}Detected architecture: $ARCH${NC}"

# Check firewall version
if command -v nft >/dev/null 2>&1; then
    echo "${GREEN}Detected Firewall 4 (nftables)${NC}"
    FW_PKGS="kmod-nft-queue"
else
    echo "${YELLOW}Detected Firewall 3 (iptables)${NC}"
    FW_PKGS="iptables-mod-nfqueue kmod-ipt-nfqueue"
fi

echo "${YELLOW}[1/5] Updating package manager lists...${NC}"
pkg_update

echo "${YELLOW}[2/5] Installing prerequisite kernel modules and tools...${NC}"
pkg_install ipset curl ca-bundle $FW_PKGS

# Optional python or native binary support
if ! command -v python3 >/dev/null 2>&1 && [ ! -f /usr/bin/tg-transproxy ] && [ ! -f /usr/bin/tg-ws-proxy ]; then
    echo "${YELLOW}Installing lightweight Python 3 for Telegram WS proxy fallback...${NC}"
    pkg_install python3-base python3-asyncio python3-ssl
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
    [ -f "$REPO_DIR/version" ] && cp "$REPO_DIR/version" /usr/share/runet-fix/version
    [ -f /etc/config/runet-fix ] || cp "$REPO_DIR/files/etc/config/runet-fix" /etc/config/
else
    echo "${YELLOW}Downloading repository archive from GitHub (master branch)...${NC}"
    TMP_INSTALL="/tmp/runet-fix-install"
    rm -rf "$TMP_INSTALL"
    mkdir -p "$TMP_INSTALL"
    if curl -s -k -L "https://github.com/zlaer/runet-fix-openwrt/archive/refs/heads/master.tar.gz" -o "$TMP_INSTALL/master.tar.gz"; then
        tar -xzf "$TMP_INSTALL/master.tar.gz" -C "$TMP_INSTALL/"
        SRC=$(find "$TMP_INSTALL" -maxdepth 1 -type d -name "runet-fix-openwrt*" | head -n 1)
        if [ -n "$SRC" ] && [ -d "$SRC/files" ]; then
            cp -r "$SRC/files/usr/bin/"* /usr/bin/ 2>/dev/null || true
            cp -r "$SRC/files/usr/share/runet-fix/"* /usr/share/runet-fix/
            cp -r "$SRC/files/usr/share/luci/menu.d/"* /usr/share/luci/menu.d/
            cp -r "$SRC/files/usr/share/rpcd/acl.d/"* /usr/share/rpcd/acl.d/
            cp -r "$SRC/files/www/luci-static/resources/view/runet-fix/"* /www/luci-static/resources/view/runet-fix/
            cp -r "$SRC/files/etc/init.d/runet-fix" /etc/init.d/
            [ -f "$SRC/version" ] && cp "$SRC/version" /usr/share/runet-fix/version
            [ -f /etc/config/runet-fix ] || cp "$SRC/files/etc/config/runet-fix" /etc/config/
        fi
    fi
    rm -rf "$TMP_INSTALL"
fi

echo "${YELLOW}[4/5] Checking for Zapret nfqws and Telegram proxy binaries...${NC}"
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

# Multi-arch Telegram native proxy setup
TG_BIN_URL="https://raw.githubusercontent.com/zlaer/runet-fix-openwrt/master/prebuilt"
TG_ARCH=""
case "$ARCH" in
    aarch64*|arm64)
        TG_ARCH="aarch64"
        ;;
    arm_cortex*|armhf|armv7*)
        TG_ARCH="armv7"
        ;;
    x86_64|amd64)
        TG_ARCH="x86_64"
        ;;
esac

if [ -n "$TG_ARCH" ]; then
    if [ -f "$REPO_DIR/prebuilt/tg-ws-proxy-$TG_ARCH" ]; then
        echo "Installing native tg-ws-proxy-$TG_ARCH from local repo..."
        cp "$REPO_DIR/prebuilt/tg-ws-proxy-$TG_ARCH" /usr/bin/tg-ws-proxy
    elif [ -n "$SRC" ] && [ -f "$SRC/prebuilt/tg-ws-proxy-$TG_ARCH" ]; then
        echo "Installing native tg-ws-proxy-$TG_ARCH from package archive..."
        cp "$SRC/prebuilt/tg-ws-proxy-$TG_ARCH" /usr/bin/tg-ws-proxy
    else
        echo "Downloading native tg-ws-proxy for $TG_ARCH..."
        curl -s -L -k "$TG_BIN_URL/tg-ws-proxy-$TG_ARCH" -o /usr/bin/tg-ws-proxy || true
    fi
    chmod +x /usr/bin/tg-ws-proxy 2>/dev/null || true
fi

# Verify binary runs on this hardware; if not, remove so system falls back gracefully to Python 3
if [ -f /usr/bin/tg-ws-proxy ]; then
    if /usr/bin/tg-ws-proxy --help >/dev/null 2>&1; then
        echo "${GREEN}Native Rust Telegram proxy (tg-ws-proxy) verified successfully (<2.5MB RAM).${NC}"
        # Clean up legacy Python files to conserve router flash storage
        rm -rf /usr/share/runet-fix/tg_ws_proxy 2>/dev/null || true
    else
        echo "${YELLOW}Native tg-ws-proxy is not compatible with this CPU architecture, falling back to Python 3.${NC}"
        rm -f /usr/bin/tg-ws-proxy
    fi
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

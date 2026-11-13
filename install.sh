#!/bin/sh
# install.sh - Automated installer for runet-fix on running OpenWrt routers
# Usage via SSH: sh -c "$(curl -fsSL https://raw.githubusercontent.com/.../install.sh)"

set -e

# Initialize state variables
SRC=""
TMP_INSTALL=""
TMP_SUMS=""

cleanup() {
    [ -n "$TMP_INSTALL" ] && [ -d "$TMP_INSTALL" ] && rm -rf "$TMP_INSTALL"
    [ -n "$TMP_SUMS" ] && [ -f "$TMP_SUMS" ] && rm -f "$TMP_SUMS"
}
trap cleanup EXIT INT TERM

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

# Ensure at least one download tool is present before starting
if ! command -v curl >/dev/null 2>&1 && ! command -v uclient-fetch >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    echo "${RED}Error: Neither curl, uclient-fetch, nor wget found. Cannot proceed.${NC}" >&2
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

# Safe TLS download verifying certificates
safe_download() {
    local url="$1"
    local output="$2"
    if command -v curl >/dev/null 2>&1; then
        if curl -s -f -L --connect-timeout 8 "$url" -o "$output"; then
            return 0
        fi
    elif command -v uclient-fetch >/dev/null 2>&1; then
        if uclient-fetch -q --timeout=8 "$url" -O "$output"; then
            return 0
        fi
    elif command -v wget >/dev/null 2>&1; then
        if wget -q -T 8 "$url" -O "$output"; then
            return 0
        fi
    fi
    echo "${RED}Error: Failed to securely download $url via TLS.${NC}" >&2
    echo "${YELLOW}Hint: If TLS verification fails, please update certificates or check system time:${NC}" >&2
    echo "  opkg update && opkg install ca-bundle ca-certificates" >&2
    return 1
}

# Verify file against SHA256 checksum
verify_sha256() {
    local file="$1"
    local expected_hash="$2"
    [ -z "$expected_hash" ] && return 0
    if command -v sha256sum >/dev/null 2>&1; then
        local actual_hash=$(sha256sum "$file" | awk '{print $1}')
        if [ "$actual_hash" != "$expected_hash" ]; then
            echo "${RED}Security Warning: SHA256 verification failed for $file!${NC}" >&2
            echo "Expected: $expected_hash" >&2
            echo "Actual:   $actual_hash" >&2
            return 1
        fi
    fi
    return 0
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

# Ensure curl is available after package installation
if ! command -v curl >/dev/null 2>&1; then
    echo "${RED}Error: 'curl' is required but could not be installed.${NC}" >&2
    echo "${YELLOW}Please check network/repositories and install curl manually: opkg update && opkg install curl${NC}" >&2
    exit 1
fi

# Optional python or native binary support
if ! command -v python3 >/dev/null 2>&1 && [ ! -f /usr/bin/runet-fix-core ] && [ ! -f /usr/bin/tg-ws-proxy ]; then
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
    TMP_INSTALL=$(mktemp -d /tmp/runet-fix-install.XXXXXX 2>/dev/null || echo "/tmp/runet-fix-install")
    rm -rf "$TMP_INSTALL"
    mkdir -p "$TMP_INSTALL"
    if safe_download "https://github.com/zlaer/runet-fix-openwrt/archive/refs/heads/master.tar.gz" "$TMP_INSTALL/master.tar.gz"; then
        tar -xzf "$TMP_INSTALL/master.tar.gz" -C "$TMP_INSTALL/"
        SRC=$(find "$TMP_INSTALL" -maxdepth 1 -type d -name "runet-fix-openwrt*" | head -n 1)
        if [ -n "$SRC" ] && [ -d "$SRC/files" ] && [ -d "$SRC/files/usr/share/runet-fix" ] && [ -f "$SRC/files/etc/init.d/runet-fix" ]; then
            cp -r "$SRC/files/usr/bin/"* /usr/bin/ 2>/dev/null || true
            cp -r "$SRC/files/usr/share/runet-fix/"* /usr/share/runet-fix/
            cp -r "$SRC/files/usr/share/luci/menu.d/"* /usr/share/luci/menu.d/
            cp -r "$SRC/files/usr/share/rpcd/acl.d/"* /usr/share/rpcd/acl.d/
            cp -r "$SRC/files/www/luci-static/resources/view/runet-fix/"* /www/luci-static/resources/view/runet-fix/
            cp -r "$SRC/files/etc/init.d/runet-fix" /etc/init.d/
            [ -f "$SRC/version" ] && cp "$SRC/version" /usr/share/runet-fix/version
            [ -f /etc/config/runet-fix ] || cp "$SRC/files/etc/config/runet-fix" /etc/config/
        else
            echo "${RED}Error: Downloaded package structure is invalid or files are missing!${NC}" >&2
            exit 1
        fi
    else
        echo "${RED}Error: Failed to download repository archive!${NC}" >&2
        exit 1
    fi
fi

echo "${YELLOW}[4/5] Checking for Zapret nfqws and Telegram proxy binaries...${NC}"
if ! command -v nfqws >/dev/null 2>&1 && [ ! -f /opt/zapret/nfq/nfqws ]; then
    echo "${YELLOW}Zapret binary not found. Installing standalone zapret...${NC}"
    mkdir -p /opt/zapret/nfq
    # Fetch architecture appropriate nfqws binary from bol-van zapret repository
    ZAPRET_URL="https://github.com/bol-van/zapret/raw/master/binaries"
    case "$ARCH" in
        mips_24kc|mips)
            curl -s -f -L "$ZAPRET_URL/mips/nfqws" -o /opt/zapret/nfq/nfqws || true
            ;;
        mipsel_24kc|mipsel)
            curl -s -f -L "$ZAPRET_URL/mipsle/nfqws" -o /opt/zapret/nfq/nfqws || true
            ;;
        aarch64_cortex-a53|aarch64)
            curl -s -f -L "$ZAPRET_URL/aarch64/nfqws" -o /opt/zapret/nfq/nfqws || true
            ;;
        arm_cortex-a7*|arm_cortex-a9*|arm)
            curl -s -f -L "$ZAPRET_URL/armhf/nfqws" -o /opt/zapret/nfq/nfqws || true
            ;;
        x86_64)
            curl -s -f -L "$ZAPRET_URL/x86_64/nfqws" -o /opt/zapret/nfq/nfqws || true
            ;;
    esac
    # Only accept a non-empty ELF binary; never chmod an HTML error page.
    if [ -s /opt/zapret/nfq/nfqws ] && [ "$(head -c 4 /opt/zapret/nfq/nfqws | od -An -tx1 | tr -d ' \n')" = "7f454c46" ]; then
        chmod +x /opt/zapret/nfq/nfqws 2>/dev/null || true
        touch /opt/zapret/.runet-fix-managed 2>/dev/null || true
    else
        rm -f /opt/zapret/nfq/nfqws
        echo "${YELLOW}Warning: nfqws download failed or returned invalid data; skipping.${NC}" >&2
    fi
fi

# Multi-arch Telegram and Rust Core setup
RELEASE_BIN_URL="https://github.com/zlaer/runet-fix-openwrt/releases/latest/download"
FALLBACK_BIN_URL="https://raw.githubusercontent.com/zlaer/runet-fix-openwrt/master/prebuilt"
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
    INSTALLED_CORE=0
    USED_RELEASE=0
    if [ -f "$REPO_DIR/prebuilt/runet-fix-$TG_ARCH" ]; then
        echo "Installing native runet-fix-$TG_ARCH from local repo..."
        cp "$REPO_DIR/prebuilt/runet-fix-$TG_ARCH" /usr/bin/runet-fix-core
        INSTALLED_CORE=1
    elif [ -f "$REPO_DIR/prebuilt/tg-ws-proxy-$TG_ARCH" ]; then
        echo "Installing native tg-ws-proxy-$TG_ARCH from local repo..."
        cp "$REPO_DIR/prebuilt/tg-ws-proxy-$TG_ARCH" /usr/bin/runet-fix-core
        INSTALLED_CORE=1
    elif [ -n "$SRC" ] && [ -f "$SRC/prebuilt/runet-fix-$TG_ARCH" ]; then
        echo "Installing native runet-fix-$TG_ARCH from package archive..."
        cp "$SRC/prebuilt/runet-fix-$TG_ARCH" /usr/bin/runet-fix-core
        INSTALLED_CORE=1
    elif [ -n "$SRC" ] && [ -f "$SRC/prebuilt/tg-ws-proxy-$TG_ARCH" ]; then
        echo "Installing native tg-ws-proxy-$TG_ARCH from package archive..."
        cp "$SRC/prebuilt/tg-ws-proxy-$TG_ARCH" /usr/bin/runet-fix-core
        INSTALLED_CORE=1
    else
        echo "Downloading native runet-fix-core for $TG_ARCH from latest release..."
        if safe_download "$RELEASE_BIN_URL/runet-fix-$TG_ARCH" /usr/bin/runet-fix-core; then
            INSTALLED_CORE=1
            USED_RELEASE=1
        else
            echo "${YELLOW}Release artifact not found; falling back to master branch prebuilt...${NC}"
            if safe_download "$FALLBACK_BIN_URL/runet-fix-$TG_ARCH" /usr/bin/runet-fix-core; then
                INSTALLED_CORE=1
                USED_RELEASE=0
            elif safe_download "$FALLBACK_BIN_URL/tg-ws-proxy-$TG_ARCH" /usr/bin/runet-fix-core; then
                INSTALLED_CORE=1
                USED_RELEASE=0
            fi
        fi
    fi

    if [ "$INSTALLED_CORE" = "1" ] && [ -f /usr/bin/runet-fix-core ]; then
        # Check against SHA256SUMS if present
        sum_file=""
        if [ -f "$REPO_DIR/prebuilt/SHA256SUMS" ]; then
            sum_file="$REPO_DIR/prebuilt/SHA256SUMS"
        elif [ -n "$SRC" ] && [ -f "$SRC/prebuilt/SHA256SUMS" ]; then
            sum_file="$SRC/prebuilt/SHA256SUMS"
        else
            # Downloaded core: fetch the matching checksum list from release or master.
            TMP_SUMS=$(mktemp /tmp/runet-fix-sums.XXXXXX 2>/dev/null || echo "/tmp/runet-fix-sums")
            sum_file="$TMP_SUMS"
            if [ "$USED_RELEASE" = "1" ]; then
                if ! safe_download "$RELEASE_BIN_URL/SHA256SUMS" "$sum_file"; then
                    safe_download "$FALLBACK_BIN_URL/SHA256SUMS" "$sum_file" || sum_file=""
                fi
            else
                safe_download "$FALLBACK_BIN_URL/SHA256SUMS" "$sum_file" || sum_file=""
            fi
        fi
        if [ -n "$sum_file" ] && [ -f "$sum_file" ]; then
            exp_hash=$(grep "runet-fix-$TG_ARCH" "$sum_file" 2>/dev/null | awk '{print $1}')
            [ -z "$exp_hash" ] && exp_hash=$(grep "tg-ws-proxy-$TG_ARCH" "$sum_file" 2>/dev/null | awk '{print $1}')
            if [ -n "$exp_hash" ]; then
                if ! verify_sha256 /usr/bin/runet-fix-core "$exp_hash"; then
                    echo "${RED}Integrity check failed: checksum mismatch for /usr/bin/runet-fix-core! Installation aborted.${NC}" >&2
                    rm -f /usr/bin/runet-fix-core /usr/bin/tg-ws-proxy
                    exit 1
                fi
            fi
        fi
        chmod +x /usr/bin/runet-fix-core 2>/dev/null || true
        ln -sf /usr/bin/runet-fix-core /usr/bin/tg-ws-proxy
    fi
fi

# Verify binary runs on this hardware; if not, remove so system falls back gracefully to Python 3
if [ -f /usr/bin/runet-fix-core ]; then
    if /usr/bin/runet-fix-core --help >/dev/null 2>&1; then
        echo "${GREEN}Native Rust Runet-Fix Core (runet-fix-core) verified successfully (<2.5MB RAM).${NC}"
        # Clean up legacy Python files to conserve router flash storage
        rm -rf /usr/share/runet-fix/tg_ws_proxy 2>/dev/null || true
    else
        echo "${YELLOW}Native binary is not compatible with this CPU architecture, falling back to Python 3 / shell.${NC}"
        rm -f /usr/bin/runet-fix-core /usr/bin/tg-ws-proxy
    fi
fi

echo "${YELLOW}[5/5] Activating services and configuring permissions...${NC}"
chmod +x /usr/bin/runet-fix
chmod +x /usr/share/runet-fix/scripts/*
chmod +x /usr/share/runet-fix/tg_ws_proxy/main.py 2>/dev/null || true
chmod +x /etc/init.d/runet-fix
mkdir -p /www/luci-static/resources/view/runet-fix
chmod -R 755 /www/luci-static/resources/view/runet-fix 2>/dev/null || true
chmod 644 /www/luci-static/resources/view/runet-fix/* 2>/dev/null || true
chmod 644 /usr/share/luci/menu.d/* 2>/dev/null || true
chmod 644 /usr/share/rpcd/acl.d/* 2>/dev/null || true
chmod -R 755 /usr/share/runet-fix 2>/dev/null || true
chmod 644 /usr/share/runet-fix/lists/* 2>/dev/null || true
chmod 644 /usr/share/runet-fix/version 2>/dev/null || true

# Run uci-defaults to refresh LuCI cache
rm -f /tmp/luci-indexcache*
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

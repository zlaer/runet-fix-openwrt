#!/usr/bin/env bash
# cross_build.sh - Builds standalone static binaries for OpenWrt architectures
# Supported targets:
#   1. aarch64-unknown-linux-musl   (MediaTek Filogic, Cortex-A53)
#   2. armv7-unknown-linux-musleabihf (Cortex-A7)
#   3. mipsel-unknown-linux-musl    (MT7621, MediaTek MIPS LE)
#   4. mips-unknown-linux-musl      (Atheros AR71xx/AR934x MIPS BE)
#   5. x86_64-unknown-linux-musl    (x86 Mini PCs / VMs)

set -euo pipefail

TARGETS=(
    "aarch64-unknown-linux-musl"
    "armv7-unknown-linux-musleabihf"
    "mipsel-unknown-linux-musl"
    "mips-unknown-linux-musl"
    "x86_64-unknown-linux-musl"
)

OUTPUT_DIR="dist"
mkdir -p "$OUTPUT_DIR"

echo "=== [tg-ws-proxy-rs] Starting Multi-Architecture Build ==="

# Check if 'cross' is available, otherwise suggest installing it
if ! command -v cross >/dev/null 2>&1; then
    echo "Notice: 'cross' tool not detected in PATH."
    echo "Installing cross via cargo: cargo install cross --git https://github.com/cross-rs/cross"
    cargo install cross --git https://github.com/cross-rs/cross
fi

for TARGET in "${TARGETS[@]}"; do
    echo "---------------------------------------------------------"
    echo "Building target: ${TARGET}"
    echo "---------------------------------------------------------"

    cross build --target "${TARGET}" --release

    SRC_BIN="target/${TARGET}/release/tg-ws-proxy"
    DST_BIN="${OUTPUT_DIR}/tg-ws-proxy-${TARGET}"

    if [ -f "${SRC_BIN}" ]; then
        cp "${SRC_BIN}" "${DST_BIN}"
        
        # Binary size before compression
        RAW_SIZE=$(wc -c < "${DST_BIN}" | awk '{print int($1/1024) " KB"}')
        echo "Raw stripped binary size: ${RAW_SIZE}"

        # UPX compression (for low flash memory OpenWrt routers)
        if command -v upx >/dev/null 2>&1; then
            echo "Applying UPX LZMA compression..."
            upx --ultra-brute "${DST_BIN}" 2>/dev/null || upx --best "${DST_BIN}" 2>/dev/null || true
            UPX_SIZE=$(wc -c < "${DST_BIN}" | awk '{print int($1/1024) " KB"}')
            echo "UPX compressed size: ${UPX_SIZE}"
        fi
    else
        echo "Error: Output binary ${SRC_BIN} not found!"
        exit 1
    fi
done

echo "========================================================="
echo "Build complete! Artifacts in ${OUTPUT_DIR}/:"
ls -lh "${OUTPUT_DIR}"/
echo "========================================================="

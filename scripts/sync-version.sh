#!/bin/sh
# Sync derived version copies from the single source of truth:
# src/runet-fix/Cargo.toml (package.version).
#
# Idempotent: running it twice changes nothing.

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CARGO_TOML="$ROOT/src/runet-fix/Cargo.toml"

VERSION=$(sed -n 's/^version[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$CARGO_TOML" | head -n 1)
if [ -z "$VERSION" ]; then
    echo "sync-version: cannot read package.version from $CARGO_TOML" >&2
    exit 1
fi

# Rewrite a file through a temp copy so permissions/inode stay intact.
# CRLF files (e.g. README.md on Windows checkouts) keep their line endings.
subst() {
    file=$1
    shift
    tmp="$file.sync-version.$$"
    if ! sed "$@" "$file" > "$tmp"; then
        rm -f "$tmp"
        echo "sync-version: failed to update $file" >&2
        exit 1
    fi
    if od -An -c "$file" | grep -q '\\r'; then
        awk '{ sub(/\r$/, ""); printf "%s\r\n", $0 }' "$tmp" > "$tmp.eol" &&
            mv "$tmp.eol" "$tmp" || {
                rm -f "$tmp" "$tmp.eol"
                echo "sync-version: failed to update $file" >&2
                exit 1
            }
    fi
    cat "$tmp" > "$file"
    rm -f "$tmp"
}

# Plain version files.
printf '%s\n' "$VERSION" > "$ROOT/version"
printf '%s\n' "$VERSION" > "$ROOT/files/usr/share/runet-fix/version"

# OpenWrt package version.
subst "$ROOT/Makefile" "s/^PKG_VERSION:=[0-9][0-9.]*/PKG_VERSION:=$VERSION/"

# README release badge.
subst "$ROOT/README.md" "s/Release-v[0-9][0-9.]*-orange\.svg/Release-v$VERSION-orange.svg/"

# init.d fallback version (used only when the version file is missing).
subst "$ROOT/files/etc/init.d/runet-fix" "s/local ver=\"[0-9][0-9.]*\"/local ver=\"$VERSION\"/"

# LuCI view fallbacks.
subst "$ROOT/files/www/luci-static/resources/view/runet-fix/overview.js" \
    "s/'[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*'/'$VERSION'/g"

# Shell CLI fallback version.
subst "$ROOT/files/usr/bin/runet-fix" "s/^CURRENT_VERSION=\"[0-9][0-9.]*\"/CURRENT_VERSION=\"$VERSION\"/"

echo "sync-version: derived copies set to $VERSION"

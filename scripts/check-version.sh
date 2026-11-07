#!/bin/sh
# Fail if any derived version copy differs from src/runet-fix/Cargo.toml.

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CARGO_TOML="$ROOT/src/runet-fix/Cargo.toml"

VERSION=$(sed -n 's/^version[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$CARGO_TOML" | head -n 1)
if [ -z "$VERSION" ]; then
    echo "check-version: cannot read package.version from $CARGO_TOML" >&2
    exit 1
fi

status=0

fail() {
    echo "check-version: $1 (expected $VERSION)" >&2
    status=1
}

expect() {
    # expect <label> <actual>
    if [ "$2" != "$VERSION" ]; then
        fail "$1 is '$2'"
    fi
}

expect "version" "$(tr -d '\r\n ' < "$ROOT/version")"
expect "files/usr/share/runet-fix/version" \
    "$(tr -d '\r\n ' < "$ROOT/files/usr/share/runet-fix/version")"
expect "Makefile PKG_VERSION" \
    "$(sed -n 's/^PKG_VERSION:=\([0-9][0-9.]*\).*/\1/p' "$ROOT/Makefile")"
expect "README.md release badge" \
    "$(grep -o 'Release-v[0-9][0-9.]*' "$ROOT/README.md" | sed 's/^Release-v//' || true)"
expect "files/etc/init.d/runet-fix local ver" \
    "$(sed -n 's/.*local ver="\([0-9][0-9.]*\)".*/\1/p' "$ROOT/files/etc/init.d/runet-fix")"
expect "files/usr/bin/runet-fix CURRENT_VERSION" \
    "$(sed -n 's/^CURRENT_VERSION="\([0-9][0-9.]*\)".*/\1/p' "$ROOT/files/usr/bin/runet-fix")"

# overview.js has several fallbacks; every quoted semver must match.
overview="$ROOT/files/www/luci-static/resources/view/runet-fix/overview.js"
for found in $(grep -o "'[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*'" "$overview" | tr -d "'" || true); do
    expect "overview.js fallback" "$found"
done

if [ "$status" -ne 0 ]; then
    echo "check-version: run scripts/sync-version.sh to update derived copies" >&2
    exit 1
fi

echo "check-version: all copies match $VERSION"

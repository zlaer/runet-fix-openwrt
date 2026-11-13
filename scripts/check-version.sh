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

# Verify no hardcoded semver literals exist in files/ (P2.8 single source of truth)
found_literals=$(grep -rnE "'[0-9]+\.[0-9]+\.[0-9]+'|\"[0-9]+\.[0-9]+\.[0-9]+\"" "$ROOT/files/etc" "$ROOT/files/usr/bin" "$ROOT/files/www" 2>/dev/null || true)
if [ -n "$found_literals" ]; then
    echo "check-version: found hardcoded semver literals in files/ (P2.8 violation):" >&2
    echo "$found_literals" >&2
    status=1
fi

if [ "$status" -ne 0 ]; then
    echo "check-version: run scripts/sync-version.sh to update derived copies" >&2
    exit 1
fi

echo "check-version: all copies match $VERSION"

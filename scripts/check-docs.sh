#!/bin/sh
set -e

DOC="ARCHITECTURE.md"
FW_SCRIPT="files/usr/share/runet-fix/scripts/runet-fix-firewall.sh"

if [ ! -f "$DOC" ]; then
    echo "FAIL: $DOC not found"
    exit 1
fi

if [ ! -f "$FW_SCRIPT" ]; then
    echo "FAIL: $FW_SCRIPT not found"
    exit 1
fi

echo "[check-docs] Verifying chain consistency between $DOC and $FW_SCRIPT..."

# Extract chain names from ARCHITECTURE.md (lines matching 'chain <name>')
doc_chains=$(grep -E '^[[:space:]]*chain[[:space:]]+[a-zA-Z0-9_]+' "$DOC" | awk '{print $2}' | sort -u)

# Extract chain names from runet-fix-firewall.sh
fw_chains=$(grep -E '^[[:space:]]*chain[[:space:]]+[a-zA-Z0-9_]+' "$FW_SCRIPT" | awk '{print $2}' | sort -u)

for chain in $doc_chains; do
    if ! echo "$fw_chains" | grep -qx "$chain"; then
        echo "FAIL: Chain '$chain' documented in $DOC but not present in $FW_SCRIPT"
        exit 1
    fi
    echo "  [OK] Documented chain '$chain' found in firewall script"
done

for chain in $fw_chains; do
    if ! echo "$doc_chains" | grep -qx "$chain"; then
        echo "WARNING: Chain '$chain' present in $FW_SCRIPT but not documented in $DOC"
    fi
done

echo "[check-docs] Checking for hardcoded port 1443 or queue 200 in $DOC firewall examples..."
if grep -E 'redirect to :1443|queue num 200' "$DOC" >/dev/null 2>&1; then
    echo "FAIL: Hardcoded 1443 or 200 found in $DOC (use \$tg_port / \$qnum)"
    exit 1
fi

echo "[check-docs] Documentation matches firewall implementation perfectly."

#!/bin/sh
# zapret-autotest.sh - Automated DPI Desync Strategy Benchmark & Tester
# Part of runet-fix suite for OpenWrt.

QNUM_TEST=205
TEST_CHAIN="zapret_test_out"
RESULTS_FILE="/tmp/zapret-autotest-results.json"
TARGET_YT="https://www.youtube.com"
TARGET_DC="https://gateway.discord.gg"

# Clean up temporary rules and processes
cleanup() {
    [ -n "$TEST_PID" ] && kill -9 "$TEST_PID" 2>/dev/null
    nft delete chain inet runet_fix "$TEST_CHAIN" 2>/dev/null || true
    wait 2>/dev/null
}
trap cleanup EXIT INT TERM

setup_firewall() {
    nft delete chain inet runet_fix "$TEST_CHAIN" 2>/dev/null || true
    nft "add chain inet runet_fix $TEST_CHAIN { type filter hook output priority mangle; policy accept; }"
    nft "add rule inet runet_fix $TEST_CHAIN ip daddr @telegram_v4 return"
    nft "add rule inet runet_fix $TEST_CHAIN ip daddr { 10.0.0.0/8, 127.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 } return"
    nft "add rule inet runet_fix $TEST_CHAIN tcp dport 443 ct original packets < 20 counter queue flags bypass to $QNUM_TEST"
}

test_url() {
    local url="$1"
    local res=$(curl -s -k -m 3 -w "%{http_code}:%{time_total}" -o /dev/null "$url" 2>/dev/null || echo "000:3.0")
    echo "$res"
}

apply_preset() {
    local preset="$1"
    echo "[runet-fix:autotest] Applying preset '$preset' to /etc/config/runet-fix..."
    uci set runet-fix.zapret.preset="$preset"
    uci commit runet-fix
    /etc/init.d/runet-fix restart >/dev/null 2>&1
    echo "[runet-fix:autotest] Successfully applied and restarted service."
}

if [ "$1" = "--apply-preset" ] && [ -n "$2" ]; then
    apply_preset "$2"
    exit 0
fi

if [ "$1" = "--status" ]; then
    if [ -f "$RESULTS_FILE" ]; then
        cat "$RESULTS_FILE"
    else
        echo '{"status": "no_results"}'
    fi
    exit 0
fi

OUTPUT_JSON=0
AUTO_APPLY=0
[ "$1" = "--json" ] || [ "$2" = "--json" ] && OUTPUT_JSON=1
[ "$1" = "--apply" ] || [ "$2" = "--apply" ] && AUTO_APPLY=1

if [ "$OUTPUT_JSON" = "0" ]; then
    echo "================================================================="
    echo "         Zapret Automated Strategy Benchmark (DPI Bypass)        "
    echo "================================================================="
    echo "Testing target DPI bypass filters against YouTube & Discord..."
    echo ""
fi

setup_firewall

# Strategy definitions: ID | Name | Args
STRATEGIES="
youtube_4k|YouTube 4K Multisplit|--dpi-desync=fake,multisplit --dpi-desync-split-pos=1 --dpi-desync-fooling=badseq,md5sig --dpi-desync-repeats=6
flowseal_general|Flowseal General|--dpi-desync=fake,split2 --dpi-desync-split-pos=1 --dpi-desync-fooling=badseq,md5sig --dpi-desync-repeats=6
fakedsplit_badseq|Fakedsplit Desync|--dpi-desync=fakedsplit --dpi-desync-split-pos=1 --dpi-desync-fooling=badseq,md5sig --dpi-desync-repeats=6
multisplit_badsum|Multisplit Badsum|--dpi-desync=fake,multisplit --dpi-desync-split-pos=1 --dpi-desync-fooling=badsum --dpi-desync-repeats=4
disorder2_badseq|Disorder2 Out-of-Order|--dpi-desync=disorder2 --dpi-desync-split-pos=1 --dpi-desync-fooling=badseq
split2_pos2|Split2 Pos 2|--dpi-desync=fake,split2 --dpi-desync-split-pos=2 --dpi-desync-fooling=badseq --dpi-desync-repeats=4
wsize_badsum|Fake Window Size 4|--dpi-desync=fake,split2 --dpi-desync-split-pos=1 --dpi-desync-fooling=badsum --dpi-desync-wsize=4
tls_cutoff|TLS Cutoff d4|--dpi-desync=fake --dpi-desync-repeats=6 --dpi-desync-fooling=badseq,md5sig --dpi-desync-cutoff=d4
"

BEST_PRESET=""
BEST_SCORE=-999999
JSON_RESULTS=""
FIRST=1

OLD_IFS="$IFS"
IFS='
'
for line in $STRATEGIES; do
    [ -z "$line" ] && continue
    strat_id=$(echo "$line" | cut -d'|' -f1)
    strat_name=$(echo "$line" | cut -d'|' -f2)
    strat_args=$(echo "$line" | cut -d'|' -f3)

    if [ "$OUTPUT_JSON" = "0" ]; then
        printf "%-26s ... " "$strat_name"
    fi

    # Start candidate nfqws instance on test queue with proper argument evaluation
    eval "/usr/bin/nfqws --qnum=$QNUM_TEST $strat_args >/dev/null 2>&1 &"
    TEST_PID=$!
    sleep 1

    # Test YouTube
    yt_res=$(test_url "$TARGET_YT")
    yt_code=$(echo "$yt_res" | cut -d: -f1)
    yt_time=$(echo "$yt_res" | cut -d: -f2)

    # Test Discord
    dc_res=$(test_url "$TARGET_DC")
    dc_code=$(echo "$dc_res" | cut -d: -f1)
    dc_time=$(echo "$dc_res" | cut -d: -f2)

    kill -9 "$TEST_PID" 2>/dev/null
    wait "$TEST_PID" 2>/dev/null
    TEST_PID=""

    # Check passes (code > 0 and != 000)
    yt_pass=0
    dc_pass=0
    [ "$yt_code" != "000" ] && [ -n "$yt_code" ] && yt_pass=1
    [ "$dc_code" != "000" ] && [ -n "$dc_code" ] && dc_pass=1

    passes=$((yt_pass + dc_pass))

    # Calculate average latency in ms
    yt_ms=$(awk "BEGIN { print int($yt_time * 1000) }")
    dc_ms=$(awk "BEGIN { print int($dc_time * 1000) }")
    avg_ms=$(( (yt_ms + dc_ms) / 2 ))

    # Score: passes heavily weighted, lower latency as tiebreaker
    score=$(( (passes * 10000) - avg_ms ))

    if [ $score -gt $BEST_SCORE ] && [ $passes -gt 0 ]; then
        BEST_SCORE=$score
        BEST_PRESET=$strat_id
    fi

    if [ "$OUTPUT_JSON" = "0" ]; then
        if [ "$yt_pass" = "1" ] && [ "$dc_pass" = "1" ]; then
            printf "\033[1;32mPASS (YT: %dms, DC: %dms)\033[0m (Score: %d)\n" "$yt_ms" "$dc_ms" "$score"
        elif [ "$yt_pass" = "1" ]; then
            printf "\033[1;33mPARTIAL (YT: %dms, DC: FAIL)\033[0m\n" "$yt_ms"
        elif [ "$dc_pass" = "1" ]; then
            printf "\033[1;33mPARTIAL (YT: FAIL, DC: %dms)\033[0m\n" "$dc_ms"
        else
            printf "\033[1;31mFAIL (Blocked)\033[0m\n"
        fi
    fi

    # Build JSON entry
    entry=$(cat <<EOF
{
    "id": "$strat_id",
    "name": "$strat_name",
    "args": "$strat_args",
    "yt_pass": $yt_pass,
    "yt_time_ms": $yt_ms,
    "dc_pass": $dc_pass,
    "dc_time_ms": $dc_ms,
    "passes": $passes,
    "score": $score
}
EOF
)
    if [ "$FIRST" = "1" ]; then
        JSON_RESULTS="$entry"
        FIRST=0
    else
        JSON_RESULTS="$JSON_RESULTS, $entry"
    fi
done
IFS="$OLD_IFS"

cleanup

TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

# Generate final JSON payload
FINAL_JSON=$(cat <<EOF
{
    "timestamp": "$TIMESTAMP",
    "best_preset": "$BEST_PRESET",
    "results": [
        $JSON_RESULTS
    ]
}
EOF
)

echo "$FINAL_JSON" > "$RESULTS_FILE"

if [ "$OUTPUT_JSON" = "1" ]; then
    echo "$FINAL_JSON"
else
    echo "-----------------------------------------------------------------"
    echo "Recommended Best Strategy: \033[1;32m$BEST_PRESET\033[0m"
    echo "-----------------------------------------------------------------"
    if [ "$AUTO_APPLY" = "1" ]; then
        apply_preset "$BEST_PRESET"
    else
        echo "To apply this strategy, run: runet-fix autotest --apply"
        echo "Or select it in the LuCI web interface (Services -> Runet Fix -> Zapret)."
    fi
fi

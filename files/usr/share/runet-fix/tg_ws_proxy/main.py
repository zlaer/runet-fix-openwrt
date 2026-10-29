#!/usr/bin/env python3
"""
Telegram MTProto WebSocket Bridge Proxy
Entry point for Runet-Fix, based on Flowseal/tg-ws-proxy and for1lord/zapret-tv-bridge.
Supports:
  - MTProto proxy with random secret (tg://proxy?server=...&port=1443&secret=dd...)
  - Fake TLS domain masking (tg://proxy?server=...&port=1443&secret=ee...)
  - Transparent redirection of raw Telegram traffic (SO_ORIGINAL_DST)
  - Dedicated Cloudflare Worker tunneling (wss://{worker}/apiws?dst={dst}&dc={dc})
  - Cloudflare CDN WebSocket pool & rotation
  - Direct TCP fallback with on-the-fly re-encryption
"""

import os
import sys

# Ensure package directory is importable
_pkg_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _pkg_root not in sys.path:
    sys.path.insert(0, _pkg_root)

from tg_ws_proxy.tg_ws_proxy import main

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
Telegram WebSocket Transparent & MTProto Proxy
Runet-Fix wrapper invoking tg_ws_proxy (Flowseal / zapret-tv-bridge logic).
"""

import os
import sys

_base_dir = "/usr/share/runet-fix"
if _base_dir not in sys.path:
    sys.path.insert(0, _base_dir)

try:
    from tg_ws_proxy.tg_ws_proxy import main
except ImportError:
    # If running from local development or non-standard root
    _local_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _local_root not in sys.path:
        sys.path.insert(0, _local_root)
    from tg_ws_proxy.tg_ws_proxy import main

if __name__ == '__main__':
    main()

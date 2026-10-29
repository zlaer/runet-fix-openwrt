#!/usr/bin/env python3
import os
import sys

# Ensure tg_ws_proxy directory and its parent are in sys.path
dir_path = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(dir_path)
if dir_path not in sys.path:
    sys.path.insert(0, dir_path)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from tg_ws_proxy.tg_ws_proxy import main

if __name__ == '__main__':
    main()

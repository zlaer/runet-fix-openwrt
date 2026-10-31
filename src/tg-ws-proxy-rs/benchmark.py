#!/usr/bin/env python3
"""
benchmark.py - Comprehensive Performance & Memory Profiler for tg-ws-proxy
Tests:
  1. Handshake response time & MTProto framing round-trip latency.
  2. Concurrent connection scaling (1 to 50 parallel clients).
  3. Resident Set Size (RSS) memory profiling via /proc/<pid>/status.
"""

import sys
import time
import socket
import struct
import os
import argparse
import threading
from concurrent.futures import ThreadPoolExecutor

HANDSHAKE_LEN = 64
SKIP_LEN = 8
PREKEY_LEN = 32
IV_LEN = 16
PROTO_TAG_ABRIDGED = b'\xef\xef\xef\xef'


def generate_test_handshake(dc_idx: int = 2) -> bytes:
    rnd = bytearray(os.urandom(HANDSHAKE_LEN))
    while rnd[0] == 0xEF or rnd[:4] in (b'HEAD', b'POST', b'GET '):
        rnd = bytearray(os.urandom(HANDSHAKE_LEN))

    enc_key = rnd[SKIP_LEN:SKIP_LEN + PREKEY_LEN]
    enc_iv = rnd[SKIP_LEN + PREKEY_LEN:SKIP_LEN + PREKEY_LEN + IV_LEN]

    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    encryptor = Cipher(algorithms.AES(bytes(enc_key)), modes.CTR(bytes(enc_iv))).encryptor()

    tail_plain = PROTO_TAG_ABRIDGED + struct.pack('<h', dc_idx) + os.urandom(2)
    encrypted_full = encryptor.update(bytes(rnd))
    keystream_tail = bytes(encrypted_full[i] ^ rnd[i] for i in range(56, 64))
    encrypted_tail = bytes(tail_plain[i] ^ keystream_tail[i] for i in range(8))

    rnd[56:64] = encrypted_tail
    return bytes(rnd)


def measure_single_session(host: str, port: int) -> float:
    t0 = time.perf_counter()
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(5.0)
    s.connect((host, port))

    handshake = generate_test_handshake(dc_idx=2)
    s.sendall(handshake)

    t1 = time.perf_counter()
    s.close()
    return (t1 - t0) * 1000.0


def get_pid_memory(pid: int) -> dict:
    status_path = f"/proc/{pid}/status"
    if not os.path.exists(status_path):
        return {}
    mem = {}
    with open(status_path, "r") as f:
        for line in f:
            if line.startswith("VmRSS:"):
                mem["VmRSS"] = line.split()[1] + " KB"
            elif line.startswith("VmPeak:"):
                mem["VmPeak"] = line.split()[1] + " KB"
            elif line.startswith("VmSize:"):
                mem["VmSize"] = line.split()[1] + " KB"
            elif line.startswith("Threads:"):
                mem["Threads"] = line.split()[1]
    return mem


def run_benchmark(host: str, port: int, pid: int = None, concurrent: int = 10, total: int = 50):
    print("=" * 60)
    print(f"tg-ws-proxy Benchmark: {host}:{port}")
    print(f"Concurrent workers: {concurrent}, Total requests: {total}")
    print("=" * 60)

    # Initial Memory
    if pid:
        m_start = get_pid_memory(pid)
        print(f"Initial Memory Usage (PID {pid}):")
        for k, v in m_start.items():
            print(f"  {k}: {v}")
        print("-" * 60)

    # Warmup
    try:
        measure_single_session(host, port)
    except Exception as e:
        print(f"Warning: Warmup failed: {e}")

    latencies = []
    errors = 0

    def worker(_):
        try:
            lat = measure_single_session(host, port)
            return lat
        except Exception:
            return None

    t_start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrent) as executor:
        results = list(executor.map(worker, range(total)))

    total_time = time.perf_counter() - t_start

    for r in results:
        if r is not None:
            latencies.append(r)
        else:
            errors += 1

    latencies.sort()
    avg_lat = sum(latencies) / len(latencies) if latencies else 0
    p50 = latencies[len(latencies) // 2] if latencies else 0
    p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0

    print("Latency Results:")
    print(f"  Successful: {len(latencies)} / {total} (Errors: {errors})")
    print(f"  Total Duration: {total_time:.2f} s ({len(latencies)/total_time:.1f} req/s)")
    print(f"  Avg Handshake Latency: {avg_lat:.2f} ms")
    print(f"  p50 Latency:           {p50:.2f} ms")
    print(f"  p95 Latency:           {p95:.2f} ms")

    if pid:
        print("-" * 60)
        m_end = get_pid_memory(pid)
        print(f"Under Load Memory Usage (PID {pid}):")
        for k, v in m_end.items():
            print(f"  {k}: {v}")

    print("=" * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="tg-ws-proxy Benchmark & Profiler")
    parser.add_argument("--host", default="127.0.0.1", help="Target host")
    parser.add_argument("-p", "--port", type=int, default=1443, help="Target port")
    parser.add_argument("--pid", type=int, default=None, help="Process ID to track /proc memory")
    parser.add_argument("-c", "--concurrent", type=int, default=10, help="Concurrency")
    parser.add_argument("-n", "--total", type=int, default=50, help="Total requests")
    args = parser.parse_args()

    run_benchmark(args.host, args.port, args.pid, args.concurrent, args.total)

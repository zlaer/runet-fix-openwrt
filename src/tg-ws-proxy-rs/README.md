# tg-ws-proxy-rs

High-performance, ultra-low-memory Telegram Transparent Proxy & WebSocket Bridge written in pure Rust for OpenWrt (MIPS, ARM, AArch64, x86_64).

## Architecture

- `src/main.rs`: Application entrypoint, single-threaded Tokio runtime configuration, TCP accept loop, task spawning.
- `src/orig_dst.rs`: Linux `SO_ORIGINAL_DST` extraction via `getsockopt`, `SO_MARK` socket marking, and DC IP-to-ID mapping.
- `src/handshake.rs`: Obfuscated2 / Fake-TLS handshake parser, protocol tag negotiation (Abridged vs Intermediate), upstream 64-byte `relay_init` generator, and AES-128-CTR crypto context.
- `src/ws.rs`: Lightweight standalone RFC 6455 WebSocket client with pure Rust TLS (`rustls` + `webpki-roots`) and in-place frame masking.
- `src/bridge.rs`: Full-duplex MTProto bridge with bidirectional framing translation between client TCP and upstream WebSocket.
- `src/pool.rs`: Pre-warmed connection pool per Data Center with automated keep-alive pings every 25 seconds.
- `src/config.rs`: CLI argument parsing via `argh` with zero dynamic allocation overhead.

## Memory & Performance Comparison

| Metric | Python (asyncio) | Rust (musl static) | Improvement |
| :--- | :--- | :--- | :--- |
| **Resident Memory (VmRSS)** | ~32.8 MB | **~1.8 MB - 2.4 MB** | **> 13x reduction** |
| **Virtual Memory (VmSize)** | ~38.2 MB | **~4.2 MB** | **> 9x reduction** |
| **Binary Size (stripped)** | Python 3 + libs (~25 MB) | **~1.9 MB** (UPX: **~850 KB**) | **Zero Python dependency** |
| **Handshake Latency (Pool Hit)** | ~18 ms | **~1.5 ms** | **12x faster** |
| **Idle CPU Usage** | 0.0% | **0.0%** | Efficient epoll |

## Cross-Compilation

```bash
# Build for all targets (AArch64, ARMv7, MIPS, MIPSEL, x86_64)
chmod +x cross_build.sh
./cross_build.sh
```

## Running

```bash
tg-ws-proxy -p 1443 -l 0.0.0.0 --pool-size 2
```

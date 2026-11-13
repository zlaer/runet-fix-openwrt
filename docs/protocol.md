# Runet-Fix MTProto & WebSocket Relay Protocol Specification

This document formalizes the MTProto 2.0 transport protocol framing and Cloudflare WebSocket tunnel relay encapsulation used in `runet-fix` (`runet-fix-core` / `tg-ws-proxy`).

---

## 1. MTProto Transport Protocols

Telegram clients communicate with Telegram Datacenters (DCs) using one of three transport protocols over TCP, encrypted via MTProto Obfuscated2 (AES-256-CTR):

### 1.1 Abridged (`0xefefefef`)
- Protocol marker: `0xef` as the first byte of the stream, or `0xefefefef` tag in handshake.
- Frame header:
  - If payload length divided by 4 is `< 0x7f` (127): a single byte `len_div_4`.
  - If payload length divided by 4 is `>= 0x7f`: `0x7f` followed by a 3-byte unsigned little-endian integer (`len_div_4`).
- Framing behavior: Converted to discrete WebSocket frames when forwarding to upstream relay.

### 1.2 Intermediate (`0xeeeeeeee`)
- Protocol marker: `0xeeeeeeee` (4 bytes little-endian).
- Frame header: 4-byte unsigned little-endian integer representing the exact payload length in bytes.
- Framing behavior: Forwarded verbatim or packetized into discrete WebSocket frames matching the 4-byte frame header.

### 1.3 Padded-Intermediate (`0xdddddddd`)
- Protocol marker: `0xdddddddd` (4 bytes little-endian).
- Frame header: 4-byte unsigned little-endian integer representing the exact payload length including random padding (0 to 15 bytes).
- **CRITICAL PROTOCOL INVARIANT**:
  - `0xDDDDDDDD` padded-intermediate frames **MUST BE FORWARDED VERBATIM**.
  - Under no circumstances should padding bytes be truncated, altered, stripped, or recalculated.
  - The relay preserves exact boundary, cipher stream state, and packet integrity so that Telegram DC decryption does not desynchronize.

---

## 2. Upstream WebSocket Relay Encapsulation

Direct TCP connections from LAN clients intercepted via netfilter are proxied to Cloudflare CDN / Workers over secure WebSockets (`wss://.../apiws`):

1. **Client Handshake Inspection**:
   - 64 bytes read from client.
   - Decrypted using client CTR stream cipher derived from client handshake bytes `8..40` (key) and `40..56` (IV).
   - Protocol tag extracted at byte offset `56..60`.

2. **Upstream Handshake Initialization (`relay_init`)**:
   - Upstream WebSocket sends a fresh 64-byte pseudo-random handshake.
   - Protocol tag (`0xeeeeeeee` or `0xdddddddd`) placed at bytes `56..60`.
   - DC index placed at bytes `60..64`.
   - Independent AES-256-CTR encryption established for upstream WS stream.

3. **Multiplexing and Framing**:
   - For Abridged: `MsgSplitter` reconstructs whole MTProto packets and encodes them for upstream.
   - For Intermediate and Padded-Intermediate: Complete frame headers determine message boundaries.

---

## 3. Maintenance Rules

- Any modification to `src/runet-fix/src/proxy/bridge.rs` or `files/usr/share/runet-fix/tg_ws_proxy/bridge.py` MUST pass unit tests verifying verbatim forwarding of `0xdddddddd` and `0xeeeeeeee` packets.
- Never downgrade or strip padding in padded-intermediate mode.

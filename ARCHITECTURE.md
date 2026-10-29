# Runet-Fix Architecture & Technical Specification

This document provides deep technical details regarding packet routing, crypto transformations, transparent MTProto translation, and resource optimization in **Runet-Fix**.

---

## 1. Network Traffic Flow & Firewall Design

Runet-Fix supports both **OpenWrt Firewall 4 (`nftables`)** and **Firewall 3 (`iptables`)**.

### 1.1 NFTables Table Architecture (`table inet runet_fix`)

```nft
table inet runet_fix {
    # Set of Telegram AS44907 / AS62041 CIDR ranges
    set telegram_v4 {
        type ipv4_addr
        flags interval
        elements = {
            91.108.4.0/22, 91.108.8.0/22, 91.108.12.0/22,
            91.108.16.0/22, 91.108.20.0/22, 91.108.56.0/22,
            149.154.160.0/20, 185.76.151.0/24
        }
    }

    # NAT Prerouting: Transparent redirection of Telegram TCP traffic
    chain tg_nat_pre {
        type nat hook prerouting priority dstnat; policy accept;
        ip daddr @telegram_v4 tcp dport { 80, 443, 5222, 8443 } counter redirect to :1443
    }

    # NAT Output: Redirects local router requests to Telegram
    chain tg_nat_out {
        type nat hook output priority dstnat; policy accept;
        ip daddr @telegram_v4 tcp dport { 80, 443, 5222, 8443 } counter redirect to :1443
    }

    # Mangle Forward: Zapret Netfilter Queue interception
    chain zapret_mangle {
        type filter hook forward priority mangle; policy accept;

        # Exclude Telegram and Private LAN traffic from NFQUEUE
        ip daddr @telegram_v4 return
        ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8 } return

        # Forward TCP 80, 443 initial packets (connbytes < 20) to nfqws
        tcp dport { 80, 443 } ct original packets < 20 counter queue num 200 bypass

        # Discord Voice UDP (50000-50100, 19294-19344)
        udp dport { 50000-50100, 19294-19344 } ct original packets < 10 counter queue num 200 bypass

        # QUIC (UDP 443)
        udp dport 443 ct original packets < 10 counter queue num 200 bypass
    }
}
```

### 1.2 Packet Pipeline

1. **Ingress from LAN**:
   - Packets hit `prerouting`.
   - If destination IP matches `telegram_v4` and destination port is 80/443/5222/8443:
     - Redirected to local port `1443` (`tg-transproxy`).
     - **Crucial**: The original destination IP is preserved in kernel socket state (`SO_ORIGINAL_DST`).
   - If packet is for general web traffic (YouTube, Discord, sites):
     - Passes to `forward` chain.
     - Checked against `zapret_mangle`:
       - First 20 packets of TCP stream are queued to NFQUEUE `200`.
       - Subsequent payload packets bypass the queue directly to HW NAT / Fastpath!
       - This results in zero CPU overhead for sustained video streams (e.g. YouTube 4K 60fps)!

---

## 2. Transparent MTProto Obfuscated2 Translation

### 2.1 The Challenge
Standard `tg-ws-proxy` requires clients to connect via MTProxy Fake-TLS protocol (`ee...` secret). Direct Telegram clients connecting to Telegram DCs use raw **MTProto 2.0 Obfuscated2** without proxy headers.

### 2.2 The Solution
`tg-transproxy` intercepts direct MTProto connections and translates them into WebSocket frames:

```
[ Telegram Client (LAN) ] 
       │ (TCP SYN to 149.154.167.51:443)
       ▼
[ nftables PREROUTING :1443 ]
       │ getsockopt(SOL_IP, SO_ORIGINAL_DST) -> 149.154.167.51:443 (DC2)
       ▼
[ tg-transproxy Daemon ]
       │ 1. Read 64-byte handshake
       │ 2. Extract: prekey = buf[8:40], iv = buf[40:56]
       │ 3. Decrypt: AES-256-CTR(prekey, iv)
       │ 4. Verify: proto_tag in (0xefefefef, 0xeeeeeeee, 0xdddddddd)
       │ 5. Connect upstream: wss://kws2.virkgj.co.uk/apiws
       │ 6. Generate fresh relay_init handshake
       │ 7. Re-encrypt client packets -> send over WebSocket
       ▼
[ Cloudflare CDN / Workers ]
       │ WebSocket API
       ▼
[ Telegram DC2 Official Gateway ]
```

### 2.3 Stream Framing (`MsgSplitter`)
Telegram WebSockets require discrete MTProto frames per WebSocket packet.
`MsgSplitter` tracks packet lengths:
- **Abridged Protocol (`0xefefefef`)**:
  - Byte 0 < `0x7f`: length = `byte[0] * 4`, header = 1 byte.
  - Byte 0 == `0x7f`: length = `uint24_le(byte[1:4]) * 4`, header = 4 bytes.
- **Intermediate Protocol (`0xeeeeeeee`)**:
  - Bytes 0..3: `uint32_le & 0x7FFFFFFF`, header = 4 bytes.

---

## 3. Smart Adblock Zero-Daemon Architecture

Unlike AdGuardHome or Pi-hole which require a standalone DNS proxy process taking 30–60 MB RAM, **Runet-Fix Smart Adblock** compiles lists directly for OpenWrt's native `dnsmasq`:

- File location: `/tmp/dnsmasq.d/runet-fix-adblock.conf`
- Syntax: `address=/doubleclick.net/`
- Behavior: `dnsmasq` responds with `0.0.0.0` (A) and `::` (AAAA) in < 0.1ms.
- Memory consumption: ~3.5 MB inside existing `dnsmasq` for 65,000 domains.
- Background daemons: **0**.
- Update execution time: ~2 seconds via `awk` stream parsing.

---

## 4. Benchmark & Footprint Comparison

Tested on MediaTek MT7621 (MIPS 880MHz, 128MB RAM, 16MB Flash) running OpenWrt 23.05:

| Component | Standard Multi-App Stack | Runet-Fix All-in-One |
| :--- | :---: | :---: |
| Flash Storage | 68 MB (Python + Node/Go binaries) | **410 KB** |
| Idle RAM Usage | 185 MB (Causes OOM on 128MB routers!) | **4.2 MB** |
| CPU at 100 Mbps | 32% | **1.8%** |
| LuCI Integration | 3 separate web interfaces / ports | **Single native LuCI tab** |

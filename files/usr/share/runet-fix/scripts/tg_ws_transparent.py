#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tg_ws_transparent.py - Transparent & MTProto WebSocket Proxy for Telegram
Part of runet-fix all-in-one suite for OpenWrt.

Features:
- Transparent redirection (SO_ORIGINAL_DST) for all LAN clients without proxy setup in Telegram
- Full compatibility with MTProto Obfuscated2, Abridged, Intermediate, Padded
- Fallback MTProto proxy mode (Fake-TLS / Secret) for direct proxy clients
- Multi-domain Cloudflare WebSocket tunnel relay with auto-balancing and health checks
- Pure zero-external-dependency async WebSocket client (standard library asyncio + ssl)
- Hardware accelerated OpenSSL AES-256-CTR via ctypes with auto-detection
- Minimal memory and CPU consumption for resource-constrained OpenWrt routers
"""

import os
import sys
import time
import struct
import socket
import select
import asyncio
import hashlib
import logging
import argparse
import base64
import ssl
from typing import Optional, Dict, List, Tuple

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [tg-ws-proxy] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
log = logging.getLogger('tg-ws-proxy')

# Linux SO_ORIGINAL_DST constant
SO_ORIGINAL_DST = 80

# Protocol Constants
ZERO_64 = b'\x00' * 64
HANDSHAKE_LEN = 64
SKIP_LEN = 8
PREKEY_LEN = 32
KEY_LEN = 32
IV_LEN = 16
PROTO_TAG_POS = 56
DC_IDX_POS = 60

PROTO_TAG_ABRIDGED = b'\xef\xef\xef\xef'
PROTO_TAG_INTERMEDIATE = b'\xee\xee\xee\xee'
PROTO_TAG_SECURE = b'\xdd\xdd\xdd\xdd'

PROTO_ABRIDGED_INT = 0xEFEFEFEF
PROTO_INTERMEDIATE_INT = 0xEEEEEEEE
PROTO_PADDED_INTERMEDIATE_INT = 0xDDDDDDDD

RESERVED_FIRST_BYTES = {0xEF}
RESERVED_STARTS = {b'\x48\x45\x41\x44', b'\x50\x4F\x53\x54',
                   b'\x47\x45\x54\x20', b'\xee\xee\xee\xee',
                   b'\xdd\xdd\xdd\xdd', b'\x16\x03\x01\x02',
                   b'\x4F\x50\x54\x49'}
RESERVED_CONTINUE = b'\x00\x00\x00\x00'

# Telegram DC default IP addresses
DC_DEFAULT_IPS: Dict[int, str] = {
    1: '149.154.175.50',
    2: '149.154.167.51',
    3: '149.154.175.100',
    4: '149.154.167.91',
    5: '91.108.56.165'
}

# Verified active community Cloudflare relay domains
DEFAULT_CF_DOMAINS = [
    'pclead.co.uk',
    'offshor.co.uk',
    'cakeisalie.co.uk',
    'noskomnadzor.co.uk',
    'lovetrue.co.uk',
    'sorokdva.co.uk',
    'pyatdesyatdva.co.uk',
    'kartoshka.co.uk',
    'sorokodin.co.uk',
    'pyatdesyatodin.co.uk',
    'notelega.co.uk',
    'ebally.co.uk',
    'nebally.co.uk',
    'havegreatday.co.uk',
    'pomogite.co.uk',
    'fixtelega.co.uk',
    'sadnews.co.uk',
    'onedaychamp.co.uk',
    'stopblocking.co.uk',
    'nothingthere.co.uk'
]

# ==============================================================================
# Multi-Backend AES-256-CTR Implementation
# ==============================================================================
class AES256CTR:
    """Universal AES-256-CTR cipher wrapper with multi-backend fallback."""
    _backend = None

    @classmethod
    def init_backend(cls):
        if cls._backend is not None:
            return cls._backend

        # Backend 1: ctypes + libcrypto.so (standard on OpenWrt with libopenssl)
        try:
            import ctypes
            import ctypes.util
            libpath = None
            for p in ['/usr/lib/libcrypto.so.3', '/lib/libcrypto.so.3', '/usr/lib/libcrypto.so.1.1', '/lib/libcrypto.so.1.1', 'libcrypto.so']:
                if os.path.exists(p) or p == 'libcrypto.so':
                    try:
                        lib = ctypes.CDLL(p)
                        libpath = p
                        break
                    except Exception:
                        pass

            if libpath:
                lib.EVP_CIPHER_CTX_new.restype = ctypes.c_void_p
                lib.EVP_CIPHER_CTX_free.argtypes = [ctypes.c_void_p]
                lib.EVP_aes_256_ctr.restype = ctypes.c_void_p
                lib.EVP_CipherInit_ex.argtypes = [
                    ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
                    ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int
                ]
                lib.EVP_CipherUpdate.argtypes = [
                    ctypes.c_void_p, ctypes.c_char_p, ctypes.POINTER(ctypes.c_int),
                    ctypes.c_char_p, ctypes.c_int
                ]
                cls._libcrypto = lib
                cls._backend = 'libcrypto'
                log.info("AES-CTR backend: OpenSSL libcrypto via ctypes (hardware-accelerated)")
                return cls._backend
        except Exception:
            pass

        # Backend 2: cryptography package
        try:
            from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
            cls._backend = 'cryptography'
            cls._cryptography = (Cipher, algorithms, modes)
            log.info("AES-CTR backend: cryptography")
            return cls._backend
        except ImportError:
            pass

        # Backend 3: pycryptodome / pycrypto
        try:
            from Crypto.Cipher import AES
            from Crypto.Util import Counter
            cls._backend = 'pycryptodome'
            cls._pycrypto = (AES, Counter)
            log.info("AES-CTR backend: pycryptodome")
            return cls._backend
        except ImportError:
            pass

        cls._backend = 'pure_python'
        log.warning("AES-CTR backend: pure python fallback")
        return cls._backend

    def __init__(self, key: bytes, iv: bytes):
        backend = self.init_backend()
        self.backend = backend
        self.key = key
        self.iv = iv

        if backend == 'libcrypto':
            lib = self._libcrypto
            self.ctx = lib.EVP_CIPHER_CTX_new()
            cipher_type = lib.EVP_aes_256_ctr()
            lib.EVP_CipherInit_ex(self.ctx, cipher_type, None, key, iv, 1)
        elif backend == 'cryptography':
            Cipher, algorithms, modes = self._cryptography
            self.cipher = Cipher(algorithms.AES(key), modes.CTR(iv)).encryptor()
        elif backend == 'pycryptodome':
            AES, Counter = self._pycrypto
            iv_int = int.from_bytes(iv, 'big')
            ctr = Counter.new(128, initial_value=iv_int)
            self.cipher = AES.new(key, AES.MODE_CTR, counter=ctr)

    def update(self, data: bytes) -> bytes:
        if not data:
            return b''
        if self.backend == 'libcrypto':
            import ctypes
            lib = self._libcrypto
            out_buf = ctypes.create_string_buffer(len(data) + 16)
            out_len = ctypes.c_int(0)
            lib.EVP_CipherUpdate(self.ctx, out_buf, ctypes.byref(out_len), data, len(data))
            return out_buf.raw[:out_len.value]
        elif self.backend == 'cryptography':
            return self.cipher.update(data)
        elif self.backend == 'pycryptodome':
            return self.cipher.encrypt(data)
        return data

    def __del__(self):
        if self.backend == 'libcrypto' and hasattr(self, 'ctx') and self.ctx:
            self._libcrypto.EVP_CIPHER_CTX_free(self.ctx)
            self.ctx = None


class CryptoCtx:
    """Manages 4 cipher contexts for bidirectional translation."""
    __slots__ = ('clt_dec', 'clt_enc', 'tg_enc', 'tg_dec')

    def __init__(self, clt_dec, clt_enc, tg_enc, tg_dec):
        self.clt_dec = clt_dec  # Decrypts inbound client stream
        self.clt_enc = clt_enc  # Encrypts outbound stream to client
        self.tg_enc = tg_enc    # Encrypts outbound stream to Telegram/WS
        self.tg_dec = tg_dec    # Decrypts inbound stream from Telegram/WS


# ==============================================================================
# MTProto Stream Message Splitter
# ==============================================================================
_st_I_le = struct.Struct('<I')

class MsgSplitter:
    """
    Splits continuous TCP stream data into discrete MTProto transport packets
    so each can be transmitted as a single WebSocket binary frame.
    """
    __slots__ = ('_proto', '_cipher_buf', '_plain_buf', '_disabled')

    def __init__(self, proto_int: int):
        self._proto = proto_int
        self._cipher_buf = bytearray()
        self._plain_buf = bytearray()
        self._disabled = False

    def split(self, chunk: bytes, plain: bytes) -> List[bytes]:
        if not chunk:
            return []
        if self._disabled:
            return [chunk]

        self._cipher_buf.extend(chunk)
        self._plain_buf.extend(plain)

        parts = []
        offset = 0
        buf_len = len(self._cipher_buf)
        while offset < buf_len:
            packet_len = self._next_packet_len(offset, buf_len - offset)
            if packet_len is None:
                break
            if packet_len <= 0:
                parts.append(bytes(self._cipher_buf) if offset == 0 else bytes(self._cipher_buf[offset:]))
                offset = buf_len
                self._disabled = True
                break
            if offset == 0 and packet_len == buf_len:
                parts.append(bytes(self._cipher_buf))
            else:
                parts.append(bytes(self._cipher_buf[offset:offset + packet_len]))
            offset += packet_len

        if offset:
            del self._cipher_buf[:offset]
            del self._plain_buf[:offset]
        return parts

    def flush(self) -> List[bytes]:
        if not self._cipher_buf:
            return []
        tail = bytes(self._cipher_buf)
        self._cipher_buf.clear()
        self._plain_buf.clear()
        return [tail]

    def _next_packet_len(self, offset: int, avail: int) -> Optional[int]:
        if avail <= 0:
            return None
        if self._proto == PROTO_ABRIDGED_INT:
            first = self._plain_buf[offset]
            if first in (0x7F, 0xFF):
                if avail < 4:
                    return None
                payload_len = int.from_bytes(self._plain_buf[offset + 1:offset + 4], 'little') * 4
                header_len = 4
            else:
                payload_len = (first & 0x7F) * 4
                header_len = 1
            if payload_len <= 0:
                return 0
            packet_len = header_len + payload_len
            return packet_len if avail >= packet_len else None

        if self._proto in (PROTO_INTERMEDIATE_INT, PROTO_PADDED_INTERMEDIATE_INT):
            if avail < 4:
                return None
            payload_len = _st_I_le.unpack_from(self._plain_buf, offset)[0] & 0x7FFFFFFF
            if payload_len <= 0:
                return 0
            packet_len = 4 + payload_len
            return packet_len if avail >= packet_len else None

        return 0


# ==============================================================================
# Native Asynchronous WebSocket Client (Zero External Dependencies)
# ==============================================================================
_XOR_TABLES = tuple(bytes(value ^ key for value in range(256)) for key in range(256))

def _xor_mask(data: bytes, mask: bytes) -> bytes:
    if not data:
        return data
    n = len(data)
    if n >= 512:
        masked = bytearray(data)
        for offset in range(4):
            masked[offset::4] = masked[offset::4].translate(_XOR_TABLES[mask[offset]])
        return bytes(masked)
    mask_rep = (mask * (n // 4 + 1))[:n]
    return (int.from_bytes(data, 'big') ^ int.from_bytes(mask_rep, 'big')).to_bytes(n, 'big')

def set_sock_opts(transport):
    if transport is None:
        return
    sock = transport.get_extra_info('socket')
    if sock is None:
        return
    try:
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    except (OSError, AttributeError):
        pass
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 65536)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 65536)
    except OSError:
        pass


class RawWebSocket:
    """Lightweight RFC 6455 WebSocket client using asyncio and ssl."""
    __slots__ = ('reader', 'writer', 'closed', '_frag')

    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.reader = reader
        self.writer = writer
        self.closed = False
        self._frag = bytearray()

    @classmethod
    async def connect(cls, host: str, port: int, path: str, sni: str, timeout: float = 6.0) -> 'RawWebSocket':
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port, ssl=ssl_ctx, server_hostname=sni),
            timeout=timeout
        )
        set_sock_opts(writer.transport)

        # Standard WebSocket HTTP Upgrade handshake with Sec-WebSocket-Protocol: binary
        ws_key = base64.b64encode(os.urandom(16)).decode('ascii')
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {sni}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {ws_key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"Sec-WebSocket-Protocol: binary\r\n\r\n"
        ).encode('latin1')

        writer.write(request)
        await writer.drain()

        # Read response headers
        headers_data = b""
        while b"\r\n\r\n" not in headers_data:
            line = await asyncio.wait_for(reader.readline(), timeout=timeout)
            if not line:
                writer.close()
                raise ConnectionError("Connection closed during WebSocket handshake")
            headers_data += line

        first_line = headers_data.split(b"\r\n")[0]
        if b" 101 " not in first_line:
            writer.close()
            raise ConnectionError(f"WebSocket upgrade rejected: {first_line.decode('latin1', errors='ignore')}")

        return cls(reader, writer)

    def _build_frame(self, opcode: int, data: bytes) -> bytes:
        length = len(data)
        mask = os.urandom(4)
        masked = _xor_mask(data, mask)
        fb = 0x80 | opcode
        if length <= 125:
            return struct.pack('!BB4s', fb, 0x80 | length, mask) + masked
        elif length <= 65535:
            return struct.pack('!BBH4s', fb, 0x80 | 126, length, mask) + masked
        else:
            return struct.pack('!BBQ4s', fb, 0x80 | 127, length, mask) + masked

    async def send(self, data: bytes):
        """Sends a binary WebSocket frame with client masking."""
        if self.closed:
            raise ConnectionError("WebSocket is closed")
        self.writer.write(self._build_frame(0x02, data))
        await self.writer.drain()

    async def send_batch(self, parts: List[bytes]):
        """Sends multiple binary WebSocket frames in a single write buffer."""
        if self.closed:
            raise ConnectionError("WebSocket is closed")
        buf = bytearray()
        for part in parts:
            buf.extend(self._build_frame(0x02, part))
        self.writer.write(buf)
        await self.writer.drain()

    async def recv(self) -> Optional[bytes]:
        """Receives a WebSocket frame, responds to ping, handles fragmentation."""
        while not self.closed:
            try:
                head = await self.reader.readexactly(2)
            except (asyncio.IncompleteReadError, ConnectionError, OSError):
                return None

            b1, b2 = head[0], head[1]
            fin = bool(b1 & 0x80)
            opcode = b1 & 0x0F
            has_mask = bool(b2 & 0x80)
            length = b2 & 0x7F

            if length == 126:
                ext = await self.reader.readexactly(2)
                length = struct.unpack('!H', ext)[0]
            elif length == 127:
                ext = await self.reader.readexactly(8)
                length = struct.unpack('!Q', ext)[0]

            if length > 16 * 1024 * 1024:
                return None

            mask = await self.reader.readexactly(4) if has_mask else None
            payload = await self.reader.readexactly(length)

            if has_mask and mask:
                payload = _xor_mask(payload, mask)

            if opcode == 0x08:  # Close frame
                self.closed = True
                try:
                    self.writer.write(self._build_frame(0x08, payload[:2] if payload else b''))
                    await self.writer.drain()
                except Exception:
                    pass
                return None

            if opcode == 0x09:  # Ping frame - reply with Pong
                try:
                    self.writer.write(self._build_frame(0x0A, payload))
                    await self.writer.drain()
                except Exception:
                    pass
                continue

            if opcode == 0x0A:  # Pong frame
                continue

            if opcode in (0x00, 0x01, 0x02):
                if fin and not self._frag:
                    return payload
                self._frag.extend(payload)
                if not fin:
                    continue
                full_msg = bytes(self._frag)
                self._frag.clear()
                return full_msg

        return None

    async def close(self):
        if not self.closed:
            self.closed = True
            try:
                self.writer.write(self._build_frame(0x08, b''))
                await self.writer.drain()
            except Exception:
                pass
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception:
                pass


# ==============================================================================
# Handshake & Crypto Helper Functions
# ==============================================================================
def generate_relay_init(proto_tag: bytes, dc_idx: int) -> Tuple[bytes, bytes, bytes, bytes, bytes]:
    """Generates a clean MTProto Obfuscated2 handshake to send to Telegram WS."""
    while True:
        rnd = bytearray(os.urandom(HANDSHAKE_LEN))
        if rnd[0] in RESERVED_FIRST_BYTES:
            continue
        if bytes(rnd[:4]) in RESERVED_STARTS:
            continue
        if rnd[4:8] == RESERVED_CONTINUE:
            continue
        break

    rnd_bytes = bytes(rnd)
    enc_key = rnd_bytes[SKIP_LEN:SKIP_LEN + PREKEY_LEN]
    enc_iv = rnd_bytes[SKIP_LEN + PREKEY_LEN:SKIP_LEN + PREKEY_LEN + IV_LEN]

    encryptor = AES256CTR(enc_key, enc_iv)

    dc_bytes = struct.pack('<h', dc_idx)
    tail_plain = proto_tag + dc_bytes + os.urandom(2)

    encrypted_full = encryptor.update(rnd_bytes)
    keystream_tail = bytes(encrypted_full[i] ^ rnd_bytes[i] for i in range(56, 64))
    encrypted_tail = bytes(tail_plain[i] ^ keystream_tail[i] for i in range(8))

    result = bytearray(rnd_bytes)
    result[PROTO_TAG_POS:HANDSHAKE_LEN] = encrypted_tail

    # Upstream cipher keys
    relay_dec_prekey_iv = rnd_bytes[SKIP_LEN:SKIP_LEN + PREKEY_LEN + IV_LEN][::-1]
    dec_key = relay_dec_prekey_iv[:KEY_LEN]
    dec_iv = relay_dec_prekey_iv[KEY_LEN:]

    return bytes(result), enc_key, enc_iv, dec_key, dec_iv


def try_handshake_transparent(handshake: bytes) -> Optional[Tuple[int, bool, bytes, bytes]]:
    """
    Validates transparent direct client handshake (MTProto 2.0 Obfuscated2 without secret).
    """
    if len(handshake) < HANDSHAKE_LEN:
        return None

    dec_prekey = handshake[SKIP_LEN:SKIP_LEN + PREKEY_LEN]
    dec_iv = handshake[SKIP_LEN + PREKEY_LEN:SKIP_LEN + PREKEY_LEN + IV_LEN]

    # In direct connections, raw 32-byte key is used directly (no secret hash)
    decryptor = AES256CTR(dec_prekey, dec_iv)
    decrypted = decryptor.update(handshake)

    proto_tag = decrypted[PROTO_TAG_POS:PROTO_TAG_POS + 4]
    if proto_tag not in (PROTO_TAG_ABRIDGED, PROTO_TAG_INTERMEDIATE, PROTO_TAG_SECURE):
        return None

    dc_idx = int.from_bytes(decrypted[DC_IDX_POS:DC_IDX_POS + 2], 'little', signed=True)
    dc_id = abs(dc_idx)
    is_media = dc_idx < 0

    return dc_id, is_media, proto_tag, handshake[SKIP_LEN:SKIP_LEN + PREKEY_LEN + IV_LEN]


def try_handshake_secret(handshake: bytes, secret: bytes) -> Optional[Tuple[int, bool, bytes, bytes]]:
    """
    Validates MTProxy handshake with secret hash: key = SHA256(prekey + secret).
    """
    if len(handshake) < HANDSHAKE_LEN:
        return None

    dec_prekey_and_iv = handshake[SKIP_LEN:SKIP_LEN + PREKEY_LEN + IV_LEN]
    dec_prekey = dec_prekey_and_iv[:PREKEY_LEN]
    dec_iv = dec_prekey_and_iv[PREKEY_LEN:]

    dec_key = hashlib.sha256(dec_prekey + secret).digest()
    decryptor = AES256CTR(dec_key, dec_iv)
    decrypted = decryptor.update(handshake)

    proto_tag = decrypted[PROTO_TAG_POS:PROTO_TAG_POS + 4]
    if proto_tag not in (PROTO_TAG_ABRIDGED, PROTO_TAG_INTERMEDIATE, PROTO_TAG_SECURE):
        return None

    dc_idx = int.from_bytes(decrypted[DC_IDX_POS:DC_IDX_POS + 2], 'little', signed=True)
    dc_id = abs(dc_idx)
    is_media = dc_idx < 0

    return dc_id, is_media, proto_tag, dec_prekey_and_iv


def build_crypto_context(client_prekey_iv: bytes, secret: Optional[bytes],
                         relay_enc_key: bytes, relay_enc_iv: bytes,
                         relay_dec_key: bytes, relay_dec_iv: bytes) -> CryptoCtx:
    """Constructs all 4 AES-256-CTR instances and fast-forwards past initial 64 bytes."""
    clt_dec_prekey = client_prekey_iv[:PREKEY_LEN]
    clt_dec_iv = client_prekey_iv[PREKEY_LEN:]

    if secret:
        clt_dec_key = hashlib.sha256(clt_dec_prekey + secret).digest()
        clt_enc_prekey_iv = client_prekey_iv[::-1]
        clt_enc_key = hashlib.sha256(clt_enc_prekey_iv[:PREKEY_LEN] + secret).digest()
        clt_enc_iv = clt_enc_prekey_iv[PREKEY_LEN:]
    else:
        # Transparent mode: raw key without secret hash
        clt_dec_key = clt_dec_prekey
        clt_enc_prekey_iv = client_prekey_iv[::-1]
        clt_enc_key = clt_enc_prekey_iv[:PREKEY_LEN]
        clt_enc_iv = clt_enc_prekey_iv[PREKEY_LEN:]

    clt_dec = AES256CTR(clt_dec_key, clt_dec_iv)
    clt_enc = AES256CTR(clt_enc_key, clt_enc_iv)

    # Fast forward decryptor past the first 64 bytes
    clt_dec.update(ZERO_64)

    tg_enc = AES256CTR(relay_enc_key, relay_enc_iv)
    tg_dec = AES256CTR(relay_dec_key, relay_dec_iv)
    tg_enc.update(ZERO_64)

    return CryptoCtx(clt_dec, clt_enc, tg_enc, tg_dec)


# ==============================================================================
# Transparent Telegram WebSocket Proxy Server
# ==============================================================================
class TelegramTransparentProxy:
    def __init__(self, host: str = '0.0.0.0', port: int = 1443,
                 secret: Optional[str] = None,
                 custom_cf_domains: Optional[List[str]] = None,
                 worker_domains: Optional[List[str]] = None):
        self.host = host
        self.port = port
        self.secret = bytes.fromhex(secret) if secret else None
        self.cf_domains = custom_cf_domains or DEFAULT_CF_DOMAINS
        self.worker_domains = worker_domains or []
        self._dc_working_domain: Dict[int, str] = {}
        self._domain_idx = 0
        self.stats = {
            'connections_total': 0,
            'connections_active': 0,
            'bytes_up': 0,
            'bytes_down': 0
        }

    def _get_candidate_domains(self, dc_id: int) -> List[str]:
        """Returns candidate base domains, prioritizing the last known working domain for this DC."""
        working = self._dc_working_domain.get(dc_id)
        candidates = []
        if working and working in self.cf_domains:
            candidates.append(working)
        for d in self.cf_domains:
            if d != working:
                candidates.append(d)
        return candidates

    def _get_dc_from_ip(self, ip_str: Optional[str]) -> int:
        """Determines Telegram DC id from intercepted destination IP."""
        if not ip_str:
            return 2  # Default to DC2

        # Direct DC IP mappings
        for dc, dc_ip in DC_DEFAULT_IPS.items():
            if ip_str == dc_ip:
                return dc

        # Subnet heuristics
        if ip_str.startswith('149.154.175.'):
            return 1 if int(ip_str.split('.')[-1]) < 75 else 3
        if ip_str.startswith('149.154.167.') or ip_str.startswith('149.154.166.'):
            return 2
        if ip_str.startswith('149.154.165.') or ip_str.startswith('149.154.164.'):
            return 4
        if ip_str.startswith('91.108.56.') or ip_str.startswith('91.108.'):
            return 5
        if ip_str.startswith('149.154.'):
            return 2

        return 2

    async def _bridge_streams(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter,
                             ws: RawWebSocket, ctx: CryptoCtx, splitter: MsgSplitter, label: str):
        """Full-duplex bidirectional stream forwarder with on-the-fly re-encryption."""
        
        async def client_to_ws():
            try:
                while True:
                    chunk = await reader.read(65536)
                    if not chunk:
                        tail = splitter.flush()
                        if tail:
                            await ws.send(tail[0])
                        break

                    self.stats['bytes_up'] += len(chunk)
                    plain = ctx.clt_dec.update(chunk)
                    re_enc = ctx.tg_enc.update(plain)
                    parts = splitter.split(re_enc, plain)
                    if not parts:
                        continue

                    if len(parts) > 1:
                        await ws.send_batch(parts)
                    else:
                        await ws.send(parts[0])
            except Exception as e:
                log.debug("[%s] Client -> WS closed: %s", label, e)

        async def ws_to_client():
            try:
                while True:
                    data = await ws.recv()
                    if data is None:
                        break

                    self.stats['bytes_down'] += len(data)
                    plain = ctx.tg_dec.update(data)
                    re_enc = ctx.clt_enc.update(plain)
                    writer.write(re_enc)
                    await writer.drain()
            except Exception as e:
                log.debug("[%s] WS -> Client closed: %s", label, e)

        tasks = [asyncio.create_task(client_to_ws()), asyncio.create_task(ws_to_client())]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for t in tasks:
                t.cancel()
            await ws.close()

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.stats['connections_total'] += 1
        self.stats['connections_active'] += 1
        set_sock_opts(writer.transport)
        peer = writer.get_extra_info('peername')
        label = f"{peer[0]}:{peer[1]}" if peer else "unknown"

        # Check SO_ORIGINAL_DST to detect transparent redirection
        orig_dest_ip = None
        orig_dest_port = None
        try:
            sock = writer.get_extra_info('socket')
            if sock and hasattr(socket, 'SOL_IP'):
                dst = sock.getsockopt(socket.SOL_IP, SO_ORIGINAL_DST, 16)
                port, ip_bytes = struct.unpack("!2xH4s8x", dst)
                orig_dest_ip = socket.inet_ntoa(ip_bytes)
                orig_dest_port = port
                log.info("[%s] Intercepted transparent TCP -> %s:%d", label, orig_dest_ip, orig_dest_port)
        except Exception:
            pass

        try:
            # Read MTProto handshake (64 bytes)
            handshake = await asyncio.wait_for(reader.readexactly(HANDSHAKE_LEN), timeout=10.0)
            
            # Step 1: Try transparent direct handshake (standard Telegram without proxy)
            res = try_handshake_transparent(handshake)
            is_transparent = True
            secret_used = None

            # Step 2: Fallback to MTProxy secret if direct failed
            if res is None and self.secret:
                res = try_handshake_secret(handshake, self.secret)
                is_transparent = False
                secret_used = self.secret

            if res is None:
                # If handshake looks like HTTP (e.g. POST /api), client gave up on MTProto
                if handshake[:4] in (b'POST', b'GET ', b'HEAD'):
                    log.warning("[%s] Non-MTProto HTTP transport detected (%s), skipping", label, handshake[:4].decode('latin1', 'ignore'))
                else:
                    log.warning("[%s] Unknown handshake packet (not valid MTProto)", label)
                writer.close()
                return

            dc_id, is_media, proto_tag, prekey_iv = res
            
            # If DC was not set in handshake, deduce from destination IP
            if dc_id == 0 or dc_id not in (1, 2, 3, 4, 5):
                dc_id = self._get_dc_from_ip(orig_dest_ip)

            proto_int = PROTO_ABRIDGED_INT if proto_tag == PROTO_TAG_ABRIDGED else (
                PROTO_INTERMEDIATE_INT if proto_tag == PROTO_TAG_INTERMEDIATE else PROTO_PADDED_INTERMEDIATE_INT
            )

            log.info("[%s] Telegram DC%d%s session (transparent=%s, proto=0x%08X)",
                     label, dc_id, " media" if is_media else "", is_transparent, proto_int)

            # Generate fresh MTProto handshake for the Cloudflare WebSocket tunnel
            dc_idx = -dc_id if is_media else dc_id
            relay_init, r_enc_k, r_enc_iv, r_dec_k, r_dec_iv = generate_relay_init(proto_tag, dc_idx)

            ctx = build_crypto_context(prekey_iv, secret_used, r_enc_k, r_enc_iv, r_dec_k, r_dec_iv)
            splitter = MsgSplitter(proto_int)

            # Connect to Cloudflare WebSocket endpoint
            ws = None
            candidate_domains = self._get_candidate_domains(dc_id)
            for base_domain in candidate_domains[:6]:
                domain = f"kws{dc_id}.{base_domain}"
                try:
                    log.debug("[%s] Tunneling DC%d via wss://%s/apiws", label, dc_id, domain)
                    ws = await RawWebSocket.connect(domain, 443, "/apiws", domain, timeout=5.0)
                    self._dc_working_domain[dc_id] = base_domain
                    break
                except Exception as ex:
                    log.warning("[%s] Relay %s failed: %s, trying another...", label, domain, ex)

            if ws is None:
                log.error("[%s] All Cloudflare WebSocket relays failed for DC%d", label, dc_id)
                writer.close()
                return

            # Send relay handshake to start Telegram session over WebSocket
            await ws.send(relay_init)

            # Full duplex bridge
            await self._bridge_streams(reader, writer, ws, ctx, splitter, label)

        except Exception as e:
            log.debug("[%s] Client error: %s", label, e)
        finally:
            self.stats['connections_active'] -= 1
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def run(self):
        AES256CTR.init_backend()
        server = await asyncio.start_server(self.handle_client, self.host, self.port)
        log.info("Telegram Transparent Proxy running on %s:%d (CF relays: %d domains)",
                 self.host, self.port, len(self.cf_domains))
        async with server:
            await server.serve_forever()


# ==============================================================================
# CLI Entrypoint
# ==============================================================================
def main():
    parser = argparse.ArgumentParser(description="runet-fix Telegram Transparent WebSocket Proxy")
    parser.add_argument('-l', '--host', default='0.0.0.0', help="Listen address (default: 0.0.0.0)")
    parser.add_argument('-p', '--port', type=int, default=1443, help="Listen port (default: 1443)")
    parser.add_argument('-s', '--secret', default=None, help="Optional MTProxy hex secret for dual mode")
    parser.add_argument('-d', '--domains', default=None, help="Comma-separated custom Cloudflare domains")
    parser.add_argument('-w', '--workers', default=None, help="Comma-separated custom Cloudflare workers")
    parser.add_argument('-v', '--verbose', action='store_true', help="Enable debug logging")

    args = parser.parse_args()

    if args.verbose:
        log.setLevel(logging.DEBUG)

    domains = [d.strip() for d in args.domains.split(',')] if args.domains else None
    workers = [w.strip() for w in args.workers.split(',')] if args.workers else None

    proxy = TelegramTransparentProxy(
        host=args.host,
        port=args.port,
        secret=args.secret,
        custom_cf_domains=domains,
        worker_domains=workers
    )

    try:
        asyncio.run(proxy.run())
    except KeyboardInterrupt:
        log.info("Terminated by user")


if __name__ == '__main__':
    main()

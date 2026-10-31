use aes::Aes256;
use ctr::cipher::{KeyIvInit, StreamCipher};
use ctr::Ctr128BE;
use rand::RngCore;
use sha2::{Digest, Sha256};

pub type AesCtr = Ctr128BE<Aes256>;

pub const HANDSHAKE_LEN: usize = 64;
pub const SKIP_LEN: usize = 8;
pub const PREKEY_LEN: usize = 32;
pub const IV_LEN: usize = 16;
pub const PROTO_TAG_POS: usize = 56;
pub const DC_IDX_POS: usize = 60;

pub const PROTO_TAG_ABRIDGED: u32 = 0xEFEFEFEF;
pub const PROTO_TAG_INTERMEDIATE: u32 = 0xEEEEEEEE;
pub const PROTO_TAG_SECURE: u32 = 0xDDDDDDDD;

/// Holds the cryptographic state for both legs of the proxy connection:
/// - Client leg: communicates with LAN client (usually Abridged over TCP)
/// - Telegram leg: communicates with upstream Cloudflare/Telegram WS (Intermediate)
pub struct CryptoContext {
    pub client_dec: AesCtr,
    pub client_enc: AesCtr,
    pub tg_enc: AesCtr,
    pub tg_dec: AesCtr,
}

pub struct HandshakeResult {
    pub dc_id: u8,
    pub is_media: bool,
    pub proto_tag: u32,
    pub client_dec_prekey_iv: [u8; 48],
}

/// Parses the 64-byte client Obfuscated2 handshake.
///
/// If `secret` is provided, computes:
///   key = SHA256(prekey + secret)
/// If `secret` is None (Transparent proxy mode), uses prekey directly as AES key.
pub fn parse_client_handshake(
    handshake: &[u8; HANDSHAKE_LEN],
    secret: Option<&[u8]>,
) -> Option<HandshakeResult> {
    let mut prekey_iv = [0u8; 48];
    prekey_iv.copy_from_slice(&handshake[SKIP_LEN..SKIP_LEN + PREKEY_LEN + IV_LEN]);

    let prekey = &prekey_iv[..PREKEY_LEN];
    let iv = &prekey_iv[PREKEY_LEN..];

    let dec_key: [u8; 32] = match secret {
        Some(s) => {
            let mut hasher = Sha256::new();
            hasher.update(prekey);
            hasher.update(s);
            hasher.finalize().into()
        }
        None => {
            let mut k = [0u8; 32];
            k.copy_from_slice(prekey);
            k
        }
    };

    let mut decryptor = AesCtr::new(&dec_key.into(), iv.into());
    let mut decrypted = *handshake;
    decryptor.apply_keystream(&mut decrypted);

    let proto_tag = u32::from_le_bytes([
        decrypted[PROTO_TAG_POS],
        decrypted[PROTO_TAG_POS + 1],
        decrypted[PROTO_TAG_POS + 2],
        decrypted[PROTO_TAG_POS + 3],
    ]);

    if proto_tag != PROTO_TAG_ABRIDGED
        && proto_tag != PROTO_TAG_INTERMEDIATE
        && proto_tag != PROTO_TAG_SECURE
    {
        return None;
    }

    let dc_idx = i16::from_le_bytes([decrypted[DC_IDX_POS], decrypted[DC_IDX_POS + 1]]);
    let dc_id = dc_idx.unsigned_abs() as u8;
    let is_media = dc_idx < 0;

    Some(HandshakeResult {
        dc_id: if dc_id == 0 { 2 } else { dc_id },
        is_media,
        proto_tag,
        client_dec_prekey_iv: prekey_iv,
    })
}

/// Generates a valid 64-byte obfuscated handshake for upstream Telegram/Cloudflare connection.
///
/// Ensures the first byte and first word do not collide with HTTP/TLS prefixes,
/// computes the encrypted protocol tag and DC index, and sets up upstream AES-CTR ciphers.
pub fn generate_relay_init(
    upstream_proto: u32,
    dc_idx: i16,
) -> ([u8; HANDSHAKE_LEN], AesCtr, AesCtr) {
    let mut rng = rand::thread_rng();
    let mut rnd = [0u8; HANDSHAKE_LEN];

    loop {
        rng.fill_bytes(&mut rnd);

        // Reserved first bytes check (avoid collisions with raw Abridged 0xef)
        if rnd[0] == 0xEF {
            continue;
        }

        // Avoid HTTP verbs (HEAD, POST, GET , OPTI) or TLS (0x16 0x03)
        let first_4 = &rnd[0..4];
        if first_4 == b"HEAD"
            || first_4 == b"POST"
            || first_4 == b"GET "
            || first_4 == b"OPTI"
            || first_4 == &[0xEE, 0xEE, 0xEE, 0xEE]
            || first_4 == &[0xDD, 0xDD, 0xDD, 0xDD]
            || first_4 == &[0x16, 0x03, 0x01, 0x02]
        {
            continue;
        }

        // Avoid 0x00000000 continuation
        if &rnd[4..8] == &[0, 0, 0, 0] {
            continue;
        }

        break;
    }

    let enc_key = &rnd[SKIP_LEN..SKIP_LEN + PREKEY_LEN];
    let enc_iv = &rnd[SKIP_LEN + PREKEY_LEN..SKIP_LEN + PREKEY_LEN + IV_LEN];

    let mut encryptor = AesCtr::new(enc_key.into(), enc_iv.into());

    // Build plain tail (8 bytes): proto_tag (4) + dc_idx (2) + random padding (2)
    let mut tail_plain = [0u8; 8];
    tail_plain[0..4].copy_from_slice(&upstream_proto.to_le_bytes());
    tail_plain[4..6].copy_from_slice(&dc_idx.to_le_bytes());
    rng.fill_bytes(&mut tail_plain[6..8]);

    // Encrypt the full 64 bytes to extract keystream for tail
    let mut encrypted_full = rnd;
    encryptor.apply_keystream(&mut encrypted_full);

    let mut encrypted_tail = [0u8; 8];
    for i in 0..8 {
        let keystream = encrypted_full[56 + i] ^ rnd[56 + i];
        encrypted_tail[i] = tail_plain[i] ^ keystream;
    }

    rnd[56..64].copy_from_slice(&encrypted_tail);

    // Compute reverse keys for tg_dec
    let mut dec_prekey_iv = [0u8; 48];
    dec_prekey_iv.copy_from_slice(&rnd[SKIP_LEN..SKIP_LEN + PREKEY_LEN + IV_LEN]);
    dec_prekey_iv.reverse();

    let dec_key = &dec_prekey_iv[0..32];
    let dec_iv = &dec_prekey_iv[32..48];

    let mut tg_enc = AesCtr::new(enc_key.into(), enc_iv.into());
    let tg_dec = AesCtr::new(dec_key.into(), dec_iv.into());

    // Advance tg_enc past the 64-byte handshake
    let mut discard = [0u8; 64];
    tg_enc.apply_keystream(&mut discard);

    (rnd, tg_enc, tg_dec)
}

/// Creates the full CryptoContext containing all 4 stream ciphers.
pub fn build_crypto_context(
    client_prekey_iv: &[u8; 48],
    secret: Option<&[u8]>,
    tg_enc: AesCtr,
    tg_dec: AesCtr,
) -> CryptoContext {
    let clt_dec_prekey = &client_prekey_iv[..PREKEY_LEN];
    let clt_dec_iv = &client_prekey_iv[PREKEY_LEN..];

    let mut clt_enc_prekey_iv = *client_prekey_iv;
    clt_enc_prekey_iv.reverse();

    let (clt_dec_key, clt_enc_key): ([u8; 32], [u8; 32]) = match secret {
        Some(s) => {
            let mut h1 = Sha256::new();
            h1.update(clt_dec_prekey);
            h1.update(s);
            let dec_k = h1.finalize().into();

            let mut h2 = Sha256::new();
            h2.update(&clt_enc_prekey_iv[..PREKEY_LEN]);
            h2.update(s);
            let enc_k = h2.finalize().into();

            (dec_k, enc_k)
        }
        None => {
            let mut dec_k = [0u8; 32];
            dec_k.copy_from_slice(clt_dec_prekey);
            let mut enc_k = [0u8; 32];
            enc_k.copy_from_slice(&clt_enc_prekey_iv[..PREKEY_LEN]);
            (dec_k, enc_k)
        }
    };

    let clt_enc_iv = &clt_enc_prekey_iv[PREKEY_LEN..];

    let mut client_dec = AesCtr::new(&clt_dec_key.into(), clt_dec_iv.into());
    let client_enc = AesCtr::new(&clt_enc_key.into(), clt_enc_iv.into());

    // Advance client_dec past the client's 64-byte handshake
    let mut discard = [0u8; 64];
    client_dec.apply_keystream(&mut discard);

    CryptoContext {
        client_dec,
        client_enc,
        tg_enc,
        tg_dec,
    }
}

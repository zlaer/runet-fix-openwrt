use ctr::cipher::StreamCipher;
use std::io;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};

use super::handshake::{CryptoContext, PROTO_TAG_ABRIDGED};
use super::ws::RawWebSocket;

/// Translates and bridges traffic bi-directionally between LAN client (TCP)
/// and upstream Telegram / Cloudflare relay (WebSocket).
///
/// Handles MTProto protocol framing adaptation:
/// Upstream WebSocket always expects individual MTProto INTERMEDIATE frames.
/// Clients typically use ABRIDGED framing (1-4 byte variable length headers).
pub async fn bridge_stream(
    mut client_read: OwnedReadHalf,
    mut client_write: OwnedWriteHalf,
    mut ws: RawWebSocket,
    mut ctx: CryptoContext,
    client_proto: u32,
    label: &str,
) -> io::Result<()> {
    let mut client_buf = Vec::with_capacity(16384);
    let mut ws_recv_buf = Vec::with_capacity(16384);

    let mut tcp_read_buf = [0u8; 8192];

    log::debug!(
        "[{}] Bridge stream started (proto=0x{:08X})",
        label,
        client_proto
    );

    loop {
        tokio::select! {
            // Leg 1: Client TCP -> Decrypt -> Re-frame -> Encrypt -> Upstream WS
            res = client_read.read(&mut tcp_read_buf) => {
                let n = res?;
                if n == 0 {
                    log::debug!("[{}] Client closed connection (EOF)", label);
                    let _ = ws.close().await;
                    break;
                }

                let chunk = &mut tcp_read_buf[..n];
                ctx.client_dec.apply_keystream(chunk);
                client_buf.extend_from_slice(chunk);

                // Parse MTProto frames and forward to WebSocket
                if client_proto == PROTO_TAG_ABRIDGED {
                    while !client_buf.is_empty() {
                        let first = client_buf[0];
                        let qa = (first & 0x80) != 0;
                        let Some((hdr_len, payload_len)) = parse_abridged_header(&client_buf) else {
                            break;
                        };

                        if payload_len > 16 * 1024 * 1024 {
                            return Err(io::Error::new(io::ErrorKind::InvalidData, "Client payload length exceeds 16MB"));
                        }

                        let total_len = hdr_len + payload_len;
                        if client_buf.len() < total_len {
                            break;
                        }

                        let body = &client_buf[hdr_len..total_len];

                        // Convert to MTProto Intermediate frame
                        let inter_len = (payload_len as u32) | (if qa { 0x80000000 } else { 0 });
                        let mut inter_pkt = Vec::with_capacity(4 + payload_len);
                        inter_pkt.extend_from_slice(&inter_len.to_le_bytes());
                        inter_pkt.extend_from_slice(body);

                        // Encrypt with tg_enc
                        ctx.tg_enc.apply_keystream(&mut inter_pkt);

                        // Send as binary WebSocket frame
                        ws.send_binary(&inter_pkt).await?;

                        client_buf.drain(..total_len);
                    }
                } else {
                    // Intermediate framing from client
                    while client_buf.len() >= 4 {
                        let raw_len = u32::from_le_bytes([
                            client_buf[0],
                            client_buf[1],
                            client_buf[2],
                            client_buf[3],
                        ]);
                        let payload_len = (raw_len & 0x7FFFFFFF) as usize;
                        let total_len = 4 + payload_len;

                        if payload_len > 16 * 1024 * 1024 {
                            return Err(io::Error::new(io::ErrorKind::InvalidData, "Client payload length exceeds 16MB"));
                        }

                        if client_buf.len() < total_len {
                            break;
                        }

                        let mut pkt = client_buf[..total_len].to_vec();
                        ctx.tg_enc.apply_keystream(&mut pkt);
                        ws.send_binary(&pkt).await?;

                        client_buf.drain(..total_len);
                    }
                }
            }

            // Leg 2: Upstream WS -> Decrypt -> Convert Framing -> Encrypt -> Client TCP
            res = ws.recv_binary(&mut ws_recv_buf) => {
                let n = res?;
                if n == 0 {
                    log::debug!("[{}] Upstream WebSocket closed connection", label);
                    let _ = client_write.shutdown().await;
                    break;
                }

                // Decrypt received payload in-place
                let start_idx = ws_recv_buf.len() - n;
                ctx.tg_dec.apply_keystream(&mut ws_recv_buf[start_idx..]);

                // Parse Intermediate frames from upstream
                while ws_recv_buf.len() >= 4 {
                    let raw_len = u32::from_le_bytes([
                        ws_recv_buf[0],
                        ws_recv_buf[1],
                        ws_recv_buf[2],
                        ws_recv_buf[3],
                    ]);
                    let payload_len = (raw_len & 0x7FFFFFFF) as usize;
                    let total_len = 4 + payload_len;

                    if payload_len > 16 * 1024 * 1024 {
                        return Err(io::Error::new(io::ErrorKind::InvalidData, "Upstream payload length exceeds 16MB"));
                    }

                    if ws_recv_buf.len() < total_len {
                        break;
                    }

                    let body = &ws_recv_buf[4..total_len];

                    // Format packet for client (abridged is re-framed, intermediate /
                    // padded-intermediate are forwarded verbatim).
                    let mut client_pkt = build_client_frame(raw_len, body, client_proto);

                    // Encrypt with client_enc
                    ctx.client_enc.apply_keystream(&mut client_pkt);

                    // Write to client TCP socket
                    client_write.write_all(&client_pkt).await?;

                    ws_recv_buf.drain(..total_len);
                }
                client_write.flush().await?;
            }
        }
    }

    Ok(())
}

/// Parses an MTProto abridged header from the start of `buf`.
///
/// Returns `(header_len, payload_len)`, or `None` when the buffer does not yet
/// contain the full header (`0x7F`/`0xFF` selects the 4-byte form).
fn parse_abridged_header(buf: &[u8]) -> Option<(usize, usize)> {
    let first = *buf.first()?;
    if first == 0x7F || first == 0xFF {
        if buf.len() < 4 {
            return None;
        }
        let words = u32::from_le_bytes([buf[1], buf[2], buf[3], 0]) as usize;
        Some((4, words * 4))
    } else {
        Some((1, (first & 0x7F) as usize * 4))
    }
}

/// Builds an MTProto frame for the client from an upstream intermediate payload.
///
/// Abridged clients get a re-framed packet. Intermediate (`0xEEEEEEEE`) and
/// padded-intermediate (`0xDDDDDDDD`) clients receive the upstream frame
/// verbatim, including its original length prefix and padding.
fn build_client_frame(raw_len: u32, body: &[u8], client_proto: u32) -> Vec<u8> {
    let mut client_pkt = Vec::with_capacity(body.len() + 8);
    if client_proto == PROTO_TAG_ABRIDGED {
        // Align to 4 bytes if necessary
        let mut padded_body = body.to_vec();
        let rem = padded_body.len() % 4;
        if rem != 0 {
            padded_body.resize(padded_body.len() + (4 - rem), 0);
        }

        let qa = (raw_len & 0x8000_0000) != 0;
        let words = padded_body.len() / 4;
        if words < 0x7F {
            client_pkt.push((words as u8) | (if qa { 0x80 } else { 0 }));
        } else {
            client_pkt.push(if qa { 0xFF } else { 0x7F });
            let w_bytes = (words as u32).to_le_bytes();
            client_pkt.extend_from_slice(&w_bytes[0..3]);
        }
        client_pkt.extend_from_slice(&padded_body);
    } else {
        // Intermediate / padded-intermediate framing is forwarded as-is.
        client_pkt.extend_from_slice(&raw_len.to_le_bytes());
        client_pkt.extend_from_slice(body);
    }
    client_pkt
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proxy::handshake::{PROTO_TAG_INTERMEDIATE, PROTO_TAG_SECURE};

    #[test]
    fn test_padded_intermediate_forwarded_verbatim() {
        assert_eq!(PROTO_TAG_SECURE, 0xDDDD_DDDD);

        // Payload plus padding, as produced by a padded-intermediate client.
        let body = [0x11u8, 0x22, 0x33, 0x44, 0x00, 0x00, 0x00, 0x00];
        let raw_len = body.len() as u32;
        let pkt = build_client_frame(raw_len, &body, PROTO_TAG_SECURE);

        assert_eq!(&pkt[..4], &raw_len.to_le_bytes()[..]);
        assert_eq!(&pkt[4..], &body[..]);
    }

    #[test]
    fn test_intermediate_forwarded_verbatim() {
        assert_eq!(PROTO_TAG_INTERMEDIATE, 0xEEEE_EEEE);

        let body = [0xAAu8; 12];
        let raw_len = 0x8000_0000 | body.len() as u32; // quick-ack bit preserved
        let pkt = build_client_frame(raw_len, &body, PROTO_TAG_INTERMEDIATE);

        assert_eq!(&pkt[..4], &raw_len.to_le_bytes()[..]);
        assert_eq!(&pkt[4..], &body[..]);
    }

    #[test]
    fn test_abridged_frame_conversion() {
        // 4-byte payload -> one-word header.
        let body = [0xDE, 0xAD, 0xBE, 0xEF];
        let pkt = build_client_frame(body.len() as u32, &body, PROTO_TAG_ABRIDGED);
        assert_eq!(pkt, [1, 0xDE, 0xAD, 0xBE, 0xEF]);

        // Quick-ack bit is carried over.
        let pkt = build_client_frame(0x8000_0000 | 4, &body, PROTO_TAG_ABRIDGED);
        assert_eq!(pkt[0], 0x81);

        // Payload not aligned to 4 bytes is zero-padded.
        let pkt = build_client_frame(5, &[1, 2, 3, 4, 5], PROTO_TAG_ABRIDGED);
        assert_eq!(pkt, [2, 1, 2, 3, 4, 5, 0, 0, 0]);

        // Long payload uses the 4-byte header form.
        let body = vec![0u8; 0x200]; // 128 words
        let pkt = build_client_frame(body.len() as u32, &body, PROTO_TAG_ABRIDGED);
        assert_eq!(pkt[0], 0x7F);
        assert_eq!(&pkt[1..4], &(128u32).to_le_bytes()[..3]);
    }

    #[test]
    fn test_short_or_broken_abridged_header() {
        assert_eq!(parse_abridged_header(&[]), None);
        assert_eq!(parse_abridged_header(&[0x7F]), None);
        assert_eq!(parse_abridged_header(&[0xFF, 0x01, 0x00]), None);

        assert_eq!(parse_abridged_header(&[0x02]), Some((1, 8)));
        assert_eq!(parse_abridged_header(&[0x82]), Some((1, 8)));
        assert_eq!(
            parse_abridged_header(&[0x7F, 0x40, 0x00, 0x00]),
            Some((4, 256))
        );
    }
}

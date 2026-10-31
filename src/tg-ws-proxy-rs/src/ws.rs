use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rand::RngCore;
use std::io;
use std::sync::Arc;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_rustls::client::TlsStream;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::ClientConfig;
use tokio_rustls::TlsConnector;

use crate::orig_dst::{set_outbound_mark, DEFAULT_OUTBOUND_MARK};

pub const WS_OP_CONT: u8 = 0x0;
pub const WS_OP_TEXT: u8 = 0x1;
pub const WS_OP_BINARY: u8 = 0x2;
pub const WS_OP_CLOSE: u8 = 0x8;
pub const WS_OP_PING: u8 = 0x9;
pub const WS_OP_PONG: u8 = 0xA;

pub enum WsStream {
    Plain(TcpStream),
    Tls(Box<TlsStream<TcpStream>>),
}

impl AsyncRead for WsStream {
    fn poll_read(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<io::Result<()>> {
        match self.get_mut() {
            WsStream::Plain(s) => std::pin::Pin::new(s).poll_read(cx, buf),
            WsStream::Tls(s) => std::pin::Pin::new(s.as_mut()).poll_read(cx, buf),
        }
    }
}

impl AsyncWrite for WsStream {
    fn poll_write(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<io::Result<usize>> {
        match self.get_mut() {
            WsStream::Plain(s) => std::pin::Pin::new(s).poll_write(cx, buf),
            WsStream::Tls(s) => std::pin::Pin::new(s.as_mut()).poll_write(cx, buf),
        }
    }

    fn poll_flush(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<io::Result<()>> {
        match self.get_mut() {
            WsStream::Plain(s) => std::pin::Pin::new(s).poll_flush(cx),
            WsStream::Tls(s) => std::pin::Pin::new(s.as_mut()).poll_flush(cx),
        }
    }

    fn poll_shutdown(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<io::Result<()>> {
        match self.get_mut() {
            WsStream::Plain(s) => std::pin::Pin::new(s).poll_shutdown(cx),
            WsStream::Tls(s) => std::pin::Pin::new(s.as_mut()).poll_shutdown(cx),
        }
    }
}

/// Lightweight, standalone RFC 6455 WebSocket client implementation
pub struct RawWebSocket {
    stream: WsStream,
    read_buf: Vec<u8>,
}

impl RawWebSocket {
    /// Creates a shared Rustls ClientConfig using bundled Mozilla root certificates.
    pub fn create_tls_config() -> Arc<ClientConfig> {
        let root_store = tokio_rustls::rustls::RootCertStore {
            roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
        };

        let config = ClientConfig::builder()
            .with_root_certificates(root_store)
            .with_no_client_auth();

        Arc::new(config)
    }

    /// Connects to a WebSocket endpoint over TLS or plain TCP, executes the HTTP 101 upgrade handshake.
    pub async fn connect(
        host: &str,
        domain: &str,
        port: u16,
        path: &str,
        tls_config: Option<Arc<ClientConfig>>,
        timeout_dur: std::time::Duration,
    ) -> io::Result<Self> {
        tokio::time::timeout(timeout_dur, async move {
            let addr = format!("{}:{}", host, port);
            let tcp = TcpStream::connect(&addr).await?;
            let _ = tcp.set_nodelay(true);
            let _ = set_outbound_mark(&tcp, DEFAULT_OUTBOUND_MARK);

            let stream = if let Some(cfg) = tls_config {
                let connector = TlsConnector::from(cfg);
                let server_name = ServerName::try_from(domain.to_string())
                    .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, format!("Invalid SNI: {:?}", e)))?;
                let tls_stream = connector.connect(server_name, tcp).await?;
                WsStream::Tls(Box::new(tls_stream))
            } else {
                WsStream::Plain(tcp)
            };

            let mut ws = RawWebSocket {
                stream,
                read_buf: Vec::with_capacity(4096),
            };

            ws.perform_http_upgrade(domain, path).await?;
            Ok(ws)
        })
        .await
        .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "WebSocket handshake timed out"))?
    }

    async fn perform_http_upgrade(&mut self, domain: &str, path: &str) -> io::Result<()> {
        let mut key_bytes = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut key_bytes);
        let sec_key = BASE64.encode(key_bytes);

        let req = format!(
            "GET {} HTTP/1.1\r\n\
             Host: {}\r\n\
             Upgrade: websocket\r\n\
             Connection: Upgrade\r\n\
             Sec-WebSocket-Key: {}\r\n\
             Sec-WebSocket-Version: 13\r\n\
             User-Agent: tg-ws-proxy-rs/0.2.0\r\n\
             \r\n",
            path, domain, sec_key
        );

        self.stream.write_all(req.as_bytes()).await?;
        self.stream.flush().await?;

        // Read HTTP response header up to \r\n\r\n
        let mut header_buf = [0u8; 2048];
        let mut total_read = 0;
        let mut header_end = None;

        while total_read < header_buf.len() {
            let n = self.stream.read(&mut header_buf[total_read..]).await?;
            if n == 0 {
                return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "HTTP upgrade EOF"));
            }
            total_read += n;

            if let Some(pos) = header_buf[..total_read].windows(4).position(|w| w == b"\r\n\r\n") {
                header_end = Some(pos + 4);
                break;
            }
        }

        let end_idx = header_end.ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidData, "HTTP upgrade response headers too large")
        })?;

        let header_str = String::from_utf8_lossy(&header_buf[..end_idx]);
        let first_line = header_str.lines().next().unwrap_or("");
        if !first_line.contains("101") {
            return Err(io::Error::new(
                io::ErrorKind::ConnectionRefused,
                format!("WebSocket Upgrade failed: {}", first_line),
            ));
        }

        // Store any leftover body bytes in read_buf
        if total_read > end_idx {
            self.read_buf.extend_from_slice(&header_buf[end_idx..total_read]);
        }

        Ok(())
    }

    /// Sends a binary WebSocket frame with 4-byte client masking.
    pub async fn send_binary(&mut self, payload: &[u8]) -> io::Result<()> {
        let mut header = [0u8; 14];
        header[0] = 0x80 | WS_OP_BINARY; // FIN bit set + binary opcode

        let len = payload.len();
        let (hdr_len, mask_offset) = if len < 126 {
            header[1] = 0x80 | (len as u8); // Mask bit set
            (2 + 4, 2)
        } else if len <= 0xFFFF {
            header[1] = 0x80 | 126;
            header[2] = ((len >> 8) & 0xFF) as u8;
            header[3] = (len & 0xFF) as u8;
            (4 + 4, 4)
        } else {
            header[1] = 0x80 | 127;
            header[2..10].copy_from_slice(&(len as u64).to_be_bytes());
            (10 + 4, 10)
        };

        let mut mask = [0u8; 4];
        rand::thread_rng().fill_bytes(&mut mask);
        header[mask_offset..mask_offset + 4].copy_from_slice(&mask);

        // Send frame header
        self.stream.write_all(&header[..hdr_len]).await?;

        // Mask payload and send
        let mut masked_payload = payload.to_vec();
        for (i, byte) in masked_payload.iter_mut().enumerate() {
            *byte ^= mask[i % 4];
        }
        self.stream.write_all(&masked_payload).await?;
        self.stream.flush().await?;

        Ok(())
    }

    /// Receives a binary frame from the server, transparently answering PINGs with PONG.
    pub async fn recv_binary(&mut self, out_buf: &mut Vec<u8>) -> io::Result<usize> {
        loop {
            // Read 2-byte header
            while self.read_buf.len() < 2 {
                let mut tmp = [0u8; 4096];
                let n = self.stream.read(&mut tmp).await?;
                if n == 0 {
                    return Ok(0); // EOF
                }
                self.read_buf.extend_from_slice(&tmp[..n]);
            }

            let b0 = self.read_buf[0];
            let b1 = self.read_buf[1];
            let opcode = b0 & 0x0F;
            let is_masked = (b1 & 0x80) != 0;
            let mut payload_len = (b1 & 0x7F) as usize;

            let mut header_size = 2;
            if payload_len == 126 {
                header_size += 2;
            } else if payload_len == 127 {
                header_size += 8;
            }
            if is_masked {
                header_size += 4;
            }

            // Ensure full header is read
            while self.read_buf.len() < header_size {
                let mut tmp = [0u8; 4096];
                let n = self.stream.read(&mut tmp).await?;
                if n == 0 {
                    return Ok(0);
                }
                self.read_buf.extend_from_slice(&tmp[..n]);
            }

            let mut offset = 2;
            if payload_len == 126 {
                payload_len = u16::from_be_bytes([self.read_buf[2], self.read_buf[3]]) as usize;
                offset += 2;
            } else if payload_len == 127 {
                let mut len_bytes = [0u8; 8];
                len_bytes.copy_from_slice(&self.read_buf[2..10]);
                payload_len = u64::from_be_bytes(len_bytes) as usize;
                offset += 8;
            }

            let mask = if is_masked {
                let mut m = [0u8; 4];
                m.copy_from_slice(&self.read_buf[offset..offset + 4]);
                offset += 4;
                Some(m)
            } else {
                None
            };

            // Ensure complete payload is available
            let total_frame = header_size + payload_len;
            while self.read_buf.len() < total_frame {
                let needed = total_frame - self.read_buf.len();
                let to_read = needed.min(65536);
                let mut tmp = vec![0u8; to_read];
                let n = self.stream.read(&mut tmp).await?;
                if n == 0 {
                    return Ok(0);
                }
                self.read_buf.extend_from_slice(&tmp[..n]);
            }

            let mut payload = self.read_buf[header_size..total_frame].to_vec();
            if let Some(m) = mask {
                for (i, byte) in payload.iter_mut().enumerate() {
                    *byte ^= m[i % 4];
                }
            }

            // Drain processed frame from read_buf
            self.read_buf.drain(..total_frame);

            match opcode {
                WS_OP_BINARY | WS_OP_CONT => {
                    let n = payload.len();
                    out_buf.extend_from_slice(&payload);
                    return Ok(n);
                }
                WS_OP_PING => {
                    self.send_pong(&payload).await?;
                    continue;
                }
                WS_OP_CLOSE => {
                    return Ok(0);
                }
                _ => {
                    continue;
                }
            }
        }
    }

    pub async fn send_ping(&mut self) -> io::Result<()> {
        let frame = [0x80 | WS_OP_PING, 0x80, 0x12, 0x34, 0x56, 0x78]; // Masked empty ping
        self.stream.write_all(&frame).await?;
        self.stream.flush().await?;
        Ok(())
    }

    async fn send_pong(&mut self, payload: &[u8]) -> io::Result<()> {
        let mut header = [0u8; 10];
        header[0] = 0x80 | WS_OP_PONG;
        header[1] = 0x80 | (payload.len() as u8);
        let mut mask = [0u8; 4];
        rand::thread_rng().fill_bytes(&mut mask);
        header[2..6].copy_from_slice(&mask);

        self.stream.write_all(&header[..6]).await?;
        let mut masked = payload.to_vec();
        for (i, b) in masked.iter_mut().enumerate() {
            *b ^= mask[i % 4];
        }
        self.stream.write_all(&masked).await?;
        self.stream.flush().await?;
        Ok(())
    }

    pub async fn close(&mut self) -> io::Result<()> {
        let close_frame = [0x80 | WS_OP_CLOSE, 0x80, 0, 0, 0, 0];
        let _ = self.stream.write_all(&close_frame).await;
        let _ = self.stream.flush().await;
        let _ = self.stream.shutdown().await;
        Ok(())
    }
}

import asyncio
import unittest

from .tg_ws_proxy import _handle_http_api, MAX_HTTP_BODY


class HttpApiLimitTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.server = None
        self.port = None

        async def _client_connected(reader, writer):
            handshake = await reader.read(16)
            await _handle_http_api(
                reader=reader,
                writer=writer,
                handshake=handshake,
                orig_dest_ip="149.154.167.51",
                orig_dest_port=443,
                label="test-http",
            )
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

        self.server = await asyncio.start_server(_client_connected, "127.0.0.1", 0)
        self.port = self.server.sockets[0].getsockname()[1]

    async def asyncTearDown(self):
        if self.server:
            self.server.close()
            await self.server.wait_closed()

    async def _send_raw(self, payload: bytes) -> bytes:
        reader, writer = await asyncio.open_connection("127.0.0.1", self.port)
        writer.write(payload)
        await writer.drain()
        data = await reader.read(4096)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return data

    async def test_options_request_returns_200(self):
        req = b"OPTIONS /api HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
        resp = await self._send_raw(req)
        self.assertTrue(resp.startswith(b"HTTP/1.1 200 OK"))

    async def test_invalid_content_length_returns_400(self):
        req_neg = b"POST /api HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: -1\r\n\r\n"
        resp = await self._send_raw(req_neg)
        self.assertTrue(resp.startswith(b"HTTP/1.1 400 Bad Request"))

        req_alpha = b"POST /api HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: invalid\r\n\r\n"
        resp_alpha = await self._send_raw(req_alpha)
        self.assertTrue(resp_alpha.startswith(b"HTTP/1.1 400 Bad Request"))

    async def test_oversized_content_length_returns_413(self):
        req = (
            f"POST /api HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: {MAX_HTTP_BODY + 1}\r\n\r\n"
        ).encode("ascii")
        resp = await self._send_raw(req)
        self.assertTrue(resp.startswith(b"HTTP/1.1 413 Payload Too Large"))


if __name__ == "__main__":
    unittest.main()

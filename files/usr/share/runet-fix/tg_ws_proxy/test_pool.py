import time
import unittest

from .pool import _CfWorkerPool
from .raw_websocket import WsHandshakeError


class CfWorkerRateLimitTest(unittest.TestCase):
    def setUp(self):
        self.pool = _CfWorkerPool()
        self.domain = "worker.example"

    def _remaining(self):
        return self.pool._exhausted_until[self.domain] - time.time()

    def test_429_honours_retry_after(self):
        exc = WsHandshakeError(429, "Too Many Requests",
                               {"retry-after": "120"})
        self.pool.report_failure(self.domain, exc)
        self.assertGreater(self._remaining(), 100)
        self.assertLessEqual(self._remaining(), 125)

    def test_429_without_retry_after_uses_min_backoff(self):
        self.pool.report_failure(
            self.domain, WsHandshakeError(429, "Too Many Requests"))
        self.assertGreaterEqual(
            self._remaining(), self.pool.RATE_LIMIT_MIN_BACKOFF - 1)

    def test_repeated_429_is_capped(self):
        for _ in range(self.pool.RATE_LIMIT_MAX_RETRIES + 1):
            # Simulate the previous backoff window expiring.
            self.pool._exhausted_until.clear()
            self.pool.report_failure(
                self.domain,
                WsHandshakeError(429, "Too Many Requests",
                                 {"retry-after": "60"}))
        self.assertGreaterEqual(
            self._remaining(), self.pool.RATE_LIMIT_MAX_BACKOFF - 1)

    def test_non_429_is_ignored(self):
        self.pool.report_failure(
            self.domain, WsHandshakeError(500, "Internal Server Error"))
        self.assertNotIn(self.domain, self.pool._exhausted_until)

    def test_available_domains_skips_exhausted(self):
        self.pool.report_failure(
            self.domain,
            WsHandshakeError(429, "Too Many Requests",
                             {"retry-after": "120"}))
        self.assertNotIn(self.domain,
                         self.pool.available_domains([self.domain, "other"]))


if __name__ == "__main__":
    unittest.main()

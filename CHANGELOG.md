# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-11-13

### Added
- IPv4-first address resolution for HTTPS diagnostics probing and upstream Telegram WebSocket connectors, preventing connection stalls on unroutable IPv6 WAN routes.
- Multi-syntax `filter-AAAA` detection for dnsmasq, supporting both modern `--filter-AAAA` / `--filter-rr=28` and legacy OpenWrt patches.

### Fixed
- Fixed missing TCP DPI desync options forwarding in `files/etc/init.d/runet-fix`, ensuring selected zapret preset arguments apply properly to ports 80/443.
- Fixed atomic adblock reloading in dnsmasq via full service restart on list updates.
- Increased HTTPS diagnostics probe timeout to 3500ms for resilient testing over slow WAN links.
- Verified on live OpenWrt 25.12 router (`mediatek/filogic` aarch64) with passing YouTube 4K, Discord, Telegram, and Adblock tests.

## [1.5.2] - 2026-11-13

### Added
- Standard LuCI gettext localization (`po/templates/runet-fix.pot`, `po/ru/runet-fix.po`) supporting system language switching in OpenWrt.
- Unified automated test and verification suite `scripts/check.sh` and `make check`.
- Documentation parity checks in `scripts/check-docs.sh` verifying firewall chains and parameters against `ARCHITECTURE.md`.
- Formal protocol specification `docs/protocol.md` locking MTProto framing invariance (abridged, intermediate, and padded-intermediate).
- Idempotent UCI config migration in `files/etc/uci-defaults/99-runet-fix` ensuring smooth upgrades from 1.4.x and 1.5.x.
- OpenWrt package conffiles preservation in `Makefile` protecting `/etc/config/runet-fix` and custom user lists.
- Comprehensive unit tests across Rust core (`adblock`, `proxy`, `zapret`, `util`, `test_cmd`) and Python fallback HTTP API (400/413 limits) and pool rate limiting (429 backoff).
- Full CI test matrix verifying syntax, compilation, clippy, unit tests, shell linting, and docs consistency.

### Changed
- Consolidated adblock compilation engine to native Rust core (`update-adblock.sh` now operates as a clean wrapper without list parsing duplication).
- Cleaned up Python fallback package layout (`utils.py` merged into `utils/__init__.py`, removed dynamic import hack, eliminated wildcard imports).
- Synchronized firewall script dynamically with UCI configuration: `qnum` (1..65535, fallback 200) and `port` for Telegram redirection.
- Hardened installer and updater with checksum validation (`SHA256SUMS`), safe downloads, traps, and atomic file replacement with rollback on failure.

### Fixed
- Fixed iptables DNS redirection rules accumulation across service restarts and uninstallation.
- Fixed dnsmasq `filter-rr=65` compatibility on older OpenWrt versions with pre-flight `--test`.
- Eliminated hardcoded semver literals across shell scripts and LuCI views.
- Fixed Telegram proxy masking to prevent leaking raw secrets in standard logs.
- Fixed stray nfqws process killing targeting only matching qnum queues.

## [1.5.1] - 2026-11-08

### Added
- AntiFilter Community hostlist auto-update support with configurable cron schedule.
- AutoHostList mode (`list_auto`): automatically discovers blocked domains and persists them across reboots.
- Universal `.ru` / `.рф` / `.su` top-level zone exclusion across all desync profiles.
- One-click GitHub links and update checker in LuCI overview.

### Fixed
- Fixed NFQUEUE release timing when restarting or reloading zapret profiles.
- Prioritized `nfqws` binary over legacy `nfqws2`.

## [1.5.0] - 2026-11-06

### Added
- Strict MTProto secret prefix parsing distinguishing `dd`/`ee` markers from raw hex keys.
- Guaranteed verbatim forwarding for `0xDDDDDDDD` padded-intermediate MTProto frames.
- Rate-limiting exponential backoff with `Retry-After` header parsing in Cloudflare Worker pools.
- Asynchronous connection pool management releasing locks across `.await` points.
- GitHub Actions CI gates for automated multi-architecture musl cross-compilation.

## [1.4.2] - 2026-11-02

### Added
- Atomic nftables configuration loading to prevent partial firewall states.
- IPv6 leak prevention rules for Telegram traffic forcing dual-stack clients to IPv4 proxy.
- WebSocket memory footprint and frame size limits protecting low-RAM devices from OOM panics.
- Unprivileged file permissions enforcement (`0644`) for generated dnsmasq rule files.

## [1.4.1] - 2026-10-28

### Fixed
- Preserved existing firewall rules while benchmarking presets in Zapret Autotune.
- Resolved NFQUEUE deadlock when testing multiple desync strategies in sequence.
- Fixed LuCI XHR request timeout during extended autotune scans.
- Added procd `config.change` reload triggers for LuCI switches.

## [1.4.0] - 2026-10-25

### Added
- Unified high-performance Rust core binary `runet-fix-core` replacing heavy Python runtime on modern architectures.
- High-speed streaming adblock compiler with subdomain hierarchical matching.
- Native async network health prober (`runet-fix test`).
- Unix domain socket IPC for instantaneous LuCI status queries without process spawning overhead.

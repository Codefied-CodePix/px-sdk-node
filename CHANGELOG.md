# Changelog

All notable changes to `pxcontrol-sdk` will be documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.2] - 2026-04-18

### Changed
- Package metadata now points at the canonical repository
  [`Codefied-CodePix/px-sdk-node`](https://github.com/Codefied-CodePix/px-sdk-node)
  (`homepage`, `repository`, `bugs`).
- README badges updated to link to the real repository.

### Deprecated
- **Versions `0.1.1` and below are deprecated.** The backend's
  `/api/v1/sdk/versions` endpoint now advertises `0.1.2` as the minimum
  supported release. Older versions still function, but the SDK will emit
  an `update-available` event and a warning at startup until you upgrade.

## [0.1.1] - 2026-04-17

### Changed
- Default `wsUrl` switched from `wss://ws.pxcontrol.io` to
  `wss://api-pxcontrol.codefied.online` (same host now serves HTTP + WS).
- `apiUrl` derives from `wsUrl` automatically, so no separate env var is
  needed unless the API host differs from the WS host.

## [0.1.0] - 2026-04-17

Initial public release.

### Added
- `PxClient` with auto-reconnect (exponential backoff + full-jitter, capped).
- Middleware integrations: Express (`pxControl`), Fastify (`fastifyPxControl`),
  NestJS (`PxControlGuard`).
- Heartbeats (`30s` default) with `sdk_version`, `language`, `env`, `timestamp`.
- HTTP poll fallback (`GET /api/v1/status/{token}`) after 3 consecutive WS
  failures; stops automatically once the WS reconnects.
- Boot-time version check against `GET /api/v1/sdk/versions`.
- Configurable `failMode` (`closed` / `open`), `healthPath`, `debug`, and
  all poll / version-check toggles via `SdkConfig` **or** environment
  variables (`PX_TOKEN`, `PX_WS_URL`, `PX_API_URL`, `PX_DEBUG`,
  `PX_DISABLE_POLL`, `PX_DISABLE_VERSION_CHECK`).
- CJS + ESM builds with `.d.ts`, Node >= 18.

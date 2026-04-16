# Changelog

All notable changes to `@pxcontrol/sdk` will be documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/).

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

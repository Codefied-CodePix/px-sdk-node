# @pxcontrol/sdk

[![npm version](https://img.shields.io/npm/v/@pxcontrol/sdk.svg?logo=npm&label=%40pxcontrol%2Fsdk)](https://www.npmjs.com/package/@pxcontrol/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@pxcontrol/sdk.svg?logo=npm)](https://www.npmjs.com/package/@pxcontrol/sdk)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Types](https://img.shields.io/npm/types/@pxcontrol/sdk.svg?logo=typescript&logoColor=white)](https://www.npmjs.com/package/@pxcontrol/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Node.js SDK and middleware for [PXControl](https://pxcontrol.io) — a remote
application lifecycle controller. **Pause, resume, fail, or take a service
offline** from the PXControl dashboard with no redeploy.

Drop one line of middleware into Express, Fastify, or NestJS and you get:

- Real-time status updates over WebSocket (plus HTTP poll fallback).
- Auto-reconnect with exponential backoff + jitter.
- `503` responses with operator-configured pause / offline messages.
- Health-check path is always whitelisted (LBs and probes keep working).
- Heartbeats so the dashboard can tell you're alive.
- Zero-config: reads `PX_TOKEN` from the environment.

---

## Install

```bash
npm install @pxcontrol/sdk
# or
pnpm add @pxcontrol/sdk
# or
yarn add @pxcontrol/sdk
```

Set your project token (created in the dashboard):

```bash
export PX_TOKEN=px_xxxxxxxxxx
```

## Express

```ts
import express from 'express';
import { pxControl } from '@pxcontrol/sdk';

const app = express();
app.use(pxControl()); // reads PX_TOKEN

app.get('/', (_req, res) => res.json({ ok: true }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(3000);
```

When PXControl marks the project `PAUSED`, `OFFLINE`, or `FAILED`, the
middleware short-circuits with `503` and a JSON body containing the
configured user-facing message. `/health` always passes through.

## Fastify

```ts
import Fastify from 'fastify';
import { fastifyPxControl } from '@pxcontrol/sdk';

const app = Fastify();
await app.register(fastifyPxControl);
app.get('/', async () => ({ ok: true }));
await app.listen({ port: 3000 });
```

## NestJS

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PxControlGuard } from '@pxcontrol/sdk';

@Module({
  providers: [{ provide: APP_GUARD, useValue: new PxControlGuard() }],
})
export class AppModule {}
```

## Configuration

Every option can be passed through `SdkConfig` or an environment variable.

| Option                       | Env var                    | Default                   | Description                                          |
| ---------------------------- | -------------------------- | ------------------------- | ---------------------------------------------------- |
| `token`                      | `PX_TOKEN`                 | —                         | Project token (`px_…`). **Required.**                |
| `wsUrl`                      | `PX_WS_URL`                | `wss://ws.pxcontrol.io`   | WebSocket base URL                                   |
| `apiUrl`                     | `PX_API_URL`               | derived from `wsUrl`      | HTTP base for poll fallback + version check          |
| `heartbeatIntervalMs`        | —                          | `30000`                   | Heartbeat cadence                                    |
| `reconnectDelayMs`           | —                          | `1000`                    | Initial reconnect delay (full-jitter exponential)    |
| `maxReconnectDelayMs`        | —                          | `60000`                   | Upper bound for the reconnect delay                  |
| `healthPath`                 | —                          | `/health`                 | Path that always bypasses gating                     |
| `debug`                      | `PX_DEBUG`                 | `false`                   | Verbose logging                                      |
| `disablePollFallback`        | `PX_DISABLE_POLL`          | `false`                   | Turn off the HTTP poll fallback                      |
| `pollFallbackAfterFailures`  | —                          | `3`                       | Consecutive WS failures before polling activates     |
| `pollIntervalMs`             | —                          | `15000`                   | Poll cadence while in fallback mode                  |
| `disableVersionCheck`        | `PX_DISABLE_VERSION_CHECK` | `false`                   | Skip the boot-time `GET /api/v1/sdk/versions` check  |

### HTTP poll fallback

If the WebSocket fails `pollFallbackAfterFailures` times in a row, the
SDK starts calling `GET {apiUrl}/api/v1/status/{token}` every
`pollIntervalMs` and keeps trying to reconnect in the background.
As soon as the WS is restored, polling stops. This is the recommended
setup for short-lived / serverless runtimes where WebSockets may be
unreliable.

### Version check

On startup the SDK fetches `{apiUrl}/api/v1/sdk/versions` once. If the
installed version is older than `node.latest`, it logs a warning and
emits an `update-available` event — it **never** auto-updates itself.

## Programmatic access

```ts
import { getClient } from '@pxcontrol/sdk';

const px = getClient();
px.on('status', (next, prev) => console.log(`${prev} -> ${next}`));
px.on('revoked', (reason) => console.warn('token revoked', reason));
px.on('poll-started', () => console.warn('WS down, polling HTTP'));
px.on('update-available', ({ current, latest }) =>
  console.warn(`pxcontrol ${current} -> ${latest}`),
);

if (!px.isActive()) {
  // skip background jobs
}
```

Events emitted: `connected`, `disconnected`, `status`, `revoked`,
`serverError`, `error`, `poll-started`, `poll-stopped`, `update-available`.

## Fail modes

The dashboard controls how the SDK behaves when it loses connection to
PXControl:

- `closed` (default, **recommended for production**) — the SDK assumes the
  service should be considered offline and starts blocking traffic.
- `open` — the SDK keeps serving traffic until it explicitly receives a
  status update from the server.

## Graceful shutdown

```ts
import { resetClient } from '@pxcontrol/sdk';

process.on('SIGTERM', () => {
  resetClient(); // closes the socket, clears timers
  process.exit(0);
});
```

## Links

- Dashboard: <https://pxcontrol.io>
- Docs: <https://docs.pxcontrol.io>
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
- Python SDK: [`pxcontrol` on PyPI](https://pypi.org/project/pxcontrol/)

## License

MIT © PXControl

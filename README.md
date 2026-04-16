# @pxcontrol/sdk

Node.js SDK and middleware for [PXControl](https://pxcontrol.io) — a remote
application lifecycle controller. Pause, resume, fail, or take a service
offline from the PXControl dashboard with no redeploy.

## Install

```bash
npm install @pxcontrol/sdk
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

| Option                | Env var      | Default                     | Description                       |
| --------------------- | ------------ | --------------------------- | --------------------------------- |
| `token`               | `PX_TOKEN`   | —                           | Project token (`px_…`)            |
| `wsUrl`               | `PX_WS_URL`  | `wss://ws.pxcontrol.io`     | WebSocket base URL                |
| `heartbeatIntervalMs` | —            | `30000`                     | Heartbeat cadence                 |
| `reconnectDelayMs`    | —            | `5000`                      | Delay between reconnect attempts  |
| `healthPath`          | —            | `/health`                   | Path that always bypasses gating  |
| `debug`               | `PX_DEBUG`   | `false`                     | Verbose logging                   |

## Programmatic access

```ts
import { getClient } from '@pxcontrol/sdk';

const px = getClient();
px.on('status', (next, prev) => console.log(`${prev} -> ${next}`));
px.on('revoked', (reason) => console.warn('token revoked', reason));

if (!px.isActive()) {
  // skip background jobs
}
```

## Fail modes

The dashboard controls how the SDK behaves when it loses connection to
PXControl:

* `closed` (default, **recommended for production**) — the SDK assumes the
  service should be considered offline and starts blocking traffic.
* `open` — the SDK keeps serving traffic until it explicitly receives a
  status update from the server.

## License

MIT

import { getClient } from './client';
import type { SdkConfig } from './types';

interface MinimalReq {
  path?: string;
  url?: string;
}

interface MinimalRes {
  status: (code: number) => MinimalRes;
  json: (body: unknown) => unknown;
}

type ExpressNext = (err?: unknown) => void;

const DEFAULT_HEALTH_PATH = '/health';

/**
 * HTTP status code returned for each non-ACTIVE project state.
 *
 *  - PAUSED  → 402 Payment Required   (semantic choice: the project is
 *              intentionally held back; think "invoice past due")
 *  - OFFLINE → 503 Service Unavailable (temporary outage / maintenance)
 *  - FAILED  → 503 Service Unavailable (stop-everything emergency)
 */
const STATUS_CODE: Record<'PAUSED' | 'OFFLINE' | 'FAILED', number> = {
  PAUSED: 402,
  OFFLINE: 503,
  FAILED: 503,
};

const ERROR_CODE: Record<'PAUSED' | 'OFFLINE' | 'FAILED', string> = {
  PAUSED: 'payment_required',
  OFFLINE: 'service_unavailable',
  FAILED: 'service_unavailable',
};

function buildBlockBody(message: string, status: 'PAUSED' | 'OFFLINE' | 'FAILED') {
  return {
    error: ERROR_CODE[status],
    status,
    message,
  };
}

/**
 * Express-compatible middleware. Also works with Connect-style middleware
 * (e.g. http server frameworks built on `(req, res, next)`).
 */
export function pxControl(config: SdkConfig = {}) {
  const client = getClient(config);
  const healthPath = config.healthPath ?? DEFAULT_HEALTH_PATH;

  return function pxControlMiddleware(req: MinimalReq, res: MinimalRes, next: ExpressNext) {
    const path = req.path ?? req.url ?? '';
    if (path === healthPath) return next();

    const status = client.getStatus();
    if (status === 'ACTIVE') return next();

    if (status === 'PAUSED') {
      res.status(STATUS_CODE.PAUSED).json(buildBlockBody(client.getPauseMessage(), 'PAUSED'));
      return;
    }
    if (status === 'OFFLINE' || status === 'FAILED') {
      res.status(STATUS_CODE[status]).json(buildBlockBody(client.getOfflineMessage(), status));
      return;
    }
    return next();
  };
}

/**
 * Fastify plugin (`fastify.register(fastifyPxControl, opts)`).
 */
export async function fastifyPxControl(
  fastify: {
    addHook: (
      name: 'onRequest',
      fn: (req: { url: string }, reply: { code: (n: number) => { send: (b: unknown) => void } }) => void,
    ) => void;
  },
  opts: SdkConfig = {},
): Promise<void> {
  const client = getClient(opts);
  const healthPath = opts.healthPath ?? DEFAULT_HEALTH_PATH;

  fastify.addHook('onRequest', (req, reply) => {
    const path = req.url.split('?')[0];
    if (path === healthPath) return;

    const status = client.getStatus();
    if (status === 'ACTIVE') return;

    if (status === 'PAUSED') {
      reply.code(STATUS_CODE.PAUSED).send(buildBlockBody(client.getPauseMessage(), 'PAUSED'));
      return;
    }
    if (status === 'OFFLINE' || status === 'FAILED') {
      reply.code(STATUS_CODE[status]).send(buildBlockBody(client.getOfflineMessage(), status));
    }
  });
}

/**
 * NestJS guard. Use as `@UseGuards(new PxControlGuard())` or register globally.
 *
 * The class is duck-typed so consumers do not have to install `@nestjs/common`
 * just to import this SDK.
 */
export class PxControlGuard {
  private readonly healthPath: string;
  private readonly client: ReturnType<typeof getClient>;

  constructor(config: SdkConfig = {}) {
    this.client = getClient(config);
    this.healthPath = config.healthPath ?? DEFAULT_HEALTH_PATH;
  }

  canActivate(context: {
    switchToHttp: () => {
      getRequest: () => { url?: string; path?: string };
      getResponse: () => MinimalRes;
    };
  }): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const path = req.path ?? req.url ?? '';
    if (path === this.healthPath) return true;

    const status = this.client.getStatus();
    if (status === 'ACTIVE') return true;

    if (status === 'PAUSED') {
      res.status(STATUS_CODE.PAUSED).json(buildBlockBody(this.client.getPauseMessage(), 'PAUSED'));
      return false;
    }
    if (status === 'OFFLINE' || status === 'FAILED') {
      res.status(STATUS_CODE[status]).json(buildBlockBody(this.client.getOfflineMessage(), status));
      return false;
    }
    return true;
  }
}

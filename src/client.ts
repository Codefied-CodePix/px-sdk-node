import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { SDK_VERSION } from './version';
import type {
  FailMode,
  HeartbeatMessage,
  ProjectStatus,
  SdkConfig,
  SdkVersionCatalog,
  ServerMessage,
} from './types';

const DEFAULT_WS_URL = 'wss://api-pxcontrol.codefied.online';
const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_RECONNECT_MS = 1_000;
const DEFAULT_MAX_RECONNECT_MS = 60_000;
const DEFAULT_POLL_MS = 15_000;
const DEFAULT_POLL_AFTER_FAILURES = 3;
const VALID_STATUSES: ReadonlySet<ProjectStatus> = new Set([
  'ACTIVE',
  'PAUSED',
  'OFFLINE',
  'FAILED',
]);
const USER_AGENT = `pxcontrol-sdk-node/${SDK_VERSION}`;

function wsUrlToApiUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
  }
  return 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * PXControl WebSocket client with automatic reconnect, HTTP poll
 * fallback, and version-check. Safe to construct in module scope — no
 * network I/O happens synchronously in the constructor.
 */
export class PxClient extends EventEmitter {
  private readonly token: string;
  private readonly wsUrl: string;
  private readonly apiUrl: string;
  private readonly heartbeatIntervalMs: number;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly debug: boolean;
  private readonly disablePollFallback: boolean;
  private readonly pollFallbackAfterFailures: number;
  private readonly pollIntervalMs: number;
  private readonly disableVersionCheck: boolean;

  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private destroyed = false;
  private consecutiveFailures = 0;
  private pollingActive = false;

  private status: ProjectStatus = 'ACTIVE';
  private failMode: FailMode = 'closed';
  private pauseMessage = 'Software Development payment is Due';
  private offlineMessage = 'This service is currently offline';

  constructor(config: SdkConfig = {}) {
    super();
    // Middleware, event listeners, and user callbacks can all add handlers
    // on the same singleton. Bump the cap so Node doesn't print warnings.
    this.setMaxListeners(50);

    const token = config.token ?? process.env.PX_TOKEN;
    if (!token) {
      throw new Error('[pxcontrol] PX_TOKEN env var (or SdkConfig.token) is required');
    }
    this.token = token;
    this.wsUrl = config.wsUrl ?? process.env.PX_WS_URL ?? DEFAULT_WS_URL;
    this.apiUrl =
      config.apiUrl ?? process.env.PX_API_URL ?? wsUrlToApiUrl(this.wsUrl);
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS;
    this.reconnectDelayMs = config.reconnectDelayMs ?? DEFAULT_RECONNECT_MS;
    this.maxReconnectDelayMs =
      config.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_MS;
    this.debug = config.debug ?? process.env.PX_DEBUG === 'true';
    this.disablePollFallback =
      config.disablePollFallback ?? process.env.PX_DISABLE_POLL === 'true';
    this.pollFallbackAfterFailures =
      config.pollFallbackAfterFailures ?? DEFAULT_POLL_AFTER_FAILURES;
    this.pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_MS;
    this.disableVersionCheck =
      config.disableVersionCheck ?? process.env.PX_DISABLE_VERSION_CHECK === 'true';

    if (!this.disableVersionCheck) {
      this.checkVersion().catch(() => {});
    }
    this.connect();
  }

  // -------------------------------------------------------- WebSocket

  private connect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const url = `${this.wsUrl.replace(/\/+$/, '')}/ws/${this.token}`;
    this.log(`connecting to ${url}`);

    let ws: WebSocket;
    try {
      ws = new WebSocket(url, { headers: { 'User-Agent': USER_AGENT } });
    } catch (err) {
      this.log(`ws constructor threw: ${(err as Error).message}`);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      this.log('connected');
      this.consecutiveFailures = 0;
      this.stopPolling();
      this.startHeartbeat();
      this.emit('connected');
    });

    ws.on('message', (buf: Buffer) => this.handleMessage(buf.toString('utf8')));

    ws.on('close', (code: number, reason: Buffer) => {
      const reasonText = reason?.toString('utf8') ?? '';
      this.log(`disconnected (code=${code} reason=${reasonText})`);
      this.stopHeartbeat();
      this.ws = null;
      this.emit('disconnected', { code, reason: reasonText });

      if (this.failMode === 'closed' && this.status !== 'OFFLINE') {
        this.setStatus('OFFLINE');
      }

      // 4001 = invalid token, 4002 = revoked — don't hammer the server retrying.
      if (this.destroyed || code === 4001 || code === 4002) return;

      this.consecutiveFailures += 1;
      if (
        !this.disablePollFallback &&
        this.consecutiveFailures >= this.pollFallbackAfterFailures
      ) {
        this.startPolling();
      }
      this.scheduleReconnect();
    });

    ws.on('error', (err: Error) => {
      this.log(`ws error: ${err.message}`);
      this.emit('error', err);
    });
  }

  /** Exponential backoff with full-jitter, capped at `maxReconnectDelayMs`. */
  private scheduleReconnect(): void {
    if (this.destroyed) return;
    const base = Math.min(
      this.reconnectDelayMs * 2 ** (this.consecutiveFailures - 1),
      this.maxReconnectDelayMs,
    );
    const delay = Math.floor(Math.random() * base);
    this.log(`reconnect in ${delay}ms (attempt ${this.consecutiveFailures})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.log('ignoring non-JSON message');
      return;
    }
    if (!isObject(parsed)) return;
    const msg = parsed as unknown as ServerMessage;

    if (msg.type === 'status') {
      this.applyStatus(msg);
    } else if (msg.type === 'revoked') {
      this.log(`token revoked (reason=${msg.reason ?? 'unknown'})`);
      this.setStatus('OFFLINE');
      this.emit('revoked', msg.reason);
    } else if (msg.type === 'error') {
      this.log(`server error: ${msg.code ?? '?'} ${msg.message ?? ''}`);
      this.emit('serverError', msg);
    } else {
      this.log(`unknown message type: ${(msg as { type?: string }).type ?? '?'}`);
    }
  }

  private applyStatus(msg: {
    status?: ProjectStatus | string;
    fail_mode?: FailMode;
    pause_message?: string;
    offline_message?: string;
  }): void {
    if (msg.fail_mode === 'open' || msg.fail_mode === 'closed') {
      this.failMode = msg.fail_mode;
    }
    if (typeof msg.pause_message === 'string') this.pauseMessage = msg.pause_message;
    if (typeof msg.offline_message === 'string') this.offlineMessage = msg.offline_message;
    if (typeof msg.status === 'string' && VALID_STATUSES.has(msg.status as ProjectStatus)) {
      this.setStatus(msg.status as ProjectStatus);
    }
  }

  private setStatus(next: ProjectStatus): void {
    if (next === this.status) return;
    const prev = this.status;
    this.status = next;
    this.log(`status ${prev} -> ${next}`);
    this.emit('status', next, prev);
  }

  // -------------------------------------------------------- heartbeat

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      const msg: HeartbeatMessage = {
        type: 'heartbeat',
        sdk_version: SDK_VERSION,
        language: 'node',
        env: process.env.NODE_ENV ?? 'unknown',
        timestamp: Date.now(),
      };
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (err) {
        this.log(`heartbeat send failed: ${(err as Error).message}`);
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // -------------------------------------------------------- HTTP fallback

  private startPolling(): void {
    if (this.pollingActive || this.destroyed) return;
    this.pollingActive = true;
    this.log(
      `activating HTTP poll fallback (after ${this.consecutiveFailures} WS failures, interval=${this.pollIntervalMs}ms)`,
    );
    this.emit('poll-started');

    this.pollOnce().catch(() => {});
    this.pollTimer = setInterval(() => {
      this.pollOnce().catch(() => {});
    }, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.pollingActive) {
      this.pollingActive = false;
      this.log('deactivating HTTP poll fallback — WS restored');
      this.emit('poll-stopped');
    }
  }

  private async pollOnce(): Promise<void> {
    if (typeof fetch !== 'function') {
      this.log('global fetch unavailable — poll fallback disabled');
      this.stopPolling();
      return;
    }
    const url = `${this.apiUrl.replace(/\/+$/, '')}/api/v1/status/${this.token}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        this.log(`poll fallback auth/not-found (${res.status}) — stopping`);
        this.stopPolling();
        this.setStatus('OFFLINE');
        return;
      }
      if (!res.ok) {
        this.log(`poll fallback non-200: ${res.status}`);
        return;
      }
      const body = (await res.json()) as unknown;
      if (isObject(body)) {
        this.applyStatus(body as Parameters<typeof this.applyStatus>[0]);
      }
    } catch (err) {
      this.log(`poll fallback error: ${(err as Error).message}`);
    }
  }

  // -------------------------------------------------------- version check

  private async checkVersion(): Promise<void> {
    if (typeof fetch !== 'function') return;
    const url = `${this.apiUrl.replace(/\/+$/, '')}/api/v1/sdk/versions`;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const catalog = (await res.json()) as SdkVersionCatalog;
      const latest = catalog?.node?.latest;
      if (!latest) return;
      if (compareSemver(SDK_VERSION, latest) < 0) {
        const msg = `[pxcontrol] A newer SDK is available (installed ${SDK_VERSION}, latest ${latest}). Run: npm install pxcontrol-sdk@${latest}`;
        // eslint-disable-next-line no-console
        console.warn(msg);
        this.emit('update-available', { current: SDK_VERSION, latest });
      }
    } catch {
      // network failures are non-fatal
    }
  }

  // -------------------------------------------------------- public API

  public getStatus(): ProjectStatus {
    return this.status;
  }

  public isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  public getPauseMessage(): string {
    return this.pauseMessage;
  }

  public getOfflineMessage(): string {
    return this.offlineMessage;
  }

  public getFailMode(): FailMode {
    return this.failMode;
  }

  public getSdkVersion(): string {
    return SDK_VERSION;
  }

  /** Stop heartbeats, close the socket, cancel all timers. */
  public destroy(): void {
    this.destroyed = true;
    this.stopHeartbeat();
    this.stopPolling();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close(1000, 'client destroyed');
    } catch {
      // ignore
    }
    this.ws = null;
  }

  private log(msg: string): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log(`[pxcontrol] ${msg}`);
    }
  }
}

let _singleton: PxClient | null = null;

/** Process-wide singleton. The first call wins — subsequent `config` args are ignored. */
export function getClient(config?: SdkConfig): PxClient {
  if (!_singleton) {
    _singleton = new PxClient(config);
  }
  return _singleton;
}

/** Destroy and discard the singleton (mainly for tests / graceful shutdown). */
export function resetClient(): void {
  _singleton?.destroy();
  _singleton = null;
}

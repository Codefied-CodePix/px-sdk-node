import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type {
  FailMode,
  HeartbeatMessage,
  ProjectStatus,
  SdkConfig,
  ServerMessage,
} from './types';

const SDK_VERSION = '0.1.0';
const DEFAULT_WS_URL = 'wss://ws.pxcontrol.io';
const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_RECONNECT_MS = 5_000;

export class PxClient extends EventEmitter {
  private readonly token: string;
  private readonly wsUrl: string;
  private readonly heartbeatIntervalMs: number;
  private readonly reconnectDelayMs: number;
  private readonly debug: boolean;

  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  private status: ProjectStatus = 'ACTIVE';
  private failMode: FailMode = 'closed';
  private pauseMessage = 'Service temporarily unavailable';
  private offlineMessage = 'This service is currently offline';

  constructor(config: SdkConfig = {}) {
    super();

    const token = config.token ?? process.env.PX_TOKEN;
    if (!token) {
      throw new Error('[pxcontrol] PX_TOKEN env var (or SdkConfig.token) is required');
    }
    this.token = token;
    this.wsUrl = config.wsUrl ?? process.env.PX_WS_URL ?? DEFAULT_WS_URL;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS;
    this.reconnectDelayMs = config.reconnectDelayMs ?? DEFAULT_RECONNECT_MS;
    this.debug = config.debug ?? process.env.PX_DEBUG === 'true';

    this.connect();
  }

  private connect(): void {
    if (this.destroyed) return;

    const url = `${this.wsUrl.replace(/\/+$/, '')}/ws/${this.token}`;
    this.log(`connecting to ${url}`);

    const ws = new WebSocket(url, {
      headers: { 'User-Agent': `pxcontrol-sdk-node/${SDK_VERSION}` },
    });
    this.ws = ws;

    ws.on('open', () => {
      this.log('connected');
      this.startHeartbeat();
      this.emit('connected');
    });

    ws.on('message', (buf: Buffer) => this.handleMessage(buf.toString('utf8')));

    ws.on('close', (code: number, reason: Buffer) => {
      const reasonText = reason?.toString('utf8') ?? '';
      this.log(`disconnected (code=${code} reason=${reasonText})`);
      this.stopHeartbeat();
      this.emit('disconnected', { code, reason: reasonText });

      if (this.failMode === 'closed' && this.status !== 'OFFLINE') {
        this.setStatus('OFFLINE');
      }

      // 4001 = invalid token, 4002 = revoked — don't hammer the server retrying.
      if (!this.destroyed && code !== 4001 && code !== 4002) {
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelayMs);
      }
    });

    ws.on('error', (err: Error) => {
      this.log(`ws error: ${err.message}`);
      this.emit('error', err);
    });
  }

  private handleMessage(raw: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }

    if (msg.type === 'status') {
      this.failMode = msg.fail_mode ?? this.failMode;
      this.pauseMessage = msg.pause_message ?? this.pauseMessage;
      this.offlineMessage = msg.offline_message ?? this.offlineMessage;
      this.setStatus(msg.status);
    } else if (msg.type === 'revoked') {
      this.log(`token revoked (reason=${msg.reason ?? 'unknown'})`);
      this.setStatus('OFFLINE');
      this.emit('revoked', msg.reason);
      // Stay disconnected; the close event will fire too.
    } else if (msg.type === 'error') {
      this.log(`server error: ${msg.code ?? '?'} ${msg.message ?? ''}`);
      this.emit('serverError', msg);
    }
  }

  private setStatus(next: ProjectStatus): void {
    if (next === this.status) return;
    const prev = this.status;
    this.status = next;
    this.log(`status ${prev} -> ${next}`);
    this.emit('status', next, prev);
  }

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

  public destroy(): void {
    this.destroyed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close(1000, 'client destroyed');
    } catch {
      // ignore
    }
  }

  private log(msg: string): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log(`[pxcontrol] ${msg}`);
    }
  }
}

let _singleton: PxClient | null = null;

export function getClient(config?: SdkConfig): PxClient {
  if (!_singleton) {
    _singleton = new PxClient(config);
  }
  return _singleton;
}

export function resetClient(): void {
  _singleton?.destroy();
  _singleton = null;
}

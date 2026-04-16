export type ProjectStatus = 'ACTIVE' | 'PAUSED' | 'OFFLINE' | 'FAILED';
export type FailMode = 'open' | 'closed';

export interface StatusPayload {
  type: 'status';
  status: ProjectStatus;
  fail_mode?: FailMode;
  pause_message?: string;
  offline_message?: string;
}

export interface RevokedPayload {
  type: 'revoked';
  reason?: string;
}

export interface ErrorPayload {
  type: 'error';
  code?: string;
  message?: string;
}

export type ServerMessage = StatusPayload | RevokedPayload | ErrorPayload;

export interface HeartbeatMessage {
  type: 'heartbeat';
  sdk_version: string;
  language: 'node';
  env: string;
  timestamp: number;
}

export interface SdkConfig {
  /** Project token (px_xxx). Defaults to `process.env.PX_TOKEN`. */
  token?: string;
  /** WebSocket base URL. Defaults to `process.env.PX_WS_URL` or `wss://ws.pxcontrol.io`. */
  wsUrl?: string;
  /** Milliseconds between heartbeats. Default 30000. */
  heartbeatIntervalMs?: number;
  /** Milliseconds between reconnect attempts. Default 5000. */
  reconnectDelayMs?: number;
  /** Path (exact match) that always passes through the middleware. Default `/health`. */
  healthPath?: string;
  /** Enables verbose logging. Default `process.env.PX_DEBUG === 'true'`. */
  debug?: boolean;
}

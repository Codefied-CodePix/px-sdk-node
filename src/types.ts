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

export interface SdkVersionInfo {
  latest: string;
  minimum_supported: string;
  changelog_url?: string | null;
}

export interface SdkVersionCatalog {
  node: SdkVersionInfo;
  python: SdkVersionInfo;
}

export interface SdkConfig {
  /** Project token (px_xxx). Defaults to `process.env.PX_TOKEN`. */
  token?: string;
  /** WebSocket base URL. Defaults to `process.env.PX_WS_URL` or `wss://api-pxcontrol.codefied.online`. */
  wsUrl?: string;
  /** HTTP API base URL used by poll fallback + version check. Derived from `wsUrl` if unset. */
  apiUrl?: string;
  /** Milliseconds between heartbeats. Default 30000. */
  heartbeatIntervalMs?: number;
  /** Initial reconnect delay in milliseconds. Default 1000 (doubles with each failure, full-jitter). */
  reconnectDelayMs?: number;
  /** Upper bound for the reconnect delay. Default 60000. */
  maxReconnectDelayMs?: number;
  /** Path (exact match) that always passes through the middleware. Default `/health`. */
  healthPath?: string;
  /** Enables verbose logging. Default `process.env.PX_DEBUG === 'true'`. */
  debug?: boolean;
  /** Disable the HTTP poll fallback. Default `false` (fallback enabled). */
  disablePollFallback?: boolean;
  /** Consecutive WebSocket failures before poll fallback activates. Default 3. */
  pollFallbackAfterFailures?: number;
  /** Poll interval while in fallback mode. Default 15000. */
  pollIntervalMs?: number;
  /** Disable the version-check warning on startup. Default `false`. */
  disableVersionCheck?: boolean;
}

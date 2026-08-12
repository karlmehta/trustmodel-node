/** Client configuration + per-environment base URLs (parity with the Python SDK). */

export type Environment = "production" | "qa" | "local";

export type FailMode = "closed" | "open";

/** Base URLs by environment — identical to the Python SDK's ENVIRONMENT_URLS. */
export const ENVIRONMENT_URLS: Record<Environment, string> = {
  production: "https://api.trustmodel.ai",
  qa: "https://api-trustmodel.pdxqa.com",
  local: "http://localhost:8000",
};

export interface TrustModelClientOptions {
  /** API key. Falls back to `TRUSTMODEL_API_KEY`. */
  apiKey?: string;
  /** Environment preset for the base URL. Default: "production". */
  environment?: Environment;
  /** Explicit base URL override. Falls back to `TRUSTMODEL_BASE_URL`, then the environment. */
  baseUrl?: string;
  /** Org context → `X-Organization-ID`. Falls back to `TRUSTMODEL_ORGANIZATION_ID`. */
  organizationId?: string;
  /** Edge sidecar URL for guardrails. Falls back to `TRUSTMODEL_EDGE_URL`. */
  edgeUrl?: string;
  /** Request timeout in ms. Default: 60000. */
  timeoutMs?: number;
  /** Retry attempts for idempotent GETs / 5xx. Default: 3. */
  maxRetries?: number;
  /** Guardrail behavior when the Edge is unreachable. Default: "closed". */
  failMode?: FailMode;
  /** Custom User-Agent suffix. */
  userAgent?: string;
}

export interface ResolvedConfig {
  apiKey?: string;
  baseUrl: string;
  organizationId?: string;
  edgeUrl?: string;
  timeoutMs: number;
  maxRetries: number;
  failMode: FailMode;
  userAgent: string;
}

const SDK_VERSION = "0.1.0";

/** Merge options with env vars and defaults into a resolved config. */
export function resolveConfig(opts: TrustModelClientOptions = {}): ResolvedConfig {
  const env = opts.environment ?? "production";
  const baseUrl = (
    opts.baseUrl ??
    process.env.TRUSTMODEL_BASE_URL ??
    ENVIRONMENT_URLS[env]
  ).replace(/\/+$/, "");

  return {
    apiKey: opts.apiKey ?? process.env.TRUSTMODEL_API_KEY,
    baseUrl,
    organizationId: opts.organizationId ?? process.env.TRUSTMODEL_ORGANIZATION_ID,
    edgeUrl: (opts.edgeUrl ?? process.env.TRUSTMODEL_EDGE_URL)?.replace(/\/+$/, ""),
    timeoutMs: opts.timeoutMs ?? 60_000,
    maxRetries: opts.maxRetries ?? 3,
    failMode: opts.failMode ?? "closed",
    userAgent:
      opts.userAgent ?? `trustmodel-node-sdk/${SDK_VERSION} (+https://trustmodel.ai)`,
  };
}

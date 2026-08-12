/** `autoInit()` — automatic OTel trace capture → TrustModel (SKU2), the Node analogue of
 *  the Python SDK's `auto_init()`.
 *
 *  v0.1 uses a **dependency-free OTLP/HTTP-JSON exporter**: it POSTs spans directly to
 *  `{base}/sdk/v1/otel/v1/traces` with header `X-API-Key`, using only global `fetch` +
 *  Web Crypto — so it works on Node **and** edge runtimes (Deno/Bun/Workers) where the
 *  OTel Node SDK's `async_hooks` context propagation is fragile (see docs/DESIGN.md §3.2).
 *  Resource attributes (`trustmodel.agent_id` / `trustmodel.session_id` /
 *  `trustmodel.domain` / `trustmodel.frameworks`) are what the backend's OtelAgent /
 *  identity resolution reads — omitting `trustmodel.agent_id` = accepted-but-unregistered.
 *
 *  Manual capture: wrap any unit of work in `tm.span(name, fn)`. For zero-code automatic
 *  capture of openai/anthropic/langchain, use `enableAutoInstrumentation()` (instrumentors.ts)
 *  — the opt-in full-OTel/OpenInference tier. */

import { ENVIRONMENT_URLS, type Environment } from "../config.js";
import { MissingApiKeyError, TrustModelError } from "../errors.js";

export interface AutoInitOptions {
  apiKey: string;
  /** Canonical agent id → `trustmodel.agent_id` (threads to the identity hub, TRUS-1694). */
  agentId: string;
  /** Domain classification (fair_lending | hr_bias | healthcare | general_ai). */
  domain: string;
  /** ComplianceFramework slugs. */
  frameworks?: string[];
  serviceName?: string;
  environment?: Environment;
  baseUrl?: string;
  /** Auto-flush the buffer every N ms (0 disables the timer). Default 5000. */
  flushIntervalMs?: number;
  /** Flush automatically once the buffer reaches this many spans. Default 100. */
  maxBufferedSpans?: number;
}

export type SpanAttributeValue = string | number | boolean;

export interface Telemetry {
  mode: "embedded";
  /** Time `fn`, record a span named `name`, and return `fn`'s result. Records the span
   *  even if `fn` throws (marking it errored), then rethrows. */
  span<T>(name: string, fn: () => Promise<T> | T, attributes?: Record<string, SpanAttributeValue>): Promise<T>;
  /** Send buffered spans to TrustModel now. */
  flush(): Promise<void>;
  /** Flush and stop the timer (also runs on process exit when available). */
  shutdown(): Promise<void>;
}

/** OTLP traces endpoint (full path — the exporter must not append `/v1/traces`). */
export function otlpTracesUrl(opts: Pick<AutoInitOptions, "environment" | "baseUrl">): string {
  const base = (opts.baseUrl ?? ENVIRONMENT_URLS[opts.environment ?? "production"]).replace(
    /\/+$/,
    "",
  );
  return `${base}/sdk/v1/otel/v1/traces`;
}

interface FinishedSpan {
  traceId: string;
  spanId: string;
  name: string;
  startNano: bigint;
  endNano: bigint;
  attributes: Record<string, SpanAttributeValue>;
  error?: string;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  let s = "";
  for (const b of arr) s += b.toString(16).padStart(2, "0");
  return s;
}

function nowNano(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

function toOtlpAttrs(attrs: Record<string, SpanAttributeValue>) {
  return Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([key, v]) => {
      const value =
        typeof v === "number"
          ? Number.isInteger(v)
            ? { intValue: String(v) }
            : { doubleValue: v }
          : typeof v === "boolean"
            ? { boolValue: v }
            : { stringValue: String(v) };
      return { key, value };
    });
}

/**
 * Initialize automatic OTel capture. Returns a handle with `span()` / `flush()` /
 * `shutdown()`. Dependency-free + edge-safe.
 */
export function autoInit(opts: AutoInitOptions): Telemetry {
  if (!opts.apiKey) throw new MissingApiKeyError();

  const url = otlpTracesUrl(opts);
  const sessionId = randomHex(8);
  const maxBuffered = opts.maxBufferedSpans ?? 100;
  const flushIntervalMs = opts.flushIntervalMs ?? 5000;

  const resourceAttrs: Record<string, SpanAttributeValue> = {
    "service.name": opts.serviceName ?? "default",
    "trustmodel.agent_id": opts.agentId,
    "trustmodel.session_id": sessionId,
    "trustmodel.domain": opts.domain,
  };
  if (opts.frameworks?.length) {
    resourceAttrs["trustmodel.frameworks"] = opts.frameworks.join(",");
  }

  let buffer: FinishedSpan[] = [];

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    const payload = {
      resourceSpans: [
        {
          resource: { attributes: toOtlpAttrs(resourceAttrs) },
          scopeSpans: [
            {
              scope: { name: "@trustmodel/sdk", version: "0.2.0" },
              spans: batch.map((s) => ({
                traceId: s.traceId,
                spanId: s.spanId,
                name: s.name,
                kind: 1, // INTERNAL
                startTimeUnixNano: s.startNano.toString(),
                endTimeUnixNano: s.endNano.toString(),
                attributes: toOtlpAttrs(s.attributes),
                status: s.error ? { code: 2, message: s.error } : { code: 1 },
              })),
            },
          ],
        },
      ],
    };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": opts.apiKey,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // Put the batch back so the next flush retries (bounded by maxBuffered).
        buffer = batch.concat(buffer).slice(0, maxBuffered);
        throw new TrustModelError(`OTLP export failed: ${res.status} ${res.statusText}`, {
          status: res.status,
          code: "otlp_export_failed",
        });
      }
    } catch (err) {
      buffer = batch.concat(buffer).slice(0, maxBuffered);
      if (err instanceof TrustModelError) throw err;
      throw new TrustModelError(`OTLP export error: ${(err as Error)?.message ?? err}`, {
        code: "otlp_network_error",
        detail: err,
      });
    }
  };

  const span = async <T>(
    name: string,
    fn: () => Promise<T> | T,
    attributes: Record<string, SpanAttributeValue> = {},
  ): Promise<T> => {
    const record: FinishedSpan = {
      traceId: randomHex(16),
      spanId: randomHex(8),
      name,
      startNano: nowNano(),
      endNano: 0n,
      attributes,
    };
    try {
      const out = await fn();
      return out;
    } catch (err) {
      record.error = (err as Error)?.message ?? String(err);
      throw err;
    } finally {
      record.endNano = nowNano();
      buffer.push(record);
      // Best-effort auto-flush when the buffer fills; never throw from here.
      if (buffer.length >= maxBuffered) void flush().catch(() => {});
    }
  };

  // Periodic flush + best-effort flush on process exit (Node only).
  const timer =
    flushIntervalMs > 0
      ? setInterval(() => void flush().catch(() => {}), flushIntervalMs)
      : undefined;
  if (typeof timer?.unref === "function") timer.unref();

  const onExit = () => void flush().catch(() => {});
  const proc = (globalThis as { process?: NodeJS.Process }).process;
  proc?.once?.("beforeExit", onExit);

  const shutdown = async (): Promise<void> => {
    if (timer) clearInterval(timer);
    proc?.removeListener?.("beforeExit", onExit);
    await flush();
  };

  return { mode: "embedded", span, flush, shutdown };
}

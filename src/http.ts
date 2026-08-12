/** fetch transport: auth headers, timeout, retry, and a normalized error envelope.
 *  Uses the global `fetch` (Node >= 22.12), so there is no `node-fetch` dependency. */

import { MissingApiKeyError, TrustModelError } from "./errors.js";
import type { ResolvedConfig } from "./config.js";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT";
  /** JSON body (object) — serialized with JSON.stringify. */
  body?: unknown;
  /** Extra headers (merged over the defaults). */
  headers?: Record<string, string>;
  /** Absolute URL override (e.g. an Edge base or a signed upload URL). */
  absoluteUrl?: string;
  /** When true, a missing API key throws before the request. Default: true. */
  requireApiKey?: boolean;
}

export class HttpTransport {
  constructor(private readonly cfg: ResolvedConfig) {}

  private authHeaders(requireApiKey: boolean): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": this.cfg.userAgent,
    };
    if (this.cfg.apiKey) h["Authorization"] = `Bearer ${this.cfg.apiKey}`;
    else if (requireApiKey) throw new MissingApiKeyError();
    if (this.cfg.organizationId) h["X-Organization-ID"] = this.cfg.organizationId;
    return h;
  }

  /** Perform a JSON request against `path` (or `absoluteUrl`) and return the parsed body. */
  async request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    const method = opts.method ?? "GET";
    const url = opts.absoluteUrl ?? `${this.cfg.baseUrl}${path}`;
    const requireApiKey = opts.requireApiKey ?? true;
    const headers = { ...this.authHeaders(requireApiKey), ...(opts.headers ?? {}) };

    const retryable = method === "GET";
    let attempt = 0;
    // Retry idempotent GETs on network error / 5xx up to maxRetries.
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: controller.signal,
        });
        if (!res.ok) {
          if (retryable && res.status >= 500 && attempt < this.cfg.maxRetries) {
            attempt++;
            await delay(attempt);
            continue;
          }
          throw await toError(res);
        }
        return (await parseJson(res)) as T;
      } catch (err) {
        if (
          retryable &&
          attempt < this.cfg.maxRetries &&
          !(err instanceof TrustModelError)
        ) {
          attempt++;
          await delay(attempt);
          continue;
        }
        if (err instanceof TrustModelError) throw err;
        throw new TrustModelError(
          `TrustModel request failed: ${(err as Error)?.message ?? String(err)}`,
          { code: "network_error", detail: err },
        );
      } finally {
        clearTimeout(timer);
      }
    }
  }

  /** Raw PUT of a body to a signed URL (agentic upload fallback). */
  async putSigned(signedUrl: string, body: string, contentType: string): Promise<void> {
    const res = await fetch(signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        // Azure Blob SAS compatibility (prod is on Azure).
        "x-ms-blob-type": "BlockBlob",
      },
      body,
    });
    if (!res.ok) throw await toError(res);
  }
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function toError(res: Response): Promise<TrustModelError> {
  const raw = await res.text().catch(() => "");
  let detail: unknown = raw;
  try {
    detail = JSON.parse(raw);
  } catch {
    /* leave as raw text — likely an HTML error page */
  }
  return new TrustModelError(
    `TrustModel API returned ${res.status} ${res.statusText}`,
    { status: res.status, detail },
  );
}

function delay(attempt: number): Promise<void> {
  // Exponential backoff: 200ms, 400ms, 800ms, ...
  return new Promise((r) => setTimeout(r, 200 * 2 ** (attempt - 1)));
}

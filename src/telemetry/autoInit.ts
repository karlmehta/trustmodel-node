/** `autoInit()` — automatic OTel trace capture → TrustModel (SKU2), the Node analogue of
 *  the Python SDK's `auto_init()`.
 *
 *  Two modes (decided at runtime):
 *   - FORWARDER: a real TracerProvider is already registered (the app runs OTel / Galileo /
 *     Arize / LangSmith / Weave) → add our BatchSpanProcessor(OTLP exporter) to it.
 *   - EMBEDDED: none present → create + register a NodeTracerProvider.
 *
 *  Exporter → `{base}/sdk/v1/otel/v1/traces` with header `X-API-Key`. Resource attrs
 *  (`trustmodel.agent_id` / `trustmodel.session_id` / `trustmodel.domain` /
 *  `trustmodel.frameworks`) are what the backend's OtelAgent/identity resolution reads.
 *
 *  SCAFFOLD (slice 3): signature + contract + mode selection are fixed; the OTel SDK
 *  wiring is filled in with the telemetry PR once the peer-dep strategy is confirmed
 *  (docs/DESIGN.md §3.2). OTel packages are OPTIONAL peer deps — importing this module
 *  must not force them on core-eval/AGP users. */

import { ENVIRONMENT_URLS, type Environment } from "../config.js";
import { MissingApiKeyError } from "../errors.js";

export interface AutoInitOptions {
  apiKey: string;
  /** Canonical agent id → `trustmodel.agent_id` (threads to the identity hub, TRUS-1694). */
  agentId: string;
  /** Domain classification (fair_lending | hr_bias | healthcare | general_ai). */
  domain: string;
  /** ComplianceFramework slugs; omit to resolve from the domain server-side. */
  frameworks?: string[];
  serviceName?: string;
  environment?: Environment;
  baseUrl?: string;
}

export interface AutoInitResult {
  mode: "forwarder" | "embedded";
  /** Instrumentor packages that were wired. */
  installed: string[];
  /** Flush buffered spans to TrustModel. */
  flush(): Promise<void>;
  /** Detach exporter / shut down the provider (also runs on process exit). */
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

/**
 * Initialize automatic OTel capture. Returns the mode + a flush/shutdown handle.
 *
 * TODO(slice 3): detect existing TracerProvider (forwarder vs embedded), build the
 * OTLP exporter with `{ "X-API-Key": apiKey }`, attach a BatchSpanProcessor, set the
 * resource attrs below, and call installInstrumentors(). Register a process-exit
 * shutdown. See docs/DESIGN.md §3.2.
 */
export async function autoInit(opts: AutoInitOptions): Promise<AutoInitResult> {
  if (!opts.apiKey) throw new MissingApiKeyError();

  // The resource attributes the backend keys OtelAgent/identity on:
  // const resourceAttrs = {
  //   "service.name": opts.serviceName ?? "default",
  //   "trustmodel.agent_id": opts.agentId,
  //   "trustmodel.session_id": <uuid-per-process>,
  //   "trustmodel.domain": opts.domain,
  //   "trustmodel.frameworks": (opts.frameworks ?? []).join(","),
  // };

  throw new Error(
    "autoInit() is scaffolded (slice 3). See docs/DESIGN.md §3.2 for the OTel wiring, " +
      "or use the core client (evaluations/agentic/agp) which is available now.",
  );
}

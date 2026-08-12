/** Automatic LLM instrumentation via OpenInference (openai / anthropic / langchain) —
 *  the Node analogue of the Python SDK's auto-instrumentor set.
 *
 *  This is the OPT-IN, full-OTel tier: it wires the OpenTelemetry Node SDK + the
 *  OpenInference instrumentors to a TracerProvider that exports to TrustModel. The
 *  OTel + OpenInference packages are OPTIONAL peer deps (see package.json) — the
 *  dependency-free `autoInit()` needs none of them. `enableAutoInstrumentation()`
 *  dynamic-imports them and no-ops gracefully on any instrumentor that isn't installed.
 *
 *  All OTel/OpenInference imports are `any`-typed so the published `.d.ts` never couples
 *  to a specific OTel version. */

import { otlpTracesUrl, type AutoInitOptions, type SpanAttributeValue } from "./autoInit.js";
import { TrustModelError } from "../errors.js";

/** (package, exported instrumentor class) pairs — kept in lockstep with Python's set. */
export const KNOWN_INSTRUMENTORS: ReadonlyArray<[pkg: string, exportName: string]> = [
  ["@arizeai/openinference-instrumentation-openai", "OpenAIInstrumentation"],
  ["@arizeai/openinference-instrumentation-langchain", "LangChainInstrumentation"],
  ["@arizeai/openinference-instrumentation-anthropic", "AnthropicInstrumentation"],
];

export interface AutoInstrumentation {
  mode: "embedded";
  /** Instrumentor packages that were wired (present + registered). */
  installed: string[];
  /** Flush + tear down the tracer provider. */
  shutdown(): Promise<void>;
}

/** Injectable module loader — real code uses dynamic `import()`; tests stub it. */
export type ModuleLoader = (specifier: string) => Promise<unknown>;

/**
 * Turn on automatic OpenInference instrumentation of openai/anthropic/langchain and
 * export the resulting OTel spans to TrustModel. Requires the OpenTelemetry peer deps
 * (throws an actionable error if they're missing). Call once, before your app creates
 * its LLM clients.
 */
export async function enableAutoInstrumentation(
  opts: AutoInitOptions,
  deps: { load?: ModuleLoader } = {},
): Promise<AutoInstrumentation> {
  if (!opts.apiKey) {
    throw new TrustModelError("apiKey is required for auto-instrumentation.", {
      code: "missing_api_key",
    });
  }
  const load: ModuleLoader = deps.load ?? ((m) => import(/* @vite-ignore */ m));

  let sdkNode: any, base: any, otlp: any, resources: any, instr: any;
  try {
    [sdkNode, base, otlp, resources, instr] = (await Promise.all([
      load("@opentelemetry/sdk-trace-node"),
      load("@opentelemetry/sdk-trace-base"),
      load("@opentelemetry/exporter-trace-otlp-http"),
      load("@opentelemetry/resources"),
      load("@opentelemetry/instrumentation"),
    ])) as any[];
  } catch (e) {
    throw new TrustModelError(
      "Auto-instrumentation needs the OpenTelemetry peer deps. Install:\n" +
        "  npm i @opentelemetry/sdk-trace-node @opentelemetry/sdk-trace-base \\\n" +
        "        @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/instrumentation\n" +
        "…plus the OpenInference instrumentor(s) you want, e.g.\n" +
        "  npm i @arizeai/openinference-instrumentation-openai\n" +
        "(The dependency-free autoInit() needs none of these.)",
      { code: "otel_peers_missing", detail: e },
    );
  }

  const attrs: Record<string, SpanAttributeValue> = {
    "service.name": opts.serviceName ?? "default",
    "trustmodel.agent_id": opts.agentId,
    "trustmodel.domain": opts.domain,
  };
  if (opts.frameworks?.length) attrs["trustmodel.frameworks"] = opts.frameworks.join(",");

  const resource = resources.resourceFromAttributes(attrs);
  const exporter = new otlp.OTLPTraceExporter({
    url: otlpTracesUrl(opts),
    headers: { "X-API-Key": opts.apiKey },
  });
  const provider = new sdkNode.NodeTracerProvider({
    resource,
    spanProcessors: [new base.BatchSpanProcessor(exporter)],
  });
  provider.register();

  const installed: string[] = [];
  const instrumentations: unknown[] = [];
  for (const [pkg, exportName] of KNOWN_INSTRUMENTORS) {
    try {
      const mod = (await load(pkg)) as Record<string, unknown>;
      const Instr = mod[exportName] as (new () => unknown) | undefined;
      if (Instr) {
        instrumentations.push(new Instr());
        installed.push(pkg);
      }
    } catch {
      /* instrumentor package not installed — skip it */
    }
  }
  if (instrumentations.length > 0) {
    instr.registerInstrumentations({ tracerProvider: provider, instrumentations });
  }

  return {
    mode: "embedded",
    installed,
    shutdown: async () => {
      await provider.shutdown();
    },
  };
}

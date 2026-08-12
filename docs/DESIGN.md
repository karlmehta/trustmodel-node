# `@trustmodel/sdk` — TypeScript / Node SDK design

**Status:** Design for review · **Epic:** TRUS-1675 (TS SDK, parity with Python) · **Author:** Karl Mehta

> The official TypeScript/Node SDK for TrustModel, at parity with the Python SDK
> (`trustmodel` on PyPI) for the three surfaces Karl needs first — **Eval**, **Telemetry
> (OTel)**, and **AGP (governance)**. Ships as `@trustmodel/sdk` on npm (scope already
> ours). Scaffold-first: review this + the skeleton before we fill in the modules.

---

## 1. Why

There is no full TS/Node SDK today — only `@trustmodel/mcp-server` (a protocol adapter)
and small CLIs. Sophia (and most agent builders) are TypeScript, so the eval/telemetry/AGP
gap blocks the exact bottom-up developer adoption the SDK exists to drive. The Python SDK
(`trustmodel` v3.3.2) is the parity target; the MCP server sets the TS conventions.

## 2. Package & repo

- **npm:** `@trustmodel/sdk` (scoped — matches `@trustmodel/mcp-server`; the `@trustmodel`
  scope is owned by `developer-pdx` + `ankush-pdx`). Publish `--access public`.
- **repo:** `pdxlab/trustmodel-node-sdk` (private until launch).
- **runtime:** Node **>= 22.12.0** (matches the MCP server; gives us global `fetch`,
  `--test`, and stable ESM — no `node-fetch` dependency).
- **module:** ESM only (`"type": "module"`), `tsc` build, target ES2022 / module Node16,
  `strict`, `declaration` + source maps, ship `dist/` (mirrors the MCP server tsconfig).
- **DECISION NEEDED — license:** the Python SDK is **Proprietary**; the MCP server is
  **MIT**. This scaffold defaults to **Proprietary** (parity with the Python SDK). For an
  SDK meant to be embedded by external devs, **MIT is materially better for adoption** —
  recommend flipping to MIT. Karl's call; trivial to change.

## 3. Surface — parity map with the Python SDK

Constructed like the Python `TrustModelClient`:

```ts
const tm = new TrustModelClient({
  apiKey: process.env.TRUSTMODEL_API_KEY,   // or OAuth (client-credentials) later
  environment: "production",                 // production | qa | local
  baseUrl,                                   // override; else per-environment
  organizationId,                            // → X-Organization-ID (tenant scope)
  edgeUrl, timeoutMs, maxRetries, failMode,
});
```

- **Auth:** `Authorization: Bearer <apiKey>`; optional `X-Organization-ID`. Env:
  `TRUSTMODEL_API_KEY`, `TRUSTMODEL_BASE_URL`, `TRUSTMODEL_ORGANIZATION_ID`,
  `TRUSTMODEL_EDGE_URL` — same names as Python.
- **Base URLs:** prod `https://api.trustmodel.ai`, qa `https://api-trustmodel.pdxqa.com`,
  local `http://localhost:8000`.

### 3.1 Eval (`tm.evaluations`, `tm.agentic`)
- `evaluations.create({ modelIdentifier, vendorIdentifier, apiKey?, categories?, systemPrompt?, ... })`
  → `POST /sdk/v1/evaluate/` (model → TrustScore).
- `evaluations.get(id)` → `GET /sdk/v1/evaluations/{id}/`.
- `agentic.evaluate({ trace | filePath, goal?, name?, agentFramework?, governedAgent?, frameworks? })`
  → **one-call** via the inline-trace path (`POST /sdk/v1/agentic/evaluate/ { trace }`,
  shipped in aurora-gateway #545 / TRUS-1691) when a `trace` object is passed; falls back
  to the 3-step upload (`upload-url` → PUT → `evaluate`) only for large `filePath` uploads.
  `governedAgent` (slug/UUID) binds the run to an AGP agent (TRUS-1640).
- `agentic.get(id)` → `GET /sdk/v1/agentic/evaluations/{id}/`. `credits.get()`.

### 3.2 Telemetry / OTel (`autoInit`)
Mirror of Python `auto_init()` — the meatiest part and the SKU2 need:

```ts
autoInit({ apiKey, agentId, domain, frameworks?, serviceName?, environment?, baseUrl? })
```
- **Detect existing telemetry:** if a real `TracerProvider` is already registered (app runs
  OTel / Galileo / Arize / LangSmith / Weave) → **forwarder mode**: add our
  `BatchSpanProcessor(OTLPTraceExporter)` to the existing provider. Else → **embedded mode**:
  create a `NodeTracerProvider`, register it.
- **Exporter:** `@opentelemetry/exporter-trace-otlp-http` → `{{base}}/sdk/v1/otel/v1/traces`
  with header `X-API-Key: <apiKey>` (note: OTLP path is sent whole; do NOT let the exporter
  append `/v1/traces`).
- **Resource attributes** (the binding to the backend): `service.name`,
  `trustmodel.agent_id`, `trustmodel.session_id` (uuid per process), `trustmodel.domain`,
  `trustmodel.frameworks`. These are what OtelAgent/identity resolution reads.
- **Auto-instrument** openai / anthropic / langchain via **OpenInference JS** instrumentors
  (`@arizeai/openinference-instrumentation-openai`, `-langchain`, etc.) — auto-detected +
  best-effort (missing package → skip, never throw), same as Python's `_KNOWN_INSTRUMENTORS`.
- **`flush()`** → `POST /sdk/v1/otel/v1/flush` (`X-API-Key`) + `shutdown()` on process exit.
- **OTel deps are OPTIONAL** (a `telemetry` peer/optional group), mirroring the Python
  `[telemetry]` extra — the core eval/AGP SDK stays dependency-light.

### 3.3 AGP / governance (`tm.agp` / `tm.guardrails`)
- `guardrails.decide({ tool, args, subject?, agentId?, policyName? })` → **Edge first**
  (`POST {edgeUrl}/v1/decide`), fallback **Aurora** (`POST /api/v1/guardrails/check`);
  returns a normalized `Decision { verdict, ruleId, reason, redactions, ... }`. Honors
  `failMode` ("closed" | "open") when the Edge is unreachable.
- `agp.boundPolicy(slug)` → `GET /api/v1/guardrails/agents/{slug}/policy/`.
- `agp.fleet()` / `agp.trustScore(slug)` → the governed-agent fleet + TrustScore reads
  (consume the identity hub once TRUS-1694 lands; until then the current endpoints).

## 4. Canonical `agentId` (forward-compat with TRUS-1694)

One `agentId` flows through all three: the telemetry resource attr `trustmodel.agent_id`,
the agentic-eval `governedAgent`/subject, and (later) the ANS name — so server-side they
resolve to one `AgentIdentity` (TRUS-1694 / story **1694-6 = TRUS-1708**). The SDK exposes a
single `agentId` option threaded everywhere; we design it now even though the server-side
unification ships with the identity epic.

## 5. Layout

```
src/
  index.ts            public exports
  client.ts           TrustModelClient — mounts endpoints
  config.ts           env + per-environment base URLs, resolveConfig()
  http.ts             fetch transport: auth headers, retries, error envelope
  errors.ts           TrustModelError + typed subclasses
  types.ts            shared request/response types
  endpoints/
    evaluations.ts    model eval
    agentic.ts        agent eval (inline-trace one-call + upload fallback)
    credits.ts        credit balance
  agp/
    index.ts          guardrails.decide + boundPolicy + fleet/trustScore
  telemetry/
    autoInit.ts       OTel embedded/forwarder + flush + shutdown
    instrumentors.ts  auto-detect + install OpenInference JS instrumentors
```

## 6. Conventions (match the MCP server)

- Native global `fetch`; error envelope `TrustModelError { status, message, detail }`.
- Response field normalization where the backend has old/new names (e.g. `signed_url`
  vs `url`), as the MCP client does.
- `zod` for input validation at the public boundary.
- Tests: `vitest` (richer than the MCP server's `node --test`, warranted for the SDK's
  logic). CI matrix Node 22.12 + 24: `npm ci → build → test`, plus a gitleaks secrets-scan
  (mirrors the MCP repo). Publish is manual (`npm publish --access public`) to start, with
  OIDC/provenance as a follow-up.

## 7. Build order (slices → PRs)

1. **Scaffold + this design** (repo, package.json, tsconfig, CI, skeleton) — THIS PR.
2. **Core + Eval** — `http`/`config`/`errors`/`client` + `evaluations` + `credits` +
   `agentic` (inline-trace one-call). Testable against #545 today.
3. **Telemetry** — `autoInit` (embedded + forwarder) + instrumentors; the sophia/SKU2 demo.
4. **AGP** — `guardrails.decide` (Edge+Aurora) + `boundPolicy` + fleet/trustScore.
5. **`agentId` unification + docs/examples**, then publish `@trustmodel/sdk` 0.1.0.

## 8. Open questions

1. **License** — Proprietary (parity) vs **MIT** (adoption; recommended). §2.
2. **Test runner** — `vitest` (recommended) vs `node --test` (matches MCP server exactly).
3. **OTel dep strategy** — optional peer deps (recommended; keeps core light) vs bundling
   the OTel + OpenInference stack.
4. **OAuth client-credentials** — in v0.1 or a fast-follow? (Python has it; API-key covers
   the demo path.)

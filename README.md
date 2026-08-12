# @trustmodel/sdk

Official **TypeScript / Node** SDK for [TrustModel](https://trustmodel.ai) — AI trust
evaluation, OpenTelemetry telemetry, and agent governance (AGP). Parity with the Python
SDK (`trustmodel` on PyPI) for the three core surfaces.

> **Status: scaffold under review.** Core client (eval / AGP) lands next; telemetry
> (`autoInit`) is scaffolded. See [`docs/DESIGN.md`](docs/DESIGN.md).

## Install

```bash
npm install @trustmodel/sdk
# Telemetry (OTel) is optional — install the OTel peers only if you use autoInit():
npm install @opentelemetry/api @opentelemetry/sdk-trace-node \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources \
  @opentelemetry/semantic-conventions
```

Requires Node **>= 22.12**.

## Quick start

```ts
import { TrustModelClient } from "@trustmodel/sdk";

const tm = new TrustModelClient({ apiKey: process.env.TRUSTMODEL_API_KEY });

// Model eval → TrustScore
const run = await tm.evaluations.create({
  modelIdentifier: "gpt-4o",
  vendorIdentifier: "openai",
});

// Agent eval — one call, no upload dance (inline trace)
const agentRun = await tm.agentic.evaluate({
  trace: { goal: "Book a flight", steps: [{ step_type: "final_answer", content: "Booked" }] },
  agentFramework: "langchain",
  governedAgent: "my-agent",   // binds the score to the AGP agent
});

// Governance — gate a tool call
const decision = await tm.agp.decide({
  tool: "send_email",
  args: { to: "ceo@acme.com" },
  agentId: "my-agent",
});
```

## Telemetry (OTel) — SKU2

Dependency-free, **edge-safe** OTLP export (Node, Deno, Bun, Workers) — no
`@opentelemetry/*` required. Wrap work in `span()`; traces stream to TrustModel with
the `trustmodel.agent_id` binding the backend needs.

```ts
import { autoInit } from "@trustmodel/sdk/telemetry";

const tm = autoInit({
  apiKey: process.env.TRUSTMODEL_API_KEY!,
  agentId: "my-agent",     // → trustmodel.agent_id (binds to your agent)
  domain: "general_ai",
});

const answer = await tm.span("llm.call", async () => callOpenAI(prompt), { model: "gpt-4o" });

await tm.flush();      // send buffered spans (also auto-flushes on a timer + on exit)
```

### Automatic instrumentation (openai / anthropic / langchain)

Opt-in, zero-code capture via OpenInference — install the OTel + instrumentor peers, then:

```bash
npm i @opentelemetry/sdk-trace-node @opentelemetry/sdk-trace-base \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/instrumentation \
  @arizeai/openinference-instrumentation-openai   # + -langchain / -anthropic as needed
```

```ts
import { enableAutoInstrumentation } from "@trustmodel/sdk";

const ai = await enableAutoInstrumentation({
  apiKey: process.env.TRUSTMODEL_API_KEY!,
  agentId: "my-agent",
  domain: "general_ai",
});
// Every openai/anthropic call is now traced to TrustModel automatically.
// ai.installed → the instrumentors that were wired
```

The **dependency-free** `autoInit()` above needs none of these — it's the edge-safe path.
`enableAutoInstrumentation()` is the full-OTel path for Node when you want zero-code capture.

## Configuration

| Option | Env | Default |
|---|---|---|
| `apiKey` | `TRUSTMODEL_API_KEY` | — |
| `baseUrl` | `TRUSTMODEL_BASE_URL` | per `environment` |
| `environment` | — | `production` (`qa`, `local`) |
| `organizationId` | `TRUSTMODEL_ORGANIZATION_ID` | — (→ `X-Organization-ID`) |
| `edgeUrl` | `TRUSTMODEL_EDGE_URL` | — (guardrails Edge) |

Auth is `Authorization: Bearer <apiKey>` — identical to the Python SDK.

## License

See [`LICENSE`](LICENSE). (License is a launch decision — see `docs/DESIGN.md` §2.)

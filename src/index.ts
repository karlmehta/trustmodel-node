/** @trustmodel/sdk — official TypeScript/Node SDK for TrustModel. */

export { TrustModelClient } from "./client.js";
export {
  ENVIRONMENT_URLS,
  type Environment,
  type FailMode,
  type TrustModelClientOptions,
  type ResolvedConfig,
} from "./config.js";

export {
  TrustModelError,
  MissingApiKeyError,
  InsufficientCreditsError,
} from "./errors.js";

export type { CreateEvaluationParams } from "./endpoints/evaluations.js";
export type { EvaluateAgentParams } from "./endpoints/agentic.js";
export type { DecideParams } from "./agp/index.js";
export type {
  Evaluation,
  AgenticEvaluation,
  AgenticTrace,
  TraceStep,
  Credits,
  Decision,
} from "./types.js";

// Telemetry (OTel) is a subpath export (`@trustmodel/sdk/telemetry`) so the OTel peer
// deps stay optional for core-eval/AGP users.
export {
  autoInit,
  otlpTracesUrl,
  type AutoInitOptions,
  type Telemetry,
  type SpanAttributeValue,
} from "./telemetry/autoInit.js";
export {
  enableAutoInstrumentation,
  KNOWN_INSTRUMENTORS,
  type AutoInstrumentation,
  type ModuleLoader,
} from "./telemetry/instrumentors.js";

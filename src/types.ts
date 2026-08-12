/** Shared request/response types. Kept intentionally light for v0.1 — the backend
 *  is the source of truth; these describe the fields the SDK reads/writes. */

export interface Evaluation {
  evaluation_run_id: number | string;
  status: string;
  overall_score?: number;
  [k: string]: unknown;
}

export interface AgenticEvaluation {
  evaluation_run_id: number | string;
  status: string;
  message?: string;
  [k: string]: unknown;
}

export interface Credits {
  credits_remaining?: number;
  [k: string]: unknown;
}

/** Normalized guardrail decision (Edge or Aurora). */
export interface Decision {
  verdict: "allow" | "block" | "challenge" | string;
  rule_id?: string;
  reason?: string;
  redactions?: unknown[];
  [k: string]: unknown;
}

/** One trace step (subset of the agentic-trace schema). */
export interface TraceStep {
  step_type:
    | "thought"
    | "tool_call"
    | "tool_result"
    | "observation"
    | "decision"
    | "error"
    | "human_input"
    | "final_answer";
  content: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_output?: unknown;
  [k: string]: unknown;
}

/** An inline agentic trace (object form). */
export interface AgenticTrace {
  goal?: string;
  name?: string;
  agent_framework?: string;
  steps: TraceStep[];
  [k: string]: unknown;
}

/** Agentic (agent-trace) evaluation.
 *
 * v1 primary path is the ONE-CALL inline trace shipped in aurora-gateway #545
 * (TRUS-1691): `POST /sdk/v1/agentic/evaluate/ { trace, ... }` — the server stores the
 * trace, no upload dance. The 3-step upload (`upload-url` → PUT → evaluate) remains as a
 * fallback for large files passed as `filePath`. */

import type { HttpTransport } from "../http.js";
import type { AgenticEvaluation, AgenticTrace } from "../types.js";

export interface EvaluateAgentParams {
  /** Inline trace (object or array) — the one-call path. Provide this OR `filePath`. */
  trace?: AgenticTrace | AgenticTrace[];
  /** Pre-uploaded GCS/Blob path — the 3-step path. Provide this OR `trace`. */
  filePath?: string;
  goal?: string;
  name?: string;
  agentFramework?: string;
  agentModel?: string;
  frameworks?: string[];
  controlIds?: string[];
  /** GovernedAgent slug or UUID — binds the run to the AGP agent (TRUS-1640). */
  governedAgent?: string;
  triggerSource?: string;
}

export class AgenticEndpoint {
  constructor(private readonly http: HttpTransport) {}

  /** Evaluate an agent run. Prefers the inline-trace one-call; uploads only for `filePath`. */
  async evaluate(params: EvaluateAgentParams): Promise<AgenticEvaluation> {
    if (!params.trace && !params.filePath) {
      throw new Error("evaluate() requires either `trace` (inline) or `filePath`.");
    }
    const body: Record<string, unknown> = {
      goal: params.goal,
      name: params.name,
      agent_framework: params.agentFramework,
      agent_model: params.agentModel,
      frameworks: params.frameworks,
      control_ids: params.controlIds,
      governed_agent: params.governedAgent,
      trigger_source: params.triggerSource ?? "sdk",
    };
    if (params.trace) body.trace = params.trace;
    else body.file_path = params.filePath;

    return this.http.request<AgenticEvaluation>("/sdk/v1/agentic/evaluate/", {
      method: "POST",
      body,
    });
  }

  /** Fetch an agentic evaluation run by id. */
  async get(evaluationId: number | string): Promise<AgenticEvaluation> {
    return this.http.request<AgenticEvaluation>(
      `/sdk/v1/agentic/evaluations/${encodeURIComponent(String(evaluationId))}/`,
    );
  }

  // NOTE (slice 2): large-file upload fallback —
  //   const { signed_url, file_path } = await http.request("/sdk/v1/agentic/upload-url/", …)
  //   await http.putSigned(signed_url, JSON.stringify(trace), "application/json")
  //   return this.evaluate({ filePath: file_path, … })
  // Wire this once we add streaming/file reads; the inline path covers the common case.
}

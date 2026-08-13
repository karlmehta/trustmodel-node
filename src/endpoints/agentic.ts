/** Agentic (agent-trace) evaluation.
 *
 * v1 primary path is the ONE-CALL inline trace shipped in aurora-gateway #545
 * (TRUS-1691): `POST /sdk/v1/agentic/evaluate/ { trace, ... }` — the server stores the
 * trace, no upload dance. The 3-step upload (`upload-url` → PUT → evaluate) remains as a
 * fallback for large files passed as `filePath`. */

import type { HttpTransport } from "../http.js";
import type { AgenticEvaluation, AgenticTrace } from "../types.js";
import { TrustModelError } from "../errors.js";

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

  /** Evaluate an agent run. With a `trace`, sends it INLINE (one call, no upload —
   *  TRUS-1691); if the gateway doesn't yet accept an inline trace (older deploy → 400),
   *  falls back to upload-url → PUT → evaluate. Metadata (goal / name / agent_framework)
   *  is derived from the trace root when not passed explicitly. */
  async evaluate(params: EvaluateAgentParams): Promise<AgenticEvaluation> {
    if (!params.trace && !params.filePath) {
      throw new Error("evaluate() requires either `trace` or `filePath`.");
    }

    const root = Array.isArray(params.trace) ? params.trace[0] : params.trace;
    const goal = params.goal ?? root?.goal;
    const name = params.name ?? root?.name ?? "Agent run";
    const agentFramework = params.agentFramework ?? root?.agent_framework ?? "custom";
    if (!goal) throw new Error("A `goal` is required (pass it, or include it in the trace).");

    const meta: Record<string, unknown> = {
      goal,
      name,
      agent_framework: agentFramework,
      agent_model: params.agentModel,
      frameworks: params.frameworks,
      control_ids: params.controlIds,
      governed_agent: params.governedAgent,
      trigger_source: params.triggerSource ?? "sdk",
    };

    // Pre-uploaded file — evaluate directly.
    if (params.filePath) {
      return this.postEvaluate({ ...meta, file_path: params.filePath });
    }

    // Inline one-call (preferred). Fall back to upload if the gateway rejects it (400).
    try {
      return await this.postEvaluate({ ...meta, trace: params.trace });
    } catch (err) {
      if (err instanceof TrustModelError && err.status === 400) {
        const filePath = await this.uploadTrace(params.trace!);
        return this.postEvaluate({ ...meta, file_path: filePath });
      }
      throw err;
    }
  }

  private postEvaluate(body: Record<string, unknown>): Promise<AgenticEvaluation> {
    return this.http.request<AgenticEvaluation>("/sdk/v1/agentic/evaluate/", {
      method: "POST",
      body,
    });
  }

  /** Upload an inline trace and return its stored `file_path` (upload-url → PUT). */
  private async uploadTrace(trace: AgenticTrace | AgenticTrace[]): Promise<string> {
    const up = await this.http.request<Record<string, unknown>>(
      "/sdk/v1/agentic/upload-url/",
      { method: "POST", body: { file_type: "json" } },
    );
    // The backend has used both old/new field names — normalize (matches the MCP client).
    const signedUrl = (up.signed_url ?? up.url) as string | undefined;
    const filePath = (up.file_path ?? up.file_name) as string | undefined;
    if (!signedUrl || !filePath) {
      throw new Error("upload-url response missing signed_url/file_path.");
    }
    await this.http.putSigned(signedUrl, JSON.stringify(trace), "application/json");
    return filePath;
  }

  /** Fetch an agentic evaluation run by id. */
  async get(evaluationId: number | string): Promise<AgenticEvaluation> {
    return this.http.request<AgenticEvaluation>(
      `/sdk/v1/agentic/evaluations/${encodeURIComponent(String(evaluationId))}/`,
    );
  }
}

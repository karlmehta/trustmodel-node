/** AGP / governance — guardrail decisions + bound policy + fleet TrustScore.
 *
 * `decide()` routes to the Edge sidecar first (low-latency, in-VPC) and falls back to
 * Aurora; honors `failMode` when the Edge is unreachable — parity with the Python
 * `guardrails` endpoint. */

import type { HttpTransport } from "../http.js";
import type { ResolvedConfig } from "../config.js";
import type { Decision } from "../types.js";
import { TrustModelError } from "../errors.js";

export interface DecideParams {
  /** Tool/action being gated, e.g. "send_email". */
  tool: string;
  /** Tool arguments. */
  args: Record<string, unknown>;
  subject?: string;
  /** Canonical agent id (threads to the identity hub, TRUS-1694). */
  agentId?: string;
  policyName?: string;
}

export class AgpEndpoint {
  constructor(
    private readonly http: HttpTransport,
    private readonly cfg: ResolvedConfig,
  ) {}

  /** Decide whether a tool call is allowed. Edge first, Aurora fallback, failMode on error. */
  async decide(params: DecideParams): Promise<Decision> {
    const body = {
      tool: params.tool,
      args: params.args,
      subject: params.subject,
      agent_id: params.agentId,
      policy_name: params.policyName,
    };

    if (this.cfg.edgeUrl) {
      try {
        return await this.http.request<Decision>("/v1/decide", {
          method: "POST",
          absoluteUrl: `${this.cfg.edgeUrl}/v1/decide`,
          body,
        });
      } catch (err) {
        // Edge unreachable → honor failMode rather than hard-failing the caller.
        if (this.cfg.failMode === "open") {
          return { verdict: "allow", reason: "edge_unreachable_fail_open" };
        }
        // fail closed → fall through to Aurora; if that also fails, surface it.
        void (err as TrustModelError);
      }
    }

    return this.http.request<Decision>("/api/v1/guardrails/check", {
      method: "POST",
      body,
    });
  }

  /** The policy envelope bound to a governed agent. */
  async boundPolicy(slug: string): Promise<unknown> {
    return this.http.request(
      `/api/v1/guardrails/agents/${encodeURIComponent(slug)}/policy/`,
    );
  }

  /** Governed-agent fleet (reads the identity hub once TRUS-1694 lands). */
  async fleet(): Promise<unknown> {
    return this.http.request("/api/v1/agp/agents/");
  }

  /** TrustScore history for a governed agent by slug. */
  async trustScore(slug: string, days = 30): Promise<unknown> {
    return this.http.request(
      `/api/v1/agentic/governed-agents/${encodeURIComponent(slug)}/trust-score/?days=${days}`,
    );
  }
}

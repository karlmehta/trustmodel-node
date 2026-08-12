/** TrustModelClient — the SDK entry point. Mounts the endpoint groups, mirroring the
 *  Python `TrustModelClient` (`.evaluations`, `.agentic`, `.credits`, `.agp`). */

import { resolveConfig, type ResolvedConfig, type TrustModelClientOptions } from "./config.js";
import { HttpTransport } from "./http.js";
import { EvaluationsEndpoint } from "./endpoints/evaluations.js";
import { AgenticEndpoint } from "./endpoints/agentic.js";
import { CreditsEndpoint } from "./endpoints/credits.js";
import { AgpEndpoint } from "./agp/index.js";

export class TrustModelClient {
  readonly config: ResolvedConfig;
  private readonly http: HttpTransport;

  /** Model evaluation (`/sdk/v1/evaluate/`). */
  readonly evaluations: EvaluationsEndpoint;
  /** Agent-trace evaluation (`/sdk/v1/agentic/evaluate/`). */
  readonly agentic: AgenticEndpoint;
  /** Credit balance. */
  readonly credits: CreditsEndpoint;
  /** AGP governance — guardrails, bound policy, fleet TrustScore. */
  readonly agp: AgpEndpoint;

  constructor(options: TrustModelClientOptions = {}) {
    this.config = resolveConfig(options);
    this.http = new HttpTransport(this.config);

    this.evaluations = new EvaluationsEndpoint(this.http);
    this.agentic = new AgenticEndpoint(this.http);
    this.credits = new CreditsEndpoint(this.http);
    this.agp = new AgpEndpoint(this.http, this.config);
  }
}

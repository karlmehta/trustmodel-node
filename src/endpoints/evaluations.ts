/** Model evaluation — `POST /sdk/v1/evaluate/` (parity with the Python `evaluations`). */

import type { HttpTransport } from "../http.js";
import type { Evaluation } from "../types.js";

export interface CreateEvaluationParams {
  /** e.g. "gpt-4o". */
  modelIdentifier: string;
  /** e.g. "openai". */
  vendorIdentifier: string;
  /** Optional BYOK key for the model under test. */
  apiKey?: string;
  /** TrustScore dimensions to run; omit for the default set. */
  categories?: string[];
  modelConfigName?: string;
  /** Optional system prompt — triggers prompt-resilience scoring. */
  systemPrompt?: string;
  triggerSource?: string;
}

export class EvaluationsEndpoint {
  constructor(private readonly http: HttpTransport) {}

  /** Start a model evaluation. Returns the created run (poll `get()` for the score). */
  async create(params: CreateEvaluationParams): Promise<Evaluation> {
    return this.http.request<Evaluation>("/sdk/v1/evaluate/", {
      method: "POST",
      body: {
        model_identifier: params.modelIdentifier,
        vendor_identifier: params.vendorIdentifier,
        api_key: params.apiKey,
        categories: params.categories,
        model_config_name: params.modelConfigName,
        system_prompt: params.systemPrompt,
        trigger_source: params.triggerSource ?? "sdk",
      },
    });
  }

  /** Fetch an evaluation run by id. */
  async get(evaluationId: number | string): Promise<Evaluation> {
    return this.http.request<Evaluation>(
      `/sdk/v1/evaluations/${encodeURIComponent(String(evaluationId))}/`,
    );
  }
}

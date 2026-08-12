/** Credit balance — `GET /sdk/v1/credits/`. */

import type { HttpTransport } from "../http.js";
import type { Credits } from "../types.js";

export class CreditsEndpoint {
  constructor(private readonly http: HttpTransport) {}

  async get(): Promise<Credits> {
    return this.http.request<Credits>("/sdk/v1/credits/");
  }
}

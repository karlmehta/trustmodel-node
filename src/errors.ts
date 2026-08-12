/** Error envelope for the TrustModel SDK — mirrors the MCP server's shape. */
export class TrustModelError extends Error {
  readonly status: number | undefined;
  readonly detail: unknown;
  readonly code: string | undefined;

  constructor(
    message: string,
    opts: { status?: number; detail?: unknown; code?: string } = {},
  ) {
    super(message);
    this.name = "TrustModelError";
    this.status = opts.status;
    this.detail = opts.detail;
    this.code = opts.code;
  }
}

/** Raised when no API key is available for a cloud call. */
export class MissingApiKeyError extends TrustModelError {
  constructor() {
    super(
      "TRUSTMODEL_API_KEY is required. Create a free key at " +
        "https://app.trustmodel.ai/settings/api-keys, or pass { apiKey } to the client.",
      { code: "missing_api_key" },
    );
    this.name = "MissingApiKeyError";
  }
}

/** Raised when the caller is out of credits (HTTP 402). */
export class InsufficientCreditsError extends TrustModelError {
  constructor(detail?: unknown) {
    super("Insufficient credits for this evaluation.", {
      status: 402,
      detail,
      code: "insufficient_credits",
    });
    this.name = "InsufficientCreditsError";
  }
}

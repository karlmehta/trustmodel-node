import { describe, it, expect, beforeEach } from "vitest";
import { resolveConfig, ENVIRONMENT_URLS } from "./config.js";

describe("resolveConfig", () => {
  beforeEach(() => {
    delete process.env.TRUSTMODEL_API_KEY;
    delete process.env.TRUSTMODEL_BASE_URL;
    delete process.env.TRUSTMODEL_ORGANIZATION_ID;
  });

  it("defaults to the production base URL", () => {
    expect(resolveConfig().baseUrl).toBe(ENVIRONMENT_URLS.production);
  });

  it("selects the base URL by environment", () => {
    expect(resolveConfig({ environment: "qa" }).baseUrl).toBe(ENVIRONMENT_URLS.qa);
    expect(resolveConfig({ environment: "local" }).baseUrl).toBe(ENVIRONMENT_URLS.local);
  });

  it("prefers an explicit baseUrl and strips trailing slashes", () => {
    expect(resolveConfig({ baseUrl: "https://x.example/" }).baseUrl).toBe("https://x.example");
  });

  it("reads api key + org from env", () => {
    process.env.TRUSTMODEL_API_KEY = "tm-abc";
    process.env.TRUSTMODEL_ORGANIZATION_ID = "org-1";
    const cfg = resolveConfig();
    expect(cfg.apiKey).toBe("tm-abc");
    expect(cfg.organizationId).toBe("org-1");
  });

  it("options win over env", () => {
    process.env.TRUSTMODEL_API_KEY = "from-env";
    expect(resolveConfig({ apiKey: "from-opts" }).apiKey).toBe("from-opts");
  });

  it("applies defaults for timeout / retries / failMode", () => {
    const cfg = resolveConfig();
    expect(cfg.timeoutMs).toBe(60_000);
    expect(cfg.maxRetries).toBe(3);
    expect(cfg.failMode).toBe("closed");
  });
});

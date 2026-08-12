import { describe, it, expect, vi, afterEach } from "vitest";
import { enableAutoInstrumentation } from "./instrumentors.js";

describe("enableAutoInstrumentation (OpenInference / OTel)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("wires the real OTel v2 pipeline + registers the installed OpenInference instrumentors", async () => {
    // Don't let the exporter hit the network.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    const ai = await enableAutoInstrumentation({
      apiKey: "tm-abc",
      agentId: "sophia-agent",
      domain: "general_ai",
      environment: "local",
    });

    expect(ai.mode).toBe("embedded");
    // openai instrumentor is installed as a devDep → it must be wired.
    expect(ai.installed).toContain("@arizeai/openinference-instrumentation-openai");

    await ai.shutdown();
  });

  it("throws an actionable error when the OTel peer deps are missing", async () => {
    const failingLoader = vi.fn(async (m: string) => {
      throw new Error(`Cannot find module '${m}'`);
    });
    await expect(
      enableAutoInstrumentation(
        { apiKey: "tm-abc", agentId: "a", domain: "general_ai" },
        { load: failingLoader },
      ),
    ).rejects.toMatchObject({ code: "otel_peers_missing" });
  });

  it("requires an apiKey", async () => {
    await expect(
      enableAutoInstrumentation({ apiKey: "", agentId: "a", domain: "general_ai" }),
    ).rejects.toMatchObject({ code: "missing_api_key" });
  });
});

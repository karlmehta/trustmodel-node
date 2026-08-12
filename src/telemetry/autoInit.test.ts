import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { autoInit, otlpTracesUrl } from "./autoInit.js";

describe("autoInit telemetry (dependency-free OTLP)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the OTLP traces URL (full path, no double /v1/traces)", () => {
    expect(otlpTracesUrl({ environment: "production" })).toBe(
      "https://api.trustmodel.ai/sdk/v1/otel/v1/traces",
    );
  });

  it("span() records and flush() POSTs OTLP with X-API-Key + the agent_id resource attr", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    const tm = autoInit({
      apiKey: "tm-abc",
      agentId: "sophia-agent",
      domain: "general_ai",
      environment: "local",
      flushIntervalMs: 0, // no timer in the test
    });

    const out = await tm.span("llm.call", async () => 42, { model: "gpt-4o" });
    expect(out).toBe(42);

    await tm.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://localhost:8000/sdk/v1/otel/v1/traces");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ "X-API-Key": "tm-abc" });

    const body = JSON.parse((init as RequestInit).body as string);
    const attrs = body.resourceSpans[0].resource.attributes;
    const agentId = attrs.find((a: { key: string }) => a.key === "trustmodel.agent_id");
    expect(agentId.value.stringValue).toBe("sophia-agent");
    expect(body.resourceSpans[0].scopeSpans[0].spans[0].name).toBe("llm.call");

    await tm.shutdown();
  });

  it("flush() is a no-op when nothing is buffered", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    const tm = autoInit({
      apiKey: "tm-abc",
      agentId: "a",
      domain: "general_ai",
      flushIntervalMs: 0,
    });
    await tm.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    await tm.shutdown();
  });

  it("records the span even when fn throws, then rethrows", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const tm = autoInit({
      apiKey: "tm-abc",
      agentId: "a",
      domain: "general_ai",
      flushIntervalMs: 0,
    });
    await expect(
      tm.span("boom", async () => {
        throw new Error("kaboom");
      }),
    ).rejects.toThrow("kaboom");
    // The errored span is still buffered and exportable.
    await tm.flush();
    await tm.shutdown();
  });
});

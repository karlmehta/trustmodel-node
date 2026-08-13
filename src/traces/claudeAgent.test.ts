import { describe, it, expect } from "vitest";
import { traceFromClaudeAgentRun } from "./claudeAgent.js";

const RUN = [
  '{"kind":"run.start","input":"What does TrustModel do?"}',
  '{"kind":"message","message":{"type":"assistant","message":{"content":[{"type":"text","text":"searching"},{"type":"tool_use","id":"t1","name":"search_kb","input":{"q":"x"}}]}}}',
  '{"kind":"message","message":{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"result text"}]}}}',
  '{"kind":"message","message":{"type":"result","subtype":"success","result":"final answer"}}',
].join("\n");

describe("traceFromClaudeAgentRun", () => {
  it("maps a recorded run to an agentic trace", () => {
    const t = traceFromClaudeAgentRun(RUN);
    expect(t.goal).toBe("What does TrustModel do?");
    expect(t.steps.map((s) => s.step_type)).toEqual([
      "thought", "tool_call", "tool_result", "final_answer",
    ]);
    const call = t.steps.find((s) => s.step_type === "tool_call")!;
    expect(call.tool_name).toBe("search_kb");
    const result = t.steps.find((s) => s.step_type === "tool_result")!;
    expect(result.tool_name).toBe("search_kb"); // matched by tool_use_id
  });

  it("synthesizes a final_answer from the last thought if none present", () => {
    const t = traceFromClaudeAgentRun(
      '{"kind":"message","message":{"type":"assistant","message":{"content":[{"type":"text","text":"only a thought"}]}}}',
    );
    expect(t.steps.at(-1)).toMatchObject({ step_type: "final_answer", content: "only a thought" });
  });
});

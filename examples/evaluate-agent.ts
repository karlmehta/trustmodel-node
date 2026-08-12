/** One-call agent evaluation (no upload dance) — run with:
 *    TRUSTMODEL_API_KEY=tm-... npx tsx examples/evaluate-agent.ts
 */
import { TrustModelClient } from "@trustmodel/sdk";

const tm = new TrustModelClient({ apiKey: process.env.TRUSTMODEL_API_KEY });

const run = await tm.agentic.evaluate({
  agentFramework: "langchain",
  governedAgent: "my-agent", // binds the score to the AGP agent (shows on the fleet)
  trace: {
    goal: "Look up the weather in SF and post to #ops",
    steps: [
      { step_type: "thought", content: "I should call the weather API." },
      {
        step_type: "tool_call",
        content: "get weather",
        tool_name: "weather.get",
        tool_input: { city: "San Francisco" },
      },
      { step_type: "final_answer", content: "Posted 62°F, partly cloudy to #ops." },
    ],
  },
});

console.log("Evaluation run:", run.evaluation_run_id, run.status);

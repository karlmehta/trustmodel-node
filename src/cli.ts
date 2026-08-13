#!/usr/bin/env node
/** `trustmodel` CLI — the one-command way to evaluate an agent from any TS/JS codebase.
 *
 *   npm i @trustmodel/sdk
 *   export TRUSTMODEL_API_KEY=tm-...
 *   npx trustmodel eval-agent                 # auto-finds the newest .codenow/runs recording
 *   npx trustmodel eval-agent --run run.jsonl # a Claude Agent SDK recorded run
 *   npx trustmodel eval-agent --trace t.json  # an agentic trace ({ goal, steps })
 *   npx trustmodel eval-agent --agent sophia-agent --framework claude-agent-sdk --dry-run
 */
import * as fs from "node:fs";
import { TrustModelClient } from "./client.js";
import { traceFromRunFile, findNewestRun } from "./traces/claudeAgent.js";
import type { AgenticTrace } from "./types.js";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

const HELP = `trustmodel — evaluate an AI agent's trace and get a TrustScore.

Usage:
  trustmodel eval-agent [options]

Options:
  --run <file.jsonl>   A Claude Agent SDK recorded run to convert + evaluate.
  --trace <file.json>  An agentic trace ({ goal, name, agent_framework, steps[] }).
  (neither)            Auto-detect the newest .codenow/runs/*/*.jsonl recording.
  --agent <slug>       GovernedAgent slug to bind the score to (AGP fleet).
  --framework <name>   Agent framework (default: claude-agent-sdk).
  --dry-run            Print the trace that would be sent; no API call.
  --verbose            Print the per-dimension breakdown + summary.
  -h, --help           Show this help.

Env: TRUSTMODEL_API_KEY (required unless --dry-run), TRUSTMODEL_GOVERNED_AGENT,
     TRUSTMODEL_BASE_URL, TRUSTMODEL_ORGANIZATION_ID.`;

/** Print a per-dimension breakdown from whatever shape the result carries (defensive). */
function printBreakdown(res: Record<string, any>): void {
  const cats =
    res.category_scores ?? res.categories ?? res.dimension_scores ?? res.scores ?? res.dimensions;
  if (cats) {
    const entries: [string, unknown][] = Array.isArray(cats)
      ? cats.map((c: any) => [c.name ?? c.category ?? c.dimension ?? c.key ?? "?", c.score ?? c.value ?? c])
      : Object.entries(cats);
    if (entries.length) {
      console.log("   Dimensions:");
      for (const [k, v] of entries) {
        const val = v && typeof v === "object" ? (v as any).score ?? JSON.stringify(v) : v;
        console.log(`     • ${k}: ${val}`);
      }
    }
  }
  const raw = res.summary ?? res.assessment_summary ?? res.overall_summary;
  if (raw) {
    const summary =
      typeof raw === "string"
        ? raw
        : (raw.text ?? raw.overall ?? raw.summary ?? raw.content ?? JSON.stringify(raw));
    console.log(`   Summary: ${String(summary).slice(0, 800)}`);
  }
}

async function evalAgent(): Promise<number> {
  // Resolve the trace: explicit --trace, explicit --run, or auto-detect a recording.
  let trace: AgenticTrace;
  let source: string;
  const traceFile = flag("trace");
  const runFile = flag("run") ?? (traceFile ? undefined : findNewestRun() ?? undefined);

  if (traceFile) {
    trace = JSON.parse(fs.readFileSync(traceFile, "utf-8"));
    source = traceFile;
  } else if (runFile) {
    trace = traceFromRunFile(runFile);
    source = runFile;
  } else {
    console.error(
      "No trace found. Pass --trace <file.json> or --run <file.jsonl>, or run from a\n" +
        "project with recorded runs under .codenow/runs/. See `trustmodel eval-agent --help`.",
    );
    return 1;
  }

  const framework = flag("framework") ?? trace.agent_framework ?? "claude-agent-sdk";
  const agent = flag("agent") ?? process.env.TRUSTMODEL_GOVERNED_AGENT;

  const toolCalls = trace.steps.filter((s) => s.step_type === "tool_call").length;
  console.log(`▶ trace:          ${source}`);
  console.log(`▶ steps:          ${trace.steps.length} (${toolCalls} tool calls)`);
  console.log(`▶ framework:      ${framework}`);
  console.log(`▶ governed agent: ${agent ?? "(none — score won't attach to an AGP fleet card)"}`);

  if (has("dry-run")) {
    console.log("\n--dry-run — trace that would be sent:\n" + JSON.stringify(trace, null, 2));
    return 0;
  }

  const apiKey = process.env.TRUSTMODEL_API_KEY;
  if (!apiKey) {
    console.error("\nTRUSTMODEL_API_KEY is required. Create one at app.trustmodel.ai/settings/api-keys.");
    return 1;
  }
  const tm = new TrustModelClient({ apiKey });

  console.log("\n─── Submitting (uploading trace) ───");
  const run = await tm.agentic.evaluate({ trace, agentFramework: framework, governedAgent: agent });
  const id = run.evaluation_run_id;
  console.log(`  ✓ evaluation_run_id: ${id} (${run.status})`);

  console.log("─── Scoring ───");
  const started = Date.now();
  for (;;) {
    if (Date.now() - started > 15 * 60_000) {
      console.error("\nTimed out waiting for the score.");
      return 1;
    }
    await new Promise((r) => setTimeout(r, 5000));
    const res = (await tm.agentic.get(id)) as Record<string, any>;
    const status = res.status ?? res.latest_evaluation?.status;
    if (status === "completed" || status === "COMPLETED") {
      const score = res.overall_score ?? res.latest_evaluation?.overall_score;
      console.log(`\n✅ Agent TrustScore: ${score}`);
      if (res.grade) console.log(`   Grade: ${res.grade}`);
      if (agent) console.log(`   Attached to the AGP fleet for "${agent}".`);
      if (has("verbose")) printBreakdown(res);
      return 0;
    }
    if (status === "failed" || status === "FAILED") {
      console.error(`\nEvaluation failed (run ${id}).`);
      return 1;
    }
    process.stdout.write(".");
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (!cmd || has("help") || has("h") || cmd === "-h" || cmd === "--help") {
    console.log(HELP);
    process.exit(cmd && cmd !== "-h" && cmd !== "--help" ? 1 : 0);
  }
  if (cmd === "eval-agent") {
    process.exit(await evalAgent());
  }
  console.error(`Unknown command: ${cmd}\n\n${HELP}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("\n✗ " + (e?.message ?? String(e)));
  if (e?.detail !== undefined) {
    const d = typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail);
    console.error("  detail: " + d);
  }
  process.exit(1);
});

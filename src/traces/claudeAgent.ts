/** Convert a Claude Agent SDK run into a TrustModel agentic trace.
 *
 * The Claude Agent SDK's `query()` yields messages; agent recorders (e.g. CodeNow's
 * `.codenow/runs/<slug>/*.jsonl`) persist each as `{ kind: "message", message }` lines.
 * This turns that into the `{ goal, steps[] }` shape `tm.agentic.evaluate()` wants, so a
 * one-command CLI eval works out of the box. */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AgenticTrace, TraceStep } from "../types.js";

/** Convert recorded-run JSONL (one JSON object per line) into an agentic trace. */
export function traceFromClaudeAgentRun(jsonl: string): AgenticTrace {
  const steps: TraceStep[] = [];
  let goal = "";
  const toolNameById = new Map<string, string>();

  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let rec: any;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }

    if (rec.kind === "run.start" || (rec.input && !rec.message)) {
      goal ||= String(rec.input ?? rec.opts?.input ?? "");
      continue;
    }
    if (rec.kind && rec.kind !== "message") continue;
    const m = rec.message ?? rec;
    if (!m || typeof m !== "object") continue;

    if (m.type === "assistant") {
      const content = m.message?.content ?? m.content ?? [];
      for (const b of Array.isArray(content) ? content : []) {
        if (b?.type === "text" && b.text) {
          steps.push({ step_type: "thought", content: String(b.text) });
        } else if (b?.type === "tool_use") {
          if (b.id && b.name) toolNameById.set(b.id, b.name);
          steps.push({
            step_type: "tool_call",
            content: `Call ${b.name}`,
            tool_name: b.name,
            tool_input: b.input,
          });
        }
      }
    } else if (m.type === "user") {
      const content = m.message?.content ?? m.content ?? [];
      for (const b of Array.isArray(content) ? content : []) {
        if (b?.type === "tool_result") {
          steps.push({
            step_type: "tool_result",
            content: "tool result",
            tool_name: toolNameById.get(b.tool_use_id),
            tool_output: b.content,
          });
        }
      }
    } else if (m.type === "result") {
      const text = m.result ?? m.message ?? "";
      if (text) steps.push({ step_type: "final_answer", content: String(text) });
    }
  }

  if (!steps.some((s) => s.step_type === "final_answer")) {
    const lastThought = [...steps].reverse().find((s) => s.step_type === "thought");
    if (lastThought) steps.push({ step_type: "final_answer", content: lastThought.content });
  }

  return {
    goal: goal || "Agent conversation",
    name: "Agent run",
    agent_framework: "claude-agent-sdk",
    steps,
  };
}

/** Read + convert a recorded-run file. */
export function traceFromRunFile(file: string): AgenticTrace {
  return traceFromClaudeAgentRun(fs.readFileSync(file, "utf-8"));
}

/** Walk up from `startDir` to find a `.codenow/runs` directory. */
function findRunsRoot(startDir: string): string | null {
  let cur = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(cur, ".codenow", "runs");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

/** Newest recorded `.jsonl` run (across all slugs, or a specific `slug`), or null. */
export function findNewestRun(opts: { slug?: string; runsDir?: string; cwd?: string } = {}): string | null {
  const root = opts.runsDir ?? findRunsRoot(opts.cwd ?? process.cwd());
  if (!root || !fs.existsSync(root)) return null;
  const slugs = opts.slug
    ? [opts.slug]
    : fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const files: { f: string; t: number }[] = [];
  for (const slug of slugs) {
    const dir = path.join(root, slug);
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of entries) {
      const full = path.join(dir, f);
      files.push({ f: full, t: fs.statSync(full).mtimeMs });
    }
  }
  files.sort((a, b) => b.t - a.t);
  return files[0]?.f ?? null;
}

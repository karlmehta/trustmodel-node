/** Auto-detect + install OpenInference JS instrumentors — the Node analogue of the
 *  Python SDK's `_KNOWN_INSTRUMENTORS`. Best-effort: a missing package is skipped, never
 *  thrown, so telemetry works with whatever the app already has installed.
 *
 *  SCAFFOLD (slice 3): the module list + contract are fixed here; the dynamic-import
 *  wiring is filled in with the telemetry PR once the OTel peer-dep strategy is confirmed
 *  (see docs/DESIGN.md §3.2 / §8). */

/** (package, exported instrumentor class) pairs, mirroring the Python list. */
export const KNOWN_INSTRUMENTORS: ReadonlyArray<[pkg: string, exportName: string]> = [
  ["@arizeai/openinference-instrumentation-openai", "OpenAIInstrumentation"],
  ["@arizeai/openinference-instrumentation-langchain", "LangChainInstrumentation"],
  // anthropic / llama-index / bedrock / mistral / groq / crewai / vertexai as they
  // become available for JS — kept in lockstep with the Python instrumentor set.
];

/**
 * Install every available instrumentor and return the names that were wired.
 * TODO(slice 3): dynamic-import each pkg, call `registerInstrumentations()`.
 */
export async function installInstrumentors(): Promise<string[]> {
  const installed: string[] = [];
  // for (const [pkg, exportName] of KNOWN_INSTRUMENTORS) {
  //   try {
  //     const mod = await import(pkg);
  //     const Instr = mod[exportName];
  //     registerInstrumentations({ instrumentations: [new Instr()] });
  //     installed.push(pkg);
  //   } catch { /* package not present — skip */ }
  // }
  return installed;
}

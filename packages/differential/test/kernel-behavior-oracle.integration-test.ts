/**
 * Lean `kernelRun` and the TypeScript kernel return the same result on every scenario and population scenario discovered
 * under the two discovery roots (guard 16 of the kernel rewrite proposal). Discovery is by directory, so a new scenario
 * joins without an edit here. Whole results are compared, so a field either kernel starts to emit is compared at once.
 * No disagreement is expected: each one fails and is listed with the scenario and the first differing path.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import type { KernelJson } from "@bpmn-lean/bpmn-source";
import { firstValueDisagreement } from "@bpmn-lean/differential";
import type { ValueDisagreement } from "@bpmn-lean/differential";
import { parseStrict, runPopulation, runScenario } from "@bpmn-lean/kernel";
import type { Scenario } from "@bpmn-lean/semantic-core";

import { parseWireJsonBytes } from "../../../scripts/strict-json.ts";
import { readCaseKernelProgram } from "./kernel-program.ts";
import { runLeanKernelPopulation, runLeanKernelScenario, writeProgram } from "./kernel-targets.ts";
import { projectRoot } from "./pipeline-target-support.ts";

const discoveryRoots = ["scenarios", "packages/differential/test/fixtures"];

type SourceDefinition = Readonly<{ id: string; relativePath: string; sha256: string }>;
type PopulationScenario = Readonly<{ id: string; profile: string; definitions: ReadonlyArray<Readonly<{ bpmn: SourceDefinition }>> }>;
type DiscoveredScenario =
  | Readonly<{ kind: "scenario"; relativePath: string; bytes: Buffer; document: Scenario }>
  | Readonly<{ kind: "populationScenario"; relativePath: string; bytes: Buffer; document: PopulationScenario }>;
type OracleDisagreement = Readonly<{ scenario: string } & ValueDisagreement>;

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

async function filesUnder(relativeDirectory: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(path.join(projectRoot, relativeDirectory), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? filesUnder(relativePath) : [relativePath];
  }));
  return nested.flat();
}

async function discoveredScenarios(files: ReadonlyArray<string>): Promise<ReadonlyArray<DiscoveredScenario>> {
  return Promise.all(files.filter((file) => file.endsWith("scenario.json")).map(async (relativePath) => {
    const bytes = await readFile(path.join(projectRoot, relativePath));
    const document = parseWireJsonBytes<Scenario | PopulationScenario>(bytes, relativePath);
    const kind = (document as Readonly<{ kind?: unknown }>).kind;
    if (kind !== "scenario" && kind !== "populationScenario") {
      throw new TypeError(`${relativePath} is named as a scenario but has kind ${String(kind)}`);
    }
    return { kind, relativePath, bytes, document } as DiscoveredScenario;
  }));
}

/** The overlay a scenario binds by content digest, retained beside the scenario or beside its BPMN source. */
async function boundOverlay(relativePath: string, scenario: Scenario) {
  const identity = scenario.bpmn.sourceOverlay;
  if (identity === null) return null;
  for (const directory of [path.dirname(relativePath), path.dirname(scenario.bpmn.relativePath)]) {
    for (const name of await readdir(path.join(projectRoot, directory))) {
      if (!name.endsWith(".json")) continue;
      const bytes = await readFile(path.join(projectRoot, directory, name));
      if (sha256(bytes) === identity.sha256) return { ...identity, bytes };
    }
  }
  throw new Error(`${relativePath} binds an overlay that no neighbouring file has`);
}

async function kernelProgramFor(
  source: Readonly<{ relativePath: string; id: string; sha256: string }>,
  profile: string,
  overlay: Awaited<ReturnType<typeof boundOverlay>>,
): Promise<KernelJson> {
  const bytes = await readFile(path.join(projectRoot, source.relativePath));
  return readCaseKernelProgram({ relativePath: source.relativePath, bytes, sha256: source.sha256, overlay }, profile);
}

/** JSON serialization erases the undefined members a TypeScript result may carry and Lean's cannot. */
const wireValue = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

function compared(
  scenario: string,
  expected: unknown,
  actual: unknown,
): OracleDisagreement | null {
  const difference = firstValueDisagreement(expected, actual, "result");
  return difference === null ? null : { scenario, ...difference };
}

test("the Lean and TypeScript kernels agree on every discovered scenario and population scenario", async (t) => {
  const files = (await Promise.all(discoveryRoots.map(filesUnder))).flat().sort();
  const scenarios = await discoveredScenarios(files);
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-kernel-oracle-"));
  const disagreements: Array<OracleDisagreement> = [];
  let populationCount = 0;
  try {
    for (const [index, scenario] of scenarios.entries()) {
      const label = `${scenario.document.id} (${scenario.relativePath})`;
      const scenarioPath = path.join(projectRoot, scenario.relativePath);
      if (scenario.kind === "populationScenario") {
        populationCount += 1;
        const programs = await Promise.all(scenario.document.definitions.map((definition) =>
          kernelProgramFor(definition.bpmn, scenario.document.profile, null)));
        const programPaths = programs.map((_, definition) =>
          path.join(directory, `population-${String(index)}-${String(definition)}.json`));
        await Promise.all(programs.map((program, definition) => writeProgram(programPaths[definition]!, program)));
        const lean = await runLeanKernelPopulation(programPaths, scenarioPath);
        const difference = compared(label, lean, wireValue(runPopulation(programs, scenario.document)));
        if (difference !== null) disagreements.push(difference);
        continue;
      }
      const program = await kernelProgramFor(
        scenario.document.bpmn,
        scenario.document.profile,
        await boundOverlay(scenario.relativePath, scenario.document),
      );
      const programPath = path.join(directory, `scenario-${String(index)}.json`);
      await writeProgram(programPath, program);
      const lean = await runLeanKernelScenario(programPath, scenarioPath);
      const difference = compared(label, lean, wireValue(runScenario(program, scenario.document)));
      if (difference !== null) disagreements.push(difference);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  assert.ok(scenarios.length > populationCount && populationCount > 0, "discovery found no scenarios of a required kind");
  t.diagnostic(`scenarios ${String(scenarios.length - populationCount)}, populations ${String(populationCount)}, disagreements ${String(disagreements.length)}`);
  assert.deepEqual(disagreements, [], `kernel behavior disagreements:\n${disagreements.map((entry) => JSON.stringify(entry)).join("\n")}`);
});

test("the oracle comparison reports a changed value and a field only one kernel emits", () => {
  const deployment = { trace: [{ kind: "deployment", outcome: "unsupported" }] };
  assert.deepEqual(
    compared("control", deployment, { trace: [{ kind: "deployment", outcome: "committed" }] }),
    { scenario: "control", path: "result.trace[0].outcome", expected: "unsupported", actual: "committed" },
  );
  assert.deepEqual(
    compared("control", { trace: [{ ...deployment.trace[0], code: "admission.refused" }] }, deployment),
    { scenario: "control", path: "result.trace[0].code", expected: "admission.refused", actual: undefined },
  );
});

/** The strict-decoding code a refusal names, or `accepted`. */
function refusalCode(run: () => unknown): Promise<string> {
  return Promise.resolve().then(run).then(
    () => "accepted",
    (error: unknown) => /codec\.[A-Za-z]+/u.exec(String(error))?.[0] ?? `uncoded: ${String(error)}`,
  );
}

test("the Lean and TypeScript kernels refuse the same malformed inputs with the same strict-decoding code", async () => {
  const relativePath = "packages/differential/test/fixtures/serial-classification.scenario.json";
  const scenarioText = await readFile(path.join(projectRoot, relativePath), "utf8");
  const scenario = JSON.parse(scenarioText) as Scenario & Readonly<{ stimuli: ReadonlyArray<Record<string, unknown>> }>;
  const program = await kernelProgramFor(scenario.bpmn, scenario.profile, null) as unknown as Record<string, unknown>;
  const programText = JSON.stringify(program);
  const [first, ...rest] = scenario.stimuli;
  const withFirst = (stimulus: Record<string, unknown>): string => JSON.stringify({ ...scenario, stimuli: [stimulus, ...rest] });
  const { variables: _variables, ...withoutVariables } = first!;
  const cases: ReadonlyArray<readonly [string, string, string, string]> = [
    ["control", programText, scenarioText, "accepted"],
    ["repeated program key", `{"variables":[],${programText.slice(1)}`, scenarioText, "codec.duplicateField"],
    ["unknown program key", JSON.stringify({ ...program, extra: true }), scenarioText, "codec.unknownField"],
    ["mistyped program field", JSON.stringify({ ...program, flows: {} }), scenarioText, "codec.malformed"],
    ["unknown stimulus key", programText, withFirst({ ...first, extra: true }), "codec.unknownField"],
    ["missing stimulus key", programText, withFirst(withoutVariables), "codec.missingField"],
    ["null optional member", programText, withFirst({ ...first, at: null }), "codec.malformed"],
  ];
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-kernel-strict-"));
  try {
    for (const [label, programInput, scenarioInput, expected] of cases) {
      const programPath = path.join(directory, "program.json");
      const scenarioPath = path.join(directory, "scenario.json");
      await writeFile(programPath, programInput, "utf8");
      await writeFile(scenarioPath, scenarioInput, "utf8");
      const lean = await refusalCode(() => runLeanKernelScenario(programPath, scenarioPath));
      const typeScript = await refusalCode(() => {
        const decoded = [parseStrict(programInput), parseStrict(scenarioInput)].map((parsed) => {
          if (!parsed.ok) throw new Error(parsed.refusal);
          return parsed.value;
        });
        return runScenario(decoded[0], decoded[1]);
      });
      assert.deepEqual({ label, lean, typeScript }, { label, lean: expected, typeScript: expected });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

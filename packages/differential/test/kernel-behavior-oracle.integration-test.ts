/**
 * Guard 16 of the kernel rewrite proposal over every discovered scenario: Lean `kernelRun` and the TypeScript kernel
 * return the same whole result on every scenario and population scenario, and on every scenario with retained CIB Seven
 * evidence the kernel's result equals the retained one at the CIB observation boundary (`compareTargetResults`, which
 * drops the kernel-only `code` and `scopes` members and sorts open waits). Discovery is by directory
 * (`scenario-discovery.ts`), so a new scenario or evidence file joins without an edit here.
 *
 * No disagreement is expected: each one fails the test and is listed with the scenario and the first differing path,
 * never adjusted away. The evidence is compared against the TypeScript kernel's result; the first test establishes
 * that it is also Lean's.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { ComparisonKind, DifferentialTarget, compareTargetResults, firstValueDisagreement } from "@bpmn-lean/differential";
import type { ScenarioDisagreement, ValueDisagreement } from "@bpmn-lean/differential";
import { parseStrict, runPopulation, runScenario } from "@bpmn-lean/kernel";

import { pipelineTestTimeoutMs } from "../../../scripts/pipeline-budget.ts";
import { runLeanKernelPopulation, runLeanKernelScenario, writeProgram } from "./kernel-targets.ts";
import { projectRoot } from "./pipeline-target-support.ts";
import { DiscoveredKind, discoverScenarios, kernelProgramFor } from "./scenario-discovery.ts";
import type { CanonicalResult, DiscoveredScenario, ScenarioDocument } from "./scenario-discovery.ts";

type OracleDisagreement = Readonly<{ scenario: string } & ValueDisagreement>;
type EvidenceDisagreement = Readonly<{ scenario: string; evidence: string; disagreement: ScenarioDisagreement }>;

/** JSON serialization erases the undefined members a TypeScript result may carry and Lean's cannot. */
const wireValue = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

function compared(scenario: string, expected: unknown, actual: unknown): OracleDisagreement | null {
  const difference = firstValueDisagreement(expected, actual, "result");
  return difference === null ? null : { scenario, ...difference };
}

const label = (scenario: DiscoveredScenario): string => `${scenario.document.id} (${scenario.relativePath})`;

test("the Lean and TypeScript kernels agree on every discovered scenario, and the kernel on every retained CIB result", {
  timeout: pipelineTestTimeoutMs(),
}, async (t) => {
  const scenarios = await discoverScenarios();
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-kernel-oracle-"));
  const kernelDisagreements: Array<OracleDisagreement> = [];
  const evidenceDisagreements: Array<EvidenceDisagreement> = [];
  let populationCount = 0;
  let evidenceCount = 0;
  try {
    for (const [index, scenario] of scenarios.entries()) {
      const scenarioPath = path.join(projectRoot, scenario.relativePath);
      switch (scenario.kind) {
        case DiscoveredKind.PopulationScenario: {
          populationCount += 1;
          const programs = await Promise.all(scenario.document.definitions.map((definition) =>
            kernelProgramFor(scenario.relativePath, definition.bpmn, scenario.document.profile)));
          const programPaths = programs.map((_, definition) =>
            path.join(directory, `population-${String(index)}-${String(definition)}.json`));
          await Promise.all(programs.map((program, definition) => writeProgram(programPaths[definition]!, program)));
          const lean = await runLeanKernelPopulation(programPaths, scenarioPath);
          const difference = compared(label(scenario), lean, wireValue(runPopulation(programs, scenario.document)));
          if (difference !== null) kernelDisagreements.push(difference);
          break;
        }
        case DiscoveredKind.Scenario: {
          const program = await kernelProgramFor(scenario.relativePath, scenario.document.bpmn, scenario.document.profile);
          const programPath = path.join(directory, `scenario-${String(index)}.json`);
          await writeProgram(programPath, program);
          const lean = await runLeanKernelScenario(programPath, scenarioPath);
          const typeScript = wireValue(runScenario(program, scenario.document)) as CanonicalResult;
          const difference = compared(label(scenario), lean, typeScript);
          if (difference !== null) kernelDisagreements.push(difference);
          if (scenario.evidence === null) break;
          evidenceCount += 1;
          const comparison = compareTargetResults(
            { target: DifferentialTarget.RetainedCibEvidence, result: scenario.evidence.result },
            [{ target: DifferentialTarget.KernelTs, result: typeScript }],
          );
          if (comparison.kind === ComparisonKind.Disagreement) {
            evidenceDisagreements.push({
              scenario: label(scenario),
              evidence: scenario.evidence.relativePath,
              disagreement: comparison.disagreement,
            });
          }
          break;
        }
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  assert.ok(scenarios.length > populationCount && populationCount > 0, "discovery found no scenarios of a required kind");
  assert.ok(evidenceCount > 0, "discovery found no retained CIB evidence");
  t.diagnostic(
    `scenarios ${String(scenarios.length - populationCount)}, populations ${String(populationCount)}, ` +
      `retained CIB results ${String(evidenceCount)}, kernel disagreements ${String(kernelDisagreements.length)}, ` +
      `evidence disagreements ${String(evidenceDisagreements.length)}`,
  );
  assert.deepEqual(
    { kernelDisagreements, evidenceDisagreements },
    { kernelDisagreements: [], evidenceDisagreements: [] },
    [...kernelDisagreements, ...evidenceDisagreements].map((entry) => JSON.stringify(entry)).join("\n"),
  );
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
  const scenario = JSON.parse(scenarioText) as ScenarioDocument & Readonly<{ stimuli: ReadonlyArray<Record<string, unknown>> }>;
  const program = await kernelProgramFor(relativePath, { ...scenario.bpmn, sourceOverlay: null }, scenario.profile) as
    unknown as Record<string, unknown>;
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
    for (const [name, programInput, scenarioInput, expected] of cases) {
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
      assert.deepEqual({ name, lean, typeScript }, { name, lean: expected, typeScript: expected });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

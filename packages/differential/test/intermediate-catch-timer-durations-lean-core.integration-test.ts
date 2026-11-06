/**
 * TED-DEADLINE-01 on Lean: Lean and the semantic core agree, in logical time with no host clock, that an exact
 * Intermediate Catch duration refuses its Timer 1 ms before the deadline and fires it at the deadline. The hosted
 * pipeline and the time-skipping calibration cover the host clock; this case covers deadlines no hosted run can wait.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  BASELINE_SCENARIO_OBSERVATIONS, CanonicalObservationKind, CommandOutcome, ScenarioDocumentKind, StimulusKind, runScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario, Stimulus } from "@bpmn-lean/semantic-core";
import { runLeanDriver } from "./semantic-differential-targets.ts";
import { parseWireJson } from "../../../scripts/strict-json.ts";

const profile = "cibseven-2.2.0-intermediate-catch-timer-draft";
const timerId = { processInstanceId: "Instance_1", elementId: "TimerCatch_PT1S", activation: 1 };
const fire = (commandId: string, logicalTimeMs: number): Stimulus =>
  ({ kind: StimulusKind.FireTimer, commandId, timerId, logicalTimeMs });

test("Lean and the semantic core refuse an exact duration 1 ms early and fire it at its deadline", async () => {
  const source = await readFile(new URL("../../../scenarios/intermediate-catch-timer/process.bpmn", import.meta.url), "utf8");
  const inputs = [];
  for (const [lexeme, deadlineMs] of [["PT15M", 900_000], ["PT2H", 7_200_000]] as const) {
    const bytes = source.replace(">PT1S<", `>${lexeme}<`);
    const compiled = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(bytes),
      sourceId: `intermediate-catch-timer-${lexeme}`, expectedSha256: undefined, sourceOverlay: null,
      semanticProfile: profile, limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 } });
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error(`${lexeme} rejected`);
    const program = compiled.semanticProcess;
    const scenario: Scenario = { kind: ScenarioDocumentKind.Scenario, id: `intermediate-catch-timer-${lexeme}`, profile,
      bpmn: { id: program.identity.sourceId, sha256: program.identity.sourceSha256, sourceOverlay: null,
        relativePath: `${lexeme}.bpmn` },
      stimuli: [{ kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
        instanceId: "Instance_1", initialVariables: [] }, fire("early", deadlineMs - 1), fire("due", deadlineMs)],
      observations: BASELINE_SCENARIO_OBSERVATIONS,
      provenance: { normativeRefs: ["BPMN 2.0.2 §10.5.4", "BPMN 2.0.2 §10.5.5", "BPMN 2.0.2 Table 10.122"],
        cibRevision: "not-applicable", cibRefs: [] } };
    inputs.push({ scenario, program, bytes, checkedProcess: compiled.checkedProcess });
  }
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-exact-duration-lean-core-"));
  try {
    const definitions = path.join(directory, "definitions.jsonl");
    await writeFile(definitions, inputs.map(({ scenario, program, checkedProcess }) =>
      JSON.stringify({ scenarioId: scenario.id, checkedProcess, semanticProcess: program })).join("\n") + "\n");
    const paths = await Promise.all(inputs.map(async ({ scenario, bytes }) => {
      await writeFile(path.join(directory, scenario.bpmn.relativePath), bytes);
      const file = path.join(directory, `${scenario.id}.json`);
      await writeFile(file, JSON.stringify(scenario));
      return file;
    }));
    const execution = await runLeanDriver("BpmnSemantics/SemanticProcessJsonMain.lean", [definitions, ...paths],
      inputs.length);
    const actual = execution.stdout.split("\n").filter((line) => line.length > 0).map((line) =>
      parseWireJson<{ scenarioId: string; result: unknown }>(line, "exact-duration Lean result"));
    assert.equal(actual.length, inputs.length);
    for (const [index, { scenario, program }] of inputs.entries()) {
      const core = runScenario(scenario, program);
      assert.deepEqual(core.trace.flatMap((entry) => entry.kind === CanonicalObservationKind.Command ? [entry.outcome] : []),
        [CommandOutcome.Committed, CommandOutcome.Rejected, CommandOutcome.Committed], scenario.id);
      assert.deepEqual(actual[index]?.result, core, scenario.id);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

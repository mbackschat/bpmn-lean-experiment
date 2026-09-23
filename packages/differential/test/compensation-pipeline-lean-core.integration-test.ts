import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { BpmnCompilationStatus, COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CommandOutcome, EffectExecutionResultKind, ObservationRequestKind, ScenarioDocumentKind, StimulusKind,
  VariableValueKind, applyStimulusWithTrace, initialState, isWellFormedRuntimeState,
  projectOpenFlowNodeOccurrences, replayCommittedTransitions, runScenario,
  type Scenario, type Stimulus } from "@bpmn-lean/semantic-core";
import { isDeepStrictEqual } from "node:util";
import { runLeanInterpreter } from "./semantic-differential-targets.ts";
import { parseStrictJson } from "../../../scripts/strict-json.ts";

const instanceId = "CompensationPipeline_1";
const occurrence = (elementId: string) => ({ processInstanceId: instanceId, elementId, activation: 1 });
const forwardOrders = [
  ["Task_ReserveHotel", "Task_ArrangeGroundTravel", "Task_IssueInsurance"],
  ["Task_IssueInsurance", "Task_ReserveHotel", "Task_ArrangeGroundTravel"],
  ["Task_ReserveHotel", "Task_IssueInsurance", "Task_ArrangeGroundTravel"],
];
const undoOrders = [
  ["Task_UndoGroundTravel", "Task_UndoInsurance", "Task_UndoReserveHotel"],
  ["Task_UndoGroundTravel", "Task_UndoReserveHotel", "Task_UndoInsurance"],
  ["Task_UndoInsurance", "Task_UndoGroundTravel", "Task_UndoReserveHotel"],
];

test("the checked-source Compensation scenarios agree through success and handler failure", async () => {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("../../bpmn-source/test/fixtures/compensation-source-checkpoint.bpmn", import.meta.url)),
    sourceId: "compensation-pipeline", expectedSha256: undefined, sourceOverlay: null,
    semanticProfile: COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) throw new Error("source rejected");
  const program = compilation.semanticProcess;
  const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId, initialVariables: [{ name: "Property_TravelDetails", value: { kind: VariableValueKind.String, value: "frozen itinerary" } }] };
  const scenarios: Scenario[] = [];
  for (const [branch, forward] of forwardOrders.entries()) {
    for (const [order, undo] of undoOrders.entries()) {
      for (const failureAt of [null, ...undo]) {
        const stimuli: Stimulus[] = [start, ...forward.map((elementId): Stimulus => ({
          kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete:${elementId}`,
          taskId: occurrence(elementId), submittedValues: [],
        }))];
        const completed = stimuli[1];
        assert.ok(completed !== undefined);
        stimuli.splice(2, 0, { ...completed, commandId: "stale-task" });
        for (const elementId of undo) {
          stimuli.push({ kind: StimulusKind.CompleteEffect, commandId: `undo:${elementId}`, effectId: occurrence(elementId),
            result: elementId === failureAt
              ? { kind: EffectExecutionResultKind.BpmnError, code: "undo-failed", message: "handler failed", localPatch: [] }
              : { kind: EffectExecutionResultKind.Success, localPatch: [] } });
          if (elementId === failureAt) break;
        }
        scenarios.push({ kind: ScenarioDocumentKind.Scenario, id: `compensation-${branch}-${order}-${failureAt ?? "success"}`,
          profile: program.identity.semanticProfile,
          bpmn: { id: program.identity.sourceId, sha256: program.identity.sourceSha256,
            sourceOverlay: null, relativePath: "packages/bpmn-source/test/fixtures/compensation-source-checkpoint.bpmn" },
          stimuli, observations: [ObservationRequestKind.Deployment, ObservationRequestKind.CommandResults,
            ObservationRequestKind.ProcessStatus, ObservationRequestKind.ActiveWaits, ObservationRequestKind.OpenUserTasks,
            ObservationRequestKind.OpenTimers, ObservationRequestKind.OpenEffects, ObservationRequestKind.Variables,
            ObservationRequestKind.EnabledInteractions, ObservationRequestKind.LogicalTime],
          // The trigger capsule selects no CIB oracle (Normative authority and interpretation boundary).
          // These private interpreter inputs therefore carry no CIB source or compatibility claim.
          provenance: { normativeRefs: ["BPMN 2.0.2 Clause 10.7.2", "BPMN 2.0.2 Clause 13.5.5",
            "BPMN 2.0.2 Clause 13.3.2"], cibRevision: "not-applicable", cibRefs: [] },
        });
      }
    }
  }
  assert.equal(scenarios.length, 36);
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-compensation-pipeline-"));
  try {
    const definitions = path.join(directory, "definitions.jsonl");
    await writeFile(definitions, `${scenarios.map((scenario) => JSON.stringify({ scenarioId: scenario.id,
      checkedProcess: compilation.checkedProcess, semanticProcess: program })).join("\n")}\n`);
    const scenarioPaths = await Promise.all(scenarios.map(async (scenario) => {
      const scenarioPath = path.join(directory, `${scenario.id}.json`);
      await writeFile(scenarioPath, JSON.stringify(scenario));
      return scenarioPath;
    }));
    const execution = await runLeanInterpreter("BpmnSemantics/SemanticProcessJsonMain.lean",
      ["--publications", definitions, ...scenarioPaths], scenarios.length);
    const actual = execution.stdout.trim().split("\n").map((line) =>
      parseStrictJson<{ scenarioId: string; scenario: Scenario; result: unknown; commandPublications: unknown }>(line, "Compensation Lean result"));
    assert.equal(actual.length, scenarios.length);
    for (const [index, scenario] of scenarios.entries()) {
      const expected = runScenario(scenario, program);
      assert.deepEqual(actual[index]?.scenario, scenario);
      assert.deepEqual(actual[index]?.result, expected, scenario.id);
      let state = initialState;
      const publications = scenario.stimuli.map((stimulus) => {
        const before = state;
        const traced = applyStimulusWithTrace(program, before, stimulus);
        state = traced.result.state;
        assert.equal(traced.result.outcome,
          stimulus.commandId === "stale-task" ? CommandOutcome.Rejected : CommandOutcome.Committed);
        assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
        assert.equal(traced.committedTransitions.length > 0, traced.result.outcome === CommandOutcome.Committed);
        assert.equal(traced.flowNodeOccurrenceLifecycles.length, traced.committedTransitions.length);
        assert.ok(projectOpenFlowNodeOccurrences(program, state) !== null);
        return {
          commandId: stimulus.commandId, outcome: traced.result.outcome,
          stateUnchanged: isDeepStrictEqual(state, before),
          stateWellFormed: isWellFormedRuntimeState(program, instanceId, state),
          traceReplays: isDeepStrictEqual(replayCommittedTransitions(program, before, traced.committedTransitions), state),
          publication: traced.committedTransitions.length === 0 ? null
            : { transitions: traced.committedTransitions, current: traced.currentPositions },
          lifecycles: traced.flowNodeOccurrenceLifecycles,
          openOccurrences: projectOpenFlowNodeOccurrences(program, state),
        };
      });
      assert.equal(state.control.kind, scenario.id.endsWith("success") ? "completed" : "failed");
      assert.deepEqual(actual[index]?.commandPublications, publications, `${scenario.id} publications`);
    }
    const first = actual[0];
    const firstScenarioPath = scenarioPaths[0];
    assert.ok(first !== undefined && firstScenarioPath !== undefined);
    const oneDefinition = path.join(directory, "one-definition.jsonl");
    await writeFile(oneDefinition, JSON.stringify({ scenarioId: first.scenarioId,
      checkedProcess: compilation.checkedProcess, semanticProcess: program }));
    const ordinary = await runLeanInterpreter("BpmnSemantics/SemanticProcessJsonMain.lean",
      [oneDefinition, firstScenarioPath], 1);
    const ordinaryRecord = parseStrictJson<Record<string, unknown>>(ordinary.stdout.trim(), "ordinary scenario result");
    assert.equal("commandPublications" in ordinaryRecord, false);
    assert.deepEqual(ordinaryRecord.result, first.result);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

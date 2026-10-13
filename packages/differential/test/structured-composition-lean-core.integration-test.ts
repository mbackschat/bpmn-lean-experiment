import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess, lowerCheckedProcess } from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind, CommandOutcome, ObservationRequestKind, ScenarioDocumentKind,
  STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID, applyStimulusWithTrace, initialState,
  isWellFormedRuntimeState, projectOpenFlowNodeOccurrences, replayCommittedTransitions, runScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario, ScenarioResult, Stimulus } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import type { MutableScenarioResult } from "./pipeline-types.ts";
import { parseWireJson } from "../../../scripts/strict-json.ts";
import { runLeanInterpreter } from "./semantic-differential-targets.ts";
import { binding, complete, eightStepSource, instanceId, invoiceSource, nineStepSource, serialSource, start }
  from "./structured-composition-fixtures.ts";

const profile = STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID;
const observations = [ObservationRequestKind.Deployment, ObservationRequestKind.CommandResults,
  ObservationRequestKind.ProcessStatus, ObservationRequestKind.ActiveWaits, ObservationRequestKind.OpenUserTasks,
  ObservationRequestKind.OpenTimers, ObservationRequestKind.OpenEffects, ObservationRequestKind.Variables,
  ObservationRequestKind.EnabledInteractions, ObservationRequestKind.LogicalTime];
const compile = (bytes: string) => compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(bytes),
  sourceId: "invoice-composition", expectedSha256: undefined, semanticProfile: profile, sourceOverlay: null,
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 } });
function stateAfter(result: ScenarioResult, commandId: string) {
  const index = result.trace.findIndex(value => value.kind === CanonicalObservationKind.Command && value.commandId === commandId);
  assert.notEqual(index, -1, commandId);
  const state = result.trace[index + 1];
  assert.equal(state?.kind, CanonicalObservationKind.State);
  if (state?.kind !== CanonicalObservationKind.State) throw new Error(`missing state after ${commandId}`);
  return state;
}

test("private composition binds independent Lean lowering, invoice execution, publications and separating mutations", async () => {
  const schedules: Array<{ id: string; bytes: string; stimuli: Stimulus[] }> = [];
  for (const [value, branch] of [["approved", "approve"], ["rejected", "reject"], [null, "manual"]] as const) {
    schedules.push({ id: branch, bytes: invoiceSource(), stimuli: [
      start([binding("summary", "Invoice 4711")]),
      { ...complete("assess", [binding("decision", value)]), commandId: "refuse-property-name" },
      { ...complete("assess"), commandId: "refuse-omitted-output" },
      { ...complete("assess", [binding("assess_out", value)], 2), commandId: "refuse-activation" },
      complete("assess", [binding("assess_out", value)]),
      { ...complete("assess", [binding("assess_out", value)]), commandId: "refuse-stale-task" },
      { ...complete(branch, [binding("decision", "changed")]), commandId: "refuse-ordinary-write" },
      complete(branch), complete("archive", [binding("archive_out", "saved")]),
    ] });
    schedules.push({ id: `all-write-${branch}`, bytes: invoiceSource([true, true, true]), stimuli: [
      start([...(value === null ? [] : [binding("decision", value)]), binding("summary", "Invoice 4711")]),
      complete(branch, [binding(`${branch}_out`, value)]), complete("archive", [binding("archive_out", "saved")]),
    ] });
  }
  for (const value of ["approved", null]) schedules.push({ id: `serial-${value}`, bytes: serialSource, stimuli: [
    start([binding("summary", "Invoice 4711")]), complete("assess", [binding("assess_out", value)]),
    complete("archive", [binding("archive_out", "saved")]),
  ] });
  schedules.push(
    { id: "partial-write-missing", bytes: invoiceSource([true, false, false]),
      stimuli: [start([binding("summary", "Invoice 4711")])] },
    { id: "partial-write-initialized", bytes: invoiceSource([true, false, false]), stimuli: [
      start([binding("decision", null), binding("summary", "Invoice 4711")]), complete("manual"),
      complete("archive", [binding("archive_out", "saved")])] },
    { id: "eight-step", bytes: eightStepSource, stimuli: [start([]), complete("review")] },
  );
  const inputs = await Promise.all(schedules.map(async ({ id, bytes, stimuli }) => {
    const compiled = await compile(bytes);
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted, id);
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error(`source rejected: ${id}`);
    const scenario: Scenario = { kind: ScenarioDocumentKind.Scenario, id, profile,
      bpmn: { id: compiled.semanticProcess.identity.sourceId, sha256: compiled.semanticProcess.identity.sourceSha256,
        sourceOverlay: null, relativePath: `${id}.bpmn` }, stimuli, observations,
      provenance: { normativeRefs: ["BPMN 2.0.2 Clause 10.4.1", "BPMN 2.0.2 Clause 10.4.2",
        "BPMN 2.0.2 Clause 13.3.2", "BPMN 2.0.2 Clause 13.4.2"],
        cibRevision: "not-applicable", cibRefs: [] } };
    return { scenario, program: compiled.semanticProcess, checkedProcess: compiled.checkedProcess, bytes };
  }));
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-composition-parity-"));
  try {
    const definitions = path.join(directory, "definitions.jsonl");
    await writeFile(definitions, inputs.map(({ scenario, program, checkedProcess }) =>
      JSON.stringify({ scenarioId: scenario.id, checkedProcess, semanticProcess: program })).join("\n") + "\n");
    const paths = await Promise.all(inputs.map(async ({ scenario, bytes }) => {
      const file = path.join(directory, `${scenario.id}.json`);
      await writeFile(path.join(directory, scenario.bpmn.relativePath), bytes);
      await writeFile(file, JSON.stringify(scenario));
      return file;
    }));
    const execution = await runLeanInterpreter("BpmnSemantics/SemanticProcessJsonMain.lean",
      ["--publications", definitions, ...paths], inputs.length);
    const actual = execution.stdout.split("\n").filter(line => line.length > 0).map(line => parseWireJson<{
      scenarioId: string; scenario: Scenario; result: ScenarioResult; commandPublications: unknown;
      definitionBinding: unknown;
    }>(line, "composition Lean result"));
    assert.equal(actual.length, inputs.length);
    for (const [index, { scenario, program }] of inputs.entries()) {
      const record = actual[index]!;
      assert.equal(record.scenarioId, scenario.id);
      assert.deepEqual(record.scenario, scenario);
      assert.deepEqual(record.definitionBinding, { kind: "leanDefinitionBinding",
        sourceSha256: program.identity.sourceSha256, semanticProfile: profile, programMatchesLeanLowering: true });
      const result = runScenario(scenario, program);
      assert.deepEqual(record.result, result, scenario.id);
      if (scenario.id === "partial-write-missing") {
        assert.deepEqual(result.outcome, { kind: "semantic", outcome: CommandOutcome.Unsupported });
        assert.deepEqual(record.commandPublications, []);
        continue;
      }
      let state = initialState;
      const publications = scenario.stimuli.map(stimulus => {
        const before = state;
        const traced = applyStimulusWithTrace(program, before, stimulus);
        state = traced.result.state;
        const rejected = stimulus.commandId.startsWith("refuse-");
        assert.equal(traced.result.outcome, rejected ? CommandOutcome.Rejected : CommandOutcome.Committed);
        assert.equal(traced.result.internalStepBoundExceeded, false);
        assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
        const replayed = replayCommittedTransitions(program, before, traced.committedTransitions);
        assert.deepEqual(replayed, rejected ? null : state);
        if (rejected) {
          assert.deepEqual(state, before);
          assert.deepEqual(traced.flowNodeOccurrenceLifecycles, []);
        }
        return { commandId: stimulus.commandId, outcome: traced.result.outcome,
          stateUnchanged: isDeepStrictEqual(state, before), stateWellFormed: true,
          traceReplays: isDeepStrictEqual(replayed, state),
          publication: traced.committedTransitions.length === 0 ? null :
            { transitions: traced.committedTransitions, current: traced.currentPositions },
          lifecycles: traced.flowNodeOccurrenceLifecycles, openOccurrences: projectOpenFlowNodeOccurrences(program, state) };
      });
      assert.equal(state.control.kind, "completed");
      assert.deepEqual(state.variables.activities, []);
      assert.deepEqual(record.commandPublications, publications, `${scenario.id} publications`);
      if (["approve", "reject", "manual"].includes(scenario.id)) {
        const decision = scenario.id === "approve" ? "approved" : scenario.id === "reject" ? "rejected" : null;
        assert.deepEqual(stateAfter(record.result, "start").openUserTasks.map(task => task.id.elementId), ["assess"]);
        assert.deepEqual(stateAfter(record.result, "complete-assess-1").openUserTasks.map(task => task.id.elementId), [scenario.id]);
        assert.deepEqual(stateAfter(record.result, `complete-${scenario.id}-1`).openUserTasks.map(task => task.id.elementId), ["archive"]);
        assert.deepEqual(stateAfter(record.result, `complete-${scenario.id}-1`).openUserTasks[0]?.inputs, [binding("archive_in", decision)]);
        assert.deepEqual(stateAfter(record.result, "complete-archive-1").variables, [binding("decision", decision), binding("receipt", "saved"), binding("summary", "Invoice 4711")]);
        const started = publications.flatMap(publication => publication.lifecycles.flatMap(delta => delta.started));
        assert.deepEqual(started.filter(occurrence => ["approve", "reject", "manual"].includes(occurrence.elementId))
          .map(occurrence => occurrence.elementId), [scenario.id]);
        assert.deepEqual(stateAfter(record.result, "start").openUserTasks[0]?.inputs, [binding("assess_in", "Invoice 4711")]);
      } else if (scenario.id.startsWith("serial-")) {
        const decision = scenario.id === "serial-null" ? null : "approved";
        const first = stateAfter(record.result, "start").openUserTasks[0]!;
        const next = stateAfter(record.result, "complete-assess-1").openUserTasks[0]!;
        assert.deepEqual(first.inputs, [binding("assess_in", "Invoice 4711")]);
        assert.deepEqual(next.id, { processInstanceId: instanceId, elementId: "archive", activation: 1 });
        assert.notDeepEqual(next.id, first.id);
        assert.deepEqual(next.inputs, [binding("archive_in", decision)]);
      } else if (scenario.id.startsWith("all-write-")) {
        const branch = scenario.id.slice("all-write-".length);
        const decision = branch === "approve" ? "approved" : branch === "reject" ? "rejected" : null;
        assert.deepEqual(stateAfter(record.result, "start").openUserTasks.map(task => task.id.elementId), [branch]);
        assert.deepEqual(stateAfter(record.result, "start").openUserTasks[0]?.inputs, [binding(`${branch}_in`, "Invoice 4711")]);
        assert.deepEqual(stateAfter(record.result, `complete-${branch}-1`).openUserTasks[0]?.inputs, [binding("archive_in", decision)]);
      } else if (scenario.id === "partial-write-initialized") {
        assert.deepEqual(stateAfter(record.result, "complete-manual-1").openUserTasks[0]?.inputs, [binding("archive_in", null)]);
      } else if (scenario.id === "eight-step") {
        assert.deepEqual(stateAfter(record.result, "start").openUserTasks.map(task => task.id.elementId), ["review"]);
      }
    }
    const approved = actual.find(record => record.scenarioId === "approve")!.result;
    const mutate = (change: (result: MutableScenarioResult) => void) => {
      const wrong = structuredClone(approved) as MutableScenarioResult;
      change(wrong);
      const comparison = compareTargetResults({ target: DifferentialTarget.Lean, result: approved },
        [{ target: DifferentialTarget.SemanticCore, result: wrong }]);
      assert.equal(comparison.kind, ComparisonKind.Disagreement);
      return comparison;
    };
    const mutableAfter = (result: MutableScenarioResult, commandId: string) => {
      const index = result.trace.findIndex(value => value.kind === CanonicalObservationKind.Command && value.commandId === commandId);
      const state = result.trace[index + 1];
      assert.ok(index >= 0 && state?.kind === CanonicalObservationKind.State);
      return state;
    };
    const wrongWrite = mutate(result => { mutableAfter(result, "complete-assess-1").variables[0]!.name = "assess_out"; });
    const earlyChoice = mutate(result => { mutableAfter(result, "complete-assess-1").openUserTasks[0]!.id.elementId = "manual"; });
    const synchronizingMerge = mutate(result => { mutableAfter(result, "complete-approve-1").openUserTasks = []; });
    for (const [comparison, expectedPath] of [[wrongWrite, "trace[10].variables[0].name"],
      [earlyChoice, "trace[10].openUserTasks[0].id.elementId"],
      [synchronizingMerge, "trace[16].openUserTasks.length"]] as const) {
      assert.equal(comparison.kind, ComparisonKind.Disagreement);
      if (comparison.kind === ComparisonKind.Disagreement) assert.equal("path" in comparison.disagreement ? comparison.disagreement.path : null, expectedPath);
    }
    const unionAtMerge = compareTargetResults({ target: DifferentialTarget.Lean,
      result: actual.find(record => record.scenarioId === "partial-write-missing")!.result },
      [{ target: DifferentialTarget.SemanticCore, result: actual.find(record => record.scenarioId === "all-write-manual")!.result }]);
    assert.equal(unionAtMerge.kind, ComparisonKind.Disagreement);
    if (unionAtMerge.kind === ComparisonKind.Disagreement) assert.deepEqual(unionAtMerge.disagreement,
      { kind: "outcome", path: "outcome.outcome", expected: "unsupported", actual: "committed" });

    assert.equal((await compile(nineStepSource)).status, BpmnCompilationStatus.Rejected);
    const bounded = inputs.find(input => input.scenario.id === "eight-step")!;
    const checkedProcess = { ...bounded.checkedProcess, sequenceFlows: bounded.checkedProcess.sequenceFlows.map(flow => {
      switch (flow.id) {
        case "one_approve": return { ...flow, targetId: "review" };
        case "last": return { ...flow, targetId: "end" };
        case "finish": return { ...flow, targetId: "one_merge" };
        default: return flow;
      }
    }) };
    await writeFile(definitions, JSON.stringify({ scenarioId: bounded.scenario.id, checkedProcess,
      semanticProcess: lowerCheckedProcess(checkedProcess) }) + "\n");
    await assert.rejects(runLeanInterpreter("BpmnSemantics/SemanticProcessJsonMain.lean",
      [definitions, path.join(directory, "eight-step.json")], 1), /checked Process is not well formed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CommandOutcome, EffectExecutionResultKind, ObservationRequestKind, ScenarioDocumentKind, StimulusKind,
  TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID, applyStimulusWithTrace, initialState,
  isWellFormedRuntimeState, projectOpenFlowNodeOccurrences, replayCommittedTransitions, runScenario,
  type Scenario, type Stimulus } from "@bpmn-lean/semantic-core";
import { runLeanInterpreter } from "./semantic-differential-targets.ts";
import { parseStrictJson } from "../../../scripts/strict-json.ts";

test("Transaction source lowering and paired publications agree in Lean and the core", async () => {
  const relativePath = "packages/bpmn-source/test/fixtures/transaction-cancellation.bpmn";
  const xml = await readFile(new URL("../../bpmn-source/test/fixtures/transaction-cancellation.bpmn", import.meta.url), "utf8");
  const variants = [
    { id: "empty", retained: false, prepared: false, failed: false, renamed: false },
    { id: "retained-active", retained: true, prepared: false, failed: false, renamed: false },
    { id: "retained-ended", retained: true, prepared: true, failed: false, renamed: false },
    { id: "handler-failed", retained: true, prepared: false, failed: true, renamed: false },
    { id: "renamed-long", retained: true, prepared: true, failed: false, renamed: true },
  ];
  const contexts = await Promise.all(variants.map(async (variant) => {
    const element = (id: string) => variant.renamed ? `Renamed_${id}` : id;
    let source = xml;
    if (variant.renamed) {
      source = source.replace('<bpmn:userTask id="Task_Withdraw"',
        '<bpmn:userTask id="Task_Confirm" /><bpmn:sequenceFlow id="Flow_Confirm" sourceRef="Task_Confirm" targetRef="End_Cancel" /><bpmn:userTask id="Task_Withdraw"')
        .replace('sourceRef="Task_Withdraw" targetRef="End_Cancel"', 'sourceRef="Task_Withdraw" targetRef="Task_Confirm"')
        .replaceAll(/\b(?:Definitions|Process|Transaction|Start|Split|Task|End|Boundary|Cancel|Compensate|Association|Flow)_\w+/g,
          (id) => element(id));
    }
    const compilation = await compileBpmnToSemanticProcess({
      bytes: Buffer.from(source), sourceId: `transaction-${variant.id}`, expectedSha256: undefined,
      sourceOverlay: null, semanticProfile: TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID,
      limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 },
    });
    assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
    if (compilation.status !== BpmnCompilationStatus.Accepted) throw new Error("Transaction source rejected");
    const program = compilation.semanticProcess;
    const instanceId = `withdrawal-${variant.id}`;
    const occurrence = (id: string) => ({ processInstanceId: instanceId, elementId: element(id), activation: 1 });
    const complete = (id: string): Stimulus => ({ kind: StimulusKind.CompleteUserTaskInstance,
      commandId: `complete:${id}`, taskId: occurrence(id), submittedValues: [] });
    const stimuli: Stimulus[] = [{ kind: StimulusKind.StartProcess, commandId: "start",
      processId: program.processId, instanceId, initialVariables: [] }];
    if (variant.retained) stimuli.push(complete("Task_Reserve"));
    if (variant.prepared) stimuli.push(complete("Task_Prepare"));
    stimuli.push(complete("Task_Withdraw"));
    if (variant.renamed) stimuli.push(complete("Task_Confirm"));
    stimuli.push({ ...complete("Task_Reserve"), commandId: "stale-task" });
    if (variant.retained) stimuli.push({ kind: StimulusKind.CompleteEffect, commandId: "release",
      effectId: occurrence("Task_Release"), result: variant.failed
        ? { kind: EffectExecutionResultKind.BpmnError, code: "release-failed", message: "release failed", localPatch: [] }
        : { kind: EffectExecutionResultKind.Success, localPatch: [] } });
    if (!variant.failed) stimuli.push(complete("Task_Acknowledge"));
    const scenario: Scenario = { kind: ScenarioDocumentKind.Scenario, id: `transaction-${variant.id}`,
      profile: program.identity.semanticProfile,
      bpmn: { id: program.identity.sourceId, sha256: program.identity.sourceSha256, sourceOverlay: null, relativePath },
      stimuli, observations: [ObservationRequestKind.Deployment, ObservationRequestKind.CommandResults,
        ObservationRequestKind.ProcessStatus, ObservationRequestKind.ActiveWaits, ObservationRequestKind.OpenUserTasks,
        ObservationRequestKind.OpenTimers, ObservationRequestKind.OpenEffects, ObservationRequestKind.Variables,
        ObservationRequestKind.EnabledInteractions, ObservationRequestKind.LogicalTime],
      provenance: { normativeRefs: ["BPMN 2.0.2 Clause 10.3.5", "BPMN 2.0.2 Clause 13.5.5"],
        cibRevision: "not-applicable", cibRefs: [] },
    };
    return { compilation, program, scenario, instanceId, failed: variant.failed };
  }));
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-transaction-pipeline-"));
  try {
    const definitions = path.join(directory, "definitions.jsonl");
    await writeFile(definitions, contexts.map(({ compilation, program, scenario }) => JSON.stringify({
      scenarioId: scenario.id, checkedProcess: compilation.checkedProcess, semanticProcess: program,
    })).join("\n") + "\n");
    const paths = await Promise.all(contexts.map(async ({ scenario }) => {
      const file = path.join(directory, `${scenario.id}.json`);
      await writeFile(file, JSON.stringify(scenario));
      return file;
    }));
    const execution = await runLeanInterpreter("BpmnSemantics/SemanticProcessJsonMain.lean",
      ["--publications", definitions, ...paths], contexts.length);
    const records = execution.stdout.trim().split("\n").map((line) => parseStrictJson<{
      scenarioId: string; scenario: Scenario; result: unknown; commandPublications: unknown;
      definitionBinding: { sourceSha256: string; semanticProfile: string; programMatchesLeanLowering: boolean };
    }>(line, "Transaction Lean publication"));
    assert.equal(records.length, contexts.length);
    for (const [index, { program, scenario, instanceId, failed }] of contexts.entries()) {
      const record = records[index];
      assert.equal(record?.scenarioId, scenario.id);
      assert.equal(record?.definitionBinding.sourceSha256, program.identity.sourceSha256);
      assert.equal(record?.definitionBinding.semanticProfile, program.identity.semanticProfile);
      assert.equal(record?.definitionBinding.programMatchesLeanLowering, true);
      assert.deepEqual(record?.scenario, scenario);
      assert.deepEqual(record?.result, runScenario(scenario, program), scenario.id);
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
        return { commandId: stimulus.commandId, outcome: traced.result.outcome,
          stateUnchanged: isDeepStrictEqual(state, before),
          stateWellFormed: isWellFormedRuntimeState(program, instanceId, state),
          traceReplays: isDeepStrictEqual(replayCommittedTransitions(program, before, traced.committedTransitions), state),
          publication: traced.committedTransitions.length === 0 ? null
            : { transitions: traced.committedTransitions, current: traced.currentPositions },
          lifecycles: traced.flowNodeOccurrenceLifecycles,
          openOccurrences: projectOpenFlowNodeOccurrences(program, state) };
      });
      assert.equal(state.control.kind, failed ? "failed" : "completed");
      assert.deepEqual(record?.commandPublications, publications, `${scenario.id} publications`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

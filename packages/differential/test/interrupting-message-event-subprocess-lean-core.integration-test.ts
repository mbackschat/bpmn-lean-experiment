import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, ObservationRequestKind, ScenarioDocumentKind, StimulusKind,
  applyStimulusWithTrace, initialState, isWellFormedRuntimeState, projectOpenFlowNodeOccurrences,
  replayCommittedTransitions, runScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario, ScenarioResult, Stimulus } from "@bpmn-lean/semantic-core";
import { parseWireJson } from "../../../scripts/strict-json.ts";
import { runLeanInterpreter } from "./semantic-differential-targets.ts";

const profile = "bpmn-2.0.2-interrupting-message-event-subprocess-draft";
const instanceId = "application-parity";
const channel = { kind: "operationMessage", interfaceId: "Interface_Applications",
  interfaceOperationId: "Operation_Withdraw", messageId: "Message_Withdrawal" } as const;
const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start",
  processId: "Process_ApplicationReview", instanceId, initialVariables: [] };
const withdraw: Stimulus = { kind: StimulusKind.DeliverMessage, commandId: "withdraw",
  subscriptionId: { processInstanceId: instanceId, elementId: "Start_Withdrawal", activation: 1 }, channel };
const complete = (elementId: string): Stimulus => ({ kind: StimulusKind.CompleteUserTaskInstance,
  commandId: `complete-${elementId}`, taskId: { processInstanceId: instanceId, elementId, activation: 1 },
  submittedValues: [] });
const observations = [ObservationRequestKind.Deployment, ObservationRequestKind.CommandResults,
  ObservationRequestKind.ProcessStatus, ObservationRequestKind.ActiveWaits, ObservationRequestKind.OpenUserTasks,
  ObservationRequestKind.OpenTimers, ObservationRequestKind.OpenEffects, ObservationRequestKind.Variables,
  ObservationRequestKind.EnabledInteractions, ObservationRequestKind.LogicalTime];

test("private Message handler agrees across independent lowering, races and complete E1/E2", async () => {
  const bytes = await readFile(new URL("../../bpmn-source/test/fixtures/application-review-withdrawal.bpmn", import.meta.url));
  const compiled = await compileBpmnToSemanticProcess({ bytes, sourceId: "application-review-withdrawal",
    expectedSha256: undefined, semanticProfile: profile, sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 } });
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("application source rejected");
  const schedules: Array<{ id: string; stimuli: Stimulus[] }> = [
    { id: "withdraw-before-either", stimuli: [start, withdraw,
      { ...withdraw, commandId: "refuse-second" },
      { ...complete("Task_Eligibility"), commandId: "refuse-cancelled-eligibility" },
      { ...complete("Task_Documents"), commandId: "refuse-cancelled-documents" }, complete("Task_Withdrawal")] },
  ];
  for (const [first, last] of [["Task_Eligibility", "Task_Documents"], ["Task_Documents", "Task_Eligibility"]] as const) {
    schedules.push(
      { id: `normal-${first}`, stimuli: [start, complete(first), complete(last),
        { ...withdraw, commandId: "refuse-expired" }] },
      { id: `withdraw-after-${first}`, stimuli: [start, complete(first), withdraw,
        { ...complete(last), commandId: "refuse-race-loser" }, complete("Task_Withdrawal")] },
    );
  }
  const inputs = schedules.map(({ id, stimuli }) => {
      const checkedProcess = compiled.checkedProcess;
      const program = compiled.semanticProcess;
      const scenario: Scenario = { kind: ScenarioDocumentKind.Scenario, id,
        profile, bpmn: { id: program.identity.sourceId, sha256: program.identity.sourceSha256,
          sourceOverlay: null, relativePath: "application.bpmn" }, stimuli, observations,
        provenance: { normativeRefs: ["BPMN 2.0.2 Clause 10.3.5", "BPMN 2.0.2 Clause 13.5.4"],
          cibRevision: "not-applicable", cibRefs: [] } };
      return { scenario, checkedProcess, program };
    });
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-message-handler-parity-"));
  try {
    const definitions = path.join(directory, "definitions.jsonl");
    await writeFile(definitions, inputs.map(({ scenario, checkedProcess, program }) =>
      JSON.stringify({ scenarioId: scenario.id, checkedProcess, semanticProcess: program })).join("\n") + "\n");
    await writeFile(path.join(directory, "application.bpmn"), bytes);
    const paths = await Promise.all(inputs.map(async ({ scenario }) => {
      const file = path.join(directory, `${scenario.id}.json`);
      await writeFile(file, JSON.stringify(scenario));
      return file;
    }));
    const execution = await runLeanInterpreter("BpmnSemantics/SemanticProcessJsonMain.lean",
      ["--publications", definitions, ...paths], inputs.length);
    const records = execution.stdout.split("\n").filter(line => line.length > 0).map(line => parseWireJson<{
      scenarioId: string; scenario: Scenario; result: ScenarioResult; commandPublications: unknown;
      definitionBinding: unknown;
    }>(line, "Message handler Lean result"));
    assert.equal(records.length, inputs.length);
    for (const [index, { scenario, program }] of inputs.entries()) {
      const record = records[index]!;
      assert.equal(record.scenarioId, scenario.id);
      assert.deepEqual(record.scenario, scenario);
      assert.deepEqual(record.definitionBinding, { kind: "leanDefinitionBinding",
        sourceSha256: program.identity.sourceSha256, semanticProfile: profile, programMatchesLeanLowering: true });
      assert.deepEqual(record.result, runScenario(scenario, program), `${scenario.id} E1`);
      let state = initialState;
      const publications = scenario.stimuli.map(stimulus => {
        const before = state;
        const traced = applyStimulusWithTrace(program, before, stimulus);
        state = traced.result.state;
        const rejected = stimulus.commandId.startsWith("refuse-");
        assert.equal(traced.result.outcome, rejected ? CommandOutcome.Rejected : CommandOutcome.Committed);
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
      assert.deepEqual(state.eventSubProcessMessageSubscriptions, []);
      assert.deepEqual(record.commandPublications, publications, `${scenario.id} E2`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

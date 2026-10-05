import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CanonicalObservationKind, CommandOutcome, INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID, ProcessStatus,
  ScenarioStepKind, StimulusKind, advanceScenario, initialState, observeStableState } from "@bpmn-lean/semantic-core";
import type { RuntimeState, Stimulus } from "@bpmn-lean/semantic-core";
import { FlowNodeOccurrenceTerminalKind, requireBpmnWorkflowContinuationStateV1 } from "@bpmn-lean/temporal-protocol";
import { createCommandPublicationState, integrateCommandPublication, recordCommandPublicationOutcome } from "../dist/command-publication-integration.js";

const compilation = await compileBpmnToSemanticProcess({
  bytes: await readFile(new URL("../../../bpmn-source/test/fixtures/application-review-withdrawal.bpmn", import.meta.url)),
  sourceId: "application-review-withdrawal", expectedSha256: undefined,
  semanticProfile: INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID, sourceOverlay: null,
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 },
});
assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
if (compilation.status !== BpmnCompilationStatus.Accepted) throw new Error("Application source must compile");
const program = compilation.semanticProcess;
const declaration = program.interruptingMessageEventSubProcesses![0]!;
const ordinaryTasks = ["Task_Eligibility", "Task_Documents"] as const;

for (const completedFirst of [null, ...ordinaryTasks]) {
  test(`restored withdrawal publishes exact interruption after ${completedFirst ?? "neither task"}`, () => {
    const instanceId = `withdraw-${completedFirst ?? "both"}`;
    const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId, initialVariables: [] } as const;
    const delivery = { kind: StimulusKind.DeliverMessage, commandId: "withdraw",
      subscriptionId: { processInstanceId: instanceId, elementId: declaration.startEventId, activation: 1 }, channel: declaration.channel } as const;
    const complete = (elementId: string, commandId = `complete-${elementId}`) => ({ kind: StimulusKind.CompleteUserTaskInstance,
      commandId, taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues: [] } as const);
    let state: RuntimeState = initialState;
    let publications = createCommandPublicationState(program, instanceId);
    let ticks = 0;
    function commit(command: Stimulus) {
      const restored = command.kind === StimulusKind.StartProcess ? state
        : requireBpmnWorkflowContinuationStateV1(JSON.parse(JSON.stringify(state)), program, instanceId);
      const step = advanceScenario(program, restored, command);
      assert.deepEqual(step, advanceScenario(program, state, command));
      assert.equal(step.kind, ScenarioStepKind.Committed);
      if (step.kind !== ScenarioStepKind.Committed) assert.fail("Expected committed command");
      publications = integrateCommandPublication(program, publications, command, step, () => ++ticks);
      publications = recordCommandPublicationOutcome(publications, command, step.observations);
      assert.equal(publications.execution.headRevision, publications.flowNodeOccurrences.headRevision);
      state = step.state;
      return step;
    }
    function refuse(command: Stimulus) {
      const before = publications;
      const step = advanceScenario(program, state, command);
      assert.equal(step.kind, ScenarioStepKind.Terminal);
      assert.equal(step.observations.find(observation => observation.kind === CanonicalObservationKind.Command)?.outcome, CommandOutcome.Rejected);
      assert.deepEqual(step.state, state);
      assert.deepEqual(integrateCommandPublication(program, publications, command, step, () => assert.fail("Refusal published")), before);
    }
    commit(start);
    assert.equal(publications.flowNodeOccurrences.currentOpen.some(fact => fact.elementId === declaration.elementId), false);
    if (completedFirst !== null) commit(complete(completedFirst));
    const remaining = publications.flowNodeOccurrences.currentOpen.filter(fact => ordinaryTasks.some(id => id === fact.elementId));
    assert.equal(remaining.length, completedFirst === null ? 2 : 1);
    const before = publications;
    const step = commit(delivery);
    const ends = publications.flowNodeOccurrences.batches.at(-1)!.transitions.flatMap(record => record.lifecycle.ended);
    for (const occurrence of remaining) assert.deepEqual(ends.find(end =>
      end.id.startRevision === occurrence.id.startRevision && end.id.startIndex === occurrence.id.startIndex),
    { id: occurrence.id, terminal: FlowNodeOccurrenceTerminalKind.Cancelled });
    assert.deepEqual(state.userTaskWaits.map(wait => wait.id.elementId), ["Task_Withdrawal"]);
    assert.deepEqual(state.eventSubProcessMessageSubscriptions, []);
    assert.equal(observeStableState(program, state).status, ProcessStatus.Running);
    const corrupted = { ...step, flowNodeOccurrenceLifecycles: step.flowNodeOccurrenceLifecycles!.map(delta => ({ ...delta, ended: [] })) };
    let corruptClockCalled = false;
    assert.throws(() => integrateCommandPublication(program, before, delivery, corrupted, () => { corruptClockCalled = true; return ticks + 1; }));
    assert.equal(corruptClockCalled, false);
    assert.equal(integrateCommandPublication(program, publications, delivery, step, () => assert.fail("Retry republished")), publications);
    refuse({ ...delivery, commandId: "second-withdrawal" });
    for (const task of ordinaryTasks) refuse(complete(task, `stale-${task}`));
    commit(complete("Task_Withdrawal"));
    assert.equal(observeStableState(program, state).status, ProcessStatus.Completed);
    assert.deepEqual(publications.flowNodeOccurrences.currentOpen, []);
    assert.equal(publications.commandResults.find(result => result.commandId === delivery.commandId)?.outcome, CommandOutcome.Committed);
  });
}

for (const order of [ordinaryTasks, [...ordinaryTasks].reverse()]) {
  test(`ordinary completion ${order.join(" then ")} retires the listener without a handler`, () => {
    const instanceId = `normal-${order[0]}`;
    let state: RuntimeState = initialState;
    let publications = createCommandPublicationState(program, instanceId);
    const commands: Stimulus[] = [
      { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId, initialVariables: [] },
      ...order.map(elementId => ({ kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}`,
        taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues: [] } as const)),
    ];
    for (const [index, command] of commands.entries()) {
      if (command.kind !== StimulusKind.StartProcess) state = requireBpmnWorkflowContinuationStateV1(JSON.parse(JSON.stringify(state)), program, instanceId);
      const step = advanceScenario(program, state, command);
      assert.equal(step.kind, ScenarioStepKind.Committed);
      if (step.kind !== ScenarioStepKind.Committed) assert.fail("Expected normal completion");
      publications = integrateCommandPublication(program, publications, command, step, () => index + 1);
      state = step.state;
    }
    assert.equal(observeStableState(program, state).status, ProcessStatus.Completed);
    assert.deepEqual(state.eventSubProcessMessageSubscriptions, []);
    const started = publications.flowNodeOccurrences.batches.flatMap(batch => batch.transitions).flatMap(record => record.lifecycle.started);
    assert.equal(started.some(fact => [declaration.elementId, declaration.startEventId, "Task_Withdrawal"].includes(fact.elementId)), false);
    const lateCommand = { kind: StimulusKind.DeliverMessage, commandId: "late-withdrawal",
      subscriptionId: { processInstanceId: instanceId, elementId: declaration.startEventId, activation: 1 }, channel: declaration.channel } as const;
    const late = advanceScenario(program, state, lateCommand);
    assert.equal(late.kind, ScenarioStepKind.Terminal);
    assert.equal(late.observations.find(observation => observation.kind === CanonicalObservationKind.Command)?.outcome, CommandOutcome.Rejected);
    assert.deepEqual(late.state, state);
    assert.deepEqual(integrateCommandPublication(program, publications, lateCommand, late, () => assert.fail("Late Message published")), publications);
  });
}

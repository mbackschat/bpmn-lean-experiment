import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "../../../bpmn-source/dist/index.js";
import {
  ScenarioStepKind, SemanticOperationKind, StimulusKind, advanceScenario, initialState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import {
  assessTemporalHostCapability, requireExecutionPublicationPage,
  TemporalHostCapabilityResultKind,
} from "../dist/index.js";
import { programOccurrenceStartMatchesTransition } from "../dist/flow-node-occurrence-publication-program-validation.js";
import { monitoredProgram } from "../../../semantic-core/test/monitored-task-fixture.ts";

const instanceId = "SubscriptionPublication";
const profile = "bpmn-2.0.2-repeatable-event-subscriptions-draft";

async function compile(name: string): Promise<SemanticProcessProgram> {
  const bytes = await readFile(new URL(
    `../../../bpmn-source/test/fixtures/repeatable-event-subscriptions/${name}.bpmn`, import.meta.url,
  ));
  const compiled = await compileBpmnToSemanticProcess({
    bytes, sourceId: name, semanticProfile: profile, sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Source refused");
  return compiled.semanticProcess;
}

test("an isolated recurring Timer requires the subscription scheduler rather than legacy one-shot admission", () => {
  assert.equal(assessTemporalHostCapability(monitoredProgram).kind,
    TemporalHostCapabilityResultKind.Admitted);
  const recurring = { ...monitoredProgram,
    identity: { ...monitoredProgram.identity, semanticProfile: profile },
    operations: monitoredProgram.operations.map((operation) =>
      operation.kind === SemanticOperationKind.AwaitMonitoredUserTask
        ? { ...operation, boundaryTimer: { ...operation.boundaryTimer, recurrence: "repeating" as const } }
        : operation),
  };
  assert.equal(assessTemporalHostCapability(recurring).kind,
    TemporalHostCapabilityResultKind.Admitted);
  assert.equal(assessTemporalHostCapability({ ...recurring, identity: monitoredProgram.identity }).kind,
    TemporalHostCapabilityResultKind.Rejected);
});

function publish(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus,
  fromRevision = 0): { state: RuntimeState; revision: number } {
  const step = advanceScenario(program, state, stimulus);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) throw new Error("Command refused");
  assert.ok(step.publication);
  assert.ok(step.flowNodeOccurrenceLifecycles);
  const throughRevision = fromRevision + step.publication.transitions.length;
  const transitions = step.publication.transitions.map((record, index) => ({ revision: fromRevision + index + 1, ...record }));
  const page = {
    definition: program.identity, processId: program.processId, processInstanceId: instanceId,
    requestedAfterRevision: fromRevision, pageThroughRevision: throughRevision, headRevision: throughRevision,
    batches: [{ commandId: stimulus.commandId, fromRevision, throughRevision, transitions }],
    current: { revision: throughRevision, ...step.publication.current },
  };
  assert.deepEqual(requireExecutionPublicationPage(page, {
    program, processInstanceId: instanceId, afterRevision: fromRevision, limit: 1,
  }), page);
  for (const [index, delta] of step.flowNodeOccurrenceLifecycles.entries()) {
    for (const started of delta.started) {
      const record = transitions[index]!;
      assert.equal(programOccurrenceStartMatchesTransition(started, program, record), true);
      assert.equal(programOccurrenceStartMatchesTransition({
        ...started, owner: { ...started.owner, definitionScopeId: "UnrelatedScope" },
      }, program, record), false);
    }
  }
  return { state: step.state, revision: throughRevision };
}

for (const name of ["boundary-message", "boundary-timer", "subprocess-boundary-timer"]) {
  test(`strict readers preserve ${name} starts and two overlapping handler publications`, async () => {
    const program = await compile(name);
    let published = publish(program, initialState, {
      kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
      instanceId, initialVariables: [],
    });
    for (let count = 1; count <= 2; count += 1) {
      const message = published.state.messageWaits[0];
      const timer = published.state.timerWaits[0];
      const stimulus: Stimulus = name === "boundary-message"
        ? { kind: StimulusKind.DeliverMessage, commandId: `trigger-${count}`,
          subscriptionId: message!.id, channel: message!.channel }
        : { kind: StimulusKind.FireTimer, commandId: `trigger-${count}`,
          timerId: timer!.id, logicalTimeMs: timer!.deadlineMs };
      published = publish(program, published.state, stimulus, published.revision);
      assert.equal(published.state.userTaskWaits.filter(({ id }) => id.elementId === "HandleReminder").length, count);
    }
  });
  test(`the validated ${name} checkpoint selects subscription hosting`, async () => {
    assert.equal(assessTemporalHostCapability(await compile(name)).kind,
      TemporalHostCapabilityResultKind.Admitted);
  });
}

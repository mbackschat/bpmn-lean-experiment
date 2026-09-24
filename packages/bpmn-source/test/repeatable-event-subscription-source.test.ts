import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  ControlStateKind,
  InternalSchedulingMode,
  SemanticOperationKind,
  StimulusKind,
  applyStimulus,
  applyStimulusWithTrace,
  applyInternalOperationStep,
  attachedHandlersForBodyAnchor,
  initialState,
  isWellFormedSemanticProcessProgram,
  projectOpenFlowNodeOccurrences,
  projectControlPositionDelta,
  projectFlowNodeOccurrenceLifecycleDelta,
  runtimeStateDefects,
  requireCompleteFlowNodeOccurrenceLifecycles,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import { admittedInternalPrefix } from "../../semantic-core/test/internal-operation-prefix-fixture.ts";
const { deriveInternalExecutionFrontier, classifyPreparedInternalFrontier, InternalFrontierDisposition } = await import(
  new URL("../../semantic-core/dist/internal-transition-preparation.js", import.meta.url).href
) as typeof import("../../semantic-core/src/internal-transition-preparation.ts");
const { applyPreparedInternalTransition, deriveInternalTransitionPreparation } = await import(
  new URL("../../semantic-core/dist/internal-transition-batch.js", import.meta.url).href
) as typeof import("../../semantic-core/src/internal-transition-batch.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../../semantic-core/dist/internal-publication-template.js", import.meta.url).href
) as typeof import("../../semantic-core/src/internal-publication-template.ts");
const { compareTokenPlaces } = await import(
  new URL("../../semantic-core/dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../../semantic-core/src/semantic-process-state.ts");
const { importBpmnGraph } = await import(
  new URL("../dist/moddle-adapter.js", import.meta.url).href
) as typeof import("../src/moddle-adapter.ts");
const { projectTimerBoundaryEvent } = await import(
  new URL("../dist/timer-boundary-event-source.js", import.meta.url).href
) as typeof import("../src/timer-boundary-event-source.ts");

const profile = "bpmn-2.0.2-repeatable-event-subscriptions-draft";

test("boundary projection preserves recurrence only for the selected non-interrupting profile", async () => {
  const parsed = await importBpmnGraph(await source("boundary-timer"), 1_000);
  assert.deepEqual(parsed.warnings, []);
  const boundary = [...parsed.located.keys()].find(({ id }) => id === "Reminder");
  assert.ok(boundary);
  const flows = [{ id: "Flow_ReminderToHandler", sourceId: "Reminder",
    targetId: "HandleReminder", condition: null }];
  const project = (semanticProfile: string) => projectTimerBoundaryEvent(
    boundary, "Reminder", flows, "bpmn:TimerEventDefinition", semanticProfile,
  );
  assert.deepEqual(project(profile), {
    kind: "timerBoundaryEvent", id: "Reminder", attachedToRef: "UserTask_Sibling",
    interruption: "nonInterrupting", cycleLiteral: "R/PT1S",
    outputFlowId: "Flow_ReminderToHandler",
  });
  assert.equal(project("bpmn-2.0.2-non-interrupting-boundary-timer-draft"), undefined);
  boundary.cancelActivity = true;
  assert.equal(project(profile), undefined);
});

test("checked wire retains one exact duration or cycle expression and rejects mixed expressions", async () => {
  const schema = JSON.parse(await readFile(new URL(
    "../../../contracts/schemas/checked-process.schema.json", import.meta.url,
  ), "utf8")) as { $defs: Record<string, unknown> };
  const validate = new Ajv2020({ strict: true }).compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs, $ref: "#/$defs/node",
  });
  const boundary = {
    kind: "timerBoundaryEvent", id: "Reminder", attachedToRef: "Review",
    interruption: "nonInterrupting", outputFlowId: "ReminderFlow",
  };
  assert.equal(validate({ ...boundary, durationLiteral: "PT1S" }), true);
  assert.equal(validate({ ...boundary, cycleLiteral: "R/PT1S" }), true);
  assert.equal(validate(boundary), false);
  assert.equal(validate({ ...boundary, durationLiteral: "PT1S", cycleLiteral: "R/PT1S" }), false);
  assert.equal(validate({ ...boundary, cycleLiteral: "R2/PT1S" }), false);
});

async function source(name: string): Promise<string> {
  return readFile(new URL(
    `fixtures/repeatable-event-subscriptions/${name}.bpmn`, import.meta.url,
  ), "utf8");
}

function compile(bytes: string, semanticProfile = profile) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(bytes),
    sourceId: "repeatable-subscription-admission",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
}

function commitWithPublication(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const open = projectOpenFlowNodeOccurrences(program, state);
  assert.ok(open !== null);
  const trace = applyStimulusWithTrace(program, state, stimulus);
  assert.equal(trace.result.outcome, CommandOutcome.Committed);
  const predecessors = open.map((entry) => ({
    ...entry, attachedHandlers: attachedHandlersForBodyAnchor(state, entry.anchor),
  }));
  requireCompleteFlowNodeOccurrenceLifecycles(program, predecessors,
    stimulus.commandId, trace.committedTransitions, trace.flowNodeOccurrenceLifecycles);
  assert.ok(trace.flowNodeOccurrenceLifecycles.length > 0);
  assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(program, predecessors,
    stimulus.commandId, trace.committedTransitions, trace.flowNodeOccurrenceLifecycles.slice(0, -1)));
  assert.deepEqual(runtimeStateDefects(program, "SubscriptionInstance", trace.result.state), []);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, trace.result.state), null);
  return trace.result.state;
}

for (const name of [
  "boundary-message", "boundary-timer", "catch-message", "catch-timer",
  "receive-task", "subprocess-boundary-timer", "burst-8",
]) {
  test(`admits the selected ${name} forest with independent outside work`, async () => {
    const result = await compile(await source(name));
    assert.equal(result.status, BpmnCompilationStatus.Accepted);
    if (result.status !== BpmnCompilationStatus.Accepted) return;
    const program = result.semanticProcess;
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(isWellFormedSemanticProcessProgram({
      ...program, internalSchedulingMode: InternalSchedulingMode.RequireChoiceSchedule,
    }), false);
    const started = applyStimulus(program, initialState, {
      kind: StimulusKind.StartProcess, commandId: "start-subscription",
      processId: program.processId, instanceId: "SubscriptionInstance", initialVariables: [],
    });
    assert.equal(started.outcome, CommandOutcome.Committed);
    assert.equal(started.internalStepBoundExceeded, false);
    assert.deepEqual(runtimeStateDefects(program, "SubscriptionInstance", started.state), []);
    assert.notEqual(projectOpenFlowNodeOccurrences(program, started.state), null);
    assert.deepEqual(commitWithPublication(program, initialState, {
      kind: StimulusKind.StartProcess, commandId: "start-subscription",
      processId: program.processId, instanceId: "SubscriptionInstance", initialVariables: [],
    }), started.state);
  });
}

for (const interrupting of [false, true]) {
  test(`admits ${interrupting ? "an interrupting" : "a persistent"} Message host alongside ordinary child entry`, async () => {
    const bytes = (await source("message-host-with-child-entry")).replace(
      'cancelActivity="false"', `cancelActivity="${interrupting}"`,
    );
    const compiled = await compile(bytes);
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) return;
    const program = compiled.semanticProcess;
    const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start-message-and-child",
      processId: program.processId, instanceId: "SubscriptionInstance", initialVariables: [] };
    const state = admittedInternalPrefix(program, initialState, start,
      ["operation:Start_Root", "operation:RootFork"], ["operation:IndependentAudit", "operation:SubProcess_Work"]);
    const frontier = deriveInternalExecutionFrontier(program, state, (operation) => ({
      step: applyInternalOperationStep(program, operation, state), refusal: null,
    }));
    assert.equal(frontier.preparationFailed, false);
    assert.equal(frontier.refusal, null);
    assert.deepEqual(frontier.offers.map(({ step }) => step.operation.kind), [
      interrupting ? SemanticOperationKind.AwaitMessageBoundedUserTask : SemanticOperationKind.AwaitMessageMonitoredUserTask,
      SemanticOperationKind.EnterScope,
    ]);
    const prepared = frontier.offers.map(({ preparation }) => { assert.ok(preparation); return preparation; });
    const classification = classifyPreparedInternalFrontier(prepared);
    assert.ok(classification?.kind === InternalFrontierDisposition.IndependentBatch);
    assert.equal(classification.members.length, 2);
    const run = (order: typeof prepared) => order.reduce((before, member) => {
      const after = applyPreparedInternalTransition(program, before, member);
      assert.ok(after);
      return after;
    }, state);
    assert.deepEqual(run(prepared), run([...prepared].reverse()));
    commitWithPublication(program, initialState, start);
  });
}

for (const interrupting of [false, true]) for (const regional of [SemanticOperationKind.CompleteScope, SemanticOperationKind.TerminateScope]) {
  test(`valid intermediate ${regional} commutes with outside ${interrupting ? "interrupting" : "persistent"} Message arming`, async () => {
    const compiled = await compile((await source("message-host-with-child-entry")).replace(
      'cancelActivity="false"', `cancelActivity="${interrupting}"`,
    ));
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) return;
    const program = compiled.semanticProcess;
    const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "intermediate-pair",
      processId: program.processId, instanceId: "SubscriptionInstance", initialVariables: [] };
    const prefix = admittedInternalPrefix(program, initialState, start,
      ["operation:Start_Root", "operation:RootFork"], ["operation:IndependentAudit", "operation:SubProcess_Work"]);
    const entry = program.operations.find((operation) => operation.kind === SemanticOperationKind.EnterScope);
    assert.ok(entry?.kind === SemanticOperationKind.EnterScope);
    const entered = applyInternalOperationStep(program, entry, prefix);
    assert.ok(entered !== null);
    const child = entered.successor.scopeOccurrences.find(({ id }) => id.definitionScopeId === entry.childScopeId);
    assert.ok(child !== undefined);
    const terminate = program.operations.find((operation) => operation.kind === SemanticOperationKind.TerminateScope);
    assert.ok(terminate?.kind === SemanticOperationKind.TerminateScope);
    // The approved proof domain includes valid predecessors without requiring a discovered source schedule.
    const state: RuntimeState = { ...entered.successor,
      controlTokens: entered.successor.controlTokens.flatMap((token) =>
        token.owner.definitionScopeId !== entry.childScopeId ? [token] :
          regional === SemanticOperationKind.CompleteScope ? [] : [{ ...token, placeId: terminate.input }]).sort(compareTokenPlaces),
    };
    assert.deepEqual(runtimeStateDefects(program, "SubscriptionInstance", state), []);
    assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
    const frontier = deriveInternalExecutionFrontier(program, state, (operation) => ({
      step: applyInternalOperationStep(program, operation, state), refusal: null,
    }));
    assert.equal(frontier.preparationFailed, false);
    assert.equal(frontier.refusal, null);
    assert.deepEqual(frontier.offers.map(({ step }) => step.operation.kind).sort(), [
      interrupting ? SemanticOperationKind.AwaitMessageBoundedUserTask : SemanticOperationKind.AwaitMessageMonitoredUserTask,
      regional,
    ].sort());
    const prepared = frontier.offers.map(({ preparation }) => { assert.ok(preparation); return preparation; });
    assert.equal(classifyPreparedInternalFrontier(prepared)?.kind, InternalFrontierDisposition.IndependentBatch);
    const publication = instantiateInternalPublicationBatch(start.commandId, 11,
      prepared.map(({ publicationTemplate }) => publicationTemplate));
    assert.ok(publication !== null);
    const run = (ordered: typeof prepared) => ordered.reduce((before, member) => {
      assert.deepEqual(deriveInternalTransitionPreparation(program, before, member), member);
      const after = applyPreparedInternalTransition(program, before, member);
      assert.ok(after !== null);
      assert.deepEqual(runtimeStateDefects(program, "SubscriptionInstance", after), []);
      assert.notEqual(projectOpenFlowNodeOccurrences(program, after), null);
      const expected = publication.find(({ alternative }) => alternative.operationId === member.operation.id);
      assert.ok(expected !== undefined);
      assert.deepEqual(projectControlPositionDelta(program, before, after), expected.record.positionDelta);
      assert.deepEqual(projectFlowNodeOccurrenceLifecycleDelta(program, before, after,
        { kind: "internal", operation: member.operation, owner: member.owner }, start.commandId, expected.transitionIndex), expected.lifecycle);
      return after;
    }, state);
    assert.deepEqual(run(prepared), run(prepared.toReversed()));
  });
}

for (const name of ["boundary-message", "boundary-timer", "subprocess-boundary-timer"]) {
  test(`retains the strict checked and Program wire for ${name}`, async () => {
    const compiled = await compile(await source(name));
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) return;
    for (const [file, value] of [
      ["checked-process", compiled.checkedProcess], ["semantic-process", compiled.semanticProcess],
    ] as const) {
      const schema = JSON.parse(await readFile(new URL(
        `../../../contracts/schemas/${file}.schema.json`, import.meta.url,
      ), "utf8"));
      const validate = new Ajv2020({ strict: true }).compile(schema);
      assert.equal(validate(value), true, JSON.stringify(validate.errors));
      assert.equal(validate({ ...value, unexpected: true }), false);
    }
  });
  test(`publishes repeated ${name} triggers, host withdrawal, and exact regional cleanup from source`, async () => {
    const compiled = await compile(await source(name));
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) return;
    const program = compiled.semanticProcess;
    let state = commitWithPublication(program, initialState, {
      kind: StimulusKind.StartProcess, commandId: "start-subscription", processId: program.processId,
      instanceId: "SubscriptionInstance", initialVariables: [],
    });
    const audit = state.userTaskWaits.find(({ id }) => id.elementId === "IndependentAudit");
    assert.ok(audit);
    for (let count = 1; count <= 2; count += 1) {
      const message = state.messageWaits[0];
      const timer = state.timerWaits[0];
      const stimulus: Stimulus = name === "boundary-message"
        ? { kind: StimulusKind.DeliverMessage, commandId: `trigger-${count}`,
          subscriptionId: message!.id, channel: message!.channel }
        : { kind: StimulusKind.FireTimer, commandId: `trigger-${count}`,
          timerId: timer!.id, logicalTimeMs: timer!.deadlineMs };
      state = commitWithPublication(program, state, stimulus);
      assert.equal(state.userTaskWaits.filter(({ id }) => id.elementId === "HandleReminder").length, count);
    }
    const hostCompletion = state.userTaskWaits.find(({ id }) =>
      id.elementId === (name === "subprocess-boundary-timer" ? "UserTask_Trigger" : "UserTask_Sibling"));
    assert.ok(hostCompletion);
    state = commitWithPublication(program, state, {
      kind: StimulusKind.CompleteUserTaskInstance, commandId: "complete-host",
      taskId: hostCompletion.id, submittedValues: [],
    });
    assert.equal(state.messageWaits.length, 0);
    assert.equal(state.timerWaits.length, 0);
    assert.equal(state.activityOccurrences.length, 0);
    assert.equal(state.userTaskWaits.filter(({ id }) => id.elementId === "HandleReminder").length, 2);
    if (name !== "subprocess-boundary-timer") {
      const terminate = state.userTaskWaits.find(({ id }) => id.elementId === "UserTask_Trigger");
      assert.ok(terminate);
      state = commitWithPublication(program, state, {
        kind: StimulusKind.CompleteUserTaskInstance, commandId: "terminate-inner-region",
        taskId: terminate.id, submittedValues: [],
      });
      assert.equal(state.userTaskWaits.filter(({ id }) => id.elementId === "HandleReminder").length, 0);
    }
    assert.deepEqual(state.userTaskWaits.find(({ id }) => id.elementId === "IndependentAudit"), audit);
    for (const wait of [...state.userTaskWaits].reverse()) {
      state = commitWithPublication(program, state, {
        kind: StimulusKind.CompleteUserTaskInstance, commandId: `finish-${wait.id.elementId}-${wait.id.activation}`,
        taskId: wait.id, submittedValues: [],
      });
    }
    assert.equal(state.control.kind, ControlStateKind.Completed);
    assert.deepEqual(projectOpenFlowNodeOccurrences(program, state), []);
  });
}

for (const host of ["boundary-timer", "subprocess-boundary-timer"]) {
  for (const fireFirst of [false, true]) {
    test(`publishes one-shot ${host} completion ${fireFirst ? "after firing" : "before firing"}`, async () => {
      const bytes = (await source(host)).replace(
        "<bpmn:timeCycle>R/PT1S</bpmn:timeCycle>",
        "<bpmn:timeDuration>PT1S</bpmn:timeDuration>",
      );
      const compiled = await compile(bytes);
      assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
      if (compiled.status !== BpmnCompilationStatus.Accepted) return;
      const program = compiled.semanticProcess;
      let state = commitWithPublication(program, initialState, {
        kind: StimulusKind.StartProcess, commandId: "start-one-shot", processId: program.processId,
        instanceId: "SubscriptionInstance", initialVariables: [],
      });
      const timer = state.timerWaits[0];
      assert.ok(timer);
      if (fireFirst) {
        state = commitWithPublication(program, state, {
          kind: StimulusKind.FireTimer, commandId: "fire-one-shot",
          timerId: timer.id, logicalTimeMs: timer.deadlineMs,
        });
        assert.deepEqual(state.timerWaits, []);
        assert.equal(state.activityOccurrences.length, 1);
        assert.deepEqual(state.activityOccurrences[0]!.attachedHandlers, []);
      }
      const completion = state.userTaskWaits.find(({ id }) => id.elementId ===
        (host === "subprocess-boundary-timer" ? "UserTask_Trigger" : "UserTask_Sibling"));
      assert.ok(completion);
      state = commitWithPublication(program, state, {
        kind: StimulusKind.CompleteUserTaskInstance, commandId: "complete-one-shot-host",
        taskId: completion.id, submittedValues: [],
      });
      assert.deepEqual(state.activityOccurrences, []);
      assert.deepEqual(state.timerWaits, []);
      assert.equal(state.userTaskWaits.filter(({ id }) => id.elementId === "HandleReminder").length,
        fireFirst ? 1 : 0);
      const stale = applyStimulusWithTrace(program, state, {
        kind: StimulusKind.FireTimer, commandId: "stale-one-shot",
        timerId: timer.id, logicalTimeMs: timer.deadlineMs,
      });
      assert.equal(stale.result.outcome, CommandOutcome.Rejected);
      assert.deepEqual(stale.result.state, state);
      assert.deepEqual(stale.committedTransitions, []);
      assert.deepEqual(stale.flowNodeOccurrenceLifecycles, []);
    });
  }
}

for (const handlerKind of ["receiveTask", "intermediateCatchEvent"]) {
  test(`publishes overlapping ${handlerKind} handlers with exact occurrence identity`, async () => {
    const bytes = await source("boundary-message");
    const replacement = handlerKind === "receiveTask"
      ? '<bpmn:receiveTask id="HandleReminder" messageRef="ApplicationReminder">$1</bpmn:receiveTask>'
      : '<bpmn:intermediateCatchEvent id="HandleReminder">$1<bpmn:messageEventDefinition id="HandlerMessageDefinition" messageRef="ApplicationReminder"><bpmn:operationRef>ReceiveReminder</bpmn:operationRef></bpmn:messageEventDefinition></bpmn:intermediateCatchEvent>';
    const mutated = bytes.replace(/<bpmn:userTask id="HandleReminder"[^>]*>([\s\S]*?)<\/bpmn:userTask>/u, replacement);
    assert.notEqual(mutated, bytes);
    const compiled = await compile(mutated);
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) return;
    const program = compiled.semanticProcess;
    let state = commitWithPublication(program, initialState, {
      kind: StimulusKind.StartProcess, commandId: "start-message-handlers", processId: program.processId,
      instanceId: "SubscriptionInstance", initialVariables: [],
    });
    const subscription = state.messageWaits.find(({ id }) => id.elementId === "Reminder");
    assert.ok(subscription);
    for (let count = 1; count <= 2; count += 1) {
      state = commitWithPublication(program, state, {
        kind: StimulusKind.DeliverMessage, commandId: `spawn-message-handler-${count}`,
        subscriptionId: subscription.id, channel: subscription.channel,
      });
      assert.equal(state.messageWaits.filter(({ id }) => id.elementId === "HandleReminder").length, count);
    }
    const handlers = state.messageWaits.filter(({ id }) => id.elementId === "HandleReminder");
    for (const handler of [...handlers].reverse()) {
      state = commitWithPublication(program, state, {
        kind: StimulusKind.DeliverMessage, commandId: `finish-message-handler-${handler.id.activation}`,
        subscriptionId: handler.id, channel: handler.channel,
      });
    }
    assert.deepEqual(state.messageWaits, [subscription]);
    assert.equal(state.userTaskWaits.some(({ id }) => id.elementId === "UserTask_Sibling"), true);
  });
}

test("refuses a nine-operation Start burst despite every branch fitting the limit", async () => {
  const result = await compile(await source("burst-9"));
  assert.equal(result.status, BpmnCompilationStatus.Rejected);
});

function childCompletionTail(branches: number, waits: boolean): string {
  const flow = (id: string, from: string, to: string) =>
    `<bpmn:sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}"/>`;
  return `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs" targetNamespace="urn:subscription-burst-test">
    <bpmn:process id="Review" isExecutable="true">
      <bpmn:startEvent id="Start"/><bpmn:subProcess id="Child">
        <bpmn:startEvent id="ChildStart"/><bpmn:endEvent id="ChildEnd"/>
        ${waits ? `<bpmn:userTask id="ReviewTask"/>${flow("ChildFirst", "ChildStart", "ReviewTask")}${flow("ChildLast", "ReviewTask", "ChildEnd")}`
          : flow("ChildFirst", "ChildStart", "ChildEnd")}
      </bpmn:subProcess><bpmn:parallelGateway id="Distribute" gatewayDirection="Diverging"/>
      ${flow("Enter", "Start", "Child")}${flow("Continue", "Child", "Distribute")}
      ${Array.from({ length: branches }, (_, index) =>
        `<bpmn:endEvent id="End${index}"/>${flow(`Finish${index}`, "Distribute", `End${index}`)}`).join("")}
    </bpmn:process></bpmn:definitions>`;
}

for (const waits of [false, true]) {
  test(`counts child completion and the entire parent tail after ${waits ? "external resumption" : "Start"}`, async () => {
    const eight = await compile(childCompletionTail(waits ? 4 : 2, waits));
    assert.equal(eight.status, BpmnCompilationStatus.Accepted);
    const nine = await compile(childCompletionTail(waits ? 5 : 3, waits));
    assert.equal(nine.status, BpmnCompilationStatus.Rejected);
    if (eight.status !== BpmnCompilationStatus.Accepted) return;
    assert.equal(isWellFormedSemanticProcessProgram(eight.semanticProcess), true);
    let state = commitWithPublication(eight.semanticProcess, initialState, {
      kind: StimulusKind.StartProcess, commandId: "start-child-tail", processId: "Review",
      instanceId: "SubscriptionInstance", initialVariables: [],
    });
    if (waits) {
      assert.equal(state.userTaskWaits.length, 1);
      state = commitWithPublication(eight.semanticProcess, state, {
        kind: StimulusKind.CompleteUserTaskInstance, commandId: "finish-child",
        taskId: state.userTaskWaits[0]!.id, submittedValues: [],
      });
    }
    assert.equal(state.scopeOccurrences.length, 0);
  });
}

test("refuses a repeating Message handler that creates the sole Timer", async () => {
  const bytes = (await source("boundary-message")).replace(
    '<bpmn:definitions ', '<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ',
  );
  const replaceWithTimer = (elementId: string) => bytes.replace(
    new RegExp(`<bpmn:userTask id="${elementId}"[^>]*>([\\s\\S]*?)<\\/bpmn:userTask>`, "u"),
    `<bpmn:intermediateCatchEvent id="${elementId}">$1<bpmn:timerEventDefinition><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1S</bpmn:timeDuration></bpmn:timerEventDefinition></bpmn:intermediateCatchEvent>`,
  );
  const outside = replaceWithTimer("IndependentAudit");
  assert.notEqual(outside, bytes);
  const outsideCompiled = await compile(outside);
  assert.equal(outsideCompiled.status, BpmnCompilationStatus.Accepted);
  if (outsideCompiled.status !== BpmnCompilationStatus.Accepted) return;
  const started = commitWithPublication(outsideCompiled.semanticProcess, initialState, {
    kind: StimulusKind.StartProcess, commandId: "start-message-host-and-timer",
    processId: outsideCompiled.semanticProcess.processId, instanceId: "SubscriptionInstance", initialVariables: [],
  });
  assert.equal(started.timerWaits.length, 1);
  assert.equal(started.messageWaits.length, 1);
  const mutated = replaceWithTimer("HandleReminder");
  assert.notEqual(mutated, bytes);
  assert.equal((await compile(mutated)).status, BpmnCompilationStatus.Rejected);
});

test("composes an operation-addressed catch with a direct Message Receive Task", async () => {
  const bytes = await source("catch-message");
  const mixed = bytes.replace(
    /<bpmn:userTask id="IndependentAudit"[^>]*>([\s\S]*?)<\/bpmn:userTask>/u,
    '<bpmn:receiveTask id="IndependentAudit" name="Receive audit response" messageRef="ApplicationReminder">$1</bpmn:receiveTask>',
  );
  assert.notEqual(mixed, bytes);
  const result = await compile(mixed);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) return;
  assert.deepEqual(
    result.checkedProcess.nodes.find(({ id }) => id === "IndependentAudit"),
    { kind: "receiveTask", id: "IndependentAudit",
      channel: { kind: "directMessage", messageId: "ApplicationReminder" } },
  );
  const catchNode = result.checkedProcess.nodes.find(({ id }) => id === "UserTask_Sibling");
  assert.ok(catchNode !== undefined && "channel" in catchNode);
  assert.equal(catchNode.channel.kind, "operationMessage");
});

test("retains the exact recurring expression and replacement declaration", async () => {
  const result = await compile(await source("subprocess-boundary-timer"));
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) return;
  assert.deepEqual(
    result.checkedProcess.nodes.find(({ id }) => id === "Reminder"),
    {
      kind: "timerBoundaryEvent", id: "Reminder", attachedToRef: "SubProcess_Work",
      interruption: "nonInterrupting", cycleLiteral: "R/PT1S",
      outputFlowId: "Flow_ReminderToHandler",
    },
  );
  const operation = result.semanticProcess.operations.find(
    ({ id }) => id === "operation:SubProcess_Work",
  );
  assert.equal(operation?.kind, "enterMonitoredScope");
  assert.ok(operation !== undefined && "boundaryTimer" in operation);
  assert.deepEqual(operation.boundaryTimer, {
    elementId: "Reminder", durationMs: 1_000, recurrence: "repeating",
    output: "place:Flow_ReminderToHandler",
    origin: { kind: "bpmnSequenceFlow", elementId: "Flow_ReminderToHandler" },
  });
});

test("refuses recurrence in the one-shot predecessor profile", async () => {
  const result = await compile(
    await source("boundary-timer"),
    "bpmn-2.0.2-non-interrupting-boundary-timer-draft",
  );
  assert.equal(result.status, BpmnCompilationStatus.Rejected);
});

for (const expression of [
  "<bpmn:timeCycle>R2/PT1S</bpmn:timeCycle>",
  "<bpmn:timeCycle>R/PT2S</bpmn:timeCycle>",
  "<bpmn:timeCycle>R/PT1S</bpmn:timeCycle><bpmn:timeDuration>PT1S</bpmn:timeDuration>",
]) {
  test(`refuses unselected Timer expression ${expression}`, async () => {
    const bytes = await source("boundary-timer");
    const mutated = bytes.replace("<bpmn:timeCycle>R/PT1S</bpmn:timeCycle>", expression);
    assert.notEqual(mutated, bytes);
    assert.equal((await compile(mutated)).status, BpmnCompilationStatus.Rejected);
  });
}

test("refuses recurrence on an interrupting boundary", async () => {
  const bytes = await source("boundary-timer");
  const mutated = bytes.replace('cancelActivity="false"', 'cancelActivity="true"');
  assert.notEqual(mutated, bytes);
  assert.equal((await compile(mutated)).status, BpmnCompilationStatus.Rejected);
});

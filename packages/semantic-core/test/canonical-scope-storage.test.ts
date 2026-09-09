import assert from "node:assert/strict";
import test from "node:test";
import {
  CommandOutcome,
  ControlStateKind,
  RuntimeStateDefect,
  SemanticOperationKind,
  applyInternalOperationStep,
  applyStimulus,
  initialState,
  projectCurrentControlPositions,
  runtimeStateDefects,
  runtimeStateRegressions,
  type RuntimeState,
  type ScopeOccurrenceId,
} from "@bpmn-lean/semantic-core";
import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";
import { eventRaceProgram, eventRaceStart, timerFiring } from "./event-based-gateway-fixture.ts";
import {
  terminateChildScopeId,
  terminateCompletion,
  terminateInstanceId,
  terminateProgram,
  terminateStartStimulus,
} from "./terminate-end-event-fixture.ts";

test("reversing only admitted scope storage fails order and preserves the rejected input", () => {
  const started = applyStimulus(terminateProgram, initialState, terminateStartStimulus());
  assert.equal(started.outcome, CommandOutcome.Committed);
  const canonical = started.state;
  assert.equal(canonical.scopeOccurrences.length, 2);
  assert.deepEqual(runtimeStateDefects(terminateProgram, terminateInstanceId, canonical), []);
  const reversed = { ...canonical, scopeOccurrences: [...canonical.scopeOccurrences].reverse() };
  assert.notEqual(projectCurrentControlPositions(terminateProgram, canonical), null);
  assert.deepEqual(projectCurrentControlPositions(terminateProgram, reversed),
    projectCurrentControlPositions(terminateProgram, canonical));
  assert.deepEqual(runtimeStateDefects(terminateProgram, terminateInstanceId, reversed), [
    RuntimeStateDefect.UnorderedCollection,
  ]);
  const stimulus = terminateCompletion("UserTask_Trigger");
  assert.equal(applyStimulus(terminateProgram, canonical, stimulus).outcome, CommandOutcome.Committed);
  const rejected = applyStimulus(terminateProgram, reversed, stimulus);
  assert.equal(rejected.outcome, CommandOutcome.Rejected);
  assert.deepEqual(rejected.state, reversed);
});

const scopeId = { processInstanceId: "Instance", definitionScopeId: "Scope", activation: 2 };
const orderedPairs: ReadonlyArray<readonly [string, ScopeOccurrenceId, ScopeOccurrenceId]> = [
  ["instance precedes scope", { ...scopeId, processInstanceId: "A", definitionScopeId: "Z" },
    { ...scopeId, processInstanceId: "Z", definitionScopeId: "A" }],
  ["scope precedes activation", { ...scopeId, definitionScopeId: "A", activation: 10 },
    { ...scopeId, definitionScopeId: "Z", activation: 2 }],
  ["activation is numeric", scopeId, { ...scopeId, activation: 10 }],
  ["instance uses Unicode scalars", { ...scopeId, processInstanceId: "\uE000" },
    { ...scopeId, processInstanceId: "\u{10000}" }],
  ["scope uses Unicode scalars", { ...scopeId, definitionScopeId: "\uE000" },
    { ...scopeId, definitionScopeId: "\u{10000}" }],
];

// RSI's TypeScript aggregate excludes Program/scope association; these raw key controls claim only its order conjunct.
for (const [name, first, second] of orderedPairs) {
  test(`scope storage uses the complete key: ${name}`, () => {
    const canonical: RuntimeState = {
      ...initialState,
      control: { kind: ControlStateKind.Running, instanceId: first.processInstanceId },
      scopeOccurrences: [{ id: first, parent: null }, { id: second, parent: null }],
    };
    assert.deepEqual(runtimeStateDefects(eventRaceProgram, first.processInstanceId, canonical), []);
    const reversed = { ...canonical, scopeOccurrences: [...canonical.scopeOccurrences].reverse() };
    assert.deepEqual(runtimeStateDefects(eventRaceProgram, first.processInstanceId, reversed), [
      RuntimeStateDefect.UnorderedCollection,
    ]);
    assert.deepEqual(reversed.scopeOccurrences, [{ id: second, parent: null }, { id: first, parent: null }]);
  });
}

for (const family of ["scopeActivations", "callActivations", "eventRaceActivations"] as const) {
  test(`${family} rejects only inverted Unicode scalar keys and preserves the received state`, () => {
    const started = applyStimulus(eventRaceProgram, initialState, eventRaceStart);
    assert.equal(started.outcome, CommandOutcome.Committed);
    const canonical: RuntimeState = {
      ...started.state,
      [family]: [
        ...started.state[family],
        { elementId: "\uE000", count: 2 },
        { elementId: "\u{10000}", count: 10 },
      ],
    };
    assert.deepEqual(runtimeStateDefects(eventRaceProgram, eventRaceStart.instanceId, canonical), []);
    const reversed = { ...canonical, [family]: [...canonical[family]].reverse() };
    assert.deepEqual(projectCurrentControlPositions(eventRaceProgram, reversed),
      projectCurrentControlPositions(eventRaceProgram, canonical));
    assert.notEqual(projectCurrentControlPositions(eventRaceProgram, reversed), null);
    assert.deepEqual(runtimeStateRegressions(canonical, reversed), []);
    assert.deepEqual(runtimeStateDefects(eventRaceProgram, eventRaceStart.instanceId, reversed), [
      RuntimeStateDefect.UnorderedCollection,
    ]);
    assert.equal(applyStimulus(eventRaceProgram, canonical, timerFiring()).outcome, CommandOutcome.Committed);
    const rejected = applyStimulus(eventRaceProgram, reversed, timerFiring());
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, reversed);
  });
}

test("ordinary child entry advances only its Scope key and removal retains every high-water row", () => {
  const prefix = admittedInternalPrefix(terminateProgram, initialState, terminateStartStimulus(),
    ["operation:StartEvent_Outer"], ["operation:SubProcess_Work"]);
  const before: RuntimeState = {
    ...prefix,
    scopeActivations: [...prefix.scopeActivations,
      { elementId: terminateChildScopeId, count: 9 }, { elementId: "\uE000", count: 7 }],
    callActivations: [{ elementId: "PastCall", count: 5 }],
    eventRaceActivations: [{ elementId: "PastRace", count: 6 }],
  };
  assert.deepEqual(runtimeStateDefects(terminateProgram, terminateInstanceId, before), []);
  const operation = terminateProgram.operations.find(({ kind }) => kind === SemanticOperationKind.EnterScope)!;
  const step = applyInternalOperationStep(terminateProgram, operation, before);
  assert.ok(step !== null);
  const entered = step.successor;
  const parent = before.scopeOccurrences[0]!;
  assert.deepEqual(entered.scopeOccurrences, [parent, {
    id: { ...parent.id, definitionScopeId: terminateChildScopeId, activation: 10 }, parent: parent.id,
  }]);
  assert.deepEqual(entered.scopeActivations, [before.scopeActivations[0],
    { elementId: terminateChildScopeId, count: 10 }, { elementId: "\uE000", count: 7 }]);
  for (const family of ["callActivations", "eventRaceActivations", "taskActivations",
    "messageActivations", "timerActivations", "effectActivations", "activityActivations"] as const) {
    assert.deepEqual(entered[family], before[family]);
  }
  assert.deepEqual(runtimeStateDefects(terminateProgram, terminateInstanceId, entered), []);
  assert.notEqual(projectCurrentControlPositions(terminateProgram, entered), null);
  let armed = entered;
  for (const id of ["operation:Gateway_ChildFork", "operation:UserTask_Sibling", "operation:UserTask_Trigger"]) {
    const operation = terminateProgram.operations.find((candidate) => candidate.id === id)!;
    const step = applyInternalOperationStep(terminateProgram, operation, armed);
    assert.ok(step !== null);
    armed = step.successor;
  }
  const removed = applyStimulus(terminateProgram, armed, terminateCompletion("UserTask_Trigger"));
  assert.equal(removed.outcome, CommandOutcome.Committed);
  assert.deepEqual(removed.state.scopeOccurrences, [parent]);
  assert.deepEqual(removed.state.scopeActivations, entered.scopeActivations);
  assert.deepEqual(removed.state.callActivations, before.callActivations);
  assert.deepEqual(removed.state.eventRaceActivations, before.eventRaceActivations);
  assert.deepEqual(runtimeStateRegressions(before, removed.state), []);
});

test("race arming advances its exact key beside retained histories and winning removes no counters", () => {
  const prefix = admittedInternalPrefix(eventRaceProgram, initialState, eventRaceStart,
    ["operation:Start"], ["operation:Race"]);
  const before: RuntimeState = {
    ...prefix,
    eventRaceActivations: [
      { elementId: "A", count: 7 }, { elementId: "Race", count: 9 }, { elementId: "\uE000", count: 4 },
    ],
    callActivations: [{ elementId: "PastCall", count: 5 }],
  };
  assert.deepEqual(runtimeStateDefects(eventRaceProgram, eventRaceStart.instanceId, before), []);
  const operation = eventRaceProgram.operations.find(({ kind }) => kind === SemanticOperationKind.AwaitEventRace)!;
  const step = applyInternalOperationStep(eventRaceProgram, operation, before);
  assert.ok(step !== null);
  const armed = step.successor;
  assert.deepEqual(armed.eventRaceActivations, [
    { elementId: "A", count: 7 }, { elementId: "Race", count: 10 }, { elementId: "\uE000", count: 4 },
  ]);
  assert.deepEqual(armed.eventRaces.map(({ id }) => id), [{
    processInstanceId: eventRaceStart.instanceId, elementId: "Race", activation: 10,
  }]);
  for (const family of ["scopeActivations", "callActivations", "taskActivations",
    "effectActivations", "activityActivations"] as const) {
    assert.deepEqual(armed[family], before[family]);
  }
  assert.deepEqual(armed.messageActivations, [{ elementId: "MessageCatch", count: 1 }]);
  assert.deepEqual(armed.timerActivations, [{ elementId: "TimerCatch", count: 1 }]);
  assert.deepEqual(runtimeStateDefects(eventRaceProgram, eventRaceStart.instanceId, armed), []);
  const winner = applyStimulus(eventRaceProgram, armed, timerFiring());
  assert.equal(winner.outcome, CommandOutcome.Committed);
  assert.deepEqual(winner.state.eventRaces, []);
  assert.deepEqual(winner.state.eventRaceActivations, armed.eventRaceActivations);
  assert.deepEqual(winner.state.scopeActivations, before.scopeActivations);
  assert.deepEqual(winner.state.callActivations, before.callActivations);
  assert.deepEqual(runtimeStateRegressions(before, winner.state), []);
});

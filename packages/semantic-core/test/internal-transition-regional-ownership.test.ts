import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticOperationKind as Kind, applyInternalOperationStep, compareCanonicalStrings,
  isWellFormedSemanticProcessProgram, projectOpenFlowNodeOccurrences, runtimeStateDefects,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { regionalPairFixture } from "./internal-regional-pair-fixture.ts";
import { eventRaceProgram } from "./event-based-gateway-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

const { ActivityBodyKind, ActivityHandlerKind, compareActivityOccurrences } = await import(
  new URL("../dist/activity-occurrence.js", import.meta.url).href
) as typeof import("../src/activity-occurrence.ts");
const { deriveInternalRegionalPreparation: prepare, applyPreparedInternalRegionalTransition: apply } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");
const { eventRaceAssociationsAreValid } = await import(
  new URL("../dist/semantic-process-event-race-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-event-race-runtime.ts");
const { regionalOwnershipIsClosed } = await import(
  new URL("../dist/internal-transition-regional-ownership.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-ownership.ts");
const { compareTokenPlaces } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");

for (const kind of [Kind.ReturnProcess, Kind.CompleteScope] as const) {
  test(`${kind} refuses a retained Activity whose otherwise live body would disappear`, () => {
    const { program, state, start, branches } = regionalPairFixture(kind, kind);
    const branch = branches[0]!;
    const child = state.scopeOccurrences.find(({ id }) => id.definitionScopeId === branch.scopeId)!;
    const owner = kind === Kind.ReturnProcess
      ? state.calledProcessOccurrences.find(({ calledRoot }) => calledRoot.definitionScopeId === branch.scopeId)!.caller
      : child.parent!;
    const activityElementId = "ForeignBodyClaim";
    const withClaim: RuntimeState = { ...state,
      activityOccurrences: [{ id: { processInstanceId: owner.processInstanceId, activityElementId, activation: 1 },
        owner, operationId: branch.entry.id,
        body: { kind: ActivityBodyKind.ChildScope, scope: child.id }, attachedHandlers: [] }],
      activityActivations: [...state.activityActivations, { elementId: activityElementId, count: 1 }]
        .sort((a, b) => compareCanonicalStrings(a.elementId, b.elementId)),
    };
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.deepEqual(runtimeStateDefects(program, start.instanceId, withClaim), []);
    assert.notEqual(projectOpenFlowNodeOccurrences(program, withClaim), null);
    const raw = applyInternalOperationStep(program, branch.selected, withClaim);
    assert.ok(raw !== null);
    assert.ok(runtimeStateDefects(program, start.instanceId, raw.successor)
      .some((defect) => defect === "activityOccurrenceBodyAbsent"));
    const before = structuredClone(withClaim);
    assert.equal(prepare(program, withClaim, branch.selected), null);
    assert.deepEqual(withClaim, before);
    const original = prepare(program, state, branch.selected);
    assert.ok(original !== null);
    assert.equal(apply(program, withClaim, original), null);
  });
}

test("Return removes its owned Activity and preserves an outside Activity with an independent body", () => {
  const { program, state, start, branches } = regionalPairFixture(Kind.ReturnProcess, Kind.ReturnProcess);
  const selected = branches[0]!.selected;
  const left = state.calledProcessOccurrences.find(({ calledRoot }) =>
    calledRoot.definitionScopeId === branches[0]!.scopeId)!;
  const right = state.calledProcessOccurrences.find(({ calledRoot }) =>
    calledRoot.definitionScopeId === branches[1]!.scopeId)!;
  const removed: RuntimeState["activityOccurrences"][number] = {
    id: { processInstanceId: left.calledRoot.processInstanceId, activityElementId: "RemovedActivity", activation: 1 },
    owner: left.calledRoot, operationId: branches[0]!.entry.id,
    body: { kind: ActivityBodyKind.ChildScope, scope: left.calledRoot }, attachedHandlers: [],
  };
  const retained: RuntimeState["activityOccurrences"][number] = {
    id: { processInstanceId: right.caller.processInstanceId, activityElementId: "RetainedActivity", activation: 1 },
    owner: right.caller, operationId: branches[1]!.entry.id,
    body: { kind: ActivityBodyKind.ChildScope, scope: right.calledRoot }, attachedHandlers: [],
  };
  const before: RuntimeState = { ...state,
    activityOccurrences: [removed, retained].sort(compareActivityOccurrences),
    activityActivations: [...state.activityActivations,
      ...[removed, retained].map(({ id }) => ({ elementId: id.activityElementId, count: id.activation }))]
      .sort((a, b) => compareCanonicalStrings(a.elementId, b.elementId)),
  };
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.deepEqual(runtimeStateDefects(program, start.instanceId, before), []);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, before), null);
  const prepared = prepare(program, before, selected);
  assert.ok(prepared !== null);
  const raw = applyInternalOperationStep(program, selected, before);
  assert.ok(raw !== null);
  const after = apply(program, before, prepared);
  assert.deepEqual(after, raw.successor);
  assert.ok(after !== null);
  assert.deepEqual(after.activityOccurrences, [retained]);
  assert.deepEqual(after.activityActivations, before.activityActivations);
  assert.deepEqual(runtimeStateDefects(program, start.instanceId, after), []);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, after), null);
});

function regionalRace(kind: Kind.ThrowError | Kind.TerminateScope, contained = false) {
  const fixture = regionalPairFixture(kind, kind);
  const side = contained ? fixture.program.operations.find(({ id }) =>
    id === `operation:${fixture.branches[0]!.name}_Sibling_Task`)! : fixture.side;
  assert.ok(side.kind === Kind.AwaitUserTask);
  let armingState = fixture.state;
  if (contained) {
    const wait = armingState.userTaskWaits.find(({ id }) => id.elementId === side.task.elementId);
    assert.ok(wait !== undefined);
    armingState = { ...armingState,
      userTaskWaits: armingState.userTaskWaits.filter((candidate) => candidate !== wait),
      controlTokens: [...armingState.controlTokens,
        { placeId: side.input, owner: wait.owner, multiplicity: 1 }].sort(compareTokenPlaces),
    };
  }
  const template = eventRaceProgram.operations.find((operation) => operation.kind === Kind.AwaitEventRace)!;
  assert.ok(template.kind === Kind.AwaitEventRace);
  const places = [controlPlace("Side_Message"), controlPlace("Side_Timer")];
  const race = { ...template, id: side.id, origin: side.origin, input: side.input,
    message: { ...template.message, output: places[0]!.id },
    timer: { ...template.timer, output: places[1]!.id } };
  const merge: Extract<SemanticOperation, { kind: Kind.MergeExclusive }> = {
    ...operationBase("Side_Merge"), kind: Kind.MergeExclusive,
    inputs: [race.message.output, race.timer.output], output: side.output };
  const scopeId = fixture.program.operationScopes.find(({ operationId }) => operationId === side.id)!.scopeId;
  const program: SemanticProcessProgram = { ...fixture.program,
    operations: [...fixture.program.operations.map((operation) => operation.id === side.id ? race : operation), merge]
      .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    controlPlaces: [...fixture.program.controlPlaces, ...places].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operationScopes: [...fixture.program.operationScopes, { operationId: merge.id, scopeId }]
      .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
    controlPlaceScopes: [...fixture.program.controlPlaceScopes, ...places.map(({ id }) => ({ controlPlaceId: id, scopeId }))]
      .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
  };
  const step = applyInternalOperationStep(program, race, armingState);
  assert.ok(step !== null);
  return { ...fixture, program, state: step.successor };
}

function withNestedCancellationBody(fixture: ReturnType<typeof regionalRace>) {
  const branch = fixture.branches[0]!;
  const previous = fixture.program.operations.find(({ id }) => id === `operation:${branch.name}_Sibling_Task`);
  assert.ok(previous?.kind === Kind.AwaitUserTask);
  const wait = fixture.state.userTaskWaits.find(({ id }) => id.elementId === previous.task.elementId);
  assert.ok(wait !== undefined);
  const scopeId = "scope:NestedCancellationBody";
  const entryPlace = controlPlace("Nested_Entry");
  const endPlace = controlPlace("Nested_End");
  const entry: SemanticOperation = { ...operationBase(previous.origin.elementId), id: previous.id,
    kind: Kind.EnterScope, input: previous.input, childEntry: entryPlace.id, childScopeId: scopeId };
  const task: SemanticOperation = { ...operationBase("Nested_Task"), kind: Kind.AwaitUserTask,
    input: entryPlace.id, output: endPlace.id, task: { elementId: "Nested_Task", name: null } };
  const end: SemanticOperation = { ...operationBase("Nested_End"), kind: Kind.ReachNoneEnd, input: endPlace.id };
  const complete: SemanticOperation = { ...operationBase("Nested_Complete"), origin: previous.origin,
    kind: Kind.CompleteScope, scopeId, parentOutput: previous.output };
  const added = [task, end, complete];
  const program: SemanticProcessProgram = { ...fixture.program,
    definitionScopes: [...fixture.program.definitionScopes,
      { id: scopeId, parentScopeId: branch.scopeId, originElementId: previous.origin.elementId }]
      .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operations: [...fixture.program.operations.map((operation) => operation === previous ? entry : operation), ...added]
      .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operationScopes: [...fixture.program.operationScopes,
      ...added.map(({ id }) => ({ operationId: id, scopeId }))]
      .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
    controlPlaces: [...fixture.program.controlPlaces, entryPlace, endPlace]
      .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    controlPlaceScopes: [...fixture.program.controlPlaceScopes,
      ...[entryPlace, endPlace].map(({ id }) => ({ controlPlaceId: id, scopeId }))]
      .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
  };
  const entered = applyInternalOperationStep(program, entry, { ...fixture.state,
    userTaskWaits: fixture.state.userTaskWaits.filter((candidate) => candidate !== wait),
    controlTokens: [...fixture.state.controlTokens,
      { placeId: entry.input, owner: wait.owner, multiplicity: 1 }].sort(compareTokenPlaces),
  });
  assert.ok(entered !== null);
  const armed = applyInternalOperationStep(program, task, entered.successor);
  assert.ok(armed !== null);
  const body = armed.successor.scopeOccurrences.find(({ id }) => id.definitionScopeId === scopeId);
  assert.ok(body !== undefined);
  return { ...fixture, program, state: armed.successor, body: body.id };
}

for (const handlerKind of [ActivityHandlerKind.Message, ActivityHandlerKind.Timer]) {
  test(`closure alone protects a retained ${handlerKind} handler using complete occurrence identity`, () => {
    const { program, state, branches } = regionalRace(Kind.TerminateScope);
    const selected = prepare(program, state, branches[0]!.selected);
    assert.ok(selected !== null);
    const child = state.scopeOccurrences.find(({ id }) => id.definitionScopeId === branches[0]!.scopeId)!;
    const other = state.scopeOccurrences.find(({ id }) => id.definitionScopeId === branches[1]!.scopeId)!;
    const owner = child.parent!;
    const race = state.eventRaces[0]!;
    const record: RuntimeState["activityOccurrences"][number] = {
      id: { processInstanceId: owner.processInstanceId, activityElementId: "RetainedHandler", activation: 1 },
      owner, operationId: branches[1]!.entry.id,
      body: { kind: ActivityBodyKind.ChildScope, scope: other.id },
      attachedHandlers: [{ kind: handlerKind, occurrence: handlerKind === ActivityHandlerKind.Message
        ? race.messageSubscriptionId : race.timerOccurrenceId }],
    };
    // REG-OWN-CLOSE-01 is separate from predecessor validity: these predicate-only states
    // deliberately vary target ownership/identity without claiming whole-state admission or liveness.
    const retained: RuntimeState = { ...state, activityOccurrences: [record], eventRaces: [] };
    const removed: RuntimeState = { ...retained,
      messageWaits: retained.messageWaits.map((wait) => handlerKind === ActivityHandlerKind.Message
        ? { ...wait, owner: child.id } : wait),
      timerWaits: retained.timerWaits.map((wait) => handlerKind === ActivityHandlerKind.Timer
        ? { ...wait, owner: child.id } : wait),
    };
    assert.equal(regionalOwnershipIsClosed(retained, selected.selection), true);
    assert.equal(regionalOwnershipIsClosed(removed, selected.selection), false);
    for (const coordinate of ["processInstanceId", "activation"] as const) {
      const distinct = (id: RuntimeState["timerWaits"][number]["id"]) => coordinate === "processInstanceId"
        ? { ...id, processInstanceId: `${id.processInstanceId}:other` } : { ...id, activation: id.activation + 1 };
      const aliased: RuntimeState = { ...retained,
        messageWaits: handlerKind === ActivityHandlerKind.Message
          ? [...retained.messageWaits, ...removed.messageWaits.map((wait) => ({ ...wait, id: distinct(wait.id) }))]
          : retained.messageWaits,
        timerWaits: handlerKind === ActivityHandlerKind.Timer
          ? [...retained.timerWaits, ...removed.timerWaits.map((wait) => ({ ...wait, id: distinct(wait.id) }))]
          : retained.timerWaits,
      };
      assert.equal(regionalOwnershipIsClosed(aliased, selected.selection), true, coordinate);
    }
  });
}

for (const kind of [Kind.ThrowError, Kind.TerminateScope] as const) {
  test(`${kind} permits removing a complete event race with both of its waits`, () => {
    const { program, state, start, branches } = regionalRace(kind, true);
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.deepEqual(runtimeStateDefects(program, start.instanceId, state), []);
    assert.equal(eventRaceAssociationsAreValid(state), true);
    assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
    assert.equal(state.eventRaces.length, 1);
    const selected = branches[0]!.selected;
    const prepared = prepare(program, state, selected);
    assert.ok(prepared !== null);
    const raw = applyInternalOperationStep(program, selected, state);
    assert.ok(raw !== null);
    const after = apply(program, state, prepared);
    assert.ok(after !== null);
    assert.deepEqual(after, raw.successor);
    assert.deepEqual(after.eventRaces, []);
    assert.deepEqual(after.messageWaits, []);
    assert.deepEqual(after.timerWaits, []);
    assert.deepEqual(runtimeStateDefects(program, start.instanceId, after), []);
    assert.equal(eventRaceAssociationsAreValid(after), true);
    assert.notEqual(projectOpenFlowNodeOccurrences(program, after), null);
  });

  for (const handlerKind of [ActivityHandlerKind.Message, ActivityHandlerKind.Timer]) {
    test(`${kind} refuses withdrawal of a retained race's ${handlerKind} member`, () => {
      const fixture = regionalRace(kind);
      const { program, state, start, branches } = kind === Kind.TerminateScope
        ? withNestedCancellationBody(fixture) : fixture;
      const branch = branches[0]!;
      const child = state.scopeOccurrences.find(({ id }) => id.definitionScopeId === branch.scopeId)!;
      const owner = child.parent!;
      const body = kind === Kind.TerminateScope
        ? state.scopeOccurrences.find(({ id }) => id.definitionScopeId === "scope:NestedCancellationBody")!.id
        : child.id;
      const race = state.eventRaces[0]!;
      const activityElementId = "ForeignHandlerClaim";
      const withClaim: RuntimeState = { ...state,
        activityOccurrences: [{ id: { processInstanceId: owner.processInstanceId, activityElementId, activation: 1 },
          owner, operationId: branch.entry.id, body: { kind: ActivityBodyKind.ChildScope, scope: body },
          attachedHandlers: [{ kind: handlerKind, occurrence: handlerKind === ActivityHandlerKind.Message
            ? race.messageSubscriptionId : race.timerOccurrenceId }] }],
        activityActivations: [...state.activityActivations, { elementId: activityElementId, count: 1 }]
          .sort((a, b) => compareCanonicalStrings(a.elementId, b.elementId)),
      };
      assert.equal(isWellFormedSemanticProcessProgram(program), true);
      assert.deepEqual(runtimeStateDefects(program, start.instanceId, withClaim), []);
      assert.equal(eventRaceAssociationsAreValid(withClaim), true);
      assert.notEqual(projectOpenFlowNodeOccurrences(program, withClaim), null);
      const raw = applyInternalOperationStep(program, branch.selected, withClaim);
      assert.ok(raw !== null);
      assert.deepEqual(raw.successor.eventRaces, withClaim.eventRaces);
      assert.equal(eventRaceAssociationsAreValid(raw.successor), false);
      assert.equal(projectOpenFlowNodeOccurrences(program, raw.successor), null);
      assert.equal(prepare(program, withClaim, branch.selected), null);
      const original = prepare(program, state, branch.selected);
      assert.ok(original !== null);
      assert.equal(apply(program, withClaim, original), null);
      assert.notEqual(prepare(program, withClaim, branches[1]!.selected), null);
    });
  }
}

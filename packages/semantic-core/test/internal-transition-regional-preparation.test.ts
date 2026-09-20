import assert from "node:assert/strict";
import test from "node:test";
import {
  ActivityBodyKind, ActivityHandlerKind, applyInternalOperationStep, applyStimulus, compareCanonicalStrings,
  compareActivityOccurrences, compareLocalDataOwners, initialState, LocalDataOwnerKind,
  isWellFormedSemanticProcessProgram, projectCurrentControlPositions, projectOpenFlowNodeOccurrences, runtimeStateDefects,
  projectControlPositionDelta, projectFlowNodeOccurrenceLifecycleDelta,
  SemanticOperationKind, SemanticTransitionKind, StimulusKind,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type {
  InternalRegionalOperation, PreparedInternalRegionalTransition,
} from "../src/internal-transition-regional-preparation.ts";
import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";
import { regionalPairFixture } from "./internal-regional-pair-fixture.ts";
import {
  callActivityCompletion, callActivityProgram, callActivityStart, expectedCalledInstanceId,
} from "./call-activity-fixture.ts";
import { boundedScopeProgram, completeChildTask, start } from "./bounded-scope-fixture.ts";
import { propagatedErrorProgram, startFor } from "./flow-node-occurrence-lifecycle-fixture.ts";
import {
  terminateCompletion, terminateInstanceId, terminateProgram, terminateStartStimulus,
} from "./terminate-end-event-fixture.ts";

type PreparationModule = typeof import("../src/internal-transition-regional-preparation.ts");
const { deriveInternalRegionalPreparation: prepare, applyPreparedInternalRegionalTransition: applyPrepared } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as PreparationModule;
const { deriveRegionalReferenceRetention, regionalOwnershipIsClosed } = await import(
  new URL("../dist/internal-transition-regional-ownership.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-ownership.ts");
const { selectScopeCompletionWithdrawal } = await import(
  new URL("../dist/semantic-process-bounded-scope-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-bounded-scope-runtime.ts");
type PublicationModule = typeof import("../src/internal-publication-template.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as PublicationModule;

const called = applyStimulus(callActivityProgram, initialState, callActivityStart(), 3);
const returnReady = admittedInternalPrefix(callActivityProgram, called.state,
  callActivityCompletion(expectedCalledInstanceId, "Task_Called", "regional-return"),
  ["operation:End_Called"], ["operation:return-process:Call:é"]);
const bounded = applyStimulus(boundedScopeProgram, initialState, start);
const childReady = admittedInternalPrefix(boundedScopeProgram, bounded.state, completeChildTask,
  ["operation:ChildEnd"], ["operation:complete-scope:scope:Scope"]);
const childDone = applyStimulus(boundedScopeProgram, bounded.state, completeChildTask);
const parentTask = childDone.state.userTaskWaits.find(({ id }) => id.elementId === "AfterScope")!;
const rootReady = admittedInternalPrefix(boundedScopeProgram, childDone.state, {
  kind: StimulusKind.CompleteUserTaskInstance, commandId: "regional-root",
  taskId: parentTask.id, submittedValues: [],
}, ["operation:NormalEnd"], ["operation:complete-scope:scope:Process_SubProcessBoundaryTimer"]);
const terminated = applyStimulus(terminateProgram, initialState, terminateStartStimulus());
const terminateReady = admittedInternalPrefix(terminateProgram, terminated.state,
  terminateCompletion("UserTask_Trigger"), [], ["operation:EndEvent_Terminate"]);
const throwing = applyStimulus(propagatedErrorProgram, initialState,
  startFor(propagatedErrorProgram, terminateInstanceId));
const errorReady = admittedInternalPrefix(propagatedErrorProgram, throwing.state,
  terminateCompletion("UserTask_Trigger"), [], ["operation:EndEvent_Terminate"]);

const cases = [
  { name: "Call return", program: callActivityProgram, state: returnReady,
    operation: operation(callActivityProgram, "operation:return-process:Call:é") },
  { name: "bounded child completion", program: boundedScopeProgram, state: childReady,
    operation: operation(boundedScopeProgram, "operation:complete-scope:scope:Scope") },
  { name: "root completion", program: boundedScopeProgram, state: rootReady,
    operation: operation(boundedScopeProgram, "operation:complete-scope:scope:Process_SubProcessBoundaryTimer") },
  { name: "Terminate", program: terminateProgram, state: terminateReady,
    operation: operation(terminateProgram, "operation:EndEvent_Terminate") },
  { name: "Error", program: propagatedErrorProgram, state: errorReady,
    operation: operation(propagatedErrorProgram, "operation:EndEvent_Terminate") },
] as const;

for (const entry of cases) {
  test(`${entry.name} retains predecessor selection and exact runtime/publication results`, () => {
    const before = { ...entry.state, logicalTimeMs: 491, endOccurrences: 18 };
    const copy = structuredClone(before);
    const prepared = required(entry.program, before, entry.operation);
    const after = assertExactStep(entry.program, before, entry.operation);
    assert.deepEqual(before, copy);
    for (const key of ["taskActivations", "messageActivations", "timerActivations", "effectActivations",
      "activityActivations", "scopeActivations", "callActivations", "eventRaceActivations"] as const) {
      assert.deepEqual(after[key], before[key], key);
    }
    assert.deepEqual(after.variables.process, before.variables.process);
    assert.equal(after.logicalTimeMs, 491);
    assert.equal(after.endOccurrences, entry.operation.kind === SemanticOperationKind.TerminateScope ? 19 : 18);
    assert.equal(containsNumbering(prepared), false);
  });

  test(`${entry.name} refuses stale selection and forged complete preparation`, () => {
    const prepared = required(entry.program, entry.state, entry.operation);
    const mutations: PreparedInternalRegionalTransition[] = [
      { ...prepared, alternative: { ...prepared.alternative, operationId: "forged-operation" } },
      { ...prepared, region: { ...prepared.region, members: [] } },
      { ...prepared, footprint: { ...prepared.footprint, reads: [] } },
      { ...prepared, publicationTemplate: { ...prepared.publicationTemplate,
        record: { ...prepared.publicationTemplate.record, logicalTimeMs: 99 } } },
      { ...prepared, publicationTemplate: { ...prepared.publicationTemplate,
        record: { ...prepared.publicationTemplate.record, positionDelta: {
          consumedTokens: [], producedTokens: [], enteredScopes: [], exitedScopes: [],
        } } } },
    ];
    for (const forged of mutations) assert.equal(applyPrepared(entry.program, entry.state, forged), null);
    assert.equal(applyPrepared(entry.program, { ...entry.state, logicalTimeMs: 991 }, prepared), null);
    assert.equal(applyPrepared(entry.program, {
      ...entry.state, scopeOccurrences: entry.state.scopeOccurrences.filter(({ id }) =>
        JSON.stringify(id) !== JSON.stringify(prepared.region.root)),
    }, prepared), null);
    const altered = { ...entry.operation, origin: { ...entry.operation.origin, elementId: "forged-origin" } };
    assert.equal(prepare(entry.program, entry.state, altered), null);
  });

  test(`${entry.name} preserves omission and refuses unprojectable optional collections`, () => {
    const present: RuntimeState = { ...entry.state, compensationTriggers: [], compensationHandlerEffectWaits: [] };
    const { compensationTriggers: _triggers, compensationHandlerEffectWaits: _waits, ...absent } = present;
    assert.equal(prepare(entry.program, present, entry.operation), null);
    const after = assertExactStep(entry.program, absent, entry.operation);
    for (const key of ["compensationTriggers", "compensationHandlerEffectWaits"] as const) {
      assert.equal(Object.hasOwn(after, key), false);
    }
  });

  test(`${entry.name} rejects duplicate operation identities and declared snapshots`, () => {
    assert.equal(prepare({ ...entry.program, operations: [...entry.program.operations,
      { ...entry.operation, origin: { ...entry.operation.origin, elementId: "alias" } }],
    }, entry.state, entry.operation), null);
    assert.equal(prepare({ ...entry.program, compensationEventSubProcessSnapshots: {
      targets: [], limits: { maxRecords: 1, maxCanonicalBytes: 1024 },
    } }, entry.state, entry.operation), null);
  });
}

test("bounded completion retains the parent-owned deadline and Activity withdrawal", () => {
  const prepared = required(boundedScopeProgram, childReady, cases[1].operation);
  assert.equal(prepared.selection.kind, SemanticOperationKind.CompleteScope);
  if (prepared.selection.kind !== SemanticOperationKind.CompleteScope) return;
  const withdrawal = prepared.selection.withdrawal;
  assert.equal(withdrawal.kind, "bounded");
  if (withdrawal.kind !== "bounded") return;
  assert.deepEqual(withdrawal.timerWaits, childReady.timerWaits);
  assert.deepEqual(withdrawal.record, childReady.activityOccurrences[0]);
  const after = applyPrepared(boundedScopeProgram, childReady, prepared)!;
  assert.deepEqual(after.timerWaits, []);
  assert.deepEqual(after.activityOccurrences, []);
  assert.equal(prepare(boundedScopeProgram, { ...childReady, timerWaits: [] }, cases[1].operation), null);
});

test("bounded withdrawal rejects declaration, Activity, tagged-handler and Timer census aliases", () => {
  const completion = cases[1].operation;
  assert.ok(completion.kind === SemanticOperationKind.CompleteScope);
  const entry = boundedScopeProgram.operations.find((candidate) =>
    candidate.kind === SemanticOperationKind.EnterBoundedScope && candidate.childScopeId === completion.scopeId);
  assert.ok(entry !== undefined);
  const record = childReady.activityOccurrences[0]!;
  const deadline = childReady.timerWaits[0]!;
  const attached = record.attachedHandlers[0]!;
  assert.equal(attached.kind, ActivityHandlerKind.Timer);
  const copy = structuredClone(childReady);
  assert.notEqual(selectScopeCompletionWithdrawal(boundedScopeProgram, completion.scopeId, childReady), null);
  const ambiguous: SemanticProcessProgram = { ...boundedScopeProgram, operations: [
    ...boundedScopeProgram.operations, { ...entry, id: "different-operation:same-child" },
  ] };
  assert.equal(selectScopeCompletionWithdrawal(ambiguous, completion.scopeId, childReady), null);
  assert.equal(prepare(ambiguous, childReady, completion), null);
  const mutants: ReadonlyArray<readonly [string, RuntimeState]> = [
    ["wrong declaring operation", { ...childReady, activityOccurrences: [{ ...record, operationId: "wrong-entry" }] }],
    ["wrong parent activation", { ...childReady, activityOccurrences: [{ ...record,
      owner: { ...record.owner, activation: record.owner.activation + 1 } }] }],
    ["duplicate Activity body", { ...childReady, activityOccurrences: [record, { ...record,
      id: { ...record.id, activation: record.id.activation + 1 } }] }],
    ["duplicate handler", { ...childReady, activityOccurrences: [{ ...record, attachedHandlers: [attached, attached] }] }],
    ["Message with the Timer's coordinates", { ...childReady, activityOccurrences: [{ ...record,
      attachedHandlers: [{ ...attached, kind: ActivityHandlerKind.Message }] }] }],
    ["wrong Timer activation", { ...childReady, timerWaits: [{ ...deadline,
      id: { ...deadline.id, activation: deadline.id.activation + 1 } }] }],
    ["duplicate Timer identity", { ...childReady, timerWaits: [deadline, { ...deadline,
      deadlineMs: deadline.deadlineMs + 1 }] }],
    ["duplicate Timer identity with another owner", { ...childReady, timerWaits: [deadline, { ...deadline,
      owner: { ...deadline.owner, activation: deadline.owner.activation + 1 } }] }],
  ];
  for (const [name, state] of mutants) {
    assert.equal(selectScopeCompletionWithdrawal(boundedScopeProgram, completion.scopeId, state), null, name);
    assert.equal(prepare(boundedScopeProgram, state, completion), null, name);
  }
  assert.deepEqual(childReady, copy);
});

test("projected boundary outputs distinguish two bounded declarations without global Activity binding", () => {
  const { program, state, start: started, branches } = regionalPairFixture(
    SemanticOperationKind.CompleteScope, SemanticOperationKind.CompleteScope, true,
  );
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.deepEqual(runtimeStateDefects(program, started.instanceId, state), []);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
  const wrongProjections: unknown[] = [];
  for (const branch of branches) {
    const completion = branch.selected;
    assert.ok(completion.kind === SemanticOperationKind.CompleteScope);
    const selected = selectScopeCompletionWithdrawal(program, completion.scopeId, state);
    assert.ok(selected !== null && selected.kind === "bounded");
    assert.notEqual(prepare(program, state, completion), null);
    const other = program.operations.find((candidate) =>
      candidate.kind === SemanticOperationKind.EnterBoundedScope && candidate.childScopeId !== completion.scopeId);
    assert.ok(other !== undefined && other.kind === SemanticOperationKind.EnterBoundedScope);
    const altered: RuntimeState = { ...state, activityOccurrences: state.activityOccurrences.map((candidate) =>
      candidate === selected.record ? { ...candidate, operationId: other.id } : candidate) };
    assert.deepEqual(runtimeStateDefects(program, started.instanceId, altered), [],
      "the ownership validator does not establish Activity-to-Program binding");
    assert.notEqual(projectCurrentControlPositions(program, altered), null);
    assert.equal(projectOpenFlowNodeOccurrences(program, altered), null,
      "the other declaration cannot explain this boundary output");
    assert.equal(selectScopeCompletionWithdrawal(program, completion.scopeId, altered), null);
    assert.equal(prepare(program, altered, completion), null);
    const wrongDeclaration: RuntimeState = { ...altered, timerWaits: altered.timerWaits.map((wait) =>
      wait === selected.timerWaits[0] ? { ...wait, output: other.boundaryTimer.output } : wait) };
    assert.deepEqual(runtimeStateDefects(program, started.instanceId, wrongDeclaration), []);
    assert.notEqual(projectCurrentControlPositions(program, wrongDeclaration), null);
    wrongProjections.push(projectOpenFlowNodeOccurrences(program, wrongDeclaration));
    const aliasedOutput: SemanticProcessProgram = { ...program, operations: program.operations.map((candidate) =>
      candidate === other ? { ...other, boundaryTimer: { ...other.boundaryTimer,
        output: selected.timerWaits[0]!.output } } : candidate) };
    assert.equal(isWellFormedSemanticProcessProgram(aliasedOutput), false,
      "two bounded declarations cannot claim the same output in an admitted graph");
  }
  const records = state.activityOccurrences;
  assert.equal(records.length, 2);
  const swappedBodies: RuntimeState = { ...state, activityOccurrences: [
    { ...records[0]!, body: records[1]!.body }, { ...records[1]!, body: records[0]!.body },
  ] };
  assert.deepEqual(runtimeStateDefects(program, started.instanceId, swappedBodies), []);
  wrongProjections.push(projectOpenFlowNodeOccurrences(program, swappedBodies));
  assert.deepEqual(wrongProjections, [null, null, null],
    "changing both metadata and output cannot turn either Timer into the other declaration's Timer");
});

test("regional root completion refuses Activity-local data without a live owning record", () => {
  const selected = operation(boundedScopeProgram, "operation:complete-scope:scope:Process_SubProcessBoundaryTimer");
  for (const activation of [1, 2]) {
    const before: RuntimeState = { ...rootReady, variables: { ...rootReady.variables, activities: [{
      owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id: {
        processInstanceId: start.instanceId, activityElementId: "OrphanActivity", activation,
      } }, bindings: [],
    }] } };
    assert.deepEqual(runtimeStateDefects(boundedScopeProgram, start.instanceId, before), []);
    assert.deepEqual(projectOpenFlowNodeOccurrences(boundedScopeProgram, before), []);
    const step = applyInternalOperationStep(boundedScopeProgram, selected, before);
    assert.ok(step !== null);
    assert.equal(step.successor.variables.activities.length, 1);
    assert.equal(projectOpenFlowNodeOccurrences(boundedScopeProgram, step.successor), null);
    assert.equal(prepare(boundedScopeProgram, before, selected) === null, true);
  }
});

test("regional bounded completion refuses retained local data whose live Activity is withdrawn", () => {
  const record = childReady.activityOccurrences[0]!;
  const selected = operation(boundedScopeProgram, "operation:complete-scope:scope:Scope");
  const before: RuntimeState = { ...childReady, variables: { ...childReady.variables, activities: [{
    owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id: record.id }, bindings: [],
  }] } };
  assert.deepEqual(runtimeStateDefects(boundedScopeProgram, start.instanceId, before), []);
  assert.notEqual(projectOpenFlowNodeOccurrences(boundedScopeProgram, before), null);
  const step = applyInternalOperationStep(boundedScopeProgram, selected, before);
  assert.ok(step !== null);
  assert.equal(step.successor.activityOccurrences.includes(record), false);
  assert.equal(step.successor.variables.activities.length, 1);
  assert.equal(prepare(boundedScopeProgram, before, selected) === null, true);
});

test("regional local-data closure requires one exact retained Activity identity", () => {
  const { program, state, branches } = regionalPairFixture(
    SemanticOperationKind.CompleteScope, SemanticOperationKind.CompleteScope, true,
  );
  const selected = required(program, state, branches[0]!.selected);
  const retained = state.activityOccurrences.find(({ operationId }) => operationId === branches[1]!.entry.id)!;
  const local = { owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id: retained.id }, bindings: [] } as const;
  const before: RuntimeState = { ...state, variables: { ...state.variables, activities: [local] } };
  assert.equal(regionalOwnershipIsClosed(before, selected.selection), true);
  assertExactStep(program, before, branches[0]!.selected);
  // Predicate-only mutations isolate exact census from global predecessor validity (REG-OWN-CLOSE-01).
  for (const id of [
    { ...retained.id, processInstanceId: `${retained.id.processInstanceId}:other` },
    { ...retained.id, activityElementId: `${retained.id.activityElementId}:other` },
    { ...retained.id, activation: retained.id.activation + 1 },
  ]) {
    const missing: RuntimeState = { ...before, variables: { ...before.variables,
      activities: [{ ...local, owner: { ...local.owner, id } }] } };
    assert.equal(regionalOwnershipIsClosed(missing, selected.selection), false);
    const distinct: RuntimeState = { ...before, activityOccurrences: [
      ...before.activityOccurrences, { ...retained, id },
    ] };
    assert.equal(regionalOwnershipIsClosed(distinct, selected.selection), true);
  }
  const duplicate: RuntimeState = { ...before, activityOccurrences: [...before.activityOccurrences, { ...retained }] };
  assert.equal(regionalOwnershipIsClosed(duplicate, selected.selection), false);
});

test("Effect-tagged local data does not acquire an Activity owner requirement", () => {
  const selected = required(boundedScopeProgram, childReady, cases[1].operation);
  const id = childReady.activityOccurrences[0]!.id;
  const local = { owner: { kind: LocalDataOwnerKind.EffectOccurrence, id: {
    processInstanceId: id.processInstanceId, elementId: id.activityElementId, activation: id.activation,
  } }, bindings: [] } as const;
  const before: RuntimeState = { ...childReady, variables: { ...childReady.variables, activities: [local] } };
  assert.equal(regionalOwnershipIsClosed(before, selected.selection), true);
  assert.deepEqual(before.variables.activities.filter(deriveRegionalReferenceRetention(before, selected.selection).localData),
    [local]);
  const raw = applyInternalOperationStep(boundedScopeProgram, cases[1].operation, before);
  assert.ok(raw !== null);
  assert.deepEqual(raw.successor.variables.activities, [local]);
});

for (const kind of [SemanticOperationKind.ReturnProcess, SemanticOperationKind.ThrowError,
  SemanticOperationKind.TerminateScope] as const) {
  test(`${kind} removes a whole Activity-local component and retains an unrelated component`, () => {
    const { program, state, start: started, branches } = regionalPairFixture(kind, kind);
    const records = branches.map((branch, index): RuntimeState["activityOccurrences"][number] => {
      const scope = state.scopeOccurrences.find(({ id }) => id.definitionScopeId === branch.scopeId)!;
      const owner = index === 0 && kind === SemanticOperationKind.ReturnProcess ? scope.id
        : scope.parent ?? state.calledProcessOccurrences.find(({ calledRoot }) =>
          calledRoot.definitionScopeId === branch.scopeId)!.caller;
      return { id: { processInstanceId: owner.processInstanceId,
        activityElementId: `LocalActivity_${index}`, activation: 1 }, owner, operationId: branch.entry.id,
        body: { kind: ActivityBodyKind.ChildScope, scope: scope.id }, attachedHandlers: [] };
    });
    const locals = records.map(({ id }) => ({
      owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id }, bindings: [],
    } as const));
    const before: RuntimeState = { ...state, activityOccurrences: [...records].sort(compareActivityOccurrences),
      activityActivations: [...state.activityActivations,
        ...records.map(({ id }) => ({ elementId: id.activityElementId, count: id.activation }))]
        .sort((a, b) => compareCanonicalStrings(a.elementId, b.elementId)),
      variables: { ...state.variables, activities: [...locals].sort((a, b) => compareLocalDataOwners(a.owner, b.owner)) },
    };
    assert.deepEqual(runtimeStateDefects(program, started.instanceId, before), []);
    assert.notEqual(projectOpenFlowNodeOccurrences(program, before), null);
    const after = assertExactStep(program, before, branches[0]!.selected);
    assert.deepEqual(after.activityOccurrences, [records[1]]);
    assert.deepEqual(after.variables.activities, [locals[1]]);
  });
}

for (const entry of [cases[3], cases[4]]) {
  test(`${entry.name} local masks preserve tags and match open and incident-suspended Effect cleanup`, () => {
    const selected = required(entry.program, entry.state, entry.operation);
    const root = entry.state.scopeOccurrences.find(({ id }) => id.definitionScopeId === selected.selection.owner.definitionScopeId)!;
    assert.ok(root.parent !== null);
    const makeEffect = (elementId: string): RuntimeState["effectWaits"][number] => ({
      id: { processInstanceId: root.id.processInstanceId, elementId, activation: 1 }, owner: root.id,
      descriptor: { protocol: "regional-mask", operation: "regional-mask" },
      arguments: [], outputMappings: [], bpmnErrorRoute: null, output: "unused", incidentAlreadyRetried: false,
    });
    const open = makeEffect("OpenEffect");
    const incident = makeEffect("IncidentEffect");
    const retainedActivity: RuntimeState["activityOccurrences"][number] = {
      id: { processInstanceId: open.id.processInstanceId, activityElementId: open.id.elementId, activation: open.id.activation },
      owner: root.parent, operationId: "predicate-only", attachedHandlers: [],
      body: { kind: ActivityBodyKind.ChildScope, scope: root.parent },
    };
    const removedActivity = { ...retainedActivity,
      id: { ...retainedActivity.id, activityElementId: "RemovedActivity" }, owner: root.id,
    };
    const effectLocals = [open.id, incident.id,
      { ...open.id, processInstanceId: `${open.id.processInstanceId}:other` },
      { ...open.id, elementId: "OtherEffect" },
      { ...open.id, activation: 2 },
      { ...open.id, elementId: removedActivity.id.activityElementId },
    ].map((id) => ({ owner: { kind: LocalDataOwnerKind.EffectOccurrence, id }, bindings: [] } as const));
    const activityLocal = { owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id: retainedActivity.id },
      bindings: [] } as const;
    // Raw-mask witnesses deliberately bypass source admission; no registered Effect/Activity composition is claimed.
    const before: RuntimeState = { ...entry.state,
      activityOccurrences: [retainedActivity, removedActivity], effectWaits: [open],
      effectIncidents: [{ id: { effectId: incident.id, generation: 1 }, wait: incident }],
      variables: { ...entry.state.variables, activities: [...effectLocals, activityLocal] },
    };
    const expected = [...effectLocals.slice(2), activityLocal];
    const keep = deriveRegionalReferenceRetention(before, selected.selection);
    assert.equal(regionalOwnershipIsClosed(before, selected.selection), true);
    assert.deepEqual(before.variables.activities.filter(keep.localData), expected);
    const raw = applyInternalOperationStep(entry.program, entry.operation, before);
    assert.ok(raw !== null);
    assert.deepEqual(raw.successor.variables.activities, expected);
  });
}

function operation(program: SemanticProcessProgram, id: string): InternalRegionalOperation {
  const selected = program.operations.find((entry) => entry.id === id);
  assert.ok(selected !== undefined && (selected.kind === SemanticOperationKind.ReturnProcess ||
    selected.kind === SemanticOperationKind.CompleteScope || selected.kind === SemanticOperationKind.ThrowError ||
    selected.kind === SemanticOperationKind.TerminateScope));
  return selected;
}

function required(program: SemanticProcessProgram, state: RuntimeState, selected: InternalRegionalOperation) {
  const prepared = prepare(program, state, selected);
  assert.notEqual(prepared, null);
  return prepared!;
}

function assertExactStep(program: SemanticProcessProgram, before: RuntimeState, selected: InternalRegionalOperation) {
  const prepared = required(program, before, selected);
  const step = applyInternalOperationStep(program, selected, before);
  assert.ok(step !== null && step.owner !== null);
  const after = applyPrepared(program, before, prepared);
  assert.deepEqual(after, step.successor);
  const keep = deriveRegionalReferenceRetention(before, prepared.selection);
  assert.deepEqual(before.scopeOccurrences.filter(keep.scope), step.successor.scopeOccurrences);
  assert.deepEqual(before.activityOccurrences.filter(keep.activity), step.successor.activityOccurrences);
  assert.deepEqual(before.userTaskWaits.filter(keep.task), step.successor.userTaskWaits);
  assert.deepEqual(before.messageWaits.filter(keep.message), step.successor.messageWaits);
  assert.deepEqual(before.timerWaits.filter(keep.timer), step.successor.timerWaits);
  assert.deepEqual(before.eventRaces.filter(keep.race), step.successor.eventRaces);
  assert.deepEqual(before.variables.activities.filter(keep.localData), step.successor.variables.activities);
  const delta = projectControlPositionDelta(program, before, step.successor);
  const lifecycle = projectFlowNodeOccurrenceLifecycleDelta(program, before, step.successor,
    { kind: "internal", operation: selected, owner: step.owner }, "regional-command", 43);
  assert.notEqual(delta, null);
  assert.notEqual(lifecycle, null);
  const publication = instantiateInternalPublicationBatch("regional-command", 43, [prepared.publicationTemplate]);
  assert.notEqual(publication, null);
  assert.deepEqual(publication![0]?.record, {
    logicalTimeMs: before.logicalTimeMs,
    transition: { kind: SemanticTransitionKind.InternalOperation, operationId: selected.id,
      operationKind: selected.kind, origin: selected.origin, owner: step.owner }, positionDelta: delta,
  });
  assert.deepEqual(publication![0]?.lifecycle, lifecycle);
  return after!;
}

function containsNumbering(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    ["commandId", "transitionIndex", "localIndex"].includes(key) || containsNumbering(child));
}

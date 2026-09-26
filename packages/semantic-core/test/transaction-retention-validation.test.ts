import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CompensationCompletionFactKind,
  CompensationRetentionCapacityMeasure,
  CompensationRetentionRefusalKind,
  CompensationRetentionResultKind,
  ControlStateKind,
  SemanticOperationKind,
  canonicalCompensationRecordsUtf8Bytes,
  compensationRetentionProgramDefects,
  compensationRetentionStateDefects,
  compensationExecutionMatchesProgram,
  initialState,
  initializeCompensationActivityRetention,
  isWellFormedCancelTransactionOperation,
  retainCompletedCompensableActivity,
  type RuntimeState,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import { startFixture, withLimits } from "./compensation-activity-retention-fixtures.ts";
import {
  admittedTransactionProgram,
  transactionChildScope,
  transactionInstanceId,
  transactionRootScope,
} from "./transaction-cancellation-fixtures.ts";

const { stageCompensationActivityRetention } = await import(
  new URL("../dist/compensation-activity-retention-producers.js", import.meta.url).href
) as typeof import("../src/compensation-activity-retention-producers.ts");

const program = admittedTransactionProgram();
const rootOwner = {
  processInstanceId: transactionInstanceId,
  definitionScopeId: transactionRootScope,
  activation: 1,
};
const childOwner = { ...rootOwner, definitionScopeId: transactionChildScope };
const register = { owner: childOwner, nextCompletionOrdinal: 1, records: [] };
const activity = {
  processInstanceId: transactionInstanceId,
  activityElementId: "Reserve",
  activation: 1,
};
const facts = { kind: CompensationCompletionFactKind.OrdinaryUserTask, activity } as const;
const wait = {
  id: { processInstanceId: activity.processInstanceId, elementId: activity.activityElementId, activation: 1 },
  owner: childOwner,
  name: null,
  output: "place:Reserve_Prepare",
};
const beforeEntry: RuntimeState = {
  ...initialState,
  control: { kind: ControlStateKind.Running, instanceId: transactionInstanceId },
  scopeOccurrences: [{ id: rootOwner, parent: null }],
  compensationActivityRetentions: [],
};
const live: RuntimeState = {
  ...beforeEntry,
  scopeOccurrences: [...beforeEntry.scopeOccurrences, { id: childOwner, parent: rootOwner }],
  userTaskWaits: [wait],
  compensationActivityRetentions: [register],
};

test("child retention declaration binds its exact Cancel operation and ordinary boundary subject", () => {
  assert.equal(compensationExecutionMatchesProgram(program), true);
  assert.deepEqual(compensationRetentionProgramDefects(program), []);
});

test("child declaration rejects other owners, global throws, extra triggers and unsupported subjects", () => {
  const execution = program.compensationExecution!;
  const retention = program.compensationActivityRetention!;
  const cancel = program.operations.find(({ id }) => id === execution.triggerOperationId)!;
  const mutations: SemanticProcessProgram[] = [
    { ...program, compensationExecution: { ...execution, triggerOperationId: "missing" } },
    { ...program, compensationExecution: { ...execution, definitionScopeId: transactionRootScope } },
    { ...program, compensationActivityRetention: { ...retention, definitionScopeId: transactionRootScope } },
    { ...program, operations: program.operations.map((operation) => operation === cancel ? { ...operation, definitionScopeId: transactionRootScope } : operation) } as SemanticProcessProgram,
    { ...program, definitionScopes: program.definitionScopes.map((scope) => scope.id === transactionChildScope ? { ...scope, parentScopeId: "missing" } : scope) },
    { ...program, operations: program.operations.filter(({ id }) => id !== cancel.id) },
    { ...program, operations: [...program.operations, { ...cancel, id: "another-cancel" }] },
    { ...program, operationScopes: program.operationScopes.filter(({ operationId }) => operationId !== cancel.id) },
    { ...program, operationScopes: [...program.operationScopes, { operationId: cancel.id, scopeId: transactionRootScope }] },
    { ...program, compensationExecution: { ...execution, subjects: [] } },
    { ...program, compensationExecution: { ...execution, subjects: [...execution.subjects, ...execution.subjects] } },
    { ...program, compensationExecution: { ...execution, subjects: execution.subjects.map((subject) => ({ ...subject, body: { ...subject.body, input: { kind: "restoredProcessBinding", sourceName: "before", argumentName: "after" } } })) } },
    { ...program, compensationExecution: { ...execution, dependencies: [{ predecessorElementId: "Reserve", successorElementId: "Reserve", reason: "sequenceFlow" }] } },
    { ...program, compensationEventSubProcessSnapshots: { targets: [], limits: { maxRecords: 1, maxCanonicalBytes: 4096 } } },
  ];
  const { boundaryEventElementId: _boundary, ...globalThrow } = cancel as typeof cancel & { boundaryEventElementId: string };
  mutations.push({ ...program, operations: program.operations.map((operation) => operation === cancel ? { ...globalThrow, kind: SemanticOperationKind.TriggerCompensation } : operation) } as SemanticProcessProgram);
  mutations.push({ ...program, operations: [...program.operations, { ...globalThrow, id: "root-throw", kind: SemanticOperationKind.TriggerCompensation, definitionScopeId: transactionRootScope }] } as SemanticProcessProgram);
  mutations.push({ ...program, operations: program.operations.map((operation) => operation.origin.elementId === "Reserve" ? { ...operation, kind: SemanticOperationKind.AwaitSequentialMultiInstanceUserTask } : operation) } as SemanticProcessProgram);
  for (const [index, candidate] of mutations.entries()) {
    assert.equal(compensationExecutionMatchesProgram(candidate), false, `declaration mutation ${index}`);
  }
  const { compensationExecution: _execution, ...noExecution } = program;
  assert.equal(compensationExecutionMatchesProgram(noExecution), false);
  assert.notDeepEqual(compensationRetentionProgramDefects(noExecution), []);
});

test("Cancel arm accepts only closed exact identities and existing distinct places", () => {
  const cancel = program.operations.find(({ id }) => id === "operation:Cancel")!;
  const places = new Set(program.controlPlaces.map(({ id }) => id));
  const scopes = new Map(program.definitionScopes.map(({ id, originElementId }) => [id, originElementId]));
  assert.equal(isWellFormedCancelTransactionOperation({ ...cancel }, places, scopes), true);
  const mutations = [
    { ...cancel, extra: true }, { ...cancel, id: "" }, { ...cancel, id: "\ud800" },
    { ...cancel, kind: SemanticOperationKind.TriggerCompensation },
    { ...cancel, origin: { kind: "bpmnElement", elementId: "" } },
    { ...cancel, origin: { kind: "bpmnElement", elementId: "\ud800" } },
    { ...cancel, origin: { kind: "other", elementId: "Cancel" } },
    { ...cancel, origin: { kind: "bpmnElement", elementId: "Cancel", extra: true } },
    { ...cancel, definitionScopeId: "missing" }, { ...cancel, input: "missing" },
    { ...cancel, output: "missing" },
    { ...cancel, output: "place:Withdraw_Cancel" }, { ...cancel, boundaryEventElementId: "" },
    { ...cancel, boundaryEventElementId: "\ud800" },
  ];
  for (const candidate of mutations) {
    assert.equal(isWellFormedCancelTransactionOperation(candidate, places, scopes), false);
  }
  for (const key of Object.keys(cancel)) {
    const incomplete: Record<string, unknown> = { ...cancel };
    delete incomplete[key];
    assert.equal(isWellFormedCancelTransactionOperation(incomplete, places, scopes), false);
  }
});

test("child register is empty before entry and after disposal while the root keeps running", () => {
  assert.deepEqual(compensationRetentionStateDefects(program, beforeEntry), []);
  const disposed = { ...live, scopeOccurrences: beforeEntry.scopeOccurrences, userTaskWaits: [], compensationActivityRetentions: [] };
  assert.deepEqual(compensationRetentionStateDefects(program, disposed), []);
});

test("a live child owns exactly one register, including its consumed compensation register", () => {
  assert.deepEqual(compensationRetentionStateDefects(program, live), []);
  const consumed = { ...live, userTaskWaits: [], compensationActivityRetentions: [{ ...register, nextCompletionOrdinal: 2 }] };
  assert.deepEqual(compensationRetentionStateDefects(program, consumed), []);
  const mutations = [
    { ...live, compensationActivityRetentions: [] },
    { ...live, compensationActivityRetentions: [register, register] },
    { ...live, compensationActivityRetentions: [{ ...register, owner: rootOwner }] },
    { ...live, compensationActivityRetentions: [{ ...register, owner: { ...childOwner, activation: 2 } }] },
    { ...live, compensationActivityRetentions: [{ ...register, owner: { ...childOwner, processInstanceId: "other" } }] },
    { ...beforeEntry, compensationActivityRetentions: [register] },
    { ...live, scopeOccurrences: [...live.scopeOccurrences, { id: { ...childOwner, activation: 2 }, parent: rootOwner }] },
    { ...live, scopeOccurrences: [{ id: rootOwner, parent: null }, { id: childOwner, parent: { ...rootOwner, activation: 2 } }] },
    { ...live, scopeOccurrences: [{ id: rootOwner, parent: null }, { id: { ...childOwner, activation: 2 }, parent: rootOwner }], compensationActivityRetentions: [{ ...register, owner: { ...childOwner, activation: 2 } }] },
  ];
  for (const candidate of mutations) assert.notDeepEqual(compensationRetentionStateDefects(program, candidate), []);
});

test("an active child trigger requires its consumed register to stay empty", () => {
  const handlerId = { processInstanceId: transactionInstanceId, elementId: "Release_Reservation", activation: 1 };
  const compensating: RuntimeState = {
    ...live,
    userTaskWaits: [],
    compensationActivityRetentions: [{ ...register, nextCompletionOrdinal: 2 }],
    compensationTriggers: [{
      id: { processInstanceId: transactionInstanceId, elementId: "operation:Cancel", activation: 1 },
      owner: childOwner,
      output: "place:Cancel_Acknowledge",
      lifecycle: "active",
      handlers: [{
        id: handlerId,
        subject: { kind: "boundaryActivity", activity },
        handlerElementId: handlerId.elementId,
        lifecycle: "compensating",
        restoredContext: null,
        effectId: handlerId,
      }],
      dependencies: [],
    }],
  };
  assert.deepEqual(compensationRetentionStateDefects(program, compensating), []);
  assert.notDeepEqual(compensationRetentionStateDefects(program, {
    ...compensating,
    compensationActivityRetentions: [{ ...register, nextCompletionOrdinal: 2, records: [{ id: activity, completionOrdinal: 1 }] }],
  }), []);
});

test("declaration-bound presence and terminal emptiness remain mandatory", () => {
  const { compensationActivityRetentions: _retentions, ...omitted } = beforeEntry;
  assert.notDeepEqual(compensationRetentionStateDefects(program, omitted), []);
  const { compensationActivityRetention: _retention, ...undeclared } = program;
  assert.deepEqual(compensationRetentionStateDefects(undeclared, omitted), []);
  assert.notDeepEqual(compensationRetentionStateDefects(undeclared, beforeEntry), []);
  for (const control of [initialState.control, { kind: ControlStateKind.Completed, instanceId: transactionInstanceId }, { kind: ControlStateKind.Cancelled, instanceId: transactionInstanceId }] as const) {
    assert.deepEqual(compensationRetentionStateDefects(program, { ...beforeEntry, control }), []);
    assert.notDeepEqual(compensationRetentionStateDefects(program, { ...live, control }), []);
  }
});

test("initialization creates only the selected owner and preserves registers on unrelated entry", () => {
  const { compensationActivityRetentions: _retentions, ...uninitialized } = beforeEntry;
  assert.deepEqual(initializeCompensationActivityRetention(program, uninitialized, rootOwner).compensationActivityRetentions, []);
  assert.deepEqual(initializeCompensationActivityRetention(program, beforeEntry, childOwner).compensationActivityRetentions, [register]);
  assert.equal(initializeCompensationActivityRetention(program, live, rootOwner), live);
  const { startProgram } = startFixture(SemanticOperationKind.Initiate);
  const root = { ...rootOwner, definitionScopeId: startProgram.compensationActivityRetention!.definitionScopeId };
  const started = initializeCompensationActivityRetention(startProgram, uninitialized, root);
  assert.equal(initializeCompensationActivityRetention(startProgram, started, childOwner), started);
  const populated = { ...started, compensationActivityRetentions: [{ owner: root, nextCompletionOrdinal: 2, records: [{ id: activity, completionOrdinal: 1 }] }] };
  assert.equal(initializeCompensationActivityRetention(startProgram, populated, childOwner), populated);
});

test("root declaration keeps its one-register lifetime and fact-based ordinary completion", () => {
  const { startProgram } = startFixture(SemanticOperationKind.Initiate);
  const declaration = startProgram.compensationActivityRetention!;
  const owner = { ...rootOwner, definitionScopeId: declaration.definitionScopeId };
  const state: RuntimeState = {
    ...beforeEntry,
    scopeOccurrences: [{ id: owner, parent: null }],
    compensationActivityRetentions: [{ ...register, owner }],
  };
  assert.deepEqual(compensationRetentionStateDefects(startProgram, state), []);
  assert.notDeepEqual(compensationRetentionStateDefects(startProgram, { ...state, compensationActivityRetentions: [] }), []);
  const result = retainCompletedCompensableActivity(startProgram, state, {
    ...facts,
    activity: { ...activity, activityElementId: declaration.targets[0]!.activityElementId },
  });
  assert.equal(result.kind, CompensationRetentionResultKind.Retained);
});

test("ordinary completion joins the unique pre-removal wait to the complete child owner", () => {
  const result = retainCompletedCompensableActivity(program, live, facts);
  assert.equal(result.kind, CompensationRetentionResultKind.Retained);
  assert.deepEqual(result.state.compensationActivityRetentions, [{ ...register, nextCompletionOrdinal: 2, records: [{ id: activity, completionOrdinal: 1 }] }]);
  assert.deepEqual(stageCompensationActivityRetention(program, live, facts), result.state);
  const mutations = [
    { ...live, userTaskWaits: [] },
    { ...live, userTaskWaits: [wait, wait] },
    { ...live, userTaskWaits: [{ ...wait, owner: rootOwner }] },
    { ...live, userTaskWaits: [{ ...wait, owner: { ...childOwner, activation: 2 } }] },
    { ...live, userTaskWaits: [{ ...wait, owner: { ...childOwner, processInstanceId: "other" } }] },
    { ...live, userTaskWaits: [{ ...wait, id: { ...wait.id, activation: 2 } }] },
    { ...live, userTaskWaits: [{ ...wait, id: { ...wait.id, processInstanceId: "other" } }] },
  ];
  for (const candidate of mutations) {
    const refused = retainCompletedCompensableActivity(program, candidate, facts);
    assert.equal(refused.kind, CompensationRetentionResultKind.Refused);
    assert.equal(refused.state, candidate);
    assert.equal(stageCompensationActivityRetention(program, candidate, facts), null);
  }
});

test("child insertion preserves exact pre-state on duplicate, count and Unicode byte refusal", () => {
  const unicode = { ...activity, processInstanceId: "instance-😀-é" };
  const owner = { ...childOwner, processInstanceId: unicode.processInstanceId };
  const root = { ...rootOwner, processInstanceId: unicode.processInstanceId };
  const state: RuntimeState = {
    ...live,
    control: { kind: ControlStateKind.Running, instanceId: unicode.processInstanceId },
    scopeOccurrences: [{ id: root, parent: null }, { id: owner, parent: root }],
    compensationActivityRetentions: [{ ...register, owner }],
    userTaskWaits: [{ ...wait, owner, id: { ...wait.id, processInstanceId: unicode.processInstanceId } }],
  };
  const completion = { ...facts, activity: unicode };
  const bytes = Buffer.byteLength(JSON.stringify([{
    completionOrdinal: 1,
    id: { activation: 1, activityElementId: "Reserve", processInstanceId: unicode.processInstanceId },
  }]), "utf8");
  assert.equal(canonicalCompensationRecordsUtf8Bytes([{ id: unicode, completionOrdinal: 1 }]), bytes);
  const exact = withLimits(program, { maxRecords: 1, maxCanonicalBytes: bytes });
  const retained = retainCompletedCompensableActivity(exact, state, completion);
  assert.equal(retained.kind, CompensationRetentionResultKind.Retained);
  const duplicate = retainCompletedCompensableActivity(exact, retained.state, completion);
  assert.equal(duplicate.state, retained.state);
  assert.equal(duplicate.kind, CompensationRetentionResultKind.Refused);
  if (duplicate.kind === CompensationRetentionResultKind.Refused) assert.equal(duplicate.refusal.kind, CompensationRetentionRefusalKind.DuplicateActivity);
  const full = { ...retained.state, userTaskWaits: [{ ...state.userTaskWaits[0]!, id: { ...state.userTaskWaits[0]!.id, activation: 2 } }] };
  const count = retainCompletedCompensableActivity(exact, full, { ...completion, activity: { ...unicode, activation: 2 } });
  assert.equal(count.kind, CompensationRetentionResultKind.Refused);
  assert.equal(count.state, full);
  if (count.kind === CompensationRetentionResultKind.Refused) assert.deepEqual(count.refusal, { kind: CompensationRetentionRefusalKind.CapacityExceeded, measure: CompensationRetentionCapacityMeasure.Records, configuredBound: 1, observedValue: 2 });
  const overflow = retainCompletedCompensableActivity(withLimits(program, { maxRecords: 1, maxCanonicalBytes: bytes - 1 }), state, completion);
  assert.equal(overflow.kind, CompensationRetentionResultKind.Refused);
  assert.equal(overflow.state, state);
  if (overflow.kind === CompensationRetentionResultKind.Refused) assert.deepEqual(overflow.refusal, { kind: CompensationRetentionRefusalKind.CapacityExceeded, measure: CompensationRetentionCapacityMeasure.CanonicalBytes, configuredBound: bytes - 1, observedValue: bytes });
});

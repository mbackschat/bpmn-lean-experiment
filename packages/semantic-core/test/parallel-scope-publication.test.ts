import assert from "node:assert/strict";
import { test } from "node:test";
import { ActivityBodyKind, ControlStateKind, EffectExecutionResultKind, FlowNodeOccurrenceTerminalKind as Terminal,
  initialState, SemanticFlowNodeOccurrenceAnchorKind as Anchor,
  SemanticOperationKind as Op, SemanticOriginKind, SemanticTransitionKind, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { RuntimeState, ScopeOccurrenceId, SemanticProcessProgram, UnnumberedCommittedTransitionRecord,
  UnnumberedFlowNodeOccurrenceDelta } from "@bpmn-lean/semantic-core";
import { program as base } from "./embedded-subprocess-fixture.ts";
const { applyInternalOperationOccurrence } = await import(new URL("../dist/internal-operation-occurrence.js", import.meta.url).href
) as typeof import("../src/internal-operation-occurrence.ts");
const { projectInternalExecutionBatch } = await import(new URL("../dist/semantic-transition-trace.js", import.meta.url).href
) as typeof import("../src/semantic-transition-trace.ts");
const { candidateLongLivedStarts } = await import(new URL("../dist/flow-node-occurrence-boundary-starts.js", import.meta.url).href
) as typeof import("../src/flow-node-occurrence-boundary-starts.ts");
const { requireCompleteFlowNodeOccurrenceLifecycles } = await import(
  new URL("../dist/flow-node-occurrence-publication-completeness.js", import.meta.url).href
) as typeof import("../src/flow-node-occurrence-publication-completeness.ts");
const { isWellFormedSemanticProcessProgram } = await import(new URL("../dist/semantic-process-admission.js", import.meta.url).href
) as typeof import("../src/semantic-process-admission.ts");
function canonicalProgram(value: SemanticProcessProgram): SemanticProcessProgram {
  const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  return { ...value,
    definitionScopes: [...value.definitionScopes].sort((left, right) => compare(left.id, right.id)),
    operations: [...value.operations].sort((left, right) => compare(left.id, right.id)),
    operationScopes: [...value.operationScopes].sort((left, right) => compare(left.operationId, right.operationId)),
    controlPlaces: [...value.controlPlaces].sort((left, right) => compare(left.id, right.id)),
    controlPlaceScopes: [...value.controlPlaceScopes].sort((left, right) => compare(left.controlPlaceId, right.controlPlaceId)),
  };
}
const parent: ScopeOccurrenceId = { processInstanceId: "applications", definitionScopeId: "root", activation: 1 };
const origin = (elementId: string) => ({ kind: SemanticOriginKind.BpmnElement, elementId } as const);
const entry = { kind: Op.EnterParallelMultiInstanceScope, id: "enter", origin: origin("Checks"), input: "in",
  childEntry: "check", childScopeId: "body", normalOutput: "out", collectionName: "items", itemName: "item",
  completionBooleanName: null, bodyInputs: [] } as const;
const operations: SemanticProcessProgram["operations"] = [
  { kind: Op.Initiate, id: "start", origin: origin("Start"), output: "in" }, entry,
  { kind: Op.AwaitUserTask, id: "review", origin: origin("Review"), input: "check", output: "done",
    task: { elementId: "Review", name: "Review application" } },
  { kind: Op.ReachNoneEnd, id: "bodyEnd", origin: origin("BodyEnd"), input: "done" },
  { kind: Op.CompleteParallelMultiInstanceScope, id: "complete", origin: entry.origin, entryOperationId: entry.id },
  { kind: Op.ReachNoneEnd, id: "outerEnd", origin: origin("OuterEnd"), input: "out" },
  { kind: Op.CompleteScope, id: "completeRoot", origin: origin("Applications"), scopeId: "root", parentOutput: null },
];
const program = canonicalProgram({ ...base,
  identity: { ...base.identity, semanticProfile: "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" },
  processId: "Applications", operations,
  definitionScopes: [{ id: "root", parentScopeId: null, originElementId: "Applications" },
    { id: "body", parentScopeId: "root", originElementId: "Checks" }],
  operationScopes: operations.map(operation => ({ operationId: operation.id,
    scopeId: ["review", "bodyEnd", "complete"].includes(operation.id) ? "body" : "root" })),
  controlPlaces: ["check", "done", "in", "out"].map(id => ({ id,
    origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: `Flow_${id}` } })),
  controlPlaceScopes: ["check", "done", "in", "out"].map(controlPlaceId => ({ controlPlaceId,
    scopeId: ["check", "done"].includes(controlPlaceId) ? "body" : "root" })),
});
function entered(count: number, selected = program) {
  assert.ok(isWellFormedSemanticProcessProgram(selected), "positive publication fixture must be structurally valid canonical IL");
  const before: RuntimeState = { ...initialState, control: { kind: ControlStateKind.Running, instanceId: parent.processInstanceId },
    scopeOccurrences: [{ id: parent, parent: null }], controlTokens: [{ placeId: "in", owner: parent, multiplicity: 1 }],
    variables: { ...initialState.variables, process: { bindings: [{ name: "items",
      value: { kind: VariableValueKind.StringList, value: Array.from({ length: count }, () => "same") } }] } } };
  const after = applyInternalOperationOccurrence(selected, before, { operationId: entry.id, owner: parent });
  assert.ok(after);
  return { before, after };
}
function publish(before: RuntimeState, after: RuntimeState, selected = program) {
  return projectInternalExecutionBatch(selected, before, [{ operation: entry, owner: parent, successor: after }], null, "start", 1);
}
const external: UnnumberedCommittedTransitionRecord = { logicalTimeMs: 0,
  transition: { kind: SemanticTransitionKind.ExternalStimulus, stimulus: { kind: StimulusKind.StartProcess, commandId: "start",
    processId: program.processId, instanceId: parent.processInstanceId, initialVariables: [] } },
  positionDelta: { consumedTokens: [], producedTokens: [], enteredScopes: [], exitedScopes: [] } };
function requireEntry(record: UnnumberedCommittedTransitionRecord, lifecycle: UnnumberedFlowNodeOccurrenceDelta, selected = program) {
  requireCompleteFlowNodeOccurrenceLifecycles(selected, [], "start", [external, record], [{ started: [], ended: [] }, lifecycle]);
}

for (const count of [0, 1, 2, 16]) for (const reverse of [false, true])
  test(`parallel entry ${count} bodies: ${reverse ? "reversed declarations preserve candidates but refuse publication" : "canonical declarations publish exact child scopes"}`, () => {
    const selected = reverse ? { ...program, operations: [...program.operations].reverse(),
      definitionScopes: [...program.definitionScopes].reverse(), operationScopes: [...program.operationScopes].reverse() } : program;
    const { before, after } = entered(count);
    if (reverse) {
      assert.equal(isWellFormedSemanticProcessProgram(selected), false);
      assert.deepEqual(candidateLongLivedStarts(selected, before, after, entry, parent),
        candidateLongLivedStarts(program, before, after, entry, parent));
      assert.equal(publish(before, after, selected), null);
      return;
    }
    const result = publish(before, after, selected);
    assert.ok(result);
    assert.deepEqual(result.lifecycles[0], { started: Array.from({ length: count }, (_, index) => ({
      anchor: { kind: Anchor.Scope, id: { ...parent, definitionScopeId: "body", activation: index + 1 } },
      processId: program.processId, elementId: "Checks", owner: parent,
    })), ended: [] });
    assert.equal(result.records[0]!.positionDelta.enteredScopes.length, count);
    assert.doesNotThrow(() => requireEntry(result.records[0]!, result.lifecycles[0]!, selected));
  });

test("parallel entry candidate rejects incomplete, duplicated or misbound population facts", () => {
  const { before, after } = entered(2);
  const activity = after.activityOccurrences[0]!;
  assert.ok(activity.body.kind === ActivityBodyKind.ParallelChildScopes);
  const first = activity.body.iterations[0];
  const second = activity.body.iterations[1]!;
  const replaceBody = (body: typeof activity.body): RuntimeState => ({ ...after, activityOccurrences: [{ ...activity, body }] });
  const invalid: RuntimeState[] = [
    { ...after, scopeOccurrences: after.scopeOccurrences.filter(scope => scope.id.definitionScopeId !== "body" || scope.id.activation !== 2) },
    { ...after, scopeOccurrences: [...after.scopeOccurrences, after.scopeOccurrences.find(scope => scope.id.definitionScopeId === "body")!] },
    { ...after, scopeOccurrences: after.scopeOccurrences.map(scope => scope.id.definitionScopeId === "body" && scope.id.activation === 2
      ? { ...scope, parent: { ...parent, activation: 2 } } : scope) },
    replaceBody({ ...activity.body, iterations: [first] }),
    replaceBody({ ...activity.body, iterations: [first, first] }),
    replaceBody({ ...activity.body, iterations: [first, { ...second, scope: { ...second.scope, definitionScopeId: "other" } }] }),
    replaceBody({ ...activity.body, iterations: [first, { ...second, item: "changed" }] }),
    { ...after, activityOccurrences: [{ ...activity, operationId: "other-entry" }] },
    { ...after, activityOccurrences: [activity, activity] },
    { ...after, parallelScopeControllers: [] },
    { ...after, parallelScopeControllers: [...after.parallelScopeControllers!, ...after.parallelScopeControllers!] },
    { ...after, parallelScopeControllers: after.parallelScopeControllers!.map(controller => ({ ...controller, completed: 1 })) },
    { ...after, variables: { ...after.variables, scopes: after.variables.scopes.slice(0, 1) } },
    { ...after, scopeActivations: [{ elementId: "body", count: 3 }] },
  ];
  for (const candidate of invalid) {
    assert.equal(candidateLongLivedStarts(program, before, candidate, entry, parent), null);
    assert.equal(publish(before, candidate), null);
  }
  for (const selected of [
    { ...program, operations: [...program.operations, entry] },
    { ...program, definitionScopes: program.definitionScopes.map(scope => scope.id === "body" ? { ...scope, originElementId: "Other" } : scope) },
    { ...program, operationScopes: program.operationScopes.filter(scope => scope.operationId !== entry.id) },
  ]) assert.equal(candidateLongLivedStarts(selected, before, after, entry, parent), null);
});

test("empty parallel entry refuses polluted identity state instead of reporting no lifecycle", () => {
  const { before, after } = entered(0);
  const populated = entered(1).after;
  for (const candidate of [
    { ...after, scopeOccurrences: populated.scopeOccurrences },
    { ...after, activityOccurrences: populated.activityOccurrences },
    { ...after, parallelScopeControllers: populated.parallelScopeControllers! },
    { ...after, variables: { ...after.variables, scopes: populated.variables.scopes } },
    { ...after, scopeActivations: populated.scopeActivations },
  ]) assert.equal(candidateLongLivedStarts(program, before, candidate, entry, parent), null);
  const polluted = { ...before, parallelScopeControllers: populated.parallelScopeControllers! };
  assert.equal(candidateLongLivedStarts(program, polluted, { ...after, parallelScopeControllers: polluted.parallelScopeControllers }, entry, parent), null);
});

test("independent entry completeness rejects omitted, duplicated or altered E2 starts and misbound E1 scopes", () => {
  const { before, after } = entered(2);
  const result = publish(before, after);
  assert.ok(result);
  const record = result.records[0]!;
  const lifecycle = result.lifecycles[0]!;
  const first = lifecycle.started[0]!;
  for (const candidate of [
    { ...lifecycle, started: lifecycle.started.slice(1) },
    { ...lifecycle, started: [first, first] },
    { ...lifecycle, started: [{ ...first, processId: "Other" }, lifecycle.started[1]!] },
    { ...lifecycle, started: [{ ...first, elementId: "Other" }, lifecycle.started[1]!] },
    { ...lifecycle, started: [{ ...first, owner: { ...parent, activation: 2 } }, lifecycle.started[1]!] },
  ]) assert.throws(() => requireEntry(record, candidate), /complete lifecycle/u);
  const scope = record.positionDelta.enteredScopes[0]!;
  for (const positionDelta of [
    { ...record.positionDelta, enteredScopes: [scope, scope] },
    { ...record.positionDelta, enteredScopes: [{ ...scope, parent: null }] },
    { ...record.positionDelta, enteredScopes: [{ ...scope, id: { ...scope.id, definitionScopeId: "other" } }] },
    { ...record.positionDelta, exitedScopes: [scope] },
  ]) assert.throws(() => requireEntry({ ...record, positionDelta }, lifecycle), /complete lifecycle/u);
  const sequential = { ...entry, kind: Op.EnterSequentialMultiInstanceScope } as const;
  const selected = { ...program, operations: program.operations.map(operation => operation.id === entry.id ? sequential : operation) };
  assert.throws(() => requireEntry({ ...record, transition: { kind: SemanticTransitionKind.InternalOperation,
    operationId: entry.id, operationKind: sequential.kind, origin: entry.origin, owner: parent } }, lifecycle, selected), /complete lifecycle/u);
});


const { completeOrdinaryUserTask } = await import(new URL("../dist/semantic-process-user-task-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-user-task-runtime.ts");
const { completeParallelScopeEffect } = await import(new URL("../dist/parallel-scope-data.js", import.meta.url).href
) as typeof import("../src/parallel-scope-data.ts");
const { projectOpenFlowNodeOccurrences } = await import(new URL("../dist/flow-node-occurrence-open-set.js", import.meta.url).href
) as typeof import("../src/flow-node-occurrence-open-set.ts");
const body = (activation: number): ScopeOccurrenceId => ({ ...parent, definitionScopeId: "body", activation });
const completedBody = (activation: number) => ({ anchor: { kind: Anchor.Scope, id: body(activation) }, terminal: Terminal.Completed } as const);
function exactStep(selected: SemanticProcessProgram, state: RuntimeState, operationId: string, owner: ScopeOccurrenceId): RuntimeState {
  const next = applyInternalOperationOccurrence(selected, state, { operationId, owner });
  assert.ok(next, `${operationId} must execute for exact owner ${owner.definitionScopeId}/${owner.activation}`);
  return next;
}
function finishHuman(selected: SemanticProcessProgram, state: RuntimeState, activation: number, approved = false): RuntimeState {
  const wait = state.userTaskWaits.find(candidate => candidate.owner.definitionScopeId === "body" && candidate.owner.activation === activation);
  assert.ok(wait);
  const next = completeOrdinaryUserTask(selected, state, { kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `finish-${activation}`, taskId: wait.id,
    submittedValues: approved ? [{ name: "approved", value: { kind: VariableValueKind.Boolean, value: true } }] : [] });
  assert.ok(next);
  return exactStep(selected, next, "bodyEnd", body(activation));
}
function publishRetirement(selected: SemanticProcessProgram, before: RuntimeState, activation: number,
  expected: UnnumberedFlowNodeOccurrenceDelta["ended"]): RuntimeState {
  assert.ok(isWellFormedSemanticProcessProgram(selected), "positive retirement fixture must be structurally valid canonical IL");
  const operation = selected.operations.find(candidate => candidate.kind === Op.CompleteParallelMultiInstanceScope);
  assert.ok(operation);
  const after = exactStep(selected, before, operation.id, body(activation));
  const published = projectInternalExecutionBatch(selected, before,
    [{ operation, owner: body(activation), successor: after }], null, "start", 1);
  assert.ok(published, "successful exact-owner retirement must publish its singleton transition");
  const lifecycle = published.lifecycles[0]!;
  assert.deepEqual(lifecycle.started, []);
  const ordered = (ends: UnnumberedFlowNodeOccurrenceDelta["ended"]) => ends.map(end => JSON.stringify(end)).sort();
  assert.deepEqual(ordered(lifecycle.ended), ordered(expected));
  assert.deepEqual(published.records[0]!.positionDelta.enteredScopes, []);
  assert.deepEqual(published.records[0]!.positionDelta.exitedScopes.map(scope => scope.id.activation).sort((a, b) => a - b),
    expected.flatMap(end => end.anchor.kind === Anchor.Scope ? [end.anchor.id.activation] : []).sort((a, b) => a - b));
  const open = projectOpenFlowNodeOccurrences(selected, before);
  assert.ok(open);
  const check = (delta: UnnumberedFlowNodeOccurrenceDelta, record = published.records[0]!) =>
    requireCompleteFlowNodeOccurrenceLifecycles(selected,
      open.map(occurrence => ({ ...occurrence, attachedHandlers: [] })), "start", [external, record],
      [{ started: [], ended: [] }, delta]);
  assert.doesNotThrow(() => check(lifecycle));
  const first = lifecycle.ended[0]!;
  for (const delta of [
    { ...lifecycle, ended: lifecycle.ended.slice(1) },
    { ...lifecycle, ended: [...lifecycle.ended, first] },
    { ...lifecycle, ended: [{ ...first, terminal: first.terminal === Terminal.Completed ? Terminal.Cancelled : Terminal.Completed },
      ...lifecycle.ended.slice(1)] },
    { ...lifecycle, started: [open[0]!] },
  ]) assert.throws(() => check(delta), /complete lifecycle/u);
  const unrelated = open.find(occurrence => !lifecycle.ended.some(end => JSON.stringify(end.anchor) === JSON.stringify(occurrence.anchor)));
  if (unrelated !== undefined) assert.throws(() => check({ ...lifecycle,
    ended: [...lifecycle.ended, { anchor: unrelated.anchor, terminal: Terminal.Cancelled }] }), /complete lifecycle/u);
  const record = published.records[0]!;
  const exited = record.positionDelta.exitedScopes[0]!;
  for (const exitedScopes of [[], [...record.positionDelta.exitedScopes, exited],
    record.positionDelta.exitedScopes.map(scope => ({ ...scope, parent: { ...parent, activation: 2 } }))])
    assert.throws(() => check(lifecycle, { ...record, positionDelta: { ...record.positionDelta, exitedScopes } }), /complete lifecycle/u);
  const corruptedSuccessors: RuntimeState[] = [
    { ...after, logicalTimeMs: after.logicalTimeMs + 1 },
    { ...after, variables: { ...after.variables, process: { bindings: [{ name: "forged", value: { kind: VariableValueKind.String, value: "write" } }] } } },
    { ...after, parallelScopeControllers: before.parallelScopeControllers! },
  ];
  for (const successor of corruptedSuccessors) assert.equal(projectInternalExecutionBatch(selected, before,
    [{ operation, owner: body(activation), successor }], null, "start", 1), null);
  return after;
}

for (const [count, retiring] of [[1, 1], [2, 1], [2, 2]] as const)
  test(`parallel retirement publishes body ${retiring} of ${count} as a natural completion`, () => {
    let state = entered(count).after;
    for (let activation = 1; activation <= count; activation += 1) state = exactStep(program, state, "review", body(activation));
    for (let activation = 1; activation < retiring; activation += 1)
      state = exactStep(program, finishHuman(program, state, activation), "complete", body(activation));
    const before = finishHuman(program, state, retiring);
    const after = publishRetirement(program, before, retiring, [completedBody(retiring)]);
    assert.deepEqual(after.userTaskWaits, before.userTaskWaits);
    assert.equal(after.variables.scopes.length, count - retiring);
    assert.deepEqual(after.controlTokens, retiring === count ? [{ placeId: "out", owner: parent, multiplicity: 1 }] : []);
    assert.deepEqual(after.parallelScopeControllers?.map(({ total, completed }) => ({ total, completed })),
      retiring === count ? [] : [{ total: count, completed: retiring }]);
  });

test("parallel retirement with a true condition on the final body publishes completion without cancellation", () => {
  const selected = { ...program, operations: program.operations.map(operation => operation.id === entry.id
    ? { ...entry, completionBooleanName: "approved" } : operation) };
  const armed = exactStep(selected, entered(1, selected).after, "review", body(1));
  const before = finishHuman(selected, armed, 1, true);
  const after = publishRetirement(selected, before, 1, [completedBody(1)]);
  assert.deepEqual(after.parallelScopeControllers, []);
  assert.deepEqual(after.controlTokens, [{ placeId: "out", owner: parent, multiplicity: 1 }]);
  assert.deepEqual(after.variables.process, before.variables.process);
});

test("parallel retirement cancels pending sibling human and effect anchors while preserving unrelated work", () => {
  const fork = { kind: Op.Duplicate, id: "fork", origin: origin("Fork"), input: "check", outputs: ["human", "service"] } as const;
  const effect = { kind: Op.AwaitEffect, id: "service", origin: origin("Check"), input: "service", output: "serviceDone",
    effect: { elementId: "Check", descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "checkApplication" },
      inputMappings: [], outputMappings: [] }, bpmnErrorRoute: null } as const;
  const serviceEnd = { kind: Op.ReachNoneEnd, id: "serviceEnd", origin: origin("ServiceEnd"), input: "serviceDone" } as const;
  const unrelated = { kind: Op.AwaitUserTask, id: "unrelated", origin: origin("Unrelated"), input: "unrelatedIn", output: "unrelatedDone",
    task: { elementId: "Unrelated", name: "Unrelated work" } } as const;
  const rootFork = { kind: Op.Duplicate, id: "rootFork", origin: origin("RootFork"), input: "rootStart", outputs: ["in", "unrelatedIn"] } as const;
  const unrelatedEnd = { kind: Op.ReachNoneEnd, id: "unrelatedEnd", origin: origin("UnrelatedEnd"), input: "unrelatedDone" } as const;
  const added = [fork, effect, serviceEnd, unrelated, rootFork, unrelatedEnd];
  const rootOperations: ReadonlySet<string> = new Set([unrelated.id, rootFork.id, unrelatedEnd.id]);
  const places = ["human", "service", "serviceDone", "unrelatedIn", "unrelatedDone", "rootStart"];
  const selected = canonicalProgram({ ...program,
    operations: [...program.operations.map(operation => operation.id === entry.id ? { ...entry, completionBooleanName: "approved" }
      : operation.kind === Op.AwaitUserTask ? { ...operation, input: "human" }
      : operation.kind === Op.Initiate ? { ...operation, output: "rootStart" } : operation), ...added],
    operationScopes: [...program.operationScopes, ...added.map(operation => ({ operationId: operation.id,
      scopeId: rootOperations.has(operation.id) ? "root" : "body" }))],
    controlPlaces: [...program.controlPlaces, ...places.map(id => ({ id,
      origin: { kind: SemanticOriginKind.BpmnSequenceFlow as const, elementId: `Flow_${id}` } }))],
    controlPlaceScopes: [...program.controlPlaceScopes, ...places.map(controlPlaceId => ({ controlPlaceId,
      scopeId: controlPlaceId.startsWith("unrelated") || controlPlaceId === "rootStart" ? "root" : "body" }))],
  });
  const initial = entered(2, selected).before;
  let state = exactStep(selected, { ...initial, controlTokens: [{ placeId: "rootStart", owner: parent, multiplicity: 1 }] }, rootFork.id, parent);
  state = exactStep(selected, state, entry.id, parent);
  state = exactStep(selected, state, unrelated.id, parent);
  for (const activation of [1, 2]) {
    state = exactStep(selected, state, fork.id, body(activation));
    state = exactStep(selected, state, "review", body(activation));
    state = exactStep(selected, state, effect.id, body(activation));
  }
  const siblingHuman = state.userTaskWaits.find(wait => wait.owner.definitionScopeId === "body" && wait.owner.activation === 2)!;
  const siblingEffect = state.effectWaits.find(wait => wait.owner.activation === 2)!;
  const unrelatedWait = state.userTaskWaits.find(wait => wait.owner.definitionScopeId === "root")!;
  state = finishHuman(selected, state, 1, true);
  assert.equal(applyInternalOperationOccurrence(selected, state, { operationId: "complete", owner: body(1) }), null);
  const selectedEffect = state.effectWaits.find(wait => wait.owner.activation === 1)!;
  const finished = completeParallelScopeEffect(selected, state, selectedEffect.id, { kind: EffectExecutionResultKind.Success, localPatch: [] });
  assert.ok(finished);
  const before = exactStep(selected, finished, serviceEnd.id, body(1));
  const after = publishRetirement(selected, before, 1, [completedBody(1),
    { anchor: { kind: Anchor.Scope, id: body(2) }, terminal: Terminal.Cancelled },
    { anchor: { kind: Anchor.Wait, id: siblingHuman.id }, terminal: Terminal.Cancelled },
    { anchor: { kind: Anchor.Wait, id: siblingEffect.id }, terminal: Terminal.Cancelled },
  ]);
  assert.deepEqual(after.userTaskWaits, [unrelatedWait]);
  assert.deepEqual(after.effectWaits, []);
  assert.deepEqual(after.variables.scopes, []);
  assert.deepEqual(after.variables.activities, []);
  assert.deepEqual(after.variables.process, before.variables.process);
  assert.deepEqual(after.parallelScopeControllers, []);
  assert.deepEqual(after.controlTokens, [{ placeId: "out", owner: parent, multiplicity: 1 }]);
  assert.deepEqual([after.taskActivations, after.effectActivations, after.scopeActivations, after.activityActivations],
    [before.taskActivations, before.effectActivations, before.scopeActivations, before.activityActivations]);
});


test("parallel retirement publication refuses malformed pairing and complete-population facts", () => {
  let state = entered(2).after;
  for (const activation of [1, 2]) state = exactStep(program, state, "review", body(activation));
  const before = finishHuman(program, state, 1);
  const after = exactStep(program, before, "complete", body(1));
  const operation = program.operations.find(candidate => candidate.kind === Op.CompleteParallelMultiInstanceScope)!;
  const project = (selected: SemanticProcessProgram, predecessor: RuntimeState, owner = body(1)) =>
    projectInternalExecutionBatch(selected, predecessor, [{ operation, owner, successor: after }], null, "start", 1);
  for (const predecessor of [
    { ...before, parallelScopeControllers: [] },
    { ...before, parallelScopeControllers: [...before.parallelScopeControllers!, ...before.parallelScopeControllers!] },
    { ...before, scopeOccurrences: before.scopeOccurrences.filter(scope => scope.id.definitionScopeId !== "body" || scope.id.activation === 1) },
    { ...before, variables: { ...before.variables, scopes: before.variables.scopes.filter(frame => frame.owner.activation === 1) } },
    { ...before, scopeOccurrences: before.scopeOccurrences.map(scope => scope.id.definitionScopeId === "body" && scope.id.activation === 2
      ? { ...scope, parent: { ...parent, activation: 2 } } : scope) },
  ]) assert.equal(project(program, predecessor), null);
  for (const selected of [
    { ...program, operations: [...program.operations, entry] },
    { ...program, operations: [...program.operations, { ...operation, id: "second-completion" }] },
    { ...program, operations: program.operations.map(candidate => candidate.id === entry.id ? { ...entry, origin: origin("Other") } : candidate) },
    { ...program, definitionScopes: program.definitionScopes.map(scope => scope.id === "body" ? { ...scope, parentScopeId: "other" } : scope) },
  ]) assert.equal(project(selected, before), null);
  assert.equal(project(program, before, body(2)), null);
  assert.equal(project(program, before, body(3)), null);
});

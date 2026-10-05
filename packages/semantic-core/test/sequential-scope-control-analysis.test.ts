import assert from "node:assert/strict";
import { test } from "node:test";
import { ControlStateKind, StimulusKind, VariableValueKind, initialState, applyInternalOperationStep, InternalSchedulingMode, SemanticOperationKind as Op, SemanticOriginKind } from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { program as base } from "./embedded-subprocess-fixture.ts";
const { analyzeSequentialScopeControl: analyze } = await import(new URL("../dist/sequential-scope-control-analysis.js", import.meta.url).href) as typeof import("../src/sequential-scope-control-analysis.ts");
const profile = "cibseven-2.2.0-sequential-multi-instance-subprocess-draft";
const origin = (elementId: string) => ({ kind: SemanticOriginKind.BpmnElement, elementId } as const);
function fanout(count: number, before = 0, after = 0): SemanticProcessProgram {
  const root: SemanticOperation[] = [{ kind: Op.Initiate, id: "start", origin: origin("Start"), output: before === 0 ? "incoming" : "before0" }];
  for (const [prefix, length, terminal] of [["before", before, "incoming"], ["after", after, "outgoing"]] as const) {
    for (let index = 0; index < length; index++) root.push({ kind: Op.AwaitUserTask, id: `${prefix}Task${index}`,
      origin: origin(`${prefix}Task${index}`), task: { elementId: `${prefix}Task${index}`, name: null },
      input: `${prefix}${index}`, output: index + 1 === length ? terminal : `${prefix}${index + 1}` });
  }
  root.push({ kind: Op.EnterSequentialMultiInstanceScope, id: "enter", origin: origin("Batch"),
    input: "incoming", childEntry: "body-entry", childScopeId: "body", normalOutput: after === 0 ? "outgoing" : "after0",
    collectionName: "items", itemName: "item", bodyInputs: [], completionBooleanName: null },
  { kind: Op.ReachNoneEnd, id: "end", origin: origin("End"), input: "outgoing" },
  { kind: Op.CompleteScope, id: "root-complete", origin: origin("P"), scopeId: "root", parentOutput: null });
  const child: SemanticOperation[] = [
    { kind: Op.Duplicate, id: "fork", origin: origin("Fork"), input: "body-entry", outputs: Array.from({ length: count }, (_, i) => `task-in${i}`) },
    ...Array.from({ length: count }, (_, i): SemanticOperation => ({ kind: Op.AwaitUserTask, id: `task${i}`,
      origin: origin(`Review${i}`), task: { elementId: `Review${i}`, name: null }, input: `task-in${i}`, output: `join-in${i}` })),
    { kind: Op.Synchronize, id: "join", origin: origin("Join"), inputs: Array.from({ length: count }, (_, i) => `join-in${i}`), output: "body-end" },
    { kind: Op.ReachNoneEnd, id: "child-end", origin: origin("ChildEnd"), input: "body-end" },
    { kind: Op.CompleteSequentialMultiInstanceScope, id: "complete", origin: origin("Batch"), entryOperationId: "enter" },
  ];
  const rootPlaces = ["incoming", "outgoing", ...Array.from({ length: before }, (_, i) => `before${i}`), ...Array.from({ length: after }, (_, i) => `after${i}`)];
  const childPlaces = ["body-entry", "body-end", ...Array.from({ length: count }, (_, i) => `task-in${i}`), ...Array.from({ length: count }, (_, i) => `join-in${i}`)];
  return { ...base, identity: { ...base.identity, semanticProfile: profile }, processId: "P",
    internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
    definitionScopes: [{ id: "root", parentScopeId: null, originElementId: "P" }, { id: "body", parentScopeId: "root", originElementId: "Batch" }],
    operations: [...root, ...child],
    operationScopes: [...root.map(({ id }) => ({ operationId: id, scopeId: "root" })), ...child.map(({ id }) => ({ operationId: id, scopeId: "body" }))],
    controlPlaces: [...rootPlaces, ...childPlaces].map(id => ({ id, origin: { kind: SemanticOriginKind.BpmnSequenceFlow as const, elementId: id } })),
    controlPlaceScopes: [...rootPlaces.map(id => ({ controlPlaceId: id, scopeId: "root" })), ...childPlaces.map(id => ({ controlPlaceId: id, scopeId: "body" }))],
  };
}

test("MI admission counts turnover and the next body within one automatic burst", () => {
  assert.deepEqual(analyze(fanout(4)), { entryOperationId: "enter", childScopeId: "body", maximumBurst: 8 });
  assert.equal(analyze(fanout(5)), undefined);
});

test("serial parent waits bound resumptions without imposing a task-count limit", () => {
  const program = fanout(4, 40, 40);
  assert.equal(analyze(program)?.maximumBurst, 8);
  assert.deepEqual(analyze({ ...program, operations: [...program.operations].reverse(), operationScopes: [...program.operationScopes].reverse() }), analyze(program));
});

test("MI control admission rejects scope escapes, competing completion and unsupported parent branching", () => {
  const program = fanout(3);
  assert.ok(analyze(program));
  assert.equal(analyze({ ...program, operationScopes: program.operationScopes.map(owner => owner.operationId === "task0" ? { ...owner, scopeId: "root" } : owner) }), undefined);
  assert.equal(analyze({ ...program, operations: program.operations.map(operation => operation.id === "complete" ?
    { id: operation.id, kind: Op.CompleteScope, origin: origin("Batch"), scopeId: "body", parentOutput: "outgoing" } : operation) }), undefined);
  assert.equal(analyze({ ...program, operationScopes: program.operationScopes.map(owner => owner.operationId === "fork" ? { ...owner, scopeId: "root" } : owner) }), undefined);
});

const { completeOrdinaryUserTask } = await import(new URL("../dist/semantic-process-user-task-runtime.js", import.meta.url).href) as typeof import("../src/semantic-process-user-task-runtime.ts");

// SMIS-ADMIT-01 is checked against real IL steps; the probe deliberately executes rejected oversized bodies.
function executedMaximum(program: SemanticProcessProgram, items: readonly string[]): number {
  const parent = { processInstanceId: "batch", definitionScopeId: "root", activation: 1 };
  let state: RuntimeState = { ...initialState, control: { kind: ControlStateKind.Running, instanceId: "batch" },
    initiationPending: true, scopeOccurrences: [{ id: parent, parent: null }], scopeActivations: [{ elementId: "root", count: 1 }],
    variables: { ...initialState.variables, process: { bindings: [{ name: "items", value: { kind: VariableValueKind.StringList, value: items } }] } } };
  function settle(): number {
    for (let steps = 0; steps < 32; steps++) {
      const step = program.operations.map(operation => applyInternalOperationStep(program, operation, state)).find(value => value !== null);
      if (step === undefined) return steps;
      state = step.successor;
    }
    throw new Error("fixture failed to reach a stable frontier");
  }
  let maximum = settle();
  let commands = 0;
  while (state.userTaskWaits.length > 0) {
    assert.ok(commands++ < 200, "fixture must terminate");
    const after = completeOrdinaryUserTask(program, state, { kind: StimulusKind.CompleteUserTaskInstance,
      commandId: `complete-${commands}`, taskId: state.userTaskWaits[0]!.id, submittedValues: [] });
    assert.ok(after);
    state = after;
    maximum = Math.max(maximum, settle());
  }
  assert.equal(state.control.kind, ControlStateKind.Completed);
  return maximum;
}

test("composed admission bound agrees with actual entry, turnover and parent continuation steps", () => {
  for (const branches of [2, 3, 4, 5]) {
    for (const [before, after] of [[0, 0], [1, 0], [0, 1], [2, 2]] as const) {
      const program = fanout(branches, before, after);
      const maximum = Math.max(executedMaximum(program, []), executedMaximum(program, ["first"]), executedMaximum(program, ["first", "second"]));
      const analysis = analyze(program);
      if (maximum <= 8) assert.equal(analysis?.maximumBurst, maximum);
      else assert.equal(analysis, undefined);
    }
  }
});

function separateEnds(count: number): SemanticProcessProgram {
  const program = fanout(count);
  const ends: SemanticOperation[] = Array.from({ length: count }, (_, index) => ({
    kind: Op.ReachNoneEnd, id: `branch-end${index}`, origin: origin(`BranchEnd${index}`), input: `join-in${index}`,
  }));
  return { ...program,
    operations: [...program.operations.filter(operation => operation.id !== "join" && operation.id !== "child-end"), ...ends],
    operationScopes: [...program.operationScopes.filter(owner => owner.operationId !== "join" && owner.operationId !== "child-end"),
      ...ends.map(({ id }) => ({ operationId: id, scopeId: "body" }))],
    controlPlaces: program.controlPlaces.filter(place => place.id !== "body-end"),
    controlPlaceScopes: program.controlPlaceScopes.filter(owner => owner.controlPlaceId !== "body-end"),
  };
}

function nestedWithFinalReview(): SemanticProcessProgram {
  const program = fanout(2);
  const added: SemanticOperation[] = [
    { kind: Op.Duplicate, id: "nested-fork", origin: origin("NestedFork"), input: "task-in0", outputs: ["nested-in0", "nested-in1"] },
    ...[0, 1].map((index): SemanticOperation => ({ kind: Op.AwaitUserTask, id: `nested-task${index}`, origin: origin(`NestedReview${index}`),
      task: { elementId: `NestedReview${index}`, name: null }, input: `nested-in${index}`, output: `nested-out${index}` })),
    { kind: Op.Synchronize, id: "nested-join", origin: origin("NestedJoin"), inputs: ["nested-out0", "nested-out1"], output: "join-in0" },
    { kind: Op.AwaitUserTask, id: "confirm", origin: origin("Confirm"), task: { elementId: "Confirm", name: null }, input: "body-end", output: "confirmed" },
  ];
  const places = ["nested-in0", "nested-in1", "nested-out0", "nested-out1", "confirmed"];
  return { ...program,
    operations: [...program.operations.filter(operation => operation.id !== "task0").map(operation => operation.id === "child-end" ?
      { ...operation, input: "confirmed" } : operation), ...added],
    operationScopes: [...program.operationScopes.filter(owner => owner.operationId !== "task0"), ...added.map(({ id }) => ({ operationId: id, scopeId: "body" }))],
    controlPlaces: [...program.controlPlaces, ...places.map(id => ({ id, origin: { kind: SemanticOriginKind.BpmnSequenceFlow as const, elementId: id } }))],
    controlPlaceScopes: [...program.controlPlaceScopes, ...places.map(id => ({ controlPlaceId: id, scopeId: "body" }))],
  };
}

test("separate Ends and nested parallel regions use quiescence rather than an invented join", () => {
  for (const program of [separateEnds(5), nestedWithFinalReview()]) {
    const actual = executedMaximum(program, ["first", "second"]);
    assert.ok(actual <= 8);
    assert.equal(analyze(program)?.maximumBurst, actual);
  }
  assert.equal(analyze(separateEnds(6)), undefined);
});

const { isWellFormedSemanticProcessProgram } = await import(new URL("../dist/semantic-process-admission.js", import.meta.url).href) as typeof import("../src/semantic-process-admission.ts");
test("control analysis alone does not admit the private profile for execution", () => {
  const program = fanout(4);
  assert.ok(analyze(program));
  assert.equal(isWellFormedSemanticProcessProgram(program), false);
});

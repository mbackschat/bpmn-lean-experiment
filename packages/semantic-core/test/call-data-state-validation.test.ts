import assert from "node:assert/strict";
import test from "node:test";
import { ActivityBodyKind, applyInternalOperation, CommandOutcome, initialState, LocalDataOwnerKind, SemanticOperationKind, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { RuntimeState, VariableBinding, VariableValue } from "@bpmn-lean/semantic-core";
import { callActivityStart } from "./call-activity-fixture.ts";
import { data, program } from "./call-data-fixture.ts";

const { admit } = await import(new URL("../dist/semantic-command-admission.js", import.meta.url).href) as typeof import("../src/semantic-command-admission.ts");
const stringValue = (value: string): VariableValue => ({ kind: VariableValueKind.String, value });
const initialBindings = (value: VariableValue): readonly VariableBinding[] => [
  { name: "Request", value }, { name: "Result", value: stringValue("before-return") }, { name: "Unused", value: stringValue("untouched") },
];

function step(state: RuntimeState, kind: SemanticOperationKind, elementId?: string): RuntimeState {
  const operation = program.operations.find((candidate) => candidate.kind === kind && (elementId === undefined || candidate.origin.elementId === elementId));
  assert.ok(operation !== undefined);
  const next = applyInternalOperation(program, operation, state);
  assert.ok(next !== null, `raw ${kind} must execute`);
  return next;
}

function complete(state: RuntimeState, elementId: string, value: VariableValue) {
  const wait = state.userTaskWaits.find(({ id }) => id.elementId === elementId);
  assert.ok(wait !== undefined);
  return admit(program, state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}`, taskId: wait.id,
    submittedValues: [{ name: `${elementId}_output`, value }] });
}

function calledWait(value = stringValue("supplier")): RuntimeState {
  const started = admit(program, initialState, callActivityStart(initialBindings(value)));
  assert.equal(started.outcome, CommandOutcome.Committed);
  return step(step(step(started.state, SemanticOperationKind.Initiate), SemanticOperationKind.InvokeProcess),
    SemanticOperationKind.AwaitDataInputOutputUserTask, "Task_Called");
}

for (const mutation of ["extra input", "premature output"] as const) {
  test(`command admission refuses ${mutation} in the called interface without mutation`, () => {
    const before = calledWait();
    const malformed: RuntimeState = { ...before, variables: { ...before.variables,
      processInterfaces: before.variables.processInterfaces.map((scope) => mutation === "extra input"
        ? { ...scope, inputs: [...scope.inputs, { name: "Undeclared", value: stringValue("extra") }] }
        : { ...scope, outputs: [{ name: data.called.output.id, value: stringValue("premature") }] }) } };
    const snapshot = structuredClone(malformed);
    assert.deepEqual(complete(malformed, "Task_Called", stringValue("approved")), { outcome: CommandOutcome.Rejected, state: malformed });
    assert.deepEqual(malformed, snapshot);
  });
}

const { callDataStateIsValid } = await import(new URL("../dist/call-data-state-validation.js", import.meta.url).href) as typeof import("../src/call-data-state-validation.ts");

function rawTrace(value: VariableValue): readonly RuntimeState[] {
  const states: RuntimeState[] = [initialState];
  const started = admit(program, initialState, callActivityStart(initialBindings(value)));
  assert.equal(started.outcome, CommandOutcome.Committed);
  let current = started.state;
  states.push(current);
  for (const [kind, element] of [
    [SemanticOperationKind.Initiate], [SemanticOperationKind.InvokeProcess],
    [SemanticOperationKind.AwaitDataInputOutputUserTask, "Task_Called"],
  ] as const) { current = step(current, kind, element); states.push(current); }
  const calledCompletion = complete(current, "Task_Called", value);
  assert.equal(calledCompletion.outcome, CommandOutcome.Committed);
  current = calledCompletion.state;
  states.push(current);
  for (const [kind, element] of [
    [SemanticOperationKind.ReachNoneEnd, "End_Called"], [SemanticOperationKind.ReturnProcess],
    [SemanticOperationKind.AwaitDataInputOutputUserTask, "Task_Caller"],
  ] as const) { current = step(current, kind, element); states.push(current); }
  const callerCompletion = complete(current, "Task_Caller", value);
  assert.equal(callerCompletion.outcome, CommandOutcome.Committed);
  current = callerCompletion.state;
  states.push(current);
  current = step(current, SemanticOperationKind.ReachNoneEnd, "End_Caller"); states.push(current);
  current = step(current, SemanticOperationKind.CompleteScope); states.push(current);
  assert.equal(current.control.kind, "completed");
  return states;
}

for (const value of [stringValue("supplier"), { kind: VariableValueKind.Null }] as const) {
  test(`family validity preserves every actual raw ${value.kind} supplier microstep and admitted command`, () => {
    for (const [index, state] of rawTrace(value).entries()) {
      assert.equal(callDataStateIsValid(program, state), true, `trace index ${index}`);
    }
  });
}

test("family validity rejects independent interface, association, task-local and caller-data mutations", () => {
  const before = calledWait();
  const iface = before.variables.processInterfaces[0];
  const record = before.calledProcessOccurrences[0];
  const activity = before.activityOccurrences[0];
  const local = before.variables.activities[0];
  const wait = before.userTaskWaits[0];
  const firstCallerBinding = before.variables.process.bindings[0];
  assert.ok(iface !== undefined && record !== undefined && activity !== undefined && local !== undefined && wait !== undefined && firstCallerBinding !== undefined);
  const interfaces = (processInterfaces: RuntimeState["variables"]["processInterfaces"]): RuntimeState => ({ ...before, variables: { ...before.variables, processInterfaces } });
  const locals = (activities: RuntimeState["variables"]["activities"]): RuntimeState => ({ ...before, variables: { ...before.variables, activities } });
  const callerBindings = (bindings: readonly VariableBinding[]): RuntimeState => ({ ...before, variables: { ...before.variables, process: { bindings } } });
  const mutations: ReadonlyArray<readonly [string, RuntimeState]> = [
    ["missing interface", interfaces([])],
    ["duplicate interface", interfaces([iface, { ...iface, inputs: [] }])],
    ["orphan interface", interfaces([iface, { ...iface, owner: { ...iface.owner, processInstanceId: "orphan" } }])],
    ["wrong interface instance", interfaces([{ ...iface, owner: { ...iface.owner, processInstanceId: "foreign" } }])],
    ["wrong interface scope", interfaces([{ ...iface, owner: { ...iface.owner, definitionScopeId: "foreign" } }])],
    ["wrong interface activation", interfaces([{ ...iface, owner: { ...iface.owner, activation: 2 } }])],
    ["missing input", interfaces([{ ...iface, inputs: [] }])],
    ["extra input", interfaces([{ ...iface, inputs: [...iface.inputs, { name: "Undeclared", value: stringValue("extra") }] }])],
    ["duplicate input", interfaces([{ ...iface, inputs: [...iface.inputs, ...iface.inputs] }])],
    ["wrong input port", interfaces([{ ...iface, inputs: [{ name: "Wrong", value: stringValue("wrong") }] }])],
    ["non-scalar input", interfaces([{ ...iface, inputs: [{ name: data.called.input.id, value: { kind: VariableValueKind.Boolean, value: true } }] }])],
    ["premature output", interfaces([{ ...iface, outputs: [{ name: data.called.output.id, value: { kind: VariableValueKind.Null } }] }])],
    ["missing Call", { ...before, calledProcessOccurrences: [] }],
    ["duplicate Call", { ...before, calledProcessOccurrences: [record, record] }],
    ["missing Call counter", { ...before, callActivations: [] }],
    ["duplicate Call counter", { ...before, callActivations: [...before.callActivations, ...before.callActivations] }],
    ["zero Call counter", { ...before, callActivations: [{ elementId: record.id.elementId, count: 0 }] }],
    ["future Call counter", { ...before, callActivations: [{ elementId: record.id.elementId, count: 2 }] }],
    ["wrong return", { ...before, calledProcessOccurrences: [{ ...record, returnOperationId: "wrong" }] }],
    ["wrong called Process", { ...before, calledProcessOccurrences: [{ ...record, calledProcessId: "wrong" }] }],
    ["wrong Call element", { ...before, calledProcessOccurrences: [{ ...record, id: { ...record.id, elementId: "wrong" } }] }],
    ["missing called root", { ...before, scopeOccurrences: before.scopeOccurrences.filter(({ id }) => id.processInstanceId !== iface.owner.processInstanceId) }],
    ["missing local", locals([])],
    ["orphan local", locals([local, { ...local, owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id: { ...activity.id, activation: 2 } } }])],
    ["wrong local port", locals([{ ...local, bindings: [{ name: "Wrong", value: stringValue("wrong") }] }])],
    ["non-scalar local", locals([{ ...local, bindings: [{ name: "Task_Called_input", value: { kind: VariableValueKind.Integer, value: 1 } }] }])],
    ["duplicate local", locals([local, local])],
    ["missing Activity", { ...before, activityOccurrences: [] }],
    ["wrong Activity operation", { ...before, activityOccurrences: [{ ...activity, operationId: "wrong" }] }],
    ["wrong wait owner", { ...before, userTaskWaits: [{ ...wait, owner: record.caller }] }],
    ["hosting task alias", { ...before,
      userTaskWaits: [{ ...wait, id: { ...wait.id, processInstanceId: record.caller.processInstanceId }, owner: record.caller }],
      activityOccurrences: [{ ...activity, owner: record.caller, id: { ...activity.id, processInstanceId: record.caller.processInstanceId },
        body: { kind: ActivityBodyKind.UserTask, task: { ...wait.id, processInstanceId: record.caller.processInstanceId } } }],
      variables: { ...before.variables, activities: [{ ...local, owner: { kind: LocalDataOwnerKind.ActivityOccurrence,
        id: { ...activity.id, processInstanceId: record.caller.processInstanceId } } }] },
    }],
    ["wrong wait scope", { ...before, userTaskWaits: [{ ...wait, owner: { ...wait.owner, definitionScopeId: "wrong" } }] }],
    ["wrong wait activation owner", { ...before, userTaskWaits: [{ ...wait, owner: { ...wait.owner, activation: 2 } }] }],
    ["wrong wait output", { ...before, userTaskWaits: [{ ...wait, output: "wrong" }] }],
    ["zero live-task counter", { ...before, taskActivations: [] }],
    ["duplicate task counter", { ...before, taskActivations: [...before.taskActivations, ...before.taskActivations] }],
    ["missing request", callerBindings(before.variables.process.bindings.filter(({ name }) => name !== "Request"))],
    ["undeclared caller binding", callerBindings([...before.variables.process.bindings, { name: "zzzUnknown", value: stringValue("secret") }])],
    ["duplicate caller binding", callerBindings([firstCallerBinding, ...before.variables.process.bindings])],
    ["unordered caller binding", callerBindings([...before.variables.process.bindings].reverse())],
    ["non-scalar caller binding", callerBindings([{ name: "Request", value: { kind: VariableValueKind.Integer, value: 1 } }])],
  ];
  for (const [label, state] of mutations) {
    const snapshot = structuredClone(state);
    assert.equal(callDataStateIsValid(program, state), false, label);
    const result = admit(program, state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: label, taskId: wait.id,
      submittedValues: [{ name: "Task_Called_output", value: stringValue("approved") }] });
    assert.deepEqual(result, { outcome: CommandOutcome.Rejected, state }, label);
    assert.deepEqual(state, snapshot, label);
  }
});

test("required output remains present after called completion until exact return", () => {
  const completed = complete(calledWait(), "Task_Called", { kind: VariableValueKind.Null });
  assert.equal(completed.outcome, CommandOutcome.Committed);
  for (const state of [completed.state, step(completed.state, SemanticOperationKind.ReachNoneEnd, "End_Called")]) {
    const iface = state.variables.processInterfaces[0];
    assert.ok(iface !== undefined);
    for (const outputs of [[],
      [{ name: "Wrong", value: { kind: VariableValueKind.Null } }],
      [{ name: data.called.output.id, value: { kind: VariableValueKind.Boolean, value: true } }],
      [...iface.outputs, ...iface.outputs],
    ] as const) assert.equal(callDataStateIsValid(program, { ...state, variables: { ...state.variables,
      processInterfaces: [{ ...iface, outputs }] } }), false);
  }
});

test("prestart and terminal state forbid retained interface data, while other profiles preserve their own contract", () => {
  const called = calledWait();
  const terminal = rawTrace(stringValue("supplier")).at(-1);
  assert.ok(terminal !== undefined);
  for (const state of [initialState, terminal]) {
    const malformed = { ...state, variables: { ...state.variables, processInterfaces: called.variables.processInterfaces } };
    assert.equal(callDataStateIsValid(program, malformed), false);
    assert.equal(callDataStateIsValid({ ...program, identity: { ...program.identity, semanticProfile: "unrelated-profile" } }, malformed), true);
  }
  assert.equal(callDataStateIsValid(program, { ...initialState, variables: { ...initialState.variables,
    process: { bindings: initialBindings(stringValue("too early")) } } }), false);
});

for (const [label, patch] of [
  ["logical time", { logicalTimeMs: 5 }],
  ["Call activation", { callActivations: [{ elementId: "Call:é", count: 1 }] }],
  ["End history", { endOccurrences: 1 }],
  ...(["taskActivations", "messageActivations", "timerActivations", "eventRaceActivations", "effectActivations", "scopeActivations", "activityActivations"] as const)
    .map((field) => [field, { [field]: [{ elementId: "prior", count: 1 }] }] as const),
] satisfies ReadonlyArray<readonly [string, Partial<RuntimeState>]>) {
  test(`private Call start refuses prior ${label} without mutation`, () => {
    const state: RuntimeState = { ...initialState, ...patch };
    const snapshot = structuredClone(state);
    const result = admit(program, state, callActivityStart(initialBindings(stringValue("supplier"))));
    assert.equal(result.outcome, CommandOutcome.Rejected);
    assert.equal(result.state, state);
    assert.deepEqual(state, snapshot);
    assert.equal(callDataStateIsValid(program, state), false);
    assert.equal(callDataStateIsValid({ ...program, identity: { ...program.identity, semanticProfile: "unrelated-profile" } }, state), true);
  });
}

test("pristine Call start accepts reordered cloned state fields", () => {
  const state = Object.fromEntries(Object.entries(structuredClone(initialState)).reverse()) as RuntimeState;
  assert.equal(callDataStateIsValid(program, state), true);
  assert.equal(admit(program, state, callActivityStart(initialBindings({ kind: VariableValueKind.Null }))).outcome, CommandOutcome.Committed);
});

test("pristine Call state retains the initial absence of other families' optional storage", () => {
  for (const field of ["sequentialMultiInstanceControllers", "parallelMultiInstanceControllers", "compensationActivityRetentions",
    "compensationParentContextRetentions", "compensationTriggers", "compensationHandlerEffectWaits"] as const) {
    const state = { ...initialState, [field]: [] };
    assert.equal(callDataStateIsValid(program, state), false, field);
    const result = admit(program, state, callActivityStart(initialBindings(stringValue("supplier"))));
    assert.deepEqual(result, { outcome: CommandOutcome.Rejected, state }, field);
    assert.equal(result.state, state, field);
  }
});

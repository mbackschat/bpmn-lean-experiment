/**
 * Locks the profile boundaries of the structured effect-data amendment: existing profiles keep refusing a structured
 * value, the profile admits no User Task, restoration rechecks every carried value, and committed state, Activity-local
 * scope, open snapshots and public projections never share structure with caller-owned data (PBV-COPY-01).
 *
 * Restoration and aliasing are exercised on raw state because no public command reaches them in this profile.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { BpmnCompilationStatus } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, SemanticProfileId, StimulusKind, VariableValueKind, applyStimulus,
  applyStimulusWithTrace, initialState, observeStableState, replayCommittedTransitions,
  runtimeStateCarriesOnlyProfilePortableValues,
} from "@bpmn-lean/semantic-core";
import type { EffectOccurrenceId, RuntimeState, SemanticProcessProgram, Stimulus, VariableBinding, VariableValue } from "@bpmn-lean/semantic-core";
import {
  assessment, chainXml, compileCredit, creditNames, creditTasks, creditXml, effectDataProfile, list, nothing, protocol, text,
} from "./effect-data-fixture.ts";
import { compile as compileSerial, profile as serialProfile } from "./serial-business-task-fixture.ts";

const binding = (name: string, value: VariableValue): VariableBinding => ({ name, value });
const names = creditNames;

async function program(): Promise<SemanticProcessProgram> {
  const compiled = await compileCredit(creditXml());
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("unreachable");
  return compiled.semanticProcess;
}

const start: Stimulus = {
  kind: StimulusKind.StartProcess, commandId: "start", processId: names.processId, instanceId: "credit-1",
  initialVariables: [binding(names.applicant, text("A-17"))],
};

const complete = (effectId: EffectOccurrenceId, patch: readonly VariableBinding[]): Stimulus => ({
  kind: StimulusKind.CompleteEffect, commandId: "complete", effectId,
  result: { kind: EffectExecutionResultKind.Success, localPatch: patch },
});

function committed(p: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(p, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

/** The state with the structured assessment open as the Notify argument snapshot. */
async function atNotify(patch: VariableValue = assessment()): Promise<{ p: SemanticProgram; state: RuntimeState }> {
  const p = await program();
  const atAssess = committed(p, initialState, start);
  return { p, state: committed(p, atAssess, complete(atAssess.effectWaits[0]!.id, [binding(names.assessed, patch)])) };
}
type SemanticProgram = SemanticProcessProgram;

type Tamperable = { kind: string; value?: unknown; name?: string };

/** Mutates a value in place at every node so any shared storage with a protected copy changes it. */
function tamper(value: VariableValue): void {
  const node = value as unknown as Tamperable;
  switch (node.kind) {
    case VariableValueKind.List:
      (node.value as VariableValue[]).forEach(tamper);
      (node.value as VariableValue[]).push({ kind: VariableValueKind.Null });
      return;
    case VariableValueKind.Map:
      (node.value as Array<{ name: string; value: VariableValue }>).forEach((entry) => tamper(entry.value));
      (node.value as Array<{ name: string; value: VariableValue }>).push({ name: "zz-tampered", value: { kind: VariableValueKind.Null } });
      return;
    case VariableValueKind.String:
      node.value = "tampered";
      return;
    case VariableValueKind.Integer:
      node.value = 424_242;
      return;
    case VariableValueKind.Boolean:
      node.value = !(node.value as boolean);
      return;
    case VariableValueKind.Decimal:
      (node as unknown as { coefficient: string }).coefficient = "999";
      return;
    default:
      node.kind = VariableValueKind.String;
  }
}

test("the profile admits no User Task", async () => {
  const userTask = `<userTask id="Review"/>`;
  const [assess, notify] = creditTasks(names);
  for (const tasks of [[{ id: "Review", xml: userTask }, assess, notify], [assess, { id: "Review", xml: userTask }, notify],
    [assess, notify, { id: "Review", xml: userTask }]]) {
    const compiled = await compileCredit(chainXml(names, tasks));
    assert.equal(compiled.status, BpmnCompilationStatus.Rejected);
  }
  assert.equal((await compileCredit(creditXml())).status, BpmnCompilationStatus.Accepted);
});

test("a chain without a Service Task and an unhandled Service Task are refused", async () => {
  assert.equal((await compileCredit(chainXml(names, []))).status, BpmnCompilationStatus.Rejected);
  const unhandled = await compileCredit(creditXml(), names, effectDataProfile, [names.assessHandler]);
  assert.equal(unhandled.status, BpmnCompilationStatus.Rejected);
});

test("the serial business-task profile refuses the same structured result and a structured restored argument", async () => {
  const xml = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" targetNamespace="urn:invoice">
    <process id="Invoice" isExecutable="true"><startEvent id="Start"/><userTask id="Review"/>
    <serviceTask id="Validate" implementation="${protocol}" camunda:asyncBefore="true" camunda:delegateExpression="\${invoiceValidator}"><extensionElements><camunda:inputOutput>
    <camunda:inputParameter name="payload">\${request}</camunda:inputParameter><camunda:outputParameter name="decision">\${result}</camunda:outputParameter></camunda:inputOutput></extensionElements></serviceTask>
    <endEvent id="End"/><sequenceFlow id="F0" sourceRef="Start" targetRef="Review"/><sequenceFlow id="F1" sourceRef="Review" targetRef="Validate"/>
    <sequenceFlow id="F2" sourceRef="Validate" targetRef="End"/></process></definitions>`;
  const compiled = await compileSerial(xml);
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) return;
  const p = compiled.semanticProcess;
  assert.equal(p.identity.semanticProfile, serialProfile);
  const started = committed(p, initialState, { kind: StimulusKind.StartProcess, commandId: "s", processId: "Invoice", instanceId: "i",
    initialVariables: [binding("request", text("reviewed"))] });
  const atEffect = committed(p, started, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "h", taskId: started.userTaskWaits[0]!.id, submittedValues: [] });
  const result = applyStimulus(p, atEffect, complete(atEffect.effectWaits[0]!.id, [binding("result", assessment())]));
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.deepEqual(result.state, atEffect);

  const { state } = await atNotify();
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(effectDataProfile, state), true);
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(serialProfile, state), false);
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(SemanticProfileId.ServiceTaskEffect, state), false);
});

test("restoration under the profile requires every carried value to be a SingletonBusinessItem", async () => {
  const { state } = await atNotify();
  const profile = effectDataProfile;
  const withSnapshot = (value: VariableValue): RuntimeState => ({
    ...state,
    effectWaits: state.effectWaits.map((wait) => ({ ...wait, arguments: [binding("assessment", value)] })),
  });
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, withSnapshot(assessment())), true);
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, withSnapshot(nothing)), true);
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, withSnapshot(text("a".repeat(1024)))), true);
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, withSnapshot(list(nothing))), false, "root List in an open snapshot");
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, withSnapshot(text("a".repeat(1025)))), false, "over-long root String in an open snapshot");
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, withSnapshot({ kind: VariableValueKind.StringList, value: ["a"] })), false);

  const withProperty = (value: VariableValue): RuntimeState => ({
    ...state, variables: { ...state.variables, process: { bindings: [...state.variables.process.bindings, binding("extra", value)] } },
  });
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, withProperty(assessment())), true);
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, withProperty(list())), false, "root List Property");

  const withLocal = (value: VariableValue): RuntimeState => ({
    ...state, variables: { ...state.variables, activities: state.variables.activities.map((scope) => ({ ...scope, bindings: [binding("assessment", value)] })) },
  });
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, withLocal(assessment())), true);
  assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, withLocal(list())), false, "root List Activity local");
});

test("PBV-COPY-01: mutating the caller-owned completion stimulus after commit changes nothing committed", async () => {
  const p = await program();
  const atAssess = committed(p, initialState, start);
  const callerOwned = assessment();
  const next = committed(p, atAssess, complete(atAssess.effectWaits[0]!.id, [binding(names.assessed, callerOwned)]));
  const before = structuredClone(next);
  tamper(callerOwned);
  assert.deepEqual(next, before);
  assert.deepEqual(next.variables.process.bindings.find(({ name }) => name === names.assessed)?.value, assessment());
  assert.deepEqual(next.effectWaits[0]?.arguments, [binding("assessment", assessment())]);
  assert.deepEqual(next.variables.activities.map(({ bindings }) => bindings), [[binding("assessment", assessment())]]);
});

test("PBV-COPY-01: mutating projected open-effect arguments leaves Property, local scope and snapshot unchanged", async () => {
  const { p, state } = await atNotify();
  const before = structuredClone(state);
  const observed = observeStableState(p, state);
  assert.ok(observed);
  for (const argument of observed.openEffects[0]!.arguments) tamper(argument.value as VariableValue);
  assert.deepEqual(state, before);
});

test("PBV-EFF-03: the snapshot, the Activity-local scope and the Property own separate storage", async () => {
  for (const mutate of ["snapshot", "local", "property"] as const) {
    const { state } = await atNotify();
    const expected = binding("assessment", assessment());
    const snapshot = state.effectWaits[0]!.arguments[0]!;
    const local = state.variables.activities[0]!.bindings[0]!;
    const property = state.variables.process.bindings.find(({ name }) => name === names.assessed)!;
    tamper(({ snapshot, local, property })[mutate].value);
    const untouched = { snapshot, local, property };
    for (const [owner, value] of Object.entries(untouched)) {
      if (owner === mutate) continue;
      assert.deepEqual(value.value, expected.value, `${mutate} mutation reached ${owner}`);
    }
  }
});

test("an enclosing write does not reach an open snapshot", async () => {
  const { p, state } = await atNotify();
  const property = state.variables.process.bindings.find(({ name }) => name === names.assessed)!;
  tamper(property.value);
  assert.deepEqual(state.effectWaits[0]?.arguments, [binding("assessment", assessment())]);
  const rewritten: RuntimeState = {
    ...state,
    variables: { ...state.variables, process: { bindings: state.variables.process.bindings.map((entry) => entry === property ? binding(names.assessed, text("rewritten")) : entry) } },
  };
  assert.deepEqual(rewritten.effectWaits[0]?.arguments, [binding("assessment", assessment())]);
  const done = committed(p, rewritten, { ...complete(rewritten.effectWaits[0]!.id, [binding(names.receipt, nothing)]), commandId: "notify" });
  assert.equal(done.control.kind, "completed");
});

test("the committed trace publishes each structured effect wait and replays to the committed state", async () => {
  const p = await program();
  const steps: ReadonlyArray<(state: RuntimeState) => Stimulus> = [
    () => start,
    (state) => complete(state.effectWaits[0]!.id, [binding(names.assessed, assessment())]),
    (state) => complete(state.effectWaits[0]!.id, [binding(names.receipt, nothing)]),
  ];
  let state = initialState;
  const started: string[][] = [];
  for (const next of steps) {
    const traced = applyStimulusWithTrace(p, state, next(state));
    assert.equal(traced.result.outcome, CommandOutcome.Committed);
    assert.notEqual(traced.currentPositions, null, "the independent current-position projection admits the structured snapshot");
    assert.deepEqual(replayCommittedTransitions(p, state, traced.committedTransitions), traced.result.state);
    started.push(traced.flowNodeOccurrenceLifecycles.flatMap(({ started: starts }) => starts.map(({ elementId }) => elementId)));
    state = traced.result.state;
  }
  assert.deepEqual(started, [[names.start, names.assess], [names.notify], [names.end]]);
});

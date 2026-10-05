import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, ControlStateKind, EffectExecutionResultKind, StimulusKind, VariableValueKind,
  applyStimulusWithTrace, initialState, isGateAdmissibleRuntimeState, isWellFormedRuntimeState, projectEffectTransportMaterial, projectOpenEffects,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { assessTemporalHostCapability, TemporalHostCapabilityResultKind, TemporalHostAdmissionFailureCode,
  effectTransportKey, requireBpmnWorkflowContinuationStateV1 } from "@bpmn-lean/temporal-protocol";
import { profile, source, prepareSource, sourceOverlay, parallelBodySource } from "../../../bpmn-source/test/sequential-scope-source-fixture.ts";

const xml = parallelBodySource(prepareSource(await readFile(source, "utf8")), 3, true);
const compiled = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "invoice-continuation",
  expectedSha256: undefined, semanticProfile: profile, sourceOverlay: sourceOverlay(),
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 } });
assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Expected admitted invoice batch");
const program = compiled.semanticProcess;
const instanceId = "invoice-continuation";
const scalar = (name: string, value: string | null): VariableBinding => ({ name,
  value: value === null ? { kind: VariableValueKind.Null } : { kind: VariableValueKind.String, value } });
const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId,
  initialVariables: [{ name: "items", value: { kind: VariableValueKind.StringList, value: ["A", "B"] } }] };
const human = (elementId: string, activation: number): Stimulus => ({ kind: StimulusKind.CompleteUserTaskInstance,
  commandId: `${elementId}-${activation}`, taskId: { processInstanceId: instanceId, elementId, activation },
  submittedValues: elementId.startsWith("Branch") ? [scalar("reviewStatus", "reviewed")] : [] });
const effect = (activation: number): Stimulus => ({ kind: StimulusKind.CompleteEffect, commandId: `validate-${activation}`,
  effectId: { processInstanceId: instanceId, elementId: "Validate", activation },
  result: { kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", activation === 1 ? null : "accepted")] } });
function commit(state: RuntimeState, command: Stimulus): RuntimeState {
  const step = applyStimulusWithTrace(program, state, command);
  assert.equal(step.result.outcome, CommandOutcome.Committed);
  return step.result.state;
}
function restore(state: RuntimeState): RuntimeState {
  assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
  const restored = requireBpmnWorkflowContinuationStateV1(JSON.parse(JSON.stringify(state)), program, instanceId);
  assert.deepEqual(restored, state);
  return restored;
}
const opening = commit(initialState, start);

test("the ordinary state gate enforces the fixed MI cardinality and captured item", () => {
  assert.equal(isGateAdmissibleRuntimeState(program, instanceId, opening), true);
  const controller = opening.sequentialScopeControllers![0]!;
  for (const patch of [{ total: 1 }, { currentItem: "B" }]) {
    const invalid = { ...opening, sequentialScopeControllers: [{ ...controller, ...patch }] };
    assert.equal(isWellFormedRuntimeState(program, instanceId, invalid), false);
    assert.equal(isGateAdmissibleRuntimeState(program, instanceId, invalid), false);
  }
});

test("MI checkpoint restoration does not bypass live hosting qualification", () => {
  const capability = assessTemporalHostCapability(program);
  assert.equal(capability.kind, TemporalHostCapabilityResultKind.Rejected);
  if (capability.kind !== TemporalHostCapabilityResultKind.Rejected) assert.fail("Unqualified MI hosting was admitted");
  assert.equal(capability.failure.code, TemporalHostAdmissionFailureCode.SequentialSubProcessQualificationUnavailable);
});

test("MI continuation retains the current body and frozen pending-effect snapshot across sibling completion", () => {
  const first = restore(opening);
  assert.equal(first.variables.scopes.length, 1);
  assert.equal(first.sequentialScopeControllers?.[0]?.currentItem, "A");
  const pending = projectOpenEffects(first)[0]!;
  assert.deepEqual(pending.arguments, [scalar("payload", "A"), scalar("status", "pending")]);
  const key = effectTransportKey(projectEffectTransportMaterial(program, pending));
  const siblingDone = restore(commit(first, human("Branch0", 1)));
  assert.deepEqual(projectOpenEffects(siblingDone)[0]?.arguments, pending.arguments);
  assert.equal(effectTransportKey(projectEffectTransportMaterial(program, projectOpenEffects(siblingDone)[0]!)), key);
  assert.deepEqual(siblingDone.userTaskWaits.map(wait => wait.id.elementId), ["Branch1"]);
});

test("zero-item MI continuation preserves the parent wait without inventing a body or controller", () => {
  const state = restore(commit(initialState, { ...start,
    initialVariables: [{ name: "items", value: { kind: VariableValueKind.StringList, value: [] } }] }));
  assert.deepEqual(state.variables.scopes, []);
  assert.equal(state.sequentialScopeControllers, undefined);
  assert.deepEqual(state.userTaskWaits.map(wait => wait.id.elementId), ["PublishBatch"]);
});

test("MI continuation restores the parent wait after all body frames have been retired", () => {
  let state = opening;
  for (const activation of [1, 2]) {
    for (const command of [human("Branch0", activation), human("Branch1", activation), effect(activation), human("Confirm", activation)]) {
      state = commit(state, command);
    }
  }
  assert.deepEqual(state.variables.scopes, []);
  assert.deepEqual(state.sequentialScopeControllers, []);
  assert.deepEqual(restore(state).userTaskWaits.map(wait => wait.id.elementId), ["PublishBatch"]);
});

test("MI restored execution agrees at every command, replaces body locals and rejects previous-body results", () => {
  let baseline = opening;
  let recovered = restore(opening);
  for (const activation of [1, 2]) {
    for (const command of [human("Branch0", activation), human("Branch1", activation), effect(activation), human("Confirm", activation)]) {
      const expected = applyStimulusWithTrace(program, baseline, command);
      const actual = applyStimulusWithTrace(program, recovered, command);
      assert.equal(actual.result.outcome, CommandOutcome.Committed);
      assert.deepEqual(actual, expected);
      baseline = expected.result.state;
      recovered = restore(actual.result.state);
      if (command.kind === StimulusKind.CompleteEffect && activation === 1) {
        assert.deepEqual(recovered.variables.scopes[0]?.bindings.find(value => value.name === "decision"), scalar("decision", null));
      }
    }
    if (activation === 1) {
      assert.equal(recovered.sequentialScopeControllers?.[0]?.completed, 1);
      assert.equal(recovered.sequentialScopeControllers?.[0]?.currentItem, "B");
      assert.notDeepEqual(recovered.variables.scopes[0]?.owner, opening.variables.scopes[0]?.owner);
      assert.deepEqual(recovered.variables.scopes[0]?.bindings.find(value => value.name === "reviewStatus"), scalar("reviewStatus", "pending"));
      const priorKey = effectTransportKey(projectEffectTransportMaterial(program, projectOpenEffects(opening)[0]!));
      assert.notEqual(effectTransportKey(projectEffectTransportMaterial(program, projectOpenEffects(recovered)[0]!)), priorKey);
      for (const stale of [human("Branch0", 1), effect(1)]) {
        const refused = applyStimulusWithTrace(program, recovered, { ...stale, commandId: `late-${stale.commandId}` });
        assert.equal(refused.result.outcome, CommandOutcome.Rejected);
        assert.deepEqual(refused.result.state, recovered);
        assert.deepEqual(refused.committedTransitions, []);
        assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
      }
    }
  }
  assert.deepEqual(recovered.variables.scopes, []);
  assert.deepEqual(recovered.sequentialScopeControllers, []);
  const terminal = commit(recovered, human("PublishBatch", 1));
  assert.equal(terminal.control.kind, ControlStateKind.Completed);
  assert.deepEqual(terminal, commit(baseline, human("PublishBatch", 1)));
});

test("MI continuation rejects missing, ambiguous, stale and malformed body/controller associations", async t => {
  const state = restore(opening);
  const controller = state.sequentialScopeControllers![0]!;
  const frame = state.variables.scopes[0]!;
  const { sequentialScopeControllers: _controllers, ...missingController } = state;
  const { scopes: _scopes, ...missingScopes } = state.variables;
  const invalid: [string, unknown][] = [
    ["missing controller", missingController],
    ["empty controller", { ...state, sequentialScopeControllers: [] }],
    ["duplicate controller", { ...state, sequentialScopeControllers: [controller, controller] }],
    ["missing scope field", { ...state, variables: missingScopes }],
    ["missing body locals", { ...state, variables: { ...state.variables, scopes: [] } }],
    ["duplicate body locals", { ...state, variables: { ...state.variables, scopes: [frame, frame] } }],
    ["stale body locals", { ...state, variables: { ...state.variables, scopes: [{ ...frame, owner: { ...frame.owner, activation: frame.owner.activation + 1 } }] } }],
    ["orphan locals", { ...state, variables: { ...state.variables, scopes: [...state.variables.scopes,
      { ...frame, owner: { ...frame.owner, activation: frame.owner.activation + 1 } }] } }],
    ["parent locals", { ...state, variables: { ...state.variables, scopes: [...state.variables.scopes,
      { ...frame, owner: state.scopeOccurrences.find(scope => scope.parent === null)!.id }] } }],
    ["missing local declaration", { ...state, variables: { ...state.variables, scopes: [{ ...frame, bindings: [] }] } }],
    ["non-scalar local", { ...state, variables: { ...state.variables, scopes: [{ ...frame,
      bindings: frame.bindings.map(value => ({ ...value, value: { kind: VariableValueKind.Boolean, value: true } })) }] } }],
    ["rewound scope counter", { ...state, scopeActivations: [] }],
    ["rewound effect counter", { ...state, effectActivations: [] }],
    ["unknown body field", { ...state, variables: { ...state.variables, scopes: [{ ...frame, extra: true }] } }],
  ];
  for (const patch of [{ total: 1 }, { total: 17 }, { completed: 2 }, { completed: -1 }, { completed: 0.5 },
    { currentItem: "B" }, { currentItem: null }, { extra: true },
    { id: { ...controller.id, activation: controller.id.activation + 1 } }]) {
    invalid.push([JSON.stringify(patch), { ...state, sequentialScopeControllers: [{ ...controller, ...patch }] }]);
  }
  for (const [label, value] of invalid) {
    await t.test(label, () => assert.throws(() => requireBpmnWorkflowContinuationStateV1(value, program, instanceId),
      /Malformed committed RuntimeState continuation|resumable stable checkpoint|representable committed state/u));
  }
});

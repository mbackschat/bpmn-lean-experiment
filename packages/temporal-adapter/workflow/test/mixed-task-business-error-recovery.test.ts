import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BpmnCompilationStatus } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, StimulusKind, VariableValueKind,
  applyStimulus, applyStimulusWithTrace, initialState, projectEffectTransportMaterial,
  projectOpenEffects,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import {
  EffectActivityResultKind, effectTransportKey, requireBpmnWorkflowContinuationStateV1,
} from "@bpmn-lean/temporal-protocol";

import { compile, source } from "../../../bpmn-source/test/mixed-task-business-error-fixture.ts";
import { effectActivityPolicyForProfile } from "../dist/effect-activity-policy.js";
import { EffectHostFailureKind, effectActivityResultCommand } from "../dist/effect-execution-host.js";

const compiled = await compile(await readFile(source, "utf8"));
assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Expected admitted invoice");
const program = compiled.semanticProcess;
const instanceId = "invoice-recovery";
const scalar = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const result = { kind: EffectExecutionResultKind.BpmnError, code: "REVIEW_REQUIRED",
  message: "Correct the submitted invoice", localPatch: [scalar("result", "correct")] } as const;

function restore(state: RuntimeState): RuntimeState {
  const decoded = requireBpmnWorkflowContinuationStateV1(JSON.parse(JSON.stringify(state)), program, instanceId);
  assert.deepEqual(decoded, state);
  return decoded;
}

function commit(state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const step = applyStimulus(program, state, stimulus);
  assert.equal(step.outcome, CommandOutcome.Committed);
  return step.state;
}

function completeTask(state: RuntimeState, commandId: string, submittedValues: readonly VariableBinding[] = []): RuntimeState {
  assert.equal(state.userTaskWaits.length, 1);
  return commit(state, { kind: StimulusKind.CompleteUserTaskInstance, commandId,
    taskId: state.userTaskWaits[0]!.id, submittedValues });
}

function hostCommand(state: RuntimeState, activityResult: unknown = result) {
  const effects = projectOpenEffects(state);
  assert.equal(effects.length, 1);
  return effectActivityResultCommand(effectActivityPolicyForProfile(program.identity.semanticProfile), state, effects[0]!, activityResult);
}

function succeed(state: RuntimeState): RuntimeState {
  const command = hostCommand(state, { kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", "valid")] });
  assert.equal(command.kind, "command");
  if (command.kind !== "command") assert.fail("Expected effect completion");
  return commit(state, command.stimulus);
}

function waiting(taskId: "Validate" | "Authorize"): RuntimeState {
  const started = commit(initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: program.processId, instanceId, initialVariables: [scalar("request", "original")] });
  const validated = completeTask(restore(started), "review");
  return restore(taskId === "Validate" ? validated : succeed(validated));
}

for (const [taskId, recoveryId] of [["Validate", "CorrectData"], ["Authorize", "ReviewPolicy"]] as const) {
  test(`${taskId} restoration preserves mapped Error routing and distinguishes the repeated occurrence`, () => {
    const first = waiting(taskId);
    const firstEffect = projectOpenEffects(first)[0]!;
    const command = hostCommand(first);
    assert.equal(command.kind, "command");
    if (command.kind !== "command") assert.fail("Expected mapped Error command");
    const recovery = restore(commit(first, command.stimulus));
    assert.deepEqual(recovery.userTaskWaits.map(({ id }) => id.elementId), [recoveryId]);
    assert.deepEqual(recovery.effectWaits, []);
    assert.deepEqual(recovery.variables.activities, []);
    const corrected = restore(completeTask(recovery, "correct", [scalar("request", "corrected")]));
    let repeated = completeTask(corrected, "review-again");
    if (taskId === "Authorize") repeated = succeed(repeated);
    const restored = restore(repeated);
    const effect = projectOpenEffects(restored)[0]!;
    assert.equal(effect.id.elementId, taskId);
    assert.equal(effect.id.activation, firstEffect.id.activation + 1);
    assert.deepEqual(effect.arguments, [scalar("payload", "corrected")]);
    const material = projectEffectTransportMaterial(program, effect);
    assert.equal(effectTransportKey(material), effectTransportKey(projectEffectTransportMaterial(program, projectOpenEffects(restore(restored))[0]!)));
    assert.notEqual(effectTransportKey(material), effectTransportKey({ ...material, occurrence: firstEffect.id }));
    assert.notEqual(effectTransportKey(material), effectTransportKey({ ...material, arguments: firstEffect.arguments }));

    const stale = applyStimulusWithTrace(program, restored, command.stimulus);
    assert.equal(stale.result.outcome, CommandOutcome.Rejected);
    assert.deepEqual(stale.result.state, restored);
    assert.deepEqual(stale.committedTransitions, []);
    assert.deepEqual(stale.flowNodeOccurrenceLifecycles, []);
    const current = hostCommand(restored);
    assert.equal(current.kind, "command");
    if (current.kind !== "command") assert.fail("Expected current Error command");
    assert.notEqual(current.stimulus.commandId, command.stimulus.commandId);
    assert.deepEqual(restore(commit(restored, current.stimulus)).userTaskWaits.map(({ id }) => id.elementId), [recoveryId]);
  });

  test(`${taskId} continuation refuses substituted route, result mapping and local owner`, () => {
    const state = waiting(taskId);
    const wait = state.effectWaits[0]!;
    assert.ok(wait.bpmnErrorRoute !== null);
    const other = waiting(taskId === "Validate" ? "Authorize" : "Validate").effectWaits[0]!;
    for (const [label, invalid] of [
      ["attached route", { ...state, effectWaits: [{ ...wait, bpmnErrorRoute: other.bpmnErrorRoute }] }],
      ["normal continuation", { ...state, effectWaits: [{ ...wait, output: other.output }] }],
      ["result target", { ...state, effectWaits: [{ ...wait,
        outputMappings: wait.outputMappings.map(mapping => ({ ...mapping, target: "request" })) }] }],
      ["missing locals", { ...state, variables: { ...state.variables, activities: [] } }],
      ["duplicate locals", { ...state, variables: { ...state.variables, activities: [...state.variables.activities, ...state.variables.activities] } }],
    ] as const) {
      assert.notDeepEqual(invalid, state, `${label} must change the carried state`);
      assert.throws(() => requireBpmnWorkflowContinuationStateV1(JSON.parse(JSON.stringify(invalid)), program, instanceId), undefined, label);
    }
  });

  test(`${taskId} technical Activity failure cannot become a modeled Error after restoration`, () => {
    const state = waiting(taskId);
    const before = structuredClone(state);
    assert.deepEqual(hostCommand(state, { kind: EffectActivityResultKind.TechnicalFailure }), {
      kind: "failure", failure: EffectHostFailureKind.TechnicalFailureUnsupported,
    });
    assert.deepEqual(state, before);
  });
}

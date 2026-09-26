import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID,
  CommandOutcome,
  EffectExecutionResultKind,
  InternalSchedulingMode,
  StimulusKind,
  ScenarioStepKind,
  advanceScenario,
  applyStimulus,
  initialState,
  projectCompensationEffectTransportMaterial,
  type RuntimeState,
  type SemanticProcessProgram,
  type Stimulus,
} from "@bpmn-lean/semantic-core";
import { compensationEffectTransportKey, workflowChainCanonicalUtf8ByteLength, type EffectRequest } from "@bpmn-lean/temporal-protocol";
import { WorkflowSemanticCandidatePreflightKind, createCommandPublicationState,
  integrateCommandPublication, preflightWorkflowSemanticCandidate, recordCommandPublicationOutcome } from "../dist/index.js";
import {
  createCompensationFrontierScheduler,
  type CompensationActivationReadiness,
  type CompensationActivityCallbacks,
  type CompensationActivityCompletion,
} from "../dist/compensation-frontier-scheduler.js";
import { effectActivityPolicyForProfile } from "../dist/effect-activity-policy.js";

const xml = await readFile(new URL("../../../bpmn-source/test/fixtures/transaction-cancellation.bpmn", import.meta.url), "utf8");
const compiled = await compileBpmnToSemanticProcess({
  bytes: Buffer.from(xml), sourceId: "transaction-scheduler", expectedSha256: undefined,
  semanticProfile: TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID, sourceOverlay: null,
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 },
});
assert.equal(compiled.status, BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
assert.ok(compiled.status === BpmnCompilationStatus.Accepted);
const program = compiled.semanticProcess;
const success = { kind: EffectExecutionResultKind.Success, localPatch: [] } as const;

function commit(state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

function complete(state: RuntimeState, elementId: string): RuntimeState {
  const wait = state.userTaskWaits.find(({ id }) => id.elementId === elementId);
  assert.ok(wait);
  return commit(state, { kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`, taskId: wait.id, submittedValues: [] });
}

function cancelled(eligible = true) {
  let state = commit(initialState, { kind: StimulusKind.StartProcess,
    commandId: "start", processId: program.processId, instanceId: "transaction-scheduler-1", initialVariables: [] });
  assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), ["Task_Reserve", "Task_Withdraw"]);
  if (eligible) state = complete(state, "Task_Reserve");
  const beforeCancel = state;
  state = complete(state, "Task_Withdraw");
  return { state, beforeCancel };
}

function harness(preflightRequest: (request: EffectRequest) => void = () => {}) {
  const requests: EffectRequest[] = [];
  const callbacks: CompensationActivityCallbacks[] = [];
  const recorded: CompensationActivityCompletion[] = [];
  let batch: CompensationActivityCompletion[] = [];
  let wake: (() => void) | undefined;
  let failure: unknown;
  let cancellations = 0;
  const readiness: CompensationActivationReadiness = {
    record(value) { batch.push(value); recorded.push(value); wake?.(); },
    recordFailure(error) { failure = error; wake?.(); },
    async takeBatch() {
      if (batch.length === 0 && failure === undefined) await new Promise<void>((resolve) => { wake = resolve; });
      if (failure !== undefined) throw failure;
      const result = batch;
      batch = [];
      wake = undefined;
      return result;
    },
  };
  return {
    requests, callbacks, recorded,
    cancellations: () => cancellations,
    adapters: {
      preflightRequest, readiness,
      startActivity(request: EffectRequest, callback: CompensationActivityCallbacks) {
        requests.push(request); callbacks.push(callback);
        return { cancel() { cancellations += 1; } };
      },
    },
  };
}

for (const outcome of ["success", "failure"] as const) {
  test(`source Transaction schedules the exact child effect and releases ${outcome}`, { timeout: 5000 }, async () => {
    const { state } = cancelled();
    const original = structuredClone(state);
    const effect = state.compensationHandlerEffectWaits?.[0];
    const trigger = state.compensationTriggers?.[0];
    assert.ok(effect && trigger);
    assert.equal(trigger.owner.definitionScopeId, program.compensationExecution!.definitionScopeId);
    assert.deepEqual(state.userTaskWaits, []);
    const h = harness();
    const scheduler = createCompensationFrontierScheduler(program, h.adapters);
    let released = false;
    const pending = scheduler.waitForReadiness(state).then(
      (command) => { released = true; return { kind: "command", command } as const; },
      (error: unknown) => ({ kind: "failure", error } as const),
    );
    assert.equal(h.requests.length, 1);
    const material = projectCompensationEffectTransportMaterial(program, effect);
    assert.deepEqual(h.requests[0], { ...material.descriptor,
      idempotencyKey: compensationEffectTransportKey(material), arguments: [] });
    assert.deepEqual(h.callbacks[0]!.material, material);
    await Promise.resolve();
    assert.equal(released, false);
    assert.deepEqual(state, original);
    h.callbacks[0]!.onResult(outcome === "success" ? success : {
      kind: EffectExecutionResultKind.BpmnError, code: "release-refused", message: null, localPatch: [],
    });
    const readiness = await pending;
    if (readiness.kind === "failure") throw readiness.error;
    const command = readiness.command;
    assert.deepEqual(command.effectId, effect.id);
    const result = commit(state, command);
    scheduler.reconcileCommittedState(result);
    await scheduler.waitForIdle();
    assert.equal(scheduler.hasUnreconciledActivities(), false);
    assert.equal(h.cancellations(), 0);
    assert.deepEqual(result.userTaskWaits.map(({ id }) => id.elementId), outcome === "success" ? ["Task_Acknowledge"] : []);
    if (outcome === "success") assert.equal(complete(result, "Task_Acknowledge").control.kind, "completed");
    else assert.equal(result.control.kind, "failed");
    h.callbacks[0]!.onResult(success);
    assert.equal(h.recorded.length, 1, "late callback must not release another command");
    const stale = applyStimulus(program, result, { ...command, commandId: "stale-effect" });
    assert.equal(stale.outcome, CommandOutcome.Rejected);
    assert.deepEqual(stale.state, result);
  });
}

test("empty cancellation has no managed effect and continues through passive ingress", () => {
  const { state } = cancelled(false);
  const h = harness();
  const scheduler = createCompensationFrontierScheduler(program, h.adapters);
  assert.equal(scheduler.ownsCommittedFrontier(state), false);
  scheduler.reconcileCommittedState(state);
  assert.deepEqual(h.requests, []);
  assert.equal(complete(state, "Task_Acknowledge").control.kind, "completed");
});

test("Transaction effect preflight refuses before any Activity is scheduled", async () => {
  const { state } = cancelled();
  const original = structuredClone(state);
  const refusal = new Error("request-capacity-refused");
  let preflights = 0;
  const h = harness(() => { preflights += 1; throw refusal; });
  const scheduler = createCompensationFrontierScheduler(program, h.adapters);
  await assert.rejects(scheduler.waitForReadiness(state), (error) => error === refusal);
  assert.equal(preflights, 1);
  assert.deepEqual(h.requests, []);
  assert.deepEqual(state, original);
  assert.equal(scheduler.hasUnreconciledActivities(), false);
});

test("scheduler rejects malformed Transaction profile and owner bindings before Activity scheduling", async () => {
  const { state, beforeCancel } = cancelled();
  const trigger = state.compensationTriggers![0]!;
  const root = state.scopeOccurrences.find(({ id }) => id.definitionScopeId !== trigger.owner.definitionScopeId)!;
  const wrongOwner = { ...state, compensationTriggers: [{ ...trigger, owner: root.id }] };
  const invalid: ReadonlyArray<readonly [string, SemanticProcessProgram, RuntimeState]> = [
    ["unknown profile", { ...program, identity: { ...program.identity, semanticProfile: "unknown" } }, state],
    ["scheduled program", { ...program, internalSchedulingMode: InternalSchedulingMode.RequireChoiceSchedule }, state],
    ["wrong child scope", { ...program, definitionScopes: program.definitionScopes.slice(0, 1) }, state],
    ["wrong trigger owner", program, wrongOwner],
    ["ordinary waits beside compensation", program, { ...state, userTaskWaits: beforeCancel.userTaskWaits }],
  ];
  for (const [label, candidate, candidateState] of invalid) {
    const h = harness();
    const scheduler = createCompensationFrontierScheduler(candidate, h.adapters);
    await assert.rejects(scheduler.waitForReadiness(candidateState), /Compensation/, label);
    assert.deepEqual(h.requests, [], label);
  }
});

test("Transaction effects reuse exact Compensation retry, heartbeat and cancellation-drain policy", () => {
  assert.strictEqual(effectActivityPolicyForProfile(TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID),
    effectActivityPolicyForProfile(COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID));
});

for (const retained of [false, true]) {
  test(`Transaction candidate capacity checks preserve both publications, retained=${retained}`, () => {
    const instanceId = "transaction-capacity";
    const task = (elementId: string): Stimulus => ({ kind: StimulusKind.CompleteUserTaskInstance,
      commandId: elementId, taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues: [] });
    const commands: Stimulus[] = [{ kind: StimulusKind.StartProcess, commandId: "start",
      processId: program.processId, instanceId, initialVariables: [] }];
    if (retained) commands.push(task("Task_Reserve"));
    commands.push(task("Task_Withdraw"));
    if (retained) commands.push({ kind: StimulusKind.CompleteEffect, commandId: "release",
      effectId: { processInstanceId: instanceId, elementId: "Task_Release", activation: 1 }, result: success });
    commands.push(task("Task_Acknowledge"));
    let state = initialState;
    let publication = createCommandPublicationState(program, instanceId);
    for (const command of commands) {
      const before = structuredClone({ state, publication });
      const step = advanceScenario(program, state, command);
      assert.equal(step.kind, ScenarioStepKind.Committed);
      if (step.kind !== ScenarioStepKind.Committed) assert.fail("Transaction command did not commit");
      const candidate = { state: step.state, publicationBefore: publication,
        publication: recordCommandPublicationOutcome(
          integrateCommandPublication(program, publication, command, step, () => 1000), command, step.observations) };
      const execution = candidate.publication.execution.batches.at(-1);
      const flowNodeOccurrences = candidate.publication.flowNodeOccurrences.batches.at(-1);
      assert.ok(execution && flowNodeOccurrences);
      const limits = { committedRuntimeStateBytes: workflowChainCanonicalUtf8ByteLength(candidate.state),
        publicationBatchBytes: workflowChainCanonicalUtf8ByteLength({ execution, flowNodeOccurrences }) };
      assert.equal(preflightWorkflowSemanticCandidate(candidate, limits).kind,
        WorkflowSemanticCandidatePreflightKind.Ready);
      for (const key of ["committedRuntimeStateBytes", "publicationBatchBytes"] as const) {
        assert.equal(preflightWorkflowSemanticCandidate(candidate, { ...limits, [key]: limits[key] - 1 }).kind,
          WorkflowSemanticCandidatePreflightKind.CapacityExceeded, `${command.commandId}:${key}`);
        assert.deepEqual({ state, publication }, before);
      }
      state = candidate.state;
      publication = candidate.publication;
    }
    assert.equal(state.control.kind, "completed");
  });
}

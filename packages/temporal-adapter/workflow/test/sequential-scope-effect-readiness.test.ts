import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CommandOutcome, StimulusKind, VariableValueKind, EffectExecutionResultKind, applyStimulus, initialState, projectOpenEffects } from "@bpmn-lean/semantic-core";
import type { RuntimeState, Stimulus, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { EffectActivityResultKind } from "@bpmn-lean/temporal-protocol";
import { workflowRolloverPermitted } from "../dist/workflow-rollover-safety.js";
import type { EffectActivityResult, EffectRequest } from "@bpmn-lean/temporal-protocol";
import { profile, source, prepareSource, sourceOverlay, parallelBodySource } from "../../../bpmn-source/test/sequential-scope-source-fixture.ts";
import { createOrdinaryEffectFrontierScheduler } from "../dist/ordinary-effect-frontier-scheduler.js";
import { enqueueStimulus, waitForHostReadiness } from "../dist/workflow-host-readiness.js";
import type { HostReadinessInput } from "../dist/workflow-host-readiness.js";
import { legacyEffectActivityPolicy } from "../dist/effect-activity-policy.js";

const base = prepareSource(await readFile(source, "utf8"));
const parallel = parallelBodySource(base, 3, true);
const service = base.match(/<serviceTask id="Validate"[\s\S]*?<\/serviceTask>/u)?.[0];
assert.ok(service);
const twoEffects = parallel.replace('<userTask id="Branch1" />', service.replace('id="Validate"', 'id="OtherValidate"'))
  .replaceAll('targetRef="Branch1"', 'targetRef="OtherValidate"').replaceAll('sourceRef="Branch1"', 'sourceRef="OtherValidate"');
async function fixture(xml: string) {
  const compiled = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "invoice-readiness",
    expectedSha256: undefined, semanticProfile: profile, sourceOverlay: sourceOverlay(),
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 } });
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail("Expected admitted parallel invoice body");
  const program = compiled.semanticProcess;
  const start = applyStimulus(program, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: program.processId, instanceId: "invoices", initialVariables: [
      { name: "items", value: { kind: VariableValueKind.StringList, value: ["A", "B"] } }] });
  assert.equal(start.outcome, CommandOutcome.Committed);
  return { program, state: start.state };
}
const single = await fixture(parallel);
const multiple = await fixture(twoEffects);
const success: EffectActivityResult = { kind: EffectExecutionResultKind.Success,
  localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "accepted" } }] };
function input(program: SemanticProcessProgram, state: RuntimeState,
  executeEffect: (request: EffectRequest) => Promise<EffectActivityResult>): HostReadinessInput & { wake: () => void } {
  const waiters: { predicate: () => boolean; resolve: () => void }[] = [];
  const host: HostReadinessInput & { wake: () => void } = {
    wake() {
      for (const waiter of [...waiters]) if (waiter.predicate()) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    },
    semanticProcess: program, state, pendingStimuli: [], acceptedStimuli: [], executeEffect,
    eventRaceScheduler: { waitForReadiness: async () => [], reconcileCommittedState: () => undefined },
    messageBoundedActivityScheduler: { hasPendingCallbacks: () => false, ownsCommittedPair: () => false,
      recordMessageCallback: () => false, recordCompletionCallback: () => false, waitForReadiness: async () => [] },
    boundedDeadlineSchedulers: [],
    effectScheduler: createOrdinaryEffectFrontierScheduler(program, {
      executeEffect,
      failCapacity: failure => { throw new Error(`capacity: ${failure.budget}`); },
      enqueueCompletion: completion => enqueueStimulus(host.acceptedStimuli, host.pendingStimuli, completion, host.reserveStimulus),
      waitUntil: predicate => predicate() ? Promise.resolve() : new Promise(resolve => waiters.push({ predicate, resolve })),
    }),
    waitForTimer: async () => { throw new Error("unexpected timer"); }, effectActivityPolicy: legacyEffectActivityPolicy,
    failCapacity: () => { throw new Error("unexpected capacity refusal"); }, reserveStimulus: () => true,
    hostRecheckRequested: () => false,
  };
  return host;
}

test("ordinary MI hosting starts both committed effects without serializing their frontier", async () => {
  assert.equal(projectOpenEffects(multiple.state).length, 2);
  const requests: EffectRequest[] = [];
  const host = input(multiple.program, multiple.state, async request => { requests.push(request); return success; });
  const waiting = waitForHostReadiness(host);
  await setImmediate();
  host.wake();
  await waiting;
  assert.equal(requests.length, 2);
  assert.equal(new Set(requests.map(request => request.idempotencyKey)).size, 2);
});

test("ordinary MI hosting starts three committed effects before any callback is released", async () => {
  const triple = await fixture(twoEffects
    .replace('<userTask id="Branch0" />', service.replace('id="Validate"', 'id="ThirdValidate"'))
    .replaceAll('targetRef="Branch0"', 'targetRef="ThirdValidate"')
    .replaceAll('sourceRef="Branch0"', 'sourceRef="ThirdValidate"'));
  const activity = Promise.withResolvers<EffectActivityResult>();
  const requests: EffectRequest[] = [];
  const host = input(triple.program, triple.state, async request => {
    requests.push(request);
    return activity.promise;
  });
  const waiting = waitForHostReadiness(host);
  try {
    await setImmediate();
    assert.equal(projectOpenEffects(triple.state).length, 3);
    assert.equal(requests.length, 3);
    assert.equal(new Set(requests.map(request => request.idempotencyKey)).size, 3);
    assert.equal(workflowRolloverPermitted({ requested: true,
      managedBoundaryDeadlineArmed: false, managedReadinessCallbackPending: false,
      effectActivityUnreconciled: host.effectScheduler.hasUnreconciledActivities() }), false);
  } finally {
    activity.resolve(success);
    await setImmediate();
    host.wake();
    await waiting;
  }
  assert.equal(host.pendingStimuli.length, 3);
  assert.equal(host.effectScheduler.hasUnreconciledActivities(), true);
  let state = triple.state;
  for (const command of host.pendingStimuli) {
    state = commit(triple.program, state, command);
    host.effectScheduler.reconcileCommittedState(state);
  }
  assert.equal(host.effectScheduler.hasUnreconciledActivities(), false);
});

test("a passive human completion wakes the host while an ordinary MI effect remains in flight", async () => {
  const activity = Promise.withResolvers<EffectActivityResult>();
  const host = input(single.program, single.state, async () => activity.promise);
  let drained = false;
  const waiting = waitForHostReadiness(host).then(() => { drained = true; });
  try {
    await setImmediate();
    const wait = single.state.userTaskWaits[0]!;
    const command: Stimulus = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review",
      taskId: wait.id, submittedValues: [] };
    host.pendingStimuli.push(command);
    host.wake();
    await setImmediate();
    assert.equal(drained, true, "human ingress must not wait for the unrelated Activity result");
  } finally {
    activity.resolve(success);
    await setImmediate();
    host.wake();
    await waiting;
  }
});

async function flush(host: ReturnType<typeof input>) {
  await setImmediate();
  host.wake();
  await setImmediate();
}
function human(state: RuntimeState): Stimulus {
  return { kind: StimulusKind.CompleteUserTaskInstance, commandId: "sibling-review",
    taskId: state.userTaskWaits[0]!.id,
    submittedValues: [{ name: "reviewStatus", value: { kind: VariableValueKind.String, value: "changed" } }] };
}
function commit(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus) {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

test("reversed effect callbacks share human ingress order and remain owned until committed", async () => {
  const activities = [Promise.withResolvers<EffectActivityResult>(), Promise.withResolvers<EffectActivityResult>()];
  const requests: EffectRequest[] = [];
  const host = input(multiple.program, multiple.state, request => {
    requests.push(request);
    return activities[requests.length - 1]!.promise;
  });
  const waiting = waitForHostReadiness(host);
  assert.equal(host.effectScheduler.hasUnreconciledActivities(), true);
  activities[1]!.resolve(success);
  await flush(host);
  const humanCommand = human(multiple.state);
  enqueueStimulus(host.acceptedStimuli, host.pendingStimuli, humanCommand);
  activities[0]!.resolve(success);
  await flush(host);
  await waiting;
  const effects = projectOpenEffects(multiple.state);
  assert.deepEqual(host.pendingStimuli.map(command => command.kind === StimulusKind.CompleteEffect
    ? command.effectId : command.kind), [effects[1]!.id, StimulusKind.CompleteUserTaskInstance, effects[0]!.id]);
  let state = multiple.state;
  for (const command of host.pendingStimuli) {
    state = commit(multiple.program, state, command);
    host.effectScheduler.reconcileCommittedState(state);
  }
  assert.equal(host.effectScheduler.hasUnreconciledActivities(), false);
  await host.effectScheduler.waitForIdle();
  assert.equal(state.effectWaits.length, 0);
});

test("sibling progress neither reschedules an owned effect nor changes its captured arguments", async () => {
  const activity = Promise.withResolvers<EffectActivityResult>();
  const requests: EffectRequest[] = [];
  const host = input(single.program, single.state, request => { requests.push(request); return activity.promise; });
  const waiting = waitForHostReadiness(host);
  const snapshot = structuredClone(requests[0]);
  const command = human(single.state);
  enqueueStimulus(host.acceptedStimuli, host.pendingStimuli, command);
  await flush(host);
  await waiting;
  const state = commit(single.program, single.state, host.pendingStimuli.shift()!);
  host.effectScheduler.reconcileCommittedState(state);
  const resumed = waitForHostReadiness({ ...host, state });
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], snapshot);
  let idle = false;
  const drained = host.effectScheduler.waitForIdle().then(() => { idle = true; });
  activity.resolve(success);
  await flush(host);
  await resumed;
  assert.equal(idle, false, "released result still fences rollover until semantic commit");
  const rollover = () => workflowRolloverPermitted({ requested: true,
    managedBoundaryDeadlineArmed: false, managedReadinessCallbackPending: false,
    effectActivityUnreconciled: host.effectScheduler.hasUnreconciledActivities() });
  assert.equal(rollover(), false);
  const completed = commit(single.program, state, host.pendingStimuli.shift()!);
  host.effectScheduler.reconcileCommittedState(completed);
  await flush(host);
  await drained;
  assert.equal(idle, true);
  assert.equal(rollover(), true);
});

test("capacity preflight refuses a later oversized frontier member before starting any Activity", async () => {
  const state = structuredClone(multiple.state);
  const last = state.effectWaits.at(-1)!;
  const oversized = { ...state, effectWaits: state.effectWaits.map(wait => wait === last
    ? { ...wait, arguments: [{ name: "payload", value: { kind: VariableValueKind.String, value: "x".repeat(2 * 1024 * 1024) } }] }
    : wait) };
  let calls = 0;
  const host = input(multiple.program, oversized, async () => { calls++; return success; });
  await assert.rejects(waitForHostReadiness(host), /capacity/u);
  assert.equal(calls, 0);
});

test("changed material or premature disappearance behind an owned occurrence is a host failure", async () => {
  const activity = Promise.withResolvers<EffectActivityResult>();
  const host = input(single.program, single.state, () => activity.promise);
  const waiting = waitForHostReadiness(host);
  const changed = { ...single.state, effectWaits: single.state.effectWaits.map(wait => ({ ...wait,
    arguments: [{ name: "payload", value: { kind: VariableValueKind.String, value: "different" } }] })) };
  assert.throws(() => host.effectScheduler.reconcileCommittedState(changed), /changed material/u);
  assert.throws(() => host.effectScheduler.reconcileCommittedState({ ...single.state, effectWaits: [] }), /disappeared/u);
  activity.resolve(success);
  await flush(host);
  await waiting;
});

test("Activity rejection stays a host failure and emits no semantic completion", async () => {
  const failure = new Error("adapter transport failed");
  const host = input(single.program, single.state, async () => { throw failure; });
  const waiting = assert.rejects(waitForHostReadiness(host), error => error === failure);
  await flush(host);
  await waiting;
  assert.deepEqual(host.pendingStimuli, []);
  await assert.rejects(host.effectScheduler.waitForIdle(), error => error === failure);
});

test("technical Activity failure does not become a BPMN completion or release the rollover fence", async () => {
  const host = input(single.program, single.state, async () => ({ kind: EffectActivityResultKind.TechnicalFailure }));
  const waiting = assert.rejects(waitForHostReadiness(host), /technical failure outside its selected profile/u);
  await flush(host);
  await waiting;
  assert.deepEqual(host.pendingStimuli, []);
  assert.equal(host.effectScheduler.hasUnreconciledActivities(), true);
});

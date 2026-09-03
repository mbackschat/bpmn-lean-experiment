import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  CommandOutcome,
  EffectExecutionResultKind,
  StimulusKind,
  applyStimulus,
  projectCompensationEffectTransportMaterial,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteEffectStimulus,
  RuntimeState,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
} from "@temporalio/workflow";
import {
  EffectActivityResultKind,
  WorkflowChainBudgetKind,
  compensationEffectTransportKey,
} from "@bpmn-lean/temporal-protocol";
import type {
  EffectActivityResult,
  EffectRequest,
} from "@bpmn-lean/temporal-protocol";

import {
  compensationSemanticProgram,
  triggerReadyFixture,
} from "../../../semantic-core/test/compensation-trigger-handler-semantic-fixtures.ts";
import {
  createCompensationFrontierScheduler,
} from "../dist/compensation-frontier-scheduler.js";
import type {
  CompensationActivationReadiness,
  CompensationActivityCallbacks,
} from "../dist/compensation-frontier-scheduler.js";

const program = {
  ...compensationSemanticProgram,
  identity: {
    ...compensationSemanticProgram.identity,
    semanticProfile: COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  },
};

test("starts the complete B/C frontier before observing results and canonicalizes one activation", async () => {
  const state = triggeredState();
  const harness = schedulerHarness();
  const scheduler = createCompensationFrontierScheduler(program, harness.adapters);

  const firstReadiness = scheduler.waitForReadiness(state);
  assert.deepEqual(harness.startedElementIds(), ["Effect_Undo_B", "Undo_C"]);
  assertRequestsBindCommittedWaits(state, harness.requests);

  harness.resolve("Undo_C", success());
  harness.resolve("Effect_Undo_B", success());
  const first = await firstReadiness;
  assert.equal(first.effectId.elementId, "Effect_Undo_B");

  const afterB = committed(state, first);
  scheduler.reconcileCommittedState(afterB);
  assert.deepEqual(harness.startedElementIds(), ["Effect_Undo_B", "Undo_C"]);
  const secondReadiness = scheduler.waitForReadiness(afterB);
  assert.deepEqual(
    harness.startedElementIds(),
    ["Effect_Undo_B", "Undo_C", "Undo_A"],
  );
  const second = await secondReadiness;
  assert.equal(second.effectId.elementId, "Undo_C");
});

test("cancels a removed sibling and drains its late result without another semantic completion", async () => {
  const state = triggeredState();
  const harness = schedulerHarness();
  const scheduler = createCompensationFrontierScheduler(program, harness.adapters);

  const readiness = scheduler.waitForReadiness(state);
  harness.resolve("Undo_C", {
    kind: EffectExecutionResultKind.BpmnError,
    code: "compensation-rejected",
    message: null,
    localPatch: [],
  });
  const failure = await readiness;
  assert.equal(failure.effectId.elementId, "Undo_C");
  const failed = committed(state, failure);
  scheduler.reconcileCommittedState(failed);

  assert.deepEqual(harness.cancelled, ["Effect_Undo_B"]);
  assert.equal(scheduler.hasUnreconciledActivities(), true);
  let idle = false;
  const drained = scheduler.waitForIdle().then(() => {
    idle = true;
  });
  await Promise.resolve();
  assert.equal(idle, false);

  harness.resolve("Effect_Undo_B", success());
  await drained;
  assert.equal(idle, true);
  assert.equal(scheduler.hasUnreconciledActivities(), false);
  assert.deepEqual(harness.recordedElementIds(), ["Undo_C"]);
});

test("preflights the complete frontier before starting its first Activity", async () => {
  const state = triggeredState();
  const refusal = Symbol("second-request-refused");
  let preflights = 0;
  const harness = schedulerHarness({
    preflightRequest() {
      preflights += 1;
      if (preflights === 2) throw refusal;
    },
  });
  const scheduler = createCompensationFrontierScheduler(program, harness.adapters);

  await assert.rejects(
    scheduler.waitForReadiness(state),
    (error) => error === refusal,
  );
  assert.equal(preflights, 2);
  assert.deepEqual(harness.startedElementIds(), []);
});

test("refuses a material mutation behind an already owned effect occurrence", async () => {
  const state = triggeredState();
  const harness = schedulerHarness();
  const scheduler = createCompensationFrontierScheduler(program, harness.adapters);
  const readiness = scheduler.waitForReadiness(state);
  const waits = state.compensationHandlerEffectWaits ?? [];
  const first = waits[0];
  assert.ok(first !== undefined);
  const mutated = {
    ...state,
    compensationHandlerEffectWaits: [{
      ...first,
      arguments: [],
    }, ...waits.slice(1)],
  } as RuntimeState;

  assert.throws(
    () => scheduler.reconcileCommittedState(mutated),
    /changed material behind one live occurrence identity/,
  );
  harness.resolve("Effect_Undo_B", success());
  await readiness;
});

test("joins waits to exactly one active trigger and excludes competing host state", async () => {
  const state = triggeredState();
  const trigger = state.compensationTriggers?.[0];
  assert.ok(trigger !== undefined);
  const invalidStates: ReadonlyArray<RuntimeState> = [
    { ...state, compensationTriggers: [] },
    {
      ...state,
      compensationTriggers: [{ ...trigger, lifecycle: "succeeded" }],
    },
    {
      ...state,
      compensationTriggers: [
        trigger,
        {
          ...trigger,
          id: { ...trigger.id, activation: trigger.id.activation + 1 },
        },
      ],
    },
    {
      ...state,
      eventRaces: [{
        owner: trigger.owner,
        messageSubscriptionId: { ...trigger.id, elementId: "Message_Competing" },
        timerOccurrenceId: { ...trigger.id, elementId: "Timer_Competing" },
      }],
    } as RuntimeState,
  ];

  for (const invalid of invalidStates) {
    const harness = schedulerHarness();
    const scheduler = createCompensationFrontierScheduler(program, harness.adapters);
    await assert.rejects(
      scheduler.waitForReadiness(invalid),
      /does not exclusively own one trigger's committed waits/,
    );
    assert.deepEqual(harness.startedElementIds(), []);
  }
});

test("keeps malformed, patched, technical, and capacity results as host failures", async () => {
  const cases = [
    {
      label: "malformed",
      result: { kind: EffectExecutionResultKind.Success },
      failureType: "BpmnEffectExecutionResultInvalid",
    },
    {
      label: "patched",
      result: {
        kind: EffectExecutionResultKind.Success,
        localPatch: [{ name: "forbidden", value: { kind: "string", value: "x" } }],
      },
      failureType: "BpmnEffectExecutionResultInvalid",
    },
    {
      label: "technical",
      result: { kind: EffectActivityResultKind.TechnicalFailure },
      failureType: "BPMN_EFFECT_TECHNICAL_FAILURE_UNSUPPORTED",
    },
    {
      label: "capacity",
      result: {
        kind: EffectActivityResultKind.CapacityExceeded,
        budget: WorkflowChainBudgetKind.EffectActivityResultBytes,
        configuredBound: 1,
        observedValue: 2,
      },
      failureType: "BpmnEffectExecutionResultInvalid",
    },
  ] as const;

  for (const probe of cases) {
    const state = triggeredState();
    const harness = schedulerHarness();
    const scheduler = createCompensationFrontierScheduler(program, harness.adapters);
    const readiness = scheduler.waitForReadiness(state);
    harness.resolveUnknown("Effect_Undo_B", probe.result);
    await assert.rejects(
      readiness,
      (error) =>
        error instanceof ApplicationFailure &&
        error.type === probe.failureType &&
        error.nonRetryable,
      probe.label,
    );
  }
});

test("propagates cancellation-drain host failure instead of completing idle", async () => {
  const state = triggeredState();
  const harness = schedulerHarness();
  const scheduler = createCompensationFrontierScheduler(program, harness.adapters);
  const readiness = scheduler.waitForReadiness(state);
  harness.resolve("Undo_C", {
    kind: EffectExecutionResultKind.BpmnError,
    code: "compensation-rejected",
    message: null,
    localPatch: [],
  });
  const failed = committed(state, await readiness);
  scheduler.reconcileCommittedState(failed);
  const deliveryFailure = new Error("cancellation delivery failed");
  harness.reject("Effect_Undo_B", deliveryFailure);
  await assert.rejects(
    scheduler.waitForIdle(),
    (error) => error === deliveryFailure,
  );
});

function triggeredState(): RuntimeState {
  const ready = triggerReadyFixture();
  const triggered = applyStimulus(
    compensationSemanticProgram,
    ready.state,
    ready.completion,
  );
  assert.equal(triggered.outcome, CommandOutcome.Committed);
  assert.deepEqual(
    triggered.state.compensationHandlerEffectWaits?.map(({ id }) => id.elementId),
    ["Effect_Undo_B", "Undo_C"],
  );
  return triggered.state;
}

function committed(
  state: RuntimeState,
  stimulus: CompleteEffectStimulus,
): RuntimeState {
  const result = applyStimulus(compensationSemanticProgram, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

function success(): EffectActivityResult {
  return { kind: EffectExecutionResultKind.Success, localPatch: [] };
}

function assertRequestsBindCommittedWaits(
  state: RuntimeState,
  requests: ReadonlyArray<EffectRequest>,
): void {
  const waits = state.compensationHandlerEffectWaits ?? [];
  assert.equal(requests.length, waits.length);
  for (const [index, wait] of waits.entries()) {
    const material = projectCompensationEffectTransportMaterial(program, wait);
    assert.deepEqual(requests[index], {
      ...material.descriptor,
      idempotencyKey: compensationEffectTransportKey(material),
      arguments: material.arguments,
    });
  }
}

function schedulerHarness(
  options: Readonly<{
    preflightRequest?: (request: EffectRequest) => void;
  }> = {},
) {
  const requests: EffectRequest[] = [];
  const cancelled: string[] = [];
  const callbacks = new Map<string, CompensationActivityCallbacks>();
  const activation = testActivationReadiness();
  return {
    requests,
    cancelled,
    adapters: {
      preflightRequest: options.preflightRequest ?? ((_request: EffectRequest) => {}),
      startActivity(
        request: EffectRequest,
        ownerCallbacks: CompensationActivityCallbacks,
      ) {
        requests.push(request);
        const material = ownerCallbacks.material;
        callbacks.set(material.effectId.elementId, ownerCallbacks);
        return {
          cancel() {
            cancelled.push(material.effectId.elementId);
          },
        };
      },
      readiness: activation.readiness,
    },
    resolve(elementId: string, result: EffectActivityResult) {
      this.resolveUnknown(elementId, result);
    },
    resolveUnknown(elementId: string, result: unknown) {
      const callback = callbacks.get(elementId);
      assert.ok(callback !== undefined, `missing Activity ${elementId}`);
      callback.onResult(result);
    },
    reject(elementId: string, error: unknown) {
      const callback = callbacks.get(elementId);
      assert.ok(callback !== undefined, `missing Activity ${elementId}`);
      callback.onFailure(error);
    },
    startedElementIds: () =>
      [...callbacks.values()].map(({ material }) => material.effectId.elementId),
    recordedElementIds: activation.recordedElementIds,
  };
}

function testActivationReadiness(): Readonly<{
  readiness: CompensationActivationReadiness;
  recordedElementIds: () => ReadonlyArray<string>;
}> {
  let recorded: Parameters<CompensationActivationReadiness["record"]>[0][] = [];
  const allRecorded: Parameters<CompensationActivationReadiness["record"]>[0][] = [];
  let failure: unknown;
  let wake: (() => void) | undefined;
  return {
    readiness: {
      record(item) {
        recorded.push(item);
        allRecorded.push(item);
        wake?.();
      },
      recordFailure(error) {
        failure = error;
        wake?.();
      },
      async takeBatch() {
        if (recorded.length === 0 && failure === undefined) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
        await Promise.resolve();
        if (failure !== undefined) throw failure;
        const batch = recorded;
        recorded = [];
        wake = undefined;
        return batch;
      },
    },
    recordedElementIds: () =>
      allRecorded.map(({ material }) => material.effectId.elementId),
  };
}

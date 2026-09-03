import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  EffectExecutionResultKind,
  applyStimulus,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState } from "@bpmn-lean/semantic-core";
import { completeEffectStimulus } from "@bpmn-lean/temporal-protocol";

import {
  compensationSemanticProgram,
  triggerReadyFixture,
} from "../../../semantic-core/test/compensation-trigger-handler-semantic-fixtures.ts";
import {
  legacyEffectActivityPolicy,
} from "../dist/index.js";
import type {
  CompensationFrontierScheduler,
} from "../dist/index.js";
import { waitForHostReadiness } from "../dist/workflow-host-readiness.js";

test("routes a Compensation frontier through its scheduler instead of the single-effect host", async () => {
  const state = triggeredState();
  const wait = state.compensationHandlerEffectWaits?.[0];
  assert.ok(wait !== undefined);
  const completion = completeEffectStimulus(wait.id, {
    kind: EffectExecutionResultKind.Success,
    localPatch: [],
  });
  const pending = [];
  let genericExecutions = 0;
  const compensationScheduler = {
    ownsCommittedFrontier: () => true,
    waitForReadiness: async () => completion,
    reconcileCommittedState: () => undefined,
    hasUnreconciledActivities: () => true,
    waitForIdle: async () => undefined,
  } satisfies CompensationFrontierScheduler;

  await waitForHostReadiness({
    state,
    semanticProcess: compensationSemanticProgram,
    pendingStimuli: pending,
    acceptedStimuli: [],
    eventRaceScheduler: {
      waitForReadiness: async () => [],
      reconcileCommittedState: () => undefined,
    },
    messageBoundedActivityScheduler: {
      hasPendingCallbacks: () => false,
      ownsCommittedPair: () => false,
      recordMessageCallback: () => false,
      recordCompletionCallback: () => false,
      waitForReadiness: async () => [],
    },
    boundedDeadlineSchedulers: [],
    compensationScheduler,
    waitForTimer: async () => undefined,
    executeEffect: async () => {
      genericExecutions += 1;
      throw new Error("Compensation must not use the sequential effect host");
    },
    effectActivityPolicy: legacyEffectActivityPolicy,
    failCapacity: () => {
      throw new Error("capacity must not fail");
    },
    reserveStimulus: () => true,
    hostRecheckRequested: () => false,
  });

  assert.deepEqual(pending, [completion]);
  assert.equal(genericExecutions, 0);
});

function triggeredState(): RuntimeState {
  const ready = triggerReadyFixture();
  const triggered = applyStimulus(
    compensationSemanticProgram,
    ready.state,
    ready.completion,
  );
  assert.equal(triggered.outcome, CommandOutcome.Committed);
  return triggered.state;
}

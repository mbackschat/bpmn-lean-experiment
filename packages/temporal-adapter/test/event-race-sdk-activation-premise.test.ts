/** Locks the Event-race scheduler against installed-SDK split batching and fixed-priority bypass. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertPinnedSingleBatchSource,
  readInstalledPinnedSdkActivationSource,
  requireFixedMessagePriorityCoreBypass,
  requireMessageCoreAdvancement,
  requireOrderingUnavailable,
  requireSplitBatchPriorityExposure,
  runEventRaceSdkActivationWitness,
} from "./event-race-sdk-activation-witness.ts";

const activationWitness = runEventRaceSdkActivationWitness();

test("the pinned SDK closes one Signal and Timer activation before semantic advancement", async () => {
  const witness = await activationWitness;
  requireOrderingUnavailable(witness.ordinaryDualReadyCompletion);
  requireMessageCoreAdvancement(witness.separateReadyCompletion);
  requireSplitBatchPriorityExposure(witness.disabledPremiseCompletion);
  assert.throws(
    () => requireOrderingUnavailable(witness.disabledPremiseCompletion),
    /BpmnEventRaceOrderingUnavailable/u,
  );
});

test("the installed pinned SDK source lock rejects removal of single-batch activation processing", async () => {
  const source = await readInstalledPinnedSdkActivationSource();
  assertPinnedSingleBatchSource(source);
  const mutation = source.replace(
    /const doSingleBatch = [^;]+;/u,
    "const doSingleBatch = false;",
  );
  assert.notEqual(mutation, source);
  assert.throws(
    () => assertPinnedSingleBatchSource(mutation),
    /ProcessWorkflowActivationJobsAsSingleBatch/u,
  );
});

test("fixed Message priority and core bypass cannot replace coalesced failure", async () => {
  const witness = await activationWitness;
  requireFixedMessagePriorityCoreBypass(
    witness.fixedPriorityCoreBypassCompletion,
  );
  assert.throws(
    () => requireOrderingUnavailable(witness.fixedPriorityCoreBypassCompletion),
    /BpmnEventRaceOrderingUnavailable/u,
  );
});

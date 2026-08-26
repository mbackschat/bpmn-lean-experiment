import assert from "node:assert/strict";
import test from "node:test";

import {
  ParallelMultiInstanceCapacityTopology,
  retainedParallelMultiInstanceHistoryMeasurement,
  requireParallelMultiInstanceHistoryCapacity,
} from "@bpmn-lean/temporal-workflow";

import {
  measureParallelMultiInstanceHistoryCapacity,
} from "./parallel-multi-instance-history-capacity-probe.ts";

test("selects exact 16 only after every maximal parallel topology fits", async () => {
  const measurement = await measureParallelMultiInstanceHistoryCapacity();
  const capacity = requireParallelMultiInstanceHistoryCapacity(measurement);

  assert.deepEqual(measurement, retainedParallelMultiInstanceHistoryMeasurement);
  assert.equal(capacity.selectedMaximumItems, 16);
  assert.equal(measurement.canonicalMaximumCollectionBytes, 8_192);
  assert.equal(measurement.exactLimitAdmitted, true);
  assert.equal(measurement.limitPlusOneRefusedWithoutMutation, true);
  assert.deepEqual(measurement.topologies.map(({ topology }) => topology), [
    ParallelMultiInstanceCapacityTopology.Natural,
    ParallelMultiInstanceCapacityTopology.TimerInterruption,
    ParallelMultiInstanceCapacityTopology.EarlyCompletion,
  ]);
  assert.equal(
    capacity.maximumMeasuredActivationEvents < capacity.activationEventReserve,
    true,
  );
  assert.equal(
    capacity.maximumMeasuredHistoryEnvelopeBytes < capacity.activationByteReserve,
    true,
  );
});

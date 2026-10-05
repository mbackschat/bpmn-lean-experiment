import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowChainBudgetKind, workflowChainProductionLimit } from "@bpmn-lean/temporal-protocol";
import { assessOrdinaryEffectHistoryReservation, OrdinaryEffectHistoryReservationKind as Kind }
  from "../dist/ordinary-effect-history-reservation.js";

const limits = { eventHistoryEventLimit: 8_000, eventHistoryByteLimit: 8 * 1024 * 1024 };
const history = { historyLength: 0, historySize: 0 };
const input = { limits, history, issuedActivities: 0, requestBytes: [100], hasRetainedWork: true };

test("reserves the whole population and one completion Workflow Task per issued Activity", () => {
  const one = assessOrdinaryEffectHistoryReservation(input);
  const three = assessOrdinaryEffectHistoryReservation({ ...input, requestBytes: [100, 100, 100] });
  assert.deepEqual(one, { kind: Kind.Ready, reservedEvents: 80, reservedBytes: 1_638_500 });
  assert.equal(three.reservedEvents - one.reservedEvents, 12);
  assert.equal(three.reservedBytes - one.reservedBytes, 2 * (100 + 65536 + 6 * 4096));
  assert.deepEqual(assessOrdinaryEffectHistoryReservation({ ...input, issuedActivities: 2, requestBytes: [100] }),
    { ...three, reservedBytes: three.reservedBytes - 200 });
  assert.deepEqual(assessOrdinaryEffectHistoryReservation({ ...input, requestBytes: Array<number>(64).fill(100) }),
    { kind: Kind.Ready, reservedEvents: 458, reservedBytes: 7_321_856 });
});

test("admits exact remaining headroom and requests rollover one byte or Event beyond it", () => {
  const cost = assessOrdinaryEffectHistoryReservation(input);
  const exact = { historyLength: limits.eventHistoryEventLimit - cost.reservedEvents,
    historySize: limits.eventHistoryByteLimit - cost.reservedBytes };
  assert.equal(assessOrdinaryEffectHistoryReservation({ ...input, history: exact }).kind, Kind.Ready);
  for (const beyond of [{ ...exact, historyLength: exact.historyLength + 1 }, { ...exact, historySize: exact.historySize + 1 }]) {
    assert.equal(assessOrdinaryEffectHistoryReservation({ ...input, history: beyond }).kind, Kind.Rollover);
    assert.equal(assessOrdinaryEffectHistoryReservation({ ...input, history: beyond, hasRetainedWork: false }).kind, Kind.CapacityExceeded);
  }
});

test("refuses a frontier that cannot fit a fresh Run without looping or splitting it", () => {
  const result = assessOrdinaryEffectHistoryReservation({ ...input, hasRetainedWork: false,
    requestBytes: Array<number>(64).fill(workflowChainProductionLimit(WorkflowChainBudgetKind.EffectActivityRequestBytes)) });
  assert.equal(result.kind, Kind.CapacityExceeded);
  if (result.kind !== Kind.CapacityExceeded) assert.fail();
  assert.equal(result.failure.budget, WorkflowChainBudgetKind.EventHistoryBytes);
  assert.equal(result.failure.configuredBound, limits.eventHistoryByteLimit);
  assert.ok(result.failure.observedValue > result.failure.configuredBound);
});

test("drains issued work under pressure even before the fresh Run has committed a callback", () => {
  const result = assessOrdinaryEffectHistoryReservation({ ...input, issuedActivities: 2, requestBytes: [],
    hasRetainedWork: false, history: { historyLength: 8_000, historySize: 0 } });
  assert.equal(result.kind, Kind.Rollover);
});

test("rejects malformed measurements and ceilings above the production contract", () => {
  for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => assessOrdinaryEffectHistoryReservation({ ...input, issuedActivities: value }));
    assert.throws(() => assessOrdinaryEffectHistoryReservation({ ...input, requestBytes: [value] }));
    assert.throws(() => assessOrdinaryEffectHistoryReservation({ ...input, history: { ...history, historySize: value } }));
  }
  assert.throws(() => assessOrdinaryEffectHistoryReservation({ ...input,
    limits: { ...limits, eventHistoryByteLimit: limits.eventHistoryByteLimit + 1 } }));
});

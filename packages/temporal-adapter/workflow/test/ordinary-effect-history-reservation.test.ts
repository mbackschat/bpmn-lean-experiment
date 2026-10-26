import assert from "node:assert/strict";
import test from "node:test";
import { nestedScopeControlServiceTaskLimit } from "@bpmn-lean/semantic-core";
import { WorkflowChainBudgetKind, workflowChainProductionLimit } from "@bpmn-lean/temporal-protocol";
import { assessOrdinaryEffectHistoryReservation, OrdinaryEffectHistoryReservationKind as Kind }
  from "../dist/ordinary-effect-history-reservation.js";
import { workflowChainHistoryEventEnvelopeBytes } from "../dist/workflow-event-history-capacity.js";

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
    assert.equal(assessOrdinaryEffectHistoryReservation({ ...input, history: beyond, hasRetainedWork: false }).kind, Kind.Ready);
  }
});

test("fresh-Run headroom is finite and reports the configured trigger with the projected total", () => {
  const cost = assessOrdinaryEffectHistoryReservation(input);
  const exact = { historyLength: 10_240 - cost.reservedEvents, historySize: 10 * 1024 * 1024 - cost.reservedBytes };
  const fresh = { ...input, history: exact, hasRetainedWork: false };
  assert.equal(assessOrdinaryEffectHistoryReservation(fresh).kind, Kind.Ready);
  for (const [budget, history] of [
    [WorkflowChainBudgetKind.EventHistoryEvents, { ...exact, historyLength: exact.historyLength + 1 }],
    [WorkflowChainBudgetKind.EventHistoryBytes, { ...exact, historySize: exact.historySize + 1 }],
  ] as const) {
    const result = assessOrdinaryEffectHistoryReservation({ ...fresh, history });
    assert.equal(result.kind, Kind.CapacityExceeded);
    if (result.kind !== Kind.CapacityExceeded) assert.fail();
    assert.equal(result.failure.budget, budget);
    assert.equal(result.failure.configuredBound, workflowChainProductionLimit(budget));
    assert.equal(result.failure.observedValue, budget === WorkflowChainBudgetKind.EventHistoryEvents
      ? 10_241 : 10 * 1024 * 1024 + 1);
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

test("an exact concurrent scope Service Task frontier fits a fresh Run below its rollover triggers", () => {
  // CSE hosting preflight: worst-case request bytes and a start History carrying the largest Continue-As-New arguments.
  // Retained work withholds the protected overshoot reserve, so Ready means the drain fits below the triggers.
  const limit = (kind: WorkflowChainBudgetKind) => workflowChainProductionLimit(kind);
  const frontier = Array<number>(nestedScopeControlServiceTaskLimit).fill(limit(WorkflowChainBudgetKind.EffectActivityRequestBytes));
  const start = { historyLength: 3, historySize: limit(WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes) +
    3 * workflowChainHistoryEventEnvelopeBytes };
  const result = assessOrdinaryEffectHistoryReservation({ limits, history: start, issuedActivities: 0,
    requestBytes: frontier, hasRetainedWork: true });
  assert.equal(result.kind, Kind.Ready);
  assert.ok(nestedScopeControlServiceTaskLimit + limit(WorkflowChainBudgetKind.ConcurrentInFlightUpdates) <=
    limit(WorkflowChainBudgetKind.SemanticInputQueueEntries));
});

test("drains issued work under pressure even before the fresh Run has committed a callback", () => {
  const result = assessOrdinaryEffectHistoryReservation({ ...input, issuedActivities: 2, requestBytes: [],
    hasRetainedWork: false, history: { historyLength: 8_000, historySize: 0 } });
  assert.equal(result.kind, Kind.Rollover);
});

test("a fresh Run can use the declared overshoot reserve beyond a lowered rollover trigger", () => {
  for (const lowered of [
    { ...limits, eventHistoryEventLimit: 4 },
    { ...limits, eventHistoryByteLimit: 48 * 1024 },
  ]) {
    const result = assessOrdinaryEffectHistoryReservation({ ...input, limits: lowered,
      history: { historyLength: 5, historySize: 1024 }, hasRetainedWork: false });
    assert.equal(result.kind, Kind.Ready);
  }
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

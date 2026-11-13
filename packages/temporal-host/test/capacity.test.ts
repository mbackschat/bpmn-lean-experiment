/**
 * The Workflow-chain capacity table's pure rules, each at its exact bound and one past it: the candidate bounds in their
 * refusal order, the rollover triggers, the Update fence, the Run count, the failure projection, Query paging, and the
 * population ingress's continuation bound. The hosts' own witnesses run real inputs through them
 * (`memory-host-capacity.test.ts`, `host-capacity.temporal-test.ts`).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { JsonValue, PopulationPort, Wire } from "../src/port.ts";

const capacity = await import(new URL("../dist/capacity.js", import.meta.url).href) as typeof import("../src/capacity.ts");
const publication = await import(new URL("../dist/publication.js", import.meta.url).href) as typeof import("../src/publication.ts");
const population = await import(new URL("../dist/population.js", import.meta.url).href) as typeof import("../src/population.ts");
const carry = await import(new URL("../dist/population-carry.js", import.meta.url).href) as typeof import("../src/population-carry.ts");
const { canonicalJson } = await import(new URL("../dist/canonical-json.js", import.meta.url).href) as
  typeof import("../src/canonical-json.ts");
const { CapacityBound, chainCapacity } = capacity;

const KiB = 1_024;

test("the table holds the approved values with the two raises of 2026-11-13", () => {
  assert.deepEqual(chainCapacity, {
    historyEvents: 8_000, historyBytes: 8 * KiB * KiB, retainedPublicationBytes: 2 * KiB * KiB, updatesPerRun: 1_500,
    updatesInFlight: 8, pendingActivities: 32, pendingTimers: 64, programBytes: 192 * KiB, startBytes: 64 * KiB,
    stimulusBytes: 64 * KiB, stateBytes: 256 * KiB, publicationBatchBytes: 64 * KiB, queryBytes: 192 * KiB,
    effectRequestBytes: 64 * KiB, effectResultBytes: 64 * KiB, effectFailureBytes: 16 * KiB, continuationBytes: 448 * KiB, runs: 128,
  });
  assert.equal(capacity.capacityCode(CapacityBound.PublicationBatch), "host.capacity.publicationBatch");
});

test("UTF-8 bytes are counted as an encoder writes them, and an object's bytes follow from its members'", () => {
  for (const text of ["", "ascii", "é", "€", "😀", "a\u{10FFFF}b", "\ud800", "\"\\\n"]) {
    assert.equal(capacity.utf8Bytes(text), new TextEncoder().encode(text).length, JSON.stringify(text));
  }
  const value = { state: { b: [1, "ü"], a: null }, cursor: { revision: 12 }, kind: "continue", "ke\"y": "😀" };
  const members = Object.fromEntries(Object.entries(value).map(([key, member]) => [key, capacity.canonicalBytes(member)]));
  assert.equal(capacity.objectBytes(members), capacity.canonicalBytes(value));
  assert.equal(capacity.objectBytes({ a: 1, absent: undefined }), capacity.canonicalBytes({ a: 1 }));
});

const fitting: import("../src/capacity.ts").ChainMeasures = {
  stateBytes: chainCapacity.stateBytes,
  batchBytes: chainCapacity.publicationBatchBytes,
  activityRequestBytes: Array.from({ length: chainCapacity.pendingActivities }, () => chainCapacity.effectRequestBytes),
  timers: chainCapacity.pendingTimers,
  continuationBytes: chainCapacity.continuationBytes,
};

test("a candidate exactly at every chain bound fits, and one unit past any bound is refused with that bound", () => {
  assert.equal(capacity.chainRefusal(fitting), null);
  const over = (change: Partial<typeof fitting>) => capacity.chainRefusal({ ...fitting, ...change });
  assert.equal(over({ stateBytes: chainCapacity.stateBytes + 1 }), CapacityBound.State);
  assert.equal(over({ batchBytes: chainCapacity.publicationBatchBytes + 1 }), CapacityBound.PublicationBatch);
  assert.equal(over({ activityRequestBytes: [...fitting.activityRequestBytes, 1] }), CapacityBound.PendingActivities);
  assert.equal(over({ activityRequestBytes: [chainCapacity.effectRequestBytes + 1] }), CapacityBound.EffectRequest);
  assert.equal(over({ timers: chainCapacity.pendingTimers + 1 }), CapacityBound.PendingTimers);
  assert.equal(over({ continuationBytes: chainCapacity.continuationBytes + 1 }), CapacityBound.Continuation);
  assert.equal(over({ stateBytes: chainCapacity.stateBytes + 1, continuationBytes: chainCapacity.continuationBytes + 1 }),
    CapacityBound.State, "the first bound in order wins");
});

const quiet: import("../src/capacity.ts").RunUsage =
  { historyEvents: 0, historyBytes: 0, continueAsNewSuggested: false, updates: 0, retainedPublicationBytes: 0 };

test("each rollover trigger fires exactly at its bound, and a test's lower event budget wins over the table's", () => {
  const budget = capacity.eventBudget(10_000, null);
  assert.equal(budget, chainCapacity.historyEvents, "the table caps a larger derived budget");
  assert.equal(capacity.eventBudget(7_168, null), 7_168, "a program's lower budget stays");
  assert.equal(capacity.eventBudget(7_168, 12), 12, "a test override");
  const due = (change: Partial<typeof quiet>) => capacity.rolloverDue({ ...quiet, ...change }, budget);
  assert.equal(due({}), false);
  assert.equal(due({ historyEvents: budget - 1 }), false);
  assert.equal(due({ historyEvents: budget }), true);
  assert.equal(due({ historyBytes: chainCapacity.historyBytes - 1 }), false);
  assert.equal(due({ historyBytes: chainCapacity.historyBytes }), true);
  assert.equal(due({ updates: chainCapacity.updatesPerRun - 1 }), false);
  assert.equal(due({ updates: chainCapacity.updatesPerRun }), true);
  const room = chainCapacity.retainedPublicationBytes - chainCapacity.publicationBatchBytes;
  assert.equal(due({ retainedPublicationBytes: room }), false, "a full batch still fits");
  assert.equal(due({ retainedPublicationBytes: room + 1 }), true);
  assert.equal(due({ continueAsNewSuggested: true }), true);
});

test("a caller's Update is fenced at the Run's accepted count and at the in-flight count", () => {
  assert.equal(capacity.updateFence(chainCapacity.updatesPerRun - 1, chainCapacity.updatesInFlight - 1), null);
  assert.equal(capacity.updateFence(chainCapacity.updatesPerRun, 0), CapacityBound.Updates);
  assert.equal(capacity.updateFence(0, chainCapacity.updatesInFlight), CapacityBound.UpdatesInFlight);
});

test("the 128th Run is the last; a chain needing a 129th has none", () => {
  assert.equal(capacity.successorRun(1), 2);
  assert.equal(capacity.successorRun(chainCapacity.runs - 1), chainCapacity.runs);
  assert.equal(capacity.successorRun(chainCapacity.runs), null);
});

test("an Activity failure's message reaches the halt up to the projection bound, and its code beyond it", () => {
  const exact = "é".repeat(chainCapacity.effectFailureBytes / 2);
  assert.equal(capacity.failureProjection(exact), exact);
  assert.equal(capacity.failureProjection(`${exact}x`), "host.capacity.effectFailure");
});

test("a large Query answer travels in pages within the Query bound that join to the same value", async () => {
  const value = { kind: "state", text: "é\"\\😀".repeat(40_000), list: Array.from({ length: 5_000 }, (_, index) => ({ index })) };
  const pages: import("../src/capacity.ts").TextPage[] = [];
  const joined = await capacity.readPages(async (from) => {
    const page = capacity.textPage(value, from);
    pages.push(page);
    return page;
  });
  assert.deepEqual(joined, value);
  assert.ok(pages.length > 1);
  for (const page of pages) assert.ok(capacity.canonicalBytes(page) <= chainCapacity.queryBytes);
  // The largest prefix: one more code point would not fit.
  const first = pages[0]!;
  const whole = canonicalJson(value);
  const unit = (whole.codePointAt(first.text.length) ?? 0) > 0xffff ? 2 : 1;
  assert.ok(capacity.canonicalBytes({ ...first, text: whole.slice(0, first.text.length + unit) }) > chainCapacity.queryBytes);
  assert.deepEqual(await capacity.readPages(async (from) => capacity.textPage(null, from)), null);
});

test("a reader joining pages of an answer that changed reads it again from the start", async () => {
  let calls = 0;
  const value = (version: number) => ({ version, text: "x".repeat(300_000) });
  const joined = await capacity.readPages(async (from) => capacity.textPage(value(calls++ < 1 ? 1 : 2), from));
  assert.deepEqual(joined, value(2));
});

test("a publication page holds the largest prefix of whole input batches within the Query bound", () => {
  let log = publication.openLog(publication.initialCursor);
  const journal = (index: number) => Array.from({ length: 200 }, () =>
    ({ cause: { kind: "arrive", flow: `Flow_${"f".repeat(100)}${String(index)}` }, element: "Task", owner: 0, started: [], ended: [] }));
  for (let index = 0; index < 40; index += 1) log = publication.appendJournal(log, `c${String(index)}`, journal(index));
  assert.equal(log.retainedBytes, log.batchBytes.reduce((sum, bytes) => sum + bytes, 0));
  const page = publication.readPage(log, 0, 100);
  assert.equal(page.kind, publication.PageKind.Available);
  if (page.kind !== publication.PageKind.Available) return;
  assert.ok(page.execution.length > 0 && page.execution.length < 40);
  assert.equal(page.occurrences.length, page.execution.length);
  assert.ok(capacity.canonicalBytes(page) <= chainCapacity.queryBytes);
  const extended = publication.readPage({ ...log, execution: log.execution, batchBytes: log.batchBytes.map(() => 0) }, 0, page.execution.length + 1);
  assert.ok(extended.kind === publication.PageKind.Available && capacity.canonicalBytes(extended) > chainCapacity.queryBytes,
    "one more batch would pass the bound");
});

/** A port no ingress rule here asks anything of: no fan-out is in flight. */
const silent = new Proxy({}, { get: (_target, name: string) => { throw new TypeError(`unexpected kernel question ${name}`); } }) as
  PopulationPort<never, never, Wire>;
const frame = { population: "P", config: { scheduling: "external", effectStartToCloseMs: 60_000, historyEventBudget: null }, rolloverEvents: null,
  continuationBytes: chainCapacity.continuationBytes, queryBytes: chainCapacity.queryBytes } as
  import("../src/population-carry.ts").IngressFrame;
type IngressState = import("../src/population.ts").IngressState<Wire>;
const ingressBytes = (state: IngressState) => carry.restingIngressBytes(frame, state);

test("an ingress command is refused past the stimulus bound or past the continuation bound less the answer reserve, and fits exactly at either", () => {
  const admissible = chainCapacity.continuationBytes - carry.answerReserve(frame);
  const command = (bytes: number) => {
    const shell = { kind: "publish", payload: "" };
    return { ...shell, payload: "p".repeat(bytes - capacity.canonicalBytes(shell)) };
  };
  assert.equal(capacity.canonicalBytes(command(chainCapacity.stimulusBytes)), chainCapacity.stimulusBytes);
  const accepted = population.enqueueCommand(frame, population.emptyIngress, "c", "publish", command(chainCapacity.stimulusBytes), "d", []);
  assert.ok("ticket" in accepted);
  assert.deepEqual(population.enqueueCommand(frame, population.emptyIngress, "c", "publish", command(chainCapacity.stimulusBytes + 1), "d", []),
    { refused: "host.capacity.stimulus" });
  let state: IngressState = population.emptyIngress;
  for (let index = 0; ingressBytes(state) + chainCapacity.stimulusBytes + 200 < admissible; index += 1) {
    const next = population.enqueueCommand(frame, state, `c${String(index)}`, "publish", command(chainCapacity.stimulusBytes - 500), "d", []);
    assert.ok("state" in next);
    state = next.state;
  }
  const probe = population.enqueueCommand(frame, state, "last", "publish", { kind: "publish", payload: "" }, "d", []);
  assert.ok("state" in probe);
  const exact = { kind: "publish", payload: "p".repeat(admissible - ingressBytes(probe.state)) };
  const fits = population.enqueueCommand(frame, state, "last", "publish", exact, "d", []);
  assert.ok("state" in fits && ingressBytes(fits.state) === admissible, "exact fit");
  const over = population.enqueueCommand(frame, state, "last", "publish", { ...exact, payload: `${exact.payload}p` }, "d", []);
  assert.equal("refused" in over ? over.refused : "accepted", carry.ingressContinuationCode);
});

// The settled answer of the item in flight is the one growth admission cannot see when it admits: it reserves room for
// the largest answer the Query bound lets a command settle, so a near-full ingress refuses new work rather than fail
// when an answer lands.
test("a near-full ingress refuses a command at admission, keeping room for the answer in flight", () => {
  const registration = (index: number) => ({ workflowId: `W${String(index)}`, processInstanceId: `I${String(index)}`, deploymentId: 1,
    revision: 1, addresses: [{ occurrence: { processInstanceId: `I${String(index)}`, elementId: "Catch", activation: 1 }, signal: { name: "S" } }] });
  // Built in one step from one entry's bytes; registering one by one would re-measure the whole ingress each time.
  const entry = ingressBytes({ ...population.emptyIngress, registrations: [registration(10_000)] }) - ingressBytes(population.emptyIngress);
  const count = Math.ceil((chainCapacity.continuationBytes - chainCapacity.queryBytes - ingressBytes(population.emptyIngress)) / entry);
  const state: IngressState = { ...population.emptyIngress, registrations: Array.from({ length: count }, (_, index) => registration(10_000 + index)) };
  assert.ok(ingressBytes(state) >= chainCapacity.continuationBytes - chainCapacity.queryBytes);
  const command = { kind: "broadcast", commandId: "c", variables: [], address: { signalRef: { id: "S", namespace: "urn:t" } } };
  assert.ok(ingressBytes(state) + capacity.canonicalBytes(command) + 200 < chainCapacity.continuationBytes, "the command alone would fit");
  // Compared as its refusal alone: a failing comparison would otherwise render the whole near-full state.
  const refused = population.enqueueCommand(frame, state, "c", "broadcast", command, "d", []);
  assert.equal("refused" in refused ? refused.refused : "accepted", carry.ingressContinuationCode);
  // Healthy: nothing changed, and once a chain leaves, the same command is taken.
  const [left] = population.register(frame, state, { ...registration(0), revision: 2, addresses: [] });
  const shrunk = { ...left, registrations: left.registrations.slice(0, -40) };
  assert.ok("ticket" in population.enqueueCommand(frame, shrunk, "c", "broadcast", command, "d", []));
});

test("the answer reserve is the Query bound plus the ledger entry's fixed overhead, exactly", () => {
  const settledShell = '{"kind":"settled","answer":}';
  const ledgerShell = '{"kind":"command","commandId":,"digest":,"answer":}';
  assert.equal(carry.answerReserve(frame), chainCapacity.queryBytes + ledgerShell.length - settledShell.length);
  // A command whose `populationResult` answer fills the Query bound exactly grows the resting ingress by exactly the
  // reserve when it settles: its ledger entry, less the identifiers its queue entry already carried.
  const answer = (pad: number) => ({ commandId: "c\u00e9", ordinal: 1, atMs: 0, resolution: { kind: "fanOut", entries: ["x".repeat(pad)] }, chain: null });
  const shell = capacity.canonicalBytes({ kind: "settled", answer: answer(0) });
  const full = answer(chainCapacity.queryBytes - shell);
  assert.equal(capacity.canonicalBytes({ kind: "settled", answer: full }), chainCapacity.queryBytes);
  const entry = { kind: "command", commandId: "c\u00e9", digest: "d\"", answer: full };
  assert.equal(capacity.canonicalBytes(entry) - capacity.canonicalBytes("c\u00e9") - capacity.canonicalBytes("d\""), carry.answerReserve(frame));
});

test("the ledger yields its oldest answers to the continuation bound, exactly as many as it must", () => {
  const settled = (index: number): import("../src/population.ts").Settled => ({
    kind: "command", commandId: `c${String(index)}`, digest: "d",
    answer: { commandId: `c${String(index)}`, ordinal: index, atMs: 0, resolution: "r".repeat(20_000) as JsonValue, chain: null },
  });
  const ledger = Array.from({ length: 30 }, (_, index) => settled(index));
  const full: IngressState = { ...population.emptyIngress, ledger };
  assert.ok(ingressBytes(full) > chainCapacity.continuationBytes);
  const fitted = carry.fittedAtRest(frame, full);
  assert.ok(fitted !== null);
  assert.ok(ingressBytes(fitted) <= chainCapacity.continuationBytes);
  assert.deepEqual(fitted.ledger, ledger.slice(ledger.length - fitted.ledger.length), "the oldest go first");
  assert.ok(ingressBytes({ ...full, ledger: ledger.slice(ledger.length - fitted.ledger.length - 1) }) > chainCapacity.continuationBytes,
    "one more retained answer would not fit");
  const registrations = Array.from({ length: 6_000 }, (_, index) =>
    ({ workflowId: `W${String(index)}`, processInstanceId: `I${String(index)}`, deploymentId: 1, revision: 1, addresses: [] }));
  assert.equal(carry.fittedAtRest(frame, { ...full, registrations }), null, "nothing else yields");
});

/** An ingress whose emit of `entries` is in flight and only waits to settle, beside `ledger`. */
function settling(entries: JsonValue, ledger: IngressState["ledger"]): IngressState {
  return {
    ...population.emptyIngress, ledger, ordinal: 1,
    current: {
      item: { kind: "emit", ticket: null, reference: { workflowId: "W", commandId: "i", count: 1, digest: "" } },
      ordinal: 0, atMs: 0, command: null, view: null, phase: { kind: "settleEmit", entries }, routes: [], reached: 0,
    },
  } as unknown as IngressState;
}

test("an item that settles past the continuation bound evicts the ledger, and fails the ingress closed when that cannot fit it", () => {
  const old = (index: number): IngressState["ledger"][number] =>
    ({ kind: "emit", workflowId: "W", commandId: `old${String(index)}`, entries: "e".repeat(100_000) });
  const answerSettled = (state: IngressState) => population.answer(silent, frame, state, { kind: "settled" }, 1_000);
  const fitted = answerSettled(settling("n".repeat(100_000), [0, 1, 2, 3].map(old)));
  assert.deepEqual(fitted.ledger.map((entry) => entry.commandId), ["old1", "old2", "old3", "i"], "the oldest answer yields");
  assert.ok(ingressBytes(fitted) <= chainCapacity.continuationBytes);
  // Hand-built past anything admission lets settle (`handoff-capacity.test.ts`): the guard of a broken invariant.
  assert.throws(() => answerSettled(settling("n".repeat(chainCapacity.continuationBytes), [old(0)])),
    carry.IngressCapacityExceeded, "never carried on past the bound");
});

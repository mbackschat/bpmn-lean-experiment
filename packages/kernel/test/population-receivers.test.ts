/**
 * The population functions a host shares with the population runner (`Kernel/Population/*.lean`, ARCHITECTURE-SPEC
 * "Population ingress"): the per-instance and per-deployment receivers, their linearization, the occurrence reach, the
 * fan-out machine, the Conditional start verdict, deployment registration over summaries and the Timer start check.
 * Each runs as a kernel fixture (`Kernel/Run/Fixture.lean`), so the Lean kernel answers the same documents.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./lean-paired.ts";

import {
  activity, base, catchEvent, duration, end, eventBased, flow, gateway, juel, message, qName, start, text, userWork, wired,
  withOptions,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const signalOf = (localName: string): Json => ({ signal: { payload: { signalRef: qName(localName), name: text(localName) } } });
/** A Signal address as a stimulus states it. */
const sig: Json = { signalRef: { id: "Sig" } };
const orderMessage = message({ messageRef: "M_Order", name: text("Order") });
const order: Json = { kind: "directMessage", messageId: "M_Order" };

/** `key`'s program with `elements` and `flows`, every flow list rebuilt from the flows. */
function program(key: string, elements: Json[], flows: Json[], options: Json = {}): Json {
  const shaped = wired(withOptions({ ...base(), elements, flows }, options));
  return { ...shaped, identity: { ...(shaped.identity as Json), processId: key, sourceSha256: `${key}-sha` } };
}

/** The start of the instance `I` carrying `businessKey`. */
const begin = (businessKey: string | null = null): Json =>
  ({ kind: "start", commandId: "start", instanceId: "I", variables: [], ...(businessKey === null ? {} : { businessKey }) });

/**
 * An Event-Based Gateway whose arms catch `Sig` at `Z1`, `Other` at `M2` and `Sig` at `A3`, in that flow order, under
 * `options`.
 */
const fork = (options: Json = {}): Json => program("Forked",
  [start("S"), gateway("G", eventBased()), catchEvent("Z1", signalOf("Sig")), catchEvent("M2", signalOf("Other")),
    catchEvent("A3", signalOf("Sig")), end("E1"), end("E2"), end("E3")],
  [flow("f1", "S", "G"), flow("g1", "G", "Z1"), flow("g2", "G", "M2"), flow("g3", "G", "A3"), flow("h1", "Z1", "E1"),
    flow("h2", "M2", "E2"), flow("h3", "A3", "E3")], options);
const forked = fork();

/** A root start of `trigger` leading to the User Task `T`. */
const starter = (key: string, trigger: Json, options: Json = {}): Json =>
  program(key, [start("S", trigger), activity("T", userWork()), end("E")], [flow("f1", "S", "T"), flow("f2", "T", "E")], options);

/** A none start to a catch `C` of `M_Order` named `Order`, under CIB's API criteria and `options`. */
const waiter = (options: Json = {}): Json =>
  program("Waiter", [start("S"), catchEvent("C", orderMessage), end("E")], [flow("f1", "S", "C"), flow("f2", "C", "E")],
    { messageCorrelation: "apiCriteria", ...options });

/** A publication to a channel or a name, in a population scenario's form. */
const publication = (address: Json, businessKey: string | null = null): Json => ({
  commandId: "p", address, criteria: [], variables: [], mode: "any", ...(businessKey === null ? {} : { businessKey }),
});

const ref = (processInstanceId: string, elementId: string, activation = 0): Json => ({ processInstanceId, elementId, activation });
const at = (target: Json): Json => ({ kind: "occurrence", occurrence: target });
const startOf = (deploymentId: number, startEvent: string): Json => ({ kind: "start", deploymentId, startEvent });

test("signalReceiversOf lists one running instance's open items of an address in arming order, none for its emitter", () => {
  const receivers = (stimuli: Json[], address: Json, emitter: string | null, deployed = forked): unknown =>
    fixture("signalReceivers", [deployed], { stimuli, address, emitter });
  assert.deepEqual(receivers([begin()], sig, null), [ref("I", "Z1", 1), ref("I", "A3", 1)]);
  assert.deepEqual(receivers([begin()], sig, "I"), []);
  assert.deepEqual(receivers([begin()], { signalRef: { id: "None" } }, null), []);
  const caught = { kind: "deliver", commandId: "d", occurrence: ref("I", "Z1", 1), trigger: { kind: "signal", ...sig } };
  // A delivery addresses one occurrence only under occurrence-targeted Signal delivery.
  const targeted = fork({ signalDelivery: "occurrenceTargeted" });
  assert.deepEqual(receivers([begin()], sig, null, targeted), [ref("I", "Z1", 1), ref("I", "A3", 1)]);
  assert.deepEqual(receivers([begin(), caught], sig, null, targeted), [], "a completed instance has no receiver");
});

test("signalStartReceivers names a deployment's root Signal starts of the address by public identifier", () => {
  const starts = (deploymentId: number, deployed: Json): unknown =>
    fixture("signalStartReceivers", [deployed], { deploymentId, address: sig, variables: [] });
  assert.deepEqual(starts(2, starter("Shift", signalOf("Sig"))), [startOf(2, "S")]);
  assert.deepEqual(starts(3, starter("Other", signalOf("Else"))), []);
  assert.deepEqual(starts(4, starter("Messaged", orderMessage)), []);
});

test("linearizeReceivers orders occurrences by process instance, each list's own order kept, then starts by deployment", () => {
  const linearized = fixture("linearizeReceivers", [], {
    waiting: [
      { processInstanceId: "B", occurrences: [ref("B", "x")] }, { processInstanceId: "A", occurrences: [ref("A", "z"), ref("A", "a")] },
      { processInstanceId: "C", occurrences: [] },
    ],
    starts: [{ deploymentId: 3, receivers: [startOf(3, "S")] }, { deploymentId: 1, receivers: [startOf(1, "S"), startOf(1, "T")] }],
  });
  assert.deepEqual(linearized, [
    at(ref("A", "z")), at(ref("A", "a")), at(ref("B", "x")), startOf(1, "S"), startOf(1, "T"), startOf(3, "S"),
  ]);
});

test("reachOccurrence steps a waiting receiver's broadcast delivery and skips one no longer waiting", () => {
  const reach = (targets: Json[]): unknown => fixture("reachOccurrence", [forked], { stimuli: [begin()], address: sig, variables: [], atMs: 1_000, targets });
  assert.deepEqual(reach([ref("I", "Z1", 1), ref("I", "A3", 1)]), [{ outcome: "committed" }, { skipped: true }]);
  assert.deepEqual(reach([ref("I", "M2")]), [{ skipped: true }]);
});

test("messageReceivers reaches a waiting catch by channel, by name only under name addressing, and only with its business key", () => {
  const addressed = waiter({ messageNames: "addresses", evaluator: "juel" });
  const names = (deployed: Json, businessKey: string | null, sent: Json): unknown[] =>
    (fixture("messageReceivers", [deployed], { stimuli: [begin(businessKey)], publication: sent }) as Json[])
      .map((found) => (found.occurrence as Json).elementId);
  assert.deepEqual(names(addressed, "bk-1", publication({ channel: order })), ["C"]);
  assert.deepEqual(names(addressed, "bk-1", publication({ name: "Order" })), ["C"]);
  assert.deepEqual(names(addressed, "bk-1", publication({ name: "Other" })), []);
  assert.deepEqual(names(addressed, "bk-1", publication({ channel: order }, "bk-1")), ["C"]);
  assert.deepEqual(names(addressed, "bk-1", publication({ channel: order }, "bk-2")), []);
  assert.deepEqual(names(waiter(), null, publication({ name: "Order" })), []);
});

test("messageStartCandidates reaches a deployment's Message starts by channel, and by name only under name addressing", () => {
  const described = starter("Order", orderMessage);
  const addressed = starter("Order", orderMessage, { messageNames: "addresses", evaluator: "juel" });
  const starts = (deployed: Json, address: Json): unknown[] =>
    (fixture("messageStartCandidates", [deployed], { publication: publication(address) }) as Json[]).map((found) => found.startEvent);
  assert.deepEqual(starts(described, { channel: order }), ["S"]);
  assert.deepEqual(starts(described, { name: "Order" }), []);
  assert.deepEqual(starts(addressed, { name: "Order" }), ["S"]);
  assert.deepEqual(starts(addressed, { name: "Other" }), []);
});

const emission: Json = { address: sig, variables: [], businessKey: null, origin: null, emitter: null };
const reachOf = (receiver: Json): Json => ({ receiver, emission });
const root = (receiver: Json): Json => ({ receiver, emission: null });
const intent = (element: string): Json => ({ address: sig, variables: [], businessKey: null, origin: ref("I", element) });
const thrown = (element: string): Json => ({ intent: intent(element), emitter: "I" });
const delivered = (target: Json): Json => ({ kind: "delivered", target });
const fanOut = (pending: Json[], budget: number, ops: Json[]): unknown[] =>
  fixture("fanOut", [], { commandId: "c", root: pending, budget, ops }) as unknown[];
const next: Json = { op: "next" };
const pass: Json = { op: "pass" };
const record = (entry: Json, intents: Json[], emitter: string): Json => ({ op: "record", entry, intents, emitter });
const snapshot = (receivers: Json[], order: Json[] | null): Json => ({ op: "snapshot", receivers, order });
const reached = (receiver: Json, by: Json | null = emission): Json => ({ kind: "reach", receiver, emission: by });
const cascadeBound = (target: Json): Json => ({ kind: "failed", target, outcome: "unsupported", code: "population-cascade-bound" });

test("the fan-out machine reaches each receiver in turn and stops past its budget at population-cascade-bound", () => {
  assert.deepEqual(fanOut([reachOf(at(ref("A", "x"))), reachOf(at(ref("B", "y")))], 1, [next, record(delivered(ref("A", "x")), [], "A"), next]), [
    reached(at(ref("A", "x"))), null, { kind: "done", entries: [delivered(ref("A", "x")), cascadeBound(at(ref("B", "y")))] },
  ]);
});

test("the fan-out machine takes an intent's snapshot in the order given and runs a recorded receiver's intents first", () => {
  const listed = [at(ref("A", "x")), at(ref("B", "y"))];
  const answers = fanOut([thrown("Throw")], 5, [
    next, snapshot(listed, [at(ref("B", "y"))]), snapshot(listed, [at(ref("B", "y")), at(ref("A", "x"))]), snapshot(listed, null), next,
    record(delivered(ref("B", "y")), [intent("Again")], "B"), next, snapshot([], null), next,
  ]);
  const throwEmission = { ...emission, origin: ref("I", "Throw"), emitter: "I" };
  assert.deepEqual(answers, [
    { kind: "snapshot", intent: intent("Throw"), emission: throwEmission },
    { error: "discovery-order-mismatch" },
    { ok: true },
    { error: "fan-out-not-at-snapshot" },
    reached(at(ref("B", "y")), throwEmission),
    null,
    { kind: "snapshot", intent: intent("Again"), emission: { ...emission, origin: ref("I", "Again"), emitter: "B" } },
    { ok: true },
    reached(at(ref("A", "x")), throwEmission),
  ]);
});

test("fanOutPass spends the receiver it passes and records nothing, and leaves a snapshot position as it is", () => {
  const pending = [root(startOf(1, "Small")), root(startOf(1, "Large"))];
  assert.deepEqual(fanOut(pending, 1, [pass, next]), [null, { kind: "done", entries: [cascadeBound(startOf(1, "Large"))] }]);
  assert.deepEqual(fanOut(pending, 2, [pass, next]), [null, reached(startOf(1, "Large"), null)]);
  const [before, , after] = fanOut([thrown("Throw")], 5, [next, pass, next]);
  assert.deepEqual(after, before);
});

test("conditionalStartVerdict holds, does not hold, or fails over the start input it is given", () => {
  const read = (name: string): Json => ({ identifier: { name } });
  const atLeast = juel(read("amount"), { integer: { digits: "1000" } }, { binary: { payload: { op: "ge", left: 0, right: 1 } } });
  const conditional = (predicate: Json): Json => ({ condition: { payload: { condition: predicate, variableName: null, variableEvents: [] } } });
  const options = { conditionalStart: "submittedContext", evaluator: "juel", conditionalRetrigger: "eachWrite" };
  const large = starter("Orders", conditional(atLeast), options);
  const flagged = starter("Flags", conditional(juel(read("flag"))), options);
  const integer = (value: number): Json[] => [{ name: "amount", value: { kind: "integer", value } }];
  const verdict = (deployed: Json, variables: Json[]): unknown => fixture("conditionalStartVerdict", [deployed], {
    instanceId: "start:1:c:1:1:1:S", startEvent: "S", variables, businessKey: "o-7", atMs: 5_000,
  });
  assert.deepEqual(verdict(large, integer(2_500)), { holds: true });
  assert.deepEqual(verdict(large, integer(10)), { holds: false });
  assert.deepEqual(verdict(flagged, [{ name: "flag", value: { kind: "null" } }]), { outcome: "rolledBack", code: "condition-not-boolean" });
});

test("registerSummary numbers each key's versions and refuses another key's current Message start name", () => {
  const addressing = { messageNames: "addresses", evaluator: "juel" };
  const second = (later: Json): unknown => {
    const [, registered] = fixture("registerSummary", [starter("Order", orderMessage, addressing), later], { deploymentIds: [1, 2] }) as Json[];
    const { ordinal: _ordinal, ...answer } = registered as Json;
    return answer;
  };
  assert.deepEqual(second(starter("Order", orderMessage, addressing)), { deploymentId: 2, versions: [["Order", 2]] });
  assert.deepEqual(second(starter("Rival", orderMessage, addressing)), { refused: "deployment.messageStartName" });
  assert.deepEqual(second(starter("Rival", orderMessage)), { deploymentId: 2, versions: [["Rival", 1]] });
});

const hour = 3_600_000;
const timed = starter("Batch", duration("PT1H"));
const check = (deploymentId: number, startEvent: string, dueMs: number, atMs: number, consumed: boolean): Json =>
  ({ deploymentId, startEvent, dueMs, atMs, consumed });
/** `timerStartCheck` over `timed` deployed once at 0, or again as deployment 2 at 10 s when `superseded`. */
const checked = (superseded: boolean, checks: Json[]): unknown => fixture("timerStartCheck", superseded ? [timed, timed] : [timed], {
  registry: [{ deploymentId: 1, versions: [["Batch", 1]], deployedAtMs: 0 },
    ...(superseded ? [{ deploymentId: 2, versions: [["Batch", 2]], deployedAtMs: 10_000 }] : [])],
  checks,
});

test("timerStartCheck refuses an unknown deployment, start or occurrence, a superseded deployment, then a consumed occurrence", () => {
  assert.deepEqual(checked(false, [
    check(9, "S", hour, hour, false), check(1, "T", hour, hour, false), check(1, "S", hour + 1, hour + 1, true),
    check(1, "S", hour, hour - 1, true), check(1, "S", hour, hour, true), check(1, "S", hour, hour, false),
  ]), ["definition-not-deployed", "no-start-event", "timer-occurrence-unknown", "timer-not-due", "timer-start-occurrence-consumed", null]);
  assert.deepEqual(checked(true, [check(1, "S", hour, hour, true), check(2, "S", hour + 10_000, hour + 10_000, false)]),
    ["timer-start-superseded", null]);
});

test("timerOccurrences offers only the occurrences a firing accepts, from the deploy time on", () => {
  const offered = (fromMs: number, limit: number): unknown =>
    (fixture("timerOccurrences", [timed], { deployedAtMs: 10_000, fromMs, limit, startEvents: ["S", "T"] }) as unknown[])[0];
  assert.deepEqual(offered(0, 3), [[hour + 10_000], null]);
  assert.deepEqual(fixture("timerStartCheck", [timed], {
    registry: [{ deploymentId: 1, versions: [["Batch", 1]], deployedAtMs: 10_000 }], checks: [check(1, "S", hour + 10_000, hour + 10_000, false)],
  }), [null]);
  assert.deepEqual(offered(hour + 10_001, 3), [[], null]);
  assert.deepEqual(offered(0, 0), [[], null]);
});

/**
 * The population functions a host shares with the population runner (`Kernel/Population/*.lean`, ARCHITECTURE-SPEC
 * "Population ingress"): the per-instance and per-deployment receivers, their linearization, the occurrence reach, the
 * fan-out machine, the Conditional start verdict, deployment registration over summaries and the Timer start check.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FailureTag,
  FanOutEntryTag,
  FanOutNextTag,
  InputTag,
  MessageAddressTag,
  PendingTag,
  PublishMode,
  ReceiverTag,
  SignalAddressTag,
  StartTriggerTag,
  channelFromJson,
  conditionalStartVerdict,
  decodeProgram,
  deploymentSummary,
  fanOutBegin,
  fanOutNext,
  fanOutPass,
  fanOutRecord,
  fanOutSnapshot,
  hooks,
  linearizeReceivers,
  messageReceivers,
  messageStartCandidates,
  reachOccurrence,
  registerSummary,
  signalReceiversOf,
  signalStartReceivers,
  step,
  stimulusFromJson,
  timerStartCheck,
} from "@bpmn-lean/kernel";
import type {
  Binding, BroadcastIntent, DeploymentSummary, Emission, FanOutMachine, MessageAddress, OccurrenceRef, Pending, Program,
  Publication, Receiver, StartInput, State,
} from "@bpmn-lean/kernel";

import {
  activity, base, catchEvent, duration, end, eventBased, flow, gateway, juel, message, qName, start, text, userWork, wired,
  withOptions,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const signalOf = (localName: string): Json => ({ signal: { payload: { signalRef: qName(localName), name: text(localName) } } });
const sig = { tag: SignalAddressTag.Qualified, ref: { namespace: null, localName: "Sig" } } as const;
const orderMessage = message({ messageRef: "M_Order", name: text("Order") });
const order = channelFromJson({ kind: "directMessage", messageId: "M_Order" });

/** `key`'s program with `elements` and `flows`, every flow list rebuilt from the flows. */
function program(key: string, elements: Json[], flows: Json[], options: Json = {}): Program {
  const shaped = wired(withOptions({ ...base(), elements, flows }, options));
  const decoded = decodeProgram({ ...shaped, identity: { ...(shaped.identity as Json), processId: key, sourceSha256: `${key}-sha` } });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value;
}

/** The start input of the instance `I` carrying `variables` and `businessKey`, in its wire form. */
function startInput(variables: readonly Json[], businessKey: string | null): Extract<ReturnType<typeof stimulusFromJson>, { ok: true }>["value"][1] {
  const keyed = businessKey === null ? {} : { businessKey };
  const input = stimulusFromJson({ kind: "start", commandId: "start", instanceId: "I", variables, ...keyed });
  assert.ok(input.ok);
  return input.value[1];
}

/** The State of the instance `I` of `started` after its start, with the business key `businessKey`. */
function begin(started: Program, businessKey: string | null = null): State {
  const state = step(hooks, started, null, startInput([], businessKey));
  assert.ok(state.ok);
  return state.value;
}

/** `variables`, decoded as a start input decodes them. */
function bindings(variables: readonly Json[]): readonly Binding[] {
  const input = startInput(variables, null);
  assert.ok(input.tag === InputTag.Start);
  return input.payload.variables;
}

/** An Event-Based Gateway whose arms catch `Sig` at `Z1`, `Other` at `M2` and `Sig` at `A3`, in that flow order. */
const forked = program("Forked",
  [start("S"), gateway("G", eventBased()), catchEvent("Z1", signalOf("Sig")), catchEvent("M2", signalOf("Other")),
    catchEvent("A3", signalOf("Sig")), end("E1"), end("E2"), end("E3")],
  [flow("f1", "S", "G"), flow("g1", "G", "Z1"), flow("g2", "G", "M2"), flow("g3", "G", "A3"), flow("h1", "Z1", "E1"),
    flow("h2", "M2", "E2"), flow("h3", "A3", "E3")]);

/** A root start of `trigger` leading to the User Task `T`. */
const starter = (key: string, trigger: Json, options: Json = {}): Program =>
  program(key, [start("S", trigger), activity("T", userWork()), end("E")], [flow("f1", "S", "T"), flow("f2", "T", "E")], options);

/** A none start to a catch `C` of `M_Order` named `Order`, under CIB's API criteria and `options`. */
const waiter = (options: Json = {}): Program =>
  program("Waiter", [start("S"), catchEvent("C", orderMessage), end("E")], [flow("f1", "S", "C"), flow("f2", "C", "E")],
    { messageCorrelation: "apiCriteria", ...options });

const named = (name: string): MessageAddress => ({ tag: MessageAddressTag.Name, name });
const byChannel = (): MessageAddress => {
  assert.ok(order.ok);
  return { tag: MessageAddressTag.Channel, channel: order.value };
};
const publication = (address: MessageAddress, businessKey: string | null = null): Publication => ({
  commandId: "p", definition: null, message: address, criteria: [], payload: null, variables: [], businessKey, mode: PublishMode.Any,
});

const ref = (processInstanceId: string, element: string, activation = 0): OccurrenceRef => ({ processInstanceId, element, activation });
const at = (target: OccurrenceRef): Receiver => ({ tag: ReceiverTag.Occurrence, ref: target });
const startOf = (deploymentId: number, startEvent: string): Receiver => ({ tag: ReceiverTag.Start, deploymentId, startEvent });

test("signalReceiversOf lists one running instance's open items of an address in arming order, none for its emitter", () => {
  const state = begin(forked);
  const elements = (refs: readonly OccurrenceRef[]): string[][] => refs.map((found) => [found.processInstanceId, found.element]);
  assert.deepEqual(elements(signalReceiversOf(forked, state, sig, null)), [["I", "Z1"], ["I", "A3"]]);
  assert.deepEqual(signalReceiversOf(forked, state, sig, "I"), []);
  const none = { tag: SignalAddressTag.Qualified, ref: { namespace: null, localName: "None" } } as const;
  assert.deepEqual(signalReceiversOf(forked, state, none, null), []);
  assert.deepEqual(signalReceiversOf(forked, { ...state, status: "completed" as State["status"] }, sig, null), []);
});

test("signalStartReceivers names a deployment's root Signal starts of the address by public identifier", () => {
  assert.deepEqual(signalStartReceivers(hooks, 2, starter("Shift", signalOf("Sig")), sig, []), [startOf(2, "S")]);
  assert.deepEqual(signalStartReceivers(hooks, 3, starter("Other", signalOf("Else")), sig, []), []);
  assert.deepEqual(signalStartReceivers(hooks, 4, starter("Messaged", orderMessage), sig, []), []);
});

test("linearizeReceivers orders occurrences by process instance, each list's own order kept, then starts by deployment", () => {
  const linearized = linearizeReceivers(
    [["B", [ref("B", "x")]], ["A", [ref("A", "z"), ref("A", "a")]], ["C", []]],
    [[3, [startOf(3, "S")]], [1, [startOf(1, "S"), startOf(1, "T")]]]);
  assert.deepEqual(linearized, [
    at(ref("A", "z")), at(ref("A", "a")), at(ref("B", "x")), startOf(1, "S"), startOf(1, "T"), startOf(3, "S"),
  ]);
});

test("reachOccurrence steps a waiting receiver's broadcast delivery and skips one no longer waiting", () => {
  const state = begin(forked);
  const [first, second] = signalReceiversOf(forked, state, sig, null);
  assert.ok(first !== undefined && second !== undefined);
  const reached = reachOccurrence(hooks, forked, state, sig, [], first, 1_000);
  assert.ok(!reached.skipped && reached.outcome.ok);
  assert.deepEqual(reachOccurrence(hooks, forked, reached.outcome.value, sig, [], second, 1_000), { skipped: true });
  assert.deepEqual(reachOccurrence(hooks, forked, state, sig, [], ref("I", "M2"), 1_000), { skipped: true });
});

test("messageReceivers reaches a waiting catch by channel, by name only under name addressing, and only with its business key", () => {
  const addressed = waiter({ messageNames: "addresses", evaluator: "juel" });
  const keyed = begin(addressed, "bk-1");
  const names = (state: State, sent: Publication): string[] => messageReceivers(hooks, addressed, state, sent).map(([found]) => found.element);
  assert.deepEqual(names(keyed, publication(byChannel())), ["C"]);
  assert.deepEqual(names(keyed, publication(named("Order"))), ["C"]);
  assert.deepEqual(names(keyed, publication(named("Other"))), []);
  assert.deepEqual(names(keyed, publication(byChannel(), "bk-1")), ["C"]);
  assert.deepEqual(names(keyed, publication(byChannel(), "bk-2")), []);
  const described = waiter();
  assert.deepEqual(messageReceivers(hooks, described, begin(described), publication(named("Order"))), []);
});

test("messageStartCandidates reaches a deployment's Message starts by channel, and by name only under name addressing", () => {
  const described = starter("Order", orderMessage);
  const addressed = starter("Order", orderMessage, { messageNames: "addresses", evaluator: "juel" });
  const starts = (deployed: Program, address: MessageAddress): string[] =>
    messageStartCandidates(deployed, address).map(([startEvent]) => startEvent);
  assert.equal(starts(described, byChannel()).length, 1);
  assert.deepEqual(starts(described, named("Order")), []);
  assert.equal(starts(addressed, named("Order")).length, 1);
  assert.deepEqual(starts(addressed, named("Other")), []);
});

const emission: Emission = { address: sig, variables: [], businessKey: null, origin: null, emitter: null };
const reach = (receiver: Receiver): Pending => ({ tag: PendingTag.Receiver, emission, receiver });
const intent = (element: string): BroadcastIntent => ({ address: sig, variables: [], businessKey: null, origin: ref("I", element) });
const delivered = (target: OccurrenceRef) => ({ tag: FanOutEntryTag.Delivered, target }) as const;
const reachedNext = (machine: FanOutMachine): Receiver | null => {
  const next = fanOutNext(machine);
  return next.tag === FanOutNextTag.Reach ? next.receiver : null;
};

test("the fan-out machine reaches each receiver in turn and stops past its budget at population-cascade-bound", () => {
  const machine = fanOutBegin("c", [reach(at(ref("A", "x"))), reach(at(ref("B", "y")))], 1);
  assert.deepEqual(reachedNext(machine), at(ref("A", "x")));
  const recorded = fanOutRecord(machine, delivered(ref("A", "x")), [], "A");
  assert.deepEqual(fanOutNext(recorded), {
    tag: FanOutNextTag.Done,
    entries: [
      delivered(ref("A", "x")),
      { tag: FanOutEntryTag.Failed, target: at(ref("B", "y")), failure: { tag: FailureTag.Unsupported, code: "population-cascade-bound" } },
    ],
  });
});

test("the fan-out machine takes an intent's snapshot in the order given and runs a recorded receiver's intents first", () => {
  const machine = fanOutBegin("c", [{ tag: PendingTag.Intent, emitter: "I", intent: intent("Throw") }], 5);
  const next = fanOutNext(machine);
  assert.ok(next.tag === FanOutNextTag.Snapshot);
  assert.deepEqual([next.emitter, next.emission.emitter, next.emission.origin], [ref("I", "Throw"), "I", ref("I", "Throw")]);
  const listed = [at(ref("A", "x")), at(ref("B", "y"))];
  assert.deepEqual(fanOutSnapshot(machine, listed, [at(ref("B", "y"))]), { ok: false, error: "discovery-order-mismatch" });
  const taken = fanOutSnapshot(machine, listed, [at(ref("B", "y")), at(ref("A", "x"))]);
  assert.ok(taken.ok);
  assert.deepEqual(fanOutSnapshot(taken.value, listed, null), { ok: false, error: "fan-out-not-at-snapshot" });
  assert.deepEqual(reachedNext(taken.value), at(ref("B", "y")));
  const recorded = fanOutRecord(taken.value, delivered(ref("B", "y")), [intent("Again")], "B");
  const cascaded = fanOutNext(recorded);
  assert.ok(cascaded.tag === FanOutNextTag.Snapshot);
  assert.equal(cascaded.emission.emitter, "B");
  const drained = fanOutSnapshot(recorded, [], null);
  assert.ok(drained.ok);
  assert.deepEqual(reachedNext(drained.value), at(ref("A", "x")));
});

test("fanOutPass spends the receiver it passes and records nothing, and leaves a snapshot position as it is", () => {
  const root = (receiver: Receiver): Pending => ({ tag: PendingTag.Receiver, emission: null, receiver });
  const machine = fanOutBegin("c", [root(startOf(1, "Small")), root(startOf(1, "Large"))], 1);
  const passed = fanOutPass(machine);
  assert.deepEqual(fanOutNext(passed), {
    tag: FanOutNextTag.Done,
    entries: [{ tag: FanOutEntryTag.Failed, target: startOf(1, "Large"), failure: { tag: FailureTag.Unsupported, code: "population-cascade-bound" } }],
  });
  const roomy = fanOutPass(fanOutBegin("c", [root(startOf(1, "Small")), root(startOf(1, "Large"))], 2));
  assert.deepEqual(reachedNext(roomy), startOf(1, "Large"));
  const snapshotting = fanOutBegin("c", [{ tag: PendingTag.Intent, emitter: "I", intent: intent("Throw") }], 5);
  assert.deepEqual(fanOutPass(snapshotting), snapshotting);
});

test("conditionalStartVerdict holds, does not hold, or fails over the start input it is given", () => {
  const read = (name: string): Json => ({ identifier: { name } });
  const atLeast = juel(read("amount"), { integer: { digits: "1000" } }, { binary: { payload: { op: "ge", left: 0, right: 1 } } });
  const conditional = (predicate: Json): Json => ({ condition: { payload: { condition: predicate, variableName: null, variableEvents: [] } } });
  const options = { conditionalStart: "submittedContext", evaluator: "juel", conditionalRetrigger: "eachWrite" };
  const large = starter("Orders", conditional(atLeast), options);
  const flagged = starter("Flags", conditional(juel(read("flag"))), options);
  const integer = (value: number): Json[] => [{ name: "amount", value: { kind: "integer", value } }];
  const input = (variables: readonly Json[]): StartInput => ({
    instanceId: "start:1:c:1:1:1:S", startEvent: "S", variables: bindings(variables), trigger: { tag: StartTriggerTag.Condition },
    businessKey: "o-7", atMs: 5_000,
  });
  assert.deepEqual(conditionalStartVerdict(hooks, large, input(integer(2_500))), { ok: true, value: true });
  assert.deepEqual(conditionalStartVerdict(hooks, large, input(integer(10))), { ok: true, value: false });
  const failed = conditionalStartVerdict(hooks, flagged, input([{ name: "flag", value: { kind: "null" } }]));
  assert.ok(!failed.ok);
  assert.equal(failed.failure.code, "condition-not-boolean");
});

/** `deployed`'s summary, registered as `deploymentId` with `versions` at `deployedAtMs`. */
const registered = (deployed: Program, deploymentId: number, versions: readonly (readonly [string, number])[], deployedAtMs = 0): DeploymentSummary =>
  ({ ...deploymentSummary(deployed), deploymentId, versions, deployedAtMs });

test("registerSummary numbers each key's versions and refuses another key's current Message start name", () => {
  const addressing = { messageNames: "addresses", evaluator: "juel" };
  const first = registered(starter("Order", orderMessage, addressing), 1, [["Order", 1]]);
  assert.deepEqual(registerSummary([first], 2, deploymentSummary(starter("Order", orderMessage, addressing))),
    { ok: true, value: { deploymentId: 2, versions: [["Order", 2]] } });
  assert.deepEqual(registerSummary([first], 2, deploymentSummary(starter("Rival", orderMessage, addressing))),
    { ok: false, error: "deployment.messageStartName" });
  assert.deepEqual(registerSummary([first], 2, deploymentSummary(starter("Rival", orderMessage))),
    { ok: true, value: { deploymentId: 2, versions: [["Rival", 1]] } });
});

test("timerStartCheck refuses an unknown deployment, start or occurrence, a superseded deployment, then a consumed occurrence", () => {
  const hour = 3_600_000;
  const timed = starter("Batch", duration("PT1H"));
  const first = registered(timed, 1, [["Batch", 1]]);
  const second = registered(timed, 2, [["Batch", 2]], 10_000);
  assert.equal(timerStartCheck([first], 9, "S", hour, hour, false), "definition-not-deployed");
  assert.equal(timerStartCheck([first], 1, "T", hour, hour, false), "no-start-event");
  assert.equal(timerStartCheck([first], 1, "S", hour + 1, hour + 1, true), "timer-occurrence-unknown");
  assert.equal(timerStartCheck([first], 1, "S", hour, hour - 1, true), "timer-not-due");
  assert.equal(timerStartCheck([first, second], 1, "S", hour, hour, true), "timer-start-superseded");
  assert.equal(timerStartCheck([first], 1, "S", hour, hour, true), "timer-start-occurrence-consumed");
  assert.equal(timerStartCheck([first], 1, "S", hour, hour, false), null);
  assert.equal(timerStartCheck([first, second], 2, "S", hour + 10_000, hour + 10_000, false), null);
});

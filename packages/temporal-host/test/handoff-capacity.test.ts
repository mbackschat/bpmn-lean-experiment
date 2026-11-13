/**
 * The population ingress's admission of emitted hand-offs (#138, PC-QUALIFY-10): an emit is measured as a command is,
 * one the ingress cannot hold with room for the answer in flight is deferred, and the deferred ones wait in arrival
 * order. With every admission measured, including the identifiers of the item in flight, no state built from admitted
 * inputs can settle past the continuation bound; the analysis's two constructions are the witnesses.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { CommandView, JsonValue, PopulationPort, Wire } from "../src/port.ts";

const capacity = await import(new URL("../dist/capacity.js", import.meta.url).href) as typeof import("../src/capacity.ts");
const population = await import(new URL("../dist/population.js", import.meta.url).href) as typeof import("../src/population.ts");
const carry = await import(new URL("../dist/population-carry.js", import.meta.url).href) as typeof import("../src/population-carry.ts");
const { canonicalBytes, chainCapacity } = capacity;

type IngressState = import("../src/population.ts").IngressState<Wire>;
type EmitReference = import("../src/population.ts").EmitReference;

const frame = { population: "P", config: { scheduling: "external", effectStartToCloseMs: 60_000, historyEventBudget: null }, rolloverEvents: null,
  continuationBytes: chainCapacity.continuationBytes, queryBytes: chainCapacity.queryBytes } as
  import("../src/population-carry.ts").IngressFrame;
const ingressBytes = (state: IngressState) => carry.restingIngressBytes(frame, state);
const reserve = carry.answerReserve(frame);
/** What an admission may fill: the continuation bound less the room the answer in flight may take. */
const admissible = chainCapacity.continuationBytes - reserve;

/** A port that answers only the questions `answers` names. */
function port(answers: Partial<PopulationPort<never, never, Wire>>): PopulationPort<never, never, Wire> {
  return new Proxy(answers, {
    get: (target, name: string) => {
      const answer = (target as Record<string, unknown>)[name];
      if (answer === undefined) throw new TypeError(`unexpected kernel question ${name}`);
      return answer;
    },
  }) as PopulationPort<never, never, Wire>;
}
const silent = port({});

const reference = (commandId: string, workflowId = "W"): EmitReference => ({ workflowId, commandId, count: 1, digest: "" });
const hex = (index: number, length: number) => index.toString(16).padStart(length, "0");
/** A process chain's Workflow ID as the population addresses it: a fixed-length digest of 84 characters. */
const chainId = (index: number) => `bpmn-process-sha256:${hex(index, 64)}`;
/** A caller's ordinary command identifier, UUID-shaped. */
const commandId = (index: number) => `${hex(index, 8)}-0000-4000-8000-${hex(index, 12)}`;

function accepted(offer: import("../src/population.ts").EmitOffer<Wire>): IngressState {
  assert.ok("state" in offer, "accepted");
  return offer.state;
}

/** The settled entries of `head` whose ledger entry grows the resting ingress by exactly the answer reserve, the most its fan-out may. */
function largestEntries(head: EmitReference): JsonValue {
  const shell = canonicalBytes({ kind: "emit", workflowId: head.workflowId, commandId: head.commandId, entries: "" }) -
    canonicalBytes(head.workflowId) - canonicalBytes(head.commandId);
  const entries = "e".repeat(reserve - shell);
  assert.equal(canonicalBytes({ kind: "emit", workflowId: head.workflowId, commandId: head.commandId, entries }) -
    canonicalBytes(head.workflowId) - canonicalBytes(head.commandId), reserve);
  return entries;
}

/** `state` with its first queued emit taken and its fan-out finished with `entries`, waiting only to settle. */
function inFlight(state: IngressState, entries: JsonValue): IngressState {
  const [item, ...queue] = state.queue;
  assert.ok(item !== undefined && item.kind === "emit");
  return { ...state, queue,
    current: { item, ordinal: 0, atMs: 0, command: null, view: null, phase: { kind: "settleEmit", entries }, routes: [], reached: 0 } };
}

const settled = (state: IngressState) => population.answer(silent, frame, state, { kind: "settled" }, 1_000);

/** An ingress at rest of exactly `bytes`, held by one registration. */
function restingAt(bytes: number): IngressState {
  const held = (pad: number): IngressState => ({ ...population.emptyIngress,
    registrations: [{ workflowId: `W${"x".repeat(pad)}`, processInstanceId: "I", deploymentId: 1, revision: 1, addresses: [] }] });
  const state = held(bytes - ingressBytes(held(0)));
  assert.equal(ingressBytes(state), bytes);
  return state;
}

test("an emit is accepted when it leaves exactly the answer reserve free, and one byte more is deferred, never refused", () => {
  const base = restingAt(admissible - 5_000);
  const pad = admissible - ingressBytes(accepted(population.enqueueEmit(frame, base, reference(""), [])));
  const fits = accepted(population.enqueueEmit(frame, base, reference("x".repeat(pad)), []));
  assert.equal(ingressBytes(fits), admissible, "exact fit");
  assert.deepEqual(population.enqueueEmit(frame, base, reference("x".repeat(pad + 1)), []), { deferred: true });
  assert.equal(accepted(population.enqueueEmit(frame, fits, reference("x".repeat(pad)), [])), fits, "a repeated emit is one hand-off");
});

test("behind a deferred hand-off every later emit waits and every later command is refused, so none takes its room", () => {
  const base = restingAt(admissible - 5_000);
  const waiting = [reference("x".repeat(6_000))];
  assert.deepEqual(population.enqueueEmit(frame, base, waiting[0]!, []), { deferred: true });
  assert.ok("state" in population.enqueueEmit(frame, base, reference("small"), []), "the small emit alone would fit");
  assert.deepEqual(population.enqueueEmit(frame, base, reference("small"), waiting), { deferred: true });
  assert.deepEqual(population.enqueueEmit(frame, base, waiting[0]!, waiting), { deferred: true }, "a waiting emit offered again keeps waiting");
  assert.ok("ticket" in population.enqueueCommand(frame, base, "c", "broadcast", {}, "d", []), "the command alone would fit");
  assert.deepEqual(population.enqueueCommand(frame, base, "c", "broadcast", {}, "d", waiting), { refused: carry.ingressContinuationCode });
});

test("waiting hand-offs are admitted in arrival order as room frees, the first that does not fit holding back the rest", () => {
  const base = restingAt(admissible - 1_000);
  const waiting = [reference("x".repeat(3_000), "A"), reference("small", "B")];
  const held = population.admitWaiting(frame, base, waiting);
  assert.deepEqual([held.taken, held.waiting, held.state], [[], waiting, base], "the small one never passes the first");
  const freed = restingAt(admissible - 4_000);
  const taken = population.admitWaiting(frame, freed, waiting);
  assert.deepEqual(taken.taken, waiting);
  assert.deepEqual(taken.waiting, []);
  assert.deepEqual(taken.state.queue.map((item) => item.kind === "emit" ? item.reference.workflowId : ""), ["A", "B"]);
  assert.ok(ingressBytes(taken.state) <= admissible);
});

// Construction A of the analysis: 2,112 queued hand-offs with digest Workflow IDs and UUID command identifiers carried an
// otherwise empty ingress past the bound when they were accepted unmeasured.
test("a burst of 2,112 hand-offs with ordinary identifiers fills the ingress, the rest wait, and the head settles its largest answer", () => {
  let state: IngressState = population.emptyIngress;
  const waiting: EmitReference[] = [];
  for (let index = 1; index <= 2_112; index += 1) {
    const offered = population.enqueueEmit(frame, state, reference(commandId(index), chainId(index)), waiting);
    if ("deferred" in offered) waiting.push(reference(commandId(index), chainId(index)));
    else state = offered.state;
  }
  assert.equal(waiting.at(-1)?.commandId, commandId(2_112), "the 2,112th waits");
  assert.equal(state.queue.length + waiting.length, 2_112);
  assert.deepEqual(waiting.map((held) => held.commandId), Array.from({ length: waiting.length }, (_, index) =>
    commandId(state.queue.length + index + 1)), "every hand-off after the first deferred one waits, in arrival order");
  assert.ok(ingressBytes(state) <= admissible);
  const head = state.queue[0];
  assert.ok(head?.kind === "emit");
  const after = settled(inFlight(state, largestEntries(head.reference)));
  assert.ok(ingressBytes(after) <= chainCapacity.continuationBytes);
  assert.ok(population.admitWaiting(frame, after, waiting).taken.length > 0, "the room it freed admits the first waiting");
});

// Construction B of the analysis: an ingress filled to its admission ceiling while a hand-off is in flight. The queue
// entry the item left still counts, so its settled answer, its identifiers and the reserve together fit.
test("an ingress filled to its ceiling while a hand-off is in flight settles that hand-off's largest answer, and defers a late one", () => {
  const head = reference(commandId(1), chainId(1));
  let state = inFlight(accepted(population.enqueueEmit(frame, population.emptyIngress, head, [])), largestEntries(head));
  const command = (payload: number) => ({ kind: "broadcast", payload: "p".repeat(payload) });
  for (let index = 0; ingressBytes(state) + chainCapacity.stimulusBytes < admissible; index += 1) {
    const next = population.enqueueCommand(frame, state, `c${String(index)}`, "broadcast", command(chainCapacity.stimulusBytes - 100), "d", []);
    assert.ok("state" in next);
    state = next.state;
  }
  const probe = population.enqueueCommand(frame, state, "last", "broadcast", command(0), "d", []);
  assert.ok("state" in probe);
  const last = population.enqueueCommand(frame, state, "last", "broadcast", command(admissible - ingressBytes(probe.state)), "d", []);
  assert.ok("state" in last);
  state = last.state;
  assert.equal(ingressBytes(state), admissible, "at the ceiling, the hand-off in flight counted");
  const after = settled(state);
  assert.ok(ingressBytes(after) <= chainCapacity.continuationBytes);
  assert.deepEqual(population.enqueueEmit(frame, state, reference(commandId(2), chainId(2)), []), { deferred: true });
});

// The cold audit's R2 sequence: the rollover measured the whole carry once, an in-flight fan-out machine of 300,000
// bytes included, and the at-rest admissions made while the Run waited to end, which count that item as its queue entry
// only, could then fill the ingress past what it can carry.
test("while the ingress rolls over, an admission is refused once the whole carry, the machine in flight included, could not hold it", () => {
  const head = reference(commandId(1), chainId(1));
  const [item] = accepted(population.enqueueEmit(frame, population.emptyIngress, head, [])).queue;
  assert.ok(item !== undefined);
  const machinePort = port({ machineWire: (machine: Wire) => machine });
  const window: IngressState = { ...population.emptyIngress, tickets: 1, current: { item, ordinal: 0, atMs: 0, command: null, view: null,
    phase: { kind: "fanOut", machine: "m".repeat(300_000), budget: 1, finish: { kind: "emit" },
      answer: { growth: 0, entries: 0, listBytes: 0, instanceIdBytes: 0 }, spent: false }, routes: [], reached: 0 } };
  assert.notEqual(carry.fittedIngress(machinePort, frame, window), null, "the carry fits as the rollover begins");
  const command = { kind: "broadcast", payload: "p".repeat(50_000) };
  const fill = (admits: (candidate: IngressState) => boolean) => {
    let state = window;
    for (let index = 0; ; index += 1) {
      const next = population.enqueueCommand(frame, state, `c${String(index)}`, "broadcast", command, "d", []);
      if (!("state" in next) || !admits(next.state)) return { state, refusedAt: index };
      state = next.state;
    }
  };
  const atRest = fill(() => true);
  assert.equal(carry.fittedIngress(machinePort, frame, atRest.state), null, "at-rest admission alone carries the ingress past its bound");
  const rolling = fill((candidate) => carry.rollingAdmits(machinePort, frame, candidate));
  assert.ok(rolling.refusedAt > 0 && rolling.refusedAt < atRest.refusedAt, "the rollover refuses before the at-rest ceiling");
  assert.notEqual(carry.fittedIngress(machinePort, frame, rolling.state), null, "every admission the rollover took still fits");
});

test("three repeats of a command whose answer filled the Query bound settle in one driver step, each within the bound", () => {
  const answer = (pad: number) => ({ commandId: "c", ordinal: 1, atMs: 0, resolution: "r".repeat(pad), chain: null });
  const full = answer(chainCapacity.queryBytes - canonicalBytes({ kind: "settled", answer: answer(0) }));
  assert.equal(canonicalBytes({ kind: "settled", answer: full }), chainCapacity.queryBytes);
  let state: IngressState = { ...population.emptyIngress, ordinal: 1, ledger: [{ kind: "command", commandId: "c", digest: "d", answer: full }] };
  const tickets: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const enqueued = population.enqueueCommand(frame, state, "c", "publish", { kind: "publish", commandId: "c" }, "d", []);
    assert.ok("state" in enqueued);
    state = enqueued.state;
    tickets.push(enqueued.ticket);
  }
  assert.equal(state.ledger.length, 1, "admission kept the recorded answer");
  const repeating = port({ decodeCommand: () => ({ view: { kind: "publish", commandId: "c" } as CommandView, command: null as unknown as Wire }) });
  const [after, action] = population.advance(repeating, frame, state, 5);
  assert.equal(action, null);
  assert.ok(ingressBytes(after) <= chainCapacity.continuationBytes);
  for (const ticket of tickets) {
    assert.equal((population.takeAnswer(after, ticket)?.[1] as { resolution: JsonValue } | undefined)?.resolution, full.resolution);
  }
});

// The cold audit's A5: a deployment request is evaluated again once its Workflow started, since the ingress took other
// inputs during the start. A refusal then answered the first, registered verdict and left the ordinal free, so the next
// request would take it and find the started Workflow holding this program.
test("a deployment the ingress no longer takes once its Workflow started is refused and still consumes its ordinal", () => {
  const registry = port({ registerSummary: (_registry: readonly Wire[], _id: number, summary: Wire) => ({ summary, key: "k", versions: [] }) });
  const candidate = { summary: "s".repeat(1_000), identifierBytes: 1 };
  const base = restingAt(admissible - 5_000);
  const [first, deployed] = population.registerDeployment(registry, frame, base, "late", "d", candidate, 0);
  assert.ok(first !== base && "deploymentId" in deployed, "the first evaluation registers it");
  // During the start, emits take the room the deployment needs.
  let filled = base;
  for (let index = 0; ; index += 1) {
    const offered = population.enqueueEmit(frame, filled, reference(commandId(index), chainId(index)), []);
    if (!("state" in offered)) break;
    filled = offered.state;
  }
  const admits = () => true;
  const [settled, answer] = population.startedDeployment(registry, frame, filled, "late", "d", candidate, 0, deployed.deploymentId, admits);
  assert.deepEqual(answer, { refused: carry.ingressContinuationCode });
  assert.equal(settled.deployments, deployed.deploymentId, "the started Workflow's ordinal is consumed");
  assert.equal(population.deploymentOf(settled, "late"), null, "nothing was registered");
  const [, next] = population.registerDeployment(registry, frame, { ...settled, queue: [] }, "next", "n", candidate, 0);
  assert.ok("deploymentId" in next && next.deploymentId === deployed.deploymentId + 1, "the next request takes a fresh ordinal");
  const rolling = population.startedDeployment(registry, frame, base, "late", "d", candidate, 0, deployed.deploymentId, () => false);
  assert.deepEqual(rolling[1], { refused: carry.ingressContinuationCode }, "one the rolling Run could not carry is refused alike");
  assert.equal(rolling[0].deployments, deployed.deploymentId);
  const taken = population.startedDeployment(registry, frame, base, "late", "d", candidate, 0, deployed.deploymentId, admits);
  assert.deepEqual(taken, [first, deployed], "one that still fits is registered as first answered");
});

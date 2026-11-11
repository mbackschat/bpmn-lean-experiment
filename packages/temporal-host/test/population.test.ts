/**
 * The population ingress's host rules: its capacities and their codes, deployment registration by request, the Timer
 * start occurrence ledger, the translation of a fan-out stop at the host's budget, and the flat wire form of a fan-out
 * machine. Which receivers a command reaches, in which order and with which verdicts, is the kernel's; the differential
 * refinement test (`population-host-refinement.test.ts`) checks it against the kernel's population runner.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { FailureTag, FanOutEntryTag, ReceiverTag, SignalAddressTag, cascadeBound, fanOutBegin, PendingTag, type FanOutEntry } from "@bpmn-lean/kernel";

import type { CommandView, JsonValue, PopulationPort, Wire } from "../src/port.ts";

const population = await import(new URL("../dist/population.js", import.meta.url).href) as typeof import("../src/population.ts");
const binding = await import(new URL("../dist/population-port.js", import.meta.url).href) as typeof import("../src/population-port.ts");
const { advance, emptyIngress, enqueueCommand, enqueueEmit, populationCapacity, register, registerDeployment, takeAnswer } = population;

/** A port that answers only the questions `answers` names, so a rule that asks anything else fails loudly. */
function port(answers: Partial<PopulationPort<never, never>>): PopulationPort<never, never> {
  return new Proxy(answers, {
    get: (target, name: string) => {
      const answer = (target as Record<string, unknown>)[name];
      if (answer === undefined) throw new TypeError(`unexpected kernel question ${name}`);
      return answer;
    },
  }) as PopulationPort<never, never>;
}

const rendered = { renderResolution: (parts: unknown) => parts as JsonValue };
const occurrence = (index: number) => ({ processInstanceId: `I${String(index)}`, elementId: "Catch", activation: 1 });

function depth(json: unknown): number {
  if (json === null || typeof json !== "object") return 0;
  return 1 + Math.max(0, ...Object.values(json).map(depth));
}

test("a fan-out stopped at the host's budget answers the host's capacity, and at the kernel's bound the kernel's code", () => {
  const stop: FanOutEntry = {
    tag: FanOutEntryTag.Failed,
    target: { tag: ReceiverTag.Start, deploymentId: 1, startEvent: "S" },
    failure: { tag: FailureTag.Unsupported, code: "population-cascade-bound" },
  };
  const delivered: FanOutEntry = { tag: FanOutEntryTag.Delivered, target: { processInstanceId: "I", element: "C", activation: 1 } };
  const code = (entries: readonly FanOutEntry[]) => {
    const last = entries.at(-1);
    return last?.tag === FanOutEntryTag.Failed ? last.failure.code : null;
  };
  assert.equal(code(binding.hostCapacityEntries([delivered, stop], true, populationCapacity.receivers)), population.fanOutCapacityCode);
  assert.equal(code(binding.hostCapacityEntries([delivered, stop], true, cascadeBound)), "population-cascade-bound");
  assert.deepEqual(binding.hostCapacityEntries([delivered], false, populationCapacity.receivers), [delivered]);
});

test("a fan-out machine of 10,000 pending items crosses the wire flat and comes back equal", () => {
  const intents = Array.from({ length: 10_000 }, (_, index) => ({
    tag: PendingTag.Intent,
    emitter: "I",
    intent: { address: { tag: SignalAddressTag.Named, name: "S" }, variables: [], businessKey: null,
      origin: { processInstanceId: "I", element: "Throw", activation: index + 1 } },
  } as const));
  const machine = fanOutBegin("c", intents, populationCapacity.receivers);
  const wire = binding.machineToWire(machine);
  assert.ok(depth(wire) <= 8, `wire depth ${String(depth(wire))}`);
  // The decoded machine is a 10,000-deep stack, which a structural comparison would recurse through; its wire form is flat.
  const decoded = binding.machineFromWire(JSON.parse(JSON.stringify(wire)) as Wire);
  assert.deepEqual(binding.machineToWire(decoded), wire);
  assert.equal(decoded.budget, machine.budget);
});

test("a full queue refuses a command before acceptance, and an emit is never refused", () => {
  let state = emptyIngress;
  for (let index = 0; index < populationCapacity.queue; index += 1) {
    const [next, ticket] = enqueueCommand(state, `c${String(index)}`, "broadcast", {}, "d");
    assert.notEqual(ticket, null);
    state = next;
  }
  assert.equal(enqueueCommand(state, "over", "broadcast", {}, "d")[1], null);
  const emitted = enqueueEmit(state, { workflowId: "W", commandId: "i1", count: 1, digest: "" });
  assert.equal(emitted.queue.length, populationCapacity.queue + 1);
  assert.equal(enqueueEmit(emitted, { workflowId: "W", commandId: "i1", count: 1, digest: "" }), emitted, "a repeated emit is one hand-off");
});

test("registrations beyond the capacity are refused, while a registered chain may always update or clear its own", () => {
  const address = { occurrence: occurrence(0), signal: { name: "S" } };
  let state = emptyIngress;
  for (let index = 0; index < populationCapacity.registrations; index += 1) {
    state = register(state, { workflowId: `W${String(index)}`, processInstanceId: `I${String(index)}`, deploymentId: 1, revision: 1, addresses: [address] })[0];
  }
  assert.equal(register(state, { workflowId: "Wnew", processInstanceId: "Inew", deploymentId: 1, revision: 1, addresses: [address] })[1],
    population.registrationCapacityCode);
  assert.equal(register(state, { workflowId: "W0", processInstanceId: "I0", deploymentId: 1, revision: 2, addresses: [address] })[1], null);
  const [cleared] = register(state, { workflowId: "W0", processInstanceId: "I0", deploymentId: 1, revision: 2, addresses: [] });
  assert.equal(cleared.registrations.length, populationCapacity.registrations - 1);
  const [stale] = register(cleared, { workflowId: "W1", processInstanceId: "I1", deploymentId: 1, revision: 0, addresses: [] });
  assert.equal(stale, cleared, "an earlier revision never overwrites a later one");
});

test("a deployment request answers once, conflicts with other content, and supersedes its key's consumed Timer starts", () => {
  const kernel = port({
    registerSummary: (_registry, deploymentId, candidate) => ({ summary: candidate, key: String(candidate), versions: [[String(candidate), deploymentId]] }),
  });
  let state: import("../src/population.ts").IngressState = { ...emptyIngress, timers: [{ deploymentId: 1, startEvent: "T", dueMs: 60_000 }] };
  const [first, deployed] = registerDeployment(kernel, state, "r1", "d1", { summary: "Orders" }, 0);
  assert.deepEqual(deployed, { deploymentId: 1, versions: [["Orders", 1]] });
  assert.deepEqual(registerDeployment(kernel, first, "r1", "d1", { summary: "Orders" }, 5)[1], deployed);
  assert.deepEqual(registerDeployment(kernel, first, "r1", "other", { summary: "Orders" }, 5)[1], { refused: population.deploymentRequestConflictCode });
  const [refused, refusal] = registerDeployment(kernel, first, "r2", "d2", { refused: "deployment.messageStartName" }, 5);
  assert.deepEqual(refusal, { refused: "deployment.messageStartName" });
  state = refused;
  assert.equal(state.deployments, 2, "a refused deployment takes its ordinal");
  assert.equal(state.timers.length, 1);
  const [redeployed, again] = registerDeployment(kernel, state, "r3", "d3", { summary: "Orders" }, 10);
  assert.deepEqual(again, { deploymentId: 3, versions: [["Orders", 3]] });
  assert.deepEqual(redeployed.timers, [], "a superseded deployment's occurrences can never decide a verdict again");
});

test("a Timer start firing that would add an occurrence past the ledger's capacity is refused", () => {
  const view: CommandView = { kind: "timerStart", commandId: "fire", deploymentId: 1, startEvent: "T", dueMs: 60_000 };
  const kernel = port({ ...rendered, decodeCommand: () => ({ view, command: null }), timerStartCheck: () => null });
  const timers = Array.from({ length: populationCapacity.timerOccurrences }, (_, index) => ({ deploymentId: 1, startEvent: "T", dueMs: index }));
  const [state, ticket] = enqueueCommand({ ...emptyIngress, timers }, "fire", "timerStart", {}, "d");
  assert.ok(ticket !== null);
  const [settled, action] = advance(kernel, state, 60_000);
  assert.equal(action, null);
  assert.deepEqual(takeAnswer(settled, ticket)?.[1],
    { commandId: "fire", ordinal: 1, atMs: 60_000, resolution: { kind: "rejected", code: population.timerLedgerCapacityCode } });
});

test("a broadcast whose first snapshot exceeds the receivers one command may reach is rejected before any receiver", () => {
  const view: CommandView = { kind: "broadcast", commandId: "b", address: { name: "S" }, hasVariables: false };
  const snapshot = Array.from({ length: populationCapacity.receivers + 1 }, (_, index) => index);
  const kernel = port({
    ...rendered, decodeCommand: () => ({ view, command: "broadcast" }), currentDeployments: () => [], broadcastEmission: () => null,
    emissionAddress: () => null, emissionVariables: () => null, linearize: () => snapshot, broadcastBegin: () => "machine",
  });
  const [state, ticket] = enqueueCommand(emptyIngress, "b", "broadcast", {}, "d");
  assert.ok(ticket !== null);
  const [scanning, scan] = advance(kernel, state, 0);
  assert.equal(scan?.kind, "scanSignal");
  const answered = population.answer(kernel, scanning, { kind: "signalScan", chains: [], starts: [] });
  assert.deepEqual(takeAnswer(answered, ticket)?.[1], { commandId: "b", ordinal: 1, atMs: 0, resolution: { kind: "rejected", code: population.fanOutCapacityCode } });
});

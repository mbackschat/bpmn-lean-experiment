/**
 * The population ingress's host rules: its capacities and their codes, deployment registration by request, the Timer
 * start occurrence ledger, the translation of a fan-out stop at the host's budget, and the flat wire form of a fan-out
 * machine. Which receivers a command reaches, in which order and with which verdicts, is the kernel's; the differential
 * refinement test (`population-host-refinement.test.ts`) checks it against the kernel's population runner.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import {
  FailureTag, FanOutEntryTag, ReceiverTag, SignalAddressTag, cascadeBound, fanOutBegin, PendingTag, timerInstanceId, type FanOutEntry,
  type Program, type State,
} from "@bpmn-lean/kernel";

import type { PopulationChain } from "../src/population-memory.ts";
import type { CommandView, JsonValue, PopulationPort, Wire } from "../src/port.ts";

const population = await import(new URL("../dist/population.js", import.meta.url).href) as typeof import("../src/population.ts");
const binding = await import(new URL("../dist/population-port.js", import.meta.url).href) as typeof import("../src/population-port.ts");
const { MemoryPopulation } = await import(new URL("../dist/population-memory.js", import.meta.url).href) as
  typeof import("../src/population-memory.ts");
const { kernelPort } = await import(new URL("../dist/kernel-port.js", import.meta.url).href) as typeof import("../src/kernel-port.ts");
const { advance, emptyIngress, enqueueCommand, enqueueEmit, populationCapacity, register, registerDeployment, takeAnswer } = population;

/** A port that answers only the questions `answers` names, so a rule that asks anything else fails loudly. */
function port(answers: Partial<PopulationPort<never, never, Wire>>): PopulationPort<never, never, Wire> {
  return new Proxy(answers, {
    get: (target, name: string) => {
      const answer = (target as Record<string, unknown>)[name];
      if (answer === undefined) throw new TypeError(`unexpected kernel question ${name}`);
      return answer;
    },
  }) as PopulationPort<never, never, Wire>;
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
  let state: import("../src/population.ts").IngressState<Wire> = { ...emptyIngress, timers: [{ deploymentId: 1, startEvent: "T", dueMs: 60_000 }] };
  const [first, deployed] = registerDeployment(kernel, state, "r1", "d1", { summary: "Orders" }, 0);
  assert.deepEqual(deployed, { deploymentId: 1, versions: [["Orders", 1]], deployedAtMs: 0 });
  assert.deepEqual(registerDeployment(kernel, first, "r1", "d1", { summary: "Orders" }, 5)[1], deployed);
  assert.deepEqual(registerDeployment(kernel, first, "r1", "other", { summary: "Orders" }, 5)[1], { refused: population.deploymentRequestConflictCode });
  const [refused, refusal] = registerDeployment(kernel, first, "r2", "d2", { refused: "deployment.messageStartName" }, 5);
  assert.deepEqual(refusal, { refused: "deployment.messageStartName" });
  state = refused;
  assert.equal(state.deployments, 2, "a refused deployment takes its ordinal");
  assert.equal(state.timers.length, 1);
  const [redeployed, again] = registerDeployment(kernel, state, "r3", "d3", { summary: "Orders" }, 10);
  assert.deepEqual(again, { deploymentId: 3, versions: [["Orders", 3]], deployedAtMs: 10 });
  assert.deepEqual(population.deploymentOf(redeployed, "r2"), refusal);
  assert.equal(population.deploymentOf(redeployed, "never"), null);
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
    { commandId: "fire", ordinal: 1, atMs: 60_000, resolution: { kind: "rejected", code: population.timerLedgerCapacityCode }, chain: null });
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
  const answered = population.answer(kernel, scanning, { kind: "signalScan", chains: [], starts: [] }, populationCapacity.receivers);
  assert.deepEqual(takeAnswer(answered, ticket)?.[1], { commandId: "b", ordinal: 1, atMs: 0, resolution: { kind: "rejected", code: population.fanOutCapacityCode }, chain: null });
});

test("a publication two chains refuse answers the least refusal code, not the first registered chain's", () => {
  const view: CommandView = { kind: "publish", commandId: "p", definition: null, executions: true, starts: false, channel: null, name: "M" };
  const kernel = port({ ...rendered, decodeCommand: () => ({ view, command: "publish" }), publicationRefusal: () => null,
    currentDeployments: () => [], publication: () => "publication" });
  const [state, ticket] = enqueueCommand(emptyIngress, "p", "publish", {}, "d");
  assert.ok(ticket !== null);
  const [scanning, scan] = advance(kernel, state, 0);
  assert.equal(scan?.kind, "scanMessage");
  const answered = population.answer(kernel, scanning, { kind: "messageScan", chains: [
    { workflowId: "W1", scan: { kind: "refused", refusal: { kind: "unsupported", code: "correlation-key-type" } } },
    { workflowId: "W2", scan: { kind: "refused", refusal: { kind: "unsupported", code: "correlation-key-empty" } } },
  ] }, populationCapacity.receivers);
  assert.deepEqual(takeAnswer(answered, ticket)?.[1],
    { commandId: "p", ordinal: 1, atMs: 0, resolution: { kind: "unsupported", code: "correlation-key-empty" }, chain: null });
});

test("a caller whose chain configuration differs from the ingress's is refused, never run under the other", () => {
  const held = { scheduling: "durable", effectStartToCloseMs: 10_000, historyEventBudget: null } as const;
  assert.equal(population.configurationConflict(held as never, { ...held } as never), null);
  assert.equal(population.configurationConflict(held as never, { ...held, effectStartToCloseMs: 5_000 } as never),
    population.configurationConflictCode);
});

test("an ingress continuing as new releases every waiting Update, so no answer outlives the Update it was for", () => {
  const view: CommandView = { kind: "broadcast", commandId: "b", address: { name: "S" }, hasVariables: false };
  const kernel = port({ ...rendered, decodeCommand: () => ({ view, command: "broadcast" }), broadcastEmission: () => null,
    emissionAddress: () => null, emissionVariables: () => null, currentDeployments: () => [], linearize: () => [],
    broadcastBegin: () => null });
  let [state] = enqueueCommand<Wire>(emptyIngress, "b", "broadcast", {}, "d");
  [state] = enqueueCommand(state, "c", "broadcast", {}, "d");
  [state] = advance(kernel, state, 0);
  const released = population.releaseHandlers(state);
  assert.deepEqual([released.current?.item.ticket, ...released.queue.map((item) => item.ticket)], [null, null]);
  const answered = population.answer(kernel, released, { kind: "signalScan", chains: [], starts: [] }, populationCapacity.receivers);
  assert.deepEqual(answered.answers, [], "a released command settles into the ledger only");
  assert.equal(answered.ledger.length, 1);
});

test("a population start whose instance identity a directly started chain holds is refused, never attached or waited on", async () => {
  const read = await readKernelProgram({
    bytes: await readFile(new URL("../../../scenarios/timer-start-event/process.bpmn", import.meta.url)),
    overlay: null, profile: "test-profile", limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 },
  }, kernelProfileOptions([]));
  if (read.kind !== "read") throw new Error(`reader refused ${read.code}`);
  const program = kernelPort.decodeProgram(JSON.parse(JSON.stringify(read.program)) as JsonValue);
  const startEvent = "TimerStart_PT1S";
  const instanceId = timerInstanceId(1, startEvent, 1_000);
  const firing = { commandId: "fire", deploymentId: 1, startEvent, dueMs: 1_000 };
  const fresh = () => {
    const chains = new Map<string, PopulationChain<Program, State>>();
    const memory = new MemoryPopulation(binding.populationPort, kernelPort.hostView, populationCapacity.receivers, chains);
    memory.deploy("d", "digest", program, 0);
    return { memory, chains };
  };
  const started = fresh().memory.command("fire", "timerStart", firing, "f", 1_000) as { resolution: { entries: { kind: string }[] } };
  assert.equal(started.resolution.entries[0]?.kind, "started", "without the direct chain the occurrence starts its instance");

  const { memory, chains } = fresh();
  const direct = kernelPort.step(program, null, kernelPort.decodeStimulus({
    kind: "start", commandId: "direct", instanceId, startEvent, trigger: { kind: "timer", logicalTimeMs: 1_000 }, variables: [],
  }).input);
  if (!direct.committed) throw new Error(`the direct start did not commit: ${direct.code}`);
  chains.set(instanceId, { deploymentId: 1, program, state: direct.state });
  memory.committed(instanceId, 1, program, direct.state, "direct");
  const answer = memory.command("fire", "timerStart", firing, "f", 1_000) as { resolution: JsonValue };
  assert.deepEqual(answer.resolution, {
    kind: "fanOut",
    entries: [{ kind: "failed", target: { kind: "start", deploymentId: 1, startEvent }, outcome: "rejected",
      code: population.instanceIdentityInUseCode }],
  });
  assert.equal(chains.get(instanceId)?.state, direct.state, "the direct chain is untouched");
});

test("a chain a population delivery steps keeps the registration that delivery made", async () => {
  const read = await readKernelProgram({
    bytes: await readFile(new URL("../../../scenarios/message-key-correlation/unbound-key.bpmn", import.meta.url)),
    overlay: null, profile: "test-profile", limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 },
  }, kernelProfileOptions([]));
  if (read.kind !== "read") throw new Error(`reader refused ${read.code}`);
  const program = kernelPort.decodeProgram(JSON.parse(JSON.stringify(read.program)) as JsonValue);
  const chains = new Map<string, PopulationChain<Program, State>>();
  const memory = new MemoryPopulation(binding.populationPort, kernelPort.hostView, populationCapacity.receivers, chains);
  memory.deploy("d", "digest", program, 0);
  const channel = { kind: "operationMessage", interfaceId: "Interface_ClearingHouse", interfaceOperationId: "Operation_ConfirmSettlement",
    messageId: "Message_SettlementConfirmed" };
  let state: State | null = null;
  for (const stimulus of [
    { kind: "start", commandId: "start", instanceId: "I", variables: [] },
    { kind: "deliver", commandId: "bind", occurrence: { processInstanceId: "I", elementId: "MessageCatch_InitialSettlement", activation: 1 },
      trigger: { kind: "message", channel }, payload: { kind: "string", value: "s-42" } },
  ]) {
    const stepped = kernelPort.step(program, state, kernelPort.decodeStimulus(stimulus).input);
    if (!stepped.committed) throw new Error(`${stimulus.commandId} did not commit: ${stepped.code}`);
    state = stepped.state;
    chains.set("I", { deploymentId: 1, program, state });
    memory.committed("I", 1, program, state, stimulus.commandId);
  }
  const addresses = () => memory.ingress.registrations.find((registration) => registration.workflowId === "I")?.addresses.length;
  assert.equal(addresses(), 1, "the correlated catch waits alone");
  const answer = memory.command("p", "publish", {
    kind: "publish", commandId: "p", address: { channel }, variables: [], mode: "executionsOnly",
    criteria: [{ target: { kind: "processVariable", name: "CorrelationKey_SettlementReference" }, expected: { kind: "string", value: "s-42" } }],
  }, "p", 0) as { resolution: { kind: string } };
  assert.equal(answer.resolution.kind, "committed");
  assert.equal(addresses() ?? 0, 0, "the ended chain's re-registration, which the delivery made, survives the driver's answer");
});

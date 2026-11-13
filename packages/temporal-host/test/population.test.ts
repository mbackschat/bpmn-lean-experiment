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
  type FanOutMachine, type Program, type State,
} from "@bpmn-lean/kernel";

import type { PopulationChain } from "../src/population-memory.ts";
import type { CommandView, JsonValue, PopulationPort, Wire } from "../src/port.ts";

const population = await import(new URL("../dist/population.js", import.meta.url).href) as typeof import("../src/population.ts");
const carry = await import(new URL("../dist/population-carry.js", import.meta.url).href) as typeof import("../src/population-carry.ts");
const binding = await import(new URL("../dist/population-port.js", import.meta.url).href) as typeof import("../src/population-port.ts");
const { MemoryPopulation } = await import(new URL("../dist/population-memory.js", import.meta.url).href) as
  typeof import("../src/population-memory.ts");
const { kernelPort } = await import(new URL("../dist/kernel-port.js", import.meta.url).href) as typeof import("../src/kernel-port.ts");
const { emptyIngress, enqueueEmit, populationCapacity, takeAnswer } = population;
const capacity = await import(new URL("../dist/capacity.js", import.meta.url).href) as typeof import("../src/capacity.ts");
const { chainCapacity } = capacity;
const { heldChains } = await import(new URL("../dist/population-memory.js", import.meta.url).href) as
  typeof import("../src/population-memory.ts");

/** The ingress argument beside its state, as a population named `P` with external scheduling carries it. */
const frame = { population: "P", config: { scheduling: "external", effectStartToCloseMs: 60_000, historyEventBudget: null }, rolloverEvents: null,
  continuationBytes: chainCapacity.continuationBytes, queryBytes: chainCapacity.queryBytes } as
  import("../src/population-carry.ts").IngressFrame;
type IngressState = import("../src/population.ts").IngressState<Wire>;
const advance = (kernel: PopulationPort<never, never, Wire>, state: IngressState, atMs: number) => population.advance(kernel, frame, state, atMs);
const answerWith = (kernel: PopulationPort<never, never, Wire>, state: IngressState, given: import("../src/population.ts").Answer) =>
  population.answer(kernel, frame, state, given, populationCapacity.receivers);
const register = (state: IngressState, registration: import("../src/population.ts").ChainRegistration) =>
  population.register(frame, state, registration);
const registerDeployment = (kernel: PopulationPort<never, never, Wire>, state: IngressState, ...rest: [string, string,
  import("../src/population.ts").DeploymentCandidate, number]) => population.registerDeployment(kernel, frame, state, ...rest);
/** A command accepted for the queue, as `[state, ticket]`, or `[state, null]` when the ingress refused it. */
function enqueueCommand(state: IngressState, commandId: string, kind: string, command: JsonValue, digest: string): readonly [IngressState, number | null] {
  const enqueued = population.enqueueCommand(frame, state, commandId, kind, command, digest, []);
  return "refused" in enqueued ? [state, null] : [enqueued.state, enqueued.ticket];
}

/** A memory population's answer to a command it accepted. */
function answerOf(answered: { readonly answer: JsonValue } | { readonly refused: string }): JsonValue {
  if ("refused" in answered) throw new Error(`the ingress refused the command: ${answered.refused}`);
  return answered.answer;
}

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

test("a full queue refuses a command before acceptance, and an emit is not counted against the queue's command capacity", () => {
  let state: IngressState = emptyIngress;
  for (let index = 0; index < populationCapacity.queue; index += 1) {
    const [next, ticket] = enqueueCommand(state, `c${String(index)}`, "broadcast", {}, "d");
    assert.notEqual(ticket, null);
    state = next;
  }
  assert.equal(enqueueCommand(state, "over", "broadcast", {}, "d")[1], null);
  const offered = enqueueEmit(frame, state, { workflowId: "W", commandId: "i1", count: 1, digest: "" }, []);
  assert.ok("state" in offered);
  assert.equal(offered.state.queue.length, populationCapacity.queue + 1);
  assert.deepEqual(enqueueEmit(frame, offered.state, { workflowId: "W", commandId: "i1", count: 1, digest: "" }, []), offered,
    "a repeated emit is one hand-off");
});

test("a new chain beyond the registration count is refused, whatever it would carry", () => {
  const address = { occurrence: occurrence(0), signal: { name: "S" } };
  // Held directly: at this count the registrations alone exceed the continuation bound, so registering them one by one
  // stops at that bound first (`host.capacity.continuation`), and the count is checked before any measure.
  const registrations = Array.from({ length: populationCapacity.registrations }, (_, index) =>
    ({ workflowId: `W${String(index)}`, processInstanceId: `I${String(index)}`, deploymentId: 1, revision: 1, addresses: [address] }));
  const state: IngressState = { ...emptyIngress, registrations };
  assert.equal(register(state, { workflowId: "Wnew", processInstanceId: "Inew", deploymentId: 1, revision: 1, addresses: [address] })[1],
    population.registrationCapacityCode);
});

test("a registration that would leave no room for an answer under the continuation bound is refused; one exactly at it is held", () => {
  const address = { occurrence: occurrence(0), signal: { name: "S" } };
  const registration = (index: number, workflowId = `W${String(index)}`) =>
    ({ workflowId, processInstanceId: `I${String(index)}`, deploymentId: 1, revision: 1, addresses: [address] });
  const bytes = (state: IngressState) => carry.restingIngressBytes(frame, state);
  // What an admission may fill: the continuation bound less the room the answer in flight may take.
  const bound = chainCapacity.continuationBytes - carry.answerReserve(frame);
  const entry = bytes({ ...emptyIngress, registrations: [registration(0)] }) - bytes(emptyIngress);
  // Longer ordinals widen later entries by up to eight bytes.
  const count = Math.floor((bound - bytes(emptyIngress)) / (entry + 9)) - 1;
  const base: IngressState = { ...emptyIngress, registrations: Array.from({ length: count }, (_, index) => registration(index)) };
  const unpadded = bytes({ ...base, registrations: [...base.registrations, registration(count, "W")] });
  const fits = registration(count, `W${"x".repeat(bound - unpadded)}`);
  const [held, refusal] = register(base, fits);
  assert.equal(refusal, null);
  assert.equal(bytes(held), bound, "exact fit");
  const [unchanged, over] = register(base, { ...fits, workflowId: `${fits.workflowId}x` });
  assert.ok(unchanged === base, "a refused registration leaves the ingress as it was");
  assert.equal(over, carry.ingressContinuationCode);
  assert.equal(register(held, { ...fits, revision: 2 })[1], null, "a held chain keeps its addresses at a later revision");
  const [cleared] = register(held, { ...fits, revision: 2, addresses: [] });
  assert.equal(cleared.registrations.length, count);
  const [stale] = register(cleared, { ...registration(1), revision: 0, addresses: [] });
  assert.equal(stale, cleared, "an earlier revision never overwrites a later one");
});

test("a deployment request answers once, conflicts with other content, and supersedes its key's consumed Timer starts", () => {
  const kernel = port({
    registerSummary: (_registry, deploymentId, candidate) => ({ summary: candidate, key: String(candidate), versions: [[String(candidate), deploymentId]] }),
  });
  let state: import("../src/population.ts").IngressState<Wire> = { ...emptyIngress, timers: [{ deploymentId: 1, startEvent: "T", dueMs: 60_000 }] };
  const [first, deployed] = registerDeployment(kernel, state, "r1", "d1", { summary: "Orders", identifierBytes: 8 }, 0);
  assert.deepEqual(deployed, { deploymentId: 1, versions: [["Orders", 1]], deployedAtMs: 0 });
  assert.deepEqual(registerDeployment(kernel, first, "r1", "d1", { summary: "Orders", identifierBytes: 8 }, 5)[1], deployed);
  assert.deepEqual(registerDeployment(kernel, first, "r1", "other", { summary: "Orders", identifierBytes: 8 }, 5)[1], { refused: population.deploymentRequestConflictCode });
  const [refused, refusal] = registerDeployment(kernel, first, "r2", "d2", { refused: "deployment.messageStartName" }, 5);
  assert.deepEqual(refusal, { refused: "deployment.messageStartName" });
  state = refused;
  assert.equal(state.deployments, 2, "a refused deployment takes its ordinal");
  assert.equal(state.timers.length, 1);
  const [redeployed, again] = registerDeployment(kernel, state, "r3", "d3", { summary: "Orders", identifierBytes: 8 }, 10);
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
  const answered = answerWith(kernel, scanning, { kind: "signalScan", chains: [], starts: [] });
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
  const answered = answerWith(kernel, scanning, { kind: "messageScan", chains: [
    { workflowId: "W1", scan: { kind: "refused", refusal: { kind: "unsupported", code: "correlation-key-type" } } },
    { workflowId: "W2", scan: { kind: "refused", refusal: { kind: "unsupported", code: "correlation-key-empty" } } },
  ] });
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
  let [state] = enqueueCommand(emptyIngress, "b", "broadcast", {}, "d");
  [state] = enqueueCommand(state, "c", "broadcast", {}, "d");
  [state] = advance(kernel, state, 0);
  const released = carry.releaseHandlers(state);
  assert.deepEqual([released.current?.item.ticket, ...released.queue.map((item) => item.ticket)], [null, null]);
  const answered = answerWith(kernel, released, { kind: "signalScan", chains: [], starts: [] });
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
    const memory = new MemoryPopulation(binding.populationPort, kernelPort.hostView, populationCapacity.receivers, heldChains(chains), frame);
    memory.deploy("d", "digest", program, 0);
    return { memory, chains };
  };
  const started = answerOf(fresh().memory.command("fire", "timerStart", firing, "f", 1_000)) as { resolution: { entries: { kind: string }[] } };
  assert.equal(started.resolution.entries[0]?.kind, "started", "without the direct chain the occurrence starts its instance");

  const { memory, chains } = fresh();
  const direct = kernelPort.step(program, null, kernelPort.decodeStimulus({
    kind: "start", commandId: "direct", instanceId, startEvent, trigger: { kind: "timer", logicalTimeMs: 1_000 }, variables: [],
  }).input);
  if (!direct.committed) throw new Error(`the direct start did not commit: ${direct.code}`);
  chains.set(instanceId, { deploymentId: 1, program, state: direct.state });
  memory.committed(instanceId, 1, program, direct.state, "direct");
  const answer = answerOf(memory.command("fire", "timerStart", firing, "f", 1_000)) as { resolution: JsonValue };
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
  const memory = new MemoryPopulation(binding.populationPort, kernelPort.hostView, populationCapacity.receivers, heldChains(chains), frame);
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
  const answer = answerOf(memory.command("p", "publish", {
    kind: "publish", commandId: "p", address: { channel }, variables: [], mode: "executionsOnly",
    criteria: [{ target: { kind: "processVariable", name: "CorrelationKey_SettlementReference" }, expected: { kind: "string", value: "s-42" } }],
  }, "p", 0)) as { resolution: { kind: string } };
  assert.equal(answer.resolution.kind, "committed");
  assert.equal(addresses() ?? 0, 0, "the ended chain's re-registration, which the delivery made, survives the driver's answer");
});

// A fan-out's start carries no ranking (CIB-LIM-0053), so a Conditional contest it raises stays refused.
test("a Timer start fan-out whose start raises a Conditional contest answers it unsupported", async () => {
  const condition = `<bpmn:conditionalEventDefinition><bpmn:condition xsi:type="bpmn:tFormalExpression">true</bpmn:condition></bpmn:conditionalEventDefinition>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="D"
  targetNamespace="urn:t" expressionLanguage="urn:bpmn-lean:expression:simple-boolean:v1">
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="TimerStart"><bpmn:timerEventDefinition><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1S</bpmn:timeDuration></bpmn:timerEventDefinition></bpmn:startEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="TimerStart" targetRef="T"/><bpmn:userTask id="T"/>
    <bpmn:sequenceFlow id="f2" sourceRef="T" targetRef="E"/><bpmn:endEvent id="E"/>
    <bpmn:boundaryEvent id="B1" attachedToRef="T">${condition}</bpmn:boundaryEvent>
    <bpmn:sequenceFlow id="f3" sourceRef="B1" targetRef="E1"/><bpmn:endEvent id="E1"/>
    <bpmn:boundaryEvent id="B2" attachedToRef="T">${condition}</bpmn:boundaryEvent>
    <bpmn:sequenceFlow id="f4" sourceRef="B2" targetRef="E2"/><bpmn:endEvent id="E2"/>
  </bpmn:process>
</bpmn:definitions>`;
  const read = await readKernelProgram({
    bytes: new TextEncoder().encode(xml), overlay: null, profile: "test-profile", limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 },
  }, kernelProfileOptions([]));
  if (read.kind !== "read") throw new Error(`reader refused ${read.code}`);
  const program = kernelPort.decodeProgram(JSON.parse(JSON.stringify(read.program)) as JsonValue);
  const memory = new MemoryPopulation(binding.populationPort, kernelPort.hostView, populationCapacity.receivers,
    heldChains(new Map<string, PopulationChain<Program, State>>()), frame);
  memory.deploy("d", "digest", program, 0);
  const firing = { commandId: "fire", deploymentId: 1, startEvent: "TimerStart", dueMs: 1_000 };
  const answer = answerOf(memory.command("fire", "timerStart", firing, "f", 1_000)) as { resolution: JsonValue };
  assert.deepEqual(answer.resolution, {
    kind: "fanOut",
    entries: [{ kind: "failed", target: { kind: "start", deploymentId: 1, startEvent: "TimerStart" }, outcome: "unsupported",
      code: "conditions-simultaneous" }],
  });
});

/** Two `echo-relay` instances that answer every echo with an echo, held in `chains`, whose `set` the caller may wrap. */
async function echoPopulation(kernel: PopulationPort<Program, State, FanOutMachine>, receivers: number,
  store: (chains: Map<string, PopulationChain<Program, State>>) => import("../src/population-memory.ts").PopulationChains<Program, State>) {
  const read = await readKernelProgram({
    bytes: await readFile(new URL("../../../scenarios/open-rows/signal-broadcast-population/echo-relay.bpmn", import.meta.url)),
    overlay: null, profile: "test-profile", limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 },
  }, kernelProfileOptions([]));
  if (read.kind !== "read") throw new Error(`reader refused ${read.code}`);
  const program = kernelPort.decodeProgram(JSON.parse(JSON.stringify(read.program)) as JsonValue);
  const chains = new Map<string, PopulationChain<Program, State>>();
  const memory = new MemoryPopulation(kernel, kernelPort.hostView, receivers, store(chains), frame);
  memory.deploy("d", "digest", program, 0);
  for (const instanceId of ["Echo_A", "Echo_B"]) {
    const started = kernelPort.step(program, null, kernelPort.decodeStimulus({ kind: "start", commandId: instanceId, instanceId, variables: [] }).input);
    if (!started.committed) throw new Error(`${instanceId} did not start: ${started.code}`);
    chains.set(instanceId, { deploymentId: 1, program, state: started.state });
    memory.committed(instanceId, 1, program, started.state, instanceId);
  }
  const broadcast = () => answerOf(memory.command("echo", "broadcast", {
    kind: "broadcast", commandId: "echo", variables: [],
    address: { signalRef: { id: "Signal_Echo", namespace: "urn:bpmn-lean:scenarios:signal-broadcast-population:echo-relay" } },
  }, "echo", 10)) as { resolution: { kind: string; entries: { kind: string; code?: string; outcome?: string; target?: unknown }[] } };
  return { memory, broadcast };
}

/** `populationPort` counting its machine encodings, and failing, never hanging, past `steps` fan-out steps. */
function countingPort(steps: number) {
  const counts = { machineWire: 0, fanOutNext: 0 };
  const kernel: PopulationPort<Program, State, FanOutMachine> = {
    ...binding.populationPort,
    machineWire: (machine) => {
      counts.machineWire += 1;
      return binding.populationPort.machineWire(machine);
    },
    fanOutNext: (machine) => {
      counts.fanOutNext += 1;
      if (counts.fanOutNext > steps) throw new Error(`the fan-out took more than ${String(steps)} steps`);
      return binding.populationPort.fanOutNext(machine);
    },
  };
  return { kernel, counts };
}

// The driver holds the fan-out machine as the binding's value between actions (`IngressState`): encoding it at every
// action, as a capacity measure of the whole ingress would, makes one cascade quadratic in its receivers.
test("an echo cascade up to the receivers one command may reach settles without encoding its fan-out machine", async () => {
  const receivers = 300;
  // About four fan-out steps a receiver (measured 2026-11-13: 4R + 1); twice that fails a driver that loops.
  const { kernel, counts } = countingPort(8 * receivers);
  const { broadcast } = await echoPopulation(kernel, receivers, heldChains);
  const answer = broadcast();
  assert.equal(answer.resolution.entries.length, receivers + 1, "every receiver, then the stop at the budget");
  assert.equal(answer.resolution.entries.at(-1)?.code, "host.population.fanOutCapacity");
  assert.equal(counts.machineWire, 0, "the memory population never continues as new, so it never encodes the machine");
});

/** A chain store that refuses every candidate after the first `commits`, as a capacity bound of the host would. */
function refusingAfter(commits: number) {
  return (chains: Map<string, PopulationChain<Program, State>>) => {
    let stored = 0;
    return {
      get: (workflowId: string) => chains.get(workflowId),
      set: (workflowId: string, chain: PopulationChain<Program, State>) => {
        if (stored >= commits) return "host.capacity.state";
        stored += 1;
        chains.set(workflowId, chain);
        return null;
      },
    };
  };
}

// A capacity refusal leaves the chain as it was and records a failed receiver, which throws nothing: it ends that
// branch of the fan-out instead of re-firing it, so the command settles within its receivers.
test("a broadcast whose every delivery the host refuses settles with each receiver failed by the bound", async () => {
  const { kernel } = countingPort(8 * 300);
  const { broadcast } = await echoPopulation(kernel, 300, refusingAfter(0));
  assert.deepEqual(broadcast().resolution.entries.map((entry) => [entry.kind, entry.outcome, entry.code]), [
    ["failed", "unsupported", "host.capacity.state"], ["failed", "unsupported", "host.capacity.state"]]);
});

test("a cascade whose delivery the host refuses midway ends there and settles within its receivers", async () => {
  const { kernel } = countingPort(8 * 300);
  const { broadcast } = await echoPopulation(kernel, 300, refusingAfter(10));
  const entries = broadcast().resolution.entries;
  assert.equal(entries.filter((entry) => entry.kind === "delivered").length, 10);
  assert.ok(entries.length <= 12, `the refused chains throw no further echo (${String(entries.length)} entries)`);
  assert.deepEqual(entries[10], { kind: "failed", target: entries[10]?.target, outcome: "unsupported", code: "host.capacity.state" });
  assert.ok(entries.slice(11).every((entry) => entry.kind !== "delivered"), "nothing is delivered after the refusal");
});

// Each instance a cascade starts takes an identity that embeds its emitter's (`cascadeInstanceId`, #126), so one entry
// grows with the cascade's depth and its answer quadratically: about 900 KB at 200 receivers (measured 2026-11-13).
test("a cascade of Signal starts that rethrow their Signal stops at the Query bound, and the ingress goes on", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t:relay">
  <signal id="Signal_Go" name="go" />
  <process id="P" isExecutable="true">
    <startEvent id="Started"><signalEventDefinition signalRef="Signal_Go" /></startEvent>
    <intermediateThrowEvent id="Relay"><signalEventDefinition signalRef="Signal_Go" /></intermediateThrowEvent>
    <userTask id="Hold" />
    <sequenceFlow id="f1" sourceRef="Started" targetRef="Relay" />
    <sequenceFlow id="f2" sourceRef="Relay" targetRef="Hold" />
  </process>
</definitions>`;
  const read = await readKernelProgram({
    bytes: new TextEncoder().encode(xml), overlay: null, profile: "test-profile", limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 },
  }, kernelProfileOptions([]));
  if (read.kind !== "read") throw new Error(`reader refused ${read.code}`);
  const program = kernelPort.decodeProgram(JSON.parse(JSON.stringify(read.program)) as JsonValue);
  const memory = new MemoryPopulation(binding.populationPort, kernelPort.hostView, populationCapacity.receivers,
    heldChains(new Map<string, PopulationChain<Program, State>>()), frame);
  memory.deploy("d", "digest", program, 0);
  const go = { kind: "broadcast", commandId: "go", variables: [], address: { signalRef: { id: "Signal_Go", namespace: "urn:t:relay" } } };
  const answer = answerOf(memory.command("go", "broadcast", go, "go", 10)) as { resolution: { entries: { kind: string; code?: string }[] } };
  const entries = answer.resolution.entries;
  assert.deepEqual(entries.slice(0, -1).map((entry) => entry.kind), entries.slice(0, -1).map(() => "started"));
  assert.deepEqual([entries.at(-1)?.kind, entries.at(-1)?.code], ["failed", population.fanOutCapacityCode]);
  assert.ok(entries.length < populationCapacity.receivers, `the bytes stop it before the receiver cap (${String(entries.length)} entries)`);
  assert.ok(capacity.canonicalBytes({ kind: "settled", answer }) <= chainCapacity.queryBytes, "the answer fits the Query bound");
  const later = answerOf(memory.command("none", "evaluateConditions", { kind: "evaluateConditions", commandId: "none", variables: [] }, "n", 20)) as
    { resolution: { kind: string; code?: string } };
  assert.deepEqual(later.resolution, { kind: "rejected", code: "no-conditional-start" }, "the ingress takes the next command");
});

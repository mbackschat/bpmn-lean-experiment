/**
 * The capacity table on the memory host, which judges candidates exactly as the Workflow does (`chain-candidate.ts`):
 * each enforced byte or count bound with an input that fits it exactly and one a single byte or unit past it, and the
 * realistic sixteen-body parallel Multi-Instance journey fitting every bound. Every overflow commits, publishes and
 * starts nothing: the state, the host view (its open waits, so its effects and Timers) and the publication stay as they
 * were. A knob that adds one ASCII character to a value the state holds once moves a measure by exactly one byte, so
 * the largest admitted knob is the exact fit wherever a bound is not directly observable.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { HostConfig } from "../src/protocol.ts";
import type { JsonValue } from "../src/port.ts";
import type { MemoryProcessHost } from "../src/memory-host.ts";
import * as fx from "./fixtures/capacity-journey.ts";

const { createMemoryProcessHost } = await import(new URL("../dist/memory-host.js", import.meta.url).href) as
  typeof import("../src/memory-host.ts");
const { Scheduling } = await import(new URL("../dist/protocol.js", import.meta.url).href) as typeof import("../src/protocol.ts");
const { canonicalBytes, chainCapacity } = await import(new URL("../dist/capacity.js", import.meta.url).href) as
  typeof import("../src/capacity.ts");
const { planHost } = await import(new URL("../dist/host-machine.js", import.meta.url).href) as typeof import("../src/host-machine.ts");

const durable: HostConfig = { scheduling: Scheduling.Durable, effectStartToCloseMs: 1_000, historyEventBudget: null };
const external: HostConfig = { scheduling: Scheduling.External, effectStartToCloseMs: 1_000, historyEventBudget: null };
const workflowId = "W";

const fresh = () => createMemoryProcessHost({ taskQueue: "capacity", now: () => 5_000 });

/** Every stimulus through the host's route for it, the first as the start; each must commit. */
async function drive(host: MemoryProcessHost, program: JsonValue, config: HostConfig, inputs: readonly JsonValue[]): Promise<void> {
  for (const [index, stimulus] of inputs.entries()) {
    const result = await submit(host, program, config, stimulus, index === 0);
    assert.equal(result.outcome, "committed", `input ${String(index + 1)}: ${JSON.stringify(result)}`);
  }
}

function submit(host: MemoryProcessHost, program: JsonValue, config: HostConfig, stimulus: JsonValue, first: boolean) {
  const kind = (stimulus as { readonly kind: string }).kind;
  if (first) return host.start({ workflowId, program, config, start: stimulus });
  return kind === "effectResult" ? host.arrive(workflowId, stimulus) : host.command(workflowId, stimulus);
}

/** What an overflow must leave as it was: the committed state, the host view and the whole retained publication. */
async function observed(host: MemoryProcessHost): Promise<JsonValue> {
  return { state: await host.state(workflowId), view: await host.hostView(workflowId), page: await host.publication(workflowId, 0) } as unknown as JsonValue;
}

/** Commits `fits` and refuses `over` with `code` from the same committed state, which `over` leaves untouched. */
async function pair(setup: () => Promise<Readonly<{ host: MemoryProcessHost; program: JsonValue; config: HostConfig }>>,
  fits: JsonValue, over: JsonValue, code: string, outcome = "rejected"): Promise<MemoryProcessHost> {
  const fitting = await setup();
  const fitted = await submit(fitting.host, fitting.program, fitting.config, fits, false);
  assert.equal(fitted.outcome, "committed", JSON.stringify(fitted));
  const overflowing = await setup();
  const before = await observed(overflowing.host);
  const refused = await submit(overflowing.host, overflowing.program, overflowing.config, over, false);
  assert.equal(refused.outcome, outcome);
  assert.equal(refused.code, code);
  const after = await observed(overflowing.host);
  assert.deepEqual((after as { state: JsonValue }).state, (before as { state: JsonValue }).state, "no commit");
  assert.deepEqual((after as { page: JsonValue }).page, (before as { page: JsonValue }).page, "no publication");
  assert.deepEqual(((after as { view: { view: JsonValue } }).view).view, ((before as { view: { view: JsonValue } }).view).view,
    "no effect or Timer");
  return fitting.host;
}

/** The knob in [low, high] whose measure is `target`, the measure rising by one per unit of the knob. */
async function exactly(target: number, measure: (knob: number) => Promise<number>, start: number): Promise<number> {
  let knob = start;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const measured = await measure(knob);
    if (measured === target) return knob;
    knob += target - measured;
  }
  throw new Error(`no knob measures ${String(target)}`);
}

test("the realistic sixteen-body parallel journey fits every bound, with sixteen effects pending at once", async () => {
  const program = await fx.scenarioProgram(fx.parallelModel);
  const journey = fx.realisticJourney();
  const host = fresh();
  await drive(host, program, durable, [journey.start, ...journey.commercial, ...journey.compliance]);
  const snapshot = await host.hostView(workflowId);
  assert.equal(snapshot.view?.openWaits.filter((wait) => wait.effect !== undefined).length, 16);
  const peak = canonicalBytes(await host.state(workflowId));
  assert.ok(peak > 240_000 && peak <= chainCapacity.stateBytes, `peak state ${String(peak)}`);
  for (const result of journey.results) assert.equal((await host.arrive(workflowId, result)).outcome, "committed");
  assert.equal((await host.command(workflowId, journey.publish)).outcome, "committed");
  assert.equal((await host.hostView(workflowId)).view?.status, "completed");
});

test("committed state: exactly 256 KiB commits, one byte more refuses the sixteenth Compliance completion", async () => {
  const program = await fx.scenarioProgram(fx.parallelModel);
  const journey = (knob: number) => fx.realisticJourney([{ name: "pad", value: fx.pad(fx.padLengths(knob)) }]);
  const before = async (knob: number) => {
    const host = fresh();
    const phases = journey(knob);
    await drive(host, program, durable, [phases.start, ...phases.commercial, ...phases.compliance.slice(0, 15)]);
    return { host, program, config: durable };
  };
  const knob = await exactly(chainCapacity.stateBytes, async (candidate) => {
    const { host } = await before(candidate);
    assert.equal((await host.command(workflowId, journey(candidate).compliance[15]!)).outcome, "committed");
    return canonicalBytes(await host.state(workflowId));
  }, 0);
  const fitting = await before(knob);
  assert.equal((await fitting.host.command(workflowId, journey(knob).compliance[15]!)).outcome, "committed");
  const over = await before(knob + 1);
  const unchanged = await observed(over.host);
  assert.deepEqual(await over.host.command(workflowId, journey(knob + 1).compliance[15]!),
    { outcome: "rejected", code: "host.capacity.state", revision: null });
  assert.deepEqual(await observed(over.host), unchanged, "no commit, publication, effect or Timer");
});

test("publication batch: an input publishing exactly 64 KiB commits, one byte more is refused before it is published", async () => {
  const program = await fx.scenarioProgram(fx.automaticLoopModel);
  // The start runs the automatic loop 52 times in one closure; its command and instance identifiers size its batches.
  const start = (commandPad: number, instancePad: number): JsonValue => ({
    kind: "start", commandId: `s${"c".repeat(commandPad)}`, instanceId: `I${"i".repeat(instancePad)}`,
    variables: [{ name: "limit", value: fx.int(52) }, { name: "n", value: fx.int(0) }],
  });
  const batch = async (stimulus: JsonValue): Promise<number> => {
    const host = fresh();
    assert.equal((await host.start({ workflowId, program, config: external, start: stimulus })).outcome, "committed");
    const page = await host.publication(workflowId, 0);
    assert.ok(page.kind === "available");
    return canonicalBytes(page.execution[0]) + canonicalBytes(page.occurrences[0]);
  };
  const base = await batch(start(0, 0));
  const perInstance = await batch(start(0, 1)) - base;
  const sized = (target: number): JsonValue => {
    const instancePad = (target - base) % 2 === 0 ? 0 : 1;
    return start((target - base - perInstance * instancePad) / 2, instancePad);
  };
  assert.equal(await batch(sized(chainCapacity.publicationBatchBytes)), chainCapacity.publicationBatchBytes, "exact fit");
  const host = fresh();
  assert.deepEqual(await host.start({ workflowId, program, config: external, start: sized(chainCapacity.publicationBatchBytes + 1) }),
    { outcome: "rejected", code: "host.capacity.publicationBatch", revision: null });
  assert.equal(await host.observation(workflowId), null, "nothing committed");
  assert.deepEqual(await host.publication(workflowId, 0), { kind: "available", headRevision: 0, execution: [], occurrences: [] });
});

/** The arming model after `armed` completions of *Arm*, each having left one open wait of `wait`'s kind. */
async function armed(wait: "timer" | "effect", count: number): Promise<MemoryProcessHost> {
  const program = await fx.cibProgram(fx.armingModel(wait));
  const host = fresh();
  await drive(host, program, durable, [{ kind: "start", commandId: "s", instanceId: fx.instanceId, variables: [] },
    ...Array.from({ length: count }, (_, index) => arm(index + 1))]);
  return host;
}

const arm = (activation: number): JsonValue => fx.completeTask(`arm-${String(activation)}`, "Arm", activation);

test("pending Activities: the thirty-second concurrent effect is planned, a thirty-third is refused", async () => {
  const host = await armed("effect", chainCapacity.pendingActivities);
  assert.equal((await host.hostView(workflowId)).view?.openWaits.filter((wait) => wait.effect !== undefined).length,
    chainCapacity.pendingActivities);
  const unchanged = await observed(host);
  assert.deepEqual(await host.command(workflowId, arm(chainCapacity.pendingActivities + 1)),
    { outcome: "rejected", code: "host.capacity.pendingActivities", revision: null });
  assert.deepEqual(await observed(host), unchanged);
});

test("pending Timers: the sixty-fourth durable Timer is armed, a sixty-fifth is refused", async () => {
  const host = await armed("timer", chainCapacity.pendingTimers);
  assert.equal((await host.hostView(workflowId)).view?.openWaits.filter((wait) => wait.deadlineMs !== undefined).length,
    chainCapacity.pendingTimers);
  const unchanged = await observed(host);
  assert.deepEqual(await host.command(workflowId, arm(chainCapacity.pendingTimers + 1)),
    { outcome: "rejected", code: "host.capacity.pendingTimers", revision: null });
  assert.deepEqual(await observed(host), unchanged);
});

const sizingVariables = fx.sizingVariables;

test("effect request: an Activity request of exactly 64 KiB is planned, one byte more refuses the input that opens it", async () => {
  const program = await fx.cibProgram(fx.sizingModel(2, ["a", "b", "c", "d", "e"], 0));
  const filled = (knob: number) => fx.completeTask("fill-1", "Fill1", 1, [...sizingVariables(["d"], 13_000), { name: "e", value: fx.pad(fx.padLengths(knob)) }]);
  const before = (knob: number) => async () => {
    const host = fresh();
    await drive(host, program, durable, [{ kind: "start", commandId: "s", instanceId: fx.instanceId, variables: sizingVariables(["a", "b", "c"], 13_000) },
      filled(knob)]);
    return { host, program, config: durable };
  };
  const open = fx.completeTask("fill-2", "Fill2", 1);
  const knob = await exactly(chainCapacity.effectRequestBytes, async (candidate) => {
    const { host } = await before(candidate)();
    assert.equal((await host.command(workflowId, open)).outcome, "committed");
    const view = (await host.hostView(workflowId)).view;
    assert.ok(view !== null);
    const [request] = planHost({ ...view, journal: [] }, { timers: new Set(), effects: new Set() }, () => null, true).startEffects;
    return canonicalBytes(request);
  }, 0);
  const fitting = await before(knob)();
  assert.equal((await fitting.host.command(workflowId, open)).outcome, "committed");
  const over = await before(knob + 1)();
  const unchanged = await observed(over.host);
  assert.deepEqual(await over.host.command(workflowId, open), { outcome: "rejected", code: "host.capacity.effectRequest", revision: null });
  assert.deepEqual(await observed(over.host), unchanged);
});

test("effect result: a result of exactly 64 KiB is applied, one byte more halts the chain without applying it", async () => {
  const program = await fx.cibProgram(fx.sizingModel(1, [], 0));
  const before = async () => {
    const host = fresh();
    await drive(host, program, durable, [{ kind: "start", commandId: "s", instanceId: fx.instanceId, variables: [] },
      fx.completeTask("fill-1", "Fill1", 1)]);
    return host;
  };
  const sized = (extra: number): JsonValue => ({
    kind: "effectResult", commandId: "sent", occurrence: { processInstanceId: fx.instanceId, elementId: "Send", activation: 1 },
    outcome: fx.effectOutcomeAtBound(extra),
  });
  const fitting = await before();
  assert.equal((await fitting.arrive(workflowId, sized(0))).outcome, "committed");
  const over = await before();
  const unchanged = await observed(over) as unknown as Readonly<{ state: JsonValue; page: JsonValue; view: { view: JsonValue } }>;
  const halted = await over.arrive(workflowId, sized(1));
  assert.deepEqual([halted.outcome, halted.code], ["unsupported", "host.capacity.effectResult"]);
  const after = await observed(over) as unknown as Readonly<{ state: JsonValue; page: JsonValue; view: { view: JsonValue; halt: { code: string } } }>;
  assert.deepEqual([after.state, after.page, after.view.view], [unchanged.state, unchanged.page, unchanged.view.view]);
  assert.equal(after.view.halt.code, "host.capacity.effectResult");
  assert.deepEqual(await over.command(workflowId, fx.completeTask("final", "Final", 1)),
    { outcome: "rejected", code: "host-halted", revision: null }, "a halted chain takes no input");
});

test("caller stimulus, start stimulus and program: each exactly at its bound is taken, one byte more refused", async () => {
  const program = await fx.cibProgram(fx.sizingModel(2, [], 0));
  const sizedTo = (target: number, make: (characters: number) => JsonValue): JsonValue => {
    let characters = target - 2_000;
    characters += target - canonicalBytes(make(characters));
    characters += target - canonicalBytes(make(characters));
    assert.equal(canonicalBytes(make(characters)), target);
    return make(characters);
  };
  // Values hold at most 16,384 bytes, so a stimulus at the bound spreads its characters over five variables.
  const spread = (characters: number): JsonValue[] => ["a", "b", "c", "d", "e"].map((name, index) =>
    ({ name, value: fx.pad(fx.padLengths(Math.floor(characters / 5) + (index < characters % 5 ? 1 : 0))) }));
  const startOf = (characters: number): JsonValue => ({ kind: "start", commandId: "s", instanceId: fx.instanceId, variables: spread(characters) });
  const startFits = sizedTo(chainCapacity.startBytes, startOf);
  const startOver = sizedTo(chainCapacity.startBytes + 1, startOf);
  assert.equal((await fresh().start({ workflowId, program, config: external, start: startFits })).outcome, "committed");
  const refusedStart = fresh();
  assert.deepEqual(await refusedStart.start({ workflowId, program, config: external, start: startOver }),
    { outcome: "rejected", code: "host.capacity.start", revision: null });
  assert.equal(await refusedStart.observation(workflowId), null);

  const fillOf = (characters: number): JsonValue => fx.completeTask("fill-1", "Fill1", 1, spread(characters));
  const started = async () => {
    const host = fresh();
    await drive(host, program, external, [{ kind: "start", commandId: "s", instanceId: fx.instanceId, variables: [] }]);
    return { host, program, config: external };
  };
  await pair(started, sizedTo(chainCapacity.stimulusBytes, fillOf), sizedTo(chainCapacity.stimulusBytes + 1, fillOf), "host.capacity.stimulus");

  const programOf = async (pad: number) => fx.cibProgram(fx.sizingModel(2, [], pad));
  const base = canonicalBytes(await programOf(0));
  const exactProgram = await programOf(chainCapacity.programBytes - base);
  assert.equal(canonicalBytes(exactProgram), chainCapacity.programBytes);
  const start = { kind: "start", commandId: "s", instanceId: fx.instanceId, variables: [] };
  assert.equal((await fresh().start({ workflowId, program: exactProgram, config: external, start })).outcome, "committed");
  assert.deepEqual(await fresh().start({ workflowId, program: await programOf(chainCapacity.programBytes - base + 1), config: external, start }),
    { outcome: "rejected", code: "host.capacity.program", revision: null });
});

test("continuation: a candidate whose successor would carry exactly 448 KiB commits, one byte more is refused", async () => {
  const { program, inputs, last } = await fx.continuationCase();
  const before = async () => {
    const host = fresh();
    await drive(host, program, external, inputs);
    return { host, program, config: external };
  };
  const knob = await fx.continuationKnob(async (candidate) => {
    const { host } = await before();
    return (await host.command(workflowId, last(candidate))).outcome === "committed";
  });
  const host = await pair(before, last(knob), last(knob + 1), "host.capacity.continuation");
  assert.ok(canonicalBytes(await host.state(workflowId)) <= chainCapacity.stateBytes, "the state bound is not the one that decides");
});

test("a population refuses a deployment program or a command past its byte bound before acceptance", async () => {
  const host = fresh();
  const population = host.population("P", external);
  const programOf = async (pad: number) => fx.cibProgram(fx.sizingModel(1, [], pad));
  const base = canonicalBytes(await programOf(0));
  assert.ok("deploymentId" in await population.registerDeployment({ deploymentRequestId: "fits", digest: "fits",
    program: await programOf(chainCapacity.programBytes - base) }));
  assert.deepEqual(await population.registerDeployment({ deploymentRequestId: "over", digest: "over",
    program: await programOf(chainCapacity.programBytes - base + 1) }), { refused: "host.capacity.program" });
  const broadcast = (characters: number, top: number) => ({
    kind: "broadcast", commandId: "b", address: { kind: "named", name: "S" },
    variables: [...["v1", "v2", "v3", "v4"].map((name) => ({ name, value: fx.pad(fx.padLengths(characters)) })),
      { name: "v5", value: fx.str("t".repeat(top)) }],
  });
  const top = chainCapacity.stimulusBytes - canonicalBytes(broadcast(15_000, 0));
  assert.equal(canonicalBytes(broadcast(15_000, top)), chainCapacity.stimulusBytes);
  const answer = await population.command("broadcast", broadcast(15_000, top) as never);
  assert.equal("commandId" in answer && answer.commandId, "b", "taken at the bound");
  assert.deepEqual(await population.command("broadcast", { ...broadcast(15_000, top + 1), commandId: "b2" } as never),
    { refused: "host.capacity.stimulus" });
});

// #138: the ingress defers a hand-off it cannot hold, and the emitter carries it, so the overflow lands on the emitter's
// own continuation row before its next Signal throw commits, never on the ingress after publication.
test("an emitter whose deferred hand-offs fill its continuation row has its next Signal throw refused before commit; they are delivered once room appears", async () => {
  const chains = { emitter: workflowId, receiver: "R", filler: "F" };
  const setup = async (digest: number) => {
    const host = fresh();
    const filled = await fx.handoffPopulation(host, host.population("P", external), external, chains, digest);
    return { host, filled };
  };
  // 15,000 bytes below the line no 20 KB hand-off fits, and closing the filler's wait frees enough for one.
  const fill = await fx.handoffLine(async (digest) => (await setup(digest)).filled) - 15_000;
  const holding = async (count: number) => {
    const { host } = await setup(fill);
    for (let activation = 1; activation <= count; activation += 1) {
      assert.equal((await host.command(workflowId, fx.emitterCompletion(activation, 20_000))).outcome, "committed");
    }
    return host;
  };
  const filled = await holding(0);
  // The emitter's own row bounds what it holds to about 22 hand-offs of 20 KB; 30 only stops a run that never refuses.
  let held = 0;
  let refused = null;
  while (refused === null && held < 30) {
    const result = await filled.command(workflowId, fx.emitterCompletion(held + 1, 20_000));
    if (result.outcome === "committed") held += 1;
    else refused = result;
  }
  assert.deepEqual(refused, { outcome: "rejected", code: "host.capacity.continuation", revision: null });
  assert.ok(held > 10, `the emitter held ${String(held)} deferred hand-offs`);
  assert.ok((await filled.hostView("R")).view?.openWaits.some((wait) => wait.id.elementId === "Catch"), "no hand-off was delivered");
  const last = held + 1;
  const knob = await fx.continuationKnob(async (candidate) =>
    (await (await holding(held)).command(workflowId, fx.emitterCompletion(last, candidate))).outcome === "committed", 20_000);
  const fitting = await holding(held);
  assert.equal((await fitting.command(workflowId, fx.emitterCompletion(last, knob))).outcome, "committed", "exact fit");
  const over = await holding(held);
  const unchanged = await observed(over);
  assert.deepEqual(await over.command(workflowId, fx.emitterCompletion(last, knob + 1)),
    { outcome: "rejected", code: "host.capacity.continuation", revision: null });
  assert.deepEqual(await observed(over), unchanged, "no commit, publication, effect or Timer");
  assert.equal((await over.deliver("F", fx.fillerDelivery)).outcome, "committed");
  assert.ok((await over.hostView("R")).view?.openWaits.some((wait) => wait.id.elementId === "Hold"), "the first hand-off reached the receiver");
  assert.equal((await over.command(workflowId, fx.emitterCompletion(last, knob + 1))).outcome, "committed",
    "the settled hand-offs left the emitter's row");
});

/** The hand-off witness's population under emitter program `emitter`, filled 15,000 bytes below its line. */
async function handoffHost(emitter: "watcher" | "ticker") {
  const chains = { emitter: workflowId, receiver: "R", filler: "F" };
  const setup = async (digest: number) => {
    const host = fresh();
    const population = host.population("P", external);
    const filled = await fx.handoffPopulation(host, population, external, chains, digest, emitter);
    return { host, population, filled };
  };
  return setup(await fx.handoffLine(async (digest) => (await setup(digest)).filled) - 15_000);
}

test("behind a deferred hand-off a population command is refused, and an input that throws no Signal still commits", async () => {
  const { host, population } = await handoffHost("watcher");
  assert.equal((await host.command(workflowId, fx.emitterCompletion(1, 20_000))).outcome, "committed");
  assert.deepEqual(await population.command("broadcast", { kind: "broadcast", commandId: "b", address: { kind: "named", name: "go" }, variables: [] } as never),
    { refused: "host.capacity.continuation" });
  assert.equal((await host.deliver(workflowId, fx.watchDelivery)).outcome, "committed", "the watcher's Message closes its wait");
  assert.ok((await host.hostView("R")).view?.openWaits.some((wait) => wait.id.elementId === "Catch"), "no hand-off was delivered");
  assert.equal((await host.deliver("F", fx.fillerDelivery)).outcome, "committed");
  assert.ok((await host.hostView("R")).view?.openWaits.some((wait) => wait.id.elementId === "Hold"), "the hand-off reached the receiver");
});

test("a host arrival whose Signal throw the deferred hand-offs leave no room for halts the emitter at its own row", async () => {
  const { host } = await handoffHost("ticker");
  // The emitter's own row bounds what it holds to about 22 hand-offs of 20 KB; 30 only stops a run that never refuses.
  let held = 0;
  let refused = null;
  while (refused === null && held < 30) {
    const result = await host.arrive(workflowId, fx.tickerFiring(held + 1, 20_000));
    if (result.outcome === "committed") held += 1;
    else refused = result;
  }
  assert.equal(refused?.outcome, "unsupported");
  assert.equal(refused?.code, "host.capacity.continuation");
  assert.ok(held > 10, `the emitter held ${String(held)} deferred hand-offs`);
  assert.equal((await host.hostView(workflowId)).halt?.code, "host.capacity.continuation", "the arrival halted the emitter");
  assert.ok((await host.hostView("R")).view?.openWaits.some((wait) => wait.id.elementId === "Catch"), "no hand-off was delivered");
});

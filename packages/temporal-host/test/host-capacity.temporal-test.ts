/**
 * Hosted witnesses of the capacity table (PC-QUALIFY-10), run in hosted CI only: a real Continue-As-New carrying exactly
 * the continuation bound and the candidate one byte past it refused before Event History; the rollover at the server's
 * history-size suggestion; the 128th Run and the refused 129th; one byte pair through an Update validator; one byte
 * pair of effect results returned by a real Activity, whose refusal halts the chain; an effect Activity of an instance
 * whose identity exceeds Temporal's identifier limit; the
 * realistic sixteen-body parallel Multi-Instance journey on durable scheduling with its sixteen effects as concurrent
 * Activities, forced across Runs mid-Multi-Instance; and an emitted hand-off the full population ingress defers, delivered
 * once room appears. The memory host finds each exact knob (`memory-host-capacity.test.ts`), since it judges candidates
 * with the Workflow's own measure.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import { defaultPayloadConverter } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { Worker } from "@temporalio/worker";

import { PopulationClient, ProcessClient, ResultKind, Scheduling, type HostConfig, type JsonValue } from "@bpmn-lean/temporal-host/client";
import { canonicalBytes, chainCapacity } from "@bpmn-lean/temporal-host/host";
import { createMemoryProcessHost } from "@bpmn-lean/temporal-host/memory-host";
import {
  chainHistories, createCachedLocalEnvironment, fetchRunHistory, replayClosedRuns, type RunHistory,
} from "@bpmn-lean/temporal-host/testing";
import { EffectResultKind, createHostWorker, type EffectResult } from "@bpmn-lean/temporal-host/worker";

import * as fx from "./fixtures/capacity-journey.ts";

const projectRoot = new URL("../../../", import.meta.url);
const taskQueue = "bpmn-lean-temporal-host-capacity-test";
const deadlineMs = 60_000;

const external = (historyEventBudget: number | null): HostConfig =>
  ({ scheduling: Scheduling.External, effectStartToCloseMs: 10_000, historyEventBudget });
const durable = (historyEventBudget: number | null): HostConfig =>
  ({ scheduling: Scheduling.Durable, effectStartToCloseMs: 10_000, historyEventBudget });

let environment: TestWorkflowEnvironment;
let worker: Worker;
let running: Promise<void>;
let client: ProcessClient;
const workflowId = (label: string): string => `temporal-host-capacity-${label}-${randomUUID()}`;

before(async () => {
  environment = await createCachedLocalEnvironment({
    identity: "bpmn-lean-temporal-host-capacity-test",
    downloadDirectory: fileURLToPath(new URL(".cache/temporal-cli/", projectRoot)),
  });
  worker = await createHostWorker({
    connection: environment.nativeConnection,
    taskQueue,
    scriptTimeoutMs: 1_000,
    // *Send* answers with a result `extra` bytes past the effect-result bound; *Validate* answers each body with its
    // business-sized validation record.
    effects: async (request) => {
      const extra = request.arguments.find((binding) => binding.name === "extra")?.value as { value: number } | undefined;
      if (request.occurrence.elementId === "Send" && extra !== undefined) return fx.effectOutcomeAtBound(extra.value) as EffectResult;
      return { kind: EffectResultKind.Success, outputs: [{ name: "result", value: fx.validationRecord(request.occurrence.activation) }] };
    },
  });
  running = worker.run();
  client = new ProcessClient(environment.client, taskQueue);
});

after(async () => {
  worker.shutdown();
  await running;
  await environment.teardown();
});

async function until<T>(label: string, read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  const stop = Date.now() + deadlineMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > stop) throw new Error(`${label} not reached within ${String(deadlineMs)} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** The canonical bytes of the argument a Run continued as new with. */
function carriedBytes(history: RunHistory | undefined): number {
  const payload = history?.events?.at(-1)?.workflowExecutionContinuedAsNewEventAttributes?.input?.payloads?.[0];
  assert.ok(payload != null, "the Run continued as new");
  return canonicalBytes(defaultPayloadConverter.fromPayload(payload));
}

async function committed(id: string, stimuli: readonly JsonValue[]): Promise<void> {
  for (const stimulus of stimuli) {
    const kind = (stimulus as { readonly kind: string }).kind;
    const result = kind === "effectResult" ? await client.effectResult(id, stimulus) : await client.command(id, stimulus);
    assert.equal(result.outcome, "committed", JSON.stringify(result));
  }
}

test("continuation: a Run continues as new carrying exactly 448 KiB, and the candidate one byte more is refused", async () => {
  const { program, inputs, last } = await fx.continuationCase();
  // A one-Event budget rolls the chain over after every commit, so the fitting candidate is carried at once. The
  // configuration travels in the carried argument, so the memory host measures under the same one.
  const config = external(1);
  const memory = async (knob: number) => {
    const host = createMemoryProcessHost({ taskQueue: "measure" });
    await host.start({ workflowId: "W", program, config, start: inputs[0]! });
    for (const stimulus of inputs.slice(1)) await host.command("W", stimulus);
    return (await host.command("W", last(knob))).outcome === "committed";
  };
  const knob = await fx.continuationKnob(memory);
  const fits = workflowId("continuation-fits");
  assert.equal((await client.start({ workflowId: fits, program, config, start: inputs[0]! })).outcome, "committed");
  await committed(fits, [...inputs.slice(1), last(knob)]);
  // Each input commits in a Run of its own, so the exact fit commits in the sixth Run and the seventh holds the effect
  // *Send* open with the carried state: on external scheduling it waits for the caller's effect result.
  const chain = await until("the Run after the exact fit", () => chainHistories(environment.client, fits), (runs) => runs.length >= inputs.length + 2);
  assert.equal(chain.length, inputs.length + 2);
  assert.equal(carriedBytes(chain[1]), chainCapacity.continuationBytes);
  await replayClosedRuns(fits, chain.slice(1));
  assert.ok((await client.hostView(fits)).view?.openWaits.some((wait) => wait.id.elementId === "Send"));

  const over = workflowId("continuation-over");
  await client.start({ workflowId: over, program, config, start: inputs[0]! });
  await committed(over, inputs.slice(1));
  const head = (await client.hostView(over)).revision;
  assert.deepEqual(await client.command(over, last(knob + 1)), { outcome: "rejected", code: "host.capacity.continuation", revision: null });
  assert.equal((await client.hostView(over)).revision, head, "nothing published");
});

/** `temporal.api.enums.v1.SuggestContinueAsNewReason.SUGGEST_CONTINUE_AS_NEW_REASON_HISTORY_SIZE_TOO_LARGE`. */
const historySizeTooLarge = 1;

test("Event History bytes: a Run continues as new in the first Workflow Task the server suggests it for history size", async () => {
  const program = await fx.cibProgram(fx.armingModel("timer"));
  const id = workflowId("history-bytes");
  await client.start({ workflowId: id, program, config: external(null), start: { kind: "start", commandId: "s", instanceId: fx.instanceId, variables: [] } });
  const handle = environment.client.workflow.getHandle(id);
  const firstRun = (await handle.describe()).runId;
  // Each completion overwrites four 15,000-character variables: history grows by about 62 KB an input, while the
  // state, the retained publication (about 2 KB a batch) and the Event count stay far below their triggers.
  for (let activation = 1; activation <= 200 && (await handle.describe()).runId === firstRun; activation += 1) {
    await committed(id, [fx.completeTask(`arm-${String(activation)}`, "Arm", activation, fx.sizingVariables(["blob"], 15_000)
      .concat(fx.sizingVariables(["blob2"], 15_000), fx.sizingVariables(["blob3"], 15_000), fx.sizingVariables(["blob4"], 15_000)))]);
  }
  const events = (await fetchRunHistory(environment.client, id, firstRun)).events;
  assert.ok(events.at(-1)?.workflowExecutionContinuedAsNewEventAttributes != null, "the first Run continued as new");
  const tasks = events.map((event) => event.workflowTaskStartedEventAttributes).filter((task) => task != null);
  const suggested = tasks.findIndex((task) => task.suggestContinueAsNew === true);
  assert.equal(suggested, tasks.length - 1, "the Run continued as new in the first Workflow Task the server suggested it");
  assert.deepEqual([...tasks[suggested]?.suggestContinueAsNewReasons ?? []], [historySizeTooLarge], "suggested for its history size");
  // Temporal Server 1.31.2 suggests it at 4 MiB by default (`limit.historySize.suggestContinueAsNew`), before the table's
  // own trigger.
  assert.ok(Number(tasks[suggested]?.historySizeBytes) < chainCapacity.historyBytes,
    `suggested below 8 MiB (${String(tasks[suggested]?.historySizeBytes)})`);
});

test("Run count: the 128th Run commits its input, and a chain needing a 129th halts with host.capacity.runs", async () => {
  const program = await fx.cibProgram(fx.armingModel("timer"));
  const id = workflowId("runs");
  await client.start({ workflowId: id, program, config: external(1), start: { kind: "start", commandId: "s", instanceId: fx.instanceId, variables: [] } });
  // Run 1 commits the start; Runs 2 to 128 each commit one completion of *Arm*.
  await committed(id, Array.from({ length: 127 }, (_, index) => fx.completeTask(`arm-${String(index + 1)}`, "Arm", index + 1)));
  const result = await client.result(id);
  assert.deepEqual(result.kind === ResultKind.Halted ? [result.halt.outcome, result.halt.code] : result,
    ["unsupported", "host.capacity.runs"]);
  assert.equal((await client.hostView(id)).view?.openWaits.filter((wait) => wait.deadlineMs !== undefined).length, 127,
    "the 128th Run's commit stands");
});

test("effect result on durable scheduling: an Activity's result of exactly 64 KiB commits, one byte more halts the chain with its code", async () => {
  const program = await fx.cibProgram(fx.sizingModel(1, ["extra"], 0));
  const run = async (extra: number) => {
    const id = workflowId(`effect-result-${String(extra)}`);
    await client.start({ workflowId: id, program, config: durable(null),
      start: { kind: "start", commandId: "s", instanceId: fx.instanceId, variables: [{ name: "extra", value: fx.int(extra) }] } });
    await committed(id, [fx.completeTask("fill-1", "Fill1", 1)]);
    return id;
  };
  const fits = await run(0);
  await until("the fitting result's commit", () => client.hostView(fits),
    (snapshot) => snapshot.view?.openWaits.some((wait) => wait.id.elementId === "Final") === true);
  const over = await run(1);
  const result = await client.result(over);
  assert.deepEqual(result.kind === ResultKind.Halted ? [result.halt.outcome, result.halt.code] : result,
    ["unsupported", "host.capacity.effectResult"]);
  assert.ok((await client.hostView(over)).view?.openWaits.every((wait) => wait.id.elementId !== "Final"), "the result was never applied");
});

test("an effect of an instance whose identity exceeds Temporal's identifier limit runs as its Activity and commits its result", async () => {
  const program = await fx.cibProgram(fx.sizingModel(1, ["extra"], 0));
  const id = workflowId("effect-long-identity");
  // 2,000 characters: the effect's key embeds them, past the server's default `limit.maxIDLength` of 1,000.
  const instanceId = `I${"i".repeat(1_999)}`;
  await client.start({ workflowId: id, program, config: durable(null),
    start: { kind: "start", commandId: "s", instanceId, variables: [{ name: "extra", value: fx.int(0) }] } });
  await committed(id, [{ kind: "command", commandId: "fill-1", occurrence: { processInstanceId: instanceId, elementId: "Fill1", activation: 1 },
    action: { kind: "completeUserTask", values: [] } }]);
  await until("the effect's commit", () => client.hostView(id),
    (snapshot) => snapshot.view?.openWaits.some((wait) => wait.id.elementId === "Final") === true);
});

test("one byte pair through the Update validator: a state of exactly 256 KiB commits, one byte more never enters history", async () => {
  const program = await fx.scenarioProgram(fx.parallelModel);
  const journey = (knob: number) => fx.realisticJourney([{ name: "pad", value: fx.pad(fx.padLengths(knob)) }]);
  const memoryState = async (knob: number) => {
    const host = createMemoryProcessHost({ taskQueue: "measure" });
    const phases = journey(knob);
    await host.start({ workflowId: "W", program, config: external(null), start: phases.start });
    for (const stimulus of [...phases.commercial, ...phases.compliance]) await host.command("W", stimulus);
    return canonicalBytes(await host.state("W"));
  };
  const knob = chainCapacity.stateBytes - await memoryState(0);
  assert.equal(await memoryState(knob), chainCapacity.stateBytes);
  for (const [label, padding, outcome] of [["fits", knob, "committed"], ["over", knob + 1, "rejected"]] as const) {
    const id = workflowId(`state-${label}`);
    const phases = journey(padding);
    await client.start({ workflowId: id, program, config: external(null), start: phases.start });
    await committed(id, [...phases.commercial, ...phases.compliance.slice(0, 15)]);
    const head = (await client.hostView(id)).revision;
    const result = await client.command(id, phases.compliance[15]!);
    assert.equal(result.outcome, outcome);
    if (outcome === "rejected") {
      // A validator's refusal: the Update is never accepted, so no Event records it.
      assert.equal(result.code, "host.capacity.state");
      assert.equal((await client.hostView(id)).revision, head);
    }
  }
});

test("the realistic sixteen-body parallel journey runs on durable scheduling across Runs, its sixteen effects as Activities", async () => {
  const program = await fx.scenarioProgram(fx.parallelModel);
  const journey = fx.realisticJourney();
  const id = workflowId("journey");
  // A 40-Event budget rolls the chain over several times between the Commercial completions and the effects.
  assert.equal((await client.start({ workflowId: id, program, config: durable(40), start: journey.start })).outcome, "committed");
  await committed(id, [...journey.commercial, ...journey.compliance]);
  await until("every body validated", () => client.hostView(id), (snapshot) =>
    snapshot.view?.openWaits.some((wait) => wait.id.elementId === "UserTask_Publish") ?? false);
  await committed(id, [journey.publish]);
  const result = await client.result(id);
  assert.equal(result.kind === ResultKind.Ended ? result.status : result.kind, "completed");
  const chain = await chainHistories(environment.client, id);
  await replayClosedRuns(id, chain);
  assert.ok(chain.length > 2, "the journey crossed Runs mid-Multi-Instance");
});

test("hand-off: an emit the full population ingress defers waits outside its queue and is delivered once a closed wait frees room", async () => {
  const population = `capacity-handoff-${randomUUID()}`;
  const config = external(null);
  const chains = { emitter: workflowId("handoff-emitter"), receiver: workflowId("handoff-receiver"), filler: workflowId("handoff-filler") };
  // The memory host finds the filling digest with the ingress's own measure under the same population and Workflow IDs;
  // 15,000 bytes below that line no 20 KB hand-off fits, and closing the filler's Message wait frees room for one.
  const line = await fx.handoffLine(async (digest) => {
    const memory = createMemoryProcessHost({ taskQueue: "measure", now: Date.now });
    return fx.handoffPopulation(memory, memory.population(population, config), config, chains, digest);
  });
  const ingress = new PopulationClient(environment.client, taskQueue, population, config);
  assert.ok("deploymentId" in await fx.handoffPopulation(client, ingress, config, chains, line - 15_000));
  let answered = false;
  const completing = client.command(chains.emitter, fx.emitterCompletion(1, 20_000)).then((result) => {
    answered = true;
    return result;
  });
  // The completion commits and publishes at once; its Update answers only once the ingress accepted the hand-off.
  await until("the completion's commit", () => client.hostView(chains.emitter),
    (snapshot) => snapshot.view?.openWaits.some((wait) => wait.id.activation === 2) ?? false);
  // An observation window for the negative claims: an accepted hand-off answers the Update within milliseconds.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  assert.equal(answered, false, "the Update waits while its hand-off is deferred");
  assert.equal(await ingress.backlog(), 0, "the deferred hand-off is not queued");
  assert.ok((await client.hostView(chains.receiver)).view?.openWaits.some((wait) => wait.id.elementId === "Catch"));
  assert.equal((await client.deliver(chains.filler, fx.fillerDelivery)).outcome, "committed");
  assert.equal((await completing).outcome, "committed");
  await until("the receiver's Signal", () => client.hostView(chains.receiver),
    (snapshot) => snapshot.view?.openWaits.some((wait) => wait.id.elementId === "Hold") ?? false);
});

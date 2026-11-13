/**
 * Hosted witnesses of the capacity table (PC-QUALIFY-10), run in hosted CI only: a real Continue-As-New carrying exactly
 * the continuation bound and the candidate one byte past it refused before Event History; the Event History byte
 * trigger; the 128th Run and the refused 129th; one byte pair through an Update validator; and the realistic
 * sixteen-body parallel Multi-Instance journey on durable scheduling with its sixteen effects as concurrent Activities,
 * forced across Runs mid-Multi-Instance. The memory host finds each exact knob (`memory-host-capacity.test.ts`), since
 * it judges candidates with the Workflow's own measure.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import { defaultPayloadConverter, type WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { Worker } from "@temporalio/worker";

import { ProcessClient, ResultKind, Scheduling, type HostConfig, type JsonValue } from "@bpmn-lean/temporal-host/client";
import { canonicalBytes, chainCapacity } from "@bpmn-lean/temporal-host/host";
import { createMemoryProcessHost } from "@bpmn-lean/temporal-host/memory-host";
import { createCachedLocalEnvironment } from "@bpmn-lean/temporal-host/testing";
import { EffectResultKind, createHostWorker, replayHistory } from "@bpmn-lean/temporal-host/worker";

import * as fx from "./fixtures/capacity-journey.ts";

const projectRoot = new URL("../../../", import.meta.url);
const taskQueue = "bpmn-lean-temporal-host-capacity-test";
const deadlineMs = 60_000;
const MiB = 1_024 * 1_024;

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
    // *Validate* answers each body with its business-sized validation record.
    effects: async (request) => ({
      kind: EffectResultKind.Success,
      outputs: [{ name: "result", value: fx.validationRecord(request.occurrence.activation) }],
    }),
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

type History = Awaited<ReturnType<WorkflowHandle["fetchHistory"]>>;

/** The Event Histories of the chain's Runs, newest first; a Run's start names the Run it continued. */
async function chainHistories(id: string): Promise<History[]> {
  const histories: History[] = [];
  for (let runId: string | undefined = undefined; ;) {
    const history = await environment.client.workflow.getHandle(id, runId).fetchHistory();
    histories.push(history);
    runId = history.events?.[0]?.workflowExecutionStartedEventAttributes?.continuedExecutionRunId ?? undefined;
    if (runId === undefined || runId === "") return histories;
  }
}

/**
 * Replays closed Runs only. `Worker.runReplayHistory` settles on the replay Worker's eviction, which sdk-core requests
 * after the first activation that is no longer replaying (`replay/mod.rs`, `get_post_activate_hook`, SDK 1.21.0); the
 * replay of an open Run's history never settled in the hosted runs of 2026-11-13.
 */
async function replayClosed(id: string, histories: readonly History[]): Promise<void> {
  for (const history of histories) {
    const last = history.events?.at(-1);
    assert.ok(last?.workflowExecutionContinuedAsNewEventAttributes != null || last?.workflowExecutionCompletedEventAttributes != null,
      "only a Run that continued as new or completed is replayed");
    await replayHistory(history, id);
  }
}

/** The canonical bytes of the argument a Run continued as new with. */
function carriedBytes(history: History | undefined): number {
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
  // Each input commits in a Run of its own, so the exact fit commits in the sixth Run and the seventh holds *Final*
  // open with the carried state.
  const chain = await until("the Run after the exact fit", () => chainHistories(fits), (runs) => runs.length >= inputs.length + 2);
  assert.equal(chain.length, inputs.length + 2);
  assert.equal(carriedBytes(chain[1]), chainCapacity.continuationBytes);
  await replayClosed(fits, chain.slice(1));
  assert.ok((await client.hostView(fits)).view?.openWaits.some((wait) => wait.id.elementId === "Final"));

  const over = workflowId("continuation-over");
  await client.start({ workflowId: over, program, config, start: inputs[0]! });
  await committed(over, inputs.slice(1));
  const head = (await client.hostView(over)).revision;
  assert.deepEqual(await client.command(over, last(knob + 1)), { outcome: "rejected", code: "host.capacity.continuation", revision: null });
  assert.equal((await client.hostView(over)).revision, head, "nothing published");
});

test("Event History bytes: a Run continues as new once its history reaches 8 MiB, never before", async () => {
  const program = await fx.cibProgram(fx.armingModel("timer"));
  const id = workflowId("history-bytes");
  await client.start({ workflowId: id, program, config: external(null), start: { kind: "start", commandId: "s", instanceId: fx.instanceId, variables: [] } });
  const handle = environment.client.workflow.getHandle(id);
  const firstRun = (await handle.describe()).runId;
  let below = 0;
  for (let activation = 1; activation <= 200; activation += 1) {
    const description = await handle.describe();
    if (description.runId !== firstRun) break;
    const size = description.historySize ?? Number.NaN;
    assert.ok(size < 8 * MiB + 128 * 1_024, `the Run rolls over at its first activation past 8 MiB (${String(size)})`);
    below = size;
    // Each completion overwrites one 60,000-character variable, so the state stays small while history grows.
    await committed(id, [fx.completeTask(`arm-${String(activation)}`, "Arm", activation, fx.sizingVariables(["blob"], 15_000)
      .concat(fx.sizingVariables(["blob2"], 15_000), fx.sizingVariables(["blob3"], 15_000), fx.sizingVariables(["blob4"], 15_000)))]);
  }
  assert.ok(below >= 7 * MiB, "the Run reached the trigger's neighbourhood before it rolled over");
  await until("the next Run", () => handle.describe(), (description) => description.runId !== firstRun);
  const closed = await environment.client.workflow.getHandle(id, firstRun).describe();
  assert.ok((closed.historySize ?? 0) >= 8 * MiB, `the closed Run crossed the trigger (${String(closed.historySize)})`);
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
  const chain = await chainHistories(id);
  await replayClosed(id, chain);
  assert.ok(chain.length > 2, "the journey crossed Runs mid-Multi-Instance");
});

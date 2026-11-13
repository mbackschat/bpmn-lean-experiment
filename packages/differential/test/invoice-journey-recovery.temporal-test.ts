/**
 * PC-DELIVERY-01's replacement and replay evidence on the generic Temporal host, run in hosted CI only (it starts an
 * ephemeral Temporal server): each of the three invoice journeys runs through the scenario runner on external scheduling
 * twice under a history budget that hands its chain over by Continue-As-New, once uninterrupted and once with its Worker
 * shut down at a User Task wait and a fresh Worker started on the same task queue. Both runs return the TypeScript
 * kernel's canonical result, which the kernel oracle holds to Lean and to the retained CIB result, the fresh Worker's
 * identity is on the chain's later Workflow Tasks, and every closed Run of both chains replays on the bundle that wrote
 * it. On external scheduling effect results are the journey's own inputs, so no effect Activity may start.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";

import { firstValueDisagreement } from "@bpmn-lean/differential";
import { runScenario as runKernelScenario } from "@bpmn-lean/kernel";
import { ProcessClient, ResultKind } from "@bpmn-lean/temporal-host/client";
import type { JsonValue } from "@bpmn-lean/temporal-host/client";
import {
  chainHistories, createCachedLocalEnvironment, replayClosedRuns, runScenario, type ScenarioHost,
} from "@bpmn-lean/temporal-host/testing";
import { EffectResultKind, createHostWorker } from "@bpmn-lean/temporal-host/worker";
import type { EffectRequest } from "@bpmn-lean/temporal-host/worker";

import { projectRoot } from "./pipeline-target-support.ts";
import { scenarioKernelInput, type ScenarioDocument } from "./scenario-discovery.ts";

const taskQueue = "bpmn-lean-differential-invoice-journeys";
/** Small enough that every journey's chain continues as new several times, as `host.temporal-test.ts` hands over. */
const historyEventBudget = 12;

/** Each journey with the User Task completion before which its Worker is replaced, past every rework and recovery. */
const journeys = [
  { scenario: "scenarios/open-rows/delivery-invoice-journeys/serial-classification.scenario.json", replaceBefore: "finalize" },
  { scenario: "scenarios/open-rows/delivery-invoice-journeys/mixed-invoice-rework.scenario.json", replaceBefore: "review-2" },
  { scenario: "scenarios/open-rows/delivery-invoice-journeys/business-error.scenario.json", replaceBefore: "review-3" },
] as const;

/** JSON serialization erases what a wire value cannot carry, as every Temporal payload does. */
const wire = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;

let environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>>;
let worker: Awaited<ReturnType<typeof createHostWorker>>;
let running: Promise<void>;
let client: ProcessClient;
let generation = 0;
const effectRequests: EffectRequest[] = [];

async function startWorker(): Promise<string> {
  generation += 1;
  const identity = `${taskQueue}-worker-${String(generation)}`;
  worker = await createHostWorker({
    connection: environment.nativeConnection,
    taskQueue,
    identity,
    scriptTimeoutMs: 1_000,
    effects: async (request) => {
      effectRequests.push(request);
      return { kind: EffectResultKind.Success, outputs: [] };
    },
  });
  running = worker.run();
  return identity;
}

before(async () => {
  environment = await createCachedLocalEnvironment({
    identity: taskQueue,
    downloadDirectory: path.join(projectRoot, ".cache/temporal-cli/"),
  });
  await startWorker();
  client = new ProcessClient(environment.client, taskQueue);
});

after(async () => {
  worker.shutdown();
  await running;
  await environment.teardown();
});

type Occurrence = Readonly<{ elementId: string; activation: number }>;

/**
 * The process client, except that the command `commandId` first finds its occurrence's wait open, then shuts the
 * serving Worker down and starts a fresh one, whose identity `replaced` receives. The replacement holds no cached
 * Workflow state, so its first Workflow Task rebuilds the Run from Event History alone.
 */
function replacingBefore(commandId: string, replaced: (identity: string) => void): ScenarioHost["client"] {
  return {
    start: (request) => client.start(request),
    deliver: (id, stimulus) => client.deliver(id, stimulus),
    timerFire: (id, stimulus) => client.timerFire(id, stimulus),
    effectResult: (id, stimulus) => client.effectResult(id, stimulus),
    observation: (id) => client.observation(id),
    state: (id) => client.state(id),
    command: async (id, stimulus) => {
      const named = stimulus as Readonly<{ commandId?: string; occurrence?: Occurrence }>;
      if (named.commandId === commandId) {
        const open = (await client.hostView(id)).view?.openWaits ?? [];
        assert.ok(open.some((wait) => wait.id.elementId === named.occurrence?.elementId &&
          wait.id.activation === named.occurrence.activation), `${commandId} completes an open wait`);
        worker.shutdown();
        await running;
        replaced(await startWorker());
      }
      return client.command(id, stimulus);
    },
  };
}

/** The ended chain's Runs, oldest last, each replayed; the chain's first Workflow ID is the runner's `<prefix>-1`. */
async function replayedChain(prefix: string) {
  const id = `${prefix}-1`;
  const result = await client.result(id);
  assert.equal(result.kind === ResultKind.Ended ? result.status : result.kind, "completed");
  const runs = await chainHistories(environment.client, id);
  assert.ok(runs.length > 1, `${id} continued as new`);
  await replayClosedRuns(id, runs);
  return runs;
}

for (const { scenario, replaceBefore } of journeys) {
  test(`${scenario} returns one result uninterrupted and across a Worker replacement, and every closed Run replays`, async () => {
    const document = JSON.parse(await readFile(path.join(projectRoot, scenario), "utf8")) as ScenarioDocument;
    const input = await scenarioKernelInput(scenario, document.bpmn, document.profile);
    if (input.kind === "refused") throw new Error(`${scenario}: the reader refused its source`);
    const program = wire(input.program);
    const kernel = wire(runKernelScenario(program, document));

    const uninterruptedPrefix = `invoice-${document.id}-uninterrupted-${randomUUID()}`;
    const uninterrupted = await runScenario(program, wire(document),
      { client, workflowIdPrefix: uninterruptedPrefix, historyEventBudget });
    assert.equal(firstValueDisagreement(kernel, wire(uninterrupted), "result"), null);

    let replacement: string | null = null;
    const replacedPrefix = `invoice-${document.id}-replaced-${randomUUID()}`;
    const replaced = await runScenario(program, wire(document), {
      client: replacingBefore(replaceBefore, (identity) => { replacement = identity; }),
      workflowIdPrefix: replacedPrefix,
      historyEventBudget,
    });
    assert.notEqual(replacement, null, `the Worker was replaced before ${replaceBefore}`);
    assert.equal(firstValueDisagreement(wire(uninterrupted), wire(replaced), "result"), null);

    await replayedChain(uninterruptedPrefix);
    const runs = await replayedChain(replacedPrefix);
    const taskIdentities = runs.flatMap((run) => run.events.flatMap((event) =>
      event.workflowTaskStartedEventAttributes?.identity ?? []));
    assert.ok(taskIdentities.includes(replacement ?? ""), "the fresh Worker completed the journey's later Workflow Tasks");
  });
}

test("the journeys started no effect Activity", () => {
  assert.deepEqual(effectRequests.map(({ key }) => key), []);
});

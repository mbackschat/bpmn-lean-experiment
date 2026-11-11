/**
 * Hosted witnesses of the population ingress ([population ingress](../../../docs/kernel/ARCHITECTURE-SPEC.md#population-ingress)):
 * population scenarios replayed through the Temporal ingress, its deployment Workflows and process chains answer every
 * command with the kernel population runner's resolution and leave each instance in the runner's status with the same
 * open waits. Receivers step at host time, so logical times are not compared. One replay runs with an ingress forced to
 * continue as new every few events, so commands settle across its Runs, mid-fan-out included.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { after, before, test } from "node:test";

import { runPopulation } from "@bpmn-lean/kernel";
import { PopulationClient, ProcessClient, Scheduling, processInstanceWorkflowId, type JsonValue } from "@bpmn-lean/temporal-host/client";
import { createCachedLocalEnvironment } from "@bpmn-lean/temporal-host/testing";
import { EffectResultKind, createHostWorker } from "@bpmn-lean/temporal-host/worker";

import { projectRoot } from "./pipeline-target-support.ts";
import { populationStepDigests } from "./population-digest.ts";
import { deploymentOrder, populationPrograms } from "./population-programs.ts";
import { DiscoveredKind, discoverScenarios, type PopulationScenarioDocument } from "./scenario-discovery.ts";

const taskQueue = "bpmn-lean-differential-population-host";
const config = { scheduling: Scheduling.Durable, effectStartToCloseMs: 10_000, historyEventBudget: null };
const deadlineMs = 20_000;

/** One witness each of the hosted population's mechanisms. */
const witnesses = [
  "scenarios/open-rows/signal-broadcast-population/broadcast-start-fails-catch-still-delivered.population-scenario.json",
  "scenarios/open-rows/signal-broadcast-population/broadcast-expired-receiver-unchanged.population-scenario.json",
  "scenarios/open-rows/signal-broadcast-population/broadcast-explicit-order.population-scenario.json",
  "scenarios/open-rows/signal-broadcast-population/broadcast-two-definitions-starts-and-catches.population-scenario.json",
  "scenarios/open-rows/signal-broadcast-population/broadcast-superseded-version-not-started.population-scenario.json",
  "scenarios/open-rows/signal-broadcast-population/broadcast-replay.population-scenario.json",
  "scenarios/open-rows/signal-broadcast-population/emitter-first-cascade.population-scenario.json",
  "scenarios/open-rows/signal-broadcast-population/sibling-branch-cascade.population-scenario.json",
  "scenarios/open-rows/message-start-population/criteria-select-one-of-two-instances.population-scenario.json",
  "scenarios/open-rows/message-start-population/criteria-ambiguous-two-instances.population-scenario.json",
  "scenarios/open-rows/message-start-population/criteria-none-no-start-definition.population-scenario.json",
  "scenarios/open-rows/message-start-population/publish-falls-back-to-start.population-scenario.json",
  "scenarios/open-rows/message-start-population/publish-waiting-catch-wins-over-start.population-scenario.json",
  "scenarios/open-rows/message-start-population/start-replay-different-content.population-scenario.json",
  "scenarios/open-rows/conditional-start-population/one-start-fails-others-start.population-scenario.json",
  "scenarios/open-rows/conditional-start-population/two-definitions-one-request.population-scenario.json",
  "scenarios/message-key-correlation/unique.population-scenario.json",
];

type Step = Readonly<Record<string, JsonValue>>;
type Expected = Readonly<{
  steps: readonly Readonly<{ commandId: string; resolution: JsonValue }>[];
  processStates: readonly Readonly<{ instanceId: string; status: string; openWaits: readonly Readonly<{ id: Readonly<{ elementId: string }> }>[] }>[];
}>;

let environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>>;
let worker: Awaited<ReturnType<typeof createHostWorker>>;
let running: Promise<void>;
let processes: ProcessClient;

before(async () => {
  environment = await createCachedLocalEnvironment({
    identity: "bpmn-lean-differential-population-host",
    downloadDirectory: path.join(projectRoot, ".cache/temporal-cli/"),
  });
  worker = await createHostWorker({
    connection: environment.nativeConnection,
    taskQueue,
    scriptTimeoutMs: 1_000,
    effects: async () => ({ kind: EffectResultKind.Success, outputs: [] }),
  });
  running = worker.run();
  processes = new ProcessClient(environment.client, taskQueue);
});

after(async () => {
  worker.shutdown();
  await running;
  await environment.teardown();
});

const withoutTime = (json: Step): Step => {
  const { at: _at, ...rest } = json;
  return rest;
};

async function quiet(population: PopulationClient): Promise<void> {
  const stop = Date.now() + deadlineMs;
  while (await population.backlog() > 0) {
    if (Date.now() > stop) throw new Error(`the population did not settle within ${String(deadlineMs)} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Replay `document` through a fresh hosted population; the resolutions of its commands, in order. */
async function replay(relativePath: string, document: PopulationScenarioDocument, rolloverEvents: number | null) {
  const sources = await populationPrograms(relativePath, document);
  const name = `population-${randomUUID()}`;
  const population = new PopulationClient(environment.client, taskQueue, name, config, rolloverEvents);
  const steps = document.steps as readonly Step[];
  const order = deploymentOrder((document as unknown as Readonly<{ definitions: readonly Step[] }>).definitions
    .map((definition) => definition["definitionRef"] as string), steps);
  const deployed = new Map<string, Readonly<{ deploymentId: number; program: JsonValue }>>();
  let next = 0;
  const deploy = async (): Promise<void> => {
    const program = sources[next] as JsonValue;
    const definitionRef = order[next] as string;
    const deploymentRequestId = `${name}:${String(next)}`;
    const answer = await population.registerDeployment({ deploymentRequestId, digest: definitionRef, program });
    // The registry records the answer the caller received, deploy time included, across the start Activity's await.
    assert.deepEqual(await population.deployment(deploymentRequestId), answer, `${relativePath}: deployment ${deploymentRequestId}`);
    if ("deploymentId" in answer) deployed.set(definitionRef, { deploymentId: answer.deploymentId, program });
    next += 1;
  };
  // The definitions no deploy step names deploy first, in list order (`deploymentOrder`).
  const implicit = order.length - steps.filter((step) => step["kind"] === "deploy").length;
  while (next < implicit) await deploy();
  const chains = new Map<string, string>();
  const resolutions: JsonValue[] = [];
  for (const step of steps) {
    switch (step["kind"]) {
      case "deploy":
        await deploy();
        break;
      case "instance": {
        const instanceId = step["instanceId"] as string;
        const stimulus = withoutTime(step["stimulus"] as Step);
        if (stimulus["kind"] === "start") {
          const target = deployed.get(step["definitionRef"] as string);
          assert.ok(target !== undefined, `${relativePath}: ${instanceId} starts an undeployed definition`);
          const workflowId = `${name}-${instanceId}`;
          chains.set(instanceId, workflowId);
          await processes.start({ workflowId, program: target.program, config, start: stimulus, population: { population: name, deploymentId: target.deploymentId } });
        } else {
          const workflowId = chains.get(instanceId) ?? processInstanceWorkflowId(instanceId);
          await (stimulus["kind"] === "deliver" ? processes.deliver(workflowId, stimulus) : processes.command(workflowId, stimulus));
        }
        break;
      }
      default:
        resolutions.push((await population.command(step["kind"] as string, withoutTime(step) as JsonValue & { commandId: string })).resolution);
    }
    await quiet(population);
  }
  return { resolutions, chains, name };
}

async function witnessed(rolloverEvents: number | null, only: readonly string[]): Promise<number> {
  let compared = 0;
  for (const scenario of await discoverScenarios()) {
    if (scenario.kind !== DiscoveredKind.PopulationScenario || !only.includes(scenario.relativePath)) continue;
    const document = scenario.document;
    const expected = JSON.parse(JSON.stringify(runPopulation(await populationPrograms(scenario.relativePath, document), document,
      populationStepDigests(document.steps)))) as Expected;
    const { resolutions, chains, name } = await replay(scenario.relativePath, document, rolloverEvents);
    assert.deepEqual(resolutions, expected.steps.map((step) => step.resolution), scenario.relativePath);
    for (const state of expected.processStates) {
      const observed = await processes.observation(chains.get(state.instanceId) ?? processInstanceWorkflowId(state.instanceId)) as Expected["processStates"][number];
      assert.deepEqual([observed.status, observed.openWaits.map((wait) => wait.id.elementId)],
        [state.status, state.openWaits.map((wait) => wait.id.elementId)], `${scenario.relativePath}: ${state.instanceId}`);
    }
    compared += 1;
  }
  return compared;
}

test("each population mechanism answers through the hosted ingress as through the kernel's population runner", async () => {
  assert.equal(await witnessed(null, witnesses), witnesses.length);
});

test("commands settle with the runner's resolutions while the ingress continues as new between their receivers", async () => {
  const fanOuts = witnesses.filter((witness) => witness.includes("broadcast-two-definitions") || witness.includes("one-start-fails"));
  assert.equal(await witnessed(12, fanOuts), fanOuts.length);
});

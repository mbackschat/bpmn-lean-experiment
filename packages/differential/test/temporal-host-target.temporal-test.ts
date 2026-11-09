/**
 * The Temporal host target of the differential, run in hosted CI only (it starts an ephemeral Temporal server): every
 * discovered single-instance scenario runs through `@bpmn-lean/temporal-host`'s scenario runner on external
 * scheduling, and its canonical result equals the TypeScript kernel's whole result. The kernel oracle
 * (`kernel-behavior-oracle.integration-test.ts`) establishes that the TypeScript result is also Lean's and that it
 * agrees with every retained CIB Seven result, so this closes the host against both.
 *
 * Population scenarios are not run here: the host serves one process instance per Workflow chain, and cross-instance
 * routing is population-row work (proposal, Temporal hosting preflight). On external scheduling timer firings and effect
 * results are the scenario's own inputs, so the host must never start an effect Activity; one that does is a host
 * defect this test reports.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";

import { firstValueDisagreement } from "@bpmn-lean/differential";
import type { ValueDisagreement } from "@bpmn-lean/differential";
import { runScenario as runKernelScenario } from "@bpmn-lean/kernel";
import { ProcessClient } from "@bpmn-lean/temporal-host/client";
import type { JsonValue } from "@bpmn-lean/temporal-host/client";
import { createCachedLocalEnvironment, runScenario } from "@bpmn-lean/temporal-host/testing";
import { EffectResultKind, createHostWorker } from "@bpmn-lean/temporal-host/worker";
import type { EffectRequest } from "@bpmn-lean/temporal-host/worker";

import { projectRoot } from "./pipeline-target-support.ts";
import { DiscoveredKind, discoverScenarios, kernelProgramFor } from "./scenario-discovery.ts";

const taskQueue = "bpmn-lean-differential-temporal-host";

/** JSON serialization erases what a wire value cannot carry, as every Temporal payload does. */
const wire = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;

let environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>>;
let worker: Awaited<ReturnType<typeof createHostWorker>>;
let running: Promise<void>;
let client: ProcessClient;
const effectRequests: EffectRequest[] = [];

before(async () => {
  environment = await createCachedLocalEnvironment({
    identity: "bpmn-lean-differential-temporal-host",
    downloadDirectory: path.join(projectRoot, ".cache/temporal-cli/"),
  });
  worker = await createHostWorker({
    connection: environment.nativeConnection,
    taskQueue,
    scriptTimeoutMs: 1_000,
    effects: async (request) => {
      effectRequests.push(request);
      return { kind: EffectResultKind.Success, outputs: [] };
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

test("the Temporal host returns the kernel's result on every discovered single-instance scenario", async (t) => {
  const disagreements: Array<Readonly<{ scenario: string } & ValueDisagreement>> = [];
  let compared = 0;
  for (const scenario of await discoverScenarios()) {
    if (scenario.kind !== DiscoveredKind.Scenario) continue;
    const program = wire(await kernelProgramFor(scenario.relativePath, scenario.document.bpmn, scenario.document.profile));
    const document = wire(JSON.parse(await readFile(path.join(projectRoot, scenario.relativePath), "utf8")));
    const hosted = await runScenario(program, document, {
      client,
      workflowIdPrefix: `differential-${scenario.document.id}-${randomUUID()}`,
    });
    const difference = firstValueDisagreement(wire(runKernelScenario(program, document)), wire(hosted), "result");
    if (difference !== null) disagreements.push({ scenario: `${scenario.document.id} (${scenario.relativePath})`, ...difference });
    compared += 1;
  }
  t.diagnostic(`scenarios ${String(compared)}, disagreements ${String(disagreements.length)}, effect Activities ${String(effectRequests.length)}`);
  assert.ok(compared > 0, "discovery found no single-instance scenario");
  assert.deepEqual(
    { disagreements, effectRequests: effectRequests.map(({ key }) => key) },
    { disagreements: [], effectRequests: [] },
    disagreements.map((entry) => JSON.stringify(entry)).join("\n"),
  );
});

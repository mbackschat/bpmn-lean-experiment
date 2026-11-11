/**
 * The host's in-process chain path against the kernel runner, without a server: every discovered single-instance
 * scenario runs through the scenario runner over the memory host, which applies each input through the same kernel
 * binding and `applyInput` the process Workflow uses, and its canonical result equals the TypeScript kernel's whole
 * result. Any decision the runner makes on a single-instance input that the host's chain does not share, such as a
 * Timer start's on-time refusal, shows here before the hosted target (`temporal-host-target.temporal-test.ts`) runs.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { firstValueDisagreement } from "@bpmn-lean/differential";
import type { ValueDisagreement } from "@bpmn-lean/differential";
import { runScenario as runKernelScenario } from "@bpmn-lean/kernel";
import type { JsonValue } from "@bpmn-lean/temporal-host/host";
import { createMemoryProcessHost } from "@bpmn-lean/temporal-host/memory-host";
import { runScenario } from "@bpmn-lean/temporal-host/testing";

import { projectRoot } from "./pipeline-target-support.ts";
import { DiscoveredKind, discoverScenarios, scenarioKernelInput } from "./scenario-discovery.ts";

const wire = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;

test("the memory host returns the kernel's result on every discovered single-instance scenario", async () => {
  const host = createMemoryProcessHost({ taskQueue: "memory-target" });
  const client = {
    start: host.start.bind(host),
    command: host.command.bind(host),
    deliver: host.deliver.bind(host),
    timerFire: host.arrive.bind(host),
    effectResult: host.arrive.bind(host),
    observation: host.observation.bind(host),
    state: host.state.bind(host),
  };
  const disagreements: Array<Readonly<{ scenario: string } & ValueDisagreement>> = [];
  let compared = 0;
  for (const scenario of await discoverScenarios()) {
    if (scenario.kind !== DiscoveredKind.Scenario) continue;
    const input = await scenarioKernelInput(scenario.relativePath, scenario.document.bpmn, scenario.document.profile);
    if (input.kind === "refused") continue;
    const program = wire(input.program);
    const document = wire(JSON.parse(await readFile(path.join(projectRoot, scenario.relativePath), "utf8")));
    const hosted = await runScenario(program, document, { client, workflowIdPrefix: `memory-${randomUUID()}` });
    const difference = firstValueDisagreement(wire(runKernelScenario(program, document)), wire(hosted), "result");
    if (difference !== null) disagreements.push({ scenario: scenario.relativePath, ...difference });
    compared += 1;
  }
  assert.ok(compared > 0, "discovery found no single-instance scenario");
  assert.deepEqual(disagreements, []);
});

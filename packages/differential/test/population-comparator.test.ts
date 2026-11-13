import assert from "node:assert/strict";
import { test } from "node:test";

import { comparePopulationResults, populationClockMs } from "@bpmn-lean/differential";

const target = { processInstanceId: "Claim", elementId: "Receive", activation: 1 };
const started = (instanceId: string, deploymentId: number) =>
  ({ kind: "started", instanceId, deploymentId, version: 1, startEvent: "Start" });
const state = (instanceId: string, logicalTimeMs: number, definition: unknown = null) => ({
  kind: "state", instanceId, status: "running", logicalTimeMs, variables: [],
  openWaits: [{ id: target, definition, input: "deliver", detail: { kind: "message" } }],
});
const called = { key: "Review", version: 1, versionTag: null, deployment: 1, tenant: null, sourceSha256: null };

const kernel = {
  deployments: [
    { deploymentId: 1, definitionRef: "a", versions: [{ key: "Z", version: 1 }, { key: "A", version: 1 }], outcome: { kind: "deployed" } },
    { deploymentId: 2, definitionRef: "b", versions: [], outcome: { kind: "deploymentRefused", code: "work.call.cycle" } },
  ],
  steps: [
    { commandId: "publish", ordinal: 1, at: 5, resolution: { kind: "committed", target } },
    { commandId: "broadcast", ordinal: 2, at: 5, resolution: { kind: "fanOut", entries: [
      { kind: "delivered", target }, started("start:b", 2), started("start:a", 1), { kind: "skipped", target },
    ] } },
    { commandId: "late", ordinal: 3, at: 7, resolution: { kind: "noMatch" } },
    { commandId: "early", ordinal: 4, at: 7, resolution: { kind: "rejected", code: "timer-not-due" } },
  ],
  inputFailures: [{ commandId: "again", outcome: "rejected", code: "instance-already-started" }],
  processStates: [state("Claim", 0, { ...called, sourceSha256: "ab" })],
};

const cib = {
  deployments: [
    { deploymentId: 1, definitionRef: "a", versions: [{ key: "A", version: 1 }, { key: "Z", version: 1 }], outcome: { kind: "deployed" } },
    { deploymentId: 2, definitionRef: "b", versions: [], outcome: { kind: "deploymentRefused" } },
  ],
  steps: [
    { commandId: "publish", ordinal: 1, at: 5, outcome: "committed", resolution: { kind: "committed", target } },
    { commandId: "broadcast", ordinal: 2, at: 5, outcome: "committed", resolution: { kind: "fanOut", entries: [
      started("start:a", 1), started("start:b", 2),
    ] } },
    { commandId: "late", ordinal: 3, at: 7, outcome: "rolledBack", resolution: { kind: "noMatch" } },
    { commandId: "early", ordinal: 4, at: 7, outcome: "rejected" },
  ],
  inputFailures: [{ commandId: "again", outcome: "rejected" }],
  processStates: [state("Claim", 7, called)],
};

test("a kernel population result agrees with CIB's once projected onto CIB's observation boundary", () => {
  assert.equal(comparePopulationResults(cib, kernel, 7), null);
});

test("a delivery's cascade and an instance input's are kernel-only receiver outcomes CIB's evidence never records", () => {
  const cascaded = {
    ...kernel,
    steps: [{ ...kernel.steps[0]!, resolution: { kind: "committed", target, cascade: [{ kind: "delivered", target }] } }, ...kernel.steps.slice(1)],
    inputCascades: [{ commandId: "throw", entries: [{ kind: "delivered", target }] }],
  };
  assert.equal(comparePopulationResults(cib, cascaded, 7), null);
});

test("every member CIB observes still separates the targets after the projection", () => {
  const disagreeing: ReadonlyArray<readonly [string, typeof cib]> = [
    ["deployment outcome", { ...cib, deployments: [cib.deployments[0]!, { ...cib.deployments[1]!, outcome: { kind: "deployed" } }] }],
    ["command outcome", { ...cib, steps: [...cib.steps.slice(0, 3), { ...cib.steps[3]!, outcome: "rolledBack" }] }],
    ["started instance", { ...cib, steps: [cib.steps[0]!, { ...cib.steps[1]!, resolution: { kind: "fanOut", entries: [started("start:a", 1)] } },
      ...cib.steps.slice(2)] }],
    ["called definition version", { ...cib, processStates: [state("Claim", 7, { ...called, version: 2 })] }],
    ["global clock", { ...cib, processStates: [state("Claim", 5, called)] }],
    ["input failure", { ...cib, inputFailures: [] }],
  ];
  for (const [name, evidence] of disagreeing) {
    assert.notEqual(comparePopulationResults(evidence, kernel, 7), null, name);
  }
});

test("reports a diverging step before the final states it leads to", () => {
  const evidence = { ...cib, steps: [...cib.steps.slice(0, 3), { ...cib.steps[3]!, outcome: "rolledBack" }],
    inputFailures: [], processStates: [state("Claim", 5, called)] };
  assert.equal(comparePopulationResults(evidence, kernel, 7)?.path, "result.steps[3].outcome");
});

test("CIB's clock at the end of a population is the latest step, input or Timer time", () => {
  assert.equal(populationClockMs([]), 0);
  assert.equal(populationClockMs([
    { kind: "deploy", definitionRef: "a", at: 3 },
    { kind: "instance", stimulus: { kind: "timerFire", logicalTimeMs: 40 } },
    { kind: "instance", at: 20, stimulus: { kind: "start", trigger: { kind: "timer", logicalTimeMs: 30 } } },
    { kind: "publish", at: 10 },
  ]), 40);
});

/**
 * The population wire contract: every step kind of `engine-population-scenario.schema.json` and every deployment
 * outcome, resolution and fan-out entry of `engine-population-result.schema.json` is accepted in its form, and the
 * forms the contract excludes are refused.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

type Json = Record<string, unknown>;

async function schema(name: string): Promise<Json> {
  return JSON.parse(await readFile(`${projectRoot}/contracts/schemas/${name}`, "utf8")) as Json;
}

async function validators(): Promise<{ scenario: ValidateFunction; result: ValidateFunction }> {
  const ajv = new Ajv2020({ strict: true, strictTuples: false });
  for (const name of ["scenario.schema.json", "canonical-result.schema.json", "engine-population-scenario.schema.json"]) {
    ajv.addSchema(await schema(name));
  }
  return {
    scenario: ajv.getSchema("https://bpmn-lean.local/schemas/engine-population-scenario.schema.json")!,
    result: ajv.compile(await schema("engine-population-result.schema.json")),
  };
}

const channel = { kind: "directMessage", messageId: "Message_A" };
const occurrence = { processInstanceId: "I", elementId: "Catch", activation: 1 };
const start = { kind: "start", commandId: "start", instanceId: "I", variables: [] };

const scenario = (...steps: Json[]): Json => ({
  kind: "populationScenario",
  id: "population-contract",
  profile: "bpmn-2.0.2",
  definitions: [{
    definitionRef: "d",
    bpmn: { id: "d", relativePath: "scenarios/d.bpmn", sha256: "0".repeat(64), sourceOverlay: null },
  }],
  steps,
  provenance: { normativeRefs: ["BPMN 2.0.2 Clause 13"], cibRevision: "not-applicable", cibRefs: [] },
});

const steps: Readonly<Record<string, Json>> = {
  instance: { kind: "instance", definitionRef: "d", instanceId: "I", stimulus: start, at: 5 },
  deploy: { kind: "deploy", definitionRef: "d", at: 10 },
  publish: {
    kind: "publish", commandId: "p", address: { definition: { deploymentId: 1 }, channel },
    criteria: [{ target: { kind: "processVariable", name: "k" }, expected: { kind: "string", value: "v" } }],
    payload: { kind: "string", value: "x" }, variables: [], businessKey: "b", mode: "any",
  },
  publishByName: { kind: "publish", commandId: "n", address: { definition: { processKey: "P" }, name: "M" }, criteria: [], variables: [], mode: "startOnly" },
  broadcast: {
    kind: "broadcast", commandId: "b", address: { signalRef: { namespace: "urn:x", id: "S" } }, variables: [],
    order: [{ kind: "occurrence", occurrence }, { kind: "start", deploymentId: 1, startEvent: "Start" }],
  },
  evaluateConditions: { kind: "evaluateConditions", commandId: "c", variables: [], businessKey: "b", order: [] },
  timerStart: { kind: "timerStart", commandId: "t", deploymentId: 1, startEvent: "Start", dueMs: 3_600_000, at: 3_600_005 },
};

test("accepts every population step kind in its contract form", async () => {
  const { scenario: validate } = await validators();
  for (const [name, step] of Object.entries(steps)) {
    assert.ok(validate(scenario(step)), `${name}: ${JSON.stringify(validate.errors)}`);
  }
});

test("refuses a broadcast business key, a two-address publication and an unknown mode", async () => {
  const { scenario: validate } = await validators();
  const refused: Readonly<Record<string, Json>> = {
    "broadcast business key": { ...steps["broadcast"], businessKey: "b" },
    "publication by channel and name": { ...steps["publish"], address: { channel, name: "M" } },
    "broadcast by name and signalRef": { ...steps["broadcast"], address: { name: "S", signalRef: { id: "S" } } },
    "unknown mode": { ...steps["publish"], mode: "everything" },
    "negative step time": { ...steps["deploy"], at: -1 },
  };
  for (const [name, step] of Object.entries(refused)) assert.equal(validate(scenario(step)), false, name);
});

const result = (stepResults: Json[], deployments: Json[] = []): Json => ({
  kind: "enginePopulationResult", scenarioId: "population-contract", deployments, steps: stepResults, processStates: [],
});

const resolutions: Readonly<Record<string, Json>> = {
  committed: { kind: "committed", target: occurrence },
  failed: { kind: "failed", target: occurrence, outcome: "rejected", code: "message-channel-mismatch" },
  fanOut: {
    kind: "fanOut",
    entries: [
      { kind: "delivered", target: occurrence },
      { kind: "started", instanceId: "start:1:b:1:1:5:Start", deploymentId: 1, version: 1, startEvent: "Start" },
      { kind: "skipped", target: occurrence },
      { kind: "failed", target: { kind: "start", deploymentId: 1, startEvent: "Start" }, outcome: "unsupported", code: "population-cascade-bound" },
    ],
  },
  noMatch: { kind: "noMatch" },
  ambiguous: { kind: "ambiguous" },
  rejected: { kind: "rejected", code: "definition-not-deployed" },
  unsupported: { kind: "unsupported", code: "population-not-implemented" },
};

test("accepts every deployment outcome, resolution and fan-out entry of a population result", async () => {
  const { result: validate } = await validators();
  const deployments = [
    { deploymentId: 1, definitionRef: "d", versions: [{ key: "P", version: 1 }], outcome: { kind: "deployed" } },
    { deploymentId: 2, definitionRef: "d", versions: [], outcome: { kind: "deploymentRefused", code: "work.call.ambiguous" } },
  ];
  for (const [name, resolution] of Object.entries(resolutions)) {
    const document = result([{ commandId: "c", ordinal: 1, at: 0, resolution }], deployments);
    assert.ok(validate(document), `${name}: ${JSON.stringify(validate.errors)}`);
  }
  const failures = { ...result([]), inputFailures: [{ commandId: "start", outcome: "rejected", code: "definition-not-deployed" }] };
  assert.ok(validate(failures), JSON.stringify(validate.errors));
});

test("refuses an unknown resolution, an outcome class outside the four and an empty input-failure list", async () => {
  const { result: validate } = await validators();
  assert.equal(validate(result([{ commandId: "c", ordinal: 1, at: 0, resolution: { kind: "rejectedNoMatch" } }])), false);
  const failed = { ...resolutions["failed"], outcome: "committed" };
  assert.equal(validate(result([{ commandId: "c", ordinal: 1, at: 0, resolution: failed }])), false);
  assert.equal(validate({ ...result([]), inputFailures: [] }), false);
});

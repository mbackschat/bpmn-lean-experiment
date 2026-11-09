/** The engine deployment value both Product 2 processes read from one environment variable. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeEngineDeployment,
  engineDeploymentRuntimeOptions,
  readEngineDeploymentEnvironment,
} from "@bpmn-lean/platform-engine-gateway";

const served = { timers: true, messages: true, effects: false, userTasks: true, calls: false } as const;
const deployment = {
  profiles: { standard: [], incidents: ["CIB-EXT-0013", "CIB-OP-0009"] },
  servedRequirements: served,
  effectStartToCloseMs: 30_000,
} as const;

test("a deployment decodes into its profile catalog, served requirements and effect bound", () => {
  const decoded = decodeEngineDeployment(structuredClone(deployment));
  assert.deepEqual(decoded, deployment);
  const options = engineDeploymentRuntimeOptions(decoded);
  assert.deepEqual(options.profileRelations("incidents"), ["CIB-EXT-0013", "CIB-OP-0009"]);
  assert.deepEqual(options.profileRelations("standard"), []);
  assert.equal(options.profileRelations("absent"), null);
  // An inherited member is not a catalog entry.
  assert.equal(options.profileRelations("toString"), null);
  assert.deepEqual(options.servedRequirements, served);
  assert.equal(options.effectStartToCloseMs, 30_000);
});

test("the environment variable is required and strict JSON", () => {
  assert.deepEqual(
    readEngineDeploymentEnvironment({ PLATFORM_ENGINE_DEPLOYMENT_JSON: JSON.stringify(deployment) }),
    deployment,
  );
  assert.throws(() => readEngineDeploymentEnvironment({}), /PLATFORM_ENGINE_DEPLOYMENT_JSON is required/u);
  assert.throws(() => readEngineDeploymentEnvironment({ PLATFORM_ENGINE_DEPLOYMENT_JSON: "{" }), /strict JSON/u);
});

test("every member is exact: no unknown, missing or loosely typed field is defaulted", () => {
  const { effectStartToCloseMs: _bound, ...withoutBound } = deployment;
  for (const candidate of [
    null,
    [],
    withoutBound,
    { ...deployment, extra: true },
    { ...deployment, profiles: [] },
    { ...deployment, profiles: { "": [] } },
    { ...deployment, profiles: { standard: ["CIB-OP-0009", "CIB-OP-0009"] } },
    { ...deployment, profiles: { standard: [""] } },
    { ...deployment, profiles: { standard: "CIB-OP-0009" } },
    { ...deployment, servedRequirements: { ...served, timers: "yes" } },
    { ...deployment, servedRequirements: { ...served, compensation: true } },
    { ...deployment, servedRequirements: { timers: true } },
    { ...deployment, effectStartToCloseMs: 0 },
    { ...deployment, effectStartToCloseMs: 1.5 },
  ]) {
    assert.throws(() => decodeEngineDeployment(candidate), TypeError);
  }
});

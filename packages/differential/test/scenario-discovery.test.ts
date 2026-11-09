import assert from "node:assert/strict";
import { test } from "node:test";

import { discoveredScenarioCount } from "../../../scripts/pipeline-budget.ts";
import { DiscoveredKind, discoverScenarios } from "./scenario-discovery.ts";

test("discovery finds both scenario kinds and binds retained CIB evidence by exact bytes", async () => {
  const scenarios = await discoverScenarios();
  const kinds = new Set(scenarios.map(({ kind }) => kind));
  assert.deepEqual([...kinds].sort(), [DiscoveredKind.PopulationScenario, DiscoveredKind.Scenario]);
  const withEvidence = scenarios.filter((scenario) => scenario.kind === DiscoveredKind.Scenario && scenario.evidence !== null);
  assert.ok(withEvidence.length > 0, "no retained CIB evidence was bound");
  for (const scenario of withEvidence) {
    assert.ok(scenario.kind === DiscoveredKind.Scenario && scenario.evidence !== null);
    assert.equal(scenario.evidence.relativePath, scenario.relativePath.replace(/scenario\.json$/u, "cibseven-evidence.json"));
  }
});

test("the pipeline deadline counts exactly the scenarios the differential discovers", async () => {
  // pipeline-budget counts files without a package build; a divergence would give the pipeline another catalog's deadline.
  assert.equal(discoveredScenarioCount(), (await discoverScenarios()).length);
});

test("discovery refuses evidence bound to other bytes and evidence without its scenario", async () => {
  await assert.rejects(discoverScenarios(["packages/differential/test/discovery-controls/unbound"]), /is not bound to the exact bytes/u);
  await assert.rejects(discoverScenarios(["packages/differential/test/discovery-controls/orphan"]), /has no scenario beside it/u);
});

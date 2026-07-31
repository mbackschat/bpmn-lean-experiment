import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  artifactCases,
  normativeArtifactCases,
} from "./contract-artifact-cases.ts";
import {
  discoverArtifactInventory,
  verifyArtifactRegistration,
} from "./capsule-roundtrip.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("discovers every profile, scenario, and evidence artifact through the registry", async () => {
  const inventory = await discoverArtifactInventory(projectRoot);

  assert.doesNotThrow(() =>
    verifyArtifactRegistration(
      inventory,
      artifactCases,
      normativeArtifactCases,
    ),
  );
});

test("rejects an artifact that exists outside the registry", () => {
  assert.throws(
    () =>
      verifyArtifactRegistration(
        {
          scenarioRelativePaths: [
            "scenarios/example/scenario.json",
            "scenarios/unregistered/scenario.json",
          ],
          evidenceRelativePaths: [
            "scenarios/example/cibseven-evidence.json",
          ],
          profileRelativePaths: ["profiles/example/profile.json"],
          referencedProfileRelativePaths: ["profiles/example/profile.json"],
        },
        [
          {
            scenarioRelativePath: "scenarios/example/scenario.json",
            evidenceRelativePath:
              "scenarios/example/cibseven-evidence.json",
          },
        ],
        [],
      ),
    /unregistered scenario artifact.*unregistered\/scenario\.json/u,
  );
});

test("rejects a profile that no registered scenario references", () => {
  assert.throws(
    () =>
      verifyArtifactRegistration(
        {
          scenarioRelativePaths: ["scenarios/example/scenario.json"],
          evidenceRelativePaths: [],
          profileRelativePaths: [
            "profiles/example/profile.json",
            "profiles/orphan/profile.json",
          ],
          referencedProfileRelativePaths: ["profiles/example/profile.json"],
        },
        [],
        [{ scenarioRelativePath: "scenarios/example/scenario.json" }],
      ),
    /unreferenced profile artifact.*orphan\/profile\.json/u,
  );
});

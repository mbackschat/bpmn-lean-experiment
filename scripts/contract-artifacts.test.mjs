import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  readAndVerifyArtifactSets,
  verifyArtifactSet,
} from "./contract-artifacts.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function cloneArtifactSet(artifactSet) {
  return {
    ...artifactSet,
    scenario: structuredClone(artifactSet.scenario),
    scenarioBytes: Buffer.from(artifactSet.scenarioBytes),
    evidence: structuredClone(artifactSet.evidence),
    bpmnBytes: Buffer.from(artifactSet.bpmnBytes),
  };
}

test("keeps every target scenario answer-free and binds retained CIB evidence by content", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);

  assert.equal(artifactSets.length, 4);
  for (const artifactSet of artifactSets) {
    assert.equal("calibration" in artifactSet.scenario, false);
    assert.equal(
      artifactSet.evidence.scenario.id,
      artifactSet.scenario.id,
    );
    assert.match(artifactSet.evidence.scenario.sha256, /^[0-9a-f]{64}$/);
  }
});

test("rejects a semantic answer smuggled into target input", async () => {
  const [artifactSet] = await readAndVerifyArtifactSets(projectRoot);
  const mutated = cloneArtifactSet(artifactSet);
  mutated.scenario.calibration = {
    status: "calibrated",
    expectedOutcome: mutated.evidence.result.outcome,
    expectedTrace: mutated.evidence.result.trace,
  };

  assert.throws(
    () => verifyArtifactSet(mutated),
    /scenario schema validation failed/,
  );
});

test("rejects retained evidence after its neutral scenario changes", async () => {
  const [artifactSet] = await readAndVerifyArtifactSets(projectRoot);
  const mutated = cloneArtifactSet(artifactSet);
  mutated.scenario.stimuli[0].commandId = "changed-start-command";
  mutated.scenarioBytes = Buffer.from(
    `${JSON.stringify(mutated.scenario, null, 2)}\n`,
  );

  assert.throws(
    () => verifyArtifactSet(mutated),
    /evidence scenario digest does not match/,
  );
});

test("rejects a meaningful invalid task-projection mutation", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  const interaction = artifactSets.find(
    ({ scenario }) =>
      scenario.id === "m1-user-task-discovery-completion",
  );
  assert.notEqual(interaction, undefined);
  const mutated = cloneArtifactSet(interaction);
  mutated.evidence.result.trace[2].openUserTasks[0].id.activation = 0;

  assert.throws(
    () => verifyArtifactSet(mutated),
    /evidence schema validation failed/,
  );
});

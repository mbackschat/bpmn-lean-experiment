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
    profile: structuredClone(artifactSet.profile),
    profileBytes: Buffer.from(artifactSet.profileBytes),
    scenario: structuredClone(artifactSet.scenario),
    scenarioBytes: Buffer.from(artifactSet.scenarioBytes),
    evidence: structuredClone(artifactSet.evidence),
    bpmnBytes: Buffer.from(artifactSet.bpmnBytes),
  };
}

function collectPropertyNames(value, names = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPropertyNames(item, names);
    }
    return names;
  }
  if (value !== null && typeof value === "object") {
    for (const [name, item] of Object.entries(value)) {
      names.add(name);
      collectPropertyNames(item, names);
    }
  }
  return names;
}

test("uses structural document kinds without embedded schema counters", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);

  for (const artifactSet of artifactSets) {
    assert.equal(artifactSet.profile.kind, "semanticProfile");
    assert.equal(artifactSet.scenario.kind, "scenario");
    assert.equal(artifactSet.evidence.kind, "cibSevenScenarioEvidence");
    for (const document of [
      artifactSet.profile,
      artifactSet.scenario,
      artifactSet.evidence,
    ]) {
      const propertyNames = collectPropertyNames(document);
      assert.equal(propertyNames.has("schemaVersion"), false);
      assert.equal(propertyNames.has("traceSchemaVersion"), false);
    }
  }
});

test("keeps every target scenario answer-free and binds retained CIB evidence by content", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);

  assert.equal(artifactSets.length, 3);
  for (const artifactSet of artifactSets) {
    assert.equal("calibration" in artifactSet.scenario, false);
    assert.equal(
      artifactSet.evidence.scenario.id,
      artifactSet.scenario.id,
    );
    assert.match(artifactSet.evidence.scenario.sha256, /^[0-9a-f]{64}$/);
    assert.equal(artifactSet.evidence.profile.id, artifactSet.profile.id);
    assert.match(artifactSet.evidence.profile.sha256, /^[0-9a-f]{64}$/);
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
      scenario.id === "user-task-discovery-completion",
  );
  assert.notEqual(interaction, undefined);
  const mutated = cloneArtifactSet(interaction);
  mutated.evidence.result.trace[2].openUserTasks[0].id.activation = 0;

  assert.throws(
    () => verifyArtifactSet(mutated),
    /evidence schema validation failed/,
  );
});

test("requires every semantic profile to identify its reviewed CIB-BPMN relationships", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);

  for (const artifactSet of artifactSets) {
    assert.ok(artifactSet.profile.bpmn.relationships.length > 0);
    for (const relationship of artifactSet.profile.bpmn.relationships) {
      assert.match(relationship, /^CIB-(AGR|OP|INT|EXT|CFG|LIM|DEV)-[0-9]{4}$/);
    }
  }

  const mutated = cloneArtifactSet(artifactSets[0]);
  delete mutated.profile.bpmn.relationships;

  assert.throws(
    () => verifyArtifactSet(mutated),
    /profile schema validation failed/,
  );

  const unknownRelationship = cloneArtifactSet(artifactSets[0]);
  unknownRelationship.profile.bpmn.relationships[0] = "CIB-AGR-9999";

  assert.throws(
    () => verifyArtifactSet(unknownRelationship),
    /profile references unknown CIB-BPMN relationship/,
  );
});

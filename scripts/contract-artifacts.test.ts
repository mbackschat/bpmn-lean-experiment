import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  compareCanonicalStrings,
  readAndVerifyArtifactSets,
  readAndVerifyNormativeArtifactSets,
  verifyArtifactSet,
  verifyDefinitionArtifacts,
  verifyNormativeArtifactSet,
} from "./contract-artifacts.ts";
import {
  bindScenarioBytes,
  checkedNodeKind,
  cloneArtifactSet,
  collectIntegerSchemas,
  collectPropertyNames,
  parallelDefinitionArtifacts,
  required,
  requiredAt,
  requireAwaitEffect,
  requireAwaitUserTask,
  requireCheckedUserTask,
  requireMutableState,
  requireServiceTask,
  requireUserTaskCompletion,
  semanticOperationKind,
  serviceTaskDefinitionArtifacts,
} from "./contract-artifact-test-fixtures.ts";
import type {
  MutableDefinitionArtifacts,
} from "./contract-artifact-test-fixtures.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("separates normative profile authority from executable CIB oracle authority", async () => {
  const artifactSets =
    await readAndVerifyNormativeArtifactSets(projectRoot);
  assert.equal(artifactSets.length, 3);
  for (const artifactSet of artifactSets) {
    assert.equal(
      artifactSet.profile.normativeAuthority.name,
      "OMG Business Process Model and Notation",
    );
    assert.equal(
      "oracle" in artifactSet.profile,
      false,
    );
    assert.equal(
      "environment" in artifactSet.profile,
      false,
    );
    assert.equal("calibration" in artifactSet.scenario, false);
  }

  const artifactSet = requiredAt(
    artifactSets,
    0,
    "normative artifact sets",
  );
  const mixedAuthority = {
    ...artifactSet,
    profile: {
      ...artifactSet.profile,
      oracle: {
        name: "forbidden second authority",
        version: "1",
        revision: "0".repeat(40),
      },
      environment: {},
    },
  };
  assert.throws(
    () => verifyNormativeArtifactSet(
      mixedAuthority as unknown as typeof artifactSet,
    ),
    /profile schema validation failed/,
  );
});

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

  assert.equal(artifactSets.length, 10);
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
  const artifactSet = requiredAt(
    await readAndVerifyArtifactSets(projectRoot),
    0,
    "artifact sets",
  );
  const mutated = cloneArtifactSet(artifactSet);
  (
    mutated.scenario as unknown as Record<string, unknown>
  ).calibration = {
    status: "calibrated",
    expectedOutcome: mutated.evidence.result.outcome,
    expectedTrace: mutated.evidence.result.trace,
  };

  assert.throws(
    () => verifyArtifactSet(mutated),
    /scenario schema validation failed/,
  );
});

test("pins every JSON integer to the JavaScript-safe domain", async () => {
  for (const schemaName of [
    "scenario.schema.json",
    "canonical-result.schema.json",
    "semantic-profile.schema.json",
    "cibseven-evidence.schema.json",
    "checked-process.schema.json",
    "semantic-process.schema.json",
  ]) {
    const schema = JSON.parse(
      await readFile(
        new URL(`../contracts/schemas/${schemaName}`, import.meta.url),
        "utf8",
      ),
    );
    for (const integer of collectIntegerSchemas(schema)) {
      assert.equal(
        integer.schema.maximum,
        Number.MAX_SAFE_INTEGER,
        `${schemaName} ${integer.path}`,
      );
    }
  }

  const artifactSet = requiredAt(
    await readAndVerifyArtifactSets(projectRoot),
    0,
    "artifact sets",
  );
  const unsafe = cloneArtifactSet(artifactSet);
  requireUserTaskCompletion(unsafe.scenario.stimuli[1]).taskId.activation =
    Number.MAX_SAFE_INTEGER + 1;
  bindScenarioBytes(
    unsafe,
    `${JSON.stringify(unsafe.scenario, null, 2)}\n`,
  );
  assert.throws(
    () => verifyArtifactSet(unsafe),
    /scenario schema validation failed/,
  );

  const fractional = cloneArtifactSet(artifactSet);
  requireUserTaskCompletion(
    fractional.scenario.stimuli[1],
  ).taskId.activation = 1.5;
  bindScenarioBytes(
    fractional,
    `${JSON.stringify(fractional.scenario, null, 2)}\n`,
  );
  assert.throws(
    () => verifyArtifactSet(fractional),
    /scenario schema validation failed/,
  );
});

test("uses Unicode scalar-value order without normalization", () => {
  assert.ok(compareCanonicalStrings("\u{E000}", "\u{10000}") < 0);
  assert.ok(compareCanonicalStrings("e\u{301}", "\u{E9}") < 0);
  assert.notEqual("e\u{301}", "\u{E9}");
  assert.throws(
    () => compareCanonicalStrings("\uD800", "valid"),
    /unpaired Unicode surrogate/,
  );
});

test("rejects duplicate keys and unpaired surrogates in exact JSON bytes", async () => {
  const artifactSet = requiredAt(
    await readAndVerifyArtifactSets(projectRoot),
    0,
    "artifact sets",
  );

  const duplicate = cloneArtifactSet(artifactSet);
  const duplicateBytes = JSON.stringify(duplicate.scenario, null, 2).replace(
    '"kind": "scenario"',
    '"kind": "scenario",\n  "kind": "scenario"',
  );
  bindScenarioBytes(duplicate, `${duplicateBytes}\n`);
  assert.throws(
    () => verifyArtifactSet(duplicate),
    /duplicate JSON object key: kind/,
  );

  const surrogate = cloneArtifactSet(artifactSet);
  surrogate.scenario.id = "scenario-\uD800";
  surrogate.evidence.scenario.id = surrogate.scenario.id;
  bindScenarioBytes(
    surrogate,
    `${JSON.stringify(surrogate.scenario, null, 2)}\n`,
  );
  assert.throws(
    () => verifyArtifactSet(surrogate),
    /unpaired Unicode surrogate/,
  );
});

test("distinguishes unknown, missing, closed-enum, null, and absent fields", async () => {
  const artifactSet = requiredAt(
    await readAndVerifyArtifactSets(projectRoot),
    0,
    "artifact sets",
  );

  const missing = cloneArtifactSet(artifactSet);
  delete (
    missing.scenario as unknown as Partial<{ provenance: unknown }>
  ).provenance;
  bindScenarioBytes(missing, `${JSON.stringify(missing.scenario)}\n`);
  assert.throws(
    () => verifyArtifactSet(missing),
    /scenario schema validation failed/,
  );

  const closedEnum = cloneArtifactSet(artifactSet);
  (
    requiredAt(
      closedEnum.scenario.stimuli,
      1,
      "closed-enum stimuli",
    ) as unknown as { kind: string }
  ).kind = "completeAnyTask";
  bindScenarioBytes(closedEnum, `${JSON.stringify(closedEnum.scenario)}\n`);
  assert.throws(
    () => verifyArtifactSet(closedEnum),
    /scenario schema validation failed/,
  );

  const nullName = parallelDefinitionArtifacts();
  const checkedTask = requireCheckedUserTask(
    nullName.checkedProcess.nodes.find(
      ({ kind }) => kind === checkedNodeKind.UserTask,
    ),
  );
  const programTask = requireAwaitUserTask(
    nullName.semanticProcess.operations.find(
      ({ kind }) => kind === semanticOperationKind.AwaitUserTask,
    ),
  );
  checkedTask.name = null;
  programTask.task.name = null;
  await assert.doesNotReject(
    verifyDefinitionArtifacts(projectRoot, nullName),
  );

  const absentName = parallelDefinitionArtifacts();
  const absentCheckedTask = requireCheckedUserTask(
    absentName.checkedProcess.nodes.find(
      ({ kind }) => kind === checkedNodeKind.UserTask,
    ),
  );
  delete (
    absentCheckedTask as Partial<{ name: string | null }>
  ).name;
  await assert.rejects(
    verifyDefinitionArtifacts(projectRoot, absentName),
    /checked process schema validation failed/,
  );
});

test("rejects retained evidence after its neutral scenario changes", async () => {
  const artifactSet = requiredAt(
    await readAndVerifyArtifactSets(projectRoot),
    0,
    "artifact sets",
  );
  const mutated = cloneArtifactSet(artifactSet);
  requiredAt(
    mutated.scenario.stimuli,
    0,
    "scenario stimuli",
  ).commandId = "changed-start-command";
  mutated.scenarioBytes = Buffer.from(
    `${JSON.stringify(mutated.scenario, null, 2)}\n`,
  );

  assert.throws(
    () => verifyArtifactSet(mutated),
    /evidence scenario digest does not match/,
  );
});

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  readAndVerifyArtifactSets,
  readAndVerifyNormativeArtifactSets,
  verifyArtifactSet,
  verifyNormativeArtifactSet,
} from "./contract-artifacts.ts";
import {
  artifactSetAt,
  bindScenarioBytes,
  cloneArtifactSet,
  collectIntegerSchemas,
  collectPropertyNames,
  requiredAt,
  requireOccurrenceStimulus,
  userTaskDiscoveryScenario,
} from "./contract-artifact-test-fixtures.ts";
import {
  artifactCases,
  normativeArtifactCases,
  openRowScenarioRoot,
} from "./contract-artifact-cases.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("binds every profile to the BPMN normative authority and every oracle to retained CIB evidence", async () => {
  const [artifactSets, evidenceSets] = await Promise.all([
    readAndVerifyNormativeArtifactSets(projectRoot),
    readAndVerifyArtifactSets(projectRoot),
  ]);
  assert.equal(artifactSets.length, normativeArtifactCases.length);
  // A profile that carries an oracle while no retained evidence binds it would assert an oracle nobody observed.
  const evidenceBoundProfiles = new Set(evidenceSets.map(({ profile }) => profile.id));
  for (const artifactSet of [...artifactSets, ...evidenceSets]) {
    assert.equal("calibration" in artifactSet.scenario, false);
    assert.equal(
      artifactSet.profile.normativeAuthority.name,
      "OMG Business Process Model and Notation",
    );
    assert.ok(
      !("oracle" in artifactSet.profile) || evidenceBoundProfiles.has(artifactSet.profile.id),
      `${artifactSet.scenarioRelativePath} binds profile ${artifactSet.profile.id}, which claims an oracle without retained evidence`,
    );
  }

  const artifactSet = requiredAt(
    artifactSets.filter(({ profile }) => "oracle" in profile),
    0,
    "normative artifact sets under a profile with an oracle",
  );
  for (const member of ["normativeAuthority", "oracle", "environment"] as const) {
    const incomplete = { ...artifactSet, profile: { ...artifactSet.profile } } as Record<string, unknown> & typeof artifactSet;
    delete (incomplete.profile as Record<string, unknown>)[member];
    assert.throws(
      () => verifyNormativeArtifactSet(incomplete),
      /profile schema validation failed/,
      member,
    );
  }
  const retired = { ...artifactSet, profile: { ...artifactSet.profile, features: [] } };
  assert.throws(
    () => verifyNormativeArtifactSet(retired as unknown as typeof artifactSet),
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

  assert.equal(artifactSets.length, artifactCases.length);
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
  const artifactSet = artifactSetAt(await readAndVerifyArtifactSets(projectRoot), userTaskDiscoveryScenario);
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
    "engine-population-scenario.schema.json",
    "engine-population-result.schema.json",
    "semantic-publication.schema.json",
    "flow-node-occurrence-publication.schema.json",
  ]) {
    const schema = JSON.parse(
      await readFile(
        new URL(`../contracts/schemas/${schemaName}`, import.meta.url),
        "utf8",
      ),
    );
    for (const integer of collectIntegerSchemas(schema)) {
      assert.equal(typeof integer.schema.maximum, "number", `${schemaName} ${integer.path}`);
      assert.ok(
        Number(integer.schema.maximum) <= Number.MAX_SAFE_INTEGER,
        `${schemaName} ${integer.path}`,
      );
    }
  }

  const artifactSet = artifactSetAt(await readAndVerifyArtifactSets(projectRoot), userTaskDiscoveryScenario);
  const unsafe = cloneArtifactSet(artifactSet);
  requireOccurrenceStimulus(unsafe.scenario.stimuli[1]).occurrence.activation =
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
  requireOccurrenceStimulus(
    fractional.scenario.stimuli[1],
  ).occurrence.activation = 1.5;
  bindScenarioBytes(
    fractional,
    `${JSON.stringify(fractional.scenario, null, 2)}\n`,
  );
  assert.throws(
    () => verifyArtifactSet(fractional),
    /scenario schema validation failed/,
  );
});

test("rejects duplicate keys and unpaired surrogates in exact JSON bytes", async () => {
  const artifactSet = artifactSetAt(await readAndVerifyArtifactSets(projectRoot), userTaskDiscoveryScenario);

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

test("rejects noncanonical integer tokens before exact artifact bytes lose precision", async () => {
  const artifactSet = artifactSetAt(await readAndVerifyArtifactSets(projectRoot), userTaskDiscoveryScenario);
  for (const token of ["1.0000000000000001", "9007199254740991.1", "1e-400", "1e400", "1.0", "1e1", "-0", "9007199254740992", "9007199254740993"]) {
    const mutated = cloneArtifactSet(artifactSet);
    const completion = requireOccurrenceStimulus(mutated.scenario.stimuli[1]);
    completion.occurrence.activation = Number(token);
    bindScenarioBytes(mutated, JSON.stringify(mutated.scenario).replace(
      `"activation":${JSON.stringify(completion.occurrence.activation)}`,
      `"activation":${token}`,
    ));
    assert.throws(() => verifyArtifactSet(mutated), /integer|number|scenario schema/u, token);
  }
});

test("rejects malformed UTF-8 instead of accepting replacement characters in artifact bytes", async () => {
  const mutated = cloneArtifactSet(artifactSetAt(await readAndVerifyArtifactSets(projectRoot), userTaskDiscoveryScenario));
  mutated.scenario.id = "invalid-\uFFFD";
  mutated.evidence.scenario.id = mutated.scenario.id;
  const bytes = Buffer.from(JSON.stringify(mutated.scenario));
  const replacement = bytes.indexOf(Buffer.from("\uFFFD"));
  assert.ok(replacement >= 0);
  bindScenarioBytes(mutated, Buffer.concat([bytes.subarray(0, replacement), Buffer.from([0xff]), bytes.subarray(replacement + 3)]));
  assert.throws(() => verifyArtifactSet(mutated), /UTF-8|encoded data/u);
});

// Null versus absent members are the kernel codec's strict decoding (packages/kernel/test/strict-decoding.test.ts); the
// checked-process half of this test went with that schema's producer.
test("rejects a missing scenario member and an unknown closed-enum value", async () => {
  const artifactSet = artifactSetAt(await readAndVerifyArtifactSets(projectRoot), userTaskDiscoveryScenario);

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
});

test("rejects retained evidence after its neutral scenario changes", async () => {
  const artifactSet = artifactSetAt(await readAndVerifyArtifactSets(projectRoot), userTaskDiscoveryScenario);
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


test("scenario provenance separates absent CIB evidence from a pinned CIB source", async () => {
  const artifact = artifactSetAt(await readAndVerifyArtifactSets(projectRoot), userTaskDiscoveryScenario);
  const schema = "https://bpmn-lean.local/schemas/scenario.schema.json#/$defs/provenance";
  const normativeRefs = ["BPMN 2.0.2 Clause 10.3.5"];
  assert.equal(artifact.validator.validate(schema, { normativeRefs, cibRevision: "not-applicable", cibRefs: [] }), true);
  assert.equal(artifact.validator.validate(schema, { normativeRefs, cibRevision: "a".repeat(40), cibRefs: ["engine/source.java"] }), true);
  for (const provenance of [
    { normativeRefs, cibRevision: "not-applicable", cibRefs: ["engine/source.java"] },
    { normativeRefs, cibRevision: "a".repeat(40), cibRefs: [] },
    { normativeRefs, cibRevision: "unknown", cibRefs: [] },
  ]) assert.equal(artifact.validator.validate(schema, provenance), false, JSON.stringify(provenance));
});

// A scenario's `cibRevision` names the CIB release a runner executes it on, which only a profile's oracle pins; a
// source-reading snapshot or a retired release leaves the scenario runnable by no oracle (profile consolidation, 3a10a909).
test("targets every CIB-referencing scenario at an oracle revision of the profile catalog", async () => {
  const profiles = (await readdir(path.join(projectRoot, "profiles"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const oracleRevisions = new Set(await Promise.all(profiles.map(async (profile) =>
    (JSON.parse(await readFile(path.join(projectRoot, "profiles", profile, "profile.json"), "utf8")) as
      { oracle?: { revision: string } }).oracle?.revision)));
  const stale: string[] = [];
  for (const { scenarioRelativePath } of [...artifactCases, ...normativeArtifactCases]) {
    const { provenance } = JSON.parse(await readFile(path.join(projectRoot, scenarioRelativePath), "utf8")) as
      { provenance: { cibRevision: string } };
    if (provenance.cibRevision !== "not-applicable" && !oracleRevisions.has(provenance.cibRevision)) {
      stale.push(`${scenarioRelativePath}: ${provenance.cibRevision}`);
    }
  }
  assert.deepEqual(stale, []);
});

test("applies the value-surface claim guard to registered scenarios and never to open-row witnesses", async () => {
  const artifactSet = artifactSetAt(await readAndVerifyArtifactSets(projectRoot), userTaskDiscoveryScenario);
  const withList = (scenarioRelativePath: string) => {
    const mutated = cloneArtifactSet(artifactSet);
    const start = (mutated.scenario.stimuli as Array<Record<string, unknown>>)[0]!;
    start.variables = [{ name: "items", value: { kind: "stringList", value: ["a", "a"] } }];
    bindScenarioBytes(mutated, `${JSON.stringify(mutated.scenario, null, 2)}\n`);
    return { ...mutated, scenarioRelativePath };
  };
  assert.throws(() => verifyArtifactSet(withList(artifactSet.scenarioRelativePath)), /stringList is only admitted/u);
  assert.doesNotThrow(() => verifyArtifactSet(withList(`${openRowScenarioRoot}user-task/scenario.json`)));
});

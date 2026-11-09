import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  readAndVerifyArtifactSets,
  readAndVerifyNormativeArtifactSets,
  verifyArtifactSet,
} from "./contract-artifacts.ts";
import {
  artifactSetAt,
  cloneArtifactSet,
  userTaskDiscoveryScenario,
} from "./contract-artifact-test-fixtures.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("requires every semantic profile to identify its reviewed CIB-BPMN relationships", async () => {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);

  for (const artifactSet of artifactSets) {
    assert.ok(artifactSet.profile.bpmn.relationships.length > 0);
    for (const relationship of artifactSet.profile.bpmn.relationships) {
      assert.match(relationship, /^CIB-(AGR|OP|INT|EXT|CFG|LIM|DEV)-[0-9]{4}$/);
    }
  }

  const firstArtifactSet = artifactSetAt(artifactSets, userTaskDiscoveryScenario);
  const mutated = cloneArtifactSet(firstArtifactSet);
  delete (
    mutated.profile.bpmn as Partial<{
      relationships: Array<string>;
    }>
  ).relationships;

  assert.throws(
    () => verifyArtifactSet(mutated),
    /profile schema validation failed/,
  );

  const unknownRelationship = cloneArtifactSet(firstArtifactSet);
  unknownRelationship.profile.bpmn.relationships[0] =
    "CIB-AGR-9999";

  assert.throws(
    () => verifyArtifactSet(unknownRelationship),
    /profile references unknown CIB-BPMN relationship/,
  );
});

test("binds business mapping and Error relationships to the live register", async () => {
  const artifact = cloneArtifactSet(artifactSetAt(await readAndVerifyArtifactSets(projectRoot), userTaskDiscoveryScenario));
  for (const relationship of ["CIB-EXT-0015", "CIB-EXT-0016", "CIB-AGR-0012"]) {
    assert.ok(artifact.registeredRelationshipIds.has(relationship), relationship);
    artifact.profile.bpmn.relationships = [relationship];
    const withoutRelationship = { ...artifact, registeredRelationshipIds: new Set(
      [...artifact.registeredRelationshipIds].filter(id => id !== relationship),
    ) };
    assert.throws(() => verifyArtifactSet(withoutRelationship), /profile references unknown CIB-BPMN relationship/);
  }
});

test("binds repeated Sub-Process relationships to the live register", async () => {
  const artifact = cloneArtifactSet(artifactSetAt(await readAndVerifyArtifactSets(projectRoot), userTaskDiscoveryScenario));
  for (const relationship of ["CIB-AGR-0013", "CIB-EXT-0017", "CIB-AGR-0014", "CIB-EXT-0018"]) {
    assert.ok(artifact.registeredRelationshipIds.has(relationship), relationship);
    artifact.profile.bpmn.relationships = [relationship];
    const withoutRelationship = { ...artifact, registeredRelationshipIds: new Set(
      [...artifact.registeredRelationshipIds].filter(id => id !== relationship),
    ) };
    assert.throws(() => verifyArtifactSet(withoutRelationship), /profile references unknown CIB-BPMN relationship/);
  }
});

/**
 * A scenario's provenance may name a relationship its profile omits only through a recorded substitution: the concurrent
 * mapped Calls and concurrent scope data scenarios (formerly under the embedded completion profile, which did not select
 * `CIB-EXT-0020`) cite it for their data-bearing Programs, an account whose submission restriction only the scope-chain
 * profile selects. The entry also requires the profile to still omit it and the register to state the boundary, so moving
 * those scenarios to the scope-chain profile retires it.
 */
const relationshipSubstitutions: ReadonlyArray<Readonly<{ profile: string; relationship: string; boundary: string }>> = [
  { profile: "cibseven-2.2.0", relationship: "CIB-EXT-0020",
    boundary: "Under the embedded completion profile, in data-bearing Programs" },
];

test("binds every scenario CIB relationship to its profile artifact or a recorded substitution", async () => {
  const [cib, normative, register] = await Promise.all([
    readAndVerifyArtifactSets(projectRoot), readAndVerifyNormativeArtifactSets(projectRoot),
    readFile(new URL("docs/CIB-BPMN-RELATION-REGISTER.md", `file://${projectRoot}`), "utf8"),
  ]);
  const substituted = new Set<string>();
  for (const { scenario, profile, registeredRelationshipIds } of [...cib, ...normative]) {
    for (const relationship of scenario.provenance.cibRefs) {
      if (!/^CIB-[A-Z]+-[0-9]{4}$/u.test(relationship)) continue;
      assert.ok(registeredRelationshipIds.has(relationship), `${scenario.id} names unregistered ${relationship}`);
      if (profile.bpmn.relationships.includes(relationship)) continue;
      const substitution = relationshipSubstitutions.find(entry =>
        entry.profile === scenario.profile && entry.relationship === relationship);
      assert.ok(substitution !== undefined, `${scenario.id} names ${relationship}, absent from ${scenario.profile}`);
      substituted.add(`${substitution.profile} ${relationship}`);
    }
  }
  for (const { profile, relationship, boundary } of relationshipSubstitutions) {
    assert.ok(substituted.has(`${profile} ${relationship}`), `unused substitution ${relationship}`);
    const entry = new RegExp(`^### ${relationship}\\b[\\s\\S]*?^\\*\\*Boundary:\\*\\*(.*)$`, "mu").exec(register);
    assert.ok(entry?.[1]?.includes(boundary), `${relationship} Boundary does not state the boundary for ${profile}`);
    const readme = await readFile(new URL(`profiles/${profile}/README.md`, `file://${projectRoot}`), "utf8");
    assert.ok(readme.includes(`\`${relationship}\``), `${profile} README does not name ${relationship}`);
  }
});

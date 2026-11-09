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
  cloneArtifactSet,
  requiredAt,
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

  const firstArtifactSet = requiredAt(
    artifactSets,
    0,
    "artifact sets",
  );
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
  const artifact = cloneArtifactSet(requiredAt(await readAndVerifyArtifactSets(projectRoot), 0, "artifact sets"));
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
  const artifact = cloneArtifactSet(requiredAt(await readAndVerifyArtifactSets(projectRoot), 0, "artifact sets"));
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
 * A scenario's provenance may name a relationship its profile artifact omits only through a recorded substitution:
 * the `SCOPE` artifact's digest is pinned by the immutable cyclic preservation baseline, so the owner accepted naming
 * `CIB-EXT-0021` in the profile README and the Call scenarios instead (repeated, nested and concurrent Calls specification,
 * Versioning consequences). The concurrent scope Service Tasks family substitutes `CIB-EXT-0015` and `CIB-OP-0010` the
 * same way (its proposal's Normative basis and CIB classification), and the concurrent scope data family substitutes
 * `CIB-EXT-0020`, `CIB-EXT-0005` and `CIB-EXT-0006` for data-bearing Programs (its proposal's same section). The entry
 * also requires the artifact to still omit it, so a re-pin retires the entry.
 */
const relationshipSubstitutions: ReadonlyArray<Readonly<{ profile: string; relationship: string; boundary: string }>> = [
  { profile: "cibseven-2.2.0-embedded-subprocess-completion-draft", relationship: "CIB-EXT-0021",
    boundary: "Under the embedded completion profile only the key clause applies" },
  { profile: "cibseven-2.2.0-embedded-subprocess-completion-draft", relationship: "CIB-EXT-0015",
    boundary: "Under the embedded completion profile only the binding clause applies" },
  { profile: "cibseven-2.2.0-embedded-subprocess-completion-draft", relationship: "CIB-OP-0010",
    boundary: "Under the embedded completion profile only" },
  ...["CIB-EXT-0020", "CIB-EXT-0005", "CIB-EXT-0006"].map(relationship => ({
    profile: "cibseven-2.2.0-embedded-subprocess-completion-draft", relationship,
    boundary: "Under the embedded completion profile, in data-bearing Programs" })),
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
    assert.ok(entry?.[1]?.includes(boundary), `${relationship} Boundary does not name ${profile}`);
    const readme = await readFile(new URL(`profiles/${profile}/README.md`, `file://${projectRoot}`), "utf8");
    assert.ok(readme.includes(`\`${relationship}\``), `${profile} README does not name ${relationship}`);
  }
});

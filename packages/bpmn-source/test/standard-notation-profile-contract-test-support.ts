/** Independent test oracle binding registered profile artifacts to notation dispatch. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const retainedStandardNotationFeatures = Object.freeze([
  "retained-definitions-metadata",
  "retained-diagram-interchange",
  "retained-collaboration-and-participant",
  "retained-lane-set",
  "retained-artifacts",
  "retained-documentation",
]);

const legacyProfileId = "bpmn-2.0.2-user-task-preserved-notation-draft";
const legacyDefinitionsDeclaration =
  "Preserved Definitions metadata declaration: `name | exporter | exporterVersion`; retained in exact source bytes and excluded from execution projections.";

export type RegisteredProfileArtifact = Readonly<{
  directory: string;
  id: string;
  features: ReadonlyArray<string>;
  readme: string;
}>;

type StandardNotationProfileContract = Readonly<{
  artifacts: ReadonlyArray<RegisteredProfileArtifact>;
  registeredProfileIds: ReadonlyArray<string>;
  admittedProfileIds: ReadonlySet<string>;
}>;

export async function readRegisteredProfileArtifacts(
  profilesRoot: URL,
): Promise<ReadonlyArray<RegisteredProfileArtifact>> {
  const directories = (await readdir(profilesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return Promise.all(directories.map(async (directory) => {
    const root = new URL(`${directory}/`, profilesRoot);
    const [profileText, readme] = await Promise.all([
      readFile(new URL("profile.json", root), "utf8"),
      readFile(new URL("README.md", root), "utf8"),
    ]);
    const parsed: unknown = JSON.parse(profileText);
    assert.ok(isPlainObject(parsed), `${directory}/profile.json must be an object`);
    assert.equal(typeof parsed.id, "string", `${directory} profile id`);
    assert.ok(isPlainObject(parsed.bpmn), `${directory} bpmn declaration`);
    assert.ok(Array.isArray(parsed.bpmn.features), `${directory} feature declaration`);
    assert.ok(
      parsed.bpmn.features.every((feature) => typeof feature === "string"),
      `${directory} feature declaration must contain strings`,
    );
    assert.equal(parsed.id, directory, `${directory} profile id must match its directory`);
    assert.equal(
      new Set(parsed.bpmn.features).size,
      parsed.bpmn.features.length,
      `${directory} feature declaration must not contain duplicates`,
    );
    return Object.freeze({
      directory,
      id: parsed.id,
      features: Object.freeze([...parsed.bpmn.features]),
      readme,
    });
  }));
}

export function assertStandardNotationProfileContract(
  contract: StandardNotationProfileContract,
): void {
  const artifactIds = contract.artifacts.map((artifact) => artifact.id).sort();
  const registeredIds = [...contract.registeredProfileIds].sort();
  assert.equal(new Set(artifactIds).size, artifactIds.length, "duplicate profile artifact id");
  assert.deepEqual(
    artifactIds,
    registeredIds,
    "registered semantic profiles and profile artifacts disagree",
  );

  for (const artifact of contract.artifacts) {
    const declared = declaresStandardNotation(artifact);
    const admitted = contract.admittedProfileIds.has(artifact.id);
    assert.equal(
      admitted,
      declared,
      `${artifact.id} artifact and executable dispatch disagree`,
    );
  }

  for (const profileId of contract.admittedProfileIds) {
    assert.ok(
      artifactIds.includes(profileId),
      `${profileId} executable dispatch has no registered profile artifact`,
    );
  }
}

function declaresStandardNotation(artifact: RegisteredProfileArtifact): boolean {
  const present = retainedStandardNotationFeatures.filter((feature) =>
    artifact.features.includes(feature)
  );
  if (present.length === 0) {
    return false;
  }
  if (present.length === retainedStandardNotationFeatures.length) {
    return true;
  }
  const legacyFeatures = retainedStandardNotationFeatures.filter(
    (feature) => feature !== "retained-definitions-metadata",
  );
  if (
    artifact.id === legacyProfileId &&
    present.length === legacyFeatures.length &&
    legacyFeatures.every((feature) => present.includes(feature)) &&
    artifact.readme.includes(legacyDefinitionsDeclaration)
  ) {
    return true;
  }
  throw new Error(`${artifact.id} has an incomplete standard-notation declaration`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

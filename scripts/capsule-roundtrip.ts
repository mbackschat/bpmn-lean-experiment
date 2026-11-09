import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { compareCanonicalStrings } from "./strict-json.ts";

/**
 * Filesystem inventory used to prove that artifact registration is complete. The registry is itself discovered
 * (contract-artifact-cases.ts), so this direction catches an evidence file without its scenario and a profile no
 * scenario references.
 */
export type ArtifactInventory = Readonly<{
  scenarioRelativePaths: ReadonlyArray<string>;
  evidenceRelativePaths: ReadonlyArray<string>;
  profileRelativePaths: ReadonlyArray<string>;
  referencedProfileRelativePaths: ReadonlyArray<string>;
}>;

type CibArtifactRegistration = Readonly<{
  scenarioRelativePath: string;
  evidenceRelativePath: string;
}>;

type NormativeArtifactRegistration = Readonly<{
  scenarioRelativePath: string;
}>;

function sorted(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...values].sort(compareCanonicalStrings);
}

function duplicates(values: ReadonlyArray<string>): ReadonlyArray<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      repeated.add(value);
    }
    seen.add(value);
  }
  return sorted([...repeated]);
}

function requireNoDuplicates(
  label: string,
  values: ReadonlyArray<string>,
): void {
  const repeated = duplicates(values);
  if (repeated.length > 0) {
    throw new Error(`${label} contains duplicates: ${repeated.join(", ")}`);
  }
}

function requireCompleteRegistration(
  label: string,
  discovered: ReadonlyArray<string>,
  registered: ReadonlyArray<string>,
): void {
  requireNoDuplicates(`discovered ${label} artifacts`, discovered);
  requireNoDuplicates(`registered ${label} artifacts`, registered);
  const registeredSet = new Set(registered);
  const discoveredSet = new Set(discovered);
  const unregistered = sorted(
    discovered.filter((relativePath) => !registeredSet.has(relativePath)),
  );
  if (unregistered.length > 0) {
    throw new Error(
      `unregistered ${label} artifact: ${unregistered.join(", ")}`,
    );
  }
  const absent = sorted(
    registered.filter((relativePath) => !discoveredSet.has(relativePath)),
  );
  if (absent.length > 0) {
    throw new Error(
      `registered ${label} artifact missing from repository: ${absent.join(", ")}`,
    );
  }
}

async function discoverFiles(
  absoluteDirectory: string,
  relativeDirectory: string,
): Promise<ReadonlyArray<string>> {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files: Array<string> = [];
  for (const entry of entries.sort((left, right) => compareCanonicalStrings(left.name, right.name))) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...await discoverFiles(
          path.join(absoluteDirectory, entry.name),
          relativePath,
        ),
      );
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

/** Discovers current artifact files without importing a registry that could hide them. */
export async function discoverArtifactInventory(
  projectRoot: string,
): Promise<ArtifactInventory> {
  const scenarioFiles = await discoverFiles(
    path.join(projectRoot, "scenarios"),
    "scenarios",
  );
  const profileFiles = await discoverFiles(
    path.join(projectRoot, "profiles"),
    "profiles",
  );
  const scenarioRelativePaths = scenarioFiles.filter((relativePath) =>
    relativePath.endsWith("/scenario.json") ||
      relativePath.endsWith(".scenario.json")
  );
  const populationScenarioRelativePaths = scenarioFiles.filter((relativePath) =>
    relativePath.endsWith(".population-scenario.json")
  );
  const referencedProfiles = new Set<string>();
  for (const scenarioRelativePath of [
    ...scenarioRelativePaths,
    ...populationScenarioRelativePaths,
  ]) {
    const document: unknown = JSON.parse(
      await readFile(path.join(projectRoot, scenarioRelativePath), "utf8"),
    );
    if (
      typeof document !== "object" ||
      document === null ||
      !("profile" in document) ||
      typeof document.profile !== "string"
    ) {
      throw new Error(
        `scenario has no string profile identity: ${scenarioRelativePath}`,
      );
    }
    referencedProfiles.add(`profiles/${document.profile}/profile.json`);
  }
  return Object.freeze({
    scenarioRelativePaths: Object.freeze(scenarioRelativePaths),
    evidenceRelativePaths: Object.freeze(
      scenarioFiles.filter((relativePath) =>
        relativePath.endsWith("/cibseven-evidence.json") ||
          relativePath.endsWith(".cibseven-evidence.json")
      ),
    ),
    profileRelativePaths: Object.freeze(
      profileFiles.filter((relativePath) =>
        relativePath.endsWith("/profile.json")
      ),
    ),
    referencedProfileRelativePaths: Object.freeze(
      sorted([...referencedProfiles]),
    ),
  });
}

/** Requires filesystem artifacts and the explicit registry to cover each other exactly. */
export function verifyArtifactRegistration(
  inventory: ArtifactInventory,
  cibArtifacts: ReadonlyArray<CibArtifactRegistration>,
  normativeArtifacts: ReadonlyArray<NormativeArtifactRegistration>,
): void {
  const registeredScenarios = [
    ...cibArtifacts.map(({ scenarioRelativePath }) => scenarioRelativePath),
    ...normativeArtifacts.map(({ scenarioRelativePath }) => scenarioRelativePath),
  ];
  const registeredEvidence = cibArtifacts.map(
    ({ evidenceRelativePath }) => evidenceRelativePath,
  );
  requireCompleteRegistration(
    "scenario",
    inventory.scenarioRelativePaths,
    registeredScenarios,
  );
  requireCompleteRegistration(
    "evidence",
    inventory.evidenceRelativePaths,
    registeredEvidence,
  );
  const referencedProfileSet = new Set(
    inventory.referencedProfileRelativePaths,
  );
  const discoveredProfileSet = new Set(inventory.profileRelativePaths);
  const unreferencedProfiles = sorted(
    inventory.profileRelativePaths.filter(
      (relativePath) => !referencedProfileSet.has(relativePath),
    ),
  );
  if (unreferencedProfiles.length > 0) {
    throw new Error(
      `unreferenced profile artifact: ${unreferencedProfiles.join(", ")}`,
    );
  }
  const absentProfiles = sorted(
    inventory.referencedProfileRelativePaths.filter(
      (relativePath) => !discoveredProfileSet.has(relativePath),
    ),
  );
  if (absentProfiles.length > 0) {
    throw new Error(
      `referenced profile artifact missing from repository: ${absentProfiles.join(", ")}`,
    );
  }
}

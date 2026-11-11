/**
 * Retained CIB Seven evidence for population scenarios (`contracts/schemas/cibseven-population-evidence.schema.json`):
 * which populations have it, the document an evidence run writes, and the check every retained one passes. A population
 * scenario `<stem>population-scenario.json` pairs with `<stem>population-cibseven-evidence.json`, the pairing
 * `scenario-discovery.ts` and `CibSevenRetainedEvidenceTest` read.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Ajv2020 } from "ajv/dist/2020.js";

import { compareCanonicalStrings, parseWireJsonBytes } from "./strict-json.ts";

const populationSuffix = ".population-scenario.json";
const schemaBaseId = "https://bpmn-lean.local/schemas";

export type PopulationEvidenceCase = Readonly<{ scenarioRelativePath: string; evidenceRelativePath: string }>;

type Profile = Readonly<{ id: string; oracle?: Readonly<{ version: string; revision: string }> }>;
type PopulationScenario = Readonly<{ id: string; profile: string; provenance?: Readonly<{ cibRevision: string }> }>;

/** The members of the runner's population answer an evidence document keeps. */
export type CibPopulationResult = Readonly<{
  scenarioId: string;
  deployments: ReadonlyArray<unknown>;
  steps: ReadonlyArray<unknown>;
  inputFailures?: ReadonlyArray<unknown>;
  processStates: ReadonlyArray<unknown>;
  diagnostics: Readonly<{ engineVersion: string; databaseVersion: string; cleanup: Readonly<Record<string, number>> }>;
}>;

type Producer = Readonly<{
  engine: "CIB Seven";
  engineVersion: string;
  engineRevision: string;
  runner: "cibseven-oracle";
  java: string;
  database: string;
  timeZone: "UTC";
}>;

export type PopulationEvidence = Readonly<{
  kind: "cibSevenPopulationEvidence";
  scenario: Readonly<{ id: string; sha256: string }>;
  profile: Readonly<{ id: string; sha256: string }>;
  producer: Producer;
  projection: Readonly<{ id: "cib-population-result" }>;
  result: Omit<CibPopulationResult, "scenarioId" | "diagnostics">;
}>;

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export function populationEvidencePathFor(scenarioRelativePath: string): string {
  return scenarioRelativePath.replace(/scenario\.json$/u, "cibseven-evidence.json");
}

function populationScenarioPaths(projectRoot: string): ReadonlyArray<string> {
  return readdirSync(path.join(projectRoot, "scenarios"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(populationSuffix))
    .map((entry) => path.posix.join(
      "scenarios", path.relative(path.join(projectRoot, "scenarios"), entry.parentPath).split(path.sep).join("/"), entry.name))
    .sort(compareCanonicalStrings);
}

/**
 * The populations an evidence run covers: those whose profile names a CIB oracle and whose provenance names that
 * oracle's revision. Evidence must name the scenario's revision (`verifyPopulationEvidence`), and the runner runs only
 * its packaged release, so a population citing another revision, such as the source checkout's, has no evidence case.
 */
export function populationEvidenceCases(projectRoot: string): ReadonlyArray<PopulationEvidenceCase> {
  return populationScenarioPaths(projectRoot).flatMap((scenarioRelativePath) => {
    const scenario = JSON.parse(readFileSync(path.join(projectRoot, scenarioRelativePath), "utf8")) as PopulationScenario;
    const profile = JSON.parse(readFileSync(path.join(projectRoot, "profiles", scenario.profile, "profile.json"), "utf8")) as Profile;
    const covered = profile.oracle !== undefined && scenario.provenance?.cibRevision === profile.oracle.revision;
    return covered ? [{ scenarioRelativePath, evidenceRelativePath: populationEvidencePathFor(scenarioRelativePath) }] : [];
  });
}

/** The evidence document of one population run, bound to the exact scenario and profile bytes. */
export function populationEvidenceDocument(
  scenario: Readonly<{ id: string; bytes: Uint8Array }>,
  profile: Readonly<{ id: string; bytes: Uint8Array; revision: string; java: string; database: string }>,
  result: CibPopulationResult,
): PopulationEvidence {
  return {
    kind: "cibSevenPopulationEvidence",
    scenario: { id: scenario.id, sha256: sha256(scenario.bytes) },
    profile: { id: profile.id, sha256: sha256(profile.bytes) },
    producer: {
      engine: "CIB Seven",
      engineVersion: result.diagnostics.engineVersion,
      engineRevision: profile.revision,
      runner: "cibseven-oracle",
      java: profile.java,
      database: profile.database,
      // The runner fails closed outside UTC (`CibSevenScenarioRunner.TIME_ZONE`).
      timeZone: "UTC",
    },
    projection: { id: "cib-population-result" },
    result: {
      deployments: result.deployments,
      steps: result.steps,
      ...(result.inputFailures === undefined ? {} : { inputFailures: result.inputFailures }),
      processStates: result.processStates,
    },
  };
}

/** The validator of `cibseven-population-evidence.schema.json` with the schemas it references. */
export async function populationEvidenceValidator(projectRoot: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTuples: false });
  for (const name of ["scenario.schema.json", "canonical-result.schema.json", "cibseven-evidence.schema.json",
    "cibseven-population-evidence.schema.json"]) {
    ajv.addSchema(parseWireJsonBytes(await readFile(path.join(projectRoot, "contracts/schemas", name)), name) as object);
  }
  const validate = ajv.getSchema(`${schemaBaseId}/cibseven-population-evidence.schema.json`);
  if (validate === undefined) throw new Error("population evidence schema is not registered");
  return validate;
}

/**
 * Every retained population evidence file: valid against its schema, bound to the exact bytes of the population beside
 * it and of its profile, and produced by the profile's oracle at the population's revision. A population evidence file
 * without its population fails too. Returns the evidence paths checked.
 */
export async function verifyPopulationEvidence(projectRoot: string): Promise<ReadonlyArray<string>> {
  const validate = await populationEvidenceValidator(projectRoot);
  const scenarios = new Set(populationScenarioPaths(projectRoot));
  const checked: string[] = [];
  for (const scenarioRelativePath of scenarios) {
    const evidenceRelativePath = populationEvidencePathFor(scenarioRelativePath);
    if (!existsSync(path.join(projectRoot, evidenceRelativePath))) continue;
    const evidence = parseWireJsonBytes<PopulationEvidence>(
      await readFile(path.join(projectRoot, evidenceRelativePath)), evidenceRelativePath);
    if (!validate(evidence)) {
      throw new Error(`${evidenceRelativePath} schema validation failed: ${JSON.stringify(validate.errors)}`);
    }
    const scenarioBytes = await readFile(path.join(projectRoot, scenarioRelativePath));
    const scenario = parseWireJsonBytes<PopulationScenario>(scenarioBytes, scenarioRelativePath);
    const profileBytes = await readFile(path.join(projectRoot, "profiles", scenario.profile, "profile.json"));
    const profile = parseWireJsonBytes<Profile>(profileBytes, scenario.profile);
    if (evidence.scenario.id !== scenario.id || evidence.scenario.sha256 !== sha256(scenarioBytes) ||
      evidence.profile.id !== scenario.profile || evidence.profile.sha256 !== sha256(profileBytes)) {
      throw new Error(`${evidenceRelativePath} is not bound to the exact bytes of ${scenarioRelativePath} and its profile`);
    }
    if (profile.oracle === undefined || evidence.producer.engineVersion !== profile.oracle.version ||
      evidence.producer.engineRevision !== profile.oracle.revision ||
      evidence.producer.engineRevision !== scenario.provenance?.cibRevision) {
      throw new Error(`${evidenceRelativePath}: CIB revision does not match across artifacts`);
    }
    checked.push(evidenceRelativePath);
  }
  const orphans = readdirSync(path.join(projectRoot, "scenarios"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".population-cibseven-evidence.json"))
    .map((entry) => path.posix.join(
      "scenarios", path.relative(path.join(projectRoot, "scenarios"), entry.parentPath).split(path.sep).join("/"), entry.name))
    .filter((evidence) => !checked.includes(evidence));
  if (orphans.length > 0) throw new Error(`population evidence without its population: ${orphans.join(", ")}`);
  return checked;
}

/**
 * The differential's case list: every scenario and population scenario under the discovery roots, found by file name
 * (guard 14 of the kernel rewrite proposal), so a new scenario joins every target without an edit here and no count is
 * written down. A single-instance scenario carries its retained CIB Seven evidence when a sibling file of the same stem
 * exists (`<stem>cibseven-evidence.json` next to `<stem>scenario.json`), the pairing `CibSevenRetainedEvidenceTest`
 * reproduces in the runtime lane. Evidence binds the exact scenario and profile bytes by SHA-256; evidence bound to
 * other bytes, or without its scenario, is a harness error rather than a comparison to skip.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { KernelJson, KernelRead } from "@bpmn-lean/bpmn-source";
import { unsupportedDeploymentResult } from "@bpmn-lean/kernel";

import { differentialDiscoveryRoots } from "../../../scripts/pipeline-budget.ts";
import { parseWireJsonBytes } from "../../../scripts/strict-json.ts";
import { readCaseKernelProgram, readCaseSource } from "./kernel-program.ts";
import { projectRoot } from "./pipeline-target-support.ts";

const scenarioSuffix = "scenario.json";
const evidenceSuffix = "cibseven-evidence.json";

/** Test sources run type-stripped, which has no `enum`; this frozen table is the erasable equivalent. */
export const DiscoveredKind = Object.freeze({
  Scenario: "scenario",
  PopulationScenario: "populationScenario",
} as const);
export type DiscoveredKind = typeof DiscoveredKind[keyof typeof DiscoveredKind];

export type SourceDefinition = Readonly<{
  id: string;
  relativePath: string;
  sha256: string;
  sourceOverlay: Readonly<{ id: string; sha256: string }> | null;
}>;

/** The members of a scenario document the differential reads; the kernels read the whole document. */
export type ScenarioDocument = Readonly<{
  kind: typeof DiscoveredKind.Scenario;
  id: string;
  profile: string;
  bpmn: SourceDefinition;
  stimuli: ReadonlyArray<unknown>;
}>;

export type PopulationScenarioDocument = Readonly<{
  kind: typeof DiscoveredKind.PopulationScenario;
  id: string;
  profile: string;
  definitions: ReadonlyArray<Readonly<{ bpmn: SourceDefinition }>>;
}>;

/** The canonical result shape (`contracts/schemas/canonical-result.schema.json`) as the comparator reads it. */
export type CanonicalResult = Readonly<{ outcome: unknown; trace: ReadonlyArray<Readonly<{ kind: string }>> }>;

export type RetainedEvidence = Readonly<{
  relativePath: string;
  engineVersion: string;
  result: CanonicalResult;
  /** The commands after which CIB recorded a delegate execution inside that command's transaction. */
  synchronousAfter: ReadonlySet<string>;
}>;

export type DiscoveredScenario =
  | Readonly<{
    kind: typeof DiscoveredKind.Scenario;
    relativePath: string;
    document: ScenarioDocument;
    evidence: RetainedEvidence | null;
  }>
  | Readonly<{
    kind: typeof DiscoveredKind.PopulationScenario;
    relativePath: string;
    document: PopulationScenarioDocument;
  }>;

type EvidenceDocument = Readonly<{
  kind: "cibSevenScenarioEvidence";
  scenario: Readonly<{ id: string; sha256: string }>;
  profile: Readonly<{ id: string; sha256: string }>;
  producer: Readonly<{ engineVersion: string }>;
  producerObservations: Readonly<{ mappingExecutions?: ReadonlyArray<Readonly<{ afterCommandId: string }>> }>;
  result: CanonicalResult;
}>;

function assertNever(value: never): never {
  throw new TypeError(`unhandled discovered kind ${JSON.stringify(value)}`);
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

async function filesUnder(relativeDirectory: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(path.join(projectRoot, relativeDirectory), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? filesUnder(relativePath) : [relativePath];
  }));
  return nested.flat();
}

async function boundEvidence(
  scenarioPath: string,
  scenarioBytes: Uint8Array,
  scenario: ScenarioDocument,
  present: ReadonlySet<string>,
): Promise<RetainedEvidence | null> {
  const relativePath = scenarioPath.slice(0, -scenarioSuffix.length) + evidenceSuffix;
  if (!present.has(relativePath)) return null;
  const evidence = parseWireJsonBytes<EvidenceDocument>(await readFile(path.join(projectRoot, relativePath)), relativePath);
  const profileBytes = await readFile(path.join(projectRoot, "profiles", scenario.profile, "profile.json"));
  if (
    evidence.kind !== "cibSevenScenarioEvidence" ||
    evidence.scenario.id !== scenario.id || evidence.scenario.sha256 !== sha256(scenarioBytes) ||
    evidence.profile.id !== scenario.profile || evidence.profile.sha256 !== sha256(profileBytes)
  ) {
    throw new Error(`${relativePath} is not bound to the exact bytes of ${scenarioPath} and its profile`);
  }
  const synchronousAfter = new Set((evidence.producerObservations.mappingExecutions ?? []).map((run) => run.afterCommandId));
  return { relativePath, engineVersion: evidence.producer.engineVersion, result: evidence.result, synchronousAfter };
}

/** Every scenario under `roots`, sorted by path. */
export async function discoverScenarios(
  roots: ReadonlyArray<string> = differentialDiscoveryRoots,
): Promise<ReadonlyArray<DiscoveredScenario>> {
  const files = (await Promise.all(roots.map(filesUnder))).flat().sort();
  const present = new Set(files);
  for (const evidencePath of files.filter((file) => file.endsWith(evidenceSuffix))) {
    if (!present.has(evidencePath.slice(0, -evidenceSuffix.length) + scenarioSuffix)) {
      throw new Error(`${evidencePath} has no scenario beside it`);
    }
  }
  return Promise.all(files.filter((file) => file.endsWith(scenarioSuffix)).map(async (relativePath) => {
    const bytes = await readFile(path.join(projectRoot, relativePath));
    const document = parseWireJsonBytes<ScenarioDocument | PopulationScenarioDocument>(bytes, relativePath);
    if (!Object.values<unknown>(DiscoveredKind).includes(document.kind)) {
      throw new TypeError(`${relativePath} is named as a scenario but has kind ${String(document.kind)}`);
    }
    switch (document.kind) {
      case DiscoveredKind.Scenario:
        return {
          kind: DiscoveredKind.Scenario,
          relativePath,
          document,
          evidence: await boundEvidence(relativePath, bytes, document, present),
        } as const;
      case DiscoveredKind.PopulationScenario:
        return { kind: DiscoveredKind.PopulationScenario, relativePath, document } as const;
    }
    return assertNever(document);
  }));
}

/** The overlay a scenario binds by content digest, retained beside the scenario or beside its BPMN source. */
async function boundOverlay(relativePath: string, source: SourceDefinition) {
  const identity = source.sourceOverlay;
  if (identity === null) return null;
  for (const directory of [path.dirname(relativePath), path.dirname(source.relativePath)]) {
    for (const name of await readdir(path.join(projectRoot, directory))) {
      if (!name.endsWith(".json")) continue;
      const bytes = await readFile(path.join(projectRoot, directory, name));
      if (sha256(bytes) === identity.sha256) return { ...identity, bytes };
    }
  }
  throw new Error(`${relativePath} binds an overlay that no neighbouring file has`);
}

/** One source a discovered scenario binds, read under the scenario's profile; a reader refusal is returned. */
export async function readSourceFor(scenarioPath: string, source: SourceDefinition, profile: string): Promise<KernelRead> {
  const bytes = await readFile(path.join(projectRoot, source.relativePath));
  return readCaseSource(
    { relativePath: source.relativePath, bytes, sha256: source.sha256, overlay: await boundOverlay(scenarioPath, source) },
    profile,
  );
}

export type ScenarioKernelInput = Readonly<
  { kind: "program"; program: KernelJson } | { kind: "refused"; result: CanonicalResult }
>;

/**
 * The kernel input of one single-instance scenario: its source's IL, or, when the reader refuses the source, the result
 * of that refused deployment, which runs no input. The engine rejects such a definition with the reader's code
 * (`engine-api/src/definition.ts`), the same answer it gives a program admission refuses, so the scenario is compared
 * with CIB's like any other unsupported deployment.
 */
export async function scenarioKernelInput(
  scenarioPath: string,
  source: SourceDefinition,
  profile: string,
): Promise<ScenarioKernelInput> {
  const read = await readSourceFor(scenarioPath, source, profile);
  return read.kind === "refused"
    ? { kind: "refused", result: unsupportedDeploymentResult(read.code) as CanonicalResult }
    : { kind: "program", program: read.program };
}

/** The kernel IL of one source a discovered scenario binds; a reader refusal is a harness error here. */
export async function kernelProgramFor(
  scenarioPath: string,
  source: SourceDefinition,
  profile: string,
): Promise<KernelJson> {
  const bytes = await readFile(path.join(projectRoot, source.relativePath));
  return readCaseKernelProgram(
    { relativePath: source.relativePath, bytes, sha256: source.sha256, overlay: await boundOverlay(scenarioPath, source) },
    profile,
  );
}

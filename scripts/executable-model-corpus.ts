/**
 * The executable BPMN model corpus inspection: every manifest model's exact source bytes, construct inventory, clone
 * family and admission, the MVP capability catalog against what the discovered scenarios exercise, and the generated
 * corpus map.
 *
 * Scenarios are discovered from directories, not registered (guard 14 of the kernel rewrite proposal): a retained model
 * binds the discovered scenario at its `scenarioRelativePath`, whose identifier is the model's `pipelineCaseId`.
 * Admission is the kernel's own decision (the kernel reader, then `Kernel.Admission`), supplied by the caller so this
 * module stays free of package code; a model whose recorded admission differs from the kernel's is listed in
 * `admissionMismatches`, never reconciled here. A rejected model's recorded digest is the SHA-256 of the kernel's
 * stable refusal code.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  CibCapabilityEvidenceKind,
  mvpBpmnCapabilities,
} from "../model-corpus/mvp-capabilities.ts";
import type {
  MvpBpmnCapability,
  MvpBpmnCapabilityId,
} from "../model-corpus/mvp-capabilities.ts";
import {
  flattenElements,
  parseXmlElements,
} from "./minimal-xml-tree.ts";
import { isOpenRowWitness } from "./contract-artifact-cases.ts";
import { detectExecutableBpmnCapabilities } from "./executable-model-capabilities.ts";
import { compareCanonicalStrings } from "./strict-json.ts";
import type {
  CorpusModel,
  ExecutableModelCorpusManifest,
} from "./executable-model-corpus-manifest.ts";
import {
  readExternalCorpusModel,
  verifyExternalCorpusSource,
} from "./executable-model-corpus-source.ts";

export {
  requireExecutableModelCorpusManifest,
} from "./executable-model-corpus-manifest.ts";
export type {
  CorpusModel,
  ExecutableModelCorpusManifest,
  ExternalCorpusSource,
} from "./executable-model-corpus-manifest.ts";

/** One discovered scenario as the corpus reads it. */
export type CorpusScenario = Readonly<{
  id: string;
  relativePath: string;
  kind: "scenario" | "populationScenario";
  profile: string;
  /** Each bound BPMN source, in scenario order. */
  sources: ReadonlyArray<Readonly<{ relativePath: string; sha256: string }>>;
  /** The CIB Seven release of the retained evidence beside the scenario, or `null` when none is retained. */
  retainedEvidenceVersion: string | null;
}>;

export type CorpusAdmission = Readonly<{ status: "accepted" } | { status: "rejected"; refusal: string }>;

/** Reads and admits one model: a retained model with the scenario it binds, an external one with `null`. */
export type CorpusAdmitter = (
  model: CorpusModel,
  bytes: Uint8Array,
  scenario: CorpusScenario | null,
) => Promise<CorpusAdmission>;

export type CorpusBlocker = Readonly<{
  key: string;
  cloneFamilies: number;
  models: number;
}>;

export type CorpusMechanismGap = Readonly<{
  key: string;
  cloneFamilies: number;
  models: number;
}>;

export type CorpusAdmissionMismatch = Readonly<{
  model: string;
  recorded: CorpusModel["admission"]["kind"];
  kernel: CorpusAdmission;
}>;

export type CorpusModelReport = Readonly<{
  id: string;
  title: string;
  businessPurpose: string | null;
  cloneFamily: string;
  sourceKind: CorpusModel["source"]["kind"];
  sourcePath: string;
  license: string;
  profile: string;
  /** The kernel's admission decision. */
  admission: CorpusAdmission["status"];
  pipelineCaseId: string | null;
  cibRelation: "retainedEvidence" | "notSelected" | "notApplicable";
  product2: CorpusModel["product2"]["kind"];
  constructs: ReadonlyArray<string>;
  mechanisms: ReadonlyArray<string>;
  capabilities: ReadonlyArray<MvpBpmnCapabilityId>;
  blockers: ReadonlyArray<string>;
}>;

export type MvpCapabilityReport = MvpBpmnCapability & Readonly<{
  retainedModelIds: ReadonlyArray<string>;
}>;

export type ExecutableModelCorpusReport = Readonly<{
  kind: "executableBpmnModelCorpusReport";
  models: ReadonlyArray<CorpusModelReport>;
  admissionMismatches: ReadonlyArray<CorpusAdmissionMismatch>;
  unsupportedMechanisms: ReadonlyArray<CorpusMechanismGap>;
  blockers: ReadonlyArray<CorpusBlocker>;
  mvpCapabilities: ReadonlyArray<MvpCapabilityReport>;
  uncoveredMvpCapabilities: ReadonlyArray<MvpBpmnCapabilityId>;
  retainedModels: number;
  externalModels: number;
  acceptedModels: number;
  rejectedModels: number;
  catalogReadyModels: number;
}>;

/** The recorded digest of a rejected model: the SHA-256 of the kernel's stable refusal code. */
export function refusalDigest(refusal: string): string {
  return sha256(refusal);
}

const corpusConstructs = new Set([
  "boundaryEvent",
  "businessRuleTask",
  "callActivity",
  "collaboration",
  "dataStore",
  "dataStoreReference",
  "dataObject",
  "endEvent",
  "eventBasedGateway",
  "exclusiveGateway",
  "inclusiveGateway",
  "intermediateCatchEvent",
  "intermediateThrowEvent",
  "lane",
  "laneSet",
  "manualTask",
  "parallelGateway",
  "participant",
  "process",
  "receiveTask",
  "resource",
  "scriptTask",
  "sendTask",
  "sequenceFlow",
  "serviceTask",
  "signal",
  "startEvent",
  "subProcess",
  "task",
  "transaction",
  "userTask",
]);

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function detectedConstructs(xml: string): ReadonlyArray<string> {
  const names = new Set(
    flattenElements(parseXmlElements(xml).roots)
      .map(({ name }) => name)
      .filter((name) => corpusConstructs.has(name)),
  );
  return [...names].sort();
}

function ranked(
  occurrences: ReadonlyMap<string, Readonly<{ models: ReadonlySet<string>; cloneFamilies: ReadonlySet<string> }>>,
): ReadonlyArray<CorpusBlocker> {
  return [...occurrences.entries()]
    .map(([key, occurrence]) => Object.freeze({
      key,
      cloneFamilies: occurrence.cloneFamilies.size,
      models: occurrence.models.size,
    }))
    .sort((left, right) =>
      right.cloneFamilies - left.cloneFamilies ||
      right.models - left.models ||
      compareCanonicalStrings(left.key, right.key)
    );
}

function count(
  occurrences: Map<string, { models: Set<string>; cloneFamilies: Set<string> }>,
  key: string,
  model: CorpusModel,
): void {
  const occurrence = occurrences.get(key) ?? { models: new Set<string>(), cloneFamilies: new Set<string>() };
  occurrence.models.add(model.id);
  occurrence.cloneFamilies.add(model.cloneFamily);
  occurrences.set(key, occurrence);
}

/** The discovered scenario a retained model binds, checked against the model's recorded identity and source. */
function boundScenario(model: CorpusModel, scenarios: ReadonlyArray<CorpusScenario>): CorpusScenario {
  if (model.source.kind !== "retainedScenario") throw new TypeError(`model ${model.id} is not retained`);
  const source = model.source;
  const scenario = scenarios.find(({ relativePath }) => relativePath === source.scenarioRelativePath);
  if (scenario === undefined) throw new Error(`model ${model.id} has no discovered scenario at ${source.scenarioRelativePath}`);
  const matching = scenario.sources.filter(({ relativePath, sha256: digest }) =>
    relativePath === source.bpmnRelativePath && digest === source.sha256);
  if (scenario.id !== model.pipelineCaseId || scenario.profile !== model.profile || matching.length !== 1) {
    throw new Error(`model ${model.id} differs from its discovered scenario ${scenario.relativePath}`);
  }
  return scenario;
}

export async function inspectExecutableModelCorpus(
  manifest: ExecutableModelCorpusManifest,
  options: Readonly<{
    projectRoot: string;
    externalRoot: string;
    scenarios: ReadonlyArray<CorpusScenario>;
    admitModel: CorpusAdmitter;
  }>,
): Promise<ExecutableModelCorpusReport> {
  const externalById = new Map(
    manifest.externalSources.map((source) => [source.id, source] as const),
  );
  for (const source of manifest.externalSources) {
    await verifyExternalCorpusSource(source, options.externalRoot);
  }

  // The catalog states what the discovered scenarios exercise, no more and no less; an open-row witness claims no
  // capability (`isOpenRowWitness`), so it widens no catalog.
  const exercised = new Set<MvpBpmnCapabilityId>();
  const claiming = options.scenarios.filter(({ relativePath }) => !isOpenRowWitness(relativePath));
  for (const relativePath of new Set(claiming.flatMap(({ sources }) => sources.map((source) => source.relativePath)))) {
    const xml = await readFile(path.join(options.projectRoot, relativePath), "utf8");
    for (const capability of detectExecutableBpmnCapabilities(xml)) exercised.add(capability);
  }
  const catalogCapabilities = new Set(mvpBpmnCapabilities.map(({ id }) => id));
  const catalogDrift = [...new Set([...exercised, ...catalogCapabilities])]
    .filter((id) => exercised.has(id) !== catalogCapabilities.has(id))
    .sort(compareCanonicalStrings);
  if (catalogDrift.length > 0) {
    throw new Error(`MVP capability catalog differs from the discovered scenarios: ${catalogDrift.join(", ")}`);
  }
  for (const capability of mvpBpmnCapabilities) {
    const cibEvidence = capability.cibEvidence;
    if (cibEvidence.kind !== CibCapabilityEvidenceKind.ExactSelectedProfile) continue;
    const scenario = options.scenarios.find(({ id, kind }) => id === cibEvidence.pipelineCaseId && kind === "scenario");
    if (scenario?.retainedEvidenceVersion !== cibEvidence.version) {
      throw new Error(`MVP capability ${capability.id} has no retained CIB Seven ${cibEvidence.version} evidence`);
    }
  }

  const reports: Array<CorpusModelReport> = [];
  const mismatches: Array<CorpusAdmissionMismatch> = [];
  const blockerOccurrences = new Map<string, { models: Set<string>; cloneFamilies: Set<string> }>();
  const cloneFamilyBySha = new Map<string, string>();
  const admittedIds = new Set<string>();

  for (const model of manifest.models) {
    const bytes = model.source.kind === "retainedScenario"
      ? await readFile(path.join(options.projectRoot, model.source.bpmnRelativePath))
      : await readExternalCorpusModel(model, externalById, options.externalRoot);
    const actualSha = sha256(bytes);
    if (actualSha !== model.source.sha256) {
      throw new Error(
        `model ${model.id} expected source SHA-256 ${model.source.sha256} but found ${actualSha}`,
      );
    }
    const priorFamily = cloneFamilyBySha.get(actualSha);
    if (priorFamily !== undefined && priorFamily !== model.cloneFamily) {
      throw new Error(
        `identical source bytes use different clone families: ${priorFamily} and ${model.cloneFamily}`,
      );
    }
    cloneFamilyBySha.set(actualSha, model.cloneFamily);

    const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const actualConstructs = detectedConstructs(xml);
    if (JSON.stringify(actualConstructs) !== JSON.stringify([...model.constructs].sort())) {
      throw new Error(
        `model ${model.id} construct inventory differs: expected ${model.constructs.join(", ")} but found ${actualConstructs.join(", ")}`,
      );
    }

    let scenario: CorpusScenario | null = null;
    let license: string;
    if (model.source.kind === "retainedScenario") {
      scenario = boundScenario(model, options.scenarios);
      license = model.source.license;
    } else {
      const external = externalById.get(model.source.externalSourceId);
      if (external === undefined) throw new Error(`model ${model.id} external source is absent`);
      license = external.license;
    }

    const admission = await options.admitModel(model, bytes, scenario);
    const recordedDigestDiffers = model.admission.kind === "rejected" && admission.status === "rejected" &&
      model.admission.diagnosticDigest !== refusalDigest(admission.refusal);
    if (admission.status !== model.admission.kind || recordedDigestDiffers) {
      mismatches.push({ model: model.id, recorded: model.admission.kind, kernel: admission });
    }
    if (admission.status === "accepted") admittedIds.add(model.id);
    const blockers = admission.status === "rejected" ? [admission.refusal] : [];
    for (const key of blockers) count(blockerOccurrences, key, model);
    if (model.product2.kind === "journeyBacked" || model.product2.kind === "guidedJourneyBacked") {
      await readFile(path.join(options.projectRoot, model.product2.journeyTestRelativePath as string));
    }

    reports.push(Object.freeze({
      id: model.id,
      title: model.title,
      businessPurpose: model.businessPurpose,
      cloneFamily: model.cloneFamily,
      sourceKind: model.source.kind,
      sourcePath: model.source.kind === "retainedScenario" ? model.source.bpmnRelativePath : model.source.relativePath,
      license,
      profile: model.profile,
      admission: admission.status,
      pipelineCaseId: model.pipelineCaseId,
      cibRelation: scenario === null
        ? "notApplicable"
        : scenario.retainedEvidenceVersion === null ? "notSelected" : "retainedEvidence",
      product2: model.product2.kind,
      constructs: Object.freeze([...model.constructs]),
      mechanisms: Object.freeze([...model.mechanisms]),
      capabilities: model.source.kind === "retainedScenario" ? detectExecutableBpmnCapabilities(xml) : [],
      blockers: Object.freeze(blockers),
    }));
  }

  const mvpCapabilities = mvpBpmnCapabilities.map((capability) => Object.freeze({
    ...capability,
    retainedModelIds: Object.freeze(reports
      .filter(({ capabilities }) => capabilities.includes(capability.id))
      .map(({ id }) => id)),
  }));
  const uncoveredMvpCapabilities = mvpCapabilities
    .filter(({ retainedModelIds }) => retainedModelIds.length === 0)
    .map(({ id }) => id);
  if (uncoveredMvpCapabilities.length > 0) {
    throw new Error(`retained MVP models do not cover ${uncoveredMvpCapabilities.join(", ")}`);
  }

  const supportedMechanisms = new Set(
    manifest.models.filter(({ id }) => admittedIds.has(id)).flatMap(({ mechanisms }) => mechanisms),
  );
  const mechanismGaps = new Map<string, { models: Set<string>; cloneFamilies: Set<string> }>();
  for (const model of manifest.models.filter(({ id }) => !admittedIds.has(id))) {
    for (const key of model.mechanisms.filter((mechanism) => !supportedMechanisms.has(mechanism))) {
      count(mechanismGaps, key, model);
    }
  }
  return Object.freeze({
    kind: "executableBpmnModelCorpusReport",
    models: Object.freeze(reports),
    admissionMismatches: Object.freeze(mismatches),
    unsupportedMechanisms: ranked(mechanismGaps),
    blockers: ranked(blockerOccurrences),
    mvpCapabilities: Object.freeze(mvpCapabilities),
    uncoveredMvpCapabilities: Object.freeze(uncoveredMvpCapabilities),
    retainedModels: reports.filter(({ sourceKind }) => sourceKind === "retainedScenario").length,
    externalModels: reports.filter(({ sourceKind }) => sourceKind !== "retainedScenario").length,
    acceptedModels: reports.filter(({ admission }) => admission === "accepted").length,
    rejectedModels: reports.filter(({ admission }) => admission === "rejected").length,
    catalogReadyModels: reports.filter(({ product2 }) =>
      product2 === "journeyBacked" || product2 === "guidedJourneyBacked"
    ).length,
  });
}

function tableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderExecutableModelCorpusMap(
  report: ExecutableModelCorpusReport,
): string {
  const lines = [
    "# Executable BPMN model corpus map",
    "",
    "This file is generated from `manifest.json` by the executable corpus guard. Edit the manifest or evidence owners, not this map by hand.",
    "",
    "## Current result",
    "",
    `The first tranche contains ${report.retainedModels} retained executable models and ${report.externalModels} exact external candidates. The kernel admits ${report.acceptedModels} and refuses ${report.rejectedModels}; ${report.admissionMismatches.length} differ from their recorded admission, and ${report.catalogReadyModels} ${report.catalogReadyModels === 1 ? "is" : "are"} eligible for the browser catalog.`,
    `The retained MVP suite covers all ${report.mvpCapabilities.length} registered executable BPMN element or semantic variants.`,
    `Browser eligibility separates ${report.models.filter((model) => model.product2 === "journeyBacked").length} human-work journeys from ${report.models.filter((model) => model.product2 === "guidedJourneyBacked").length} guided simulations with explicit host participants.`,
    "",
    "## Models",
    "",
    "| Model | Source | Clone family | Kernel admission | Scenario | CIB | Product 2 |",
    "|---|---|---|---|---|---|---|",
    ...report.models.map((model) =>
      `| ${tableCell(model.title)} | ${tableCell(model.sourceKind)} | ${tableCell(model.cloneFamily)} | ${model.admission} | ${model.pipelineCaseId ?? "none"} | ${model.cibRelation} | ${model.product2} |`
    ),
    "",
    "## MVP capability coverage",
    "",
    "| Family | Element or variant | Retained models |",
    "|---|---|---|",
    ...report.mvpCapabilities.map((capability) =>
      `| ${tableCell(capability.family)} | ${tableCell(capability.element)} | ${capability.retainedModelIds.map((id) => `\`${id}\``).join(", ")} |`
    ),
    "",
    "## Deduplicated unsupported reusable mechanisms",
    "",
    "This ranking compares external candidates with the reusable mechanisms exercised by the retained executable tranche. It includes ingestion, preservation, semantic, and product-integration mechanisms, so the owning research must classify dependencies before a semantic proposal is selected.",
    "",
    "| Rank | Reusable mechanism | Clone families | Model files |",
    "|---:|---|---:|---:|",
    ...report.unsupportedMechanisms.map((mechanism, index) =>
      `| ${index + 1} | \`${mechanism.key}\` | ${mechanism.cloneFamilies} | ${mechanism.models} |`
    ),
    "",
    "## Deduplicated admission blockers",
    "",
    "Blockers are ranked by independent clone families first and physical model files second. They are the kernel reader's and `Kernel.Admission`'s stable refusal codes, not BPMN requirement priorities or conformance percentages.",
    "",
    "| Rank | Refusal code | Clone families | Model files |",
    "|---:|---|---:|---:|",
    ...report.blockers.map((blocker, index) =>
      `| ${index + 1} | \`${blocker.key}\` | ${blocker.cloneFamilies} | ${blocker.models} |`
    ),
    "",
  ];
  return lines.join("\n");
}

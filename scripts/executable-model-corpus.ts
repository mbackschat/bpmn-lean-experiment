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
import { detectExecutableBpmnCapabilities } from "./executable-model-capabilities.ts";
import type {
  CorpusModel,
  ExecutableModelCorpusManifest,
  ExternalCorpusSource,
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

type PipelineCase = Readonly<{
  id: string;
  scenarioRelativePath: string;
  bpmnRelativePath: string;
  cib: Readonly<{ version: "2.0.0" | "2.2.0" }> | null;
  temporalRelation: string;
  injectMutation: unknown;
}>;

export type CorpusCompilerDiagnostic = Readonly<{
  code: string;
  element: Readonly<{
    type: string | null;
    subject: string | null;
    requiredCapability: string | null;
  }> | null;
}>;

export type CorpusCompiler = (
  request: Readonly<{
    bytes: Uint8Array;
    sourceId: string;
    expectedSha256: string;
    semanticProfile: string;
    sourceOverlay: null;
    limits: Readonly<{ maxBytes: number; parserDeadlineMs: number }>;
  }>,
) => Promise<Readonly<{
  status: "accepted" | "rejected";
  diagnostics: ReadonlyArray<CorpusCompilerDiagnostic>;
}>>;

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

export type CorpusModelReport = Readonly<{
  id: string;
  title: string;
  businessPurpose: string | null;
  cloneFamily: string;
  sourceKind: CorpusModel["source"]["kind"];
  sourcePath: string;
  license: string;
  profile: string;
  admission: CorpusModel["admission"]["kind"];
  pipelineCaseId: string | null;
  cibRelation: "pipeline" | "notSelected" | "notApplicable";
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
  "userTask",
]);

const maxCorpusModelBytes = 1024 * 1024;

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizedDiagnosticDigest(
  diagnostics: ReadonlyArray<CorpusCompilerDiagnostic>,
): string {
  const normalized = diagnostics.map(({ code, element }) => ({
    code,
    element: element === null
      ? null
      : {
          type: element.type,
          subject: element.subject,
          requiredCapability: element.requiredCapability,
        },
  }));
  return sha256(JSON.stringify(normalized));
}

function blockerKey(diagnostic: CorpusCompilerDiagnostic): string {
  if (diagnostic.element === null) {
    return `${diagnostic.code}:document`;
  }
  return [
    diagnostic.element.requiredCapability ?? diagnostic.code,
    diagnostic.element.type ?? "unknown",
    diagnostic.element.subject ?? "element",
  ].join(":");
}

function detectedConstructs(xml: string): ReadonlyArray<string> {
  const names = new Set(
    flattenElements(parseXmlElements(xml).roots)
      .map(({ name }) => name)
      .filter((name) => corpusConstructs.has(name)),
  );
  return [...names].sort();
}

type ScenarioBinding = Readonly<{
  profile: string;
  bpmn: Readonly<{
    relativePath: string;
    sha256: string;
  }>;
}>;

function scenarioBinding(value: unknown, relativePath: string): ScenarioBinding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`scenario ${relativePath} must be an object`);
  }
  const scenario = value as Record<string, unknown>;
  if (
    typeof scenario.bpmn !== "object" ||
    scenario.bpmn === null ||
    Array.isArray(scenario.bpmn)
  ) {
    throw new TypeError(`scenario ${relativePath}.bpmn must be an object`);
  }
  const bpmn = scenario.bpmn as Record<string, unknown>;
  const profile = scenario.profile;
  const relativeBpmnPath = bpmn.relativePath;
  const bpmnSha256 = bpmn.sha256;
  if (typeof profile !== "string" || profile.length === 0) {
    throw new TypeError(`scenario ${relativePath}.profile must be a nonempty string`);
  }
  if (typeof relativeBpmnPath !== "string" || relativeBpmnPath.length === 0) {
    throw new TypeError(
      `scenario ${relativePath}.bpmn.relativePath must be a nonempty string`,
    );
  }
  if (typeof bpmnSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(bpmnSha256)) {
    throw new TypeError(
      `scenario ${relativePath}.bpmn.sha256 must be a lowercase SHA-256 digest`,
    );
  }
  return {
    profile,
    bpmn: {
      relativePath: relativeBpmnPath,
      sha256: bpmnSha256,
    },
  };
}

export async function inspectExecutableModelCorpus(
  manifest: ExecutableModelCorpusManifest,
  options: Readonly<{
    projectRoot: string;
    externalRoot: string;
    pipelineCases: ReadonlyArray<PipelineCase>;
    compileModel: CorpusCompiler;
  }>,
): Promise<ExecutableModelCorpusReport> {
  const externalById = new Map(
    manifest.externalSources.map((source) => [source.id, source] as const),
  );
  for (const source of manifest.externalSources) {
    await verifyExternalCorpusSource(source, options.externalRoot);
  }

  const supportedCapabilities = new Set<MvpBpmnCapabilityId>();
  for (const relativePath of new Set(
    options.pipelineCases.map(({ bpmnRelativePath }) => bpmnRelativePath),
  )) {
    const xml = await readFile(path.join(options.projectRoot, relativePath), "utf8");
    for (const capability of detectExecutableBpmnCapabilities(xml)) {
      supportedCapabilities.add(capability);
    }
  }
  const catalogCapabilities = new Set(
    mvpBpmnCapabilities.map(({ id }) => id),
  );
  const catalogDrift = [...new Set([...supportedCapabilities, ...catalogCapabilities])]
    .filter((id) => supportedCapabilities.has(id) !== catalogCapabilities.has(id));
  if (catalogDrift.length > 0) {
    throw new Error(`MVP capability catalog differs from registered support: ${catalogDrift.join(", ")}`);
  }
  for (const capability of mvpBpmnCapabilities) {
    if (capability.cibEvidence.kind !== CibCapabilityEvidenceKind.ExactSelectedProfile) {
      continue;
    }
    const pipelineCase = options.pipelineCases.find(
      ({ id }) => id === capability.cibEvidence.pipelineCaseId,
    );
    if (
      pipelineCase?.cib === null ||
      pipelineCase?.cib?.version !== capability.cibEvidence.version
    ) {
      throw new Error(`MVP capability ${capability.id} has no exact CIB pipeline evidence`);
    }
  }

  const reports: Array<CorpusModelReport> = [];
  const blockerOccurrences = new Map<
    string,
    { models: Set<string>; cloneFamilies: Set<string> }
  >();
  const cloneFamilyBySha = new Map<string, string>();

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

    const actualConstructs = detectedConstructs(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (JSON.stringify(actualConstructs) !== JSON.stringify([...model.constructs].sort())) {
      throw new Error(
        `model ${model.id} construct inventory differs: expected ${model.constructs.join(", ")} but found ${actualConstructs.join(", ")}`,
      );
    }
    const capabilities = model.source.kind === "retainedScenario"
      ? detectExecutableBpmnCapabilities(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
      : [];

    let pipelineCase: PipelineCase | undefined;
    let license: string;
    if (model.source.kind === "retainedScenario") {
      license = model.source.license;
      const scenario = scenarioBinding(
        JSON.parse(
          await readFile(
            path.join(options.projectRoot, model.source.scenarioRelativePath),
            "utf8",
          ),
        ),
        model.source.scenarioRelativePath,
      );
      if (
        scenario.profile !== model.profile ||
        scenario.bpmn.relativePath !== model.source.bpmnRelativePath ||
        scenario.bpmn.sha256 !== model.source.sha256
      ) {
        throw new Error(`model ${model.id} differs from its retained scenario binding`);
      }
      pipelineCase = options.pipelineCases.find(({ id }) => id === model.pipelineCaseId);
      if (
        pipelineCase === undefined ||
        pipelineCase.scenarioRelativePath !== model.source.scenarioRelativePath ||
        pipelineCase.bpmnRelativePath !== model.source.bpmnRelativePath ||
        typeof pipelineCase.injectMutation !== "function" ||
        pipelineCase.temporalRelation.length === 0
      ) {
        throw new Error(`model ${model.id} has no exact protected pipeline route`);
      }
    } else {
      const external = externalById.get(model.source.externalSourceId);
      if (external === undefined) {
        throw new Error(`model ${model.id} external source is absent`);
      }
      license = external.license;
    }

    const compilation = await options.compileModel({
      bytes,
      sourceId: model.id,
      expectedSha256: model.source.sha256,
      semanticProfile: model.profile,
      sourceOverlay: null,
      limits: { maxBytes: maxCorpusModelBytes, parserDeadlineMs: 1_000 },
    });
    const expectedStatus = model.admission.kind;
    if (compilation.status !== expectedStatus) {
      throw new Error(
        `model ${model.id} expected ${expectedStatus} admission but was ${compilation.status}`,
      );
    }
    if (
      model.admission.kind === "rejected" &&
      normalizedDiagnosticDigest(compilation.diagnostics) !==
        model.admission.diagnosticDigest
    ) {
      throw new Error(`model ${model.id} admission diagnostics changed`);
    }
    const blockers = compilation.status === "rejected"
      ? [...new Set(compilation.diagnostics.map(blockerKey))].sort()
      : [];
    for (const key of blockers) {
      const occurrence = blockerOccurrences.get(key) ?? {
        models: new Set<string>(),
        cloneFamilies: new Set<string>(),
      };
      occurrence.models.add(model.id);
      occurrence.cloneFamilies.add(model.cloneFamily);
      blockerOccurrences.set(key, occurrence);
    }
    if (model.product2.kind === "journeyBacked") {
      await readFile(path.join(
        options.projectRoot,
        model.product2.journeyTestRelativePath as string,
      ));
    }

    reports.push(Object.freeze({
      id: model.id,
      title: model.title,
      businessPurpose: model.businessPurpose,
      cloneFamily: model.cloneFamily,
      sourceKind: model.source.kind,
      sourcePath: model.source.kind === "retainedScenario"
        ? model.source.bpmnRelativePath
        : model.source.relativePath,
      license,
      profile: model.profile,
      admission: model.admission.kind,
      pipelineCaseId: model.pipelineCaseId,
      cibRelation: pipelineCase === undefined
        ? "notApplicable"
        : pipelineCase.cib === null ? "notSelected" : "pipeline",
      product2: model.product2.kind,
      constructs: Object.freeze([...model.constructs]),
      mechanisms: Object.freeze([...model.mechanisms]),
      capabilities,
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
    throw new Error(
      `retained MVP models do not cover ${uncoveredMvpCapabilities.join(", ")}`,
    );
  }

  const blockers = [...blockerOccurrences.entries()]
    .map(([key, occurrence]) => Object.freeze({
      key,
      cloneFamilies: occurrence.cloneFamilies.size,
      models: occurrence.models.size,
    }))
    .sort((left, right) =>
      right.cloneFamilies - left.cloneFamilies ||
      right.models - left.models ||
      left.key.localeCompare(right.key)
    );
  const supportedMechanisms = new Set(
    manifest.models
      .filter(({ admission }) => admission.kind === "accepted")
      .flatMap(({ mechanisms }) => mechanisms),
  );
  const mechanismGaps = new Map<
    string,
    { models: Set<string>; cloneFamilies: Set<string> }
  >();
  for (const model of manifest.models.filter(
    ({ admission }) => admission.kind === "rejected",
  )) {
    for (const key of model.mechanisms.filter(
      (mechanism) => !supportedMechanisms.has(mechanism),
    )) {
      const gap = mechanismGaps.get(key) ?? {
        models: new Set<string>(),
        cloneFamilies: new Set<string>(),
      };
      gap.models.add(model.id);
      gap.cloneFamilies.add(model.cloneFamily);
      mechanismGaps.set(key, gap);
    }
  }
  const unsupportedMechanisms = [...mechanismGaps.entries()]
    .map(([key, occurrence]) => Object.freeze({
      key,
      cloneFamilies: occurrence.cloneFamilies.size,
      models: occurrence.models.size,
    }))
    .sort((left, right) =>
      right.cloneFamilies - left.cloneFamilies ||
      right.models - left.models ||
      left.key.localeCompare(right.key)
    );
  return Object.freeze({
    kind: "executableBpmnModelCorpusReport",
    models: Object.freeze(reports),
    unsupportedMechanisms: Object.freeze(unsupportedMechanisms),
    blockers: Object.freeze(blockers),
    mvpCapabilities: Object.freeze(mvpCapabilities),
    uncoveredMvpCapabilities: Object.freeze(uncoveredMvpCapabilities),
    retainedModels: reports.filter(({ sourceKind }) =>
      sourceKind === "retainedScenario"
    ).length,
    externalModels: reports.filter(({ sourceKind }) =>
      sourceKind !== "retainedScenario"
    ).length,
    acceptedModels: reports.filter(({ admission }) => admission === "accepted").length,
    rejectedModels: reports.filter(({ admission }) => admission === "rejected").length,
    catalogReadyModels: reports.filter(({ product2 }) =>
      product2 === "journeyBacked"
    ).length,
  });
}

function tableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderExecutableModelCorpusIndex(
  report: ExecutableModelCorpusReport,
): string {
  const lines = [
    "# Executable BPMN model corpus index",
    "",
    "This file is generated from `manifest.json` by the executable corpus guard. Edit the manifest or evidence owners, not this index by hand.",
    "",
    "## Current result",
    "",
    `The first tranche contains ${report.retainedModels} retained executable models and ${report.externalModels} exact external candidates. ${report.acceptedModels} are admitted, ${report.rejectedModels} are rejected, and ${report.catalogReadyModels} ${report.catalogReadyModels === 1 ? "is" : "are"} eligible for the browser catalog.`,
    `The retained MVP suite covers all ${report.mvpCapabilities.length} registered executable BPMN element variants.`,
    "",
    "## Models",
    "",
    "| Model | Source | Clone family | Admission | Pipeline | CIB | Product 2 |",
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
    "Blockers are ranked by independent clone families first and physical model files second. They are compiler admission facts, not BPMN requirement priorities or conformance percentages.",
    "",
    "| Rank | Compiler mechanism | Clone families | Model files |",
    "|---:|---|---:|---:|",
    ...report.blockers.map((blocker, index) =>
      `| ${index + 1} | \`${blocker.key}\` | ${blocker.cloneFamilies} | ${blocker.models} |`
    ),
    "",
  ];
  return lines.join("\n");
}

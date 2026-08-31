import path from "node:path";

export type ExternalGitCorpusSource = {
  kind: "git";
  id: string;
  checkoutRelativePath: string;
  revision: string;
  license: string;
};

export type ExternalArchiveCorpusSource = {
  kind: "archive";
  id: string;
  archiveRelativePath: string;
  sha256: string;
  license: string;
};

export type ExternalCorpusSource =
  | ExternalGitCorpusSource
  | ExternalArchiveCorpusSource;

export type RetainedScenarioSource = {
  kind: "retainedScenario";
  bpmnRelativePath: string;
  sha256: string;
  scenarioRelativePath: string;
  license: "MIT";
};

export type ExternalGitSource = {
  kind: "externalGit";
  externalSourceId: string;
  relativePath: string;
  sha256: string;
};

export type ExternalArchiveEntrySource = {
  kind: "externalArchiveEntry";
  externalSourceId: string;
  relativePath: string;
  sha256: string;
};

export type CorpusModel = {
  id: string;
  title: string;
  businessPurpose: string | null;
  cloneFamily: string;
  constructs: Array<string>;
  mechanisms: Array<string>;
  source: RetainedScenarioSource | ExternalGitSource | ExternalArchiveEntrySource;
  profile: string;
  admission:
    | { kind: "accepted" }
    | { kind: "rejected"; diagnosticDigest: string };
  pipelineCaseId: string | null;
  product2:
    | { kind: "notCatalogReady"; reason: string }
    | { kind: "journeyBacked"; journeyTestRelativePath: string };
};

export type ExecutableModelCorpusManifest = {
  kind: "executableBpmnModelCorpus";
  version: 2;
  externalSources: Array<ExternalCorpusSource>;
  models: Array<CorpusModel>;
};

const sha256Pattern = /^[a-f0-9]{64}$/u;
const gitRevisionPattern = /^[a-f0-9]{40}$/u;
const corpusMechanisms = new Set([
  "atomicProcessDataPatch",
  "boundaryError",
  "businessDecision",
  "calledProcess",
  "collaborationPresentation",
  "completionCondition",
  "conditionalRouting",
  "configuredTaskEffect",
  "cyclicControlFlow",
  "dataAssociation",
  "diagramInterchange",
  "directActivityDataInput",
  "directActivityDataOutput",
  "earlyCompletion",
  "embeddedSubProcess",
  "errorPropagation",
  "eventRace",
  "externalEffect",
  "genericTask",
  "inclusiveSplitJoin",
  "interruptingBoundaryMessage",
  "interruptingBoundaryTimer",
  "lanePresentation",
  "literalUserTaskAssignmentAndGeneratedForm",
  "literalUserTaskAssignment",
  "mappedData",
  "messageStart",
  "messagePayloadCatchMediation",
  "messageWait",
  "nonInterruptingBoundaryTimer",
  "orderedCollectionData",
  "parallelMultiInstance",
  "parallelSplit",
  "parallelSplitJoin",
  "processLifecycle",
  "receiveTaskMessage",
  "resourceAssignment",
  "scriptTaskExecution",
  "sendTaskDelivery",
  "sequentialMultiInstance",
  "sequenceFlow",
  "signalEvent",
  "structuredHumanWorkCatalog",
  "taskMetadata",
  "terminateEnd",
  "timerStart",
  "timerWait",
  "userTaskCompletion",
  "userTaskWait",
  "vendorRuntimeMetadata",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} has unexpected keys: ${actual.join(", ")}`);
  }
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a nonempty string`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  const result = string(value, label);
  if (!sha256Pattern.test(result)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
  }
  return result;
}

function stringArray(value: unknown, label: string): Array<string> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a nonempty array`);
  }
  const values = value.map((entry, index) =>
    string(entry, `${label}[${index}]`)
  );
  if (new Set(values).size !== values.length) {
    throw new TypeError(`${label} contains duplicates`);
  }
  return values;
}

function mechanismArray(value: unknown, label: string): Array<string> {
  const mechanisms = stringArray(value, label);
  const unsupported = mechanisms.find((mechanism) =>
    !corpusMechanisms.has(mechanism)
  );
  if (unsupported !== undefined) {
    throw new TypeError(`${label} contains unknown mechanism ${unsupported}`);
  }
  return mechanisms;
}

function safeRelativePath(value: unknown, label: string): string {
  const result = string(value, label);
  if (
    path.posix.isAbsolute(result) ||
    result.split("/").some((segment) => segment === ".." || segment === "")
  ) {
    throw new TypeError(`${label} must stay inside its checkout`);
  }
  return result;
}

function requireExternalSource(value: unknown, index: number): ExternalCorpusSource {
  const source = record(value, `externalSources[${index}]`);
  const label = `externalSources[${index}]`;
  if (source.kind === "git") {
    exactKeys(
      source,
      ["kind", "id", "checkoutRelativePath", "revision", "license"],
      label,
    );
    const revision = string(source.revision, `${label}.revision`);
    if (!gitRevisionPattern.test(revision)) {
      throw new TypeError(`${label}.revision must be a Git commit`);
    }
    return {
      kind: "git",
      id: string(source.id, `${label}.id`),
      checkoutRelativePath: safeRelativePath(
        source.checkoutRelativePath,
        `${label}.checkoutRelativePath`,
      ),
      revision,
      license: string(source.license, `${label}.license`),
    };
  }
  if (source.kind === "archive") {
    exactKeys(
      source,
      ["kind", "id", "archiveRelativePath", "sha256", "license"],
      label,
    );
    return {
      kind: "archive",
      id: string(source.id, `${label}.id`),
      archiveRelativePath: safeRelativePath(
        source.archiveRelativePath,
        `${label}.archiveRelativePath`,
      ),
      sha256: digest(source.sha256, `${label}.sha256`),
      license: string(source.license, `${label}.license`),
    };
  }
  throw new TypeError(`${label}.kind is unsupported`);
}

function requireModelSource(value: unknown, label: string): CorpusModel["source"] {
  const source = record(value, label);
  if (source.kind === "retainedScenario") {
    exactKeys(
      source,
      ["kind", "bpmnRelativePath", "sha256", "scenarioRelativePath", "license"],
      label,
    );
    if (source.license !== "MIT") {
      throw new TypeError(`${label}.license must be MIT`);
    }
    return {
      kind: "retainedScenario",
      bpmnRelativePath: safeRelativePath(
        source.bpmnRelativePath,
        `${label}.bpmnRelativePath`,
      ),
      sha256: digest(source.sha256, `${label}.sha256`),
      scenarioRelativePath: safeRelativePath(
        source.scenarioRelativePath,
        `${label}.scenarioRelativePath`,
      ),
      license: "MIT",
    };
  }
  if (source.kind === "externalGit") {
    exactKeys(
      source,
      ["kind", "externalSourceId", "relativePath", "sha256"],
      label,
    );
    return {
      kind: "externalGit",
      externalSourceId: string(
        source.externalSourceId,
        `${label}.externalSourceId`,
      ),
      relativePath: safeRelativePath(source.relativePath, "external model path"),
      sha256: digest(source.sha256, `${label}.sha256`),
    };
  }
  if (source.kind === "externalArchiveEntry") {
    exactKeys(
      source,
      ["kind", "externalSourceId", "relativePath", "sha256"],
      label,
    );
    return {
      kind: "externalArchiveEntry",
      externalSourceId: string(
        source.externalSourceId,
        `${label}.externalSourceId`,
      ),
      relativePath: safeRelativePath(
        source.relativePath,
        "external archive entry path",
      ),
      sha256: digest(source.sha256, `${label}.sha256`),
    };
  }
  throw new TypeError(`${label}.kind is unsupported`);
}

function requireAdmission(value: unknown, label: string): CorpusModel["admission"] {
  const admission = record(value, label);
  if (admission.kind === "accepted") {
    exactKeys(admission, ["kind"], label);
    return { kind: "accepted" };
  }
  if (admission.kind === "rejected") {
    exactKeys(admission, ["kind", "diagnosticDigest"], label);
    return {
      kind: "rejected",
      diagnosticDigest: digest(
        admission.diagnosticDigest,
        `${label}.diagnosticDigest`,
      ),
    };
  }
  throw new TypeError(`${label}.kind is unsupported`);
}

function requireProduct2(value: unknown, label: string): CorpusModel["product2"] {
  const product2 = record(value, label);
  if (product2.kind === "notCatalogReady") {
    exactKeys(product2, ["kind", "reason"], label);
    return {
      kind: "notCatalogReady",
      reason: string(product2.reason, `${label}.reason`),
    };
  }
  if (product2.kind === "journeyBacked") {
    exactKeys(product2, ["kind", "journeyTestRelativePath"], label);
    if (
      typeof product2.journeyTestRelativePath !== "string" ||
      product2.journeyTestRelativePath.length === 0
    ) {
      throw new TypeError("journeyBacked model requires one production journey");
    }
    return {
      kind: "journeyBacked",
      journeyTestRelativePath: safeRelativePath(
        product2.journeyTestRelativePath,
        `${label}.journeyTestRelativePath`,
      ),
    };
  }
  throw new TypeError(`${label}.kind is unsupported`);
}

function requireModel(value: unknown, index: number): CorpusModel {
  const label = `models[${index}]`;
  const model = record(value, label);
  exactKeys(
    model,
    [
      "id",
      "title",
      "businessPurpose",
      "cloneFamily",
      "constructs",
      "mechanisms",
      "source",
      "profile",
      "admission",
      "pipelineCaseId",
      "product2",
    ],
    label,
  );
  const pipelineCaseId = model.pipelineCaseId === null
    ? null
    : string(model.pipelineCaseId, `${label}.pipelineCaseId`);
  const businessPurpose = model.businessPurpose === null
    ? null
    : string(model.businessPurpose, `${label}.businessPurpose`);
  return {
    id: string(model.id, `${label}.id`),
    title: string(model.title, `${label}.title`),
    businessPurpose,
    cloneFamily: string(model.cloneFamily, `${label}.cloneFamily`),
    constructs: stringArray(model.constructs, `${label}.constructs`),
    mechanisms: mechanismArray(model.mechanisms, `${label}.mechanisms`),
    source: requireModelSource(model.source, `${label}.source`),
    profile: string(model.profile, `${label}.profile`),
    admission: requireAdmission(model.admission, `${label}.admission`),
    pipelineCaseId,
    product2: requireProduct2(model.product2, `${label}.product2`),
  };
}

function requireUnique(values: ReadonlyArray<string>, label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new TypeError(`${label} contain duplicate ${value}`);
    }
    seen.add(value);
  }
}

export function requireExecutableModelCorpusManifest(
  value: unknown,
): ExecutableModelCorpusManifest {
  const manifest = record(value, "model corpus manifest");
  exactKeys(
    manifest,
    ["kind", "version", "externalSources", "models"],
    "model corpus manifest",
  );
  if (
    manifest.kind !== "executableBpmnModelCorpus" ||
    manifest.version !== 2 ||
    !Array.isArray(manifest.externalSources) ||
    !Array.isArray(manifest.models)
  ) {
    throw new TypeError("model corpus manifest header is invalid");
  }
  const externalSources = manifest.externalSources.map(requireExternalSource);
  const models = manifest.models.map(requireModel);
  requireUnique(externalSources.map(({ id }) => id), "external source IDs");
  requireUnique(models.map(({ id }) => id), "model IDs");
  const externalById = new Map(externalSources.map((source) => [source.id, source]));
  for (const model of models) {
    if (
      model.source.kind !== "retainedScenario" &&
      !externalById.has(model.source.externalSourceId)
    ) {
      throw new TypeError(
        `model ${model.id} references unknown external source ${model.source.externalSourceId}`,
      );
    }
    if (
      model.source.kind === "externalGit" &&
      externalById.get(model.source.externalSourceId)?.kind !== "git"
    ) {
      throw new TypeError(
        `model ${model.id} external Git source kind does not match its registry`,
      );
    }
    if (
      model.source.kind === "externalArchiveEntry" &&
      externalById.get(model.source.externalSourceId)?.kind !== "archive"
    ) {
      throw new TypeError(
        `model ${model.id} external archive source kind does not match its registry`,
      );
    }
    if (
      model.source.kind === "retainedScenario" &&
      (model.admission.kind !== "accepted" || model.pipelineCaseId === null)
    ) {
      throw new TypeError(
        `retained model ${model.id} requires accepted admission and a pipeline case`,
      );
    }
    if (
      model.source.kind === "retainedScenario" &&
      (model.businessPurpose === null || model.businessPurpose.length < 20)
    ) {
      throw new TypeError(
        `retained model ${model.id} requires a concrete business purpose`,
      );
    }
    if (
      model.source.kind !== "retainedScenario" &&
      (model.admission.kind !== "rejected" || model.pipelineCaseId !== null)
    ) {
      throw new TypeError(
        `external model ${model.id} must remain a rejected non-pipeline candidate`,
      );
    }
    if (model.source.kind !== "retainedScenario" && model.businessPurpose !== null) {
      throw new TypeError(
        `external model ${model.id} cannot claim a project-owned business purpose`,
      );
    }
  }
  return { kind: "executableBpmnModelCorpus", version: 2, externalSources, models };
}

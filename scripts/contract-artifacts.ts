import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareCanonicalStrings,
  verifyCanonicalDefinitionOrder,
  verifyDefinitionReferences,
} from "./contract-artifact-consistency.ts";
export { compareCanonicalStrings } from "./contract-artifact-consistency.ts";
import {
  verifyProducerProjection,
} from "./contract-cib-evidence-projection.ts";
import { Ajv2020 } from "ajv/dist/2020.js";
import type {
  AnySchema,
  ValidateFunction,
} from "ajv/dist/2020.js";

import type {
  CanonicalObservation,
  CheckedProcess,
  EffectDescriptor,
  OccurrenceId,
  Scenario,
  ScenarioResult,
  SemanticOperation,
  SemanticProcessProgram,
  StateObservation,
  VariableBinding,
} from "../packages/semantic-core/src/index.ts";

import {
  parseStrictJson,
  requireUnicodeScalarString,
} from "./strict-json.ts";

const schemaBaseId = "https://bpmn-lean.local/schemas";
const scenarioSchemaId = `${schemaBaseId}/scenario.schema.json`;
const evidenceSchemaId = `${schemaBaseId}/cibseven-evidence.schema.json`;
const profileSchemaId = `${schemaBaseId}/semantic-profile.schema.json`;
const checkedProcessSchemaId = `${schemaBaseId}/checked-process.schema.json`;
const semanticProcessSchemaId = `${schemaBaseId}/semantic-process.schema.json`;

export const artifactCases = Object.freeze([
  Object.freeze({
    scenarioRelativePath:
      "scenarios/user-task-discovery-completion/scenario.json",
    evidenceRelativePath:
      "scenarios/user-task-discovery-completion/cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/user-task-discovery-completion/wrong-activation.scenario.json",
    evidenceRelativePath:
      "scenarios/user-task-discovery-completion/wrong-activation.cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/user-task-discovery-completion/stale-completion.scenario.json",
    evidenceRelativePath:
      "scenarios/user-task-discovery-completion/stale-completion.cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/parallel-fork-join/a-then-b.scenario.json",
    evidenceRelativePath:
      "scenarios/parallel-fork-join/a-then-b.cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/parallel-fork-join/b-then-a.scenario.json",
    evidenceRelativePath:
      "scenarios/parallel-fork-join/b-then-a.cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/parallel-fork-join/stale-a-while-b-active.scenario.json",
    evidenceRelativePath:
      "scenarios/parallel-fork-join/stale-a-while-b-active.cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/intermediate-catch-timer/scenario.json",
    evidenceRelativePath:
      "scenarios/intermediate-catch-timer/cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/service-task-effect/scenario.json",
    evidenceRelativePath:
      "scenarios/service-task-effect/cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/create-document-data/scenario.json",
    evidenceRelativePath:
      "scenarios/create-document-data/cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/boundary-error/scenario.json",
    evidenceRelativePath:
      "scenarios/boundary-error/cibseven-evidence.json",
  }),
]);

export type ArtifactCase = Readonly<{
  scenarioRelativePath: string;
  evidenceRelativePath: string;
}>;

type JsonDocument<Value> = Readonly<{
  bytes: Buffer;
  value: Value;
}>;

type ContentIdentity = Readonly<{
  id: string;
  sha256: string;
}>;

type SemanticProfile = Readonly<{
  kind: "semanticProfile";
  id: string;
  oracle: Readonly<{
    version: string;
    revision: string;
  }>;
  bpmn: Readonly<{
    relationships: ReadonlyArray<string>;
  }>;
  observations: ReadonlyArray<string>;
}>;

export type TaskQueryTask = Readonly<{
  elementId: string;
  name: string | null;
}>;

export type ProcessVariableSnapshot = Readonly<{
  name: string;
  value: string | null;
}>;

export type StateQuerySnapshot = Readonly<{
  afterCommandId: string;
  processInstanceCount: number;
  engineClockTimeMs: number;
  variables: ReadonlyArray<ProcessVariableSnapshot>;
}>;

type TaskQuerySnapshot = Readonly<{
  afterCommandId: string;
  tasks: ReadonlyArray<TaskQueryTask>;
}>;

export type TimerJob = Readonly<{
  elementId: string;
  dueDateDeltaMs: number;
  executable: boolean;
}>;

type TimerJobSnapshot = Readonly<{
  afterCommandId: string;
  jobs: ReadonlyArray<TimerJob>;
}>;

export type EffectJob = Readonly<{
  elementId: string;
  activation: number;
  protocol: string;
  handler: string;
  retries: number;
  executable: boolean;
  dueDatePresent: boolean;
}>;

export type EffectJobSnapshot = Readonly<{
  afterCommandId: string;
  jobs: ReadonlyArray<EffectJob>;
}>;

type EffectExecutionSnapshot = Readonly<{
  afterCommandId: string;
  schedule: string;
  invocations: number;
  mutations: number;
  initialRetries: number;
  retriesAfterFirstFailure: number | null;
}>;

export type MappingExecutionSnapshot = Readonly<{
  afterCommandId: string;
  handler: string;
  arguments: ReadonlyArray<VariableBinding>;
  localPatch: ReadonlyArray<VariableBinding>;
  invocations: number;
}>;

export type CibSevenEvidence = Readonly<{
  kind: "cibSevenScenarioEvidence";
  scenario: ContentIdentity;
  profile: ContentIdentity;
  producer: Readonly<{
    engineVersion: string;
    engineRevision: string;
  }>;
  producerObservations: Readonly<{
    stateQueries: ReadonlyArray<StateQuerySnapshot>;
    taskQueries: ReadonlyArray<TaskQuerySnapshot>;
    timerJobs: ReadonlyArray<TimerJobSnapshot>;
    effectJobs?: ReadonlyArray<EffectJobSnapshot>;
    effectExecutions?: ReadonlyArray<EffectExecutionSnapshot>;
    mappingExecutions?: ReadonlyArray<MappingExecutionSnapshot>;
  }>;
  result: ScenarioResult;
}>;

export type DefinitionArtifacts = Readonly<{
  checkedProcess: CheckedProcess;
  semanticProcess: SemanticProcessProgram;
}>;

export type ArtifactSet = ArtifactCase & Readonly<{
  validator: Ajv2020;
  registeredRelationshipIds: ReadonlySet<string>;
  profile: SemanticProfile;
  profileBytes: Buffer;
  scenario: Scenario;
  scenarioBytes: Buffer;
  evidence: CibSevenEvidence;
  bpmnBytes: Buffer;
}>;

type ArtifactContext = Readonly<{
  validator: Ajv2020;
  registeredRelationshipIds: ReadonlySet<string>;
}>;

const validatorsByRoot =
  new Map<string, Promise<Ajv2020>>();

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function resolveInside(projectRoot: string, relativePath: string): string {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`artifact path escapes project root: ${relativePath}`);
  }
  return resolvedPath;
}

async function readJsonDocument<Value>(
  filePath: string,
): Promise<JsonDocument<Value>> {
  const bytes = await readFile(filePath);
  return {
    bytes,
    value: parseStrictJson<Value>(bytes.toString("utf8"), filePath),
  };
}

async function createValidator(projectRoot: string): Promise<Ajv2020> {
  const schemaDirectory = resolveInside(projectRoot, "contracts/schemas");
  const schemaNames = [
    "scenario.schema.json",
    "canonical-result.schema.json",
    "semantic-profile.schema.json",
    "cibseven-evidence.schema.json",
    "checked-process.schema.json",
    "semantic-process.schema.json",
  ];
  const schemas = await Promise.all(
    schemaNames.map(async (name) => {
      const document = await readJsonDocument<AnySchema>(
        path.join(schemaDirectory, name),
      );
      return document.value;
    }),
  );
  const validator = new Ajv2020({
    allErrors: true,
    strict: true,
    strictTuples: false,
  });
  for (const schema of schemas) {
    validator.addSchema(schema);
  }
  return validator;
}

async function readRegisteredRelationshipIds(
  projectRoot: string,
): Promise<ReadonlySet<string>> {
  const registerPath = resolveInside(projectRoot, "docs/CIB-BPMN-RELATION-REGISTER.md");
  const register = await readFile(registerPath, "utf8");
  return new Set(
    Array.from(
      register.matchAll(
        /^### (CIB-(?:AGR|OP|INT|EXT|CFG|LIM|DEV)-[0-9]{4})\b/gm,
      ),
      (match) => match[1] as string,
    ),
  );
}

async function validatorFor(projectRoot: string): Promise<Ajv2020> {
  const resolvedRoot = path.resolve(projectRoot);
  let validatorPromise = validatorsByRoot.get(resolvedRoot);
  if (validatorPromise === undefined) {
    validatorPromise = createValidator(resolvedRoot);
    validatorsByRoot.set(resolvedRoot, validatorPromise);
  }
  return validatorPromise;
}

function validateWith(
  validator: Ajv2020,
  schemaId: string,
  label: string,
  value: unknown,
): void {
  const validate = validator.getSchema(schemaId);
  if (validate === undefined) {
    throw new Error(`schema is not registered: ${schemaId}`);
  }
  if (!validate(value)) {
    throw new Error(
      `${label} schema validation failed: ${JSON.stringify(validate.errors)}`,
    );
  }
}

export async function verifyDefinitionArtifacts(
  projectRoot: string,
  artifacts: DefinitionArtifacts,
): Promise<DefinitionArtifacts> {
  const validator = await validatorFor(projectRoot);
  const { checkedProcess, semanticProcess } = artifacts;
  validateWith(
    validator,
    checkedProcessSchemaId,
    "checked process",
    checkedProcess,
  );
  validateWith(
    validator,
    semanticProcessSchemaId,
    "semantic process",
    semanticProcess,
  );

  const checkedIdentity = {
    ...checkedProcess.identity,
    processId: checkedProcess.processId,
  };
  const programIdentity = {
    semanticProfile: semanticProcess.identity.semanticProfile,
    sourceId: semanticProcess.identity.sourceId,
    sourceSha256: semanticProcess.identity.sourceSha256,
    processId: semanticProcess.processId,
  };
  if (!isDeepStrictEqual(checkedIdentity, programIdentity)) {
    throw new Error("checked process and semantic process identities differ");
  }

  verifyCanonicalDefinitionOrder(checkedProcess, semanticProcess);
  verifyDefinitionReferences(checkedProcess, semanticProcess);
  return artifacts;
}

export function verifyArtifactSet(artifactSet: ArtifactSet): ArtifactSet {
  const {
    validator,
    profile,
    scenario,
    scenarioBytes,
    profileBytes,
    evidence,
    bpmnBytes,
    registeredRelationshipIds,
  } = artifactSet;
  validateWith(validator, profileSchemaId, "profile", profile);
  validateWith(validator, scenarioSchemaId, "scenario", scenario);
  validateWith(validator, evidenceSchemaId, "evidence", evidence);

  if (
    !isDeepStrictEqual(
      parseStrictJson<Scenario>(
        scenarioBytes.toString("utf8"),
        "scenario source bytes",
      ),
      scenario,
    )
  ) {
    throw new Error("scenario value does not match its exact source bytes");
  }
  if (evidence.scenario.id !== scenario.id) {
    throw new Error("evidence scenario identity does not match");
  }
  if (evidence.scenario.sha256 !== sha256(scenarioBytes)) {
    throw new Error("evidence scenario digest does not match");
  }
  if (
    profile.id !== scenario.profile ||
    evidence.profile.id !== scenario.profile
  ) {
    throw new Error("profile identity does not match across artifacts");
  }
  if (evidence.profile.sha256 !== sha256(profileBytes)) {
    throw new Error("evidence profile digest does not match");
  }
  if (
    evidence.producer.engineVersion !== profile.oracle.version ||
    evidence.producer.engineRevision !== profile.oracle.revision ||
    evidence.producer.engineRevision !== scenario.provenance.cibRevision
  ) {
    throw new Error("CIB revision does not match across artifacts");
  }
  if (
    !scenario.observations.every((observation) =>
      profile.observations.includes(observation),
    )
  ) {
    throw new Error("scenario requests an observation outside its profile");
  }
  for (const relationshipId of profile.bpmn.relationships) {
    if (!registeredRelationshipIds.has(relationshipId)) {
      throw new Error(
        `profile references unknown CIB-BPMN relationship: ${relationshipId}`,
      );
    }
  }
  if (scenario.bpmn.sha256 !== sha256(bpmnBytes)) {
    throw new Error("BPMN resource digest does not match scenario");
  }
  const startStimuli = scenario.stimuli.filter(
    (stimulus) => stimulus.kind === "startProcess",
  );
  const start = startStimuli[0];
  if (startStimuli.length !== 1 || start === undefined) {
    throw new Error(
      "scenario must contain exactly one start Process stimulus",
    );
  }
  verifyProducerProjection(evidence, start.instanceId);
  return artifactSet;
}

async function readArtifactSet(
  projectRoot: string,
  artifactCase: ArtifactCase,
  context: ArtifactContext,
): Promise<ArtifactSet> {
  const scenarioPath = resolveInside(
    projectRoot,
    artifactCase.scenarioRelativePath,
  );
  const evidencePath = resolveInside(
    projectRoot,
    artifactCase.evidenceRelativePath,
  );
  const scenarioDocument = await readJsonDocument<Scenario>(
    scenarioPath,
  );
  const evidenceDocument = await readJsonDocument<CibSevenEvidence>(
    evidencePath,
  );
  const profilePath = resolveInside(
    projectRoot,
    `profiles/${scenarioDocument.value.profile}/profile.json`,
  );
  const bpmnPath = resolveInside(
    projectRoot,
    scenarioDocument.value.bpmn.relativePath,
  );
  const [profileDocument, bpmnBytes] = await Promise.all([
    readJsonDocument<SemanticProfile>(profilePath),
    readFile(bpmnPath),
  ]);
  return verifyArtifactSet({
    ...artifactCase,
    validator: context.validator,
    registeredRelationshipIds: context.registeredRelationshipIds,
    profile: profileDocument.value,
    profileBytes: profileDocument.bytes,
    scenario: scenarioDocument.value,
    scenarioBytes: scenarioDocument.bytes,
    evidence: evidenceDocument.value,
    bpmnBytes,
  });
}

export async function readAndVerifyArtifactSets(
  projectRoot: string,
): Promise<ReadonlyArray<ArtifactSet>> {
  const [validator, registeredRelationshipIds] = await Promise.all([
    validatorFor(projectRoot),
    readRegisteredRelationshipIds(projectRoot),
  ]);
  return Promise.all(
    artifactCases.map((artifactCase) =>
      readArtifactSet(projectRoot, artifactCase, {
        validator,
        registeredRelationshipIds,
      }),
    ),
  );
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  process.stdout.write(
    `verified ${artifactSets.length} scenario/evidence artifact sets\n`,
  );
}

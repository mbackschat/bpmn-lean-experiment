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
import { verifyConfiguredTaskProfileBinding } from "./configured-task-profile-consistency.ts";
import {
  verifyServiceTaskIncidentArtifactBinding,
} from "./service-task-incident-profile-consistency.ts";
export { compareCanonicalStrings } from "./contract-artifact-consistency.ts";
import {
  artifactCases,
  normativeArtifactCases,
} from "./contract-artifact-cases.ts";
import type {
  ArtifactCase,
  NormativeArtifactCase,
} from "./contract-artifact-cases.ts";
import {
  verifyProducerProjection,
} from "./contract-cib-evidence-projection.ts";
import { Ajv2020 } from "ajv/dist/2020.js";
import type {
  AnySchema,
} from "ajv/dist/2020.js";

import type {
  CheckedProcess,
  ProcessStartStimulus,
  Scenario,
  SemanticProcessProgram,
  Stimulus,
} from "../packages/semantic-core/src/index.ts";
import type {
  CibSevenEvidence,
} from "./contract-cib-evidence.ts";
export type {
  CibSevenEvidence,
  EffectJob,
  EffectJobSnapshot,
  IncidentJob,
  IncidentJobSnapshot,
  MappingExecutionSnapshot,
  MessageSubscriptionEvidence,
  ProcessVariableSnapshot,
  TaskQueryTask,
  TimerJob,
} from "./contract-cib-evidence.ts";

import {
  parseStrictJson,
} from "./strict-json.ts";

const schemaBaseId = "https://bpmn-lean.local/schemas";
const scenarioSchemaId = `${schemaBaseId}/scenario.schema.json`;
const evidenceSchemaId = `${schemaBaseId}/cibseven-evidence.schema.json`;
const profileSchemaId = `${schemaBaseId}/semantic-profile.schema.json`;
const checkedProcessSchemaId = `${schemaBaseId}/checked-process.schema.json`;
const semanticProcessSchemaId = `${schemaBaseId}/semantic-process.schema.json`;

type JsonDocument<Value> = Readonly<{
  bytes: Buffer;
  value: Value;
}>;

type SemanticProfileBase = Readonly<{
  kind: "semanticProfile";
  id: string;
  bpmn: Readonly<{
    relationships: ReadonlyArray<string>;
  }>;
  observations: ReadonlyArray<string>;
  effectBindings?: unknown;
}>;

type CibSemanticProfile = SemanticProfileBase & Readonly<{
  oracle: Readonly<{
    version: string;
    revision: string;
  }>;
  environment: Readonly<Record<string, unknown>>;
}>;

type NormativeSemanticProfile = SemanticProfileBase & Readonly<{
  normativeAuthority: Readonly<{
    name: string;
    version: string;
    references: ReadonlyArray<string>;
  }>;
}>;

type SemanticProfile = CibSemanticProfile | NormativeSemanticProfile;

export type DefinitionArtifacts = Readonly<{
  checkedProcess: CheckedProcess;
  semanticProcess: SemanticProcessProgram;
}>;

export type ArtifactSet = ArtifactCase & Readonly<{
  validator: Ajv2020;
  registeredRelationshipIds: ReadonlySet<string>;
  profile: CibSemanticProfile;
  profileBytes: Buffer;
  scenario: Scenario;
  scenarioBytes: Buffer;
  evidence: CibSevenEvidence;
  bpmnBytes: Buffer;
}>;

export type NormativeArtifactSet =
  NormativeArtifactCase & Readonly<{
    validator: Ajv2020;
    registeredRelationshipIds: ReadonlySet<string>;
    profile: NormativeSemanticProfile;
    scenario: Scenario;
    scenarioBytes: Buffer;
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
    "bpmn-source-overlay.schema.json",
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
    sourceOverlay: semanticProcess.identity.sourceOverlay,
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
  verifyProfile(
    validator,
    registeredRelationshipIds,
    profile,
  );
  verifyScenarioSourceBinding(
    validator,
    profile,
    scenario,
    scenarioBytes,
    bpmnBytes,
  );
  validateWith(validator, evidenceSchemaId, "evidence", evidence);

  if (evidence.scenario.id !== scenario.id) {
    throw new Error("evidence scenario identity does not match");
  }
  if (evidence.scenario.sha256 !== sha256(scenarioBytes)) {
    throw new Error("evidence scenario digest does not match");
  }
  if (evidence.profile.id !== scenario.profile) {
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
  const start = scenario.stimuli[0];
  if (start?.kind !== "startProcess") {
    throw new Error("verified scenario omitted its start Process stimulus");
  }
  verifyProducerProjection(evidence, start.instanceId);
  return artifactSet;
}

function verifyProfile(
  validator: Ajv2020,
  registeredRelationshipIds: ReadonlySet<string>,
  profile: SemanticProfile,
): void {
  validateWith(validator, profileSchemaId, "profile", profile);
  verifyConfiguredTaskProfileBinding(profile);
  verifyServiceTaskIncidentArtifactBinding(profile);
  for (const relationshipId of profile.bpmn.relationships) {
    if (!registeredRelationshipIds.has(relationshipId)) {
      throw new Error(
        `profile references unknown CIB-BPMN relationship: ${relationshipId}`,
      );
    }
  }
}

function verifyScenarioSourceBinding(
  validator: Ajv2020,
  profile: SemanticProfile,
  scenario: Scenario,
  scenarioBytes: Buffer,
  bpmnBytes: Buffer,
): void {
  validateWith(validator, scenarioSchemaId, "scenario", scenario);
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
  if (profile.id !== scenario.profile) {
    throw new Error("profile identity does not match scenario");
  }
  verifyServiceTaskIncidentArtifactBinding(profile, scenario);
  if (
    !scenario.observations.every((observation) =>
      profile.observations.includes(observation),
    )
  ) {
    throw new Error("scenario requests an observation outside its profile");
  }
  if (scenario.bpmn.sha256 !== sha256(bpmnBytes)) {
    throw new Error("BPMN resource digest does not match scenario");
  }
  const startStimuli = scenario.stimuli.filter(isProcessStartStimulus);
  if (startStimuli.length !== 1) {
    throw new Error(
      "scenario must contain exactly one Process start stimulus",
    );
  }
}

function isProcessStartStimulus(
  stimulus: Stimulus,
): stimulus is ProcessStartStimulus {
  switch (stimulus.kind) {
    case "startProcess":
    case "triggerMessageStart":
    case "triggerTimerStart":
      return true;
    case "completeUserTaskInstance":
    case "deliverMessage":
    case "fireTimer":
    case "completeEffect":
    case "reportEffectFailure":
    case "retryIncident":
    case "cancelIncidentProcess":
      return false;
    default: {
      const unsupported: never = stimulus;
      throw new TypeError(
        `unsupported scenario stimulus: ${JSON.stringify(unsupported)}`,
      );
    }
  }
}

export function verifyNormativeArtifactSet(
  artifactSet: NormativeArtifactSet,
): NormativeArtifactSet {
  verifyProfile(
    artifactSet.validator,
    artifactSet.registeredRelationshipIds,
    artifactSet.profile,
  );
  verifyScenarioSourceBinding(
    artifactSet.validator,
    artifactSet.profile,
    artifactSet.scenario,
    artifactSet.scenarioBytes,
    artifactSet.bpmnBytes,
  );
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
    readJsonDocument<CibSemanticProfile>(profilePath),
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

async function readNormativeArtifactSet(
  projectRoot: string,
  artifactCase: NormativeArtifactCase,
  context: ArtifactContext,
): Promise<NormativeArtifactSet> {
  const scenarioPath = resolveInside(
    projectRoot,
    artifactCase.scenarioRelativePath,
  );
  const scenarioDocument = await readJsonDocument<Scenario>(
    scenarioPath,
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
    readJsonDocument<NormativeSemanticProfile>(profilePath),
    readFile(bpmnPath),
  ]);
  return verifyNormativeArtifactSet({
    ...artifactCase,
    validator: context.validator,
    registeredRelationshipIds: context.registeredRelationshipIds,
    profile: profileDocument.value,
    scenario: scenarioDocument.value,
    scenarioBytes: scenarioDocument.bytes,
    bpmnBytes,
  });
}

export async function readAndVerifyNormativeArtifactSets(
  projectRoot: string,
): Promise<ReadonlyArray<NormativeArtifactSet>> {
  const [validator, registeredRelationshipIds] = await Promise.all([
    validatorFor(projectRoot),
    readRegisteredRelationshipIds(projectRoot),
  ]);
  return Promise.all(
    normativeArtifactCases.map((artifactCase) =>
      readNormativeArtifactSet(projectRoot, artifactCase, {
        validator,
        registeredRelationshipIds,
      }),
    ),
  );
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const [artifactSets, normativeArtifactSets] = await Promise.all([
    readAndVerifyArtifactSets(projectRoot),
    readAndVerifyNormativeArtifactSets(projectRoot),
  ]);
  process.stdout.write(
    `verified ${artifactSets.length} scenario/evidence artifact sets and ${normativeArtifactSets.length} normative scenario/profile sets\n`,
  );
}

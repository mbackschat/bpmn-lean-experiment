import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  artifactCases,
  normativeArtifactCases,
} from "./contract-artifact-cases.ts";
import type {
  ArtifactCase,
  NormativeArtifactCase,
} from "./contract-artifact-cases.ts";
import { verifyCanonicalBindingOrder } from "./scenario-binding-order.ts";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import type {
  AnySchema,
} from "ajv/dist/2020.js";

import type {
  CibSevenEvidence,
} from "./contract-cib-evidence.ts";
export type { CibSevenEvidence } from "./contract-cib-evidence.ts";

import {
  parseWireJsonBytes,
} from "./strict-json.ts";

/**
 * A scenario as the artifact reader sees it: only the members this module and its tests read.
 * `contracts/schemas/scenario.schema.json` owns the whole shape, and every value read here has passed it.
 */
export type ScenarioDocument = Readonly<{
  kind: "scenario";
  id: string;
  profile: string;
  bpmn: Readonly<{
    id: string;
    relativePath: string;
    sha256: string;
    sourceOverlay: unknown;
  }>;
  stimuli: ReadonlyArray<Readonly<{ kind: string; commandId: string } & Record<string, unknown>>>;
  options?: Readonly<{ incidents?: Readonly<{ cancellable: boolean }> }>;
  provenance: Readonly<{
    normativeRefs: ReadonlyArray<string>;
    cibRevision: string;
    cibRefs: ReadonlyArray<string>;
  }>;
}>;

const schemaBaseId = "https://bpmn-lean.local/schemas";
const scenarioSchemaId = `${schemaBaseId}/scenario.schema.json`;
const evidenceSchemaId = `${schemaBaseId}/cibseven-evidence.schema.json`;
const profileSchemaId = `${schemaBaseId}/semantic-profile.schema.json`;

type JsonDocument<Value> = Readonly<{
  bytes: Buffer;
  value: Value;
}>;

/**
 * A profile as the artifact reader sees it: the members this module and its tests read.
 * `contracts/schemas/semantic-profile.schema.json` owns the whole shape, and every value read here has passed it.
 */
type SemanticProfile = Readonly<{
  kind: "semanticProfile";
  id: string;
  bpmn: Readonly<{
    relationships: ReadonlyArray<string>;
  }>;
  normativeAuthority: Readonly<{
    name: string;
    version: string;
    references: ReadonlyArray<string>;
  }>;
  // A profile claims an oracle only while retained CIB evidence binds it (the schema ties both members together).
  oracle?: Readonly<{
    version: string;
    revision: string;
  }>;
  environment?: Readonly<Record<string, unknown>>;
}>;

export type ArtifactSet = ArtifactCase & Readonly<{
  validator: Ajv2020;
  registeredRelationshipIds: ReadonlySet<string>;
  profile: SemanticProfile;
  profileBytes: Buffer;
  scenario: ScenarioDocument;
  scenarioBytes: Buffer;
  evidence: CibSevenEvidence;
  bpmnBytes: Buffer;
}>;

export type NormativeArtifactSet =
  NormativeArtifactCase & Readonly<{
    validator: Ajv2020;
    registeredRelationshipIds: ReadonlySet<string>;
    profile: SemanticProfile;
    scenario: ScenarioDocument;
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
    value: parseWireJsonBytes<Value>(bytes, filePath),
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

/** The validator of `cibseven-evidence.schema.json` with the schemas it references. */
export async function scenarioEvidenceValidator(projectRoot: string): Promise<ValidateFunction> {
  const validate = (await validatorFor(projectRoot)).getSchema(evidenceSchemaId);
  if (validate === undefined) throw new Error(`schema is not registered: ${evidenceSchemaId}`);
  return validate;
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
  if (profile.oracle === undefined) {
    throw new Error("retained evidence binds a profile without an oracle");
  }
  if (
    evidence.producer.engineVersion !== profile.oracle.version ||
    evidence.producer.engineRevision !== profile.oracle.revision ||
    evidence.producer.engineRevision !== scenario.provenance.cibRevision
  ) {
    throw new Error("CIB revision does not match across artifacts");
  }
  return artifactSet;
}

function verifyProfile(
  validator: Ajv2020,
  registeredRelationshipIds: ReadonlySet<string>,
  profile: SemanticProfile,
): void {
  validateWith(validator, profileSchemaId, "profile", profile);
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
  scenario: ScenarioDocument,
  scenarioBytes: Buffer,
  bpmnBytes: Buffer,
): void {
  validateWith(validator, scenarioSchemaId, "scenario", scenario);
  verifyCanonicalBindingOrder(scenario);
  if (
    !isDeepStrictEqual(
      parseWireJsonBytes<ScenarioDocument>(
        scenarioBytes,
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
  if (scenario.bpmn.sha256 !== sha256(bpmnBytes)) {
    throw new Error("BPMN resource digest does not match scenario");
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
  const scenarioDocument = await readJsonDocument<ScenarioDocument>(
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

async function readNormativeArtifactSet(
  projectRoot: string,
  artifactCase: NormativeArtifactCase,
  context: ArtifactContext,
): Promise<NormativeArtifactSet> {
  const scenarioPath = resolveInside(
    projectRoot,
    artifactCase.scenarioRelativePath,
  );
  const scenarioDocument = await readJsonDocument<ScenarioDocument>(
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
    readJsonDocument<SemanticProfile>(profilePath),
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

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const schemaBaseId = "https://bpmn-lean.local/schemas";
const scenarioSchemaId = `${schemaBaseId}/scenario.schema.json`;
const evidenceSchemaId = `${schemaBaseId}/cibseven-evidence.schema.json`;
const profileSchemaId = `${schemaBaseId}/semantic-profile.schema.json`;

export const artifactCases = Object.freeze([
  Object.freeze({
    scenarioRelativePath:
      "scenarios/m0-sequential-user-task/scenario.json",
    evidenceRelativePath:
      "scenarios/m0-sequential-user-task/cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/m1-user-task-discovery-completion/scenario.json",
    evidenceRelativePath:
      "scenarios/m1-user-task-discovery-completion/cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/m1-user-task-discovery-completion/wrong-activation.scenario.json",
    evidenceRelativePath:
      "scenarios/m1-user-task-discovery-completion/wrong-activation.cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/m1-user-task-discovery-completion/stale-completion.scenario.json",
    evidenceRelativePath:
      "scenarios/m1-user-task-discovery-completion/stale-completion.cibseven-evidence.json",
  }),
]);

const validatorsByRoot = new Map();

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function resolveInside(projectRoot, relativePath) {
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

async function readJsonDocument(filePath) {
  const bytes = await readFile(filePath);
  return {
    bytes,
    value: JSON.parse(bytes.toString("utf8")),
  };
}

async function createValidator(projectRoot) {
  const schemaDirectory = resolveInside(projectRoot, "contracts/schemas");
  const schemaNames = [
    "scenario.schema.json",
    "canonical-result-v0.1.schema.json",
    "canonical-result-v0.2.schema.json",
    "semantic-profile.schema.json",
    "cibseven-evidence.schema.json",
  ];
  const schemas = await Promise.all(
    schemaNames.map(async (name) => {
      const document = await readJsonDocument(path.join(schemaDirectory, name));
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

async function validatorFor(projectRoot) {
  const resolvedRoot = path.resolve(projectRoot);
  let validatorPromise = validatorsByRoot.get(resolvedRoot);
  if (validatorPromise === undefined) {
    validatorPromise = createValidator(resolvedRoot);
    validatorsByRoot.set(resolvedRoot, validatorPromise);
  }
  return validatorPromise;
}

function validateWith(validator, schemaId, label, value) {
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

export function verifyArtifactSet(artifactSet) {
  const {
    validator,
    profile,
    scenario,
    scenarioBytes,
    evidence,
    bpmnBytes,
  } = artifactSet;
  validateWith(validator, profileSchemaId, "profile", profile);
  validateWith(validator, scenarioSchemaId, "scenario", scenario);
  validateWith(validator, evidenceSchemaId, "evidence", evidence);

  if (!isDeepStrictEqual(JSON.parse(scenarioBytes.toString("utf8")), scenario)) {
    throw new Error("scenario value does not match its exact source bytes");
  }
  if (evidence.scenario.id !== scenario.id) {
    throw new Error("evidence scenario identity does not match");
  }
  if (evidence.scenario.sha256 !== sha256(scenarioBytes)) {
    throw new Error("evidence scenario digest does not match");
  }
  if (profile.id !== scenario.profile || evidence.profile !== scenario.profile) {
    throw new Error("profile identity does not match across artifacts");
  }
  if (
    evidence.traceSchemaVersion !== scenario.traceSchemaVersion ||
    evidence.projection.version !== scenario.traceSchemaVersion
  ) {
    throw new Error("trace projection version does not match scenario");
  }
  if (
    evidence.producer.engineRevision !== profile.oracle.revision ||
    evidence.producer.engineRevision !== scenario.provenance.cibRevision
  ) {
    throw new Error("CIB revision does not match across artifacts");
  }
  if (!isDeepStrictEqual(profile.observations, scenario.observations)) {
    throw new Error("profile observations do not match scenario");
  }
  if (scenario.bpmn.sha256 !== sha256(bpmnBytes)) {
    throw new Error("BPMN resource digest does not match scenario");
  }
  return artifactSet;
}

async function readArtifactSet(projectRoot, artifactCase, validator) {
  const scenarioPath = resolveInside(
    projectRoot,
    artifactCase.scenarioRelativePath,
  );
  const evidencePath = resolveInside(
    projectRoot,
    artifactCase.evidenceRelativePath,
  );
  const scenarioDocument = await readJsonDocument(scenarioPath);
  const evidenceDocument = await readJsonDocument(evidencePath);
  const profilePath = resolveInside(
    projectRoot,
    `profiles/${scenarioDocument.value.profile}/profile.json`,
  );
  const bpmnPath = resolveInside(
    projectRoot,
    scenarioDocument.value.bpmn.relativePath,
  );
  const [profileDocument, bpmnBytes] = await Promise.all([
    readJsonDocument(profilePath),
    readFile(bpmnPath),
  ]);
  return verifyArtifactSet({
    ...artifactCase,
    validator,
    profile: profileDocument.value,
    scenario: scenarioDocument.value,
    scenarioBytes: scenarioDocument.bytes,
    evidence: evidenceDocument.value,
    bpmnBytes,
  });
}

export async function readAndVerifyArtifactSets(projectRoot) {
  const validator = await validatorFor(projectRoot);
  return Promise.all(
    artifactCases.map((artifactCase) =>
      readArtifactSet(projectRoot, artifactCase, validator),
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

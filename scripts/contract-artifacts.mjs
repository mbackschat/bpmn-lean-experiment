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
    "canonical-result.schema.json",
    "semantic-profile.schema.json",
    "cibseven-evidence.schema.json",
    "checked-process.schema.json",
    "semantic-process.schema.json",
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

async function readRegisteredRelationshipIds(projectRoot) {
  const registerPath = resolveInside(projectRoot, "docs/CIB-BPMN-RELATION-REGISTER.md");
  const register = await readFile(registerPath, "utf8");
  return new Set(
    Array.from(
      register.matchAll(
        /^### (CIB-(?:AGR|OP|INT|EXT|CFG|LIM|DEV)-[0-9]{4})\b/gm,
      ),
      (match) => match[1],
    ),
  );
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

function compareIds(left, right) {
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}

function requireSortedById(label, values) {
  const sorted = [...values].sort(compareIds);
  if (!isDeepStrictEqual(values, sorted)) {
    throw new Error(`${label} must be sorted by id`);
  }
}

function requireSortedStrings(label, values) {
  const sorted = [...values].sort();
  if (!isDeepStrictEqual(values, sorted)) {
    throw new Error(`${label} must be sorted`);
  }
}

function requireUniqueIds(label, values) {
  const ids = new Set();
  for (const value of values) {
    if (ids.has(value.id)) {
      throw new Error(`${label} contains duplicate id ${value.id}`);
    }
    ids.add(value.id);
  }
  return ids;
}

function referencedControlPlaces(operation) {
  switch (operation.kind) {
    case "initiate":
      return [operation.output];
    case "awaitUserTask":
      return [operation.input, operation.output];
    case "duplicate":
      return [operation.input, ...operation.outputs];
    case "synchronize":
      return [...operation.inputs, operation.output];
    case "terminate":
      return [operation.input];
    default:
      throw new Error(`unsupported semantic operation: ${operation.kind}`);
  }
}

function verifyCanonicalDefinitionOrder(checkedProcess, semanticProcess) {
  requireSortedById("checked process nodes", checkedProcess.nodes);
  requireSortedById(
    "checked process sequence flows",
    checkedProcess.sequenceFlows,
  );
  requireSortedById(
    "semantic process control places",
    semanticProcess.controlPlaces,
  );
  requireSortedById(
    "semantic process operations",
    semanticProcess.operations,
  );
  for (const operation of semanticProcess.operations) {
    switch (operation.kind) {
      case "duplicate":
        requireSortedStrings(
          `operation ${operation.id} outputs`,
          operation.outputs,
        );
        break;
      case "synchronize":
        requireSortedStrings(`operation ${operation.id} inputs`, operation.inputs);
        break;
      case "initiate":
      case "awaitUserTask":
      case "terminate":
        break;
      default:
        throw new Error(`unsupported semantic operation: ${operation.kind}`);
    }
  }
}

function verifyDefinitionReferences(checkedProcess, semanticProcess) {
  const nodeIds = requireUniqueIds("checked process nodes", checkedProcess.nodes);
  const flowIds = requireUniqueIds(
    "checked process sequence flows",
    checkedProcess.sequenceFlows,
  );
  for (const flow of checkedProcess.sequenceFlows) {
    if (!nodeIds.has(flow.sourceId)) {
      throw new Error(
        `checked process flow ${flow.id} references unknown source node ${flow.sourceId}`,
      );
    }
    if (!nodeIds.has(flow.targetId)) {
      throw new Error(
        `checked process flow ${flow.id} references unknown target node ${flow.targetId}`,
      );
    }
  }

  const placeIds = requireUniqueIds(
    "semantic process control places",
    semanticProcess.controlPlaces,
  );
  requireUniqueIds("semantic process operations", semanticProcess.operations);
  for (const place of semanticProcess.controlPlaces) {
    if (!flowIds.has(place.origin.elementId)) {
      throw new Error(
        `control place ${place.id} references unknown Sequence Flow origin ${place.origin.elementId}`,
      );
    }
  }
  for (const operation of semanticProcess.operations) {
    if (!nodeIds.has(operation.origin.elementId)) {
      throw new Error(
        `operation ${operation.id} references unknown BPMN element origin ${operation.origin.elementId}`,
      );
    }
    for (const placeId of referencedControlPlaces(operation)) {
      if (!placeIds.has(placeId)) {
        throw new Error(
          `operation ${operation.id} references unknown control place ${placeId}`,
        );
      }
    }
    if (
      operation.kind === "awaitUserTask" &&
      operation.task.elementId !== operation.origin.elementId
    ) {
      throw new Error(
        `operation ${operation.id} task identity differs from its BPMN origin`,
      );
    }
  }
}

function verifyProducerTaskProjection(evidence) {
  const snapshots = evidence.producerObservations.taskQueries;
  const states = [];
  let afterCommandId;
  for (const observation of evidence.result.trace) {
    switch (observation.kind) {
      case "deployment":
        break;
      case "command":
        afterCommandId = observation.commandId;
        break;
      case "state":
        if (afterCommandId === undefined) {
          throw new Error(
            "canonical state has no preceding command observation",
          );
        }
        states.push({ afterCommandId, observation });
        afterCommandId = undefined;
        break;
      default:
        throw new Error(
          `unsupported canonical observation: ${observation.kind}`,
        );
    }
  }
  if (states.length !== snapshots.length) {
    throw new Error(
      "producer task-query count does not match canonical state count",
    );
  }

  for (const [index, state] of states.entries()) {
    const snapshot = snapshots[index];
    if (snapshot.afterCommandId !== state.afterCommandId) {
      throw new Error(
        "producer task query is bound to a different command",
      );
    }
    const projected = projectTaskQuery(
      state.observation.instanceId,
      snapshot.tasks,
    );
    for (const field of [
      "activeWaits",
      "openUserTasks",
      "enabledInteractions",
    ]) {
      if (!isDeepStrictEqual(state.observation[field], projected[field])) {
        throw new Error(
          `producer task query projection does not match canonical ${field}`,
        );
      }
    }
  }
}

function projectTaskQuery(instanceId, tasks) {
  const multiplicities = new Map();
  const byElement = new Map();
  for (const task of tasks) {
    multiplicities.set(
      task.elementId,
      (multiplicities.get(task.elementId) ?? 0) + 1,
    );
    if (byElement.has(task.elementId)) {
      throw new Error(
        `producer task query repeats unsupported element ${task.elementId}`,
      );
    }
    byElement.set(task.elementId, task);
  }
  const activeWaits = [...multiplicities.entries()]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([elementId, multiplicity]) => ({
      elementId,
      kind: "userTask",
      multiplicity,
    }));
  const openUserTasks = [...byElement.values()]
    .map((task) => ({
      id: {
        processInstanceId: instanceId,
        elementId: task.elementId,
        activation: 1,
      },
      name: task.name,
      state: "active",
    }))
    .sort((left, right) =>
      compareTaskIdentities(left.id, right.id)
    );
  return {
    activeWaits,
    openUserTasks,
    enabledInteractions: openUserTasks.map((task) => ({
      kind: "completeUserTaskInstance",
      taskId: task.id,
    })),
  };
}

function compareTaskIdentities(left, right) {
  for (const field of ["processInstanceId", "elementId"]) {
    const comparison = compareStrings(left[field], right[field]);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return left.activation - right.activation;
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function verifyDefinitionArtifacts(projectRoot, artifacts) {
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

export function verifyArtifactSet(artifactSet) {
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

  if (!isDeepStrictEqual(JSON.parse(scenarioBytes.toString("utf8")), scenario)) {
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
  verifyProducerTaskProjection(evidence);
  return artifactSet;
}

async function readArtifactSet(projectRoot, artifactCase, context) {
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

export async function readAndVerifyArtifactSets(projectRoot) {
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

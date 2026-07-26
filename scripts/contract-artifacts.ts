import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    revision: string;
  }>;
  bpmn: Readonly<{
    relationships: ReadonlyArray<string>;
  }>;
  observations: ReadonlyArray<string>;
}>;

type TaskQueryTask = Readonly<{
  elementId: string;
  name: string | null;
}>;

type TaskQuerySnapshot = Readonly<{
  afterCommandId: string;
  tasks: ReadonlyArray<TaskQueryTask>;
}>;

type TimerJob = Readonly<{
  elementId: string;
  dueDateDeltaMs: number;
  executable: boolean;
}>;

type TimerJobSnapshot = Readonly<{
  afterCommandId: string;
  jobs: ReadonlyArray<TimerJob>;
}>;

type EffectJob = Readonly<{
  elementId: string;
  activation: number;
  protocol: EffectDescriptor["protocol"];
  handler: EffectDescriptor["handler"];
  retries: number;
  executable: boolean;
  dueDatePresent: boolean;
}>;

type EffectJobSnapshot = Readonly<{
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

type CibSevenEvidence = Readonly<{
  kind: "cibSevenScenarioEvidence";
  scenario: ContentIdentity;
  profile: ContentIdentity;
  producer: Readonly<{
    engineRevision: string;
  }>;
  producerObservations: Readonly<{
    taskQueries: ReadonlyArray<TaskQuerySnapshot>;
    timerJobs: ReadonlyArray<TimerJobSnapshot>;
    effectJobs?: ReadonlyArray<EffectJobSnapshot>;
    effectExecutions?: ReadonlyArray<EffectExecutionSnapshot>;
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

function compareIds(
  left: Readonly<{ id: string }>,
  right: Readonly<{ id: string }>,
): number {
  return compareCanonicalStrings(left.id, right.id);
}

function requireSortedById<Value extends Readonly<{ id: string }>>(
  label: string,
  values: ReadonlyArray<Value>,
): void {
  const sorted = [...values].sort(compareIds);
  if (!isDeepStrictEqual(values, sorted)) {
    throw new Error(`${label} must be sorted by id`);
  }
}

function requireSortedStrings(
  label: string,
  values: ReadonlyArray<string>,
): void {
  const sorted = [...values].sort(compareCanonicalStrings);
  if (!isDeepStrictEqual(values, sorted)) {
    throw new Error(`${label} must be sorted`);
  }
}

function requireUniqueIds<Value extends Readonly<{ id: string }>>(
  label: string,
  values: ReadonlyArray<Value>,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) {
      throw new Error(`${label} contains duplicate id ${value.id}`);
    }
    ids.add(value.id);
  }
  return ids;
}

function referencedControlPlaces(
  operation: SemanticOperation,
): ReadonlyArray<string> {
  switch (operation.kind) {
    case "initiate":
      return [operation.output];
    case "awaitUserTask":
    case "awaitTimer":
    case "awaitEffect":
      return [operation.input, operation.output];
    case "duplicate":
      return [operation.input, ...operation.outputs];
    case "synchronize":
      return [...operation.inputs, operation.output];
    case "terminate":
      return [operation.input];
    default:
      throw new Error("unsupported semantic operation");
  }
}

function verifyCanonicalDefinitionOrder(
  checkedProcess: CheckedProcess,
  semanticProcess: SemanticProcessProgram,
): void {
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
      case "awaitTimer":
      case "awaitEffect":
      case "terminate":
        break;
      default:
        throw new Error("unsupported semantic operation");
    }
  }
}

function verifyDefinitionReferences(
  checkedProcess: CheckedProcess,
  semanticProcess: SemanticProcessProgram,
): void {
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
    if (
      operation.kind === "awaitTimer" &&
      operation.timer.elementId !== operation.origin.elementId
    ) {
      throw new Error(
        `operation ${operation.id} timer identity differs from its BPMN origin`,
      );
    }
    if (
      operation.kind === "awaitEffect" &&
      operation.effect.elementId !== operation.origin.elementId
    ) {
      throw new Error(
        `operation ${operation.id} effect identity differs from its BPMN origin`,
      );
    }
  }
}

function verifyProducerProjection(evidence: CibSevenEvidence): void {
  const taskSnapshots = evidence.producerObservations.taskQueries;
  const timerSnapshots = evidence.producerObservations.timerJobs;
  const effectSnapshots =
    evidence.producerObservations.effectJobs ??
    statesWithEmptyEffectSnapshots(evidence.result.trace);
  const states: Array<Readonly<{
    afterCommandId: string;
    observation: StateObservation;
  }>> = [];
  let afterCommandId: string | undefined;
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
          "unsupported canonical observation",
        );
    }
  }
  if (
    states.length !== taskSnapshots.length ||
    states.length !== timerSnapshots.length ||
    states.length !== effectSnapshots.length
  ) {
    throw new Error(
      "producer observation count does not match canonical state count",
    );
  }

  for (const [index, state] of states.entries()) {
    const taskSnapshot = taskSnapshots[index];
    const timerSnapshot = timerSnapshots[index];
    const effectSnapshot = effectSnapshots[index];
    if (
      taskSnapshot === undefined ||
      timerSnapshot === undefined ||
      effectSnapshot === undefined
    ) {
      throw new Error("producer observation omitted one state snapshot");
    }
    if (
      taskSnapshot.afterCommandId !== state.afterCommandId ||
      timerSnapshot.afterCommandId !== state.afterCommandId ||
      effectSnapshot.afterCommandId !== state.afterCommandId
    ) {
      throw new Error(
        "producer observation is bound to a different command",
      );
    }
    const taskProjection = projectTaskQuery(
      state.observation.instanceId,
      taskSnapshot.tasks,
    );
    const timerProjection = projectTimerJobs(
      state.observation.instanceId,
      timerSnapshot.jobs,
    );
    const effectProjection = projectEffectJobs(
      state.observation.instanceId,
      effectSnapshot.jobs,
    );
    const activeWaits = [
      ...taskProjection.activeWaits,
      ...timerProjection.activeWaits,
      ...effectProjection.activeWaits,
    ].sort((left, right) =>
      compareStrings(left.elementId, right.elementId));
    const expectedByField: Pick<
      StateObservation,
      | "activeWaits"
      | "openUserTasks"
      | "openTimers"
      | "openEffects"
      | "enabledInteractions"
    > = {
      activeWaits,
      openUserTasks: taskProjection.openUserTasks,
      openTimers: timerProjection.openTimers,
      openEffects: effectProjection.openEffects,
      enabledInteractions: taskProjection.enabledInteractions,
    };
    for (
      const field of Object.keys(expectedByField) as Array<
        keyof typeof expectedByField
      >
    ) {
      const expected = expectedByField[field];
      if (!isDeepStrictEqual(state.observation[field], expected)) {
        throw new Error(
          `producer observation projection does not match canonical ${field}`,
        );
      }
    }
  }

  const effectExecutions =
    evidence.producerObservations.effectExecutions ?? [];
  if (effectExecutions.length > 0) {
    const execution = effectExecutions[0];
    if (
      effectExecutions.length !== 1 ||
      execution === undefined ||
      execution.schedule !== "plainSuccess" ||
      execution.invocations !== 1 ||
      execution.mutations !== 1 ||
      execution.initialRetries !== 3 ||
      execution.retriesAfterFirstFailure !== null
    ) {
      throw new Error(
        "retained CIB effect evidence must bind to plain success",
      );
    }
  }
}

function statesWithEmptyEffectSnapshots(
  trace: ReadonlyArray<CanonicalObservation>,
): ReadonlyArray<EffectJobSnapshot> {
  const snapshots: Array<EffectJobSnapshot> = [];
  let afterCommandId: string | undefined;
  for (const observation of trace) {
    if (observation.kind === "command") {
      afterCommandId = observation.commandId;
    } else if (
      observation.kind === "state" &&
      afterCommandId !== undefined
    ) {
      snapshots.push({ afterCommandId, jobs: [] });
      afterCommandId = undefined;
    }
  }
  return snapshots;
}

function projectEffectJobs(
  instanceId: string,
  jobs: ReadonlyArray<EffectJob>,
): Pick<StateObservation, "activeWaits" | "openEffects"> {
  const activeWaits: Array<StateObservation["activeWaits"][number]> =
    jobs.map((job) => ({
    elementId: job.elementId,
    kind: "effect" as StateObservation["activeWaits"][number]["kind"],
    multiplicity: 1,
  }));
  const openEffects = jobs.map((job) => ({
    id: {
      processInstanceId: instanceId,
      elementId: job.elementId,
      activation: job.activation,
    },
    descriptor: {
      protocol: job.protocol,
      handler: job.handler,
    },
  }));
  return { activeWaits, openEffects };
}

function projectTimerJobs(
  instanceId: string,
  jobs: ReadonlyArray<TimerJob>,
): Pick<StateObservation, "activeWaits" | "openTimers"> {
  const activeWaits: Array<StateObservation["activeWaits"][number]> =
    jobs
    .map((job) => ({
      elementId: job.elementId,
      kind: "timer" as StateObservation["activeWaits"][number]["kind"],
      multiplicity: 1,
    }))
    .sort((left, right) =>
      compareStrings(left.elementId, right.elementId));
  const openTimers = jobs
    .map((job) => ({
      id: {
        processInstanceId: instanceId,
        elementId: job.elementId,
        activation: 1,
      },
      deadlineMs: job.dueDateDeltaMs,
    }))
    .sort((left, right) =>
      compareTaskIdentities(left.id, right.id));
  return { activeWaits, openTimers };
}

function projectTaskQuery(
  instanceId: string,
  tasks: ReadonlyArray<TaskQueryTask>,
): Pick<
  StateObservation,
  "activeWaits" | "openUserTasks" | "enabledInteractions"
> {
  const multiplicities = new Map<string, number>();
  const byElement = new Map<string, TaskQueryTask>();
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
  const activeWaits: Array<StateObservation["activeWaits"][number]> =
    [...multiplicities.entries()]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([elementId, multiplicity]) => ({
      elementId,
      kind:
        "userTask" as StateObservation["activeWaits"][number]["kind"],
      multiplicity,
    }));
  const openUserTasks: Array<StateObservation["openUserTasks"][number]> =
    [...byElement.values()]
    .map((task) => ({
      id: {
        processInstanceId: instanceId,
        elementId: task.elementId,
        activation: 1,
      },
      name: task.name,
      state:
        "active" as StateObservation["openUserTasks"][number]["state"],
    }))
    .sort((left, right) =>
      compareTaskIdentities(left.id, right.id)
    );
  return {
    activeWaits,
    openUserTasks,
    enabledInteractions: openUserTasks.map((task) => ({
      kind:
        "completeUserTaskInstance" as StateObservation[
          "enabledInteractions"
        ][number]["kind"],
      taskId: task.id,
    })),
  };
}

function compareTaskIdentities(
  left: OccurrenceId,
  right: OccurrenceId,
): number {
  for (
    const field of [
      "processInstanceId",
      "elementId",
    ] as const
  ) {
    const comparison = compareStrings(left[field], right[field]);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return left.activation - right.activation;
}

function compareStrings(left: string, right: string): number {
  return compareCanonicalStrings(left, right);
}

export function compareCanonicalStrings(
  left: string,
  right: string,
): number {
  requireUnicodeScalarString(left, "canonical string");
  requireUnicodeScalarString(right, "canonical string");
  const leftScalars = [...left];
  const rightScalars = [...right];
  const sharedLength = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftValue = leftScalars[index];
    const rightValue = rightScalars[index];
    if (leftValue === undefined || rightValue === undefined) {
      throw new Error("canonical scalar iteration lost an indexed value");
    }
    const leftScalar = leftValue.codePointAt(0);
    const rightScalar = rightValue.codePointAt(0);
    if (leftScalar === undefined || rightScalar === undefined) {
      throw new Error("canonical scalar has no code point");
    }
    if (leftScalar !== rightScalar) {
      return leftScalar < rightScalar ? -1 : 1;
    }
  }
  return Math.sign(leftScalars.length - rightScalars.length);
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
  verifyProducerProjection(evidence);
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

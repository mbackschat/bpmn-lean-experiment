import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { parseWireJsonBytes } from "./strict-json.ts";

const profileId = "bpmn-2.0.2" as const;
const initialCatchId = "MessageCatch_InitialSettlement" as const;
const correlationKeyId = "CorrelationKey_SettlementReference" as const;
const channel = Object.freeze({
  kind: "operationMessage" as const,
  interfaceId: "Interface_ClearingHouse",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_SettlementConfirmed",
});
const answerKeys = new Set([
  "answer",
  "expected",
  "expectedResult",
  "outcome",
  "result",
  "results",
  "winner",
]);

export const enginePopulationScenarioRelativePaths = Object.freeze([
  "scenarios/message-key-correlation/ambiguous.population-scenario.json",
  "scenarios/message-key-correlation/cross-definition.population-scenario.json",
  "scenarios/message-key-correlation/unique.population-scenario.json",
  "scenarios/message-key-correlation/zero.population-scenario.json",
]);

type SourceOverlayIdentity = Readonly<{
  id: string;
  sha256: string;
}>;

export type EnginePopulationBpmnResource = Readonly<{
  id: string;
  relativePath: string;
  sha256: string;
  sourceOverlay: SourceOverlayIdentity | null;
}>;

type OperationMessageChannel = typeof channel;

type OccurrenceId = Readonly<{
  processInstanceId: string;
  elementId: string;
  activation: number;
}>;

type PopulationStimulus = Readonly<{
  kind: string;
  commandId: string;
  instanceId?: string;
  startEvent?: string;
  trigger?: Readonly<{ kind: string; channel?: OperationMessageChannel }>;
  variables?: ReadonlyArray<unknown>;
  occurrence?: OccurrenceId;
  correlation?: ReadonlyArray<unknown>;
  payload?: Readonly<{ kind: string; value?: unknown }>;
}>;

type InstanceStep = Readonly<{
  kind: "instance";
  definitionRef: string;
  instanceId: string;
  stimulus: PopulationStimulus;
}>;

type Criterion = Readonly<{
  target: Readonly<{ kind: string; name?: string }>;
  expected: Readonly<{ kind: string; value?: unknown }>;
}>;

type PublishStep = Readonly<{
  kind: "publish";
  commandId: string;
  address: Readonly<{
    definition?: Readonly<{ deploymentId?: number; processKey?: string }>;
    channel?: OperationMessageChannel;
    name?: string;
  }>;
  criteria: ReadonlyArray<Criterion>;
  payload?: unknown;
  variables: ReadonlyArray<unknown>;
  businessKey?: string;
  mode: string;
  at?: number;
}>;

/** The other population steps, which the bounded Message-correlation schedule never uses. */
type OtherStep = Readonly<{ kind: "deploy" | "broadcast" | "evaluateConditions" | "timerStart"; commandId?: string }>;

export type EnginePopulationScenario = Readonly<{
  kind: "populationScenario";
  id: string;
  profile: typeof profileId;
  definitions: ReadonlyArray<Readonly<{
    definitionRef: string;
    bpmn: EnginePopulationBpmnResource;
  }>>;
  steps: ReadonlyArray<InstanceStep | PublishStep | OtherStep>;
  provenance: Readonly<{
    normativeRefs: ReadonlyArray<string>;
    cibRevision: string;
    cibRefs: ReadonlyArray<string>;
  }>;
}>;

type SemanticProfile = Readonly<{
  id: string;
  [key: string]: unknown;
}>;

export type EnginePopulationArtifacts = Readonly<{
  profile: SemanticProfile;
  scenarios: ReadonlyArray<Readonly<{
    relativePath: string;
    document: EnginePopulationScenario;
  }>>;
}>;

type Validators = Readonly<{
  profile: ValidateFunction;
  scenario: ValidateFunction;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatErrors(errors: ReadonlyArray<ErrorObject> | null | undefined): string {
  return errors?.map(({ instancePath, message }) => `${instancePath || "/"} ${message ?? "is invalid"}`).join("; ") ?? "unknown validation failure";
}

function assertNoDuplicate(label: string, values: ReadonlyArray<string>): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  if (duplicates.size > 0) {
    throw new Error(`${label} contains duplicates: ${[...duplicates].sort().join(", ")}`);
  }
}

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} is inconsistent`);
  }
}

/** The arrays of correlation criteria, whose `expected` member is the criterion's value, never an answer. */
const criteriaKeys = new Set(["correlation", "criteria"]);

function assertNoAnswerKeys(value: unknown, location = "engine population scenario"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoAnswerKeys(entry, `${location}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (criteriaKeys.has(key) && Array.isArray(child)) {
      child.forEach((entry, index) => {
        if (!isRecord(entry)) return;
        for (const [member, nested] of Object.entries(entry)) {
          if (member !== "expected") assertNoAnswerKeys({ [member]: nested }, `${location}.${key}[${index}]`);
        }
      });
      continue;
    }
    if (answerKeys.has(key)) {
      throw new Error(`engine population scenario contains answer-smuggling key ${location}.${key}`);
    }
    assertNoAnswerKeys(child, `${location}.${key}`);
  }
}

async function readJson(absolutePath: string): Promise<unknown> {
  return parseWireJsonBytes(await readFile(absolutePath), absolutePath);
}

async function readSchema(absolutePath: string): Promise<Record<string, unknown>> {
  const document = await readJson(absolutePath);
  if (!isRecord(document)) {
    throw new Error(`JSON Schema is not an object: ${absolutePath}`);
  }
  return document;
}

async function buildValidators(projectRoot: string): Promise<Validators> {
  const [scenarioSchema, populationSchema, profileSchema] = await Promise.all([
    readSchema(path.join(projectRoot, "contracts/schemas/scenario.schema.json")),
    readSchema(path.join(projectRoot, "contracts/schemas/engine-population-scenario.schema.json")),
    readSchema(path.join(projectRoot, "contracts/schemas/semantic-profile.schema.json")),
  ]);
  const ajv = new Ajv2020({ strict: true, strictTuples: false });
  ajv.addSchema(scenarioSchema);
  return Object.freeze({
    profile: new Ajv2020({ strict: true }).compile(profileSchema),
    scenario: ajv.compile(populationSchema),
  });
}

function assertProfile(profile: unknown, validate: ValidateFunction): asserts profile is SemanticProfile {
  if (!validate(profile)) {
    throw new Error(`Message key-correlation profile validation failed: ${formatErrors(validate.errors)}`);
  }
  if (!isRecord(profile) || profile.id !== profileId) {
    throw new Error(`Message key-correlation profile identity must be ${profileId}`);
  }
  const authority = profile.normativeAuthority;
  if (!isRecord(authority) || authority.name !== "OMG Business Process Model and Notation" || authority.version !== "2.0.2") {
    throw new Error("Message key-correlation profile must select BPMN 2.0.2 normative authority");
  }
  const bpmn = profile.bpmn;
  if (!isRecord(bpmn)) {
    throw new Error("Message key-correlation profile has no BPMN selection");
  }
  // The standards profile carries every relationship its scenarios cite; the correlation population selects these.
  const relationships = bpmn.relationships;
  for (const relationship of ["CIB-AGR-0001", "CIB-OP-0001", "CIB-LIM-0002"]) {
    if (!Array.isArray(relationships) || !relationships.includes(relationship)) {
      throw new Error(`Message key-correlation profile must carry ${relationship}`);
    }
  }
}

async function assertSourceBinding(projectRoot: string, definition: EnginePopulationBpmnResource): Promise<void> {
  if (path.posix.normalize(definition.relativePath) !== definition.relativePath || path.posix.isAbsolute(definition.relativePath) || definition.relativePath.startsWith("../")) {
    throw new Error(`engine population scenario definition path is not canonical: ${definition.relativePath}`);
  }
  const source = await readFile(path.join(projectRoot, definition.relativePath));
  const actualSha256 = createHash("sha256").update(source).digest("hex");
  if (definition.sha256 !== actualSha256) {
    throw new Error(`engine population scenario definition SHA differs for ${definition.id}`);
  }
}

function assertNonemptyStringPayload(label: string, payload: Readonly<{ kind: string; value?: unknown }>): void {
  if (payload.kind !== "string" || typeof payload.value !== "string" || payload.value.length === 0) {
    throw new Error(`${label} must be a nonempty String`);
  }
}

async function verifyScenarioWithValidators(projectRoot: string, value: unknown, validate: ValidateFunction): Promise<EnginePopulationScenario> {
  if (!validate(value)) {
    throw new Error(`engine population scenario schema validation failed: ${formatErrors(validate.errors)}`);
  }
  assertNoAnswerKeys(value);
  const scenario = value as EnginePopulationScenario;
  assertNoDuplicate("definition refs", scenario.definitions.map(({ definitionRef }) => definitionRef));
  assertNoDuplicate("definition ids", scenario.definitions.map(({ bpmn }) => bpmn.id));
  assertNoDuplicate("definition paths", scenario.definitions.map(({ bpmn }) => bpmn.relativePath));
  assertNoDuplicate("definition source digests", scenario.definitions.map(({ bpmn }) => bpmn.sha256));
  await Promise.all(scenario.definitions.map(({ bpmn }) => assertSourceBinding(projectRoot, bpmn)));

  const definitions = new Map(scenario.definitions.map((definition) => [definition.definitionRef, definition] as const));
  const commandIds: Array<string> = [];
  const stepsByInstance = new Map<string, Array<InstanceStep>>();
  const publishes: Array<{ readonly step: PublishStep; readonly index: number }> = [];
  scenario.steps.forEach((step, index) => {
    if (step.kind !== "publish" && step.kind !== "instance") {
      throw new Error(`engine population scenario ${step.kind} step is outside the bounded Message-correlation schedule`);
    }
    if (step.kind === "publish") {
      publishes.push({ step, index });
      commandIds.push(step.commandId);
      return;
    }
    if (!definitions.has(step.definitionRef)) {
      throw new Error(`engine population scenario instance references unknown definition ${step.definitionRef}`);
    }
    commandIds.push(step.stimulus.commandId);
    stepsByInstance.set(step.instanceId, [...(stepsByInstance.get(step.instanceId) ?? []), step]);
  });
  for (const [instanceId, steps] of stepsByInstance) {
    const [first, second, ...rest] = steps;
    if (first === undefined || second === undefined || rest.length > 0) {
      throw new Error(`engine population scenario instance ${instanceId} must be one start followed by one delivery`);
    }
    if (first.definitionRef !== second.definitionRef) {
      throw new Error(`engine population scenario instance ${instanceId} crosses definition identity`);
    }
    verifyStart(first.stimulus, instanceId);
    verifyDelivery(second.stimulus, instanceId);
  }
  const usedDefinitionRefs = new Set([...stepsByInstance.values()].map(([step]) => step?.definitionRef));
  if (usedDefinitionRefs.size !== definitions.size) {
    throw new Error("engine population scenario leaves a declared definition outside the population");
  }

  const [publication, ...laterPublications] = publishes;
  if (publication === undefined || laterPublications.length > 0) {
    throw new Error("engine population scenario must carry exactly one publication");
  }
  if (publication.index !== scenario.steps.length - 1) {
    throw new Error("engine population scenario publication must follow every instance step");
  }
  const { step: publish } = publication;
  assertNoDuplicate("command ids", commandIds);
  verifyPublication(publish, scenario.definitions.length);
  return scenario;
}

/**
 * The one publication: to the executions of one declared definition's deployment (definitions deploy in list order,
 * so the `n`-th has deployment `n`), on the bounded channel, with the bounded correlation key's one non-empty String
 * criterion and nothing else.
 */
function verifyPublication(publish: PublishStep, definitionCount: number): void {
  const label = `engine population scenario publication ${publish.commandId}`;
  const deploymentId = publish.address.definition?.deploymentId;
  if (deploymentId === undefined || deploymentId > definitionCount) {
    throw new Error("engine population scenario publication definition identity is inconsistent");
  }
  assertEqual(`${label} channel`, publish.address.channel, channel);
  const [criterion, ...others] = publish.criteria;
  if (criterion === undefined || others.length > 0 || criterion.target.kind !== "processVariable" ||
    criterion.target.name !== correlationKeyId) {
    throw new Error("engine population scenario publication address is inconsistent with the bounded Process");
  }
  assertNonemptyStringPayload(`${label} criterion`, criterion.expected);
  if (publish.mode !== "executionsOnly" || publish.payload !== undefined || publish.variables.length > 0 ||
    publish.businessKey !== undefined || publish.at !== undefined) {
    throw new Error(`${label} carries more than the bounded correlation`);
  }
}

function verifyStart(start: PopulationStimulus, instanceId: string): void {
  if (
    start.kind !== "start" || start.instanceId !== instanceId || start.startEvent !== undefined ||
    start.trigger !== undefined || start.variables?.length !== 0
  ) {
    throw new Error(`engine population scenario start ${start.commandId} is inconsistent with the bounded Process`);
  }
}

function verifyDelivery(delivery: PopulationStimulus, instanceId: string): void {
  const label = `engine population scenario delivery ${delivery.commandId}`;
  const occurrence = delivery.occurrence;
  if (delivery.kind !== "deliver" || occurrence === undefined || delivery.payload === undefined || delivery.correlation !== undefined) {
    throw new Error(`${label} is not a payload-bearing delivery addressed by occurrence`);
  }
  if (occurrence.processInstanceId !== instanceId) {
    throw new Error(`${label} crosses Process-instance identity`);
  }
  if (occurrence.elementId !== initialCatchId || occurrence.activation !== 1) {
    throw new Error(`${label} does not address the initial catch`);
  }
  assertEqual(`${label} trigger`, delivery.trigger, { kind: "message", channel });
  assertNonemptyStringPayload(`${label} payload`, delivery.payload);
}

/** Validates one population input without registering it in the ordinary single-instance pipeline. */
export async function verifyEnginePopulationScenario(projectRoot: string, value: unknown): Promise<EnginePopulationScenario> {
  const { scenario } = await buildValidators(projectRoot);
  return verifyScenarioWithValidators(projectRoot, value, scenario);
}

/** Reads and strictly verifies the bounded Message-correlation profile and all population inputs. */
export async function readEnginePopulationArtifacts(projectRoot: string): Promise<EnginePopulationArtifacts> {
  const validators = await buildValidators(projectRoot);
  const profileDocument = await readJson(path.join(projectRoot, `profiles/${profileId}/profile.json`));
  assertProfile(profileDocument, validators.profile);
  const scenarios = await Promise.all(enginePopulationScenarioRelativePaths.map(async (relativePath) => Object.freeze({
    relativePath,
    document: await verifyScenarioWithValidators(projectRoot, await readJson(path.join(projectRoot, relativePath)), validators.scenario),
  })));
  assertNoDuplicate("engine population scenario ids", scenarios.map(({ document }) => document.id));

  const original = await readFile(path.join(projectRoot, "scenarios/message-key-correlation/process.bpmn"), "utf8");
  const other = await readFile(path.join(projectRoot, "scenarios/message-key-correlation/process-other-definition.bpmn"), "utf8");
  if (other.replace('name="Review secondary settlement"', 'name="Review settlement"') !== original) {
    throw new Error("cross-definition source must change only the optional User Task name");
  }
  return Object.freeze({ profile: profileDocument, scenarios: Object.freeze(scenarios) });
}

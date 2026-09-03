import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import { parseStrictJson } from "./strict-json.ts";

const profileId = "bpmn-2.0.2-message-key-correlation-draft" as const;
const processId = "Process_SettlementCorrelation" as const;
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

type StartProcess = Readonly<{
  kind: "startProcess";
  commandId: string;
  processId: string;
  instanceId: string;
  initialVariables: ReadonlyArray<never>;
}>;

type DeliverPayloadMessage = Readonly<{
  kind: "deliverPayloadMessage";
  commandId: string;
  subscriptionId: Readonly<{
    processInstanceId: string;
    elementId: string;
    activation: number;
  }>;
  channel: OperationMessageChannel;
  payload: Readonly<{ kind: "string"; value: string }>;
}>;

type EnginePopulationInstance = Readonly<{
  definitionId: string;
  stimuli: readonly [StartProcess, DeliverPayloadMessage];
}>;

type EnginePopulationPublication = Readonly<{
  kind: "publishCorrelatedPayloadMessage";
  commandId: string;
  address: Readonly<{
    definition: Readonly<{
      compiler: "bpmn-source-semantic-process";
      semanticProfile: typeof profileId;
      sourceOverlay: SourceOverlayIdentity | null;
      sourceId: string;
      sourceSha256: string;
    }>;
    processId: string;
    channel: OperationMessageChannel;
    correlationKeyId: string;
  }>;
  payload: Readonly<{ kind: "string"; value: string }>;
}>;

export type EnginePopulationScenario = Readonly<{
  kind: "enginePopulationScenario";
  id: string;
  profile: typeof profileId;
  definitions: ReadonlyArray<EnginePopulationBpmnResource>;
  instances: readonly [EnginePopulationInstance, EnginePopulationInstance];
  publications: readonly [EnginePopulationPublication];
  observations: readonly ["publicationResults", "processStates", "ingressOrdinals"];
  executionTargets: Readonly<{
    lean: true;
    typeScriptCore: true;
    temporal: true;
    cib: null;
  }>;
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

function assertNoAnswerKeys(value: unknown, location = "engine population scenario"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoAnswerKeys(entry, `${location}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (answerKeys.has(key)) {
      throw new Error(`engine population scenario contains answer-smuggling key ${location}.${key}`);
    }
    assertNoAnswerKeys(child, `${location}.${key}`);
  }
}

async function readJson(absolutePath: string): Promise<unknown> {
  return parseStrictJson(await readFile(absolutePath, "utf8"), absolutePath);
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
  assertEqual("Message key-correlation profile relationships", bpmn.relationships, [
    "CIB-AGR-0001",
    "CIB-OP-0001",
    "CIB-LIM-0002",
  ]);
  if ("oracle" in profile || "environment" in profile) {
    throw new Error("Message key-correlation profile must not select a CIB execution oracle");
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
  assertNoDuplicate("definition ids", scenario.definitions.map(({ id }) => id));
  assertNoDuplicate("definition paths", scenario.definitions.map(({ relativePath }) => relativePath));
  assertNoDuplicate("definition source digests", scenario.definitions.map(({ sha256 }) => sha256));
  await Promise.all(scenario.definitions.map((definition) => assertSourceBinding(projectRoot, definition)));

  const definitions = new Map(scenario.definitions.map((definition) => [definition.id, definition] as const));
  const usedDefinitionIds: Array<string> = [];
  const processInstanceIds: Array<string> = [];
  const commandIds: Array<string> = [];
  for (const instance of scenario.instances) {
    const definition = definitions.get(instance.definitionId);
    if (definition === undefined) {
      throw new Error(`engine population scenario instance references unknown definition ${instance.definitionId}`);
    }
    usedDefinitionIds.push(instance.definitionId);
    const [start, delivery] = instance.stimuli;
    processInstanceIds.push(start.instanceId);
    commandIds.push(start.commandId, delivery.commandId);
    if (start.processId !== processId || start.initialVariables.length !== 0) {
      throw new Error(`engine population scenario start ${start.commandId} is inconsistent with the bounded Process`);
    }
    if (delivery.subscriptionId.processInstanceId !== start.instanceId) {
      throw new Error(`engine population scenario delivery ${delivery.commandId} crosses Process-instance identity`);
    }
    if (delivery.subscriptionId.elementId !== initialCatchId || delivery.subscriptionId.activation !== 1) {
      throw new Error(`engine population scenario delivery ${delivery.commandId} does not address the initial catch`);
    }
    assertEqual(`engine population scenario delivery ${delivery.commandId} channel`, delivery.channel, channel);
    assertNonemptyStringPayload(`engine population scenario delivery ${delivery.commandId} payload`, delivery.payload);
  }
  assertNoDuplicate("Process instance ids", processInstanceIds);
  if (new Set(usedDefinitionIds).size !== definitions.size) {
    throw new Error("engine population scenario leaves a declared definition outside the population");
  }

  const [publication] = scenario.publications;
  commandIds.push(publication.commandId);
  assertNoDuplicate("command ids", commandIds);
  assertNonemptyStringPayload(`engine population scenario publication ${publication.commandId} payload`, publication.payload);
  if (publication.address.processId !== processId || publication.address.correlationKeyId !== correlationKeyId) {
    throw new Error("engine population scenario publication address is inconsistent with the bounded Process");
  }
  assertEqual("engine population scenario publication channel", publication.address.channel, channel);
  const selectedDefinition = definitions.get(publication.address.definition.sourceId);
  if (selectedDefinition === undefined || publication.address.definition.compiler !== "bpmn-source-semantic-process" || publication.address.definition.semanticProfile !== scenario.profile || publication.address.definition.sourceSha256 !== selectedDefinition.sha256 || JSON.stringify(publication.address.definition.sourceOverlay) !== JSON.stringify(selectedDefinition.sourceOverlay)) {
    throw new Error("engine population scenario publication definition identity is inconsistent");
  }
  return scenario;
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

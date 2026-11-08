/**
 * Kernel scenario runner, transcribed from `Kernel/Run.lean`.
 *
 * `runScenario` returns the canonical scenario result. Trace rules, as the frozen evaluator applies them: a
 * committed input, or a rejected one that is not last, adds its command and state observation and the run
 * continues; any other outcome adds them and ends the run with that outcome. A program the admission registry
 * refuses yields only an unsupported deployment. Undecodable input throws, as the Lean runner exits with an IO
 * error and prints no result; the runner's stderr diagnostic for an admission refusal is the CLI's, not this
 * function's.
 *
 * `runPopulation` is `kernelRun --population`: the engine-population result
 * (`contracts/schemas/engine-population-scenario.schema.json`), one program per scenario definition in the same
 * order. It lives here because this is the one module that may import both registries; a refused program or a
 * population refusal is a harness error and throws, never a result.
 */
import { assertNever, type Program } from "./il/types.js";
import { bindingsToJson, decodeProgram, encodeValue, type JsonValue } from "./il/codec.js";
import { channelFromJson, channelToJson, failureName, stimulusFromJson } from "./il/codec/stimulus.js";
import { FailureTag, failed, type Input, type Outcome, type State } from "./state.js";
import {
  ResolutionTag,
  run as runInstances,
  type Address,
  type Definition,
  type DefinitionRef,
  type Publication,
  type Resolution,
  type Result as PopulationResult,
} from "./population.js";
import { step } from "./step.js";
import {
  EnabledInteractionTag,
  multiInstances,
  observe,
  publishesMultiInstances,
  type EnabledInteraction,
  type OccurrenceId,
  type OpenEffect,
  type OpenIteration,
  type OpenMultiInstance,
  type OpenUserTask,
  type PublishedFailure,
  reference,
} from "./publish.js";
import { hooks } from "./registry.js";
import { admit } from "./admission-registry.js";

type Stimulus = readonly [string, Input | null];

export function occurrenceJson(id: OccurrenceId): JsonValue {
  return { processInstanceId: id.processInstanceId, elementId: id.elementId, activation: id.activation };
}

/**
 * `inputs` appears only for a task with input mappings, `metadata` only for a task with candidate groups, and
 * `form` within it only with form fields.
 */
export function openUserTaskJson(task: OpenUserTask): JsonValue {
  const form = task.formFields.length === 0
    ? {}
    : { form: { fields: task.formFields.map(([key, type]) => ({ key, type })) } };
  const metadata = task.candidateGroups.length === 0
    ? {}
    : {
        metadata: {
          assignment: { candidates: task.candidateGroups.map((group) => ({ id: group, kind: "group" })) },
          ...form,
        },
      };
  const inputs = task.inputs.length === 0 ? {} : { inputs: bindingsToJson(task.inputs) };
  return { id: occurrenceJson(task.id), name: task.name, state: "active", ...inputs, ...metadata };
}

export function openEffectJson(effect: OpenEffect): JsonValue {
  return {
    id: occurrenceJson(effect.id),
    descriptor: { protocol: effect.protocol, operation: effect.operation },
    arguments: bindingsToJson(effect.arguments),
  };
}

export function incidentIdJson(effect: OccurrenceId, generation: number): JsonValue {
  return { effectId: occurrenceJson(effect), generation };
}

/** The compiler a correlated address's definition names: the checked-process lowering every program comes from. */
export const compiler = "bpmn-source-semantic-process";

export function definitionJson(ref: DefinitionRef): JsonValue {
  return {
    compiler,
    semanticProfile: ref.profile,
    sourceOverlay: ref.overlay === null ? null : { id: ref.overlay.id, sha256: ref.overlay.sha256 },
    sourceId: ref.sourceId,
    sourceSha256: ref.sourceSha256,
  };
}

export function interactionJson(
  instanceId: string,
  definition: DefinitionRef,
  processId: string,
  interaction: EnabledInteraction,
): JsonValue {
  switch (interaction.tag) {
    case EnabledInteractionTag.CompleteUserTask:
      return { kind: "completeUserTaskInstance", taskId: occurrenceJson(interaction.task) };
    case EnabledInteractionTag.DeliverMessage:
      return {
        kind: "deliverMessage",
        subscriptionId: occurrenceJson(interaction.subscription),
        channel: channelToJson(interaction.channel),
      };
    case EnabledInteractionTag.DeliverPayloadMessage:
      return {
        kind: "deliverPayloadMessage",
        subscriptionId: occurrenceJson(interaction.subscription),
        channel: channelToJson(interaction.channel),
      };
    case EnabledInteractionTag.PublishCorrelatedPayloadMessage:
      return {
        kind: "publishCorrelatedPayloadMessage",
        address: {
          definition: definitionJson(definition),
          processId,
          channel: channelToJson(interaction.channel),
          correlationKeyId: interaction.correlationKey,
        },
      };
    case EnabledInteractionTag.RetryIncident:
      return { kind: "retryIncident", incidentId: incidentIdJson(interaction.effect, interaction.generation) };
    case EnabledInteractionTag.CancelIncidentProcess:
      return {
        kind: "cancelIncidentProcess",
        processInstanceId: instanceId,
        incidentId: incidentIdJson(interaction.effect, interaction.generation),
      };
  }
  return assertNever(interaction);
}

export function iterationJson(iteration: OpenIteration): JsonValue {
  return {
    loopCounter: iteration.loopCounter,
    taskId: occurrenceJson(iteration.taskId),
    taskInput: { name: iteration.taskInput[0], value: encodeValue(iteration.taskInput[1]) },
    completionBindingName: iteration.completionBindingName,
  };
}

export function multiInstanceJson(entry: OpenMultiInstance): JsonValue {
  return {
    id: {
      processInstanceId: entry.processInstanceId,
      activityElementId: entry.activityElementId,
      activation: entry.activation,
    },
    mode: entry.mode,
    bodyKind: "userTask",
    plannedInstanceCount: entry.plannedInstanceCount,
    pendingItemCount: entry.pendingItemCount,
    numberOfInstances: entry.numberOfInstances,
    numberOfActiveInstances: entry.numberOfActiveInstances,
    numberOfCompletedInstances: entry.numberOfCompletedInstances,
    numberOfTerminatedInstances: 0,
    activeIterations: entry.activeIterations.map(iterationJson),
  };
}

/** `openMultiInstances`, only for a program that publishes it (`publishesMultiInstances`). */
export function multiInstancesJson(program: Program, state: State): Readonly<Record<string, JsonValue>> {
  return publishesMultiInstances(program)
    ? { openMultiInstances: multiInstances(hooks.multiInstanceMode, program, state).map(multiInstanceJson) }
    : {};
}

/** `failure` appears only in a failed state. */
export function failureJson(failure: PublishedFailure): JsonValue {
  return {
    kind: "compensationHandlerFailure",
    triggerId: occurrenceJson(failure.trigger),
    handlerId: occurrenceJson(failure.handler),
    effectId: occurrenceJson(failure.effect),
    code: failure.code,
    message: failure.message,
  };
}

export function observationJson(program: Program, definition: DefinitionRef, state: State): JsonValue {
  const o = observe(state);
  return {
    kind: "state",
    instanceId: o.instanceId,
    status: o.status,
    activeWaits: o.activeWaits.map((wait) => ({
      elementId: wait.elementId,
      kind: wait.kind,
      multiplicity: wait.multiplicity,
    })),
    openUserTasks: o.openUserTasks.map(openUserTaskJson),
    openMessageSubscriptions: o.openMessageSubscriptions.map((subscription) => ({
      id: occurrenceJson(subscription.id),
      channel: channelToJson(subscription.channel),
    })),
    openTimers: o.openTimers.map((timer) => ({ id: occurrenceJson(timer.id), deadlineMs: timer.deadlineMs })),
    openEffects: o.openEffects.map(openEffectJson),
    openIncidents: o.openIncidents.map((incident) => ({
      kind: "effectExecutionFailed",
      id: incidentIdJson(incident.effect.id, incident.generation),
      effect: openEffectJson(incident.effect),
    })),
    variables: bindingsToJson(o.variables),
    enabledInteractions: o.enabledInteractions.map((interaction) =>
      interactionJson(o.instanceId, definition, program.identity.processId, interaction)),
    logicalTimeMs: o.logicalTimeMs,
    ...multiInstancesJson(program, state),
    ...(o.failure === null ? {} : { failure: failureJson(o.failure) }),
  };
}

export function commandJson(commandId: string, outcome: string): JsonValue {
  return { kind: "command", commandId, outcome };
}

function snapshot(program: Program, definition: DefinitionRef, state: State | null): JsonValue[] {
  return state === null ? [] : [observationJson(program, definition, state)];
}

/** Whether a failure lets the run continue when more stimuli follow. */
function continues(tag: FailureTag): boolean {
  switch (tag) {
    case FailureTag.Rejected:
      return true;
    case FailureTag.RolledBack:
    case FailureTag.SemanticFailure:
    case FailureTag.Unsupported:
      return false;
  }
  return assertNever(tag);
}

/** The trace after deployment and the scenario outcome. */
export function execute(
  program: Program,
  definition: DefinitionRef,
  stimuli: readonly Stimulus[],
): readonly [JsonValue[], string] {
  const trace: JsonValue[] = [];
  let state: State | null = null;
  for (const [index, [commandId, input]] of stimuli.entries()) {
    const outcome: Outcome = input === null
      ? failed(FailureTag.Unsupported, "stimulus")
      : step(hooks, program, state, input);
    if (outcome.ok) {
      trace.push(commandJson(commandId, "committed"), ...snapshot(program, definition, outcome.value));
      state = outcome.value;
      continue;
    }
    const name = failureName(outcome.failure);
    trace.push(commandJson(commandId, name), ...snapshot(program, definition, state));
    if (!(continues(outcome.failure.tag) && index < stimuli.length - 1)) {
      return [trace, name];
    }
  }
  return [trace, "committed"];
}

export function result(program: Program, definition: DefinitionRef, stimuli: readonly Stimulus[]): JsonValue {
  const deployment = (outcome: string): JsonValue => ({ kind: "deployment", outcome });
  const semantic = (outcome: string): JsonValue => ({ kind: "semantic", outcome });
  if (admit(program) !== null) {
    return { outcome: semantic("unsupported"), trace: [deployment("unsupported")] };
  }
  const [trace, outcome] = execute(program, definition, stimuli);
  return { outcome: semantic(outcome), trace: [deployment("committed"), ...trace] };
}

function isObject(json: unknown): json is Readonly<Record<string, unknown>> {
  return typeof json === "object" && json !== null && !Array.isArray(json);
}

/** Lean's `Json.getObjVal?`: the key must be present. */
function field(json: unknown, key: string, where: string): unknown {
  if (!isObject(json) || !Object.hasOwn(json, key)) {
    throw new Error(`${where}: property not found: ${key}`);
  }
  return json[key];
}

/** Lean's `getObjValAs? String`: an absent key reads as `null`, which is no String. */
function stringField(json: unknown, key: string, where: string): string {
  const value = isObject(json) && Object.hasOwn(json, key) ? json[key] : null;
  if (typeof value !== "string") {
    throw new Error(`${where}: ${key}: String expected`);
  }
  return value;
}

/** Lean's `getObjValAs? (Array Json)`. */
function arrayField(json: unknown, key: string, where: string): readonly unknown[] {
  const value = isObject(json) && Object.hasOwn(json, key) ? json[key] : null;
  if (!Array.isArray(value)) {
    throw new Error(`${where}: expected JSON array`);
  }
  return value;
}

/** A scenario's BPMN resource (`{id, sha256, sourceOverlay}`) under the scenario's profile. */
export function definitionRefFromJson(resource: unknown, profile: string, where: string): DefinitionRef {
  const overlay = field(resource, "sourceOverlay", where);
  return {
    sourceId: stringField(resource, "id", where),
    sourceSha256: stringField(resource, "sha256", where),
    overlay: overlay === null
      ? null
      : { id: stringField(overlay, "id", where), sha256: stringField(overlay, "sha256", where) },
    profile,
  };
}

function decodeStimuli(json: unknown, where: string): readonly Stimulus[] {
  return arrayField(json, "stimuli", where).map((item: unknown) => {
    const decoded = stimulusFromJson(item);
    if (!decoded.ok) {
      throw new Error(`${where}: ${decoded.refusal}`);
    }
    return decoded.value;
  });
}

function decodeProgramOrThrow(programJson: unknown, where: string): Program {
  const program = decodeProgram(programJson);
  if (!program.ok) {
    throw new Error(`${where}: ${program.refusal}`);
  }
  return program.value;
}

export function runScenario(programJson: unknown, scenarioJson: unknown): unknown {
  const program = decodeProgramOrThrow(programJson, "program");
  const definition = definitionRefFromJson(
    field(scenarioJson, "bpmn", "scenario"),
    stringField(scenarioJson, "profile", "scenario"),
    "scenario",
  );
  return result(program, definition, decodeStimuli(scenarioJson, "scenario"));
}

// Population mode

export function addressFromJson(json: unknown, where: string): Address {
  const definition = field(json, "definition", where);
  const named = stringField(definition, "compiler", where);
  if (named !== compiler) {
    throw new Error(`${where}: unknown compiler ${named}`);
  }
  const resource = {
    id: field(definition, "sourceId", where),
    sha256: field(definition, "sourceSha256", where),
    sourceOverlay: field(definition, "sourceOverlay", where),
  };
  const ref = definitionRefFromJson(resource, stringField(definition, "semanticProfile", where), where);
  const processId = stringField(json, "processId", where);
  const channel = channelFromJson(field(json, "channel", where));
  if (!channel.ok) {
    throw new Error(`${where}: ${channel.refusal}`);
  }
  return { definition: ref, processId, channel: channel.value, correlationKey: stringField(json, "correlationKeyId", where) };
}

export function publicationFromJson(json: unknown, where: string): Publication {
  const kind = stringField(json, "kind", where);
  if (kind !== "publishCorrelatedPayloadMessage") {
    throw new Error(`${where}: unknown publication kind ${kind}`);
  }
  const payload = field(json, "payload", where);
  const payloadKind = stringField(payload, "kind", where);
  if (payloadKind !== "string") {
    throw new Error(`${where}: unknown publication payload kind ${payloadKind}`);
  }
  return {
    commandId: stringField(json, "commandId", where),
    address: addressFromJson(field(json, "address", where), where),
    payload: stringField(payload, "value", where),
  };
}

/** An instance's definition and its inputs; a stimulus the kernel does not accept refuses the scenario. */
function scriptFromJson(
  definitions: readonly (readonly [string, Definition])[],
  json: unknown,
  where: string,
): readonly [Definition, readonly (readonly [string, Input])[]] {
  const id = stringField(json, "definitionId", where);
  const definition = definitions.find((entry) => entry[0] === id)?.[1];
  if (definition === undefined) {
    throw new Error(`${where}: unknown definition ${id}`);
  }
  const inputs = decodeStimuli(json, where).map(([commandId, input]) => {
    if (input === null) {
      throw new Error(`${where}: unsupported stimulus ${commandId}`);
    }
    return [commandId, input] as const;
  });
  return [definition, inputs];
}

export function resolutionJson(resolution: Resolution): JsonValue {
  switch (resolution.tag) {
    case ResolutionTag.Committed:
      return {
        kind: "committed",
        target: {
          processInstanceId: resolution.target.processInstanceId,
          subscriptionId: occurrenceJson(reference(resolution.target)),
        },
      };
    case ResolutionTag.NoMatch:
      return { kind: "rejectedNoMatch" };
    case ResolutionTag.Ambiguous:
      return { kind: "rejectedAmbiguous" };
  }
  return assertNever(resolution);
}

export function populationResultJson(scenarioId: string, population: PopulationResult): JsonValue {
  return {
    kind: "enginePopulationResult",
    scenarioId,
    publicationResults: population.publications.map((published) => ({
      commandId: published.commandId,
      ingressOrdinal: published.ingressOrdinal,
      outcome: resolutionJson(published.resolution),
    })),
    processStates: population.instances.map((member) =>
      observationJson(member.definition.program, member.definition.ref, member.state)),
    ingressOrdinals: population.publications.map((published) => ({
      commandId: published.commandId,
      ingressOrdinal: published.ingressOrdinal,
    })),
  };
}

/** `kernelRun --population`: one program per scenario definition, in the scenario's order. */
export function runPopulation(programJsons: readonly unknown[], scenarioJson: unknown): unknown {
  const where = "population scenario";
  const scenarioId = stringField(scenarioJson, "id", where);
  const profile = stringField(scenarioJson, "profile", where);
  const resources = arrayField(scenarioJson, "definitions", where);
  if (resources.length !== programJsons.length) {
    throw new Error(`${where}: ${resources.length} definitions, ${programJsons.length} programs`);
  }
  const definitions = resources.map((resource, index): readonly [string, Definition] => {
    const program = decodeProgramOrThrow(programJsons[index], `program ${index}`);
    const code = admit(program);
    if (code !== null) {
      throw new Error(`program ${index}: admission refused: ${code}`);
    }
    const id = stringField(resource, "id", where);
    const ref = definitionRefFromJson(resource, profile, where);
    if (program.identity.sourceSha256 !== ref.sourceSha256 || program.identity.profile !== profile) {
      throw new Error(`program ${index}: program identity differs from definition ${id}`);
    }
    return [id, { ref, program }];
  });
  const scripts = arrayField(scenarioJson, "instances", where).map((json) => scriptFromJson(definitions, json, where));
  const publications = arrayField(scenarioJson, "publications", where).map((json) => publicationFromJson(json, where));
  const population = runInstances(hooks, definitions.map((entry) => entry[1]), scripts, publications);
  if (!population.ok) {
    throw new Error(`${where}: ${population.error}`);
  }
  return populationResultJson(scenarioId, population.value);
}

/**
 * Kernel scenario runner, transcribed from `Kernel/Run.lean`.
 *
 * `runScenario` returns the canonical scenario result. Trace rules: a committed input, or a rejected one that is not
 * last, adds its command and state observation and the run continues; any other outcome adds them and ends the run with
 * that outcome. A program the admission registry refuses yields only an unsupported deployment carrying the refusal
 * code.
 *
 * `runHostView` returns `{result, hostRequirements, definitionCapabilities, hostViews}`, one host view per committed
 * input. `runPopulation` returns the engine-population result
 * (`contracts/schemas/engine-population-scenario.schema.json`), one program per scenario definition in the same order.
 * The population mode lives here because this is the one module that may import both registries; a refused program or
 * a population refusal is a harness error, thrown, never a result.
 */
import { assertNever, multiInstanceModeName, type Program } from "./il/types.js";
import {
  bindingsToJson,
  decodeProgram,
  encodeTimerSchedule,
  valueCodec,
  type JsonValue,
} from "./il/codec.js";
import { channelFromJson, channelToJson, failureCode, failureName, stimulusFromJson } from "./il/codec/stimulus.js";
import {
  CauseTag,
  FailureTag,
  failed,
  type Cause,
  type InstanceFailure,
  type Input,
  type OccurrenceKey,
  type OccurrenceRef,
  type Outcome,
  type State,
  type Transition,
} from "./state.js";
import { step } from "./step.js";
import {
  EnabledInteractionTag,
  multiInstances,
  observe,
  publishesMultiInstances,
  statusName,
  type EnabledInteraction,
  type OccurrenceId,
  type OpenEffect,
  type OpenIteration,
  type OpenMultiInstance,
  type OpenUserTask,
  type PublishedFailure,
} from "./publish.js";
import { definitionCapabilities, hostRequirements, hostView, type Capabilities, type OpenWait, type Requirements, type View } from "./host.js";
import {
  ResolutionTag,
  StimulusTag,
  run as runInstances,
  type Address,
  type Definition,
  type DeploymentRef,
  type Publication,
  type Resolution,
  type Result as PopulationResult,
  type Stimulus,
} from "./population.js";
import { hooks } from "./registry.js";
import { admit } from "./admission-registry.js";

type ScenarioStimulus = readonly [string, Input | null];

function occurrenceJson(id: OccurrenceId): JsonValue {
  return { processInstanceId: id.processInstanceId, elementId: id.elementId, activation: id.activation };
}

/** `inputs` appears only for a task with input mappings, `metadata` only for a task with candidate groups, and `form` within it only with form fields. */
function openUserTaskJson(task: OpenUserTask): JsonValue {
  const form = task.formFields.length === 0
    ? {}
    : { form: { fields: task.formFields.map(([key, type]) => ({ key, type })) } };
  const metadata = task.candidateGroups.length === 0
    ? {}
    : { metadata: { assignment: { candidates: task.candidateGroups.map((group) => ({ id: group, kind: "group" })) }, ...form } };
  const inputs = task.inputs.length === 0 ? {} : { inputs: bindingsToJson(task.inputs) };
  return { id: occurrenceJson(task.id), name: task.name, state: "active", ...inputs, ...metadata };
}

function openEffectJson(effect: OpenEffect): JsonValue {
  return {
    id: occurrenceJson(effect.id),
    descriptor: { protocol: effect.protocol, operation: effect.operation },
    arguments: bindingsToJson(effect.arguments),
  };
}

function incidentIdJson(effect: OccurrenceId, generation: number): JsonValue {
  return { effectId: occurrenceJson(effect), generation };
}

/** The compiler a correlated address's definition names. */
const compiler = "bpmn-source-semantic-process";

function definitionJson(ref: DeploymentRef): JsonValue {
  return {
    compiler,
    semanticProfile: ref.profile,
    sourceOverlay: ref.overlay === null ? null : { id: ref.overlay.id, sha256: ref.overlay.sha256 },
    sourceId: ref.sourceId,
    sourceSha256: ref.sourceSha256,
  };
}

function interactionJson(instanceId: string, definition: DeploymentRef, processId: string, interaction: EnabledInteraction): JsonValue {
  switch (interaction.tag) {
    case EnabledInteractionTag.CompleteUserTask:
      return { kind: "completeUserTaskInstance", taskId: occurrenceJson(interaction.task) };
    case EnabledInteractionTag.DeliverMessage:
      return { kind: "deliverMessage", subscriptionId: occurrenceJson(interaction.subscription), channel: channelToJson(interaction.channel) };
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

function iterationJson(iteration: OpenIteration): JsonValue {
  return {
    loopCounter: iteration.loopCounter,
    taskId: occurrenceJson(iteration.taskId),
    taskInput: { name: iteration.taskInput[0], value: valueCodec.encode(iteration.taskInput[1]) },
    completionBindingName: iteration.completionBindingName,
  };
}

function multiInstanceJson(entry: OpenMultiInstance): JsonValue {
  return {
    id: { processInstanceId: entry.processInstanceId, activityElementId: entry.activityElementId, activation: entry.activation },
    mode: multiInstanceModeName(entry.mode),
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

/** `failure` appears only in a failed state. */
function failureJson(failure: PublishedFailure): JsonValue {
  return {
    kind: "compensationHandlerFailure",
    triggerId: occurrenceJson(failure.trigger),
    handlerId: occurrenceJson(failure.handler),
    effectId: occurrenceJson(failure.effect),
    code: failure.code,
    message: failure.message,
  };
}

export function observationJson(program: Program, definition: DeploymentRef, state: State): JsonValue {
  const o = observe(program, state);
  return {
    kind: "state",
    instanceId: o.instanceId,
    status: o.status,
    activeWaits: o.activeWaits.map((wait) => ({ elementId: wait.elementId, kind: wait.kind, multiplicity: wait.multiplicity })),
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
    ...(publishesMultiInstances(program) ? { openMultiInstances: multiInstances(program, state).map(multiInstanceJson) } : {}),
    ...(o.failure === null ? {} : { failure: failureJson(o.failure) }),
  };
}

function commandJson(commandId: string, outcome: string): JsonValue {
  return { kind: "command", commandId, outcome };
}

function snapshot(program: Program, definition: DeploymentRef, state: State | null): JsonValue[] {
  return state === null ? [] : [observationJson(program, definition, state)];
}

function stepInput(program: Program, state: State | null, input: Input | null): Outcome {
  // dynamic-only: a stimulus kind the scenario states
  return input === null ? failed(FailureTag.Unsupported, "stimulus") : step(hooks, program, state, input);
}

/** The trace after deployment and the scenario outcome. */
function execute(program: Program, definition: DeploymentRef, stimuli: readonly ScenarioStimulus[]): readonly [JsonValue[], string] {
  const trace: JsonValue[] = [];
  let state: State | null = null;
  for (const [index, [commandId, input]] of stimuli.entries()) {
    const outcome = stepInput(program, state, input);
    if (outcome.ok) {
      trace.push(commandJson(commandId, "committed"), ...snapshot(program, definition, outcome.value));
      state = outcome.value;
      continue;
    }
    const name = failureName(outcome.failure);
    trace.push(commandJson(commandId, name), ...snapshot(program, definition, state));
    const continues = outcome.failure.tag === FailureTag.Rejected && index < stimuli.length - 1;
    if (!continues) return [trace, name];
  }
  return [trace, "committed"];
}

/** `code` appears only on a refused deployment. */
function deploymentJson(outcome: string, code: string | null): JsonValue {
  return code === null ? { kind: "deployment", outcome } : { kind: "deployment", outcome, code };
}

function result(program: Program, definition: DeploymentRef, stimuli: readonly ScenarioStimulus[]): JsonValue {
  const semantic = (outcome: string): JsonValue => ({ kind: "semantic", outcome });
  const code = admit(program);
  if (code !== null) return { outcome: semantic("unsupported"), trace: [deploymentJson("unsupported", code)] };
  const [trace, outcome] = execute(program, definition, stimuli);
  return { outcome: semantic(outcome), trace: [deploymentJson("committed", null), ...trace] };
}

function isObject(json: unknown): json is Readonly<Record<string, unknown>> {
  return typeof json === "object" && json !== null && !Array.isArray(json);
}

/** Lean's `Json.getObjVal?`: the key must be present. */
function field(json: unknown, key: string, where: string): unknown {
  if (!isObject(json) || !Object.hasOwn(json, key)) throw new Error(`${where}: property not found: ${key}`);
  return json[key];
}

/** Lean's `getObjValAs? String`: an absent key reads as `null`, which is no String. */
function stringField(json: unknown, key: string, where: string): string {
  const value = isObject(json) && Object.hasOwn(json, key) ? json[key] : null;
  if (typeof value !== "string") throw new Error(`${where}: ${key}: String expected`);
  return value;
}

/** Lean's `getObjValAs? (Array Json)`. */
function arrayField(json: unknown, key: string, where: string): readonly unknown[] {
  const value = isObject(json) && Object.hasOwn(json, key) ? json[key] : null;
  if (!Array.isArray(value)) throw new Error(`${where}: expected JSON array`);
  return value;
}

/** A scenario's BPMN resource (`{id, sha256, sourceOverlay}`) under the scenario's profile. */
function definitionRefFromJson(resource: unknown, profile: string, where: string): DeploymentRef {
  const overlay = field(resource, "sourceOverlay", where);
  return {
    sourceId: stringField(resource, "id", where),
    sourceSha256: stringField(resource, "sha256", where),
    overlay: overlay === null ? null : { id: stringField(overlay, "id", where), sha256: stringField(overlay, "sha256", where) },
    profile,
  };
}

function stimuliFromJson(json: unknown, where: string): readonly ScenarioStimulus[] {
  return arrayField(json, "stimuli", where).map((item) => {
    const decoded = stimulusFromJson(item);
    if (!decoded.ok) throw new Error(`${where}: ${decoded.refusal}`);
    return decoded.value;
  });
}

function programFromJson(programJson: unknown, where: string): Program {
  const program = decodeProgram(programJson);
  if (!program.ok) throw new Error(`${where}: ${program.refusal}`);
  return program.value;
}

function scenarioFromJson(scenarioJson: unknown): readonly [DeploymentRef, readonly ScenarioStimulus[]] {
  const where = "scenario";
  const definition = definitionRefFromJson(field(scenarioJson, "bpmn", where), stringField(scenarioJson, "profile", where), where);
  return [definition, stimuliFromJson(scenarioJson, where)];
}

/** `kernelRun <program.json> <scenario.json>`. */
export function runScenario(programJson: unknown, scenarioJson: unknown): unknown {
  const program = programFromJson(programJson, "program");
  const [definition, stimuli] = scenarioFromJson(scenarioJson);
  return result(program, definition, stimuli);
}

// Host-view mode

/** An already public reference (`host.ts` `publicRef`, `population.ts` `occurrence`). */
function referenceJson(ref: OccurrenceRef): JsonValue {
  return { processInstanceId: ref.processInstanceId, elementId: ref.element, activation: ref.activation };
}

function keyJson(key: OccurrenceKey): JsonValue {
  return { processInstanceId: key.processInstanceId, elementId: key.element, activation: key.activation, role: key.role };
}

function causeJson(cause: Cause): JsonValue {
  switch (cause.tag) {
    case CauseTag.Input:
      return { kind: "input", input: cause.input };
    case CauseTag.Signal:
      return { kind: "signal", signal: cause.name };
    case CauseTag.Arrive:
      return { kind: "arrive", flow: cause.flow };
    case CauseTag.Idle:
      return { kind: "idle", scope: cause.scope };
  }
  return assertNever(cause);
}

function transitionJson(transition: Transition): JsonValue {
  return {
    cause: causeJson(transition.cause),
    element: transition.element,
    owner: transition.owner,
    started: transition.started.map((fact) => ({ occurrence: keyJson(fact.occurrence), owner: fact.owner, sourceType: fact.sourceType })),
    ended: transition.ended.map(([key, terminal]) => ({ occurrence: keyJson(key), terminal })),
  };
}

function waitJson(wait: OpenWait): JsonValue {
  const view = wait.view;
  const period = view.recurrence?.periodMs ?? null;
  return {
    id: referenceJson(wait.id),
    ...(wait.definition === null ? {} : { definition: { ...wait.definition } }),
    ...(view.input === null ? {} : { input: view.input }),
    ...(view.deadlineMs === null ? {} : { deadlineMs: view.deadlineMs }),
    ...(period === null ? {} : { period }),
    ...(view.channel === null ? {} : { channel: channelToJson(view.channel) }),
    ...(view.criteria.length === 0 ? {} : { criteria: [...view.criteria] }),
    ...(view.effect === null ? {} : {
      effect: {
        protocol: view.effect.protocol,
        operation: view.effect.operation,
        arguments: bindingsToJson(view.effect.arguments),
        failures: view.effect.failures,
      },
    }),
    ...(view.incident === null ? {} : { incident: { generation: view.incident.generation, cancellable: view.incident.cancellable } }),
    ...(view.userTask === null ? {} : { userTask: { name: view.userTask.name, inputs: bindingsToJson(view.userTask.inputs) } }),
  };
}

function failureViewJson(failure: InstanceFailure): JsonValue {
  return {
    code: failure.code,
    message: failure.message,
    occurrence: referenceJson(failure.occurrence),
    related: Object.fromEntries(failure.related.map(([name, ref]) => [name, referenceJson(ref)])),
  };
}

export function hostViewJson(view: View): JsonValue {
  return {
    status: statusName(view.status),
    openWaits: view.openWaits.map(waitJson),
    journal: view.journal.map(transitionJson),
    ...(view.failure === null ? {} : { failure: failureViewJson(view.failure) }),
  };
}

/** Every committed input's host view, up to the first input that neither commits nor is rejected. */
function hostViews(program: Program, stimuli: readonly ScenarioStimulus[]): readonly View[] {
  const views: View[] = [];
  let state: State | null = null;
  for (const [, input] of stimuli) {
    if (input === null) return views;
    const outcome = step(hooks, program, state, input);
    if (outcome.ok) {
      views.push(hostView(program, outcome.value));
      state = outcome.value;
    } else if (outcome.failure.tag !== FailureTag.Rejected) {
      return views;
    }
  }
  return views;
}

function requirementsJson(requirements: Requirements): JsonValue {
  return { ...requirements };
}

export function capabilitiesJson(capabilities: Capabilities): JsonValue {
  return {
    starts: capabilities.starts.map((start) => ({
      startEventId: start.startEventId,
      ...(start.channel === null ? {} : { channel: channelToJson(start.channel) }),
      ...(start.timer === null ? {} : { timer: encodeTimerSchedule(start.timer) }),
    })),
    correlatedChannels: capabilities.correlatedChannels.map(channelToJson),
    relations: [...capabilities.relations],
  };
}

/** `kernelRun --host-view <program.json> <scenario.json>`. */
export function runHostView(programJson: unknown, scenarioJson: unknown): unknown {
  const program = programFromJson(programJson, "program");
  const [definition, stimuli] = scenarioFromJson(scenarioJson);
  const views = admit(program) !== null ? [] : hostViews(program, stimuli);
  return {
    result: result(program, definition, stimuli),
    hostRequirements: requirementsJson(hostRequirements(program)),
    definitionCapabilities: capabilitiesJson(definitionCapabilities(program)),
    hostViews: views.map(hostViewJson),
  };
}

// Population mode

function addressFromJson(json: unknown, where: string): Address {
  const definition = field(json, "definition", where);
  const named = stringField(definition, "compiler", where);
  if (named !== compiler) throw new Error(`${where}: unknown compiler ${named}`);
  const resource = {
    id: field(definition, "sourceId", where),
    sha256: field(definition, "sourceSha256", where),
    sourceOverlay: field(definition, "sourceOverlay", where),
  };
  const ref = definitionRefFromJson(resource, stringField(definition, "semanticProfile", where), where);
  const processId = stringField(json, "processId", where);
  const channel = channelFromJson(field(json, "channel", where));
  if (!channel.ok) throw new Error(`${where}: ${channel.refusal}`);
  return { definition: ref, processId, channel: channel.value, correlationKey: stringField(json, "correlationKeyId", where) };
}

function publicationFromJson(json: unknown, where: string): Publication {
  const kind = stringField(json, "kind", where);
  if (kind !== "publishCorrelatedPayloadMessage") throw new Error(`${where}: unknown publication kind ${kind}`);
  const payload = field(json, "payload", where);
  const payloadKind = stringField(payload, "kind", where);
  if (payloadKind !== "string") throw new Error(`${where}: unknown publication payload kind ${payloadKind}`);
  return {
    commandId: stringField(json, "commandId", where),
    address: addressFromJson(field(json, "address", where), where),
    payload: stringField(payload, "value", where),
  };
}

/**
 * An instance's definition and its inputs; a stimulus the kernel does not accept refuses the scenario, and so does an
 * instance without inputs.
 */
function scriptFromJson(
  definitions: readonly (readonly [string, Definition])[],
  json: unknown,
  where: string,
): readonly [Definition, readonly (readonly [string, Input])[]] {
  const id = stringField(json, "definitionId", where);
  const definition = definitions.find(([key]) => key === id)?.[1];
  if (definition === undefined) throw new Error(`${where}: unknown definition ${id}`);
  const inputs = stimuliFromJson(json, where).map(([commandId, input]) => {
    if (input === null) throw new Error(`${where}: unsupported stimulus ${commandId}`);
    return [commandId, input] as const;
  });
  if (inputs.length === 0) throw new Error(`${where}: instance without inputs for definition ${id}`);
  return [definition, inputs];
}

/** The current population form lists every instance's inputs, then the publications: one ordered list. */
function populationStimuli(
  scripts: readonly (readonly [Definition, readonly (readonly [string, Input])[]])[],
  publications: readonly Publication[],
): readonly Stimulus[] {
  const inputs = scripts.flatMap(([definition, entries], script) =>
    entries.map(([commandId, input]): Stimulus => ({ tag: StimulusTag.Input, script, definition, commandId, input })));
  return [...inputs, ...publications.map((publication): Stimulus => ({ tag: StimulusTag.Publish, publication }))];
}

function resolutionJson(resolution: Resolution): JsonValue {
  switch (resolution.tag) {
    case ResolutionTag.Committed:
      return {
        kind: "committed",
        target: { processInstanceId: resolution.target.processInstanceId, subscriptionId: referenceJson(resolution.target) },
      };
    case ResolutionTag.Failed:
      return {
        kind: "failed",
        outcome: failureName(resolution.failure),
        code: failureCode(resolution.failure),
        subscriptionId: referenceJson(resolution.target),
      };
    case ResolutionTag.NoMatch:
      return { kind: "rejectedNoMatch" };
    case ResolutionTag.Ambiguous:
      return { kind: "rejectedAmbiguous" };
  }
  return assertNever(resolution);
}

function populationResultJson(scenarioId: string, population: PopulationResult): JsonValue {
  const inputFailures = population.inputFailures.length === 0 ? {} : {
    inputFailures: population.inputFailures.map(([commandId, failure]) => ({
      commandId,
      outcome: failureName(failure),
      code: failureCode(failure),
    })),
  };
  return {
    ...inputFailures,
    kind: "enginePopulationResult",
    scenarioId,
    publicationResults: population.publications.map((published) => ({
      commandId: published.commandId,
      ingressOrdinal: published.ingressOrdinal,
      outcome: resolutionJson(published.resolution),
    })),
    processStates: population.instances.map((member) => observationJson(member.definition.program, member.definition.ref, member.state)),
    ingressOrdinals: population.publications.map((published) => ({
      commandId: published.commandId,
      ingressOrdinal: published.ingressOrdinal,
    })),
  };
}

/** `kernelRun --population <program.json>... <population-scenario.json>`: one program per scenario definition, in order. */
export function runPopulation(programJsons: readonly unknown[], scenarioJson: unknown): unknown {
  const where = "population scenario";
  const scenarioId = stringField(scenarioJson, "id", where);
  const profile = stringField(scenarioJson, "profile", where);
  const resources = arrayField(scenarioJson, "definitions", where);
  if (resources.length !== programJsons.length) {
    throw new Error(`${where}: ${resources.length} definitions, ${programJsons.length} programs`);
  }
  const definitions = resources.map((resource, index): readonly [string, Definition] => {
    const program = programFromJson(programJsons[index], `program ${index}`);
    const code = admit(program);
    if (code !== null) throw new Error(`program ${index}: admission refused: ${code}`);
    const id = stringField(resource, "id", where);
    const ref = definitionRefFromJson(resource, profile, where);
    if (program.identity.sourceSha256 !== ref.sourceSha256 || program.identity.profile !== profile) {
      throw new Error(`program ${index}: program identity differs from definition ${id}`);
    }
    return [id, { ref, program }];
  });
  const scripts = arrayField(scenarioJson, "instances", where).map((json) => scriptFromJson(definitions, json, where));
  const publications = arrayField(scenarioJson, "publications", where).map((json) => publicationFromJson(json, where));
  const population = runInstances(hooks, definitions.map(([, definition]) => definition), populationStimuli(scripts, publications));
  if (!population.ok) throw new Error(`${where}: ${population.error}`);
  return populationResultJson(scenarioId, population.value);
}

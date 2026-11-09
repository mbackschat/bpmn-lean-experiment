/**
 * Kernel scenario runner, transcribed from `Kernel/Run.lean`.
 *
 * `runScenario` returns the canonical result (`contracts/schemas/canonical-result.schema.json`). Trace rules: a
 * committed input, or a rejected one that is not last, adds its command and state observation and the run continues;
 * any other outcome adds them and ends the run with that outcome. A program the admission registry refuses yields only an
 * unsupported deployment carrying the refusal code. A command observation of an input that did not commit carries the
 * failure's code.
 *
 * A state observation's open waits are `hostView`'s, in the schema's canonical order: process instance, element,
 * activation, then detail kind, so the order an implementation opens them in is never published.
 *
 * `runHostView` returns `{result, hostRequirements, definitionCapabilities, hostViews}`, one host view per committed
 * input. `runPopulation` returns the engine-population result for a population scenario
 * (`contracts/schemas/engine-population-scenario.schema.json`), one program per scenario definition in the same order.
 * The population mode lives here because this is the one module that may import both registries; a refused program or
 * a population refusal is a harness error, thrown, never a result.
 */
import { assertNever, compareStrings, mergeSort, type DefinitionRef, type Program } from "./il/types.js";
import { bindingsToJson, decodeProgram, encodeExpression, type JsonValue } from "./il/codec.js";
import { channelFromJson, channelToJson, failureCode, failureName, stimulusFromJson } from "./il/codec/stimulus.js";
import {
  CauseTag,
  FailureTag,
  type Cause,
  type EffectDetail,
  type InstanceFailure,
  type Input,
  type OccurrenceKey,
  type OccurrenceRef,
  type State,
  type Transition,
  type UserTaskDetail,
  type WaitView,
} from "./state.js";
import { step } from "./step.js";
import { scopeRoleName, scopes, statusName, variables, type PublishedScope } from "./publish.js";
import {
  definitionCapabilities,
  hostRequirements,
  hostView,
  type Capabilities,
  type CorrelatedChannel,
  type OpenWait,
  type Requirements,
  type View,
} from "./host.js";
import { ResolvedTag, type Resolved } from "./il/timer.js";
import {
  ResolutionTag,
  StimulusTag,
  run as runInstances,
  type Definition,
  type DeploymentRef,
  type Publication,
  type Resolution,
  type Result as PopulationResult,
  type Stimulus,
} from "./population.js";
import { hooks } from "./registry.js";
import { admit } from "./admission-registry.js";

type ScenarioStimulus = readonly [string, Input];

/** An already public reference (`host.ts` `publicRef`, `population.ts` `occurrence`): the schema's `occurrenceId`. */
function referenceJson(ref: OccurrenceRef): JsonValue {
  return { processInstanceId: ref.processInstanceId, elementId: ref.element, activation: ref.activation };
}

/** A present value, or JSON null: the schema's nullable members. */
function nullable<T>(value: T | null, encode: (value: T) => JsonValue): JsonValue {
  return value === null ? null : encode(value);
}

const text = (value: string): JsonValue => value;
const number = (value: number): JsonValue => value;
const flag = (value: boolean): JsonValue => value;

function definitionRefJson(ref: DefinitionRef): JsonValue {
  return {
    key: ref.key,
    version: nullable(ref.version, number),
    versionTag: nullable(ref.versionTag, text),
    deployment: nullable(ref.deployment, text),
    tenant: nullable(ref.tenant, text),
    sourceSha256: nullable(ref.sourceSha256, text),
  };
}

function effectFields(effect: EffectDetail): Record<string, JsonValue> {
  return {
    protocol: effect.protocol,
    operation: effect.operation,
    arguments: bindingsToJson(effect.arguments),
    failures: effect.failures,
    send: nullable(effect.send, (send) => ({ recipient: nullable(send.recipient, text), correlation: bindingsToJson(send.correlation) })),
  };
}

function userTaskFields(task: UserTaskDetail): Record<string, JsonValue> {
  return {
    name: nullable(task.name, text),
    assignee: nullable(task.assignee, text),
    candidateUsers: [...task.candidateUsers],
    candidateGroups: [...task.candidateGroups],
    formKey: nullable(task.formKey, text),
    formFields: task.formFields.map(([key, type]) => ({ key, type })),
    dueDate: nullable(task.dueDate, text),
    followUpDate: nullable(task.followUpDate, text),
    priority: nullable(task.priority, number),
    inputs: bindingsToJson(task.inputs),
  };
}

/** A wait's detail kind and fields, read from the one view field its kind sets (`openKindView`). */
function detail(view: WaitView): readonly [string, Record<string, JsonValue>] | null {
  if (view.userTask !== null) return ["userTask", userTaskFields(view.userTask)];
  if (view.incident !== null) {
    const incident = view.incident;
    return ["incident", { effect: effectFields(incident.effect), generation: incident.generation, cancellable: incident.cancellable }];
  }
  if (view.effect !== null) return ["effect", effectFields(view.effect)];
  if (view.signal !== null) return ["signal", { name: view.signal.name, payload: view.signal.payload }];
  if (view.conditional !== null) {
    const condition = view.conditional;
    return ["conditional", {
      variableName: nullable(condition.variableName, text),
      variableEvents: [...condition.variableEvents],
      lastValue: nullable(condition.lastValue, flag),
    }];
  }
  if (view.deadlineMs !== null) {
    return ["timer", {
      deadlineMs: view.deadlineMs,
      recurrence: nullable(view.recurrence, (recurrence) => ({
        periodMs: nullable(recurrence.periodMs, number),
        cron: nullable(recurrence.cron, text),
        remaining: nullable(recurrence.remaining, number),
      })),
    }];
  }
  if (view.channel !== null) {
    return ["message", { channel: channelToJson(view.channel), payload: view.payload, criteria: [...view.criteria] }];
  }
  return null;
}

/** One rendered open wait with the key of the canonical order. */
interface PublishedWait {
  readonly id: OccurrenceRef;
  readonly kind: string;
  readonly json: JsonValue;
}

function openWait(wait: OpenWait): PublishedWait {
  // Every view sets exactly one detail field, so the empty fallback never renders.
  const [kind, fields] = detail(wait.view) ?? ["", {}];
  return {
    id: wait.id,
    kind,
    json: {
      id: referenceJson(wait.id),
      definition: nullable(wait.definition, definitionRefJson),
      input: nullable(wait.view.input, text),
      detail: { kind, ...fields },
    },
  };
}

/** The schema's canonical order: process instance, element (both in Lean's `String` order), activation, detail kind. */
function publishedWaitLe(left: PublishedWait, right: PublishedWait): boolean {
  const instance = compareStrings(left.id.processInstanceId, right.id.processInstanceId);
  if (instance !== 0) return instance < 0;
  const element = compareStrings(left.id.element, right.id.element);
  if (element !== 0) return element < 0;
  if (left.id.activation !== right.id.activation) return left.id.activation < right.id.activation;
  return compareStrings(left.kind, right.kind) <= 0;
}

function failureJson(failure: InstanceFailure): JsonValue {
  return {
    code: failure.code,
    message: nullable(failure.message, text),
    occurrence: referenceJson(failure.occurrence),
    related: failure.related.map(([name, ref]) => ({ name, occurrence: referenceJson(ref) })),
  };
}

/** The state observation; `failure` appears only in a failed state. */
function scopeJson(scope: PublishedScope): JsonValue {
  const place = scope.element === null ? {} : { elementId: scope.element, activation: scope.activation };
  return {
    scope: { processInstanceId: scope.processInstanceId, role: scopeRoleName(scope.role), ...place },
    variables: bindingsToJson(scope.variables),
  };
}

export function observationJson(program: Program, state: State): JsonValue {
  const view = hostView(program, state);
  const waits = mergeSort(view.openWaits.map(openWait), publishedWaitLe);
  return {
    kind: "state",
    instanceId: state.instanceId,
    status: statusName(view.status),
    logicalTimeMs: state.logicalTimeMs,
    variables: bindingsToJson(variables(state)),
    scopes: scopes(program, state).map(scopeJson),
    openWaits: waits.map((wait) => wait.json),
    ...(view.failure === null ? {} : { failure: failureJson(view.failure) }),
  };
}

/** `code` appears only on an input that did not commit. */
function commandJson(commandId: string, outcome: string, code: string | null): JsonValue {
  return code === null ? { kind: "command", commandId, outcome } : { kind: "command", commandId, outcome, code };
}

function snapshot(program: Program, state: State | null): JsonValue[] {
  return state === null ? [] : [observationJson(program, state)];
}

/** The trace after deployment and the scenario outcome. */
function execute(program: Program, stimuli: readonly ScenarioStimulus[]): readonly [JsonValue[], string] {
  const trace: JsonValue[] = [];
  let state: State | null = null;
  for (const [index, [commandId, input]] of stimuli.entries()) {
    const outcome = step(hooks, program, state, input);
    if (outcome.ok) {
      trace.push(commandJson(commandId, "committed", null), ...snapshot(program, outcome.value));
      state = outcome.value;
      continue;
    }
    const name = failureName(outcome.failure);
    trace.push(commandJson(commandId, name, failureCode(outcome.failure)), ...snapshot(program, state));
    const continues = outcome.failure.tag === FailureTag.Rejected && index < stimuli.length - 1;
    if (!continues) return [trace, name];
  }
  return [trace, "committed"];
}

/** `code` appears only on a refused deployment. */
function deploymentJson(outcome: string, code: string | null): JsonValue {
  return code === null ? { kind: "deployment", outcome } : { kind: "deployment", outcome, code };
}

const semantic = (outcome: string): JsonValue => ({ kind: "semantic", outcome });

/** The result of a refused deployment, which runs no input; `code` names the refusal. */
export function unsupportedDeploymentResult(code: string): JsonValue {
  return { outcome: semantic("unsupported"), trace: [deploymentJson("unsupported", code)] };
}

function result(program: Program, stimuli: readonly ScenarioStimulus[]): JsonValue {
  const code = admit(program);
  if (code !== null) return unsupportedDeploymentResult(code);
  const [trace, outcome] = execute(program, stimuli);
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

function stimulusOf(json: unknown, where: string): ScenarioStimulus {
  const decoded = stimulusFromJson(json);
  if (!decoded.ok) throw new Error(`${where}: ${decoded.refusal}`);
  return decoded.value;
}

function stimuliFromJson(json: unknown, where: string): readonly ScenarioStimulus[] {
  return arrayField(json, "stimuli", where).map((item) => stimulusOf(item, where));
}

function programFromJson(programJson: unknown, where: string): Program {
  const program = decodeProgram(programJson);
  if (!program.ok) throw new Error(`${where}: ${program.refusal}`);
  return program.value;
}

/** `kernelRun <program.json> <scenario.json>`. */
export function runScenario(programJson: unknown, scenarioJson: unknown): unknown {
  const program = programFromJson(programJson, "program");
  return result(program, stimuliFromJson(scenarioJson, "scenario"));
}

// Host-view mode

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

/** A resolved Timer schedule: `{durationMs}` or `{cycle: {periodMs, repetitions}}`, `repetitions` null when unbounded. */
function resolvedTimerJson(timer: Resolved): JsonValue {
  switch (timer.tag) {
    case ResolvedTag.Duration:
      return { durationMs: timer.ms };
    case ResolvedTag.Cycle:
      return { cycle: { periodMs: timer.periodMs, repetitions: nullable(timer.repetitions, number) } };
  }
  return assertNever(timer);
}

function correlatedChannelJson(group: CorrelatedChannel): JsonValue {
  return {
    channel: channelToJson(group.channel),
    catches: group.catches.map((entry) => ({
      elementId: entry.element,
      criteria: entry.criteria.map((criterion) => ({ key: criterion.key, value: encodeExpression(criterion.value) })),
    })),
  };
}

export function capabilitiesJson(capabilities: Capabilities): JsonValue {
  return {
    starts: capabilities.starts.map((start) => ({
      startEventId: start.startEventId,
      ...(start.channel === null ? {} : { channel: channelToJson(start.channel) }),
      ...(start.timer === null ? {} : { timer: resolvedTimerJson(start.timer) }),
    })),
    correlatedChannels: capabilities.correlatedChannels.map(correlatedChannelJson),
    relations: [...capabilities.relations],
  };
}

/** `kernelRun --host-view <program.json> <scenario.json>`. */
export function runHostView(programJson: unknown, scenarioJson: unknown): unknown {
  const program = programFromJson(programJson, "program");
  const stimuli = stimuliFromJson(scenarioJson, "scenario");
  const views = admit(program) !== null ? [] : hostViews(program, stimuli);
  return {
    result: result(program, stimuli),
    hostRequirements: requirementsJson(hostRequirements(program)),
    definitionCapabilities: capabilitiesJson(definitionCapabilities(program)),
    hostViews: views.map(hostViewJson),
  };
}

// Population mode

/** An instance step names its instance and definition; every step of one instance names the same definition. */
interface Script {
  readonly instanceId: string;
  readonly definitionRef: string;
}

function definitionOf(definitions: readonly (readonly [string, Definition])[], ref: string, where: string): Definition {
  const definition = definitions.find(([key]) => key === ref)?.[1];
  if (definition === undefined) throw new Error(`${where}: unknown definition ${ref}`);
  return definition;
}

/** A correlated publication: its address names a scenario definition by `definitionRef`. */
function publicationFromJson(definitions: readonly (readonly [string, Definition])[], json: unknown, where: string): Publication {
  const address = field(json, "address", where);
  const payload = field(json, "payload", where);
  const payloadKind = stringField(payload, "kind", where);
  if (payloadKind !== "string") throw new Error(`${where}: unknown publication payload kind ${payloadKind}`);
  const commandId = stringField(json, "commandId", where);
  const definition = definitionOf(definitions, stringField(address, "definitionRef", where), where).ref;
  const processId = stringField(address, "processId", where);
  const channel = channelFromJson(field(address, "channel", where));
  if (!channel.ok) throw new Error(`${where}: ${channel.refusal}`);
  return {
    commandId,
    address: { definition, processId, channel: channel.value, correlationKey: stringField(address, "correlationKeyId", where) },
    payload: stringField(payload, "value", where),
  };
}

/**
 * One population step, in scenario order, with the instances seen so far: an instance's start must name the step's
 * instance, and a broadcast, which the kernel's population does not implement, refuses the scenario.
 */
function stepFromJson(
  definitions: readonly (readonly [string, Definition])[],
  scripts: Script[],
  json: unknown,
  where: string,
): Stimulus {
  const kind = stringField(json, "kind", where);
  if (kind === "instance") {
    const script: Script = { instanceId: stringField(json, "instanceId", where), definitionRef: stringField(json, "definitionRef", where) };
    const stimulus = field(json, "stimulus", where);
    if (isObject(stimulus) && stimulus["kind"] === "start") {
      const started = stringField(stimulus, "instanceId", where);
      if (started !== script.instanceId) throw new Error(`${where}: step of ${script.instanceId} starts ${started}`);
    }
    const [commandId, input] = stimulusOf(stimulus, where);
    const definition = definitionOf(definitions, script.definitionRef, where);
    const index = scripts.findIndex((known) => known.instanceId === script.instanceId);
    if (index === -1) {
      scripts.push(script);
      return { tag: StimulusTag.Input, script: scripts.length - 1, definition, commandId, input };
    }
    if (scripts[index]?.definitionRef !== script.definitionRef) {
      throw new Error(`${where}: instance ${script.instanceId} names two definitions`);
    }
    return { tag: StimulusTag.Input, script: index, definition, commandId, input };
  }
  if (kind === "publish") return { tag: StimulusTag.Publish, publication: publicationFromJson(definitions, json, where) };
  throw new Error(`${where}: unsupported population step ${kind}`);
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
    processStates: population.instances.map((member) => observationJson(member.definition.program, member.state)),
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
    const id = stringField(resource, "definitionRef", where);
    const ref = definitionRefFromJson(field(resource, "bpmn", where), profile, where);
    if (program.identity.sourceSha256 !== ref.sourceSha256 || program.identity.profile !== profile) {
      throw new Error(`program ${index}: program identity differs from definition ${id}`);
    }
    return [id, { ref, program }];
  });
  const scripts: Script[] = [];
  const stimuli = arrayField(scenarioJson, "steps", where).map((json) => stepFromJson(definitions, scripts, json, where));
  const population = runInstances(hooks, definitions.map(([, definition]) => definition), stimuli);
  if (!population.ok) throw new Error(`${where}: ${population.error}`);
  return populationResultJson(scenarioId, population.value);
}

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
 * (`contracts/schemas/engine-population-scenario.schema.json`), one deployment source per deployment in deploy order
 * (`run/population.ts`) and one digest per step. Its entry lives here because this is the one module that may import
 * both registries; `run/population.ts` reads the scenario and renders the result. A source the reader or admission
 * refuses is a refused deployment, a result; a malformed population scenario is a harness error with a stable code,
 * thrown.
 */
import { assertNever, compareStrings, mergeSort, type DefinitionRef, type Program } from "./il/types.js";
import { bindingsToJson, decodeProgram, encodeExpression, type JsonValue } from "./il/codec.js";
import { channelToJson, failureCode, failureName, firingStimulusFromJson, signalAddressToJson } from "./il/codec/stimulus.js";
import {
  CauseTag,
  FailureTag,
  type Cause,
  type EffectDetail,
  type Input,
  type InstanceFailure,
  type OccurrenceKey,
  type BroadcastIntent,
  type OccurrenceRef,
  type Outcome,
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
  type StartCapability,
  type View,
  type WaitAddress,
} from "./host.js";
import { ResolvedTag, type Resolved } from "./il/timer.js";
import { runStimuli as runInstances } from "./population.js";
import { onTimeRefusal } from "./population/timers.js";
import { hooks } from "./registry.js";
import { admit } from "./admission-registry.js";
import { arrayField, field, referenceJson, requiredString, type ScenarioStimulus } from "./run/wire.js";
import {
  definitionRefFromJson, deploymentSourceFromJson, populationResultJson, stimuliOfPopulation, type Declared,
} from "./run/population.js";

/** A present value, or JSON null: the schema's nullable members. */
function nullable<T>(value: T | null, encode: (value: T) => JsonValue): JsonValue {
  return value === null ? null : encode(value);
}

const jsonString = (value: string): JsonValue => value;
const number = (value: number): JsonValue => value;
const flag = (value: boolean): JsonValue => value;

function definitionRefJson(ref: DefinitionRef): JsonValue {
  return {
    key: ref.key,
    version: nullable(ref.version, number),
    versionTag: nullable(ref.versionTag, jsonString),
    deployment: nullable(ref.deployment, number),
    tenant: nullable(ref.tenant, jsonString),
    sourceSha256: nullable(ref.sourceSha256, jsonString),
  };
}

function effectFields(effect: EffectDetail): Record<string, JsonValue> {
  return {
    protocol: effect.protocol,
    operation: effect.operation,
    arguments: bindingsToJson(effect.arguments),
    failures: effect.failures,
    send: nullable(effect.send, (send) => ({ recipient: nullable(send.recipient, jsonString), correlation: bindingsToJson(send.correlation) })),
  };
}

function userTaskFields(task: UserTaskDetail): Record<string, JsonValue> {
  return {
    name: nullable(task.name, jsonString),
    assignee: nullable(task.assignee, jsonString),
    candidateUsers: [...task.candidateUsers],
    candidateGroups: [...task.candidateGroups],
    formKey: nullable(task.formKey, jsonString),
    formFields: task.formFields.map(([key, type]) => ({ key, type })),
    dueDate: nullable(task.dueDate, jsonString),
    followUpDate: nullable(task.followUpDate, jsonString),
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
  if (view.signal !== null) return ["signal", { ...signalAddressToJson(view.signal.address), payload: view.signal.payload }];
  if (view.conditional !== null) {
    const condition = view.conditional;
    return ["conditional", {
      variableName: nullable(condition.variableName, jsonString),
      variableEvents: [...condition.variableEvents],
      lastValue: nullable(condition.lastValue, flag),
    }];
  }
  if (view.deadlineMs !== null) {
    return ["timer", {
      deadlineMs: view.deadlineMs,
      recurrence: nullable(view.recurrence, (recurrence) => ({
        periodMs: nullable(recurrence.periodMs, number),
        cron: nullable(recurrence.cron, jsonString),
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

function renderWait(wait: OpenWait): PublishedWait {
  // Every view sets exactly one detail field, so the empty fallback never renders.
  const [kind, fields] = detail(wait.view) ?? ["", {}];
  return {
    id: wait.id,
    kind,
    json: {
      id: referenceJson(wait.id),
      definition: nullable(wait.definition, definitionRefJson),
      input: nullable(wait.view.input, jsonString),
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
    message: nullable(failure.message, jsonString),
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

/**
 * A Signal an input threw to the population: kernel-only, since an observer sees an intent only through its receivers
 * (PC-SIGNAL-01).
 */
function broadcastJson(intent: BroadcastIntent): JsonValue {
  return {
    ...signalAddressToJson(intent.address),
    variables: bindingsToJson(intent.variables),
    ...(intent.businessKey === null ? {} : { businessKey: intent.businessKey }),
    origin: referenceJson(intent.origin),
  };
}

/** `broadcasts` when the input threw a Signal to the population, else nothing. */
function broadcastsJson(intents: readonly BroadcastIntent[]): Record<string, JsonValue> {
  return intents.length === 0 ? {} : { broadcasts: intents.map(broadcastJson) };
}

/** The state observation; `failure` appears only in a failed state, `broadcasts` only after an input that threw a Signal to the population. */
export function observationJson(program: Program, state: State): JsonValue {
  const view = hostView(program, state);
  const waits = mergeSort(view.openWaits.map(renderWait), publishedWaitLe);
  return {
    kind: "state",
    instanceId: state.instanceId,
    status: statusName(view.status),
    logicalTimeMs: state.logicalTimeMs,
    variables: bindingsToJson(variables(state)),
    scopes: scopes(program, state).map(scopeJson),
    openWaits: waits.map((wait) => wait.json),
    ...(view.failure === null ? {} : { failure: failureJson(view.failure) }),
    ...broadcastsJson(view.broadcasts),
  };
}

/** `code` appears only on an input that did not commit. */
function commandJson(commandId: string, outcome: string, code: string | null): JsonValue {
  return code === null ? { kind: "command", commandId, outcome } : { kind: "command", commandId, outcome, code };
}

function snapshot(program: Program, state: State | null): JsonValue[] {
  return state === null ? [] : [observationJson(program, state)];
}

/** A scenario stimulus with the refusal it meets before its step, `null` for none. */
type CheckedStimulus = readonly [ScenarioStimulus, string | null];

/** A stimulus's step, or its refusal before the step when one is given. */
function stepChecked(program: Program, state: State | null, input: Input, refusal: string | null): Outcome {
  return refusal === null ? step(hooks, program, state, input) : { ok: false, failure: { tag: FailureTag.Rejected, code: refusal } };
}

/** The trace after deployment and the scenario outcome; a stimulus's refusal, when given, rejects it before the step. */
function execute(program: Program, stimuli: readonly CheckedStimulus[]): readonly [JsonValue[], string] {
  const trace: JsonValue[] = [];
  let state: State | null = null;
  for (const [index, [[commandId, input], refusal]] of stimuli.entries()) {
    const outcome = stepChecked(program, state, input, refusal);
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

function result(program: Program, stimuli: readonly CheckedStimulus[]): JsonValue {
  const code = admit(program);
  if (code !== null) return unsupportedDeploymentResult(code);
  const [trace, outcome] = execute(program, stimuli);
  return { outcome: semantic(outcome), trace: [deploymentJson("committed", null), ...trace] };
}


/** The stimuli with the refusal of each single-instance Timer start that is not on time (`onTimeRefusal`). */
function stimuliFromJson(program: Program, json: unknown, where: string): readonly CheckedStimulus[] {
  return arrayField(json, "stimuli", where).map((item) => {
    const decoded = firingStimulusFromJson(item);
    if (!decoded.ok) throw new Error(`${where}: ${decoded.refusal}`);
    const [commandId, input, firing] = decoded.value;
    return [[commandId, input], firing === null ? null : onTimeRefusal(program, firing.startEvent, firing.dueMs)] as const;
  });
}

function programFromJson(programJson: unknown, where: string): Program {
  const program = decodeProgram(programJson);
  if (!program.ok) throw new Error(`${where}: ${program.refusal}`);
  return program.value;
}

/** `kernelRun <program.json> <scenario.json>`. */
export function runScenario(programJson: unknown, scenarioJson: unknown): unknown {
  const program = programFromJson(programJson, "program");
  return result(program, stimuliFromJson(program, scenarioJson, "scenario"));
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

function addressJson(address: WaitAddress): JsonValue {
  return {
    occurrence: referenceJson(address.occurrence),
    ...(address.message === null ? {} : {
      message: { channel: channelToJson(address.message.channel), ...(address.message.name === null ? {} : { name: address.message.name }) },
    }),
    ...(address.signal === null ? {} : { signal: signalAddressToJson(address.signal) }),
  };
}

/** `addresses` appears only when an open wait has one; the scenario contract's `waitJson` stays as it is. */
export function hostViewJson(view: View): JsonValue {
  return {
    status: statusName(view.status),
    openWaits: view.openWaits.map(waitJson),
    journal: view.journal.map(transitionJson),
    ...(view.failure === null ? {} : { failure: failureViewJson(view.failure) }),
    ...broadcastsJson(view.broadcasts),
    ...(view.addresses.length === 0 ? {} : { addresses: view.addresses.map(addressJson) }),
  };
}

/** Every committed input's host view, up to the first input that neither commits nor is rejected. */
function hostViews(program: Program, stimuli: readonly CheckedStimulus[]): readonly View[] {
  const views: View[] = [];
  let state: State | null = null;
  for (const [[, input], refusal] of stimuli) {
    const outcome = stepChecked(program, state, input, refusal);
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

/**
 * A resolved Timer schedule: `{durationMs}`, `{instantMs}`, `{cycle: {periodMs, repetitions}}` (`repetitions` null when
 * unbounded) or `{cron}`.
 */
function resolvedTimerJson(timer: Resolved): JsonValue {
  switch (timer.tag) {
    case ResolvedTag.Duration:
      return { durationMs: timer.ms };
    case ResolvedTag.Date:
      return { instantMs: timer.instantMs };
    case ResolvedTag.Cycle:
      return { cycle: { periodMs: timer.periodMs, repetitions: nullable(timer.repetitions, number) } };
    case ResolvedTag.Cron:
      return { cron: timer.text };
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

/**
 * A start's trigger as the engine API offers it: its kind, the vocabulary's `startTrigger` name, and for a Message start
 * its channel and literal name.
 */
function startTriggerJson(start: StartCapability): JsonValue {
  if (start.channel !== null) {
    return { kind: "message", channel: channelToJson(start.channel), ...(start.messageName === null ? {} : { messageName: start.messageName }) };
  }
  return { kind: start.schedule !== null ? "timer" : start.signal ? "signal" : start.condition ? "condition" : "none" };
}

export function capabilitiesJson(capabilities: Capabilities): JsonValue {
  return {
    starts: capabilities.starts.map((start) => ({
      startEventId: start.startEventId,
      trigger: startTriggerJson(start),
      ...(start.schedule === null ? {} : { schedule: resolvedTimerJson(start.schedule) }),
    })),
    correlatedChannels: capabilities.correlatedChannels.map(correlatedChannelJson),
    relations: [...capabilities.relations],
  };
}

/** `kernelRun --host-view <program.json> <scenario.json>`. */
export function runHostView(programJson: unknown, scenarioJson: unknown): unknown {
  const program = programFromJson(programJson, "program");
  const stimuli = stimuliFromJson(program, scenarioJson, "scenario");
  const views = admit(program) !== null ? [] : hostViews(program, stimuli);
  return {
    result: result(program, stimuli),
    hostRequirements: requirementsJson(hostRequirements(program)),
    definitionCapabilities: capabilitiesJson(definitionCapabilities(program)),
    hostViews: views.map(hostViewJson),
  };
}

// Population mode

/**
 * `kernelRun --population <digests.json> <source.json>... <population-scenario.json>`: one deployment source per
 * deployment, in deploy order, and one digest per step. A program the admission registry refuses is a refused
 * deployment.
 */
export function runPopulation(sourceJsons: readonly unknown[], scenarioJson: unknown, digests: readonly string[]): unknown {
  const where = "population scenario";
  const scenarioId = requiredString(scenarioJson, "id", where);
  const profile = requiredString(scenarioJson, "profile", where);
  const declared = arrayField(scenarioJson, "definitions", where).map((resource): Declared => ({
    definitionRef: requiredString(resource, "definitionRef", where),
    ref: definitionRefFromJson(field(resource, "bpmn", where), profile, where),
  }));
  const sources = sourceJsons.map((json, index) => deploymentSourceFromJson(json, `source ${index}`));
  const stimuli = stimuliOfPopulation(declared, sources, arrayField(scenarioJson, "steps", where), digests, where);
  const population = runInstances(hooks, admit, stimuli);
  if (!population.ok) throw new Error(`${where}: ${population.error}`);
  return populationResultJson(observationJson, scenarioId, population.value);
}

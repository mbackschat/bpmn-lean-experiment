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
import { bindingsToJson, decodeProgram, encodeExpression, isObject, type Decoded, type JsonValue } from "./il/codec.js";
import {
  channelFromJson,
  channelToJson,
  decodeBindings,
  decodeCorrelation,
  decodeSignalAddress,
  decodeStrictValue,
  failureCode,
  failureName,
  occurrenceFromJson,
  signalAddressToJson,
  stimulusFromJson,
} from "./il/codec/stimulus.js";
import {
  CauseTag,
  FailureTag,
  type Cause,
  type EffectDetail,
  type InstanceFailure,
  type Binding,
  type Failure,
  type Input,
  type OccurrenceKey,
  type BroadcastIntent,
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
  CommandTag,
  DefinitionSelectorTag,
  DeploymentOutcomeTag,
  FanOutEntryTag,
  MessageAddressTag,
  PublishMode,
  ReceiverTag,
  ResolutionTag,
  StimulusTag,
  runStimuli as runInstances,
  type Command,
  type DefinitionSelector,
  type DeploymentRef,
  type DeploymentResult,
  type FanOutEntry,
  type Publication,
  type Receiver,
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

/** Lean's `Json.getObjVal?`: the key must be present. */
function field(json: unknown, key: string, where: string): unknown {
  if (!isObject(json) || !Object.hasOwn(json, key)) throw new Error(`${where}: property not found: ${key}`);
  return json[key];
}

/** Lean's `getObjValAs? String`: an absent key reads as `null`, which is no String. */
function requiredString(json: unknown, key: string, where: string): string {
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
    sourceId: requiredString(resource, "id", where),
    sourceSha256: requiredString(resource, "sha256", where),
    overlay: overlay === null ? null : { id: requiredString(overlay, "id", where), sha256: requiredString(overlay, "sha256", where) },
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
    ...broadcastsJson(view.broadcasts),
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

export function capabilitiesJson(capabilities: Capabilities): JsonValue {
  return {
    starts: capabilities.starts.map((start) => ({
      startEventId: start.startEventId,
      ...(start.channel === null ? {} : { channel: channelToJson(start.channel) }),
      ...(start.messageName === null ? {} : { messageName: start.messageName }),
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

/** A scenario definition with the program the harness compiled for it. */
interface Declared {
  readonly definitionRef: string;
  readonly ref: DeploymentRef;
  readonly program: Program;
}

/** A malformed population scenario: a harness refusal with its stable code (contract §2.2, §7). */
function harnessRefusal(where: string, code: string, detail: string): never {
  throw new Error(`${where}: ${code}: ${detail}`);
}

function declaredOf(declared: readonly Declared[], definitionRef: string, where: string): Declared {
  return declared.find((entry) => entry.definitionRef === definitionRef) ??
    harnessRefusal(where, "population-unknown-definition", definitionRef);
}

function decoded<T>(value: Decoded<T>, where: string): T {
  if (!value.ok) throw new Error(`${where}: ${value.refusal}`);
  return value.value;
}

/** Lean's `getObjValAs? Nat`. */
function natural(json: unknown, key: string, where: string): number {
  const value = isObject(json) && Object.hasOwn(json, key) ? json[key] : null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${where}: ${key}: Nat expected`);
  return value;
}

const optional = (json: unknown, key: string): unknown => (isObject(json) && Object.hasOwn(json, key) ? json[key] : undefined);

/** A command's optional business key. */
function businessKeyOf(json: unknown, where: string): string | null {
  return optional(json, "businessKey") === undefined ? null : requiredString(json, "businessKey", where);
}

/** `{processKey}` names a key's current deployment, `{deploymentId}` one deployment; absent, no definition. */
function selectorFromJson(json: unknown, where: string): DefinitionSelector | null {
  if (json === undefined) return null;
  if (optional(json, "processKey") !== undefined) {
    return { tag: DefinitionSelectorTag.ProcessKey, key: requiredString(json, "processKey", where) };
  }
  return { tag: DefinitionSelectorTag.Deployment, deploymentId: natural(json, "deploymentId", where) };
}

/** A discovery order's entry: `{kind: "occurrence", occurrence}` or `{kind: "start", deploymentId, startEvent}`. */
function receiverFromJson(json: unknown, where: string): Receiver {
  const kind = requiredString(json, "kind", where);
  if (kind === "occurrence") return { tag: ReceiverTag.Occurrence, ref: decoded(occurrenceFromJson(field(json, "occurrence", where)), where) };
  if (kind === "start") {
    return { tag: ReceiverTag.Start, deploymentId: natural(json, "deploymentId", where), startEvent: requiredString(json, "startEvent", where) };
  }
  throw new Error(`${where}: unknown receiver kind ${kind}`);
}

function orderFromJson(json: unknown, where: string): readonly Receiver[] | null {
  return optional(json, "order") === undefined ? null : arrayField(json, "order", where).map((entry) => receiverFromJson(entry, where));
}

const publishModes: ReadonlyMap<string, PublishMode> = new Map(Object.values(PublishMode).map((mode) => [mode, mode]));

function publicationFromJson(json: unknown, where: string): Publication {
  const address = field(json, "address", where);
  const channel = optional(address, "channel");
  const name = optional(address, "name");
  if ((channel === undefined) === (name === undefined)) throw new Error(`${where}: a publication names a channel or a name`);
  const mode = publishModes.get(requiredString(json, "mode", where));
  if (mode === undefined) throw new Error(`${where}: unknown publication mode`);
  const payload = optional(json, "payload");
  return {
    commandId: requiredString(json, "commandId", where),
    definition: selectorFromJson(optional(address, "definition"), where),
    message: channel === undefined
      ? { tag: MessageAddressTag.Name, name: requiredString(address, "name", where) }
      : { tag: MessageAddressTag.Channel, channel: decoded(channelFromJson(channel), where) },
    criteria: arrayField(json, "criteria", where).map((entry) => decoded(decodeCorrelation(entry), where)),
    payload: payload === undefined ? null : decoded(decodeStrictValue(payload), where),
    variables: decoded(decodeBindings(json, "variables"), where),
    businessKey: businessKeyOf(json, where),
    mode,
  };
}

/** A population command step, or `null` for another step kind. */
function commandFromJson(kind: string, json: unknown, where: string): Command | null {
  const commandId = (): string => requiredString(json, "commandId", where);
  const variables = (): readonly Binding[] => decoded(decodeBindings(json, "variables"), where);
  switch (kind) {
    case "publish":
      return { tag: CommandTag.Publish, publication: publicationFromJson(json, where) };
    case "broadcast":
      return {
        tag: CommandTag.Broadcast,
        broadcast: { commandId: commandId(), address: decoded(decodeSignalAddress(field(json, "address", where)), where), variables: variables(), order: orderFromJson(json, where) },
      };
    case "evaluateConditions":
      return {
        tag: CommandTag.EvaluateConditions,
        evaluation: {
          commandId: commandId(), definition: selectorFromJson(optional(json, "definition"), where), variables: variables(),
          businessKey: businessKeyOf(json, where), order: orderFromJson(json, where),
        },
      };
    case "timerStart":
      return {
        tag: CommandTag.TimerStart,
        timerStart: {
          commandId: commandId(), deploymentId: natural(json, "deploymentId", where),
          startEvent: requiredString(json, "startEvent", where), dueMs: natural(json, "dueMs", where),
        },
      };
  }
  return null;
}

/**
 * An instance step's input. Its stimulus keeps its own `at`, which must equal the step's when both are given; a step
 * `at` the stimulus lacks becomes the input's.
 */
function instanceInput(json: unknown, at: number | null, where: string): ScenarioStimulus {
  const stimulus = field(json, "stimulus", where);
  const own = optional(stimulus, "at");
  if (at === null || own !== undefined) {
    if (at !== null && own !== at) harnessRefusal(where, "population-time-mismatch", `stimulus at ${String(own)}, step at ${at}`);
    return stimulusOf(stimulus, where);
  }
  return stimulusOf({ ...(stimulus as Record<string, unknown>), at }, where);
}

/**
 * The population's stimuli, in scenario order: the definitions no `deploy` step names deploy at 0 in list order, then
 * every step at its logical time, which a step gives as `at` or inherits from the step before (0 for the first) and
 * which never decreases. `digests` holds each step's digest of its canonical wire form, which the harness computes.
 */
function stimuliOfPopulation(declared: readonly Declared[], steps: readonly unknown[], digests: readonly string[], where: string): Stimulus[] {
  if (digests.length !== steps.length) throw new Error(`${where}: ${steps.length} steps, ${digests.length} digests`);
  const deployedByStep = steps.flatMap((json) => requiredString(json, "kind", where) === "deploy"
    ? [declaredOf(declared, requiredString(json, "definitionRef", where), where).definitionRef] : []);
  const stimuli: Stimulus[] = declared.filter((entry) => !deployedByStep.includes(entry.definitionRef))
    .map((entry) => ({ tag: StimulusTag.Deploy, definitionRef: entry.definitionRef, ref: entry.ref, program: entry.program, atMs: 0 }));
  const scripts: Script[] = [];
  let clock = 0;
  steps.forEach((json, index) => {
    const at = optional(json, "at") === undefined ? null : natural(json, "at", where);
    if (at !== null && at < clock) harnessRefusal(where, "population-time-backward", `step ${index} at ${at} after ${clock}`);
    clock = at ?? clock;
    const kind = requiredString(json, "kind", where);
    if (kind === "deploy") {
      const entry = declaredOf(declared, requiredString(json, "definitionRef", where), where);
      stimuli.push({ tag: StimulusTag.Deploy, definitionRef: entry.definitionRef, ref: entry.ref, program: entry.program, atMs: clock });
      return;
    }
    if (kind === "instance") {
      stimuli.push(instanceStimulus(declared, scripts, json, at, where));
      return;
    }
    const command = commandFromJson(kind, json, where);
    if (command === null) throw new Error(`${where}: unsupported population step ${kind}`);
    stimuli.push({ tag: StimulusTag.Command, command, atMs: clock, digest: digests[index] ?? "" });
  });
  return stimuli;
}

/** An instance step, with the scripts seen so far: an instance's start must name the step's instance. */
function instanceStimulus(declared: readonly Declared[], scripts: Script[], json: unknown, at: number | null, where: string): Stimulus {
  const script: Script = { instanceId: requiredString(json, "instanceId", where), definitionRef: requiredString(json, "definitionRef", where) };
  declaredOf(declared, script.definitionRef, where);
  const stimulus = field(json, "stimulus", where);
  if (isObject(stimulus) && stimulus["kind"] === "start") {
    const started = requiredString(stimulus, "instanceId", where);
    if (started !== script.instanceId) throw new Error(`${where}: step of ${script.instanceId} starts ${started}`);
  }
  const [commandId, input] = instanceInput(json, at, where);
  const index = scripts.findIndex((known) => known.instanceId === script.instanceId);
  if (index === -1) {
    scripts.push(script);
    return { tag: StimulusTag.Input, script: scripts.length - 1, definitionRef: script.definitionRef, commandId, input };
  }
  if (scripts[index]?.definitionRef !== script.definitionRef) {
    throw new Error(`${where}: instance ${script.instanceId} names two definitions`);
  }
  return { tag: StimulusTag.Input, script: index, definitionRef: script.definitionRef, commandId, input };
}

function failureFields(failure: Failure): Record<string, JsonValue> {
  return { outcome: failureName(failure), code: failureCode(failure) };
}

function receiverJson(receiver: Receiver): JsonValue {
  switch (receiver.tag) {
    case ReceiverTag.Occurrence:
      return { kind: "occurrence", occurrence: referenceJson(receiver.ref) };
    case ReceiverTag.Start:
      return { kind: "start", deploymentId: receiver.deploymentId, startEvent: receiver.startEvent };
  }
  return assertNever(receiver);
}

function fanOutEntryJson(entry: FanOutEntry): JsonValue {
  switch (entry.tag) {
    case FanOutEntryTag.Delivered:
      return { kind: "delivered", target: referenceJson(entry.target) };
    case FanOutEntryTag.Started:
      return {
        kind: "started", instanceId: entry.instanceId, deploymentId: entry.deploymentId, version: entry.version,
        startEvent: entry.startEvent,
      };
    case FanOutEntryTag.Skipped:
      return { kind: "skipped", target: referenceJson(entry.target) };
    case FanOutEntryTag.Failed:
      return { kind: "failed", target: receiverJson(entry.target), ...failureFields(entry.failure) };
  }
  return assertNever(entry);
}

function resolutionJson(resolution: Resolution): JsonValue {
  switch (resolution.tag) {
    case ResolutionTag.Committed:
      return { kind: "committed", target: referenceJson(resolution.target) };
    case ResolutionTag.Failed:
      return { kind: "failed", target: referenceJson(resolution.target), ...failureFields(resolution.failure) };
    case ResolutionTag.FanOut:
      return { kind: "fanOut", entries: resolution.entries.map(fanOutEntryJson) };
    case ResolutionTag.NoMatch:
      return { kind: "noMatch" };
    case ResolutionTag.Ambiguous:
      return { kind: "ambiguous" };
    case ResolutionTag.Rejected:
      return { kind: "rejected", code: resolution.code };
    case ResolutionTag.Unsupported:
      return { kind: "unsupported", code: resolution.code };
  }
  return assertNever(resolution);
}

function deploymentResultJson(deployment: DeploymentResult): JsonValue {
  const outcome = deployment.outcome;
  return {
    deploymentId: deployment.deploymentId,
    definitionRef: deployment.definitionRef,
    versions: deployment.versions.map(([key, version]) => ({ key, version })),
    outcome: outcome.tag === DeploymentOutcomeTag.Deployed ? { kind: "deployed" } : { kind: "deploymentRefused", code: outcome.code },
  };
}

function populationResultJson(scenarioId: string, population: PopulationResult): JsonValue {
  const inputFailures = population.inputFailures.length === 0 ? {} : {
    inputFailures: population.inputFailures.map(([commandId, failure]) => ({ commandId, ...failureFields(failure) })),
  };
  return {
    ...inputFailures,
    kind: "enginePopulationResult",
    scenarioId,
    deployments: population.deployments.map(deploymentResultJson),
    steps: population.steps.map((stepped) => ({
      commandId: stepped.commandId, ordinal: stepped.ordinal, at: stepped.atMs, resolution: resolutionJson(stepped.resolution),
    })),
    processStates: population.instances.map((member) => observationJson(member.deployment.program, member.state)),
  };
}

/**
 * `kernelRun --population <digests.json> <program.json>... <population-scenario.json>`: one program per scenario
 * definition, in order, and one digest per step. A program the admission registry refuses is a refused deployment.
 */
export function runPopulation(programJsons: readonly unknown[], scenarioJson: unknown, digests: readonly string[]): unknown {
  const where = "population scenario";
  const scenarioId = requiredString(scenarioJson, "id", where);
  const profile = requiredString(scenarioJson, "profile", where);
  const resources = arrayField(scenarioJson, "definitions", where);
  if (resources.length !== programJsons.length) {
    throw new Error(`${where}: ${resources.length} definitions, ${programJsons.length} programs`);
  }
  const declared = resources.map((resource, index): Declared => {
    const program = programFromJson(programJsons[index], `program ${index}`);
    const definitionRef = requiredString(resource, "definitionRef", where);
    const ref = definitionRefFromJson(field(resource, "bpmn", where), profile, where);
    if (program.identity.sourceSha256 !== ref.sourceSha256 || program.identity.profile !== profile) {
      throw new Error(`program ${index}: program identity differs from definition ${definitionRef}`);
    }
    return { definitionRef, ref, program };
  });
  const stimuli = stimuliOfPopulation(declared, arrayField(scenarioJson, "steps", where), digests, where);
  const population = runInstances(hooks, admit, stimuli);
  if (!population.ok) throw new Error(`${where}: ${population.error}`);
  return populationResultJson(scenarioId, population.value);
}

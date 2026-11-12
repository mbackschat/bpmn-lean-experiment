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
 *
 * `runFixture` returns the answer of one host-facing function no scenario run reaches (`kernelRun --fixture`), applied to
 * a kernel fixture's admitted programs and input. A fixture never carries its expected answer; the comparing test reads
 * that from a separate file. A malformed fixture is a harness error with a stable `fixture-` code, thrown.
 *
 * `runBatchCase` returns the answer of one `kernelRun --batch` case: the mode its `entry` names over inline documents,
 * besides the modes above `ungated` (`ungatedRun`), `evaluate` (`evaluationAnswer`) and `stimulus` (the stimulus codec's
 * refusal), so the unit cases replay against the Lean kernel in one process. Because `ungated` runs a program past an
 * admission refusal, the published entry (`index.ts`) leaves it out: the package's test-only `./testing` export, this
 * module, offers it to the unit tests' pairing helper (`packages/kernel/test/lean-paired.ts`).
 */
import { assertNever, compareStrings, mergeSort, type DefinitionRef, type Program } from "./il/types.js";
import {
  bindingsFromJson, bindingsToJson, decodeExpression, decodeProgram, encodeExpression, encodeProgram, parseStrict, valueCodec,
  type JsonValue,
} from "./il/codec.js";
import {
  channelToJson, decodeBindings, decodeSignalAddress, failureCode, failureName, firingStimulusFromJson, signalAddressToJson,
  type TimerFiring,
} from "./il/codec/stimulus.js";
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
  refusesSignalVariables,
  rootStarts,
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
import { onTimeRefusal, timerOccurrences } from "./population/timers.js";
import { deploymentSummary, registerSummary, type DeploymentSummary } from "./population/deploy.js";
import { signalStartReceivers } from "./population/signals.js";
import { EvaluationTag } from "./hooks.js";
import { hooks } from "./registry.js";
import { admit } from "./admission-registry.js";
import { arrayField, field, nullable, referenceJson, requiredString, stimulusOf } from "./run/wire.js";
import {
  definitionRefFromJson, deploymentSourceFromJson, populationResultJson, receiverJson, stimuliOfPopulation, type Declared,
  type DeploymentSource,
} from "./run/population.js";
import {
  conditionalVerdictAnswer, fanOutScript, instanceIdAnswer, linearizedAnswer, messageReceiversAnswer, reachAnswers, signalAddressJson,
  signalReceiversAnswer, startCandidatesAnswer, timerChecks,
} from "./run/fixture.js";

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

/**
 * The step of a single-instance run: a stimulus stating a Timer firing (`firingStimulusFromJson`) is refused before the
 * step unless it is on time in the degenerate population (`onTimeRefusal`). A host that serves one instance per chain
 * steps every input through it with the firing its stimulus stated, so its verdicts are the runner's. The codec reads
 * the firing from the stimulus, so nothing outside the step matches the input.
 */
export function runStep(program: Program, state: State | null, input: Input, firing: TimerFiring | null): Outcome {
  const refusal = firing === null ? null : onTimeRefusal(program, firing.startEvent, firing.dueMs);
  return refusal === null ? step(hooks, program, state, input) : { ok: false, failure: { tag: FailureTag.Rejected, code: refusal } };
}

/** A scenario stimulus: its command identifier, its input and the Timer firing it states. */
type RunStimulus = readonly [string, Input, TimerFiring | null];

/** The trace after deployment and the scenario outcome. */
function execute(program: Program, stimuli: readonly RunStimulus[]): readonly [JsonValue[], string] {
  const trace: JsonValue[] = [];
  let state: State | null = null;
  for (const [index, [commandId, input, firing]] of stimuli.entries()) {
    const outcome = runStep(program, state, input, firing);
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

function result(program: Program, stimuli: readonly RunStimulus[]): JsonValue {
  const code = admit(program);
  if (code !== null) return unsupportedDeploymentResult(code);
  const [trace, outcome] = execute(program, stimuli);
  return { outcome: semantic(outcome), trace: [deploymentJson("committed", null), ...trace] };
}


/** A scenario's stimuli, decoded by the stimulus codec with the Timer firing each states. */
function stimuliFromJson(json: unknown, where: string): readonly RunStimulus[] {
  return arrayField(json, "stimuli", where).map((item) => {
    const decoded = firingStimulusFromJson(item);
    if (!decoded.ok) throw new Error(`${where}: ${decoded.refusal}`);
    return decoded.value;
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
function hostViews(program: Program, stimuli: readonly RunStimulus[]): readonly View[] {
  const views: View[] = [];
  let state: State | null = null;
  for (const [, input, firing] of stimuli) {
    const outcome = runStep(program, state, input, firing);
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

/**
 * The host-view run of `stimuli` over `program`: its result, host requirements, definition capabilities and the host view
 * of every committed input, none when admission refuses the program.
 */
function hostViewRun(program: Program, stimuli: readonly RunStimulus[]): JsonValue {
  const views = admit(program) !== null ? [] : hostViews(program, stimuli);
  return {
    result: result(program, stimuli),
    hostRequirements: requirementsJson(hostRequirements(program)),
    definitionCapabilities: capabilitiesJson(definitionCapabilities(program)),
    hostViews: views.map(hostViewJson),
  };
}

/** `kernelRun --host-view <program.json> <scenario.json>`. */
export function runHostView(programJson: unknown, scenarioJson: unknown): unknown {
  return hostViewRun(programFromJson(programJson, "program"), stimuliFromJson(scenarioJson, "scenario"));
}

// Population mode

/**
 * `kernelRun --population <digests.json> <source.json>... <population-scenario.json>`: one deployment source per
 * deployment, in deploy order, and one digest per step. A program the admission registry refuses is a refused
 * deployment.
 */
export function runPopulation(sourceJsons: readonly unknown[], scenarioJson: unknown, digests: readonly string[]): unknown {
  return populationRun(scenarioJson, sourceJsons.map((json, index) => deploymentSourceFromJson(json, `source ${index}`)), digests);
}

/** The population result of `scenarioJson` over the read deployment sources and the steps' digests. */
function populationRun(scenarioJson: unknown, sources: readonly DeploymentSource[], digests: readonly string[]): JsonValue {
  const where = "population scenario";
  const scenarioId = requiredString(scenarioJson, "id", where);
  const profile = requiredString(scenarioJson, "profile", where);
  const declared = arrayField(scenarioJson, "definitions", where).map((resource): Declared => ({
    definitionRef: requiredString(resource, "definitionRef", where),
    ref: definitionRefFromJson(field(resource, "bpmn", where), profile, where),
  }));
  const stimuli = stimuliOfPopulation(declared, sources, arrayField(scenarioJson, "steps", where), digests, where);
  const population = runInstances(hooks, admit, stimuli);
  if (!population.ok) throw new Error(`${where}: ${population.error}`);
  return populationResultJson(observationJson, scenarioId, population.value);
}

// Fixture mode

/** A fixture's programs, each decoded and admitted: the host applies these functions only to admitted programs. */
function fixturePrograms(fixture: unknown): readonly Program[] {
  return arrayField(fixture, "programs", "fixture").map((programJson) => {
    const program = programFromJson(programJson, "fixture");
    const code = admit(program);
    if (code !== null) throw new Error(`fixture-program-refused: ${code}`);
    return program;
  });
}

function onlyProgram(programs: readonly Program[]): Program {
  const [program, ...rest] = programs;
  if (program === undefined || rest.length > 0) throw new Error("fixture-program-count");
  return program;
}

/** The instance state after `stimuli`, each of which must commit; a fixture's population question is asked of a committed state only. */
function committedState(program: Program, stimuli: readonly unknown[]): State {
  let current: State | null = null;
  for (const stimulus of stimuli) {
    const [commandId, input] = stimulusOf(stimulus, "fixture");
    const outcome = step(hooks, program, current, input);
    if (!outcome.ok) throw new Error(`fixture-stimulus-not-committed: ${commandId} ${failureCode(outcome.failure)}`);
    current = outcome.value;
  }
  if (current === null) throw new Error("fixture-without-instance");
  return current;
}

/**
 * Each program's summary (`deploymentSummary`) registered in order as `deploymentIds` names it, over the summaries
 * registered before it, as the host's deployment ingress does: its own ordinal, then the versions or the refusal.
 */
function registrations(programs: readonly Program[], deploymentIds: readonly unknown[]): JsonValue {
  if (programs.length !== deploymentIds.length) throw new Error("fixture-deployment-count");
  const registry: DeploymentSummary[] = [];
  return programs.map((program, index): JsonValue => {
    const deploymentId = deploymentIds[index];
    if (typeof deploymentId !== "number" || !Number.isSafeInteger(deploymentId) || deploymentId < 0) {
      throw new Error("fixture: deploymentIds: Nat expected");
    }
    const candidate = deploymentSummary(program);
    const registered = registerSummary(registry, deploymentId, candidate);
    if (!registered.ok) return { ordinal: candidate.deploymentId, refused: registered.error };
    const { versions } = registered.value;
    registry.push({ ...candidate, deploymentId: registered.value.deploymentId, versions });
    return { ordinal: candidate.deploymentId, deploymentId: registered.value.deploymentId, versions: versions.map(([key, version]) => [key, version]) };
  });
}

function natField(json: unknown, key: string): number {
  const value = field(json, key, "fixture");
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`fixture: ${key}: Nat expected`);
  return value;
}

/** Each program's `timerOccurrences` for every start Event `startEvents` names, its summary deployed at `deployedAtMs`. */
function occurrenceAnswers(programs: readonly Program[], input: unknown): JsonValue {
  const deployedAtMs = natField(input, "deployedAtMs");
  const fromMs = natField(input, "fromMs");
  const limit = natField(input, "limit");
  const startEvents = arrayField(input, "startEvents", "fixture").map((startEvent) => {
    if (typeof startEvent !== "string") throw new Error("fixture: startEvents: String expected");
    return startEvent;
  });
  return programs.map((program) => {
    const summary = { ...deploymentSummary(program), deployedAtMs };
    return startEvents.map((startEvent) => {
      const due = timerOccurrences(summary, startEvent, fromMs, limit);
      return due === null ? null : [...due];
    });
  });
}

/** The host-facing functions a fixture's `entry` names, each over the fixture and its `input`. */
const fixtureEntries: Readonly<Record<string, (fixture: unknown, input: unknown) => JsonValue>> = {
  rootStarts: (fixture) => rootStarts(onlyProgram(fixturePrograms(fixture))).map(([publicId, own]) => [publicId, own]),
  refusesSignalVariables: (fixture) => refusesSignalVariables(onlyProgram(fixturePrograms(fixture))),
  registerSummary: (fixture, input) => registrations(fixturePrograms(fixture), arrayField(input, "deploymentIds", "fixture")),
  definitionCapabilities: (fixture) => capabilitiesJson(definitionCapabilities(onlyProgram(fixturePrograms(fixture)))),
  timerOccurrences: (fixture, input) => occurrenceAnswers(fixturePrograms(fixture), input),
  timerStartCheck: (fixture, input) => timerChecks(fixturePrograms(fixture), input),
  signalReceivers: (fixture, input) => {
    const program = onlyProgram(fixturePrograms(fixture));
    return signalReceiversAnswer(program, committedState(program, arrayField(input, "stimuli", "fixture")), input);
  },
  reachOccurrence: (fixture, input) => {
    const program = onlyProgram(fixturePrograms(fixture));
    return reachAnswers(hooks, program, committedState(program, arrayField(input, "stimuli", "fixture")), input);
  },
  messageReceivers: (fixture, input) => {
    const program = onlyProgram(fixturePrograms(fixture));
    return messageReceiversAnswer(hooks, program, committedState(program, arrayField(input, "stimuli", "fixture")), input);
  },
  signalStartReceivers: (fixture, input) => {
    const address = decodeSignalAddress(field(input, "address", "fixture"));
    if (!address.ok) throw new Error(`fixture: ${address.refusal}`);
    const variables = decodeBindings(input, "variables");
    if (!variables.ok) throw new Error(`fixture: ${variables.refusal}`);
    return signalStartReceivers(hooks, natField(input, "deploymentId"), onlyProgram(fixturePrograms(fixture)), address.value, variables.value)
      .map(receiverJson);
  },
  messageStartCandidates: (fixture, input) => startCandidatesAnswer(onlyProgram(fixturePrograms(fixture)), input),
  conditionalStartVerdict: (fixture, input) => conditionalVerdictAnswer(hooks, onlyProgram(fixturePrograms(fixture)), input),
  linearizeReceivers: (_fixture, input) => linearizedAnswer(input),
  fanOut: (_fixture, input) => fanOutScript(input),
  instanceId: (_fixture, input) => instanceIdAnswer(input),
  signalAddress: (_fixture, input) => {
    const address = decodeSignalAddress(field(input, "address", "fixture"));
    if (!address.ok) throw new Error(`fixture: ${address.refusal}`);
    return signalAddressJson(address.value);
  },
};

/** `kernelRun --fixture <fixture.json>`, for one fixture. */
export function runFixture(fixtureJson: unknown): unknown {
  const input = field(fixtureJson, "input", "fixture");
  const entry = requiredString(fixtureJson, "entry", "fixture");
  const answer = Object.hasOwn(fixtureEntries, entry) ? fixtureEntries[entry] : undefined;
  if (answer === undefined) throw new Error(`fixture-entry-unknown: ${entry}`);
  return answer(fixtureJson, input);
}

// Batch mode

/**
 * The run of `stimuli` over `program` without the admission gate, with the admission refusal beside it. It exists only
 * to pair the TypeScript kernel's unit cases that step a program admission refuses (a profile option admission does not
 * admit yet); no product path runs a refused program. It steps through the one `runStep`.
 */
function ungatedRun(program: Program, stimuli: readonly RunStimulus[]): JsonValue {
  const [trace, outcome] = execute(program, stimuli);
  return { admission: admit(program), outcome, trace, hostViews: hostViews(program, stimuli).map(hostViewJson) };
}

/** The registry's evaluator, the one `step` uses, applied to an IL expression over wire bindings. */
function evaluationAnswer(batchCase: unknown): JsonValue {
  const expression = decodeExpression(field(batchCase, "expression", "batch"));
  if (!expression.ok) throw new Error(`batch: ${expression.refusal}`);
  const variables = bindingsFromJson(field(batchCase, "variables", "batch"));
  if (!variables.ok) throw new Error(`batch: ${variables.refusal}`);
  const evaluation = hooks.evaluate({ variables: variables.value, nowMs: natField(batchCase, "nowMs") }, expression.value);
  switch (evaluation.tag) {
    case EvaluationTag.Value:
      return { value: valueCodec.encode(evaluation.result) };
    case EvaluationTag.Failure:
      return { failure: evaluation.code };
    case EvaluationTag.Unsupported:
      return { unsupported: evaluation.code };
  }
  return assertNever(evaluation);
}

/** The strict codecs' answer for a program text: its refusal, or `null` and the program's canonical encoding. */
function decodeAnswer(text: string): JsonValue {
  const parsed = parseStrict(text);
  const decoded = parsed.ok ? decodeProgram(parsed.value) : parsed;
  return decoded.ok ? { refusal: null, encoded: encodeProgram(decoded.value) } : { refusal: decoded.refusal, encoded: null };
}

/** The batch entries, each a mode of this runner over one case's inline documents. */
const batchEntries: Readonly<Record<string, (batchCase: unknown) => JsonValue>> = {
  hostView: (batchCase) => hostViewRun(programFromJson(field(batchCase, "program", "batch"), "batch"),
    stimuliFromJson(field(batchCase, "scenario", "batch"), "batch")),
  ungated: (batchCase) => ungatedRun(programFromJson(field(batchCase, "program", "batch"), "batch"),
    stimuliFromJson(field(batchCase, "scenario", "batch"), "batch")),
  population: (batchCase) => populationRun(field(batchCase, "scenario", "batch"),
    arrayField(batchCase, "sources", "batch").map((json, index) => deploymentSourceFromJson(json, `source ${index}`)),
    arrayField(batchCase, "digests", "batch").map((digest) => {
      if (typeof digest !== "string") throw new Error("batch: digests: String expected");
      return digest;
    })),
  decode: (batchCase) => decodeAnswer(requiredString(batchCase, "text", "batch")),
  stimulus: (batchCase) => {
    const decoded = firingStimulusFromJson(field(batchCase, "stimulus", "batch"));
    return { refusal: decoded.ok ? null : decoded.refusal };
  },
  evaluate: evaluationAnswer,
  fixture: (batchCase) => runFixture(field(batchCase, "fixture", "batch")) as JsonValue,
};

/** One batch case's answer (`kernelRun --batch`), by its `entry`; a harness error throws. */
export function runBatchCase(batchCase: unknown): unknown {
  const entry = requiredString(batchCase, "entry", "batch");
  const answer = Object.hasOwn(batchEntries, entry) ? batchEntries[entry] : undefined;
  if (answer === undefined) throw new Error(`batch-entry-unknown: ${entry}`);
  return answer(batchCase);
}

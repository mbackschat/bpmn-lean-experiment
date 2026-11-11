/**
 * Population, transcribed from `Kernel/Population.lean`: mechanisms across process instances
 * ([architecture](../../../docs/kernel/ARCHITECTURE-SPEC.md#population)). Every input reaches an instance through
 * `step`; this layer only decides which instance an input goes to. A scenario is one ordered list of stimuli mixing
 * deployments, instance inputs and population commands, each at a logical time. Implemented: deployments with versions
 * per process key and the copies of other deployments' processes they may carry (`deploy`), instances of possibly
 * different deployments, each driven by its own inputs, and Message key correlation with exact-cardinality
 * routing ([specification](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)): a publication addresses one
 * deployment and a Message channel and carries the modeled correlation criteria; the candidates are the open
 * subscriptions of that deployment's instances that `Hooks.correlates` accepts; exactly one is delivered to, while zero
 * or several reject the publication and change no instance. Candidate order never picks a winner. Every other command
 * form is parsed and answered `unsupported population-not-implemented`.
 *
 * A refused deployment, an instance input that does not commit and a delivery a target refuses are results, never
 * harness errors; a candidate whose key cannot be evaluated is no match.
 */
import {
  MessageNames,
  assertNever,
  compareStrings,
  distinctCount,
  elementHeader,
  elementStart,
  mergeSort,
  programChildren,
  programElement,
  programPublicId,
  triggerMessage,
  valueSourceLiteral,
  type CalledProcess,
  type ElementId,
  type Program,
  type Value,
} from "./il/types.js";
import type { Hooks } from "./hooks.js";
import {
  DeliveryTriggerTag,
  FailureTag,
  InputTag,
  instanceOf,
  occurrenceOf,
  type Binding,
  type CorrelationMatch,
  type Failure,
  type Input,
  type MessageChannel,
  type OccurrenceRef,
  type OpenItem,
  type SignalAddress,
  type State,
} from "./state.js";
import { context, step } from "./step.js";

/** Lean's `Except String α`: a population refusal is a harness error with a stable code. */
export type Refusable<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** The source overlay a definition was compiled with. */
export interface Overlay {
  readonly id: string;
  readonly sha256: string;
}

/**
 * A scenario definition's source identity: definitions whose local identifiers agree but whose source, overlay or
 * profile differ are distinct (specification, global command).
 */
export interface DeploymentRef {
  readonly sourceId: string;
  readonly sourceSha256: string;
  readonly overlay: Overlay | null;
  readonly profile: string;
}

/**
 * One deploy event of a scenario definition. `deploymentId` is its deploy ordinal across the population, from 1; `key`
 * its root process id; `versions` gives each process key it contains 1 + the number of earlier deployments containing
 * that key.
 */
export interface Deployment {
  readonly deploymentId: number;
  readonly definitionRef: string;
  readonly ref: DeploymentRef;
  readonly key: string;
  readonly versions: readonly (readonly [string, number])[];
  readonly deployedAtMs: number;
  readonly program: Program;
}

export enum DefinitionSelectorTag {
  ProcessKey = "processKey",
  Deployment = "deployment",
}

/** The current deployment of a process key, or one exact deployment. */
export type DefinitionSelector =
  | { readonly tag: DefinitionSelectorTag.ProcessKey; readonly key: string }
  | { readonly tag: DefinitionSelectorTag.Deployment; readonly deploymentId: number };

export enum MessageAddressTag {
  Channel = "channel",
  Name = "name",
}

export type MessageAddress =
  | { readonly tag: MessageAddressTag.Channel; readonly channel: MessageChannel }
  | { readonly tag: MessageAddressTag.Name; readonly name: string };

export enum PublishMode {
  Any = "any",
  ExecutionsOnly = "executionsOnly",
  StartOnly = "startOnly",
}

/** A Message publication; `criteria` are read as the profile's `messageCorrelation` says. */
export interface Publication {
  readonly commandId: string;
  readonly definition: DefinitionSelector | null;
  readonly message: MessageAddress;
  readonly criteria: readonly CorrelationMatch[];
  readonly payload: Value | null;
  readonly variables: readonly Binding[];
  readonly businessKey: string | null;
  readonly mode: PublishMode;
}

export enum ReceiverTag {
  Occurrence = "occurrence",
  Start = "start",
}

/** A receiver of a fan-out: a waiting occurrence, or a start Event of a deployment. */
export type Receiver =
  | { readonly tag: ReceiverTag.Occurrence; readonly ref: OccurrenceRef }
  | { readonly tag: ReceiverTag.Start; readonly deploymentId: number; readonly startEvent: string };

/** An API Signal broadcast; `order`, when given, is the discovery order its receivers are reached in. */
export interface Broadcast {
  readonly commandId: string;
  readonly address: SignalAddress;
  readonly variables: readonly Binding[];
  readonly order: readonly Receiver[] | null;
}

export interface ConditionEvaluation {
  readonly commandId: string;
  readonly definition: DefinitionSelector | null;
  readonly variables: readonly Binding[];
  readonly businessKey: string | null;
  readonly order: readonly Receiver[] | null;
}

/** A Timer-start occurrence, named by its due instant; the command's logical time is its firing time. */
export interface TimerStart {
  readonly commandId: string;
  readonly deploymentId: number;
  readonly startEvent: string;
  readonly dueMs: number;
}

export enum CommandTag {
  Publish = "publish",
  Broadcast = "broadcast",
  EvaluateConditions = "evaluateConditions",
  TimerStart = "timerStart",
}

export type Command =
  | { readonly tag: CommandTag.Publish; readonly publication: Publication }
  | { readonly tag: CommandTag.Broadcast; readonly broadcast: Broadcast }
  | { readonly tag: CommandTag.EvaluateConditions; readonly evaluation: ConditionEvaluation }
  | { readonly tag: CommandTag.TimerStart; readonly timerStart: TimerStart };

function commandIdOf(command: Command): string {
  switch (command.tag) {
    case CommandTag.Publish:
      return command.publication.commandId;
    case CommandTag.Broadcast:
      return command.broadcast.commandId;
    case CommandTag.EvaluateConditions:
      return command.evaluation.commandId;
    case CommandTag.TimerStart:
      return command.timerStart.commandId;
  }
  return assertNever(command);
}

export enum FanOutEntryTag {
  Delivered = "delivered",
  Started = "started",
  Skipped = "skipped",
  Failed = "failed",
}

/** One receiver of a fan-out, each its own unit of commitment; `skipped` was gone before its turn. */
export type FanOutEntry =
  | { readonly tag: FanOutEntryTag.Delivered; readonly target: OccurrenceRef }
  | {
      readonly tag: FanOutEntryTag.Started;
      readonly instanceId: string;
      readonly deploymentId: number;
      readonly version: number;
      readonly startEvent: string;
    }
  | { readonly tag: FanOutEntryTag.Skipped; readonly target: OccurrenceRef }
  | { readonly tag: FanOutEntryTag.Failed; readonly target: Receiver; readonly failure: Failure };

export enum ResolutionTag {
  Committed = "committed",
  Failed = "failed",
  FanOut = "fanOut",
  NoMatch = "noMatch",
  Ambiguous = "ambiguous",
  Rejected = "rejected",
  Unsupported = "unsupported",
}

/** `failed`: the sole candidate refused the delivery; nothing changed. */
export type Resolution =
  | { readonly tag: ResolutionTag.Committed; readonly target: OccurrenceRef }
  | { readonly tag: ResolutionTag.Failed; readonly target: OccurrenceRef; readonly failure: Failure }
  | { readonly tag: ResolutionTag.FanOut; readonly entries: readonly FanOutEntry[] }
  | { readonly tag: ResolutionTag.NoMatch }
  | { readonly tag: ResolutionTag.Ambiguous }
  | { readonly tag: ResolutionTag.Rejected; readonly code: string }
  | { readonly tag: ResolutionTag.Unsupported; readonly code: string };

/** A command's result; `ordinal` numbers the commands in arrival order, from 1. */
export interface StepResult {
  readonly commandId: string;
  readonly ordinal: number;
  readonly atMs: number;
  readonly resolution: Resolution;
}

/** A command the population answered, under the digest of its canonical wire form (contract §7). */
export interface LedgerEntry {
  readonly commandId: string;
  readonly digest: string;
  readonly result: StepResult;
}

/** A consumed Timer-start occurrence. */
export interface TimerOccurrence {
  readonly deploymentId: number;
  readonly startEvent: string;
  readonly dueMs: number;
}

export enum DeploymentOutcomeTag {
  Deployed = "deployed",
  Refused = "refused",
}

export type DeploymentOutcome =
  | { readonly tag: DeploymentOutcomeTag.Deployed }
  | { readonly tag: DeploymentOutcomeTag.Refused; readonly code: string };

export interface DeploymentResult {
  readonly deploymentId: number;
  readonly definitionRef: string;
  readonly versions: readonly (readonly [string, number])[];
  readonly outcome: DeploymentOutcome;
}

export interface Instance {
  readonly deployment: Deployment;
  readonly state: State;
}

export enum StimulusTag {
  Deploy = "deploy",
  DeployRefused = "deployRefused",
  Input = "input",
  Command = "command",
}

/**
 * One population scenario stimulus, in scenario order: a deployment, an input for the instance of `script`, or a
 * command with its logical time and the digest of its canonical wire form, which the harness computes.
 */
export type Stimulus =
  | {
      readonly tag: StimulusTag.Deploy;
      readonly definitionRef: string;
      readonly ref: DeploymentRef;
      readonly program: Program;
      readonly atMs: number;
    }
  /** A deployment whose program the reader or the assembly refused with `code`. */
  | {
      readonly tag: StimulusTag.DeployRefused;
      readonly definitionRef: string;
      readonly ref: DeploymentRef;
      readonly code: string;
      readonly atMs: number;
    }
  | {
      readonly tag: StimulusTag.Input;
      readonly script: number;
      readonly definitionRef: string;
      readonly commandId: string;
      readonly input: Input;
    }
  | { readonly tag: StimulusTag.Command; readonly command: Command; readonly atMs: number; readonly digest: string };

export interface Result {
  readonly deployments: readonly DeploymentResult[];
  readonly steps: readonly StepResult[];
  /** Ordered by process instance identifier, whatever order they started in. */
  readonly instances: readonly Instance[];
  /** The instance inputs that did not commit, with their failures. */
  readonly inputFailures: readonly (readonly [string, Failure])[];
}

function occurrence(program: Program, state: State, item: OpenItem): OccurrenceRef {
  return {
    processInstanceId: instanceOf(state, item.scope),
    element: programPublicId(program, item.element),
    activation: occurrenceOf(state, item.occurrence)?.activation ?? 0,
  };
}

/**
 * The open subscriptions of one instance of `program` that `Hooks.correlates` accepts for a delivery on `channel`
 * carrying `correlation`, by public occurrence identity; a subscription whose key cannot be evaluated is no match. A host
 * that routes a publication across instances asks it of each instance.
 */
export function matching(
  hooks: Hooks,
  program: Program,
  state: State,
  channel: MessageChannel,
  correlation: readonly CorrelationMatch[],
): readonly OccurrenceRef[] {
  const ctx = context(hooks, program);
  const accepted = state.openItems.filter((item) => {
    const accepts = hooks.correlates(ctx, item, channel, correlation, state);
    return accepts.ok && accepts.value;
  });
  return accepted.map((item) => occurrence(program, state, item));
}

/**
 * Whether a carried process is the deploying document's own: unstamped, or stamped with `deploymentId` itself; any other
 * stamp is a copy `bpmn-source`'s assembly made from that deployment.
 */
function ownProcess(deploymentId: number, process: CalledProcess): boolean {
  return process.definition.deployment === null || process.definition.deployment === deploymentId;
}

/** The process keys a deployment contains: its root and its own document's processes. */
function ownKeys(deploymentId: number, program: Program): readonly string[] {
  return [program.identity.processId,
    ...program.processes.filter((process) => ownProcess(deploymentId, process)).map((process) => process.definition.key)];
}

/** The version a registered deployment gave `key`. */
function versionOf(deployment: Deployment, key: string): number | null {
  return deployment.versions.find(([known]) => known === key)?.[1] ?? null;
}

/** The namespace a registered deployment declares `key` in: its root's, or its own process's; `undefined` for none. */
function namespaceOf(deployment: Deployment, key: string): string | null | undefined {
  if (deployment.key === key) return deployment.program.identity.namespace;
  return deployment.program.processes.find((process) => ownProcess(deployment.deploymentId, process) && process.definition.key === key)
    ?.definition.namespace;
}

/**
 * The current deployment of `key`: the last registered deployment whose root it is; redeploying a key supersedes its
 * earlier versions' start subscriptions (`BpmnDeployer.java:232-292`).
 */
function current(registry: readonly Deployment[], key: string): Deployment | null {
  return registry.filter((deployment) => deployment.key === key).at(-1) ?? null;
}

/**
 * The program without the carried processes `drop` refuses: each process, every element whose top-level ancestor it
 * lists, and every flow touching one of them.
 */
function withoutCarried(program: Program, drop: (process: CalledProcess) => boolean): Program {
  const roots = program.processes.filter(drop).flatMap((process) => process.children);
  const topLevel = (fuel: number, id: ElementId): ElementId => {
    const element = programElement(program, id);
    const parent = element === null ? null : elementHeader(element).parent;
    return fuel === 0 || parent === null ? id : topLevel(fuel - 1, parent);
  };
  const removed = program.elements.map(elementHeader).filter((header) => roots.includes(topLevel(program.elements.length, header.id)))
    .map((header) => header.id);
  return {
    ...program,
    processes: program.processes.filter((process) => !drop(process)),
    elements: program.elements.filter((element) => !removed.includes(elementHeader(element).id)),
    flows: program.flows.filter((flow) => !removed.includes(flow.source) && !removed.includes(flow.target)),
  };
}

/**
 * Stamp a carried process with its version, or refuse its stamp. The deploying document's own process takes this
 * deployment and `versions`; a copy must name a registered deployment that contains its key in its namespace from its
 * source (`population.callee.stamp` otherwise), whose version it takes.
 */
function stampCarried(
  registry: readonly Deployment[],
  deploymentId: number,
  versions: readonly (readonly [string, number])[],
  process: CalledProcess,
): Refusable<CalledProcess> {
  const definition = process.definition;
  if (ownProcess(deploymentId, process)) {
    const version = versions.find(([key]) => key === definition.key)?.[1] ?? null;
    return { ok: true, value: { ...process, definition: { ...definition, deployment: deploymentId, version } } };
  }
  const source = registry.find((deployment) => definition.deployment === deployment.deploymentId);
  const version = source === undefined ? null : versionOf(source, definition.key);
  if (source === undefined || version === null || namespaceOf(source, definition.key) !== definition.namespace ||
    (definition.sourceSha256 !== null && definition.sourceSha256 !== source.program.identity.sourceSha256)) {
    return { ok: false, error: "population.callee.stamp" };
  }
  return { ok: true, value: { ...process, definition: { ...definition, version } } };
}

/** The literal names of a program's root Message starts. */
function messageStartNames(program: Program): readonly string[] {
  return programChildren(program, null).flatMap((element) => {
    const trigger = elementStart(element)?.[1].subscription?.trigger;
    const name = trigger === undefined ? null : triggerMessage(trigger)?.name ?? null;
    const literal = name === null ? null : valueSourceLiteral(name);
    return literal === null ? [] : [literal];
  });
}

/**
 * Under `MessageNames.addresses` a root Message start name is unique across the current deployments of other keys: CIB
 * refuses deploying one another key's current deployment already subscribes (`BpmnDeployer.java:328-363`,
 * CIB-LIM-0028).
 */
function messageStartClash(registry: readonly Deployment[], program: Program): string | null {
  const others = [...new Set(registry.map((deployment) => deployment.key))].filter((key) => key !== program.identity.processId);
  const taken = others.flatMap((key) => {
    const deployment = current(registry, key);
    return deployment === null ? [] : messageStartNames(deployment.program);
  });
  return program.options.messageNames === MessageNames.Addresses && messageStartNames(program).some((name) => taken.includes(name))
    ? "deployment.messageStartName"
    : null;
}

/**
 * Deploy `program` as `deploymentId` at `atMs` (population contract §2.3, PC-SCOPE-03). Each key it contains takes 1 +
 * the number of registered deployments containing that key, so a refused deployment numbers nothing, as CIB registers
 * none. A copy of another deployment's process stays only if that deployment is registered and no later than this one:
 * a copy of a later or a refused deployment is removed, so no Call binds a callee deployed after its caller or never
 * deployed. The rest are stamped (`stampCarried`); then admission runs, then the Message start names are checked.
 */
export function deploy(
  admission: (program: Program) => string | null,
  registry: readonly Deployment[],
  refused: readonly number[],
  deploymentId: number,
  definitionRef: string,
  ref: DeploymentRef,
  program: Program,
  atMs: number,
): readonly [DeploymentResult, Deployment | null] {
  const refusal = (code: string): readonly [DeploymentResult, Deployment | null] =>
    [{ deploymentId, definitionRef, versions: [], outcome: { tag: DeploymentOutcomeTag.Refused, code } }, null];
  const versions = ownKeys(deploymentId, program).map((key) =>
    [key, 1 + registry.filter((earlier) => earlier.versions.some(([known]) => known === key)).length] as const);
  const unreachable = (process: CalledProcess): boolean => {
    const source = process.definition.deployment;
    return source !== null && (source > deploymentId || refused.includes(source));
  };
  const carried = withoutCarried(program, unreachable);
  const processes: CalledProcess[] = [];
  for (const process of carried.processes) {
    const stamped = stampCarried(registry, deploymentId, versions, process);
    if (!stamped.ok) return refusal(stamped.error);
    processes.push(stamped.value);
  }
  const stamped: Program = { ...carried, processes, identity: { ...carried.identity, deployment: deploymentId } };
  const code = admission(stamped) ?? messageStartClash(registry, stamped);
  if (code !== null) return refusal(code);
  const deployment: Deployment = {
    deploymentId, definitionRef, ref, key: program.identity.processId, versions, deployedAtMs: atMs, program: stamped,
  };
  return [{ deploymentId, definitionRef, versions, outcome: { tag: DeploymentOutcomeTag.Deployed } }, deployment];
}

/**
 * dynamic-only: a command form the population runner does not route yet; it is a scenario stimulus, not a program
 * shape, so no admission refusal can stand for it.
 */
const notImplemented: Resolution = { tag: ResolutionTag.Unsupported, code: "population-not-implemented" };

/**
 * Route one publication: deliver to its sole candidate, or reject it leaving every instance unchanged. Only a
 * publication to one deployment's executions on a channel, carrying criteria and nothing else, is implemented.
 */
function publish(
  hooks: Hooks,
  registry: readonly Deployment[],
  instances: readonly Instance[],
  publication: Publication,
): Refusable<readonly [readonly Instance[], Resolution]> {
  const selector = publication.definition;
  const message = publication.message;
  if (selector?.tag !== DefinitionSelectorTag.Deployment || message.tag !== MessageAddressTag.Channel ||
    publication.payload !== null || publication.variables.length > 0 || publication.businessKey !== null ||
    publication.mode !== PublishMode.ExecutionsOnly) {
    return { ok: true, value: [instances, notImplemented] };
  }
  if (!registry.some((deployment) => deployment.deploymentId === selector.deploymentId)) {
    return { ok: true, value: [instances, { tag: ResolutionTag.Rejected, code: "definition-not-deployed" }] };
  }
  const correlation = publication.criteria;
  const found = instances.flatMap((member, index) => member.deployment.deploymentId !== selector.deploymentId ? [] :
    matching(hooks, member.deployment.program, member.state, message.channel, correlation).map((ref) => [index, ref] as const));
  const sole = found[0];
  if (sole === undefined) return { ok: true, value: [instances, { tag: ResolutionTag.NoMatch }] };
  if (found.length > 1) return { ok: true, value: [instances, { tag: ResolutionTag.Ambiguous }] };
  const [index, target] = sole;
  const delivery: Input = {
    tag: InputTag.Deliver,
    payload: { occurrence: target, trigger: { tag: DeliveryTriggerTag.Message, channel: message.channel }, correlation, payload: null, variables: [], atMs: null },
  };
  const member = instances[index];
  if (member === undefined) return { ok: false, error: "candidate-without-instance" };
  const stepped = step(hooks, member.deployment.program, member.state, delivery);
  if (!stepped.ok) return { ok: true, value: [instances, { tag: ResolutionTag.Failed, target, failure: stepped.failure }] };
  const updated = instances.map((candidate, position) => (position === index ? { ...member, state: stepped.value } : candidate));
  return { ok: true, value: [updated, { tag: ResolutionTag.Committed, target }] };
}

/** What a run has done so far: deployments, instances by script, command results and their ledger, input failures. */
interface Progress {
  readonly registry: readonly Deployment[];
  readonly deployments: readonly DeploymentResult[];
  readonly instances: readonly (readonly [number, Instance])[];
  readonly steps: readonly StepResult[];
  readonly ledger: readonly LedgerEntry[];
  readonly inputFailures: readonly (readonly [string, Failure])[];
}

/** The deploy ordinals of the refused deployments, which no copy may come from. */
function refusedOrdinals(progress: Progress): readonly number[] {
  return progress.deployments.flatMap((deployment) => {
    switch (deployment.outcome.tag) {
      case DeploymentOutcomeTag.Deployed:
        return [];
      case DeploymentOutcomeTag.Refused:
        return [deployment.deploymentId];
    }
    return assertNever(deployment.outcome);
  });
}

/** The deployment an instance input reaches: its instance's, or for a new instance its definition's latest. */
function deploymentFor(progress: Progress, script: number, definitionRef: string): Deployment | null {
  const known = progress.instances.find(([candidate]) => candidate === script)?.[1].deployment;
  if (known !== undefined) return known;
  return progress.registry.filter((deployment) => deployment.definitionRef === definitionRef).at(-1) ?? null;
}

function route(hooks: Hooks, progress: Progress, issued: Command): Refusable<readonly [readonly Instance[], Resolution]> {
  const instances = progress.instances.map(([, instance]) => instance);
  switch (issued.tag) {
    case CommandTag.Publish:
      return publish(hooks, progress.registry, instances, issued.publication);
    case CommandTag.Broadcast:
    case CommandTag.EvaluateConditions:
    case CommandTag.TimerStart:
      return { ok: true, value: [instances, notImplemented] };
  }
  return assertNever(issued);
}

/** Apply one stimulus. A command sees the instances started so far. */
function apply(hooks: Hooks, admission: (program: Program) => string | null, progress: Progress, stimulus: Stimulus): Refusable<Progress> {
  switch (stimulus.tag) {
    case StimulusTag.Deploy: {
      const deploymentId = progress.deployments.length + 1;
      const [result, deployment] = deploy(admission, progress.registry, refusedOrdinals(progress), deploymentId,
        stimulus.definitionRef, stimulus.ref, stimulus.program, stimulus.atMs);
      const registry = deployment === null ? progress.registry : [...progress.registry, deployment];
      return { ok: true, value: { ...progress, registry, deployments: [...progress.deployments, result] } };
    }
    case StimulusTag.DeployRefused: {
      const result: DeploymentResult = {
        deploymentId: progress.deployments.length + 1, definitionRef: stimulus.definitionRef, versions: [],
        outcome: { tag: DeploymentOutcomeTag.Refused, code: stimulus.code },
      };
      return { ok: true, value: { ...progress, deployments: [...progress.deployments, result] } };
    }
    case StimulusTag.Input: {
      const failed = (failure: Failure): Progress =>
        ({ ...progress, inputFailures: [...progress.inputFailures, [stimulus.commandId, failure]] });
      const deployment = deploymentFor(progress, stimulus.script, stimulus.definitionRef);
      if (deployment === null) return { ok: true, value: failed({ tag: FailureTag.Rejected, code: "definition-not-deployed" }) };
      const before = progress.instances.find(([script]) => script === stimulus.script)?.[1].state ?? null;
      const stepped = step(hooks, deployment.program, before, stimulus.input);
      if (!stepped.ok) return { ok: true, value: failed(stepped.failure) };
      const others = progress.instances.filter(([script]) => script !== stimulus.script);
      return { ok: true, value: { ...progress, instances: [...others, [stimulus.script, { deployment, state: stepped.value }]] } };
    }
    case StimulusTag.Command: {
      const answered = route(hooks, progress, stimulus.command);
      if (!answered.ok) return answered;
      const [instances, resolution] = answered.value;
      const commandId = commandIdOf(stimulus.command);
      const result: StepResult = { commandId, ordinal: progress.steps.length + 1, atMs: stimulus.atMs, resolution };
      const scripts = progress.instances.map(([script]) => script);
      return {
        ok: true,
        value: {
          ...progress,
          instances: scripts.flatMap((script, index) => {
            const instance = instances[index];
            return instance === undefined ? [] : [[script, instance] as const];
          }),
          steps: [...progress.steps, result],
          ledger: [...progress.ledger, { commandId, digest: stimulus.digest, result }],
        },
      };
    }
  }
  return assertNever(stimulus);
}

/** Fold the stimuli in order; `admission` is the admission registry a deployment runs. */
export function runStimuli(hooks: Hooks, admission: (program: Program) => string | null, stimuli: readonly Stimulus[]): Refusable<Result> {
  let progress: Progress = { registry: [], deployments: [], instances: [], steps: [], ledger: [], inputFailures: [] };
  for (const stimulus of stimuli) {
    const next = apply(hooks, admission, progress, stimulus);
    if (!next.ok) return next;
    progress = next.value;
  }
  const ids = progress.instances.map(([, instance]) => instance.state.instanceId);
  if (distinctCount(ids) !== ids.length) return { ok: false, error: "instance-id-duplicate" };
  return {
    ok: true,
    value: {
      deployments: progress.deployments,
      steps: progress.steps,
      inputFailures: progress.inputFailures,
      instances: mergeSort(progress.instances.map(([, instance]) => instance), (left, right) =>
        compareStrings(left.state.instanceId, right.state.instanceId) <= 0),
    },
  };
}

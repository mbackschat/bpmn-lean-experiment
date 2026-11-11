/**
 * Population: contract, transcribed from `Kernel/Population/Contract.lean`: the data a population run reads and
 * answers: deployments, stimuli, commands, their resolutions and the run's result
 * ([specification](../../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
 */
import { assertNever, utf8ByteSize, type Program, type Value } from "../il/types.js";
import type {
  Binding,
  CorrelationMatch,
  Failure,
  Input,
  MessageChannel,
  OccurrenceRef,
  SignalAddress,
  State,
} from "../state.js";

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

export function commandIdOf(command: Command): string {
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
  /** Delivered to its sole receiver; `cascade` is the fan-out of the intents that step left, delivered after it. */
  | { readonly tag: ResolutionTag.Committed; readonly target: OccurrenceRef; readonly cascade: readonly FanOutEntry[] }
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
      readonly instanceId: string;
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
  /** The committed instance inputs whose intents reached a receiver, with the fan-out of those intents. */
  readonly inputCascades: readonly (readonly [string, readonly FanOutEntry[]])[];
}

/**
 * The identity of the instance a command starts at `startEvent` of a deployment (population contract §4): each part
 * prefixed by its UTF-8 byte length, as `calledInstanceId`, so a command starts at most one instance per deployment and
 * start Event and a retried command can never start a second one.
 */
export function startedInstanceId(commandId: string, deploymentId: number, startEvent: string): string {
  const deployment = String(deploymentId);
  return `start:${utf8ByteSize(commandId)}:${commandId}:${utf8ByteSize(deployment)}:${deployment}:` +
    `${utf8ByteSize(startEvent)}:${startEvent}`;
}

/**
 * The identity of the instance a thrown Signal's intent starts at `startEvent` of a deployment, in the cascade the
 * command `commandId` began (population contract §4): `startedInstanceId`'s parts, then the throw's own occurrence
 * `emitter` as one length-prefixed key `<len>:<processInstanceId>:<len>:<publicElementId>:<activation>`, written as
 * `calledInstanceId` writes an occurrence, so two throws of one cascade never start the same instance.
 */
export function cascadeInstanceId(commandId: string, deploymentId: number, startEvent: string, emitter: OccurrenceRef): string {
  const key = `${utf8ByteSize(emitter.processInstanceId)}:${emitter.processInstanceId}:` +
    `${utf8ByteSize(emitter.element)}:${emitter.element}:${emitter.activation}`;
  return `${startedInstanceId(commandId, deploymentId, startEvent)}:${utf8ByteSize(key)}:${key}`;
}

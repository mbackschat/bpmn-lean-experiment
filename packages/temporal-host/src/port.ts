/**
 * The slice of the kernel's host interface this host reads ([architecture](../../../docs/kernel/ARCHITECTURE-SPEC.md#host-interface)).
 *
 * Views arrive in the JSON the kernel's runner renders for them (`Kernel.Run.hostViewJson`, `requirementsJson`), so
 * every value here is plain JSON: it crosses Temporal payloads and queries as is, and the Lean runner's `--host-view`
 * output is a valid fixture. Program, state and input stay opaque type parameters; only `kernel-port.ts` and
 * `population-port.ts` bind them to the TypeScript kernel, so this module and everything typed by it never imports the
 * kernel.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** A public occurrence identity (`Kernel.Run.referenceJson`). */
export interface OccurrenceId {
  readonly processInstanceId: string;
  readonly elementId: string;
  readonly activation: number;
}

/** A journal key (`Kernel.Run.keyJson`): a Multi-Instance body and its instances number apart under `role`. */
export interface OccurrenceKey extends OccurrenceId {
  readonly role: string;
}

/** A variable binding in the scenario contract's `variableValue` form. */
export interface Binding {
  readonly name: string;
  readonly value: JsonValue;
}

/** `failures` counts the incidents this effect occurrence has had; a retry reopens it with the same activation. */
export interface EffectView {
  readonly protocol: string;
  readonly operation: string;
  readonly arguments: readonly Binding[];
  readonly failures: number;
}

export interface IncidentView {
  readonly generation: number;
  readonly cancellable: boolean;
}

/**
 * One open wait as `Kernel.Run.waitJson` renders it: a detail is present exactly when the wait has it, so the host
 * reads each detail it is about and never classifies waits by kind.
 */
export interface WaitView {
  readonly id: OccurrenceId;
  readonly definition?: JsonValue;
  readonly input?: string;
  readonly deadlineMs?: number;
  readonly period?: number;
  readonly channel?: JsonValue;
  readonly criteria?: readonly string[];
  readonly effect?: EffectView;
  readonly incident?: IncidentView;
  readonly userTask?: JsonValue;
}

/** What caused a micro-step (`Kernel.Run.causeJson`); publication shows it as the transition's role. */
export interface CauseView {
  readonly kind: string;
  readonly [field: string]: JsonValue;
}

export interface StartedView {
  readonly occurrence: OccurrenceKey;
  readonly owner: number;
  readonly sourceType: string;
}

export interface EndedView {
  readonly occurrence: OccurrenceKey;
  readonly terminal: string;
}

/** One micro-step's occurrence facts (`Kernel.Run.transitionJson`). */
export interface TransitionView {
  readonly cause: CauseView;
  readonly element: string | null;
  readonly owner: number;
  readonly started: readonly StartedView[];
  readonly ended: readonly EndedView[];
}

/** One open wait's address (`Kernel.Run.addressJson`): its Message channel and literal name, or its Signal address. */
export interface WaitAddressView {
  readonly occurrence: OccurrenceId;
  readonly message?: { readonly channel: JsonValue; readonly name?: string };
  readonly signal?: JsonValue;
}

/**
 * `Kernel.Host.View`: the journal holds the facts of the last committed input only; `broadcasts` are the Signals that
 * input threw to the population and `addresses` the open waits' addresses, each absent when empty.
 */
export interface HostView {
  readonly status: string;
  readonly openWaits: readonly WaitView[];
  readonly journal: readonly TransitionView[];
  readonly failure?: JsonValue;
  readonly broadcasts?: readonly JsonValue[];
  readonly addresses?: readonly WaitAddressView[];
}

/** `Kernel.Host.Requirements`; `maxConcurrentWaits` is `null` when the program's shape bounds nothing. */
export interface Requirements {
  readonly timers: boolean;
  readonly messages: boolean;
  readonly effects: boolean;
  readonly userTasks: boolean;
  readonly calls: boolean;
  readonly maxConcurrentWaits: number | null;
}

/** A Script Task's model content: JavaScript runs as a recorded effect (owner decision, PC-AUTO-05/06). */
export interface ScriptSource {
  readonly format: string;
  readonly source: string;
  readonly resultVariable: string | null;
}

/** The update an input travels on, one per kernel input kind; `start` travels as the Workflow start. */
export enum Route {
  Start = "start",
  Command = "command",
  Deliver = "deliver",
  TimerFire = "timerFire",
  EffectResult = "effectResult",
}

export enum EffectResultKind {
  Success = "success",
  BusinessFailure = "businessFailure",
  TechnicalFailure = "technicalFailure",
}

/**
 * What an effect handler observed, the Activity's business result. A technical failure is the CIB-visible failure
 * that the profile turns into a retry or an incident; a transport failure is a thrown error that Temporal retries and
 * the kernel never sees.
 */
export type EffectResult =
  | { readonly kind: EffectResultKind.Success; readonly outputs: readonly Binding[] }
  | {
      readonly kind: EffectResultKind.BusinessFailure;
      readonly code: string;
      readonly message: string | null;
      readonly outputs: readonly Binding[];
    }
  | { readonly kind: EffectResultKind.TechnicalFailure };

/** One decoded stimulus: its command identifier and the kernel input. */
export interface DecodedStimulus<I> {
  readonly commandId: string;
  readonly input: I;
}

/** The kernel's verdict on one input. A rejected input never changes state; `outcome` is the canonical name. */
export type StepResult<S> =
  | { readonly committed: true; readonly state: S }
  | { readonly committed: false; readonly rejected: boolean; readonly outcome: string; readonly code: string };

/** Everything the host asks of the kernel. `decode*` throw `TypeError` on malformed input, a harness error. */
export interface KernelPort<P, S, I> {
  readonly decodeProgram: (json: JsonValue) => P;
  /** The admission registry's refusal code, `null` when admitted. */
  readonly admit: (program: P) => string | null;
  readonly requirements: (program: P) => Requirements;
  readonly capabilities: (program: P) => JsonValue;
  readonly decodeStimulus: (json: JsonValue) => DecodedStimulus<I>;
  readonly route: (input: I) => Route;
  /** The firing of the timer due at `deadlineMs`, applied at logical time `atMs`. */
  readonly timerInput: (timer: OccurrenceId, deadlineMs: number, atMs: number) => I;
  readonly effectInput: (effect: OccurrenceId, result: EffectResult, atMs: number) => I;
  readonly step: (program: P, before: S | null, input: I) => StepResult<S>;
  readonly hostView: (program: P, state: S) => HostView;
  /** The canonical state observation (`Kernel.Run.observationJson`). */
  readonly observation: (program: P, state: S) => JsonValue;
  readonly encodeState: (state: S) => JsonValue;
  readonly decodeState: (json: JsonValue) => S;
  /** The Script Task an effect wait runs, `null` for any other effect. */
  readonly scriptOf: (program: P, wait: WaitView) => ScriptSource | null;
  /**
   * The open waits of `state` that a delivery on `channel` carrying `correlation` (the scenario contract's members)
   * reaches, as the kernel matches them against the instance's current values (`Kernel.Population.matching`).
   */
  readonly matching: (program: P, state: S, channel: JsonValue, correlation: JsonValue) => readonly OccurrenceId[];
}

/**
 * A kernel value in the continuation codec's form (`wire-codec.ts`): the population driver carries it and hands it back
 * to the binding, never reads it.
 */
export type Wire = JsonValue;

/** A population receiver as the host routes it: a waiting occurrence, or a root start Event of a deployment. */
export type ReceiverView =
  | { readonly kind: "occurrence"; readonly occurrence: OccurrenceId }
  | { readonly kind: "start"; readonly deploymentId: number; readonly startEvent: string };

/** A population command's definition selector: the current deployment of a key, or one deployment. */
export type SelectorView = { readonly processKey: string } | { readonly deploymentId: number };

/**
 * What the driver reads of a population command to route it; `command` is the decoded command, which every other
 * question about it is asked of. A publication's `executions` and `starts` say whether its mode reaches waiting
 * instances and root starts.
 */
export type CommandView =
  | {
      readonly kind: "publish";
      readonly commandId: string;
      readonly definition: SelectorView | null;
      readonly executions: boolean;
      readonly starts: boolean;
      readonly criteriaRepeat: boolean;
      readonly channel: JsonValue | null;
      readonly name: string | null;
    }
  | { readonly kind: "broadcast"; readonly commandId: string; readonly address: JsonValue; readonly hasVariables: boolean }
  | { readonly kind: "evaluateConditions"; readonly commandId: string; readonly definition: SelectorView | null }
  | { readonly kind: "timerStart"; readonly commandId: string; readonly deploymentId: number; readonly startEvent: string; readonly dueMs: number };

/** What `fanOutNext` names: a receiver to reach, an intent's snapshot to take, or the finished entries. */
export type FanOutStep =
  /** `emission` is null for a start the command names itself (a Conditional evaluation's). */
  | { readonly kind: "reach"; readonly receiver: Wire; readonly view: ReceiverView; readonly emission: Wire | null }
  | { readonly kind: "snapshot"; readonly address: JsonValue; readonly emission: Wire; readonly emitter: string | null }
  | { readonly kind: "done"; readonly entries: readonly Wire[]; readonly stopped: boolean };

/** A resolution the driver reached, in parts the binding renders (`Kernel.Run.resolutionJson`). */
export type ResolutionParts =
  | { readonly kind: "committed"; readonly target: Wire; readonly cascade: readonly Wire[] }
  | { readonly kind: "failed"; readonly target: Wire; readonly failure: Wire }
  | { readonly kind: "fanOut"; readonly entries: readonly Wire[] }
  | { readonly kind: "noMatch" }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "rejected"; readonly code: string };

/** A population input's step: its committed state, or the kernel's failure. */
export type PopulationStep<S> = { readonly kind: "committed"; readonly state: S } | { readonly kind: "failed"; readonly failure: Wire };

/** A start's step, or `passed` when it is a Conditional start whose predicate does not hold over its start input. */
export type PopulationStartStep<S> = PopulationStep<S> | { readonly kind: "passed" };

/** What reaching one receiver did: no longer a receiver, a committed step and the intents it left, or a refusal. */
export type ReachOutcome =
  | { readonly kind: "skipped" }
  | { readonly kind: "passed" }
  | { readonly kind: "committed"; readonly instanceId: string; readonly intents: readonly Wire[] }
  | { readonly kind: "failed"; readonly failure: Wire };

/**
 * Everything the population ingress and the Workflows that answer it ask of the kernel's population layer
 * (`Kernel.Population.*`, [population ingress](../../../docs/kernel/ARCHITECTURE-SPEC.md#population-ingress)). Kernel
 * values cross it as `Wire`; every match, order, budget, identity and verdict is the kernel's. Decoders throw
 * `TypeError` on malformed input, a caller fault.
 */
export interface PopulationPort<P, S> {
  readonly decodeCommand: (kind: string, json: JsonValue) => { readonly view: CommandView; readonly command: Wire };
  // The ingress, over deployment summaries.
  readonly deploymentSummary: (program: P) => Wire;
  /** The registered summary and its versions, or the kernel's refusal (`deployment.messageStartName`). */
  readonly registerSummary: (registry: readonly Wire[], deploymentId: number, candidate: Wire, atMs: number) =>
    { readonly summary: Wire; readonly key: string; readonly versions: readonly (readonly [string, number])[] } | { readonly refused: string };
  readonly currentDeployments: (registry: readonly Wire[]) => readonly number[];
  readonly timerStartCheck: (registry: readonly Wire[], deploymentId: number, startEvent: string, dueMs: number, atMs: number,
    consumed: boolean) => string | null;
  readonly startedInstanceId: (commandId: string, deploymentId: number, startEvent: string) => string;
  readonly timerInstanceId: (deploymentId: number, startEvent: string, dueMs: number) => string;
  readonly emissionStartedId: (emission: Wire, commandId: string, deploymentId: number, startEvent: string) => string;
  readonly linearize: (waiting: readonly (readonly [string, readonly Wire[]])[], starts: readonly (readonly [number, readonly Wire[]])[]) => readonly Wire[];
  readonly receiverView: (receiver: Wire) => ReceiverView;
  /** An API broadcast's emission, whose address and variables its scans ask about. */
  readonly broadcastEmission: (command: Wire) => Wire;
  /** An API broadcast's fan-out over its snapshot in its `order`, `null` when the order is no permutation of it. */
  readonly broadcastBegin: (command: Wire, snapshot: readonly Wire[], budget: number) => Wire | null;
  /** A Conditional evaluation's fan-out over its starts in its `order`, `null` when the order is no permutation of them. */
  readonly conditionsBegin: (command: Wire, starts: readonly Wire[], budget: number) => Wire | null;
  /** The machine past a Conditional start whose predicate does not hold. */
  readonly fanOutPass: (machine: Wire) => Wire;
  /** The fan-out of the intents an instance left, which may reach `budget` receivers. */
  readonly cascadeBegin: (commandId: string, emitter: string, intents: readonly Wire[], budget: number) => Wire;
  readonly fanOutNext: (machine: Wire) => FanOutStep;
  readonly fanOutSnapshot: (machine: Wire, receivers: readonly Wire[]) => Wire;
  readonly fanOutRecord: (machine: Wire, entry: Wire, intents: readonly Wire[], emitter: string) => Wire;
  readonly startReceiver: (deploymentId: number, startEvent: string) => Wire;
  readonly occurrenceReceiver: (target: Wire) => Wire;
  /** An occurrence receiver's target; `TypeError` for a start. */
  readonly receiverTarget: (receiver: Wire) => Wire;
  readonly deliveredEntry: (target: Wire) => Wire;
  readonly skippedEntry: (target: Wire) => Wire;
  readonly failedEntry: (receiver: Wire, failure: Wire) => Wire;
  readonly startedEntry: (summary: Wire, instanceId: string, startEvent: string) => Wire;
  /** `entries` with the stop of a fan-out the host's `budget` cut short coded as the host's capacity. */
  readonly hostCapacityEntries: (entries: readonly Wire[], stopped: boolean, budget: number) => readonly Wire[];
  readonly renderResolution: (parts: ResolutionParts) => JsonValue;
  readonly renderEntries: (entries: readonly Wire[]) => JsonValue;
  /** The Message delivery of `command`, a publication, to `target` on `channel`. */
  readonly messageDelivery: (command: Wire, target: Wire, channel: Wire) => Wire;
  readonly signalDelivery: (emission: Wire, target: Wire) => Wire;
  /** The start request of a receiver: the trigger, variables and business key its instance starts with. */
  readonly signalStart: (emission: Wire, instanceId: string, startEvent: string) => Wire;
  readonly messageStart: (command: Wire, instanceId: string, startEvent: string, channel: Wire) => Wire;
  readonly timerStartRequest: (instanceId: string, startEvent: string) => Wire;
  readonly conditionStart: (command: Wire, instanceId: string, startEvent: string) => Wire;
  readonly publication: (command: Wire) => Wire;
  readonly messageAddress: (command: Wire) => Wire;
  // A process chain, over its own program and state.
  readonly signalReceivers: (program: P, state: S, address: Wire, emitter: string | null) => readonly Wire[];
  /** The open waits a publication reaches, each `[target, channel]`. */
  readonly messageReceivers: (program: P, state: S, publication: Wire) => readonly (readonly [Wire, Wire])[];
  /** One delivery at `atMs`: `skipped` when it no longer reaches an open item, else the step's commit or failure. */
  readonly populationReach: (program: P, state: S, delivery: Wire, atMs: number) => PopulationStep<S> | { readonly kind: "skipped" };
  /** A start request's start step at `atMs`. */
  readonly populationStart: (program: P, request: Wire, atMs: number) => PopulationStartStep<S>;
  /** The failure of a delivery to a chain that no longer exists. */
  readonly goneFailure: (code: string) => Wire;
  readonly intentsOf: (program: P, state: S) => readonly Wire[];
  readonly instanceIdOf: (state: S) => string;
  // A deployment, over its program.
  readonly signalStartReceivers: (program: P, deploymentId: number, address: Wire, variables: Wire) => readonly Wire[];
  readonly emissionAddress: (emission: Wire) => Wire;
  readonly emissionVariables: (emission: Wire) => Wire;
  /** The root Message starts `message` reaches, each as `[publicStart, channel]`. */
  readonly messageStartCandidates: (program: P, message: Wire) => readonly (readonly [string, Wire])[];
  readonly refusesSignalVariables: (program: P) => boolean;
  /** The public identifiers of the program's root Conditional starts, in document order. */
  readonly conditionalStarts: (program: P) => readonly string[];
}

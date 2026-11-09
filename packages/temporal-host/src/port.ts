/**
 * The slice of the kernel's host interface this host reads ([proposal](../../../docs/LEAN-KERNEL-REWRITE-PROPOSAL.md#host-interface)).
 *
 * Views arrive in the JSON the kernel's runner renders for them (`Kernel.Run.hostViewJson`, `requirementsJson`), so
 * every value here is plain JSON: it crosses Temporal payloads and queries as is, and the Lean runner's `--host-view`
 * output is a valid fixture. Program, state and input stay opaque type parameters; only `kernel-port.ts` binds them to
 * the TypeScript kernel, so this module and everything typed by it never imports the kernel.
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

/** `Kernel.Host.View`: the journal holds the facts of the last committed input only. */
export interface HostView {
  readonly status: string;
  readonly openWaits: readonly WaitView[];
  readonly journal: readonly TransitionView[];
  readonly failure?: JsonValue;
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

/** The deployment a scenario binds, which the canonical observation names in correlated addresses. */
export interface DefinitionRef {
  readonly sourceId: string;
  readonly sourceSha256: string;
  readonly sourceOverlay: { readonly id: string; readonly sha256: string } | null;
  readonly profile: string;
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

/** One decoded stimulus: its command identifier and the kernel input, `null` for a kind the kernel does not accept. */
export interface DecodedStimulus<I> {
  readonly commandId: string;
  readonly input: I | null;
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
  readonly observation: (program: P, definition: DefinitionRef, state: S) => JsonValue;
  readonly encodeState: (state: S) => JsonValue;
  readonly decodeState: (json: JsonValue) => S;
  /** The Script Task an effect wait runs, `null` for any other effect. */
  readonly scriptOf: (program: P, wait: WaitView) => ScriptSource | null;
}

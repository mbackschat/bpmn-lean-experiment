/**
 * Kernel runtime state, transcribed from `Kernel/State.lean`.
 *
 * Flat and identifier-indexed: scope occurrences refer to their parent by identifier, tokens sit on sequence
 * flows, and every open interaction is one `OpenItem` keyed by an engine-issued identity. Every operation returns
 * a new state; nothing is mutated.
 */
import type { ElementId, FlowId, Value } from "./il/types.js";

export type ScopeOccurrenceId = number;

/** A scope occurrence: the process instance (`element = null`) or one activation of a Scope element. */
export interface ScopeOccurrence {
  readonly id: ScopeOccurrenceId;
  readonly element: ElementId | null;
  readonly parent: ScopeOccurrenceId | null;
}

/** A token on a sequence flow, inside a scope occurrence. */
export interface Token {
  readonly flow: FlowId;
  readonly scope: ScopeOccurrenceId;
}

export type Binding = readonly [string, Value];

export interface ScopeVariables {
  readonly scope: ScopeOccurrenceId;
  readonly entries: readonly Binding[];
}

/**
 * What an open User Task publishes besides its identity. Metadata is published only when the task carries
 * candidate groups; form fields are `(key, type)` pairs.
 */
export interface UserTaskDetail {
  readonly name: string | null;
  readonly candidateGroups: readonly string[];
  readonly formFields: readonly (readonly [string, string])[];
}

/** Guarded type: only `step.ts` and `publish.ts` match on it. */
export enum OpenKindTag {
  UserTask = "userTask",
  Receive = "receive",
  Timer = "timer",
  Subscription = "subscription",
  Effect = "effect",
  Incident = "incident",
  Evaluation = "evaluation",
}

export type OpenKind =
  | { readonly tag: OpenKindTag.UserTask; readonly detail: UserTaskDetail }
  | { readonly tag: OpenKindTag.Receive }
  | { readonly tag: OpenKindTag.Timer }
  | { readonly tag: OpenKindTag.Subscription }
  | { readonly tag: OpenKindTag.Effect }
  | { readonly tag: OpenKindTag.Incident }
  | { readonly tag: OpenKindTag.Evaluation };

/** One open interaction. `activation` counts activations of `element` in this process instance, from 1. */
export interface OpenItem {
  readonly id: number;
  readonly kind: OpenKind;
  readonly element: ElementId;
  readonly scope: ScopeOccurrenceId;
  readonly activation: number;
}

export enum InstanceStatus {
  Running = "running",
  Completed = "completed",
  Terminated = "terminated",
}

/** Feature-owned data; `Kernel.FeatureSlots` has no slot yet. */
export type FeatureSlots = Readonly<Record<never, never>>;

export interface State {
  readonly instanceId: string;
  readonly status: InstanceStatus;
  readonly scopes: readonly ScopeOccurrence[];
  readonly tokens: readonly Token[];
  readonly variables: readonly ScopeVariables[];
  readonly openItems: readonly OpenItem[];
  readonly activations: readonly (readonly [ElementId, number])[];
  readonly nextIssue: number;
  readonly logicalTimeMs: number;
  readonly slots: FeatureSlots;
}

/** Why a step does not commit. Harness failures never appear here. */
export enum FailureTag {
  Rejected = "rejected",
  SemanticFailure = "semanticFailure",
  Unsupported = "unsupported",
}

export interface Failure {
  readonly tag: FailureTag;
  readonly code: string;
}

/** Lean's `Except Failure α`. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: Failure };

export type Outcome = Result<State>;

export function committed<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function failed<T>(tag: FailureTag, code: string): Result<T> {
  return { ok: false, failure: { tag, code } };
}

// Inputs

export interface StartInput {
  readonly instanceId: string;
  readonly startEvent: ElementId | null;
  readonly variables: readonly Binding[];
}

/** The public identity of an occurrence: the element and its activation number in the instance. */
export interface OccurrenceRef {
  readonly element: ElementId;
  readonly activation: number;
}

export enum CommandActionTag {
  CompleteUserTask = "completeUserTask",
}

export type CommandAction = {
  readonly tag: CommandActionTag.CompleteUserTask;
  readonly values: readonly Binding[];
};

export interface CommandInput {
  readonly occurrence: OccurrenceRef;
  readonly action: CommandAction;
}

export interface DeliveryInput {
  readonly trigger: string;
  readonly name: string;
  readonly correlation: readonly Binding[];
  readonly payload: readonly Binding[];
}

export interface TimerInput {
  readonly occurrence: OccurrenceRef;
  readonly logicalTimeMs: number;
}

export enum EffectOutcomeTag {
  Success = "success",
  BusinessFailure = "businessFailure",
  TechnicalFailure = "technicalFailure",
}

export type EffectOutcome =
  | { readonly tag: EffectOutcomeTag.Success; readonly outputs: readonly Binding[] }
  | { readonly tag: EffectOutcomeTag.BusinessFailure; readonly code: string; readonly message: string | null }
  | { readonly tag: EffectOutcomeTag.TechnicalFailure; readonly message: string };

export interface EffectInput {
  readonly occurrence: OccurrenceRef;
  readonly outcome: EffectOutcome;
}

/** The host's answer to an evaluation request, bound to the request's content digest. */
export interface EvaluationInput {
  readonly request: number;
  readonly contentSha256: string;
  readonly result: { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: string };
}

/** Guarded type: `step.ts` owns matching on it. */
export enum InputTag {
  Start = "start",
  Command = "command",
  Deliver = "deliver",
  TimerFire = "timerFire",
  EffectResult = "effectResult",
  EvaluationResult = "evaluationResult",
}

export type Input =
  | { readonly tag: InputTag.Start; readonly payload: StartInput }
  | { readonly tag: InputTag.Command; readonly payload: CommandInput }
  | { readonly tag: InputTag.Deliver; readonly payload: DeliveryInput }
  | { readonly tag: InputTag.TimerFire; readonly payload: TimerInput }
  | { readonly tag: InputTag.EffectResult; readonly payload: EffectInput }
  | { readonly tag: InputTag.EvaluationResult; readonly payload: EvaluationInput };

// Operations

export const root: ScopeOccurrenceId = 0;

/** A fresh process instance: one root scope occurrence with the given variables. */
export function initial(instanceId: string, variables: readonly Binding[]): State {
  return {
    instanceId,
    status: InstanceStatus.Running,
    scopes: [{ id: root, element: null, parent: null }],
    tokens: [],
    variables: [{ scope: root, entries: variables }],
    openItems: [],
    activations: [],
    nextIssue: 1,
    logicalTimeMs: 0,
    slots: {},
  };
}

export function emit(state: State, flows: readonly FlowId[], scope: ScopeOccurrenceId): State {
  return { ...state, tokens: [...state.tokens, ...flows.map((flow) => ({ flow, scope }))] };
}

/** The next activation number of `element`, recorded. */
export function activate(state: State, element: ElementId): readonly [State, number] {
  const count = (state.activations.find((entry) => entry[0] === element)?.[1] ?? 0) + 1;
  const activations = [
    [element, count] as const,
    ...state.activations.filter((entry) => entry[0] !== element),
  ];
  return [{ ...state, activations }, count];
}

export function issue(state: State): readonly [State, number] {
  return [{ ...state, nextIssue: state.nextIssue + 1 }, state.nextIssue];
}

export function openItem(state: State, kind: OpenKind, element: ElementId, scope: ScopeOccurrenceId): State {
  const [activated, activation] = activate(state, element);
  const [issued, id] = issue(activated);
  return { ...issued, openItems: [...issued.openItems, { id, kind, element, scope, activation }] };
}

export function closeItem(state: State, id: number): State {
  return { ...state, openItems: state.openItems.filter((item) => item.id !== id) };
}

function parentOf(state: State, id: ScopeOccurrenceId): ScopeOccurrenceId | null {
  return state.scopes.find((scope) => scope.id === id)?.parent ?? null;
}

/** Variables visible from `scope`, innermost first; the walk is bounded by the number of scope occurrences. */
export function visible(state: State, scope: ScopeOccurrenceId): readonly Binding[] {
  const result: Binding[] = [];
  let current: ScopeOccurrenceId | null = scope;
  for (let fuel = state.scopes.length; fuel > 0 && current !== null; fuel -= 1) {
    const id: ScopeOccurrenceId = current;
    result.push(...(state.variables.find((vars) => vars.scope === id)?.entries ?? []));
    current = parentOf(state, id);
  }
  return result;
}

/** Write `name` in the innermost visible scope that declares it, else in `scope` itself. */
export function write(state: State, scope: ScopeOccurrenceId, name: string, value: Value): State {
  const declares = (id: ScopeOccurrenceId): boolean =>
    state.variables.find((vars) => vars.scope === id)?.entries.some((entry) => entry[0] === name) ?? false;
  const owner = (): ScopeOccurrenceId => {
    let current = scope;
    for (let fuel = state.scopes.length; fuel > 0; fuel -= 1) {
      if (declares(current)) {
        return current;
      }
      const parent = parentOf(state, current);
      if (parent === null) {
        return scope;
      }
      current = parent;
    }
    return scope;
  };
  const target = owner();
  const replace = (entries: readonly Binding[]): readonly Binding[] =>
    entries.some((entry) => entry[0] === name)
      ? entries.map((entry): Binding => (entry[0] === name ? [name, value] : entry))
      : [...entries, [name, value]];
  if (state.variables.some((vars) => vars.scope === target)) {
    return {
      ...state,
      variables: state.variables.map((vars) =>
        vars.scope === target ? { ...vars, entries: replace(vars.entries) } : vars,
      ),
    };
  }
  return { ...state, variables: [...state.variables, { scope: target, entries: [[name, value]] }] };
}

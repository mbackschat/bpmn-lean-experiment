import type {
  EffectIncidentId,
  EffectOccurrenceId,
  MessageSubscriptionId,
  OccurrenceId,
  TimerOccurrenceId,
  UserTaskInstanceId,
  VariableBinding,
} from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import type {
  EffectDescriptor,
  MessageChannel,
  VariableMapping,
} from "./semantic-value-contract.js";
import type { BpmnErrorRoute } from "./semantic-process-contract.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import type { SequentialMultiInstanceController } from "./sequential-multi-instance-controller.js";
import type { ParallelMultiInstanceController } from "./parallel-multi-instance-controller.js";
import type { UserTaskMetadata } from "./user-task-metadata.js";
import { compareCanonicalStrings } from "./wire.js";

export enum ControlStateKind {
  NotStarted = "notStarted",
  Running = "running",
  Completed = "completed",
  Cancelled = "cancelled",
}

type NotStartedControl = DeepReadonly<{
  kind: ControlStateKind.NotStarted;
}>;

type InstancedControl = DeepReadonly<{
  kind:
    | ControlStateKind.Running
    | ControlStateKind.Completed
    | ControlStateKind.Cancelled;
  instanceId: string;
}>;

export type ControlState = NotStartedControl | InstancedControl;

export type ControlPlaceTokens = DeepReadonly<{
  placeId: string;
  owner: ScopeOccurrenceId;
  multiplicity: number;
}>;

export type ScopeOccurrenceId = DeepReadonly<{
  processInstanceId: string;
  definitionScopeId: string;
  activation: number;
}>;

export type RuntimeScopeOccurrence = DeepReadonly<{
  id: ScopeOccurrenceId;
  parent: ScopeOccurrenceId | null;
}>;

export type SemanticUserTaskWait = DeepReadonly<{
  id: UserTaskInstanceId;
  owner: ScopeOccurrenceId;
  name: string | null;
  metadata?: UserTaskMetadata;
  output: string;
}>;

export type SemanticTimerWait = DeepReadonly<{
  id: TimerOccurrenceId;
  owner: ScopeOccurrenceId;
  deadlineMs: number;
  output: string;
}>;

export type SemanticMessageWait = DeepReadonly<{
  id: MessageSubscriptionId;
  owner: ScopeOccurrenceId;
  channel: MessageChannel;
  output: string;
}>;

export type SemanticEffectWait = DeepReadonly<{
  id: EffectOccurrenceId;
  owner: ScopeOccurrenceId;
  descriptor: EffectDescriptor;
  arguments: VariableBinding[];
  outputMappings: VariableMapping[];
  bpmnErrorRoute: BpmnErrorRoute | null;
  output: string;
  incidentAlreadyRetried: boolean;
}>;

export type SemanticEffectIncident = DeepReadonly<{
  id: EffectIncidentId;
  wait: SemanticEffectWait;
}>;

/** Hidden occurrence-owned selected join inputs for one structured Inclusive split. */
export type SelectedBranchSet = DeepReadonly<{
  owner: ScopeOccurrenceId;
  selectionKey: string;
  expectedInputs: [string] | [string, string];
}>;

/** Hidden ownership link for one atomically armed Event-Based Gateway race. */
export type EventRace = DeepReadonly<{
  id: OccurrenceId;
  owner: ScopeOccurrenceId;
  messageSubscriptionId: MessageSubscriptionId;
  timerOccurrenceId: TimerOccurrenceId;
}>;

/** Hidden ownership link from one caller occurrence to one distinct called Process root. */
export type CalledProcessOccurrence = DeepReadonly<{
  id: OccurrenceId;
  caller: ScopeOccurrenceId;
  calledProcessId: string;
  calledRoot: ScopeOccurrenceId;
  returnOperationId: string;
}>;

/** Process-owned bindings that survive Activity-local cleanup and form the public variable projection. */
export type ProcessVariableScope = DeepReadonly<{
  bindings: VariableBinding[];
}>;

/** Private bindings owned by one complete semantic effect occurrence. */
export type ActivityVariableScope = DeepReadonly<{
  owner: EffectOccurrenceId;
  bindings: VariableBinding[];
}>;

/** The single runtime representation for Process and Activity-local data. */
export type ScopedVariables = DeepReadonly<{
  process: ProcessVariableScope;
  activities: ActivityVariableScope[];
}>;

type ActivationCounter = DeepReadonly<{
  elementId: string;
  count: number;
}>;

export type RuntimeState = DeepReadonly<{
  control: ControlState;
  initiationPending: boolean;
  scopeOccurrences: RuntimeScopeOccurrence[];
  controlTokens: ControlPlaceTokens[];
  userTaskWaits: SemanticUserTaskWait[];
  messageWaits: SemanticMessageWait[];
  timerWaits: SemanticTimerWait[];
  effectWaits: SemanticEffectWait[];
  effectIncidents: SemanticEffectIncident[];
  selectedBranchSets: SelectedBranchSet[];
  eventRaces: EventRace[];
  calledProcessOccurrences: CalledProcessOccurrence[];
  /**
   * What each open Activity occurrence owns: its body, and the handler waits attached to it.
   *
   * Present for exactly those Activities whose program gives them a wait-producing attached handler,
   * which makes existence a program property rather than a state one. Canonically ordered, and never
   * publicly projected: it replaces a derivation inside the publication path without becoming
   * publishable itself.
   */
  activityOccurrences: ActivityOccurrence[];
  /**
   * The outer controllers of open sequential Multi-Instance Activity occurrences.
   *
   * Optional at the shared type boundary so every state and continuation payload under a program
   * with no sequential Multi-Instance operation keeps its exact historical shape. Runtime-state
   * validation makes that encoding program-specific: such programs require absence, while a program
   * declaring the sequential Multi-Instance operation requires presence, including an empty array
   * before outer entry and after either closing route. The Lean account carries a plain list because
   * it has no cross-profile wire-shape distinction to preserve.
   */
  sequentialMultiInstanceControllers?: SequentialMultiInstanceController[];
  /** Present exactly for programs declaring the parallel Multi-Instance operation. */
  parallelMultiInstanceControllers?: ParallelMultiInstanceController[];
  variables: ScopedVariables;
  taskActivations: ActivationCounter[];
  messageActivations: ActivationCounter[];
  timerActivations: ActivationCounter[];
  eventRaceActivations: ActivationCounter[];
  callActivations: ActivationCounter[];
  effectActivations: ActivationCounter[];
  scopeActivations: ActivationCounter[];
  /**
   * Per-Activity-element activation high-water mark.
   *
   * Agrees with `taskActivations` for the two task families, whose Activity element *is* the task
   * element, and with `scopeActivations` for the Sub-Process family. The agreement is incidental: the
   * two count different things, an Activity's activations against the occurrences its body produced,
   * and nothing reads it. Asserting it would install the ordinal coincidence this record removes.
   */
  activityActivations: ActivationCounter[];
  endOccurrences: number;
  logicalTimeMs: number;
}>;

export const initialState: RuntimeState = {
  control: { kind: ControlStateKind.NotStarted },
  initiationPending: false,
  scopeOccurrences: [],
  controlTokens: [],
  userTaskWaits: [],
  messageWaits: [],
  timerWaits: [],
  effectWaits: [],
  effectIncidents: [],
  selectedBranchSets: [],
  eventRaces: [],
  calledProcessOccurrences: [],
  activityOccurrences: [],
  variables: {
    process: { bindings: [] },
    activities: [],
  },
  taskActivations: [],
  messageActivations: [],
  timerActivations: [],
  eventRaceActivations: [],
  callActivations: [],
  effectActivations: [],
  scopeActivations: [],
  activityActivations: [],
  endOccurrences: 0,
  logicalTimeMs: 0,
};

export function addToken(
  tokens: ReadonlyArray<ControlPlaceTokens>,
  placeId: string,
  owner: ScopeOccurrenceId,
): ReadonlyArray<ControlPlaceTokens> {
  const current = ownedTokenMultiplicity(tokens, placeId, owner);
  return [
    ...tokens.filter((token) =>
      token.placeId !== placeId || !sameScopeOccurrence(token.owner, owner)
    ),
    { placeId, owner, multiplicity: current + 1 },
  ].sort(compareTokenPlaces);
}

export function removeToken(
  tokens: ReadonlyArray<ControlPlaceTokens>,
  placeId: string,
  owner: ScopeOccurrenceId,
): ReadonlyArray<ControlPlaceTokens> {
  const current = ownedTokenMultiplicity(tokens, placeId, owner);
  if (current <= 1) {
    return tokens.filter((token) =>
      token.placeId !== placeId || !sameScopeOccurrence(token.owner, owner)
    );
  }
  return tokens.map((token) =>
    token.placeId === placeId && sameScopeOccurrence(token.owner, owner)
      ? { ...token, multiplicity: token.multiplicity - 1 }
      : token
  );
}

export function tokenMultiplicity(
  tokens: ReadonlyArray<ControlPlaceTokens>,
  placeId: string,
): number {
  return tokens
    .filter((token) => token.placeId === placeId)
    .reduce((total, token) => total + token.multiplicity, 0);
}

export function ownedTokenMultiplicity(
  tokens: ReadonlyArray<ControlPlaceTokens>,
  placeId: string,
  owner: ScopeOccurrenceId,
): number {
  return tokens.find((token) =>
    token.placeId === placeId && sameScopeOccurrence(token.owner, owner)
  )?.multiplicity ?? 0;
}

export function tokenOwners(
  tokens: ReadonlyArray<ControlPlaceTokens>,
  placeId: string,
): ReadonlyArray<ScopeOccurrenceId> {
  return tokens
    .filter((token) => token.placeId === placeId && token.multiplicity > 0)
    .map(({ owner }) => owner);
}

/**
 * The activation one more element occurrence would take, without recording it.
 *
 * A counter family with no entry for an element has issued nothing, so the first activation is `1`.
 * Callers pair this with `setActivationCount` in the same transition; reading it without recording it
 * would hand two occurrences the same key.
 */
export function nextActivation(
  counters: ReadonlyArray<{ readonly elementId: string; readonly count: number }>,
  elementId: string,
): number {
  return (counters.find((entry) => entry.elementId === elementId)?.count ?? 0) + 1;
}

export function setActivationCount(
  counters: ReadonlyArray<ActivationCounter>,
  elementId: string,
  count: number,
): ReadonlyArray<ActivationCounter> {
  return [
    ...counters.filter((counter) => counter.elementId !== elementId),
    { elementId, count },
  ].sort((left, right) =>
    compareCanonicalStrings(left.elementId, right.elementId)
  );
}

export function sameOccurrence(
  left: OccurrenceId,
  right: OccurrenceId,
): boolean {
  return (
    left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation
  );
}

export function sameScopeOccurrence(
  left: ScopeOccurrenceId,
  right: ScopeOccurrenceId,
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.definitionScopeId === right.definitionScopeId &&
    left.activation === right.activation;
}

export function compareSelectedBranchSets(
  left: SelectedBranchSet,
  right: SelectedBranchSet,
): number {
  const instanceOrder = compareCanonicalStrings(
    left.owner.processInstanceId,
    right.owner.processInstanceId,
  );
  if (instanceOrder !== 0) {
    return instanceOrder;
  }
  const scopeOrder = compareCanonicalStrings(
    left.owner.definitionScopeId,
    right.owner.definitionScopeId,
  );
  if (scopeOrder !== 0) {
    return scopeOrder;
  }
  const activationOrder = left.owner.activation - right.owner.activation;
  return activationOrder !== 0
    ? activationOrder
    : compareCanonicalStrings(left.selectionKey, right.selectionKey);
}

export function compareEventRaces(left: EventRace, right: EventRace): number {
  const idOrder = compareOccurrences(left.id, right.id);
  return idOrder !== 0
    ? idOrder
    : compareScopeOccurrences(left.owner, right.owner);
}

export function compareCalledProcessOccurrences(
  left: CalledProcessOccurrence,
  right: CalledProcessOccurrence,
): number {
  const callerOrder = compareScopeOccurrences(left.caller, right.caller);
  return callerOrder !== 0
    ? callerOrder
    : compareOccurrences(left.id, right.id);
}

export function compareUserTaskWaits(
  left: SemanticUserTaskWait,
  right: SemanticUserTaskWait,
): number {
  return compareOccurrences(left.id, right.id);
}

export function compareTimerWaits(
  left: SemanticTimerWait,
  right: SemanticTimerWait,
): number {
  return compareOccurrences(left.id, right.id);
}

export function compareMessageWaits(
  left: SemanticMessageWait,
  right: SemanticMessageWait,
): number {
  return compareOccurrences(left.id, right.id);
}

export function compareEffectWaits(
  left: SemanticEffectWait,
  right: SemanticEffectWait,
): number {
  return compareOccurrences(left.id, right.id);
}

export function compareEffectIncidents(
  left: SemanticEffectIncident,
  right: SemanticEffectIncident,
): number {
  return compareOccurrences(left.id.effectId, right.id.effectId);
}

function compareTokenPlaces(
  left: ControlPlaceTokens,
  right: ControlPlaceTokens,
): number {
  const placeOrder = compareCanonicalStrings(left.placeId, right.placeId);
  return placeOrder !== 0
    ? placeOrder
    : compareScopeOccurrences(left.owner, right.owner);
}

function compareScopeOccurrences(
  left: ScopeOccurrenceId,
  right: ScopeOccurrenceId,
): number {
  const instanceOrder = compareCanonicalStrings(
    left.processInstanceId,
    right.processInstanceId,
  );
  if (instanceOrder !== 0) {
    return instanceOrder;
  }
  const scopeOrder = compareCanonicalStrings(
    left.definitionScopeId,
    right.definitionScopeId,
  );
  return scopeOrder !== 0 ? scopeOrder : left.activation - right.activation;
}

function compareOccurrences(
  left: OccurrenceId,
  right: OccurrenceId,
): number {
  if (left.processInstanceId !== right.processInstanceId) {
    return compareCanonicalStrings(
      left.processInstanceId,
      right.processInstanceId,
    );
  }
  if (left.elementId !== right.elementId) {
    return compareCanonicalStrings(left.elementId, right.elementId);
  }
  return left.activation - right.activation;
}

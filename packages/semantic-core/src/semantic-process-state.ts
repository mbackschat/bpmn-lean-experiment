import type {
  EffectOccurrenceId,
  OccurrenceId,
  TimerOccurrenceId,
  UserTaskInstanceId,
  VariableBinding,
} from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import type {
  BpmnErrorRoute,
  EffectDescriptor,
  VariableMapping,
} from "./semantic-process-contract.js";
import { compareCanonicalStrings } from "./wire.js";

export enum ControlStateKind {
  NotStarted = "notStarted",
  Running = "running",
  Completed = "completed",
}

type NotStartedControl = DeepReadonly<{
  kind: ControlStateKind.NotStarted;
}>;

type InstancedControl = DeepReadonly<{
  kind: ControlStateKind.Running | ControlStateKind.Completed;
  instanceId: string;
}>;

export type ControlState = NotStartedControl | InstancedControl;

export type ControlPlaceTokens = DeepReadonly<{
  placeId: string;
  multiplicity: number;
}>;

export type SemanticUserTaskWait = DeepReadonly<{
  id: UserTaskInstanceId;
  name: string | null;
  output: string;
}>;

export type SemanticTimerWait = DeepReadonly<{
  id: TimerOccurrenceId;
  deadlineMs: number;
  output: string;
}>;

export type SemanticEffectWait = DeepReadonly<{
  id: EffectOccurrenceId;
  descriptor: EffectDescriptor;
  arguments: VariableBinding[];
  outputMappings: VariableMapping[];
  bpmnErrorRoute: BpmnErrorRoute | null;
  output: string;
}>;

type ActivationCounter = DeepReadonly<{
  elementId: string;
  count: number;
}>;

export type RuntimeState = DeepReadonly<{
  control: ControlState;
  initiationPending: boolean;
  controlTokens: ControlPlaceTokens[];
  userTaskWaits: SemanticUserTaskWait[];
  timerWaits: SemanticTimerWait[];
  effectWaits: SemanticEffectWait[];
  processVariables: VariableBinding[];
  taskActivations: ActivationCounter[];
  timerActivations: ActivationCounter[];
  effectActivations: ActivationCounter[];
  endOccurrences: number;
  logicalTimeMs: number;
}>;

export const initialState: RuntimeState = {
  control: { kind: ControlStateKind.NotStarted },
  initiationPending: false,
  controlTokens: [],
  userTaskWaits: [],
  timerWaits: [],
  effectWaits: [],
  processVariables: [],
  taskActivations: [],
  timerActivations: [],
  effectActivations: [],
  endOccurrences: 0,
  logicalTimeMs: 0,
};

export function addToken(
  tokens: ReadonlyArray<ControlPlaceTokens>,
  placeId: string,
): ReadonlyArray<ControlPlaceTokens> {
  const current = tokenMultiplicity(tokens, placeId);
  return [
    ...tokens.filter((token) => token.placeId !== placeId),
    { placeId, multiplicity: current + 1 },
  ].sort(compareTokenPlaces);
}

export function removeToken(
  tokens: ReadonlyArray<ControlPlaceTokens>,
  placeId: string,
): ReadonlyArray<ControlPlaceTokens> {
  const current = tokenMultiplicity(tokens, placeId);
  if (current <= 1) {
    return tokens.filter((token) => token.placeId !== placeId);
  }
  return tokens.map((token) =>
    token.placeId === placeId
      ? { ...token, multiplicity: token.multiplicity - 1 }
      : token
  );
}

export function tokenMultiplicity(
  tokens: ReadonlyArray<ControlPlaceTokens>,
  placeId: string,
): number {
  return tokens.find((token) => token.placeId === placeId)?.multiplicity ?? 0;
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

export function compareEffectWaits(
  left: SemanticEffectWait,
  right: SemanticEffectWait,
): number {
  return compareOccurrences(left.id, right.id);
}

function compareTokenPlaces(
  left: ControlPlaceTokens,
  right: ControlPlaceTokens,
): number {
  return compareCanonicalStrings(left.placeId, right.placeId);
}

function compareOccurrences(left: OccurrenceId, right: OccurrenceId): number {
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

import type { ActivityOccurrenceId } from "./activity-occurrence.js";
import { sameScopeOccurrence } from "./semantic-process-state.js";
import type { ScopeOccurrenceId } from "./semantic-process-state.js";

export type ParallelScopeIteration = Readonly<{
  scope: ScopeOccurrenceId;
  loopCounter: number;
  item: string;
}>;
export type ParallelScopeController = Readonly<{
  id: ActivityOccurrenceId;
  total: number;
  completed: number;
}>;

export enum ParallelScopeRetirementKind {
  Remaining = "remaining",
  NaturalCompletion = "naturalCompletion",
  EarlyCompletion = "earlyCompletion",
}

type NonemptyIterations = readonly [ParallelScopeIteration, ...ParallelScopeIteration[]];
type Retirement = Readonly<{
  controller: ParallelScopeController;
  completedIteration: ParallelScopeIteration;
}> & (
  | Readonly<{ kind: ParallelScopeRetirementKind.Remaining; iterations: NonemptyIterations }>
  | Readonly<{ kind: ParallelScopeRetirementKind.NaturalCompletion }>
  | Readonly<{ kind: ParallelScopeRetirementKind.EarlyCompletion; cancelled: NonemptyIterations }>
);

/** PMIS ownership: the Activity's membership is authoritative; counters cannot invent missing bodies. */
export function validParallelScopePopulation(controller: ParallelScopeController,
  iterations: readonly ParallelScopeIteration[]): boolean {
  if (!Number.isSafeInteger(controller.total) || controller.total < 1 ||
      !Number.isSafeInteger(controller.completed) || controller.completed < 0 ||
      controller.completed >= controller.total ||
      controller.completed + iterations.length !== controller.total) return false;
  return validParallelScopeIterations(controller.id.processInstanceId, iterations) &&
    iterations.every(({ loopCounter }) => loopCounter < controller.total);
}

/** The body-owned population has stable ordered indices and one scope definition (PMIS-ENTER-01). */
export function validParallelScopeIterations(processInstanceId: string,
  iterations: readonly ParallelScopeIteration[]): boolean {
  if (iterations.length === 0) return false;
  const definition = iterations[0]?.scope.definitionScopeId;
  return iterations.every((iteration, index) =>
    Number.isSafeInteger(iteration.loopCounter) && iteration.loopCounter >= 0 &&
    (index === 0 || (iterations[index - 1]?.loopCounter ?? iteration.loopCounter) < iteration.loopCounter) &&
    iteration.scope.processInstanceId === processInstanceId &&
    iteration.scope.definitionScopeId === definition &&
    Number.isSafeInteger(iteration.scope.activation) && iteration.scope.activation > 0 &&
    !iterations.slice(0, index).some(previous => sameScopeOccurrence(previous.scope, iteration.scope)));
}

/** PMIS-END-01 and PMIS-CANCEL-01: retire one already-quiescent body; the caller owns quiescence and state cleanup. */
export function retireParallelScopeIteration(controller: ParallelScopeController,
  iterations: readonly ParallelScopeIteration[], target: ScopeOccurrenceId,
  completionCondition: boolean): Retirement | null {
  if (!validParallelScopePopulation(controller, iterations)) return null;
  const index = iterations.findIndex(iteration => sameScopeOccurrence(iteration.scope, target));
  const completedIteration = iterations[index];
  if (completedIteration === undefined) return null;
  const remaining = [...iterations.slice(0, index), ...iterations.slice(index + 1)];
  const successor = { ...controller, completed: controller.completed + 1 };
  const first = remaining[0];
  if (first === undefined) return {
    kind: ParallelScopeRetirementKind.NaturalCompletion, controller: successor, completedIteration,
  };
  const survivors: NonemptyIterations = [first, ...remaining.slice(1)];
  if (completionCondition) return {
    kind: ParallelScopeRetirementKind.EarlyCompletion, controller: successor, completedIteration,
    cancelled: survivors,
  };
  return { kind: ParallelScopeRetirementKind.Remaining, controller: successor, completedIteration,
    iterations: survivors };
}

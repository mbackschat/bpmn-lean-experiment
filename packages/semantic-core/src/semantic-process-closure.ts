import type { SemanticOperation } from "./semantic-process-contract.js";

type ExecutableInternalStep<State> = Readonly<{
  operation: SemanticOperation;
  successor: State;
}>;

export type SupportedClosureResult<State, Step> = Readonly<{
  state: State;
  hitBound: boolean;
  ambiguousInternalChoice: boolean;
  steps: ReadonlyArray<Step>;
  batches: ReadonlyArray<ReadonlyArray<Step>>;
}>;

export type RefusableClosureFrontier<Step, Refusal> = Readonly<{
  steps: ReadonlyArray<Step>;
  refusal: Refusal | null;
}>;

export type RefusableClosureResult<State, Step, Refusal> =
  SupportedClosureResult<State, Step> & Readonly<{
    refusal: Refusal | null;
  }>;

/**
 * Closes only selector states whose complete enabled set has reviewed meaning.
 * A zero-fuel boundary reports exhaustion before classifying its enabled set,
 * matching the Lean evaluator's closure precedence.
 */
export function closeSupportedInternalOperations<
  State,
  Step extends ExecutableInternalStep<State>,
>(
  initialState: State,
  limit: number,
  enabledOperations: (state: State) => ReadonlyArray<Step>,
  frontierIsPairwiseIndependent: (
    state: State,
    enabled: ReadonlyArray<Step>,
  ) => boolean,
): SupportedClosureResult<State, Step> {
  const result = closeRefusableInternalOperations(
    initialState,
    limit,
    (state) => ({ steps: enabledOperations(state), refusal: null }),
    frontierIsPairwiseIndependent,
  );
  return {
    state: result.state,
    hitBound: result.hitBound,
    ambiguousInternalChoice: result.ambiguousInternalChoice,
    steps: result.steps,
    batches: result.batches,
  };
}

/** Closes a three-arm internal frontier while making refusal discard every provisional batch. */
export function closeRefusableInternalOperations<
  State,
  Step extends ExecutableInternalStep<State>,
  Refusal,
>(
  initialState: State,
  limit: number,
  attemptedOperations: (
    state: State,
  ) => RefusableClosureFrontier<Step, Refusal>,
  frontierIsPairwiseIndependent: (
    state: State,
    enabled: ReadonlyArray<Step>,
  ) => boolean,
): RefusableClosureResult<State, Step, Refusal> {
  let state = initialState;
  const steps: Step[] = [];
  const batches: Step[][] = [];
  while (steps.length < limit) {
    const frontier = attemptedOperations(state);
    if (frontier.refusal !== null) {
      return refused(initialState, frontier.refusal);
    }
    const enabled = frontier.steps;
    if (enabled.length === 0) {
      return accepted(closed(state, steps, batches));
    }
    if (enabled.length > 1) {
      if (!frontierIsPairwiseIndependent(state, enabled)) {
        return accepted(ambiguous(state, steps, batches));
      }
      if (enabled.length > limit - steps.length) {
        return accepted(bounded(state, steps, batches));
      }

      const batchStart = state;
      const batch: Step[] = [];
      for (const expected of enabled) {
        const reevaluated = attemptedOperations(state);
        if (reevaluated.refusal !== null) {
          return refused(initialState, reevaluated.refusal);
        }
        const selected = reevaluated.steps.find(({ operation }) =>
          operation.id === expected.operation.id
        );
        if (selected === undefined) {
          return accepted(ambiguous(batchStart, steps, batches));
        }
        batch.push(selected);
        state = selected.successor;
      }
      steps.push(...batch);
      batches.push(batch);
      continue;
    }
    const selected = enabled[0];
    if (selected === undefined) {
      return accepted(closed(state, steps, batches));
    }
    steps.push(selected);
    batches.push([selected]);
    state = selected.successor;
  }
  const finalFrontier = attemptedOperations(state);
  if (finalFrontier.refusal !== null) {
    return refused(initialState, finalFrontier.refusal);
  }
  return {
    state,
    hitBound: finalFrontier.steps.length > 0,
    ambiguousInternalChoice: false,
    steps,
    batches,
    refusal: null,
  };
}

function accepted<State, Step, Refusal>(
  result: SupportedClosureResult<State, Step>,
): RefusableClosureResult<State, Step, Refusal> {
  return { ...result, refusal: null };
}

function ambiguous<State, Step>(
  state: State,
  steps: ReadonlyArray<Step>,
  batches: ReadonlyArray<ReadonlyArray<Step>>,
): SupportedClosureResult<State, Step> {
  return {
    state,
    hitBound: false,
    ambiguousInternalChoice: true,
    steps,
    batches,
  };
}

function refused<State, Step, Refusal>(
  initialState: State,
  refusal: Refusal,
): RefusableClosureResult<State, Step, Refusal> {
  return {
    state: initialState,
    hitBound: false,
    ambiguousInternalChoice: false,
    steps: [],
    batches: [],
    refusal,
  };
}

function closed<State, Step>(
  state: State,
  steps: ReadonlyArray<Step>,
  batches: ReadonlyArray<ReadonlyArray<Step>>,
): SupportedClosureResult<State, Step> {
  return {
    state,
    hitBound: false,
    ambiguousInternalChoice: false,
    steps,
    batches,
  };
}

function bounded<State, Step>(
  state: State,
  steps: ReadonlyArray<Step>,
  batches: ReadonlyArray<ReadonlyArray<Step>>,
): SupportedClosureResult<State, Step> {
  return {
    state,
    hitBound: true,
    ambiguousInternalChoice: false,
    steps,
    batches,
  };
}

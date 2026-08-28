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
  let state = initialState;
  const steps: Step[] = [];
  const batches: Step[][] = [];
  while (steps.length < limit) {
    const enabled = enabledOperations(state);
    if (enabled.length === 0) {
      return closed(state, steps, batches);
    }
    if (enabled.length > 1) {
      if (!frontierIsPairwiseIndependent(state, enabled)) {
        return ambiguous(state, steps, batches);
      }
      if (enabled.length > limit - steps.length) {
        return bounded(state, steps, batches);
      }

      const batchStart = state;
      const batch: Step[] = [];
      for (const expected of enabled) {
        const selected = enabledOperations(state).find(({ operation }) =>
          operation.id === expected.operation.id
        );
        if (selected === undefined) {
          return ambiguous(batchStart, steps, batches);
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
      return closed(state, steps, batches);
    }
    steps.push(selected);
    batches.push([selected]);
    state = selected.successor;
  }
  return {
    state,
    hitBound: enabledOperations(state).length > 0,
    ambiguousInternalChoice: false,
    steps,
    batches,
  };
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

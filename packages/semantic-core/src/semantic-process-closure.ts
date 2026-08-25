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
  pairIsIndependent: (
    state: State,
    enabled: ReadonlyArray<Step>,
  ) => boolean,
): SupportedClosureResult<State, Step> {
  let state = initialState;
  const steps: Step[] = [];
  while (steps.length < limit) {
    const enabled = enabledOperations(state);
    if (enabled.length === 0) {
      return closed(state, steps);
    }
    if (enabled.length > 1) {
      if (!pairIsIndependent(state, enabled)) {
        return ambiguous(state, steps);
      }
      const first = enabled[0];
      const expectedSecond = enabled[1];
      if (first === undefined || expectedSecond === undefined) {
        return ambiguous(state, steps);
      }
      if (limit - steps.length === 1) {
        steps.push(first);
        state = first.successor;
        continue;
      }
      const afterFirst = enabledOperations(first.successor);
      const second = afterFirst[0];
      if (
        afterFirst.length !== 1 ||
        second === undefined ||
        second.operation.id !== expectedSecond.operation.id
      ) {
        return ambiguous(state, steps);
      }
      steps.push(first, second);
      state = second.successor;
      continue;
    }
    const selected = enabled[0];
    if (selected === undefined) {
      return closed(state, steps);
    }
    steps.push(selected);
    state = selected.successor;
  }
  return {
    state,
    hitBound: enabledOperations(state).length > 0,
    ambiguousInternalChoice: false,
    steps,
  };
}

function ambiguous<State, Step>(
  state: State,
  steps: ReadonlyArray<Step>,
): SupportedClosureResult<State, Step> {
  return {
    state,
    hitBound: false,
    ambiguousInternalChoice: true,
    steps,
  };
}

function closed<State, Step>(
  state: State,
  steps: ReadonlyArray<Step>,
): SupportedClosureResult<State, Step> {
  return {
    state,
    hitBound: false,
    ambiguousInternalChoice: false,
    steps,
  };
}

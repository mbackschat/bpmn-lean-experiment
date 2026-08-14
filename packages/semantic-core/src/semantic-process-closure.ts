import { SemanticOperationKind } from "./semantic-process-contract.js";
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
): SupportedClosureResult<State, Step> {
  let state = initialState;
  const steps: Step[] = [];
  for (let stepCount = 0; stepCount < limit; stepCount += 1) {
    const enabled = enabledOperations(state);
    if (enabled.length === 0) {
      return closed(state, steps);
    }
    if (enabled.length > 1 && !isIndependentParallelTaskPair(enabled)) {
      return {
        state,
        hitBound: false,
        ambiguousInternalChoice: true,
        steps,
      };
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

function isIndependentParallelTaskPair<State>(
  enabled: ReadonlyArray<ExecutableInternalStep<State>>,
): boolean {
  if (enabled.length !== 2) {
    return false;
  }
  const left = enabled[0]?.operation;
  const right = enabled[1]?.operation;
  if (
    left?.kind !== SemanticOperationKind.AwaitUserTask ||
    right?.kind !== SemanticOperationKind.AwaitUserTask
  ) {
    return false;
  }
  return left.input !== right.input &&
    left.output !== right.output &&
    left.task.elementId !== right.task.elementId;
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

/** Exclusive Merge token movement for the resumption-bounded cyclic-control-flow capsule. */
import type {
  MergeExclusiveOperation,
} from "./semantic-process-contract.js";
import {
  addToken,
  removeToken,
} from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

/**
 * Executes the selected profile's unique-offer subset and preserves the token's scope owner.
 *
 * Total multiplicity is the discriminator. Returning no successor for multiple offers records
 * evaluator incompleteness outside this profile, not a declarative refusal of BPMN Multi-Merge.
 */
export function mergeExclusive(
  operation: MergeExclusiveOperation,
  state: RuntimeState,
): RuntimeState | null {
  const offered = state.controlTokens.filter((token) =>
    operation.inputs.includes(token.placeId) && token.multiplicity > 0
  );
  const totalMultiplicity = offered.reduce(
    (total, token) => total + token.multiplicity,
    0,
  );
  const token = offered[0];
  if (totalMultiplicity !== 1 || token === undefined) {
    return null;
  }
  return {
    ...state,
    controlTokens: addToken(
      removeToken(state.controlTokens, token.placeId, token.owner),
      operation.output,
      token.owner,
    ),
  };
}

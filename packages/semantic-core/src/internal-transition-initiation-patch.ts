import {
  addToken,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export type InternalInitiationPatch = Readonly<{
  owner: ScopeOccurrenceId;
  outputs: ReadonlyArray<string>;
}>;

/** Applies the local Process-start edits without replacing unrelated runtime collections. */
export function applyInternalInitiationPatch(
  state: RuntimeState,
  patch: InternalInitiationPatch,
): RuntimeState {
  return {
    ...state,
    initiationPending: false,
    controlTokens: patch.outputs.reduce(
      (tokens, output) => addToken(tokens, output, patch.owner),
      state.controlTokens,
    ),
  };
}

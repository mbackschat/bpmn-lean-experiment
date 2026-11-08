/** Admission of Scopes, transcribed from `Kernel/Admission/Scopes.lean`. A refusal carries a stable code. */
import type { ScopePayload } from "../il/types.js";

/**
 * A local variable is declared by an input mapping; a declared local without one has no initial value the kernel
 * could choose.
 */
export function scope(payload: ScopePayload): string | null {
  const declared = payload.envelope.inputs.map((mapping) => mapping.target);
  if (payload.envelope.multiInstance !== null) {
    return "scope.multiInstance";
  }
  if (payload.localVariables.some((name) => !declared.includes(name))) {
    return "scope.localVariableWithoutInput";
  }
  return null;
}

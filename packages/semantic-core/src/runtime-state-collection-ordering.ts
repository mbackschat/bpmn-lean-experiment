import type { ScopedVariables } from "./semantic-process-state.js";
import { compareLocalDataOwners } from "./local-data-owner.js";

export function compareActivityVariableScopes(
  left: ScopedVariables["activities"][number],
  right: ScopedVariables["activities"][number],
): number {
  return compareLocalDataOwners(left.owner, right.owner);
}

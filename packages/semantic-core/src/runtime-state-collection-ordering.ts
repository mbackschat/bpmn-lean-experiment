import type { ScopedVariables } from "./semantic-process-state.js";
import { compareCanonicalStrings } from "./wire.js";

export function compareActivityVariableScopes(
  left: ScopedVariables["activities"][number],
  right: ScopedVariables["activities"][number],
): number {
  const instanceOrder = compareCanonicalStrings(
    left.owner.processInstanceId,
    right.owner.processInstanceId,
  );
  if (instanceOrder !== 0) {
    return instanceOrder;
  }
  const elementOrder = compareCanonicalStrings(
    left.owner.elementId,
    right.owner.elementId,
  );
  return elementOrder !== 0
    ? elementOrder
    : left.owner.activation - right.owner.activation;
}

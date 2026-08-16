import {
  isCanonicallyOrderedVariablePatch,
  isVariableBinding,
} from "@bpmn-lean/semantic-core";

/** Validates one complete public variable patch without selecting a write surface. */
export function isCanonicalPublicationVariablePatch(value: unknown): boolean {
  return Array.isArray(value) &&
    value.every(isVariableBinding) &&
    isCanonicallyOrderedVariablePatch(value);
}

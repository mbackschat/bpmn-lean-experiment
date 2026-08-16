import { isVariablePatch } from "@bpmn-lean/semantic-core";

/** Validates one complete public variable patch without selecting a write surface. */
export function isCanonicalPublicationVariablePatch(value: unknown): boolean {
  return isVariablePatch(value);
}

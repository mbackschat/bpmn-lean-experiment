import type {
  PublicControlTokenPosition,
  PublicScopePosition,
  ScopeOccurrenceId,
} from "@bpmn-lean/platform-contracts";

/** Structural React identity for one exact published control-token position. */
export function executionTokenKey(token: PublicControlTokenPosition): string {
  return JSON.stringify([
    token.sequenceFlowId,
    token.owner.processInstanceId,
    token.owner.definitionScopeId,
    token.owner.activation,
  ]);
}

/** Structural React identity for one exact published scope position. */
export function executionScopeKey(scope: PublicScopePosition): string {
  return JSON.stringify([
    scope.id.processInstanceId,
    scope.id.definitionScopeId,
    scope.id.activation,
  ]);
}

export function displayScopeOccurrence(id: ScopeOccurrenceId): string {
  return `${id.processInstanceId} / ${id.definitionScopeId} / activation ${id.activation}`;
}

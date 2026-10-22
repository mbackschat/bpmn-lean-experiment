import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";

/**
 * CEA-OCCUR-01 and CEA-QUIESCE-01: the scope operations of a merge target, which alone take the occurrence-addressed
 * path in the embedded completion profile. The entry is the `enterScope` fed by a `mergeExclusive`, the completion that
 * entry's child definition's `completeScope`, which always has a parent continuation, so a root completion is never a
 * merge target; every other scope operation keeps its definition-addressed path and its
 * prepared batches. Program-static, so a Program without a merge region keeps its exact execution.
 */
export function isMergeTargetOperation(program: SemanticProcessProgram, operation: SemanticOperation): boolean {
  if (program.identity.semanticProfile !== SemanticProfileId.EmbeddedSubProcessCompletion) return false;
  const fedByMerge = (input: string): boolean => program.operations.some(candidate =>
    candidate.kind === SemanticOperationKind.MergeExclusive && candidate.output === input);
  switch (operation.kind) {
    case SemanticOperationKind.EnterScope:
      return fedByMerge(operation.input);
    case SemanticOperationKind.CompleteScope:
      return operation.parentOutput !== null && program.operations.some(candidate =>
        candidate.kind === SemanticOperationKind.EnterScope && candidate.childScopeId === operation.scopeId &&
        fedByMerge(candidate.input));
    default:
      return false;
  }
}

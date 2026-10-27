import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";

/** The Program fields the data-bearing gate reads, so a value-domain selector needs no more of the Program. */
export type DataGateProgram = Pick<SemanticProcessProgram, "identity" | "scopeLocalData" | "operations">;

/**
 * Whether an embedded completion Program carries data: a scope declaration or a mapped Service Task, per the
 * concurrent scope data proposal's required scope. A data-free Program of that profile keeps its empty value domains
 * and the scalar effect policy, so every earlier admission of the profile is unchanged.
 */
export function embeddedScopeDataBearing(program: DataGateProgram): boolean {
  return program.identity.semanticProfile === SemanticProfileId.EmbeddedSubProcessCompletion &&
    ((program.scopeLocalData?.length ?? 0) > 0 || program.operations.some(operation =>
      operation.kind === SemanticOperationKind.AwaitEffect &&
      (operation.effect.inputMappings.length > 0 || operation.effect.outputMappings.length > 0)));
}

import {
  SemanticOperationKind,
  SemanticOriginKind,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  ScopeOccurrenceId,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

type RootScopedProgramInput = Omit<
  SemanticProcessProgram,
  | "definitionScopes"
  | "operationScopes"
  | "controlPlaceScopes"
  | "operations"
> & Readonly<{
  operations: ReadonlyArray<SemanticOperation>;
}>;

/** Adds the explicit root-scope contract shared by pre-scope semantic fixtures. */
export function rootScopedProgram(
  input: RootScopedProgramInput,
): SemanticProcessProgram {
  const scopeId = rootScopeId(input.processId);
  const completion: SemanticOperation = {
    id: `operation:complete-scope:${scopeId}`,
    kind: SemanticOperationKind.CompleteScope,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: input.processId,
    },
    scopeId,
    parentOutput: null,
  };
  const operations = [
    ...input.operations.filter(
      ({ kind }) => kind !== SemanticOperationKind.CompleteScope,
    ),
    completion,
  ].sort((left, right) => compareCanonicalStrings(left.id, right.id));
  return {
    ...input,
    definitionScopes: [{
      id: scopeId,
      parentScopeId: null,
      originElementId: input.processId,
    }],
    operationScopes: operations.map(({ id: operationId }) => ({
      operationId,
      scopeId,
    })),
    controlPlaceScopes: input.controlPlaces.map(({ id: controlPlaceId }) => ({
      controlPlaceId,
      scopeId,
    })),
    operations,
  };
}

export function rootScopeOccurrence(
  processId: string,
  processInstanceId: string,
): ScopeOccurrenceId {
  return {
    processInstanceId,
    definitionScopeId: rootScopeId(processId),
    activation: 1,
  };
}

function rootScopeId(processId: string): string {
  return `scope:${processId}`;
}

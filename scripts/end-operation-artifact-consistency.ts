import type {
  CheckedProcess,
  SemanticProcessProgram,
  TerminateScopeOperation,
} from "../packages/semantic-core/src/index.ts";

/** Verifies the exact checked-to-IL binding for containing-scope termination. */
export function verifyTerminateScopeBindings(
  checkedProcess: CheckedProcess,
  semanticProcess: SemanticProcessProgram,
): void {
  const checkedTerminations = checkedProcess.nodes.filter(
    ({ kind }) => kind === "terminateEndEvent",
  );
  const terminations = semanticProcess.operations.filter(
    (operation): operation is TerminateScopeOperation =>
      operation.kind === "terminateScope",
  );
  const operationScope = (operationId: string): string | undefined =>
    semanticProcess.operationScopes.find(
      ({ operationId: candidate }) => candidate === operationId,
    )?.scopeId;
  const placeScope = (controlPlaceId: string): string | undefined =>
    semanticProcess.controlPlaceScopes.find(
      ({ controlPlaceId: candidate }) => candidate === controlPlaceId,
    )?.scopeId;

  for (const checkedTermination of checkedTerminations) {
    const matching = terminations.filter(
      ({ origin }) => origin.elementId === checkedTermination.id,
    );
    const operation = matching[0];
    const checkedScopeId = checkedProcess.nodeScopes.find(
      ({ nodeId }) => nodeId === checkedTermination.id,
    )?.scopeId;
    const incomingFlows = checkedProcess.sequenceFlows.filter(
      ({ targetId }) => targetId === checkedTermination.id,
    );
    const input = incomingFlows.length === 1
      ? semanticProcess.controlPlaces.find(
        ({ origin }) => origin.elementId === incomingFlows[0]?.id,
      )
      : undefined;
    if (
      matching.length !== 1 ||
      operation === undefined ||
      checkedScopeId === undefined ||
      input === undefined ||
      operation.input !== input.id ||
      operation.scopeId !== checkedScopeId ||
      operationScope(operation.id) !== checkedScopeId ||
      placeScope(input.id) !== checkedScopeId
    ) {
      throw new Error(
        `Terminate End ${checkedTermination.id} has no exact containing-scope operation binding`,
      );
    }
  }
  if (terminations.length !== checkedTerminations.length) {
    throw new Error(
      "Terminate End operation cardinality differs from checked source",
    );
  }
}

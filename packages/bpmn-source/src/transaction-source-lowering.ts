import { CheckedNodeKind, SemanticOperationKind, SemanticOriginKind } from "@bpmn-lean/semantic-core";
import type { CheckedProcess, CancelTransactionOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { controlPlaceId, operationId } from "./semantic-process-identifiers.js";

export function lowerTransactionDeclarations(source: CheckedProcess): Pick<SemanticProcessProgram, "compensationActivityRetention" | "compensationExecution"> {
  const declaration = source.transactionCancellation;
  if (declaration === undefined) return {};
  const { subject } = declaration;
  return {
    compensationActivityRetention: {
      definitionScopeId: declaration.definitionScopeId,
      targets: [{ activityElementId: subject.subjectElementId, boundaryEventElementId: subject.boundaryEventElementId,
        compensationActivityElementId: subject.body.handlerElementId }],
      limits: declaration.retentionLimits,
    },
    compensationExecution: {
      definitionScopeId: declaration.definitionScopeId,
      triggerOperationId: operationId(declaration.triggerElementId),
      subjects: [{ kind: "boundaryActivity", subjectElementId: subject.subjectElementId,
        body: { ...subject.body, input: { kind: "empty" } } }],
      dependencies: [], limits: declaration.executionLimits,
    },
  };
}

export function lowerTransactionCancel(node: Extract<CheckedProcess["nodes"][number], { kind: CheckedNodeKind.CancelEndEvent }>, source: CheckedProcess): CancelTransactionOperation {
  const declaration = source.transactionCancellation;
  const transaction = source.nodes.find((candidate) => candidate.kind === CheckedNodeKind.TransactionSubProcess && candidate.childScopeId === declaration?.definitionScopeId);
  const boundary = source.nodes.find((candidate) => candidate.kind === CheckedNodeKind.CancelBoundaryEvent && candidate.attachedToRef === transaction?.id);
  const incoming = source.sequenceFlows.filter(({ targetId }) => targetId === node.id);
  if (!declaration || declaration.triggerElementId !== node.id || !boundary || boundary.kind !== CheckedNodeKind.CancelBoundaryEvent || incoming.length !== 1) {
    throw new TypeError("Cancel End must resolve its exact Transaction and direct-parent Cancel Boundary");
  }
  return { id: operationId(node.id), kind: SemanticOperationKind.CancelTransaction,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: node.id },
    definitionScopeId: declaration.definitionScopeId, input: controlPlaceId(incoming[0]!.id),
    output: controlPlaceId(boundary.outputFlowId), boundaryEventElementId: boundary.id };
}

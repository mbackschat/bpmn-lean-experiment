/**
 * Exact checked-source bindings for the neutral external-effect operation.
 */
import { isDeepStrictEqual } from "node:util";

import type {
  BpmnErrorRoute,
  CheckedNode,
  CheckedNodeKind,
  CheckedProcess,
  SemanticOperation,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessProgram,
} from "../packages/semantic-core/src/index.ts";

type AwaitEffectOperation = Extract<
  SemanticOperation,
  Readonly<{ kind: SemanticOperationKind.AwaitEffect }>
>;

type EffectSourceNode = Extract<
  CheckedNode,
  Readonly<{
    kind: CheckedNodeKind.ServiceTask | CheckedNodeKind.ConfiguredTask;
  }>
>;

export function verifyEffectOperationBindings(
  checkedProcess: CheckedProcess,
  semanticProcess: SemanticProcessProgram,
): void {
  const operations = semanticProcess.operations.filter(
    (operation): operation is AwaitEffectOperation =>
      operation.kind === "awaitEffect",
  );
  const sourceNodes = checkedProcess.nodes.filter(
    (node): node is EffectSourceNode =>
      node.kind === "serviceTask" || node.kind === "configuredTask",
  );
  if (operations.length !== sourceNodes.length) {
    throw new Error(
      "neutral effect operation cardinality differs from checked BPMN source",
    );
  }

  for (const operation of operations) {
    verifyEffectOperationBinding(checkedProcess, semanticProcess, operation);
  }
}

function verifyEffectOperationBinding(
  checkedProcess: CheckedProcess,
  semanticProcess: SemanticProcessProgram,
  operation: AwaitEffectOperation,
): void {
  if (operation.effect.elementId !== operation.origin.elementId) {
    throw new Error(
      `operation ${operation.id} effect identity differs from its BPMN origin`,
    );
  }
  const checkedNode = checkedProcess.nodes.find(
    ({ id }) => id === operation.origin.elementId,
  );
  if (
    checkedNode?.kind !== "serviceTask" &&
    checkedNode?.kind !== "configuredTask"
  ) {
    throw new Error(
      `operation ${operation.id} has no exact checked BPMN effect origin`,
    );
  }

  if (!isDeepStrictEqual(
    checkedNode.descriptor,
    operation.effect.descriptor,
  )) {
    throw new Error(
      `operation ${operation.id} effect descriptor differs from its checked BPMN origin`,
    );
  }

  if (!isDeepStrictEqual(
    operation.effect.inputMappings,
    checkedNode.kind === "serviceTask" ? checkedNode.inputMappings : [],
  )) {
    throw new Error(
      `operation ${operation.id} input mappings differ from its checked BPMN origin`,
    );
  }
  if (!isDeepStrictEqual(
    operation.effect.outputMappings,
    checkedNode.kind === "serviceTask" ? checkedNode.outputMappings : [],
  )) {
    throw new Error(
      `operation ${operation.id} output mappings differ from its checked BPMN origin`,
    );
  }

  const expectedRoute = checkedNode.kind === "serviceTask"
    ? expectedServiceTaskRoute(checkedNode, semanticProcess)
    : null;
  if (!isDeepStrictEqual(operation.bpmnErrorRoute, expectedRoute)) {
    throw new Error(
      `operation ${operation.id} BPMN Error route differs from its checked BPMN origin`,
    );
  }
}

function expectedServiceTaskRoute(
  checkedNode: Extract<CheckedNode, Readonly<{ kind: "serviceTask" }>>,
  semanticProcess: SemanticProcessProgram,
): BpmnErrorRoute | null | undefined {
  const checkedRoute = checkedNode.bpmnErrorRoute;
  if (checkedRoute === null) {
    return null;
  }
  const routeOutput = semanticProcess.controlPlaces.find(
    ({ id, origin }) =>
      id === `place:${checkedRoute.outputFlowId}` &&
      origin.elementId === checkedRoute.outputFlowId,
  );
  if (routeOutput === undefined) {
    return undefined;
  }
  return {
    code: checkedRoute.code,
    output: routeOutput.id,
    origin: {
      kind: "bpmnElement" as SemanticOriginKind.BpmnElement,
      boundaryEventId: checkedRoute.boundaryEventId,
      errorDefinitionId: checkedRoute.errorDefinitionId,
      errorElementId: checkedRoute.errorElementId,
      sequenceFlowId: checkedRoute.outputFlowId,
    },
  };
}

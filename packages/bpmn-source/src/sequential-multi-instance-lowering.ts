import {
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticOriginKind,
  sequentialMultiInstanceLimits,
} from "@bpmn-lean/semantic-core";
import type {
  AwaitSequentialMultiInstanceUserTaskOperation,
  CheckedNode,
  CheckedProcess,
} from "@bpmn-lean/semantic-core";

import {
  controlPlaceId,
  operationId,
} from "./semantic-process-identifiers.js";

export function lowerSequentialMultiInstanceUserTask(
  node: Extract<
    CheckedNode,
    { kind: CheckedNodeKind.SequentialMultiInstanceUserTask }
  >,
  source: CheckedProcess,
): AwaitSequentialMultiInstanceUserTaskOperation {
  const incoming = source.sequenceFlows.filter(
    ({ targetId }) => targetId === node.id,
  );
  const normal = source.sequenceFlows.filter(
    ({ id, sourceId }) =>
      id === node.normalOutputFlowId && sourceId === node.id,
  );
  const boundary = source.sequenceFlows.filter(
    ({ id, sourceId }) =>
      id === node.boundaryTimer.outputFlowId &&
      sourceId === node.boundaryTimer.elementId,
  );
  if (incoming.length !== 1 || normal.length !== 1 || boundary.length !== 1) {
    throw new TypeError(
      `Checked Sequential Multi-Instance node ${node.id} requires one input, normal output, and boundary output`,
    );
  }
  return {
    id: operationId(node.id),
    kind: SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: node.id,
    },
    input: controlPlaceId(requireFlowId(incoming[0])),
    task: { elementId: node.id, name: node.name },
    data: { input: node.input, output: node.output },
    normalOutput: controlPlaceId(requireFlowId(normal[0])),
    boundaryTimer: {
      elementId: node.boundaryTimer.elementId,
      durationMs: 1_000,
      output: controlPlaceId(requireFlowId(boundary[0])),
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: node.boundaryTimer.outputFlowId,
      },
    },
    limits: sequentialMultiInstanceLimits,
  };
}

function requireFlowId(value: Readonly<{ id: string }> | undefined): string {
  if (value === undefined) {
    throw new TypeError("Sequential Multi-Instance lowering requires one resolved flow");
  }
  return value.id;
}

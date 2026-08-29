import {
  CheckedNodeKind,
  ParallelMultiInstanceCompletionPolicy,
  SemanticOperationKind,
  SemanticOriginKind,
  SimpleBooleanExpressionLanguage,
  parallelMultiInstanceCompletionPolicyBinding,
  parallelMultiInstanceLimits,
} from "@bpmn-lean/semantic-core";
import type {
  AwaitParallelMultiInstanceUserTaskOperation,
  CheckedNode,
  CheckedProcess,
  CompleteParallelMultiInstanceUserTaskOperation,
} from "@bpmn-lean/semantic-core";

import {
  controlPlaceId,
  operationId,
  parallelCompletionOperationId,
} from "./semantic-process-identifiers.js";
import { normalizeTimerDurationMs } from "./timer-duration-normalization.js";

export function lowerParallelMultiInstanceUserTaskOperations(
  node: Extract<
    CheckedNode,
    { kind: CheckedNodeKind.ParallelMultiInstanceUserTask }
  >,
  source: CheckedProcess,
): readonly [
  AwaitParallelMultiInstanceUserTaskOperation,
  CompleteParallelMultiInstanceUserTaskOperation,
] {
  if (
    node.completionCondition.language !== SimpleBooleanExpressionLanguage ||
    node.completionCondition.body !==
      'stringEquals(completionPolicy,"first")'
  ) {
    throw new TypeError(
      `Checked Parallel Multi-Instance node ${node.id} requires the exact reviewed completion condition`,
    );
  }
  const entry = {
    ...lowerParallelMultiInstanceBase(node, source),
    kind: SemanticOperationKind.AwaitParallelMultiInstanceUserTask,
    completionCondition: {
      kind: "stringEquals",
      variable: parallelMultiInstanceCompletionPolicyBinding,
      value: ParallelMultiInstanceCompletionPolicy.First,
    },
    limits: parallelMultiInstanceLimits,
  } as const;
  return [
    entry,
    {
      id: parallelCompletionOperationId(node.id),
      kind: SemanticOperationKind.CompleteParallelMultiInstanceUserTask,
      origin: entry.origin,
      entryOperationId: entry.id,
      taskElementId: node.id,
      normalOutput: entry.normalOutput,
    },
  ];
}

function lowerParallelMultiInstanceBase(
  node: Extract<
    CheckedNode,
    { kind: CheckedNodeKind.ParallelMultiInstanceUserTask }
  >,
  source: CheckedProcess,
) {
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
      `Checked Parallel Multi-Instance node ${node.id} requires one input, normal output, and boundary output`,
    );
  }
  return {
    id: operationId(node.id),
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
      durationMs: normalizeTimerDurationMs(node.boundaryTimer.durationLiteral),
      output: controlPlaceId(requireFlowId(boundary[0])),
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: node.boundaryTimer.outputFlowId,
      },
    },
  } as const;
}

function requireFlowId(value: Readonly<{ id: string }> | undefined): string {
  if (value === undefined) {
    throw new TypeError("Parallel Multi-Instance lowering requires one resolved flow");
  }
  return value.id;
}

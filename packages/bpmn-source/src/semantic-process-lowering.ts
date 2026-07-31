import {
  CheckedNodeKind,
  GatewayDirection,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import {
  parseSimpleBooleanExpression,
} from "./simple-boolean-expression.js";
import type {
  CheckedNode,
  CheckedProcess,
  CheckedSequenceFlow,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

export function lowerCheckedProcess(
  source: CheckedProcess,
): SemanticProcessProgram {
  // tag::semantic-process-lowering[]
  const operations = source.nodes.map((node) =>
    lowerNode(node, source.sequenceFlows)
  );
  const program: SemanticProcessProgram = {
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      ...source.identity,
    },
    processId: source.processId,
    controlPlaces: source.sequenceFlows.map((flow) => ({
      id: placeId(flow.id),
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: flow.id,
      },
    })),
    operations: operations.sort(compareIds),
  };
  // end::semantic-process-lowering[]
  return program;
}

function lowerNode(
  node: CheckedNode,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): SemanticOperation {
  const incoming = flows
    .filter(({ targetId }) => targetId === node.id)
    .map(({ id }) => placeId(id))
    .sort(compareCanonicalStrings);
  const outgoing = flows
    .filter(({ sourceId }) => sourceId === node.id)
    .map(({ id }) => placeId(id))
    .sort(compareCanonicalStrings);
  const base = {
    id: operationId(node.id),
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: node.id,
    },
  } as const;

  switch (node.kind) {
    case CheckedNodeKind.NoneStartEvent:
      return {
        ...base,
        kind: SemanticOperationKind.Initiate,
        output: requireOnly(outgoing, node.id, "outgoing"),
      };
    case CheckedNodeKind.UserTask:
      return {
        ...base,
        kind: SemanticOperationKind.AwaitUserTask,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        task: {
          elementId: node.id,
          name: node.name,
        },
      };
    case CheckedNodeKind.IntermediateCatchTimerEvent:
      return {
        ...base,
        kind: SemanticOperationKind.AwaitTimer,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        timer: {
          elementId: node.id,
          durationMs: normalizeTimerDuration(node.durationLiteral),
        },
      };
    case CheckedNodeKind.IntermediateCatchMessageEvent:
      return {
        ...base,
        kind: SemanticOperationKind.AwaitMessage,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        message: {
          elementId: node.id,
          channel: node.channel,
        },
      };
    case CheckedNodeKind.ServiceTask:
      return {
        ...base,
        kind: SemanticOperationKind.AwaitEffect,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        effect: {
          elementId: node.id,
          descriptor: node.descriptor,
          inputMappings: node.inputMappings,
          outputMappings: node.outputMappings,
        },
        bpmnErrorRoute: node.bpmnErrorRoute === null
          ? null
          : {
              code: node.bpmnErrorRoute.code,
              output: placeId(node.bpmnErrorRoute.outputFlowId),
              origin: {
                kind: SemanticOriginKind.BpmnElement,
                boundaryEventId: node.bpmnErrorRoute.boundaryEventId,
                errorDefinitionId:
                  node.bpmnErrorRoute.errorDefinitionId,
                errorElementId: node.bpmnErrorRoute.errorElementId,
                sequenceFlowId: node.bpmnErrorRoute.outputFlowId,
              },
            },
      };
    case CheckedNodeKind.ParallelGateway:
      switch (node.direction) {
        case GatewayDirection.Diverging:
          return {
            ...base,
            kind: SemanticOperationKind.Duplicate,
            input: requireOnly(incoming, node.id, "incoming"),
            outputs: requireMany(outgoing, node.id, "outgoing"),
          };
        case GatewayDirection.Converging:
          return {
            ...base,
            kind: SemanticOperationKind.Synchronize,
            inputs: requireMany(incoming, node.id, "incoming"),
            output: requireOnly(outgoing, node.id, "outgoing"),
          };
      }
    case CheckedNodeKind.ExclusiveGateway:
      return {
        ...base,
        kind: SemanticOperationKind.Choose,
        input: requireOnly(incoming, node.id, "incoming"),
        candidates: node.candidateFlowIds.map((flowId) =>
          lowerConditionalCandidate(flows, flowId)
        ) as [
          ReturnType<typeof lowerConditionalCandidate>,
          ReturnType<typeof lowerConditionalCandidate>,
        ],
        defaultOutput: placeId(node.defaultFlowId),
        defaultOrigin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: node.defaultFlowId,
        },
      };
    case CheckedNodeKind.NoneEndEvent:
      return {
        ...base,
        kind: SemanticOperationKind.Terminate,
        input: requireOnly(incoming, node.id, "incoming"),
      };
  }
}

function lowerConditionalCandidate(
  flows: ReadonlyArray<CheckedSequenceFlow>,
  flowId: string,
) {
  const flow = flows.find(({ id }) => id === flowId);
  if (flow === undefined || flow.condition === null) {
    throw new TypeError(
      `Checked conditional Sequence Flow ${flowId} is missing its condition`,
    );
  }
  const condition = parseSimpleBooleanExpression(flow.condition.body);
  if (condition === undefined) {
    throw new TypeError(
      `Checked conditional Sequence Flow ${flowId} has an invalid expression`,
    );
  }
  return {
    condition,
    output: placeId(flow.id),
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId: flow.id,
    },
  } as const;
}

function normalizeTimerDuration(durationLiteral: "PT1S"): 1000 {
  switch (durationLiteral) {
    case "PT1S":
      return 1000;
  }
}

function requireOnly(
  values: ReadonlyArray<string>,
  nodeId: string,
  direction: string,
): string {
  const value = values[0];
  if (values.length !== 1 || value === undefined) {
    throw new TypeError(
      `Checked node ${nodeId} requires exactly one ${direction} flow`,
    );
  }
  return value;
}

function requireMany(
  values: ReadonlyArray<string>,
  nodeId: string,
  direction: string,
): ReadonlyArray<string> {
  if (values.length < 2) {
    throw new TypeError(
      `Checked node ${nodeId} requires at least two ${direction} flows`,
    );
  }
  return values;
}

function placeId(flowId: string): string {
  return `place:${flowId}`;
}

function operationId(elementId: string): string {
  return `operation:${elementId}`;
}

function compareIds(
  left: Readonly<{ id: string }>,
  right: Readonly<{ id: string }>,
): number {
  return compareCanonicalStrings(left.id, right.id);
}

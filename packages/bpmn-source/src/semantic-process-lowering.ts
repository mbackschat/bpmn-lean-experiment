import {
  CheckedNodeKind,
  GatewayDirection,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
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
    case CheckedNodeKind.NoneEndEvent:
      return {
        ...base,
        kind: SemanticOperationKind.Terminate,
        input: requireOnly(incoming, node.id, "incoming"),
      };
  }
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

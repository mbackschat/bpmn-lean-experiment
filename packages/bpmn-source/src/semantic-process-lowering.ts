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
  DefinitionScope,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  parseSimpleBooleanExpression,
} from "./simple-boolean-expression.js";

type ScopedOperation = Readonly<{
  operation: SemanticOperation;
  scopeId: string;
}>;

export function lowerCheckedProcess(
  source: CheckedProcess,
): SemanticProcessProgram {
  // tag::semantic-process-lowering[]
  const nodeOperations = source.nodes.flatMap((node) =>
    lowerNode(node, source)
  );
  const completionOperations = source.definitionScopes.map((scope) =>
    lowerScopeCompletion(scope, source)
  );
  const scopedOperations = [...nodeOperations, ...completionOperations];
  const program: SemanticProcessProgram = {
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      ...source.identity,
    },
    processId: source.processId,
    definitionScopes: source.definitionScopes,
    operationScopes: scopedOperations
      .map(({ operation, scopeId }) => ({ operationId: operation.id, scopeId }))
      .sort((left, right) =>
        compareCanonicalStrings(left.operationId, right.operationId)
      ),
    controlPlaceScopes: source.sequenceFlowScopes
      .map(({ sequenceFlowId, scopeId }) => ({
        controlPlaceId: placeId(sequenceFlowId),
        scopeId,
      }))
      .sort((left, right) =>
        compareCanonicalStrings(left.controlPlaceId, right.controlPlaceId)
      ),
    controlPlaces: source.sequenceFlows.map((flow) => ({
      id: placeId(flow.id),
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: flow.id,
      },
    })),
    operations: scopedOperations
      .map(({ operation }) => operation)
      .sort(compareIds),
  };
  // end::semantic-process-lowering[]
  return program;
}

function lowerNode(
  node: CheckedNode,
  source: CheckedProcess,
): ReadonlyArray<ScopedOperation> {
  const scopeId = requireNodeScope(source, node.id);
  const incoming = flowPlaces(source.sequenceFlows, node.id, "incoming");
  const outgoing = flowPlaces(source.sequenceFlows, node.id, "outgoing");
  const base = {
    id: operationId(node.id),
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: node.id,
    },
  } as const;
  const scoped = (operation: SemanticOperation): ReadonlyArray<ScopedOperation> =>
    [{ operation, scopeId }];

  switch (node.kind) {
    case CheckedNodeKind.NoneStartEvent:
      return isRootScope(source, scopeId)
        ? scoped({
            ...base,
            kind: SemanticOperationKind.Initiate,
            output: requireOnly(outgoing, node.id, "outgoing"),
          })
        : [];
    case CheckedNodeKind.EmbeddedSubProcess:
      return scoped({
        ...base,
        kind: SemanticOperationKind.EnterScope,
        input: requireOnly(incoming, node.id, "incoming"),
        childEntry: childEntryPlace(source, node.childScopeId),
        childScopeId: node.childScopeId,
      });
    case CheckedNodeKind.BoundaryErrorEvent:
      return [];
    case CheckedNodeKind.UserTask:
      return scoped({
        ...base,
        kind: SemanticOperationKind.AwaitUserTask,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        task: { elementId: node.id, name: node.name },
      });
    case CheckedNodeKind.IntermediateCatchTimerEvent:
      return scoped({
        ...base,
        kind: SemanticOperationKind.AwaitTimer,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        timer: {
          elementId: node.id,
          durationMs: normalizeTimerDuration(node.durationLiteral),
        },
      });
    case CheckedNodeKind.IntermediateCatchMessageEvent:
    case CheckedNodeKind.ReceiveTask:
      return scoped({
        ...base,
        kind: SemanticOperationKind.AwaitMessage,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        message: { elementId: node.id, channel: node.channel },
      });
    case CheckedNodeKind.ServiceTask:
      return scoped({
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
                errorDefinitionId: node.bpmnErrorRoute.errorDefinitionId,
                errorElementId: node.bpmnErrorRoute.errorElementId,
                sequenceFlowId: node.bpmnErrorRoute.outputFlowId,
              },
            },
      });
    case CheckedNodeKind.ParallelGateway:
      switch (node.direction) {
        case GatewayDirection.Diverging:
          return scoped({
            ...base,
            kind: SemanticOperationKind.Duplicate,
            input: requireOnly(incoming, node.id, "incoming"),
            outputs: requireMany(outgoing, node.id, "outgoing"),
          });
        case GatewayDirection.Converging:
          return scoped({
            ...base,
            kind: SemanticOperationKind.Synchronize,
            inputs: requireMany(incoming, node.id, "incoming"),
            output: requireOnly(outgoing, node.id, "outgoing"),
          });
      }
    case CheckedNodeKind.ExclusiveGateway:
      return scoped({
        ...base,
        kind: SemanticOperationKind.Choose,
        input: requireOnly(incoming, node.id, "incoming"),
        candidates: node.candidateFlowIds.map((flowId) =>
          lowerConditionalCandidate(source.sequenceFlows, flowId)
        ) as [
          ReturnType<typeof lowerConditionalCandidate>,
          ReturnType<typeof lowerConditionalCandidate>,
        ],
        defaultOutput: placeId(node.defaultFlowId),
        defaultOrigin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: node.defaultFlowId,
        },
      });
    case CheckedNodeKind.ErrorEndEvent: {
      const handler = requireDirectErrorHandler(source, node);
      return scoped({
        ...base,
        kind: SemanticOperationKind.ThrowError,
        input: requireOnly(incoming, node.id, "incoming"),
        error: node.error,
        handler: {
          attachedScopeId: handler.attachedScopeId,
          code: handler.boundary.error.code,
          output: placeId(handler.boundary.outputFlowId),
          origin: {
            kind: SemanticOriginKind.BpmnElement,
            boundaryEventId: handler.boundary.id,
            errorDefinitionId: handler.boundary.error.errorDefinitionId,
            errorElementId: handler.boundary.error.errorElementId,
            sequenceFlowId: handler.boundary.outputFlowId,
          },
        },
      });
    }
    case CheckedNodeKind.NoneEndEvent:
      return scoped({
        ...base,
        kind: SemanticOperationKind.ReachNoneEnd,
        input: requireOnly(incoming, node.id, "incoming"),
      });
  }
}

function requireDirectErrorHandler(
  source: CheckedProcess,
  errorEnd: Extract<
    CheckedNode,
    { kind: CheckedNodeKind.ErrorEndEvent }
  >,
): Readonly<{
  boundary: Extract<
    CheckedNode,
    { kind: CheckedNodeKind.BoundaryErrorEvent }
  >;
  attachedScopeId: string;
}> {
  const errorScopeId = requireNodeScope(source, errorEnd.id);
  const handlers = source.nodes.flatMap((node) => {
    if (node.kind !== CheckedNodeKind.BoundaryErrorEvent) {
      return [];
    }
    const attached = source.nodes.find(
      (candidate): candidate is Extract<
        CheckedNode,
        { kind: CheckedNodeKind.EmbeddedSubProcess }
      > =>
        candidate.id === node.attachedToRef &&
        candidate.kind === CheckedNodeKind.EmbeddedSubProcess,
    );
    return attached !== undefined &&
        attached.childScopeId === errorScopeId &&
        node.error.errorElementId === errorEnd.error.errorElementId &&
        node.error.code === errorEnd.error.code
      ? [{ boundary: node, attachedScopeId: attached.childScopeId }]
      : [];
  });
  const handler = handlers[0];
  if (handlers.length !== 1 || handler === undefined) {
    throw new TypeError(
      `Checked Error End ${errorEnd.id} requires one direct matching boundary handler`,
    );
  }
  return handler;
}

function lowerScopeCompletion(
  scope: DefinitionScope,
  source: CheckedProcess,
): ScopedOperation {
  return {
    scopeId: scope.id,
    operation: {
      id: `operation:complete-scope:${scope.id}`,
      kind: SemanticOperationKind.CompleteScope,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: scope.originElementId,
      },
      scopeId: scope.id,
      parentOutput: scope.parentScopeId === null
        ? null
        : requireOnly(
            flowPlaces(
              source.sequenceFlows,
              scope.originElementId,
              "outgoing",
            ),
            scope.originElementId,
            "outgoing",
          ),
    },
  };
}

function childEntryPlace(source: CheckedProcess, childScopeId: string): string {
  const starts = source.nodes.filter(
    (node) =>
      node.kind === CheckedNodeKind.NoneStartEvent &&
      requireNodeScope(source, node.id) === childScopeId,
  );
  const start = starts[0];
  if (starts.length !== 1 || start === undefined) {
    throw new TypeError(`Checked scope ${childScopeId} requires one None Start Event`);
  }
  return requireOnly(
    flowPlaces(source.sequenceFlows, start.id, "outgoing"),
    start.id,
    "outgoing",
  );
}

function requireNodeScope(source: CheckedProcess, nodeId: string): string {
  const owners = source.nodeScopes.filter((entry) => entry.nodeId === nodeId);
  const owner = owners[0];
  if (owners.length !== 1 || owner === undefined) {
    throw new TypeError(`Checked node ${nodeId} requires one definition scope`);
  }
  return owner.scopeId;
}

function isRootScope(source: CheckedProcess, scopeId: string): boolean {
  return source.definitionScopes.some(
    (scope) => scope.id === scopeId && scope.parentScopeId === null,
  );
}

function flowPlaces(
  flows: ReadonlyArray<CheckedSequenceFlow>,
  nodeId: string,
  direction: "incoming" | "outgoing",
): ReadonlyArray<string> {
  return flows
    .filter((flow) =>
      direction === "incoming"
        ? flow.targetId === nodeId
        : flow.sourceId === nodeId
    )
    .map(({ id }) => placeId(id))
    .sort(compareCanonicalStrings);
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

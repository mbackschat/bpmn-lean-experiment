import {
  BoundaryInterruption,
  CheckedNodeKind,
  GatewayDirection,
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  BoundaryTimerArm,
  CheckedNode,
  CheckedProcess,
  CheckedSequenceFlow,
  DefinitionScope,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  eventRaceConfigurationFlowIds,
  isEventRaceCatch,
  lowerEventRaceOperation,
} from "./event-based-gateway-lowering.js";
import {
  lowerCallActivityInvoke,
  lowerCalledProcessReturn,
} from "./call-activity-lowering.js";
import { lowerMessageStartEvent } from "./message-start-event-lowering.js";
import { lowerTimerStartEvent } from "./timer-start-event-lowering.js";
import {
  lowerConditionalCandidate,
  lowerInclusiveCandidate,
  lowerInclusiveDefaultBranch,
} from "./conditional-branch-lowering.js";
import {
  controlPlaceId,
  operationId,
} from "./semantic-process-identifiers.js";
import { lowerTerminateEndEvent } from "./terminate-end-event-lowering.js";
import { lowerConfiguredTask } from "./configured-task-lowering.js";
import { normalizeTimerDurationMs } from "./timer-duration-normalization.js";
import {
  lowerSequentialMultiInstanceUserTask,
} from "./sequential-multi-instance-lowering.js";
import {
  lowerParallelMultiInstanceUserTaskOperations,
} from "./parallel-multi-instance-lowering.js";

type ScopedOperation = Readonly<{
  operation: SemanticOperation;
  scopeId: string;
}>;

export function lowerCheckedProcess(
  source: CheckedProcess,
): SemanticProcessProgram {
  const nodeOperations = source.nodes.flatMap((node) =>
    lowerNode(node, source)
  );
  const completionOperations = source.definitionScopes.map((scope) =>
    lowerCalledProcessReturn(scope, source) ?? lowerScopeCompletion(scope, source)
  );
  const scopedOperations = [...nodeOperations, ...completionOperations];
  const configurationFlows = eventRaceConfigurationFlowIds(source);
  const program: SemanticProcessProgram = {
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      ...source.identity,
    },
    internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
    processId: source.processId,
    definitionScopes: source.definitionScopes,
    operationScopes: scopedOperations
      .map(({ operation, scopeId }) => ({ operationId: operation.id, scopeId }))
      .sort((left, right) =>
        compareCanonicalStrings(left.operationId, right.operationId)
      ),
    controlPlaceScopes: source.sequenceFlowScopes
      .filter(({ sequenceFlowId }) => !configurationFlows.has(sequenceFlowId))
      .map(({ sequenceFlowId, scopeId }) => ({
        controlPlaceId: controlPlaceId(sequenceFlowId),
        scopeId,
      }))
      .sort((left, right) =>
        compareCanonicalStrings(left.controlPlaceId, right.controlPlaceId)
      ),
    controlPlaces: source.sequenceFlows
      .filter(({ id }) => !configurationFlows.has(id))
      .map((flow) => ({
      id: controlPlaceId(flow.id),
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: flow.id,
      },
    })),
    operations: scopedOperations
      .map(({ operation }) => operation)
      .sort(compareIds),
  };
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
    case CheckedNodeKind.TimerStartEvent:
      return isEntryRootScope(source, scopeId)
        ? scoped(lowerTimerStartEvent(node, source.sequenceFlows))
        : [];
    case CheckedNodeKind.MessageStartEvent:
      return isEntryRootScope(source, scopeId)
        ? scoped(lowerMessageStartEvent(node, source.sequenceFlows))
        : [];
    case CheckedNodeKind.NoneStartEvent:
      return isEntryRootScope(source, scopeId)
        ? scoped({
            ...base,
            kind: SemanticOperationKind.Initiate,
            output: requireOnly(outgoing, node.id, "outgoing"),
          })
        : [];
    case CheckedNodeKind.CallActivity:
      return [lowerCallActivityInvoke(node, source)];
    case CheckedNodeKind.EmbeddedSubProcess: {
      const entry = {
        input: requireOnly(incoming, node.id, "incoming"),
        childEntry: childEntryPlace(source, node.childScopeId),
        childScopeId: node.childScopeId,
      } as const;
      const boundaryTimer = timerBoundaryFor(source, node.id);
      return scoped(
        boundaryTimer === undefined
          ? { ...base, kind: SemanticOperationKind.EnterScope, ...entry }
          : {
              ...base,
              kind: SemanticOperationKind.EnterBoundedScope,
              ...entry,
              boundaryTimer: lowerBoundaryTimerArm(source, boundaryTimer),
            },
      );
    }
    case CheckedNodeKind.BoundaryErrorEvent:
      return [];
    // An attached handler has no operation of its own: its Activity owns both competing waits, so
    // nothing in the program can express them as unrelated siblings.
    case CheckedNodeKind.TimerBoundaryEvent:
    case CheckedNodeKind.MessageBoundaryEvent:
      return [];
    case CheckedNodeKind.UserTask: {
      const boundaryTimer = timerBoundaryFor(source, node.id);
      if (boundaryTimer !== undefined) {
        if (node.metadata !== undefined) {
          return [];
        }
        return scoped({
          ...base,
          // The disposition selects the operation kind, and the kind is the whole difference: one
          // family's firing removes the task occurrence and the other's preserves it.
          kind: boundaryTimer.interruption === BoundaryInterruption.Interrupting
            ? SemanticOperationKind.AwaitBoundedUserTask
            : SemanticOperationKind.AwaitMonitoredUserTask,
          input: requireOnly(incoming, node.id, "incoming"),
          task: {
            elementId: node.id,
            name: node.name,
            output: requireOnly(outgoing, node.id, "outgoing"),
          },
          boundaryTimer: lowerBoundaryTimerArm(source, boundaryTimer),
        });
      }
      const boundaryMessage = messageBoundaryFor(source, node.id);
      if (boundaryMessage !== undefined) {
        if (node.metadata !== undefined) {
          return [];
        }
        return scoped({
          ...base,
          kind: SemanticOperationKind.AwaitMessageBoundedUserTask,
          input: requireOnly(incoming, node.id, "incoming"),
          task: {
            elementId: node.id,
            name: node.name,
            output: requireOnly(outgoing, node.id, "outgoing"),
          },
          boundaryMessage: {
            elementId: boundaryMessage.id,
            channel: boundaryMessage.channel,
            output: requireOnly(
              flowPlaces(source.sequenceFlows, boundaryMessage.id, "outgoing"),
              boundaryMessage.id,
              "outgoing",
            ),
            origin: {
              kind: SemanticOriginKind.BpmnSequenceFlow,
              elementId: boundaryMessage.outputFlowId,
            },
          },
        });
      }
      return scoped({
        ...base,
        kind: SemanticOperationKind.AwaitUserTask,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        task: {
          elementId: node.id,
          name: node.name,
          ...(node.metadata === undefined ? {} : { metadata: node.metadata }),
        },
      });
    }
    case CheckedNodeKind.DataInputUserTask:
      return scoped({
        ...base,
        kind: SemanticOperationKind.AwaitDataInputUserTask,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        task: { elementId: node.id, name: node.name },
        directInput: node.directInput,
      });
    case CheckedNodeKind.DataOutputUserTask:
      return scoped({
        ...base,
        kind: SemanticOperationKind.AwaitDataOutputUserTask,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        task: { elementId: node.id, name: node.name },
        directOutput: node.directOutput,
      });
    case CheckedNodeKind.SequentialMultiInstanceUserTask:
      return scoped(lowerSequentialMultiInstanceUserTask(node, source));
    case CheckedNodeKind.ParallelMultiInstanceUserTask:
      return lowerParallelMultiInstanceUserTaskOperations(node, source).map(
        (operation) => ({ operation, scopeId }),
      );
    case CheckedNodeKind.IntermediateCatchTimerEvent:
      if (isEventRaceCatch(source, node.id)) {
        return [];
      }
      return scoped({
        ...base,
        kind: SemanticOperationKind.AwaitTimer,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        timer: {
          elementId: node.id,
          durationMs: normalizeTimerDurationMs(node.durationLiteral),
        },
      });
    case CheckedNodeKind.IntermediateCatchMessageEvent:
      if (isEventRaceCatch(source, node.id)) {
        return [];
      }
      return scoped({
        ...base,
        kind: SemanticOperationKind.AwaitMessage,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        message: { elementId: node.id, channel: node.channel },
      });
    case CheckedNodeKind.PayloadMessageCatchEvent:
      return scoped({
        ...base,
        kind: SemanticOperationKind.AwaitPayloadMessage,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        message: { elementId: node.id, channel: node.channel },
        directOutput: node.directOutput,
      });
    case CheckedNodeKind.CorrelatedPayloadMessageCatchEvent:
      return scoped({
        ...base,
        kind: SemanticOperationKind.AwaitCorrelatedPayloadMessage,
        input: requireOnly(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
        message: { elementId: node.id, channel: node.channel },
        correlationKeyId: node.correlationKeyId,
        correlationPropertyId: node.correlationPropertyId,
        payloadSelector: node.payloadSelector,
        processPropertySelector: node.processPropertySelector,
      });
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
              output: controlPlaceId(node.bpmnErrorRoute.outputFlowId),
              origin: {
                kind: SemanticOriginKind.BpmnElement,
                boundaryEventId: node.bpmnErrorRoute.boundaryEventId,
                errorDefinitionId: node.bpmnErrorRoute.errorDefinitionId,
                errorElementId: node.bpmnErrorRoute.errorElementId,
                sequenceFlowId: node.bpmnErrorRoute.outputFlowId,
              },
            },
      });
    case CheckedNodeKind.ConfiguredTask:
      return [lowerConfiguredTask(node, source)];
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
        defaultOutput: controlPlaceId(node.defaultFlowId),
        defaultOrigin: {
          kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: node.defaultFlowId,
        },
      });
    case CheckedNodeKind.ExclusiveMerge:
      return scoped({
        ...base,
        kind: SemanticOperationKind.MergeExclusive,
        inputs: requireExactThree(incoming, node.id, "incoming"),
        output: requireOnly(outgoing, node.id, "outgoing"),
      });
    case CheckedNodeKind.InclusiveGateway:
      switch (node.direction) {
        case GatewayDirection.Diverging: {
          const [firstCandidateFlowId, secondCandidateFlowId] =
            node.candidateFlowIds;
          return scoped({
            ...base,
            kind: SemanticOperationKind.SelectMany,
            input: requireOnly(incoming, node.id, "incoming"),
            candidates: [
              lowerInclusiveCandidate(source, node.id, firstCandidateFlowId),
              lowerInclusiveCandidate(source, node.id, secondCandidateFlowId),
            ],
            defaultBranch: lowerInclusiveDefaultBranch(
              source,
              node.id,
              node.defaultFlowId,
            ),
            selectionKey: node.id,
          });
        }
        case GatewayDirection.Converging:
          return scoped({
            ...base,
            kind: SemanticOperationKind.SynchronizeSelected,
            inputs: requireExactThree(incoming, node.id, "incoming"),
            output: requireOnly(outgoing, node.id, "outgoing"),
            selectionKey: node.pairedGatewayId,
          });
      }
    case CheckedNodeKind.EventBasedGateway:
      return scoped(lowerEventRaceOperation(node, source));
    case CheckedNodeKind.TerminateEndEvent:
      return [lowerTerminateEndEvent(node, source)];
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
          output: controlPlaceId(handler.boundary.outputFlowId),
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

function isEntryRootScope(source: CheckedProcess, scopeId: string): boolean {
  return source.definitionScopes.some(
    (scope) =>
      scope.id === scopeId &&
      scope.parentScopeId === null &&
      scope.originElementId === source.processId,
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
    .map(({ id }) => controlPlaceId(id))
    .sort(compareCanonicalStrings);
}

/**
 * The deadline arm every host Activity folds into its own operation.
 *
 * One owner across host kinds: the arm's shape is a wire contract, so a per-host copy would let the
 * two hosts drift on `durationMs` normalization or on which namespace `origin` carries. The three
 * hosts it serves share one admitted deadline, and the return type names it rather than the union,
 * so a later host admitting a different lexeme fails here instead of at that host's operation.
 */
function lowerBoundaryTimerArm(
  source: CheckedProcess,
  boundaryTimer: Extract<CheckedNode, { kind: CheckedNodeKind.TimerBoundaryEvent }>,
): BoundaryTimerArm<1000> {
  return {
    elementId: boundaryTimer.id,
    durationMs: normalizeTimerDurationMs(boundaryTimer.durationLiteral),
    output: requireOnly(
      flowPlaces(source.sequenceFlows, boundaryTimer.id, "outgoing"),
      boundaryTimer.id,
      "outgoing",
    ),
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId: boundaryTimer.outputFlowId,
    },
  };
}

/** The Timer Boundary Event attached to this Activity, when the profile admitted one. */
function timerBoundaryFor(
  source: CheckedProcess,
  activityId: string,
): Extract<CheckedNode, { kind: CheckedNodeKind.TimerBoundaryEvent }> | undefined {
  return source.nodes.find(
    (candidate): candidate is Extract<
      CheckedNode,
      { kind: CheckedNodeKind.TimerBoundaryEvent }
    > =>
      candidate.kind === CheckedNodeKind.TimerBoundaryEvent &&
      candidate.attachedToRef === activityId,
  );
}

/** The Message Boundary Event attached to this User Task, when the profile admitted one. */
function messageBoundaryFor(
  source: CheckedProcess,
  activityId: string,
): Extract<CheckedNode, { kind: CheckedNodeKind.MessageBoundaryEvent }> | undefined {
  return source.nodes.find(
    (candidate): candidate is Extract<
      CheckedNode,
      { kind: CheckedNodeKind.MessageBoundaryEvent }
    > =>
      candidate.kind === CheckedNodeKind.MessageBoundaryEvent &&
      candidate.attachedToRef === activityId,
  );
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

function requireExactThree(
  values: ReadonlyArray<string>,
  nodeId: string,
  direction: string,
): [string, string, string] {
  const [first, second, third] = values;
  if (values.length !== 3 || first === undefined || second === undefined || third === undefined) {
    throw new TypeError(`Checked node ${nodeId} requires exactly three ${direction} flows`);
  }
  return [first, second, third];
}

function compareIds(
  left: Readonly<{ id: string }>,
  right: Readonly<{ id: string }>,
): number {
  return compareCanonicalStrings(left.id, right.id);
}

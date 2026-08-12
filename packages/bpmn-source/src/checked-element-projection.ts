/**
 * Projection of admitted source elements into checked nodes and Sequence Flows.
 *
 * Both projections are all-or-nothing: one element the projector cannot place returns `undefined`
 * for the whole set, so an unrecognized shape rejects the compilation instead of being dropped from
 * the checked graph. That is the invariant the compiler's identity, distinctness, and admission
 * steps rest on, and it is why no clause here returns a partial result.
 *
 * `isProjectableNodeType` must enumerate exactly the types `projectCheckedNodes` dispatches on. It
 * lives beside that dispatch rather than in the compiler so the two cannot drift apart unnoticed; a
 * disagreement in either direction rejects the source rather than silently omitting an element,
 * because the compiler requires every scoped element to be a projectable node or a Sequence Flow.
 */
import {
  CheckedNodeKind,
  EffectOperation,
  EffectProtocol,
  GatewayDirection,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";

import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import {
  asElement,
  asElementArray,
  hasOnlyModelledKeys,
  readForeignAttributes,
  readId,
} from "./moddle-graph.js";
import type {
  ElementRecord,
} from "./moddle-graph.js";
import { declaredGatewayDirectionMatches } from "./gateway-direction-source.js";
import {
  projectExclusiveGateway,
  projectSimpleBooleanCondition,
} from "./simple-boolean-exclusive-gateway-source.js";
import { projectInclusiveGateway } from "./inclusive-gateway-source.js";
import { projectEventBasedGateway } from "./event-based-gateway-source.js";
import { projectTimerBoundaryEvent } from "./timer-boundary-event-source.js";
import {
  projectIntermediateCatchMessage,
} from "./intermediate-catch-message-source.js";
import {
  projectMessageStartEvent,
} from "./message-start-event-source.js";
import { projectTimerStartEvent } from "./timer-start-event-source.js";
import {
  projectReceiveTask,
} from "./receive-task-source.js";
import {
  executedProjectionView,
} from "./preserved-element-classification.js";
import type {
  PreservationCapability,
} from "./preserved-element-classification.js";
import type {
  RootDefinitionSelection,
} from "./root-definition-selection.js";
import {
  ProjectedFlowElementShape,
  hasOnlyProjectedFlowElementKeys,
} from "./projected-flow-element-keys.js";
import {
  definitionScopeId,
} from "./scoped-flow-elements.js";
import {
  projectBoundaryErrorEvent,
  projectErrorEndEvent,
} from "./subprocess-error-source.js";
import { projectTerminateEndEvent } from "./terminate-end-event-source.js";
import {
  projectConfiguredTask,
} from "./configured-task-source.js";
import type {
  ConfiguredTaskProjectionPolicy,
} from "./configured-task-source.js";
import {
  readUserTaskMetadataSource,
  userTaskMetadataProfile,
} from "./user-task-metadata-source.js";

const bpmnTypes = metamodelManifest.compilerProjection;
const camundaNamespace = "http://camunda.org/schema/1.0/bpmn";
const effectProtocol = "urn:bpmn-lean:effect:probe-v1";
const effectHandlerExpression = "${bpmnLeanEffectHandler}";

export function projectCheckedNodes(
  elements: ReadonlyArray<ElementRecord>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  definitions: ElementRecord,
  rootSelection: RootDefinitionSelection,
  capability: PreservationCapability | undefined,
  configuredTaskPolicy: ConfiguredTaskProjectionPolicy | undefined,
  semanticProfile: string,
): ReadonlyArray<CheckedNode> | undefined {
  const projected = elements.map((source) => {
    const element = executedProjectionView(source, capability);
    if (element === undefined) {
      return undefined;
    }
    const id = readId(element);
    if (id === undefined) {
      return undefined;
    }
    switch (element.$type) {
      case bpmnTypes.startEventType:
        return isPlainFlowNode(element)
          ? { kind: CheckedNodeKind.NoneStartEvent, id }
          : projectMessageStartEvent(
              element,
              id,
              rootSelection.messageArtifacts,
            ) ?? projectTimerStartEvent(element, id);
      case bpmnTypes.subProcessType:
        return isProjectableEmbeddedSubProcess(element)
          ? {
              kind: CheckedNodeKind.EmbeddedSubProcess,
              id,
              childScopeId: definitionScopeId(id),
            }
          : undefined;
      case bpmnTypes.boundaryEventType:
        return projectTimerBoundaryEvent(
          element,
          id,
          flows,
          bpmnTypes.timerEventDefinitionType,
        ) ??
          projectBoundaryErrorEvent(
          element,
          id,
          rootSelection.errorArtifact,
          flows,
        );
      case bpmnTypes.userTaskType: {
        const name = readOptionalName(element);
        if (name === undefined) {
          return undefined;
        }
        return semanticProfile === userTaskMetadataProfile
          ? projectUserTaskMetadata(element, definitions, id, name)
          : isPlainFlowNode(element)
            ? { kind: CheckedNodeKind.UserTask, id, name }
            : undefined;
      }
      case bpmnTypes.intermediateCatchEventType:
        return isExactPt1sTimerEvent(element)
          ? {
              kind: CheckedNodeKind.IntermediateCatchTimerEvent,
              id,
              durationLiteral: "PT1S",
            }
          : projectIntermediateCatchMessage(
              element,
              id,
              rootSelection.messageArtifacts,
            );
      case bpmnTypes.receiveTaskType:
        return projectReceiveTask(
          element,
          id,
          rootSelection.messageArtifacts,
        );
      case bpmnTypes.serviceTaskType:
        return projectServiceTask(element, definitions, id);
      case bpmnTypes.taskType:
        return configuredTaskPolicy === undefined
          ? undefined
          : projectConfiguredTask(element, id, configuredTaskPolicy);
      case bpmnTypes.parallelGatewayType: {
        const direction = classifyGateway(element, id, flows);
        return direction === undefined
          ? undefined
          : {
              kind: CheckedNodeKind.ParallelGateway,
              id,
              direction,
            };
      }
      case bpmnTypes.exclusiveGatewayType:
        return projectExclusiveMerge(element, id, flows) ??
          projectExclusiveGateway(element, id, flows);
      case bpmnTypes.inclusiveGatewayType:
        return projectInclusiveGateway(element, id, flows, elements);
      case bpmnTypes.eventBasedGatewayType:
        return projectEventBasedGateway(element, id, flows);
      case bpmnTypes.endEventType:
        return isPlainFlowNode(element)
          ? { kind: CheckedNodeKind.NoneEndEvent, id }
          : projectTerminateEndEvent(element, id) ?? projectErrorEndEvent(
              element,
              id,
              rootSelection.errorArtifact,
            );
      default:
        return undefined;
    }
  });
  return projected.every((node) => node !== undefined)
    ? (projected as ReadonlyArray<CheckedNode>)
    : undefined;
}

function projectUserTaskMetadata(
  element: ElementRecord,
  definitions: ElementRecord,
  id: string,
  name: string | null,
): Extract<CheckedNode, { kind: CheckedNodeKind.UserTask }> | undefined {
  const projection = readUserTaskMetadataSource(element, definitions);
  if (
    projection === undefined ||
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.UserTaskMetadata,
    )
  ) {
    return undefined;
  }
  return projection.kind === "present"
    ? {
        kind: CheckedNodeKind.UserTask,
        id,
        name,
        metadata: projection.metadata,
      }
    : { kind: CheckedNodeKind.UserTask, id, name };
}

function projectExclusiveMerge(
  element: ElementRecord,
  id: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): Extract<CheckedNode, { kind: CheckedNodeKind.ExclusiveMerge }> | undefined {
  if (
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.ExclusiveOrInclusiveGateway,
    ) ||
    !declaredGatewayDirectionMatches(
      element.gatewayDirection,
      GatewayDirection.Converging,
    ) ||
    element.default !== undefined
  ) {
    return undefined;
  }
  const incoming = flows.filter(({ targetId }) => targetId === id);
  const outgoing = flows.filter(({ sourceId }) => sourceId === id);
  return incoming.length === 3 &&
      outgoing.length === 1 &&
      outgoing[0]?.condition === null
    ? { kind: CheckedNodeKind.ExclusiveMerge, id }
    : undefined;
}

export function projectCheckedSequenceFlows(
  flows: ReadonlyArray<ElementRecord>,
  expressionLanguage: unknown,
  capability: PreservationCapability | undefined,
): ReadonlyArray<CheckedSequenceFlow> | undefined {
  const projected = flows.map((declared) => {
    const flow = executedProjectionView(declared, capability);
    if (
      flow === undefined ||
      !hasOnlyProjectedFlowElementKeys(
        flow,
        ProjectedFlowElementShape.StandardSequenceFlow,
      )
    ) {
      return undefined;
    }
    const id = readId(flow);
    const source = asElement(flow.sourceRef);
    const target = asElement(flow.targetRef);
    const sourceId = source === undefined ? undefined : readId(source);
    const targetId = target === undefined ? undefined : readId(target);
    const condition = projectSimpleBooleanCondition(
      flow.conditionExpression,
      expressionLanguage,
    );
    return (
      id === undefined ||
      sourceId === undefined ||
      targetId === undefined ||
      condition === undefined
    )
      ? undefined
      : { id, sourceId, targetId, condition };
  });
  return projected.every((flow) => flow !== undefined)
    ? (projected as ReadonlyArray<CheckedSequenceFlow>)
    : undefined;
}

export function isProjectableNodeType(
  type: unknown,
  configuredTaskPolicy?: ConfiguredTaskProjectionPolicy,
): boolean {
  return (configuredTaskPolicy !== undefined &&
      type === configuredTaskPolicy.taskType) || [
    bpmnTypes.startEventType,
    bpmnTypes.subProcessType,
    bpmnTypes.boundaryEventType,
    bpmnTypes.intermediateCatchEventType,
    bpmnTypes.receiveTaskType,
    bpmnTypes.userTaskType,
    bpmnTypes.serviceTaskType,
    bpmnTypes.parallelGatewayType,
    bpmnTypes.exclusiveGatewayType,
    bpmnTypes.inclusiveGatewayType,
    bpmnTypes.eventBasedGatewayType,
    bpmnTypes.endEventType,
  ].includes(String(type));
}

function classifyGateway(
  element: ElementRecord,
  id: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): GatewayDirection | undefined {
  if (
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.ParallelGateway,
    )
  ) {
    return undefined;
  }
  const incoming = flows.filter(({ targetId }) => targetId === id).length;
  const outgoing = flows.filter(({ sourceId }) => sourceId === id).length;
  const direction =
    incoming === 1 && outgoing === 2
      ? GatewayDirection.Diverging
      : incoming === 2 && outgoing === 1
        ? GatewayDirection.Converging
        : undefined;
  if (direction === undefined) {
    return undefined;
  }
  if (declaredGatewayDirectionMatches(element.gatewayDirection, direction)) {
    return direction;
  }
  return undefined;
}

function projectServiceTask(
  element: ElementRecord,
  definitions: ElementRecord,
  id: string,
): Extract<CheckedNode, { kind: CheckedNodeKind.ServiceTask }> | undefined {
  if (
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.GenericServiceTask,
    ) ||
    element.implementation !== effectProtocol
  ) {
    return undefined;
  }
  const attributes = readForeignAttributes(element, definitions);
  if (
    attributes === undefined ||
    attributes.size !== 2 ||
    attributes.get(`${camundaNamespace}#delegateExpression`) !==
      effectHandlerExpression ||
    attributes.get(`${camundaNamespace}#asyncBefore`) !== "true"
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.ServiceTask,
    id,
    descriptor: {
      protocol: EffectProtocol.Activity,
      operation: EffectOperation.Probe,
    },
    inputMappings: [],
    outputMappings: [],
    bpmnErrorRoute: null,
  };
}

function isExactPt1sTimerEvent(element: ElementRecord): boolean {
  if (
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.IntermediateCatchEvent,
    )
  ) {
    return false;
  }
  const eventDefinitions = asElementArray(element.eventDefinitions);
  if (
    eventDefinitions === undefined ||
    eventDefinitions.length !== 1
  ) {
    return false;
  }
  const definition = eventDefinitions[0];
  if (
    definition === undefined ||
    definition.$type !== bpmnTypes.timerEventDefinitionType ||
    !hasOnlyModelledKeys(definition, ["$type", "timeDuration"])
  ) {
    return false;
  }
  const duration = asElement(definition.timeDuration);
  return (
    duration !== undefined &&
    duration.$type === bpmnTypes.formalExpressionType &&
    hasOnlyModelledKeys(duration, ["$type", "body"]) &&
    duration.body === "PT1S"
  );
}

function isPlainFlowNode(element: ElementRecord): boolean {
  return hasOnlyProjectedFlowElementKeys(
    element,
    ProjectedFlowElementShape.PlainNode,
  );
}

function isProjectableEmbeddedSubProcess(element: ElementRecord): boolean {
  return hasOnlyProjectedFlowElementKeys(
    element,
    ProjectedFlowElementShape.EmbeddedSubProcess,
  );
}

function readOptionalName(
  element: ElementRecord,
): string | null | undefined {
  if (element.name === undefined) {
    return null;
  }
  return typeof element.name === "string" ? element.name : undefined;
}

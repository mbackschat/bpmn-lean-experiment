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
  projectReceiveTask,
} from "./receive-task-source.js";
import type {
  RootDefinitionSelection,
} from "./root-definition-selection.js";
import {
  definitionScopeId,
} from "./scoped-flow-elements.js";
import {
  projectBoundaryErrorEvent,
  projectErrorEndEvent,
} from "./subprocess-error-source.js";

const bpmnTypes = metamodelManifest.compilerProjection;
const camundaNamespace = "http://camunda.org/schema/1.0/bpmn";
const effectProtocol = "urn:bpmn-lean:effect:probe-v1";
const effectHandlerExpression = "${bpmnLeanEffectHandler}";

export function projectCheckedNodes(
  elements: ReadonlyArray<ElementRecord>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  definitions: ElementRecord,
  rootSelection: RootDefinitionSelection,
): ReadonlyArray<CheckedNode> | undefined {
  const projected = elements.map((element) => {
    const id = readId(element);
    if (id === undefined) {
      return undefined;
    }
    switch (element.$type) {
      case bpmnTypes.startEventType:
        return isPlainFlowNode(element)
          ? { kind: CheckedNodeKind.NoneStartEvent, id }
          : undefined;
      case bpmnTypes.subProcessType:
        return {
          kind: CheckedNodeKind.EmbeddedSubProcess,
          id,
          childScopeId: definitionScopeId(id),
        };
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
        return isPlainFlowNode(element) && name !== undefined
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
        return projectExclusiveGateway(element, id, flows);
      case bpmnTypes.inclusiveGatewayType:
        return projectInclusiveGateway(element, id, flows, elements);
      case bpmnTypes.eventBasedGatewayType:
        return projectEventBasedGateway(element, id, flows);
      case bpmnTypes.endEventType:
        return isPlainFlowNode(element)
          ? { kind: CheckedNodeKind.NoneEndEvent, id }
          : projectErrorEndEvent(
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

export function projectCheckedSequenceFlows(
  flows: ReadonlyArray<ElementRecord>,
  expressionLanguage: unknown,
): ReadonlyArray<CheckedSequenceFlow> | undefined {
  const projected = flows.map((flow) => {
    if (
      !hasOnlyModelledKeys(flow, [
        "$type",
        "id",
        "name",
        "conditionExpression",
      ])
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

export function isProjectableNodeType(type: unknown): boolean {
  return [
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
    !hasOnlyModelledKeys(element, [
      "$type",
      "id",
      "name",
      "gatewayDirection",
    ])
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
    !hasOnlyModelledKeys(element, ["$type", "id", "name", "implementation"]) ||
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
    !hasOnlyModelledKeys(element, [
      "$type",
      "id",
      "name",
      "eventDefinitions",
    ])
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
  return hasOnlyModelledKeys(element, ["$type", "id", "name"]);
}

function readOptionalName(
  element: ElementRecord,
): string | null | undefined {
  if (element.name === undefined) {
    return null;
  }
  return typeof element.name === "string" ? element.name : undefined;
}

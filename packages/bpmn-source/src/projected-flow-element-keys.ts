/**
 * Closed ownership of the top-level modelled keys consumed by flow-element projectors.
 *
 * The pre-projection classifier and every projector name the same shape entry. This inventory owns
 * keys only: unsupported values, identities, cardinalities, and topology remain the projector's or
 * checked-graph admission's responsibility.
 */
import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import {
  locateContainedElements,
} from "./admission-diagnostics.js";
import type {
  ElementRejection,
} from "./admission-diagnostics.js";
import {
  hasOnlyModelledKeys,
} from "./moddle-graph.js";
import type {
  ElementRecord,
} from "./moddle-graph.js";
import {
  unadmittedKeyRejections,
} from "./preserved-element-classification.js";
import type {
  PreservationCapability,
} from "./preserved-element-classification.js";

const bpmnTypes = metamodelManifest.compilerProjection;
const noPreservedKeys: ReadonlySet<string> = new Set();

export const FlowElementProjectionProfile = Object.freeze({
  Generic: "generic",
  MappedSuccessServiceTask: "mappedSuccessServiceTask",
  MappedBoundaryErrorServiceTask: "mappedBoundaryErrorServiceTask",
  CallActivity: "callActivity",
} as const);

export type FlowElementProjectionProfile =
  typeof FlowElementProjectionProfile[keyof typeof FlowElementProjectionProfile];

export const ProjectedFlowElementShape = Object.freeze({
  PlainNode: "plainNode",
  EmbeddedSubProcess: "embeddedSubProcess",
  StandardSequenceFlow: "standardSequenceFlow",
  GenericServiceTask: "genericServiceTask",
  ParallelGateway: "parallelGateway",
  ExclusiveOrInclusiveGateway: "exclusiveOrInclusiveGateway",
  EventBasedGateway: "eventBasedGateway",
  IntermediateCatchEvent: "intermediateCatchEvent",
  MessageStartEvent: "messageStartEvent",
  ReceiveTask: "receiveTask",
  ErrorEndEvent: "errorEndEvent",
  BoundaryEvent: "boundaryEvent",
  MappedSuccessServiceTask: "mappedSuccessServiceTask",
  MappedSuccessSequenceFlow: "mappedSuccessSequenceFlow",
  MappedBoundaryIdentityNode: "mappedBoundaryIdentityNode",
  MappedBoundaryServiceTask: "mappedBoundaryServiceTask",
  MappedBoundaryEvent: "mappedBoundaryEvent",
  MappedBoundarySequenceFlow: "mappedBoundarySequenceFlow",
  CallActivity: "callActivity",
} as const);

export type ProjectedFlowElementShape =
  typeof ProjectedFlowElementShape[keyof typeof ProjectedFlowElementShape];

export const projectedFlowElementKeys = Object.freeze({
  [ProjectedFlowElementShape.PlainNode]: Object.freeze([
    "$type", "id", "name",
  ]),
  [ProjectedFlowElementShape.EmbeddedSubProcess]: Object.freeze([
    "$type", "id", "name", "triggeredByEvent", "flowElements",
  ]),
  [ProjectedFlowElementShape.StandardSequenceFlow]: Object.freeze([
    "$type", "id", "name", "sourceRef", "targetRef", "conditionExpression",
  ]),
  [ProjectedFlowElementShape.GenericServiceTask]: Object.freeze([
    "$type", "id", "name", "implementation",
  ]),
  [ProjectedFlowElementShape.ParallelGateway]: Object.freeze([
    "$type", "id", "name", "gatewayDirection",
  ]),
  [ProjectedFlowElementShape.ExclusiveOrInclusiveGateway]: Object.freeze([
    "$type", "id", "name", "gatewayDirection", "default",
  ]),
  [ProjectedFlowElementShape.EventBasedGateway]: Object.freeze([
    "$type", "id", "name", "gatewayDirection", "instantiate", "eventGatewayType",
  ]),
  [ProjectedFlowElementShape.IntermediateCatchEvent]: Object.freeze([
    "$type", "id", "name", "eventDefinitions",
  ]),
  [ProjectedFlowElementShape.MessageStartEvent]: Object.freeze([
    "$type", "id", "name", "eventDefinitions", "eventDefinitionRef",
    "parallelMultiple", "isInterrupting", "dataOutputs", "outputSet",
    "dataOutputAssociations",
  ]),
  [ProjectedFlowElementShape.ReceiveTask]: Object.freeze([
    "$type", "id", "name", "messageRef", "instantiate",
  ]),
  [ProjectedFlowElementShape.ErrorEndEvent]: Object.freeze([
    "$type", "id", "name", "eventDefinitions",
  ]),
  [ProjectedFlowElementShape.BoundaryEvent]: Object.freeze([
    "$type", "id", "name", "attachedToRef", "cancelActivity", "eventDefinitions",
  ]),
  [ProjectedFlowElementShape.MappedSuccessServiceTask]: Object.freeze([
    "$type", "id", "name", "extensionElements",
  ]),
  [ProjectedFlowElementShape.MappedSuccessSequenceFlow]: Object.freeze([
    "$type", "id", "name", "sourceRef", "targetRef",
  ]),
  [ProjectedFlowElementShape.MappedBoundaryIdentityNode]: Object.freeze([
    "$type", "id",
  ]),
  [ProjectedFlowElementShape.MappedBoundaryServiceTask]: Object.freeze([
    "$type", "id", "name", "implementation", "extensionElements",
  ]),
  [ProjectedFlowElementShape.MappedBoundaryEvent]: Object.freeze([
    "$type", "id", "name", "attachedToRef", "cancelActivity", "eventDefinitions",
  ]),
  [ProjectedFlowElementShape.MappedBoundarySequenceFlow]: Object.freeze([
    "$type", "id", "sourceRef", "targetRef",
  ]),
  [ProjectedFlowElementShape.CallActivity]: Object.freeze([
    "$type", "id", "name", "calledElement",
  ]),
} as const satisfies Readonly<
  Record<ProjectedFlowElementShape, ReadonlyArray<string>>
>);

export function hasOnlyProjectedFlowElementKeys(
  element: ElementRecord,
  shape: ProjectedFlowElementShape,
): boolean {
  return hasOnlyModelledKeys(element, projectedFlowElementKeys[shape]);
}

/**
 * Classifies own keys before projection. `undefined` means a selected type has no exact inventory
 * entry, so the caller must refuse structurally instead of borrowing a broader shape.
 */
export function projectedFlowElementKeyRejections(
  definitions: ElementRecord,
  elements: ReadonlyArray<ElementRecord>,
  profile: FlowElementProjectionProfile,
  capability?: PreservationCapability,
): ReadonlyArray<ElementRejection> | undefined {
  const located = locateContainedElements(definitions);
  const rejections: ElementRejection[] = [];
  for (const element of elements) {
    const locus = located.get(element);
    const shapes = projectedFlowElementShapes(profile, element.$type);
    if (locus === undefined || shapes === undefined) {
      return undefined;
    }
    const keys = [...new Set(shapes.flatMap((shape) =>
      projectedFlowElementKeys[shape]
    ))];
    rejections.push(...unadmittedKeyRejections(
      element,
      locus,
      keys,
      capability?.baseElementKeys ?? noPreservedKeys,
      capability,
    ));
  }
  return rejections;
}

export function projectedFlowElementShapes(
  profile: FlowElementProjectionProfile,
  type: unknown,
): ReadonlyArray<ProjectedFlowElementShape> | undefined {
  switch (profile) {
    case FlowElementProjectionProfile.Generic:
      return genericShapes(type);
    case FlowElementProjectionProfile.MappedSuccessServiceTask:
      return mappedSuccessShapes(type);
    case FlowElementProjectionProfile.MappedBoundaryErrorServiceTask:
      return mappedBoundaryShapes(type);
    case FlowElementProjectionProfile.CallActivity:
      return callActivityShapes(type);
  }
}

function genericShapes(
  type: unknown,
): ReadonlyArray<ProjectedFlowElementShape> | undefined {
  switch (type) {
    case bpmnTypes.startEventType:
      return [
        ProjectedFlowElementShape.PlainNode,
        ProjectedFlowElementShape.MessageStartEvent,
      ];
    case bpmnTypes.userTaskType:
      return [ProjectedFlowElementShape.PlainNode];
    case bpmnTypes.endEventType:
      return [
        ProjectedFlowElementShape.PlainNode,
        ProjectedFlowElementShape.ErrorEndEvent,
      ];
    case bpmnTypes.subProcessType:
      return [ProjectedFlowElementShape.EmbeddedSubProcess];
    case bpmnTypes.sequenceFlowType:
      return [ProjectedFlowElementShape.StandardSequenceFlow];
    case bpmnTypes.serviceTaskType:
      return [ProjectedFlowElementShape.GenericServiceTask];
    case bpmnTypes.parallelGatewayType:
      return [ProjectedFlowElementShape.ParallelGateway];
    case bpmnTypes.exclusiveGatewayType:
    case bpmnTypes.inclusiveGatewayType:
      return [ProjectedFlowElementShape.ExclusiveOrInclusiveGateway];
    case bpmnTypes.eventBasedGatewayType:
      return [ProjectedFlowElementShape.EventBasedGateway];
    case bpmnTypes.intermediateCatchEventType:
      return [ProjectedFlowElementShape.IntermediateCatchEvent];
    case bpmnTypes.receiveTaskType:
      return [ProjectedFlowElementShape.ReceiveTask];
    case bpmnTypes.boundaryEventType:
      return [ProjectedFlowElementShape.BoundaryEvent];
    default:
      return undefined;
  }
}

function mappedSuccessShapes(
  type: unknown,
): ReadonlyArray<ProjectedFlowElementShape> | undefined {
  switch (type) {
    case bpmnTypes.startEventType:
    case bpmnTypes.endEventType:
      return [ProjectedFlowElementShape.PlainNode];
    case bpmnTypes.serviceTaskType:
      return [ProjectedFlowElementShape.MappedSuccessServiceTask];
    case bpmnTypes.sequenceFlowType:
      return [ProjectedFlowElementShape.MappedSuccessSequenceFlow];
    default:
      return undefined;
  }
}

function mappedBoundaryShapes(
  type: unknown,
): ReadonlyArray<ProjectedFlowElementShape> | undefined {
  switch (type) {
    case bpmnTypes.startEventType:
    case bpmnTypes.endEventType:
      return [ProjectedFlowElementShape.MappedBoundaryIdentityNode];
    case bpmnTypes.userTaskType:
      return [ProjectedFlowElementShape.PlainNode];
    case bpmnTypes.serviceTaskType:
      return [ProjectedFlowElementShape.MappedBoundaryServiceTask];
    case bpmnTypes.boundaryEventType:
      return [ProjectedFlowElementShape.MappedBoundaryEvent];
    case bpmnTypes.sequenceFlowType:
      return [ProjectedFlowElementShape.MappedBoundarySequenceFlow];
    default:
      return undefined;
  }
}

function callActivityShapes(
  type: unknown,
): ReadonlyArray<ProjectedFlowElementShape> | undefined {
  switch (type) {
    case bpmnTypes.startEventType:
    case bpmnTypes.userTaskType:
    case bpmnTypes.endEventType:
      return [ProjectedFlowElementShape.PlainNode];
    case bpmnTypes.callActivityType:
      return [ProjectedFlowElementShape.CallActivity];
    case bpmnTypes.sequenceFlowType:
      return [ProjectedFlowElementShape.StandardSequenceFlow];
    default:
      return undefined;
  }
}

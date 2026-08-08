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
  A12CreateDocument: "a12CreateDocument",
  A12BoundaryError: "a12BoundaryError",
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
  ReceiveTask: "receiveTask",
  ErrorEndEvent: "errorEndEvent",
  BoundaryEvent: "boundaryEvent",
  A12CreateServiceTask: "a12CreateServiceTask",
  A12CreateSequenceFlow: "a12CreateSequenceFlow",
  A12BoundaryIdentityNode: "a12BoundaryIdentityNode",
  A12BoundaryServiceTask: "a12BoundaryServiceTask",
  A12BoundaryEvent: "a12BoundaryEvent",
  A12BoundarySequenceFlow: "a12BoundarySequenceFlow",
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
  [ProjectedFlowElementShape.ReceiveTask]: Object.freeze([
    "$type", "id", "name", "messageRef", "instantiate",
  ]),
  [ProjectedFlowElementShape.ErrorEndEvent]: Object.freeze([
    "$type", "id", "name", "eventDefinitions",
  ]),
  [ProjectedFlowElementShape.BoundaryEvent]: Object.freeze([
    "$type", "id", "name", "attachedToRef", "cancelActivity", "eventDefinitions",
  ]),
  [ProjectedFlowElementShape.A12CreateServiceTask]: Object.freeze([
    "$type", "id", "name", "extensionElements",
  ]),
  [ProjectedFlowElementShape.A12CreateSequenceFlow]: Object.freeze([
    "$type", "id", "name", "sourceRef", "targetRef",
  ]),
  [ProjectedFlowElementShape.A12BoundaryIdentityNode]: Object.freeze([
    "$type", "id",
  ]),
  [ProjectedFlowElementShape.A12BoundaryServiceTask]: Object.freeze([
    "$type", "id", "name", "implementation", "extensionElements",
  ]),
  [ProjectedFlowElementShape.A12BoundaryEvent]: Object.freeze([
    "$type", "id", "name", "attachedToRef", "cancelActivity", "eventDefinitions",
  ]),
  [ProjectedFlowElementShape.A12BoundarySequenceFlow]: Object.freeze([
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
    case FlowElementProjectionProfile.A12CreateDocument:
      return a12CreateShapes(type);
    case FlowElementProjectionProfile.A12BoundaryError:
      return a12BoundaryShapes(type);
    case FlowElementProjectionProfile.CallActivity:
      return callActivityShapes(type);
  }
}

function genericShapes(
  type: unknown,
): ReadonlyArray<ProjectedFlowElementShape> | undefined {
  switch (type) {
    case bpmnTypes.startEventType:
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

function a12CreateShapes(
  type: unknown,
): ReadonlyArray<ProjectedFlowElementShape> | undefined {
  switch (type) {
    case bpmnTypes.startEventType:
    case bpmnTypes.endEventType:
      return [ProjectedFlowElementShape.PlainNode];
    case bpmnTypes.serviceTaskType:
      return [ProjectedFlowElementShape.A12CreateServiceTask];
    case bpmnTypes.sequenceFlowType:
      return [ProjectedFlowElementShape.A12CreateSequenceFlow];
    default:
      return undefined;
  }
}

function a12BoundaryShapes(
  type: unknown,
): ReadonlyArray<ProjectedFlowElementShape> | undefined {
  switch (type) {
    case bpmnTypes.startEventType:
    case bpmnTypes.endEventType:
      return [ProjectedFlowElementShape.A12BoundaryIdentityNode];
    case bpmnTypes.userTaskType:
      return [ProjectedFlowElementShape.PlainNode];
    case bpmnTypes.serviceTaskType:
      return [ProjectedFlowElementShape.A12BoundaryServiceTask];
    case bpmnTypes.boundaryEventType:
      return [ProjectedFlowElementShape.A12BoundaryEvent];
    case bpmnTypes.sequenceFlowType:
      return [ProjectedFlowElementShape.A12BoundarySequenceFlow];
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

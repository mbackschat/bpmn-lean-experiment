import {
  flattenElements,
  hasDirectChild,
  localNamesById,
  parseXmlElements,
} from "./minimal-xml-tree.ts";
import type { XmlElement } from "./minimal-xml-tree.ts";
import type {
  MvpBpmnCapabilityId,
} from "../model-corpus/mvp-capabilities.ts";

const eventDefinitionNames = new Set([
  "cancelEventDefinition",
  "compensateEventDefinition",
  "conditionalEventDefinition",
  "errorEventDefinition",
  "escalationEventDefinition",
  "linkEventDefinition",
  "messageEventDefinition",
  "signalEventDefinition",
  "terminateEventDefinition",
  "timerEventDefinition",
]);

export function detectExecutableBpmnCapabilities(
  xml: string,
): ReadonlyArray<MvpBpmnCapabilityId> {
  const scan = parseXmlElements(xml);
  if (scan.structurallyMalformed) {
    throw new TypeError("cannot inventory structurally malformed retained BPMN XML");
  }
  const elements = flattenElements(scan.roots);
  const namesById = localNamesById(elements);
  const elementsById = new Map(
    elements.flatMap((element) =>
      element.attributes.id === undefined
        ? []
        : [[element.attributes.id, element] as const]
    ),
  );
  const capabilities = new Set<MvpBpmnCapabilityId>();

  for (const element of elements) {
    switch (element.name) {
      case "process":
        capabilities.add("process");
        break;
      case "sequenceFlow":
        capabilities.add("sequenceFlow");
        break;
      case "startEvent":
        addStartCapability(element, capabilities);
        break;
      case "endEvent":
        addEndCapability(element, capabilities);
        break;
      case "userTask":
        addUserTaskCapability(element, capabilities);
        break;
      case "serviceTask":
        rejectLoopVariant(element);
        capabilities.add("serviceTask");
        break;
      case "receiveTask":
        rejectLoopVariant(element);
        capabilities.add("receiveTask");
        break;
      case "task":
        rejectLoopVariant(element);
        capabilities.add("configuredTask");
        break;
      case "callActivity":
        rejectLoopVariant(element);
        capabilities.add("callActivity");
        break;
      case "subProcess":
        rejectLoopVariant(element);
        if (element.attributes.triggeredByEvent === "true") {
          throw new TypeError("unclassified executable BPMN element eventSubProcess");
        }
        capabilities.add("embeddedSubProcess");
        break;
      case "exclusiveGateway":
        capabilities.add("exclusiveGateway");
        break;
      case "parallelGateway":
        capabilities.add("parallelGateway");
        break;
      case "inclusiveGateway":
        capabilities.add("inclusiveGateway");
        break;
      case "eventBasedGateway":
        capabilities.add("eventBasedGateway");
        break;
      case "intermediateCatchEvent":
        addIntermediateCatchCapability(element, capabilities);
        break;
      case "boundaryEvent":
        addBoundaryCapability(
          element,
          namesById,
          elementsById,
          capabilities,
        );
        break;
      default:
        rejectUnknownExecutableElement(element);
    }
  }
  return Object.freeze([...capabilities].sort());
}

function addUserTaskCapability(
  task: XmlElement,
  capabilities: Set<MvpBpmnCapabilityId>,
): void {
  capabilities.add("userTask");
  if (hasDirectChild(task, "standardLoopCharacteristics")) {
    throw new TypeError("unclassified executable BPMN loop variant on userTask");
  }
  const multiInstance = task.children.find(
    ({ name }) => name === "multiInstanceLoopCharacteristics",
  );
  if (multiInstance === undefined) {
    return;
  }
  switch (multiInstance.attributes.isSequential) {
    case "true":
      capabilities.add("sequentialMultiInstanceUserTask");
      return;
    case "false":
      capabilities.add("parallelMultiInstanceUserTask");
      return;
    default:
      throw new TypeError(
        "unclassified executable BPMN Multi-Instance User Task sequential mode",
      );
  }
}

function addStartCapability(
  event: XmlElement,
  capabilities: Set<MvpBpmnCapabilityId>,
): void {
  const definition = eventDefinition(event);
  switch (definition) {
    case null:
      capabilities.add("noneStartEvent");
      return;
    case "messageEventDefinition":
      capabilities.add("messageStartEvent");
      return;
    case "timerEventDefinition":
      capabilities.add("timerStartEvent");
      return;
    default:
      throw new TypeError(`unclassified executable BPMN Start Event variant ${definition}`);
  }
}

function addEndCapability(
  event: XmlElement,
  capabilities: Set<MvpBpmnCapabilityId>,
): void {
  const definition = eventDefinition(event);
  switch (definition) {
    case null:
      capabilities.add("noneEndEvent");
      return;
    case "errorEventDefinition":
      capabilities.add("errorEndEvent");
      return;
    case "terminateEventDefinition":
      capabilities.add("terminateEndEvent");
      return;
    default:
      throw new TypeError(`unclassified executable BPMN End Event variant ${definition}`);
  }
}

function addIntermediateCatchCapability(
  event: XmlElement,
  capabilities: Set<MvpBpmnCapabilityId>,
): void {
  const definition = eventDefinition(event);
  switch (definition) {
    case "messageEventDefinition":
      capabilities.add("intermediateCatchMessageEvent");
      return;
    case "timerEventDefinition":
      capabilities.add("intermediateCatchTimerEvent");
      return;
    default:
      throw new TypeError(
        `unclassified executable BPMN Intermediate Catch Event variant ${definition ?? "none"}`,
      );
  }
}

function addBoundaryCapability(
  event: XmlElement,
  namesById: ReadonlyMap<string, string>,
  elementsById: ReadonlyMap<string, XmlElement>,
  capabilities: Set<MvpBpmnCapabilityId>,
): void {
  const attachedToId = event.attributes.attachedToRef ?? "";
  const attachedTo = namesById.get(attachedToId) ?? "unknown";
  const attachedElement = elementsById.get(attachedToId);
  const definition = eventDefinition(event);
  if (definition === "timerEventDefinition") {
    const interrupting = event.attributes.cancelActivity !== "false";
    if (attachedTo === "userTask") {
      if (
        attachedElement !== undefined &&
        hasDirectChild(attachedElement, "multiInstanceLoopCharacteristics")
      ) {
        if (!interrupting) {
          throw new TypeError(
            "unclassified executable BPMN non-interrupting sequential Multi-Instance boundary Timer",
          );
        }
        const loop = attachedElement.children.find(
          ({ name }) => name === "multiInstanceLoopCharacteristics",
        );
        switch (loop?.attributes.isSequential) {
          case "true":
            capabilities.add(
              "interruptingSequentialMultiInstanceBoundaryTimerEvent",
            );
            return;
          case "false":
            capabilities.add(
              "interruptingParallelMultiInstanceBoundaryTimerEvent",
            );
            return;
          default:
            throw new TypeError(
              "unclassified executable BPMN Multi-Instance boundary Timer sequential mode",
            );
        }
      }
      capabilities.add(interrupting
        ? "interruptingUserTaskBoundaryTimerEvent"
        : "nonInterruptingUserTaskBoundaryTimerEvent");
      return;
    }
    if (attachedTo === "subProcess" && interrupting) {
      capabilities.add("interruptingSubProcessBoundaryTimerEvent");
      return;
    }
  }
  if (definition === "errorEventDefinition") {
    if (attachedTo === "serviceTask") {
      capabilities.add("serviceTaskBoundaryErrorEvent");
      return;
    }
    if (attachedTo === "subProcess") {
      capabilities.add("subProcessBoundaryErrorEvent");
      return;
    }
  }
  throw new TypeError(
    `unclassified executable BPMN Boundary Event variant ${definition ?? "none"} on ${attachedTo}`,
  );
}

function eventDefinition(event: XmlElement): string | null {
  const definitions = event.children
    .map(({ name }) => name)
    .filter((name) => eventDefinitionNames.has(name));
  if (definitions.length > 1) {
    throw new TypeError(`unclassified executable BPMN mixed Event variant ${definitions.join(", ")}`);
  }
  return definitions[0] ?? null;
}

function rejectLoopVariant(activity: XmlElement): void {
  if (
    hasDirectChild(activity, "standardLoopCharacteristics") ||
    hasDirectChild(activity, "multiInstanceLoopCharacteristics")
  ) {
    throw new TypeError(`unclassified executable BPMN loop variant on ${activity.name}`);
  }
}

function rejectUnknownExecutableElement(element: XmlElement): void {
  if (
    element.name.endsWith("Task") ||
    element.name.endsWith("Gateway") ||
    element.name.endsWith("Event") ||
    element.name === "transaction"
  ) {
    throw new TypeError(`unclassified executable BPMN element ${element.name}`);
  }
}

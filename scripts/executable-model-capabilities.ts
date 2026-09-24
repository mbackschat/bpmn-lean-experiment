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
  const parents = new Map(elements.flatMap((parent) => parent.children.map((child) => [child, parent] as const)));
  const compensation = compensationContext(elements, elementsById, parents, capabilities);

  for (const element of elements) {
    if (compensation.dormant.has(element)) continue;
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
        capabilities.add(compensation.handlers.has(element) ? "compensationHandlerServiceTask" : "serviceTask");
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
        if (isTrue(element.attributes.triggeredByEvent)) {
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
      case "intermediateThrowEvent": {
        const definition = element.children.find(({ name }) => name === "compensateEventDefinition");
        if (eventDefinition(element) !== "compensateEventDefinition" || definition === undefined ||
            definition.attributes.activityRef !== undefined ||
            (definition.attributes.waitForCompletion !== undefined && !isTrue(definition.attributes.waitForCompletion)) ||
            parents.get(element)?.name !== "process") {
          throw new TypeError("unclassified executable BPMN Intermediate Throw Event variant");
        }
        capabilities.add("compensationIntermediateThrowEvent");
        break;
      }
      case "boundaryEvent":
        if (compensation.boundaries.has(element)) {
          capabilities.add("compensationBoundaryEvent");
          break;
        }
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
  addMessageCorrelationCapability(elements, capabilities);
  return Object.freeze([...capabilities].sort());
}

function isTrue(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

function compensationContext(
  elements: ReadonlyArray<XmlElement>,
  elementsById: ReadonlyMap<string, XmlElement>,
  parents: ReadonlyMap<XmlElement, XmlElement>,
  capabilities: Set<MvpBpmnCapabilityId>,
): Readonly<{ dormant: ReadonlySet<XmlElement>; handlers: ReadonlySet<XmlElement>; boundaries: ReadonlySet<XmlElement> }> {
  const dormant = new Set<XmlElement>();
  const handlers = new Set<XmlElement>();
  const boundaries = new Set<XmlElement>();
  for (const element of elements) {
    if (element.name !== "subProcess" || !isTrue(element.attributes.triggeredByEvent)) continue;
    rejectLoopVariant(element);
    const owner = parents.get(element);
    const starts = element.children.filter(({ name }) => name === "startEvent");
    const tasks = element.children.filter(({ name }) => name === "serviceTask");
    const ends = element.children.filter(({ name }) => name === "endEvent");
    if (owner?.name !== "subProcess" || isTrue(owner.attributes.triggeredByEvent) || parents.get(owner)?.name !== "process" ||
        starts.length !== 1 || starts[0] === undefined || eventDefinition(starts[0]) !== "compensateEventDefinition" ||
        tasks.length !== 1 || tasks[0] === undefined || !isCompensationEffect(tasks[0]) ||
        ends.length !== 1 || ends[0] === undefined || eventDefinition(ends[0]) !== null) {
      throw new TypeError("unclassified executable BPMN eventSubProcess variant");
    }
    rejectLoopVariant(tasks[0]);
    const body = flattenElements(element.children);
    for (const child of body) {
      if (child === starts[0] || child === tasks[0] || child === ends[0]) continue;
      if (child.name === "subProcess") throw new TypeError("unclassified executable BPMN nested Compensation handler");
      rejectUnknownExecutableElement(child);
    }
    for (const child of [element, ...body]) dormant.add(child);
    capabilities.add("compensationEventSubProcess");
    capabilities.add("compensationHandlerServiceTask");
  }
  for (const event of elements) {
    if (event.name !== "boundaryEvent" || eventDefinition(event) !== "compensateEventDefinition") continue;
    const host = elementsById.get(event.attributes.attachedToRef ?? "");
    const owner = parents.get(event);
    const associations = elements.filter((element) => element.name === "association" &&
      event.attributes.id !== undefined && element.attributes.sourceRef === event.attributes.id);
    const association = associations[0];
    const handler = elementsById.get(association?.attributes.targetRef ?? "");
    if (owner?.name !== "process" || host?.name !== "userTask" || parents.get(host) !== owner ||
        isTrue(host.attributes.isForCompensation) || associations.length !== 1 || association === undefined ||
        parents.get(association) !== owner || handler?.name !== "serviceTask" || parents.get(handler) !== owner ||
        !isTrue(handler.attributes.isForCompensation) || !isCompensationEffect(handler)) {
      throw new TypeError("unclassified executable BPMN Compensation boundary handler context");
    }
    rejectLoopVariant(host);
    rejectLoopVariant(handler);
    boundaries.add(event);
    handlers.add(handler);
  }
  for (const element of elements) {
    if (isTrue(element.attributes.isForCompensation) && !handlers.has(element) && !dormant.has(element)) {
      throw new TypeError("unclassified executable BPMN Compensation Activity context");
    }
  }
  return { dormant, handlers, boundaries };
}

function isCompensationEffect(task: XmlElement): boolean {
  return task.attributes.implementation === "urn:bpmn-lean:effect:compensation-single-effect-v1";
}

function addMessageCorrelationCapability(
  elements: ReadonlyArray<XmlElement>,
  capabilities: Set<MvpBpmnCapabilityId>,
): void {
  const requiredCounts = new Map<string, number>([
    ["correlationKey", 1],
    ["correlationProperty", 1],
    ["correlationPropertyBinding", 1],
    ["correlationPropertyRetrievalExpression", 1],
    ["correlationSubscription", 1],
    ["dataPath", 1],
    ["messagePath", 1],
  ] as const);
  const actualCounts = new Map<string, number>();
  for (const element of elements) {
    if (requiredCounts.has(element.name)) {
      actualCounts.set(element.name, (actualCounts.get(element.name) ?? 0) + 1);
    }
  }
  if (actualCounts.size === 0) return;
  if (
    [...requiredCounts].some(([name, count]) =>
      actualCounts.get(name) !== count
    ) ||
    elements.filter((element) =>
      element.name === "intermediateCatchEvent" &&
      eventDefinition(element) === "messageEventDefinition"
    ).length !== 2
  ) {
    throw new TypeError(
      "unclassified executable BPMN Message key-correlation shape",
    );
  }
  capabilities.add("messageKeyCorrelation");
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
    const hasInput = hasDirectChild(task, "dataInputAssociation");
    const hasOutput = hasDirectChild(task, "dataOutputAssociation");
    if (hasInput && hasOutput) {
      capabilities.add("directDataInputOutputUserTask");
    } else if (hasInput) {
      capabilities.add("directDataInputUserTask");
    } else if (hasOutput) {
      capabilities.add("directDataOutputUserTask");
    }
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
      addMessageCatchPayloadCapability(event, capabilities);
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

function addMessageCatchPayloadCapability(
  event: XmlElement,
  capabilities: Set<MvpBpmnCapabilityId>,
): void {
  const payloadChildren = [
    "dataOutput",
    "dataOutputAssociation",
    "outputSet",
  ].filter((name) => hasDirectChild(event, name));
  if (payloadChildren.length === 0) {
    return;
  }
  if (payloadChildren.length !== 3) {
    throw new TypeError(
      "unclassified executable BPMN Message Catch Event payload mediation",
    );
  }
  capabilities.add("messagePayloadCatchEvent");
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
  const interrupting = event.attributes.cancelActivity !== "false" && event.attributes.cancelActivity !== "0";
  if (definition === "timerEventDefinition") {
    const timer = event.children.find(({ name }) => name === "timerEventDefinition");
    const recurring = timer !== undefined && hasDirectChild(timer, "timeCycle");
    if (recurring) {
      if (interrupting || attachedElement === undefined || hasDirectChild(attachedElement, "multiInstanceLoopCharacteristics")) {
        throw new TypeError("unclassified executable BPMN recurring boundary Timer host");
      }
      switch (attachedTo) {
        case "userTask":
          capabilities.add("recurringUserTaskBoundaryTimerEvent");
          return;
        case "subProcess":
          capabilities.add("recurringSubProcessBoundaryTimerEvent");
          return;
        default:
          throw new TypeError("unclassified executable BPMN recurring boundary Timer host");
      }
    }
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
    if (attachedTo === "subProcess") {
      capabilities.add(interrupting
        ? "interruptingSubProcessBoundaryTimerEvent"
        : "nonInterruptingSubProcessBoundaryTimerEvent");
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
  if (definition === "messageEventDefinition" && attachedTo === "userTask") {
    capabilities.add(interrupting
      ? "interruptingUserTaskBoundaryMessageEvent"
      : "nonInterruptingUserTaskBoundaryMessageEvent");
    return;
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

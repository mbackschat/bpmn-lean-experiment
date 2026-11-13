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

/** `camunda:in`/`camunda:out` are classified by local name, as every other marker here. */
function hasCallVariableMapping(element: XmlElement): boolean {
  return element.children.some((child) => child.name === "extensionElements" &&
    child.children.some(({ name }) => name === "in" || name === "out"));
}

/** The kernel's admission decision for one source, supplied by the caller so this module stays free of package code. */
export type SourceAdmission = Readonly<{ status: "accepted" } | { status: "rejected"; refusal: string }>;

export type SourceClaim =
  | Readonly<{ kind: "capabilities"; capabilities: ReadonlyArray<MvpBpmnCapabilityId> }>
  | Readonly<{ kind: "restriction"; refusalCode: string }>;

/**
 * What a claiming source claims, decided by the kernel and never declared: an admitted source claims the capabilities
 * the detector reads from it, and a refused source claims the restriction its refusal code names, so the detector never
 * reads a model the kernel refuses.
 */
export function claimOfSource(xml: string, admission: SourceAdmission): SourceClaim {
  return admission.status === "accepted"
    ? { kind: "capabilities", capabilities: detectExecutableBpmnCapabilities(xml) }
    : { kind: "restriction", refusalCode: admission.refusal };
}

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
  const transactions = transactionContext(elements, elementsById, parents);
  const compensation = compensationContext(elements, elementsById, parents, transactions, capabilities);

  for (const element of elements) {
    if (compensation.dormant.has(element)) continue;
    switch (element.name) {
      case "process":
        capabilities.add("process");
        break;
      case "sequenceFlow":
        capabilities.add("sequenceFlow");
        break;
      case "startEvent": {
        // An Event Sub-Process's start is its trigger, claimed with the Event Sub-Process and never as a Process start.
        const owner = parents.get(element);
        if (owner?.name !== "subProcess" || !isTrue(owner.attributes.triggeredByEvent)) addStartCapability(element, capabilities);
        break;
      }
      case "endEvent":
        if (eventDefinition(element) === "cancelEventDefinition") capabilities.add("cancelEndEvent");
        else addEndCapability(element, capabilities);
        break;
      case "userTask":
        addUserTaskCapability(element, capabilities);
        break;
      case "serviceTask":
        addLoopCapability(element, capabilities);
        capabilities.add(compensation.handlers.has(element) ? "compensationHandlerServiceTask" : "serviceTask");
        break;
      case "receiveTask":
        addLoopCapability(element, capabilities);
        capabilities.add("receiveTask");
        break;
      case "sendTask":
        addLoopCapability(element, capabilities);
        capabilities.add("sendTask");
        break;
      case "task":
        addLoopCapability(element, capabilities);
        // Only the configured-Task extension carries a task definition; a plain Task is the pass-through account.
        capabilities.add(hasDirectChild(element, "extensionElements") ? "configuredTask" : "abstractTask");
        break;
      case "manualTask":
        addLoopCapability(element, capabilities);
        capabilities.add("manualTask");
        break;
      case "callActivity":
        addLoopCapability(element, capabilities);
        capabilities.add(hasDirectChild(element, "ioSpecification") ? "callActivityScalarData"
          : hasCallVariableMapping(element) ? "callActivityVariableMappings" : "callActivity");
        break;
      case "subProcess":
        addLoopCapability(element, capabilities);
        capabilities.add(isTrue(element.attributes.triggeredByEvent) ? "eventSubProcess" : "embeddedSubProcess");
        break;
      case "transaction":
        addLoopCapability(element, capabilities);
        capabilities.add("transaction");
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
        if (eventDefinition(element) === null) {
          capabilities.add("noneIntermediateThrowEvent");
          break;
        }
        if (eventDefinition(element) === "linkEventDefinition") {
          capabilities.add("linkIntermediateEventPair");
          break;
        }
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
        if (eventDefinition(element) === "cancelEventDefinition") {
          capabilities.add("transactionCancelBoundaryEvent");
          break;
        }
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

/** TXC's direct-child/parent roles classify coverage; the source validator owns complete graph admission. */
function transactionContext(
  elements: ReadonlyArray<XmlElement>,
  elementsById: ReadonlyMap<string, XmlElement>,
  parents: ReadonlyMap<XmlElement, XmlElement>,
): ReadonlySet<XmlElement> {
  const transactions = new Set(elements.filter(({ name }) => name === "transaction"));
  const owners = new Set<XmlElement>();
  const ends = new Map<XmlElement, number>();
  const boundaries = new Map<XmlElement, number>();
  for (const transaction of transactions) {
    const owner = parents.get(transaction);
    if (owner?.name !== "process" || owners.has(owner) || isTrue(transaction.attributes.triggeredByEvent) ||
        (transaction.attributes.method !== undefined && transaction.attributes.method !== "##Compensate")) {
      throw new TypeError("unclassified executable BPMN Transaction context or method");
    }
    owners.add(owner);
  }
  for (const element of elements) {
    if (!hasDirectChild(element, "cancelEventDefinition")) continue;
    eventDefinition(element);
    const owner = parents.get(element);
    switch (element.name) {
      case "endEvent":
        if (owner === undefined || !transactions.has(owner)) {
          throw new TypeError("unclassified executable BPMN Cancel End owner");
        }
        ends.set(owner, (ends.get(owner) ?? 0) + 1);
        break;
      case "boundaryEvent": {
        const host = elementsById.get(element.attributes.attachedToRef ?? "");
        if (host === undefined || !transactions.has(host) || owner?.name !== "process" || parents.get(host) !== owner ||
            (element.attributes.cancelActivity !== undefined && !isTrue(element.attributes.cancelActivity))) {
          throw new TypeError("unclassified executable BPMN Cancel Boundary attachment or interruption");
        }
        boundaries.set(host, (boundaries.get(host) ?? 0) + 1);
        break;
      }
      default:
        throw new TypeError("unclassified executable BPMN Cancel Event context");
    }
  }
  for (const transaction of transactions) {
    if (ends.get(transaction) !== 1) throw new TypeError("unclassified executable BPMN Cancel End cardinality");
    if (boundaries.get(transaction) !== 1) throw new TypeError("unclassified executable BPMN Cancel Boundary cardinality");
  }
  return transactions;
}

function compensationContext(
  elements: ReadonlyArray<XmlElement>,
  elementsById: ReadonlyMap<string, XmlElement>,
  parents: ReadonlyMap<XmlElement, XmlElement>,
  transactions: ReadonlySet<XmlElement>,
  capabilities: Set<MvpBpmnCapabilityId>,
): Readonly<{ dormant: ReadonlySet<XmlElement>; handlers: ReadonlySet<XmlElement>; boundaries: ReadonlySet<XmlElement> }> {
  const dormant = new Set<XmlElement>();
  const handlers = new Set<XmlElement>();
  const boundaries = new Set<XmlElement>();
  for (const element of elements) {
    if (element.name !== "subProcess" || !isTrue(element.attributes.triggeredByEvent)) continue;
    const body = firstProfileCompensationHandlerBody(element, parents);
    // Every other Event Sub-Process, a Compensation one included, is an ordinary one the element loop claims.
    if (body === undefined) continue;
    for (const child of body) dormant.add(child);
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
    if (owner === undefined || (owner.name !== "process" && !transactions.has(owner)) ||
        host?.name !== "userTask" || parents.get(host) !== owner ||
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

/**
 * The body of the first-profile Compensation Event Sub-Process, whose one compensation-effect Service Task claims the
 * handler capability in place of an ordinary Service Task: a Compensation start, that Task and a None End, and no other
 * executable element, directly inside a Sub-Process at Process level. `undefined` for any other Event Sub-Process.
 */
function firstProfileCompensationHandlerBody(
  element: XmlElement,
  parents: ReadonlyMap<XmlElement, XmlElement>,
): ReadonlyArray<XmlElement> | undefined {
  const owner = parents.get(element);
  const starts = element.children.filter(({ name }) => name === "startEvent");
  const tasks = element.children.filter(({ name }) => name === "serviceTask");
  const ends = element.children.filter(({ name }) => name === "endEvent");
  const [start, task, end] = [starts[0], tasks[0], ends[0]];
  if (owner?.name !== "subProcess" || isTrue(owner.attributes.triggeredByEvent) || parents.get(owner)?.name !== "process" ||
      isLooping(element) || starts.length !== 1 || start === undefined || eventDefinition(start) !== "compensateEventDefinition" ||
      tasks.length !== 1 || task === undefined || !isCompensationEffect(task) || isLooping(task) ||
      ends.length !== 1 || end === undefined || eventDefinition(end) !== null) {
    return undefined;
  }
  const body = flattenElements(element.children);
  return body.every((child) => child === start || child === task || child === end ||
      (child.name !== "subProcess" && !isExecutableNodeName(child.name)))
    ? body
    : undefined;
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
  addLoopCapability(task, capabilities);
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
    case "linkEventDefinition":
      capabilities.add("linkIntermediateEventPair");
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

function isLooping(activity: XmlElement): boolean {
  return hasDirectChild(activity, "standardLoopCharacteristics") ||
    hasDirectChild(activity, "multiInstanceLoopCharacteristics");
}

function rejectLoopVariant(activity: XmlElement): void {
  if (isLooping(activity)) throw new TypeError(`unclassified executable BPMN loop variant on ${activity.name}`);
}

/**
 * A Multi-Instance loop claims its capability beside its host's, whatever its mode, generation or condition: which of
 * them the host admits is the kernel's admission. A standard loop has no capability, as the reader refuses it.
 */
function addLoopCapability(activity: XmlElement, capabilities: Set<MvpBpmnCapabilityId>): void {
  if (hasDirectChild(activity, "standardLoopCharacteristics")) {
    throw new TypeError(`unclassified executable BPMN loop variant on ${activity.name}`);
  }
  if (hasDirectChild(activity, "multiInstanceLoopCharacteristics")) capabilities.add("multiInstanceActivity");
}

function isExecutableNodeName(name: string): boolean {
  return name.endsWith("Task") || name.endsWith("Gateway") || name.endsWith("Event") || name === "transaction";
}

function rejectUnknownExecutableElement(element: XmlElement): void {
  if (isExecutableNodeName(element.name)) throw new TypeError(`unclassified executable BPMN element ${element.name}`);
}

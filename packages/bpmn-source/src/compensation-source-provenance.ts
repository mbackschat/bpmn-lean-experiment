/**
 * Reads only the parser-graph facts that identify the reviewed Compensation subjects and edges.
 *
 * The result deliberately stops before checked-source or IL meaning: handler bodies, effects,
 * restored bindings, limits, profile identity, and hosting policy require their own reviewed source
 * account. References are therefore decided exclusively by imported object identity, while IDs are
 * copied only after that structure has been established.
 */
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";

import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import {
  asElement,
  asElementArray,
  readId,
} from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";

const bpmnTypes = metamodelManifest.compilerProjection;

export type CompensationBoundaryHandlerProvenance = Readonly<{
  activityElementId: string;
  boundaryEventElementId: string;
  compensationActivityElementId: string;
}>;

export type CompensationEventSubProcessProvenance = Readonly<{
  parentElementId: string;
  handlerElementId: string;
}>;

export type CompensationDependencyProvenance = Readonly<{
  predecessorElementId: string;
  successorElementId: string;
}>;

export type CompensationSourceProvenance = Readonly<{
  processElementId: string;
  globalThrowElementId: string;
  boundaryHandlers: ReadonlyArray<CompensationBoundaryHandlerProvenance>;
  eventSubProcessHandlers: ReadonlyArray<CompensationEventSubProcessProvenance>;
  dependencies: ReadonlyArray<CompensationDependencyProvenance>;
}>;

type ContainedElement = Readonly<{
  element: ElementRecord;
  parent: ElementRecord;
}>;

type ContainmentGraph = Readonly<{
  entries: ReadonlyArray<ContainedElement>;
  parentByElement: ReadonlyMap<ElementRecord, ElementRecord>;
  rootElements: ReadonlySet<ElementRecord>;
  sequenceFlows: ReadonlyArray<ElementRecord>;
}>;

type BoundaryHandler = Readonly<{
  activity: ElementRecord;
  activityElementId: string;
  boundary: ElementRecord;
  boundaryEventElementId: string;
  handler: ElementRecord;
  compensationActivityElementId: string;
}>;

type EventSubProcessHandler = Readonly<{
  parent: ElementRecord;
  parentElementId: string;
  handler: ElementRecord;
  handlerElementId: string;
}>;

const enum CompensationDefinitionStatus {
  Other = "other",
  Compensation = "compensation",
  Malformed = "malformed",
}

type CompensationDefinitionClassification =
  | Readonly<{ status: CompensationDefinitionStatus.Other }>
  | Readonly<{
    status: CompensationDefinitionStatus.Compensation;
    definition: ElementRecord;
  }>
  | Readonly<{ status: CompensationDefinitionStatus.Malformed }>;

/** Returns structural provenance only when every deciding shape is exact and unambiguous. */
export function readCompensationSourceProvenance(
  process: ElementRecord,
): CompensationSourceProvenance | undefined {
  const processElementId = canonicalId(process);
  const graph = collectContainmentGraph(process);
  if (
    process.$type !== bpmnTypes.processType ||
    processElementId === undefined ||
    graph === undefined ||
    !sequenceFlowsAreResolvedInTheirContainingScopes(graph)
  ) {
    return undefined;
  }

  const globalThrow = readGlobalThrow(graph);
  const boundaryHandlers = readBoundaryHandlers(process, graph);
  const eventSubProcessHandlers = readEventSubProcessHandlers(process, graph);
  if (
    globalThrow === undefined ||
    boundaryHandlers === undefined ||
    eventSubProcessHandlers === undefined ||
    !rolesAreUnambiguous(
      globalThrow.element,
      boundaryHandlers,
      eventSubProcessHandlers,
    )
  ) {
    return undefined;
  }

  const forbiddenFlowElements = new Set<ElementRecord>([
    ...boundaryHandlers.flatMap(({ boundary, handler }) => [boundary, handler]),
    ...eventSubProcessHandlers.map(({ handler }) => handler),
  ]);
  if (
    graph.sequenceFlows.some((flow) => {
      const source = asElement(flow.sourceRef);
      const target = asElement(flow.targetRef);
      return source === undefined ||
        target === undefined ||
        forbiddenFlowElements.has(source) ||
        forbiddenFlowElements.has(target);
    })
  ) {
    return undefined;
  }

  const selectedSubjects = new Map<ElementRecord, string>([
    ...boundaryHandlers.map(({ activity, activityElementId }) =>
      [activity, activityElementId] as const
    ),
    ...eventSubProcessHandlers.map(({ parent, parentElementId }) =>
      [parent, parentElementId] as const
    ),
  ]);
  const dependencies = readDirectDependencies(graph, selectedSubjects);
  if (dependencies === undefined) {
    return undefined;
  }

  const boundaryResult = boundaryHandlers
    .map(({ activityElementId, boundaryEventElementId, compensationActivityElementId }) =>
      Object.freeze({
        activityElementId,
        boundaryEventElementId,
        compensationActivityElementId,
      })
    )
    .sort(compareBoundaryHandlers);
  const eventSubProcessResult = eventSubProcessHandlers
    .map(({ parentElementId, handlerElementId }) =>
      Object.freeze({ parentElementId, handlerElementId })
    )
    .sort(compareEventSubProcessHandlers);

  return Object.freeze({
    processElementId,
    globalThrowElementId: globalThrow.id,
    boundaryHandlers: Object.freeze(boundaryResult),
    eventSubProcessHandlers: Object.freeze(eventSubProcessResult),
    dependencies: Object.freeze(dependencies),
  });
}

function collectContainmentGraph(
  process: ElementRecord,
): ContainmentGraph | undefined {
  const rootElements = asElementArray(process.flowElements);
  if (rootElements === undefined) {
    return undefined;
  }
  const entries: ContainedElement[] = [];
  const parentByElement = new Map<ElementRecord, ElementRecord>();
  const sequenceFlows: ElementRecord[] = [];
  const seen = new Set<ElementRecord>();

  function visit(parent: ElementRecord, elements: ReadonlyArray<ElementRecord>): boolean {
    for (const element of elements) {
      if (seen.has(element)) {
        return false;
      }
      seen.add(element);
      entries.push({ element, parent });
      parentByElement.set(element, parent);
      if (element.$type === bpmnTypes.sequenceFlowType) {
        sequenceFlows.push(element);
      }
      if (element.$type !== bpmnTypes.subProcessType) {
        continue;
      }
      const children = optionalElementArray(element.flowElements);
      if (children === undefined || !visit(element, children)) {
        return false;
      }
    }
    return true;
  }

  if (!visit(process, rootElements)) {
    return undefined;
  }
  return {
    entries,
    parentByElement,
    rootElements: new Set(rootElements),
    sequenceFlows,
  };
}

function sequenceFlowsAreResolvedInTheirContainingScopes(
  graph: ContainmentGraph,
): boolean {
  const seenIds = new Set<string>();
  return graph.sequenceFlows.every((flow) => {
    const id = canonicalId(flow);
    const source = asElement(flow.sourceRef);
    const target = asElement(flow.targetRef);
    const parent = graph.parentByElement.get(flow);
    if (
      id === undefined ||
      seenIds.has(id) ||
      source === undefined ||
      target === undefined ||
      parent === undefined ||
      graph.parentByElement.get(source) !== parent ||
      graph.parentByElement.get(target) !== parent
    ) {
      return false;
    }
    seenIds.add(id);
    return true;
  });
}

function readGlobalThrow(
  graph: ContainmentGraph,
): Readonly<{ element: ElementRecord; id: string }> | undefined {
  const candidates: Array<Readonly<{ element: ElementRecord; id: string }>> = [];
  for (const { element, parent } of graph.entries) {
    if (element.$type !== bpmnTypes.intermediateThrowEventType) {
      continue;
    }
    const classification = compensationDefinition(element);
    if (classification.status === CompensationDefinitionStatus.Malformed) {
      return undefined;
    }
    if (classification.status !== CompensationDefinitionStatus.Compensation) {
      continue;
    }
    const id = canonicalId(element);
    if (
      parent.$type !== bpmnTypes.processType ||
      !graph.rootElements.has(element) ||
      id === undefined ||
      classification.definition.waitForCompletion !== true ||
      classification.definition.activityRef !== undefined
    ) {
      return undefined;
    }
    candidates.push({ element, id });
  }
  const candidate = candidates[0];
  if (candidates.length !== 1 || candidate === undefined) {
    return undefined;
  }
  const incoming = graph.sequenceFlows.filter(
    (flow) => flow.targetRef === candidate.element,
  );
  const outgoing = graph.sequenceFlows.filter(
    (flow) => flow.sourceRef === candidate.element,
  );
  return incoming.length === 1 &&
      outgoing.length === 1 &&
      incoming[0] !== outgoing[0]
    ? candidate
    : undefined;
}

function readBoundaryHandlers(
  process: ElementRecord,
  graph: ContainmentGraph,
): ReadonlyArray<BoundaryHandler> | undefined {
  const artifacts = optionalElementArray(process.artifacts);
  if (artifacts === undefined) {
    return undefined;
  }
  const associations = artifacts.filter(
    (artifact) => artifact.$type === bpmnTypes.associationType,
  );
  const handlers: BoundaryHandler[] = [];
  for (const { element, parent } of graph.entries) {
    if (element.$type !== bpmnTypes.boundaryEventType) {
      continue;
    }
    const classification = compensationDefinition(element);
    if (classification.status === CompensationDefinitionStatus.Malformed) {
      return undefined;
    }
    if (classification.status !== CompensationDefinitionStatus.Compensation) {
      continue;
    }
    const boundaryEventElementId = canonicalId(element);
    const activity = asElement(element.attachedToRef);
    const matchingAssociations = associations.filter(
      (association) => association.sourceRef === element,
    );
    const association = matchingAssociations[0];
    const handler = asElement(association?.targetRef);
    const activityElementId = activity === undefined
      ? undefined
      : canonicalId(activity);
    const compensationActivityElementId = handler === undefined
      ? undefined
      : canonicalId(handler);
    if (
      parent !== process ||
      !graph.rootElements.has(element) ||
      boundaryEventElementId === undefined ||
      activity === undefined ||
      !graph.rootElements.has(activity) ||
      !isBpmnActivity(activity) ||
      activityElementId === undefined ||
      matchingAssociations.length !== 1 ||
      association === undefined ||
      handler === undefined ||
      !graph.rootElements.has(handler) ||
      !isBpmnActivity(handler) ||
      handler === activity ||
      compensationActivityElementId === undefined ||
      handler.isForCompensation !== true
    ) {
      return undefined;
    }
    handlers.push({
      activity,
      activityElementId,
      boundary: element,
      boundaryEventElementId,
      handler,
      compensationActivityElementId,
    });
  }
  return handlers;
}

function readEventSubProcessHandlers(
  process: ElementRecord,
  graph: ContainmentGraph,
): ReadonlyArray<EventSubProcessHandler> | undefined {
  const handlers: EventSubProcessHandler[] = [];
  const containers = [
    process,
    ...graph.entries
      .map(({ element }) => element)
      .filter((element) => element.$type === bpmnTypes.subProcessType),
  ];
  for (const parent of containers) {
    const children = optionalElementArray(parent.flowElements);
    if (children === undefined) {
      return undefined;
    }
    for (const child of children) {
      if (child.$type !== bpmnTypes.subProcessType) {
        if (
          child.$type === bpmnTypes.startEventType &&
          compensationDefinition(child).status !== CompensationDefinitionStatus.Other &&
          (parent.$type !== bpmnTypes.subProcessType ||
            parent.triggeredByEvent !== true)
        ) {
          return undefined;
        }
        continue;
      }
      const handlerChildren = optionalElementArray(child.flowElements);
      if (handlerChildren === undefined) {
        return undefined;
      }
      const starts = handlerChildren.filter(
        (element) => element.$type === bpmnTypes.startEventType,
      );
      const classifications = starts.map(compensationDefinition);
      if (
        classifications.some(
          ({ status }) => status === CompensationDefinitionStatus.Malformed,
        )
      ) {
        return undefined;
      }
      const compensationStarts = classifications.filter(
        ({ status }) => status === CompensationDefinitionStatus.Compensation,
      );
      if (child.triggeredByEvent !== true) {
        if (compensationStarts.length > 0) {
          return undefined;
        }
        continue;
      }
      if (compensationStarts.length === 0) {
        continue;
      }
      const parentElementId = canonicalId(parent);
      const handlerElementId = canonicalId(child);
      if (
        starts.length !== 1 ||
        compensationStarts.length !== 1 ||
        parentElementId === undefined ||
        handlerElementId === undefined
      ) {
        return undefined;
      }
      handlers.push({
        parent,
        parentElementId,
        handler: child,
        handlerElementId,
      });
    }
  }
  return handlers;
}

function rolesAreUnambiguous(
  globalThrow: ElementRecord,
  boundaryHandlers: ReadonlyArray<BoundaryHandler>,
  eventSubProcessHandlers: ReadonlyArray<EventSubProcessHandler>,
): boolean {
  const globalThrowId = canonicalId(globalThrow);
  const uniqueElements = [
    globalThrow,
    ...boundaryHandlers.flatMap(({ activity, boundary, handler }) => [
      activity,
      boundary,
      handler,
    ]),
    ...eventSubProcessHandlers.flatMap(({ parent, handler }) => [parent, handler]),
  ];
  const uniqueIds = [
    globalThrowId,
    ...boundaryHandlers.flatMap(
      ({ activityElementId, boundaryEventElementId, compensationActivityElementId }) => [
        activityElementId,
        boundaryEventElementId,
        compensationActivityElementId,
      ],
    ),
    ...eventSubProcessHandlers.flatMap(({ parentElementId, handlerElementId }) => [
      parentElementId,
      handlerElementId,
    ]),
  ];
  return globalThrowId !== undefined &&
    new Set(uniqueElements).size === uniqueElements.length &&
    new Set(uniqueIds).size === uniqueIds.length;
}

function readDirectDependencies(
  graph: ContainmentGraph,
  selectedSubjects: ReadonlyMap<ElementRecord, string>,
): CompensationDependencyProvenance[] | undefined {
  const dependencies: CompensationDependencyProvenance[] = [];
  const seen = new Set<string>();
  for (const flow of graph.sequenceFlows) {
    const source = asElement(flow.sourceRef);
    const target = asElement(flow.targetRef);
    const predecessorElementId = source === undefined
      ? undefined
      : selectedSubjects.get(source);
    const successorElementId = target === undefined
      ? undefined
      : selectedSubjects.get(target);
    if (predecessorElementId === undefined || successorElementId === undefined) {
      continue;
    }
    const key = JSON.stringify([predecessorElementId, successorElementId]);
    if (seen.has(key)) {
      return undefined;
    }
    seen.add(key);
    dependencies.push(Object.freeze({
      predecessorElementId,
      successorElementId,
    }));
  }
  return dependencies.sort(compareDependencies);
}

function compensationDefinition(
  event: ElementRecord,
): CompensationDefinitionClassification {
  const inline = optionalElementArray(event.eventDefinitions);
  const referenced = optionalElementArray(event.eventDefinitionRef);
  if (inline === undefined || referenced === undefined) {
    return { status: CompensationDefinitionStatus.Malformed };
  }
  const definitions = [...inline, ...referenced];
  const compensationDefinitions = definitions.filter(
    (definition) => definition.$type === bpmnTypes.compensateEventDefinitionType,
  );
  if (compensationDefinitions.length === 0) {
    return { status: CompensationDefinitionStatus.Other };
  }
  const definition = compensationDefinitions[0];
  return definitions.length === 1 &&
      compensationDefinitions.length === 1 &&
      definition !== undefined
    ? { status: CompensationDefinitionStatus.Compensation, definition }
    : { status: CompensationDefinitionStatus.Malformed };
}

function optionalElementArray(
  value: unknown,
): ReadonlyArray<ElementRecord> | undefined {
  return value === undefined ? [] : asElementArray(value);
}

function canonicalId(element: ElementRecord): string | undefined {
  const id = readId(element);
  return id !== undefined && isWellFormedWireString(id) ? id : undefined;
}

function isBpmnActivity(element: ElementRecord): boolean {
  const instanceOf = element.$instanceOf;
  if (typeof instanceOf !== "function") {
    return false;
  }
  try {
    return instanceOf.call(element, "bpmn:Activity") === true;
  } catch {
    return false;
  }
}

function compareBoundaryHandlers(
  left: CompensationBoundaryHandlerProvenance,
  right: CompensationBoundaryHandlerProvenance,
): number {
  return compareCanonicalStrings(left.activityElementId, right.activityElementId) ||
    compareCanonicalStrings(left.boundaryEventElementId, right.boundaryEventElementId) ||
    compareCanonicalStrings(
      left.compensationActivityElementId,
      right.compensationActivityElementId,
    );
}

function compareEventSubProcessHandlers(
  left: CompensationEventSubProcessProvenance,
  right: CompensationEventSubProcessProvenance,
): number {
  return compareCanonicalStrings(left.parentElementId, right.parentElementId) ||
    compareCanonicalStrings(left.handlerElementId, right.handlerElementId);
}

function compareDependencies(
  left: CompensationDependencyProvenance,
  right: CompensationDependencyProvenance,
): number {
  return compareCanonicalStrings(
    left.predecessorElementId,
    right.predecessorElementId,
  ) || compareCanonicalStrings(left.successorElementId, right.successorElementId);
}

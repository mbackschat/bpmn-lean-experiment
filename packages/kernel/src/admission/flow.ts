/**
 * Admission of starts, gateways, Links and flow references, transcribed from `Kernel/Admission/Flow.lean`. A refusal
 * carries a stable code. A start's trigger is admitted by `admission/subscriptions.ts`.
 */
import {
  EventGatewayInstantiation,
  GatewayKindTag,
  assertNever,
  distinctCount,
  elementActivity,
  elementBeginsImplicitly,
  elementEnvelope,
  elementEvent,
  elementGateway,
  elementHeader,
  elementIncoming,
  elementOutgoing,
  elementStart,
  eventPayloadCatch,
  eventPayloadLinkCatch,
  eventPayloadLinkThrow,
  programBoundary,
  programChildren,
  programElement,
  programFlow,
  programSiblings,
  programTarget,
  triggerTimer,
  workIsService,
  workIsUser,
  workReceive,
  type Boundary,
  type Element,
  type ElementId,
  type EventPayload,
  type Flow,
  type FlowId,
  type GatewayPayload,
  type Header,
  type Program,
  type StartPayload,
} from "../il/types.js";

function distinct<T>(list: readonly T[]): boolean {
  return distinctCount(list) === list.length;
}

// References.

/**
 * Where an element or boundary sits: its parent Scope, and for a process-level element the called process holding it by
 * its position among the carried processes (`null` for the root process), since one key names every carried version of
 * a process (PC-SCOPE-03). A boundary sits where its host does.
 */
function place(program: Program, id: ElementId): string | null {
  const located = (element: Element): string => {
    const header = elementHeader(element);
    const position = header.parent === null ? program.processes.findIndex((candidate) => candidate.children.includes(header.id)) : -1;
    return JSON.stringify([header.parent, position === -1 ? null : position]);
  };
  const element = programElement(program, id);
  if (element !== null) return located(element);
  const boundary = programBoundary(program, id);
  return boundary === null ? null : located(boundary[0]);
}

/** The flows that leave an element or boundary by its own lists. */
export function leaving(program: Program, id: ElementId): readonly FlowId[] {
  const element = programElement(program, id);
  if (element !== null) return elementOutgoing(element);
  return programBoundary(program, id)?.[1].outgoing ?? [];
}

/** A flow joins two endpoints of one place, enters no start, and is listed by both. */
function flowReference(program: Program, flow: Flow): boolean {
  const source = place(program, flow.source);
  const target = programElement(program, flow.target);
  return source !== null && target !== null && source === place(program, flow.target) && elementStart(target) === null &&
    leaving(program, flow.source).includes(flow.id) && elementIncoming(target).includes(flow.id);
}

/** An element's own flow lists name flows that end at, or leave, that element; a boundary's flows leave it. */
function listReference(program: Program, element: Element): boolean {
  const id = elementHeader(element).id;
  const ends = (flow: FlowId): boolean => programFlow(program, flow)?.target === id;
  const leaves = (source: ElementId) => (flow: FlowId): boolean => programFlow(program, flow)?.source === source;
  const incoming = elementIncoming(element);
  const outgoing = elementOutgoing(element);
  const envelope = elementEnvelope(element);
  return distinct(incoming) && distinct(outgoing) && incoming.every(ends) && outgoing.every(leaves(id)) &&
    (envelope === null ||
      ((envelope.defaultFlow === null || outgoing.includes(envelope.defaultFlow)) &&
        envelope.boundaries.every((boundary) => distinct(boundary.outgoing) && boundary.outgoing.every(leaves(boundary.id)))));
}

/**
 * What the admissions read of a Gateway's kind: the candidates and default of a conditional Gateway, whether one
 * activation may leave on several flows at once, and whether it waits for an event.
 */
export type Routing = Readonly<{
  conditional: Readonly<{ candidates: readonly FlowId[]; defaultFlow: FlowId | null }> | null;
  concurrent: boolean;
  waits: boolean;
}>;

export function routing(payload: GatewayPayload): Routing {
  const kind = payload.kind;
  switch (kind.tag) {
    case GatewayKindTag.Exclusive:
      return { conditional: { candidates: kind.candidates, defaultFlow: kind.default }, concurrent: false, waits: false };
    case GatewayKindTag.Inclusive:
      return { conditional: { candidates: kind.candidates, defaultFlow: kind.default }, concurrent: true, waits: false };
    case GatewayKindTag.Parallel:
      return { conditional: null, concurrent: true, waits: false };
    case GatewayKindTag.EventBased:
      return { conditional: null, concurrent: false, waits: true };
  }
  return assertNever(kind);
}

/** A gateway's candidates and default are its own outgoing flows, the default not a candidate. */
function gatewayReference(payload: GatewayPayload): boolean {
  const conditional = routing(payload).conditional;
  if (conditional === null) return true;
  const { candidates, defaultFlow } = conditional;
  return candidates.every((flow) => payload.outgoing.includes(flow)) && distinct(candidates) &&
    (defaultFlow === null || (payload.outgoing.includes(defaultFlow) && !candidates.includes(defaultFlow)));
}

/**
 * Every identifier names exactly one element, boundary or flow, and every flow reference resolves where it is used: a
 * dangling or misplaced reference would be read as no reference at all. Scope membership is `scopes.ts` `membership`.
 */
export function references(program: Program): string | null {
  const elements = program.elements.map((element) => elementHeader(element).id);
  const boundaries = program.elements.flatMap((element) => (elementEnvelope(element)?.boundaries ?? []).map((boundary) => boundary.id));
  const resolved = distinct([...elements, ...boundaries]) && distinct(program.flows.map((flow) => flow.id)) &&
    program.flows.every((flow) => flowReference(program, flow)) &&
    program.elements.every((element) => listReference(program, element)) &&
    program.elements.every((element) => {
      const gateway = elementGateway(element);
      return gateway === null || gatewayReference(gateway[1]);
    });
  return resolved ? null : "il.reference";
}

// Gateways.

function conditioned(program: Program, flow: FlowId): boolean {
  return (programFlow(program, flow)?.condition ?? null) !== null;
}

/**
 * An Event-Based Gateway's arms are catch Events. BPMN 2.0.2 §10.6.6 also admits a Receive Task, which pinned CIB refuses
 * at parse like every target that is not an intermediate catch (`BpmnParse#parseEventBasedGateway`, :2139), so any other
 * arm is `receiveArm` (PC-CF-05). §10.6.6 lists Link among the invalid triggers and CIB refuses a catching Link after the
 * gateway (`BpmnParse:1546`), so a Link arm is `linkArm` (PC-CF-05, PC-BASIC-02).
 */
function eventBasedArms(program: Program, payload: GatewayPayload): string | null {
  const arm = (flow: FlowId): EventPayload | null => {
    const target = programTarget(program, flow);
    const element = target === null ? null : programElement(program, target);
    const event = element === null ? null : elementEvent(element);
    return event === null ? null : event[1];
  };
  if (payload.outgoing.some((flow) => {
    const event = arm(flow);
    return event !== null && eventPayloadLinkCatch(event) !== null;
  })) return "gateway.eventBased.linkArm";
  return payload.outgoing.every((flow) => {
    const event = arm(flow);
    return event !== null && eventPayloadCatch(event) !== null;
  }) ? null : "gateway.eventBased.receiveArm";
}

/**
 * A diverging Exclusive Gateway routes by its conditions and its default (BPMN 2.0.2 §10.6.2, Table 13.2). A sole
 * unconditioned non-default flow is a candidate whose condition always holds, tried in declaration order like the others
 * (the reading CIB-INT-0005 gives an Inclusive output, which CIB's `ExclusiveGatewayActivityBehavior#doLeave` applies);
 * CIB refuses to parse a second unconditioned flow, an unconditioned flow beside a default, and a sole conditioned flow
 * without a default (`BpmnParse#validateExclusiveGateway`), and so one without an outgoing flow. A converging gateway's
 * one unconditioned flow is its merge (PC-CF-02).
 */
function exclusive(program: Program, payload: GatewayPayload, candidates: readonly FlowId[], defaultFlow: FlowId | null): string | null {
  const unconditioned = candidates.filter((flow) => !conditioned(program, flow)).length;
  if (payload.outgoing.length === 0) return "gateway.exclusive.noOutgoingFlow";
  if (payload.outgoing.length >= 2 && (unconditioned >= 2 || (defaultFlow !== null && unconditioned >= 1))) {
    return "gateway.exclusive.unconditionedFlow";
  }
  if (defaultFlow === null && payload.outgoing.length === 1 && candidates.every((flow) => conditioned(program, flow)) &&
    candidates.length > 0) return "gateway.exclusive.singleConditionWithoutDefault";
  return null;
}

/**
 * An Inclusive Gateway joins by `feature/flow.ts`'s reachability rule wherever it converges, and a split that selects
 * nothing rolls back (CIB-INT-0012). One without an outgoing flow would consume every token it takes, where CIB deploys
 * it and rolls back each activation (`InclusiveGatewayActivityBehavior#execute`, `stuckExecutionException`), so it is
 * refused (PC-CF-04). An instantiating Event-Based Gateway starts its Process (BPMN 2.0.2 §10.6.6), which pinned CIB
 * never reads (CIB-LIM-0008) (PC-BASIC-04).
 */
export function gateway(program: Program, payload: GatewayPayload): string | null {
  const kind = payload.kind;
  switch (kind.tag) {
    case GatewayKindTag.Exclusive:
      return exclusive(program, payload, kind.candidates, kind.default);
    case GatewayKindTag.Parallel:
      return null;
    case GatewayKindTag.Inclusive:
      return payload.outgoing.length === 0 ? "gateway.inclusive.noOutgoingFlow" : null;
    case GatewayKindTag.EventBased:
      switch (kind.instantiation) {
        case EventGatewayInstantiation.None:
          return eventBasedArms(program, payload);
        case EventGatewayInstantiation.Exclusive:
        case EventGatewayInstantiation.Parallel:
          return "gateway.eventBased.instantiate";
      }
      return assertNever(kind.instantiation);
  }
  return assertNever(kind);
}

/**
 * A condition is read on a conditional Gateway's candidates and on an Activity's or Scope's flows other than its default
 * (BPMN 2.0.2 §13.3.1). Elsewhere it is refused: BPMN gives it no meaning on a default (§10.3.1 "SHALL be ignored"), a
 * Parallel Gateway's flows (§13.4.1 "without checking any conditions"), an Event-Based Gateway's (§10.6.6 "MUST NOT") or
 * a Start Event's (§10.5.2 "MUST be set to None"), and pinned CIB evaluates it on a Start, intermediate or Boundary
 * Event's flows (`BpmnActivityBehavior#performOutgoingBehavior`), outside the admitted surface: a restriction, not a
 * reading (PC-CF-07, PC-BASIC-01).
 */
export function conditionalOutflow(program: Program, flow: Flow): string | null {
  const refused = "flow.conditionalOutflow";
  if (flow.condition === null) return null;
  const source = programElement(program, flow.source);
  if (source === null) return refused;
  const gateway = elementGateway(source);
  if (gateway !== null) return routing(gateway[1]).conditional?.candidates.includes(flow.id) === true ? null : refused;
  const envelope = elementEnvelope(source);
  return envelope === null || envelope.defaultFlow === flow.id ? refused : null;
}

// Concurrent footprints.

/** An element a token waits at for a stimulus: a User, Service or Receive Task, a catch Event or an Event-Based Gateway. */
export function awaitsStimulus(element: Element): boolean {
  const activity = elementActivity(element);
  if (activity !== null) {
    const work = activity[1].work;
    return workIsUser(work) || workIsService(work) || workReceive(work) !== null;
  }
  const event = elementEvent(element);
  if (event !== null) return eventPayloadCatch(event[1]) !== null;
  const gateway = elementGateway(element);
  return gateway !== null && routing(gateway[1]).waits;
}

/**
 * An element a branch stops at within its closure: one that awaits a stimulus, or a converging Parallel or Inclusive
 * Gateway, which joins the branches (CIB parks its execution there too).
 */
export function branchStop(element: Element): boolean {
  const gateway = elementGateway(element);
  return awaitsStimulus(element) || (gateway !== null && routing(gateway[1]).concurrent && gateway[1].incoming.length >= 2);
}

/** The elements `flows` lead to. */
export const flowTargets = (program: Program, flows: readonly FlowId[]): readonly Element[] => flows.flatMap((flow) => {
  const target = programTarget(program, flow);
  const element = target === null ? null : programElement(program, target);
  return element === null ? [] : [element];
});

/**
 * The children an occurrence of the Scope `id` begins on entry: its start Events, or, without one, the children that
 * begin implicitly (`elementBeginsImplicitly`), as `feature/scopes.ts` `implicitStart` begins them.
 */
export function enteredChildren(program: Program, id: ElementId): readonly Element[] {
  const children = programChildren(program, id);
  return children.some((child) => elementStart(child) !== null)
    ? children.filter((child) => elementStart(child) !== null)
    : children.filter(elementBeginsImplicitly);
}

/**
 * Pinned CIB parses one initial start per process, a None or Timer Start (`BpmnParse#selectInitial`), and one start per
 * Sub-Process (`BpmnParse#parseScopeStartEvent`); BPMN 2.0.2 §10.5.2 admits several, which lie outside the target
 * (PC-BASIC-01).
 */
export function startCombination(program: Program, header: Header): string | null {
  const here = place(program, header.id);
  const siblings = program.elements.flatMap((element): StartPayload[] => {
    const other = elementStart(element);
    return other !== null && place(program, other[0].id) === here ? [other[1]] : [];
  });
  const initial = (payload: StartPayload): boolean =>
    payload.subscription === null || triggerTimer(payload.subscription.trigger) !== null;
  if (header.parent !== null) return siblings.length >= 2 ? "start.subProcessCombination" : null;
  return siblings.filter(initial).length >= 2 ? "start.rootCombination" : null;
}

// Links.

/**
 * A throwing Link has exactly one catching Link of its name among its siblings: BPMN 2.0.2 §10.5.4 (Table 10.89) and
 * §10.5.5 keep a Link within one Process level and give a name one target there. A second catching Link of one name
 * anywhere in the definition is refused as a restriction CIB shares, refusing a second catch resource-wide
 * (CIB-AGR-0018); the standard scopes the name to one Process level, so two levels may each hold one. A catching Link
 * that a flow also reaches passes that token on like any intermediate Event (PC-BASIC-02).
 */
export function link(program: Program, header: Header, payload: EventPayload): string | null {
  const catches = (name: string) => (element: Element): boolean => {
    const event = elementEvent(element);
    return event !== null && eventPayloadLinkCatch(event[1]) === name;
  };
  const thrown = eventPayloadLinkThrow(payload);
  if (thrown !== null) return programSiblings(program, header).filter(catches(thrown)).length === 1 ? null : "link.catch";
  const caught = eventPayloadLinkCatch(payload);
  if (caught === null) return null;
  return program.elements.filter(catches(caught)).length >= 2 ? "link.duplicateCatch" : null;
}

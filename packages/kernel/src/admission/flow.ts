/**
 * Admission of starts, gateways, Links and flow references, transcribed from `Kernel/Admission/Flow.lean`. A refusal
 * carries a stable code. A start's trigger is admitted by `admission/subscriptions.ts`.
 */
import {
  GatewayKindTag,
  Placement,
  assertNever,
  distinctCount,
  elementActivity,
  elementEnvelope,
  elementEvent,
  elementGateway,
  elementHeader,
  elementIncoming,
  elementOutgoing,
  elementScope,
  elementStart,
  eventPayloadCatch,
  eventPayloadLinkCatch,
  eventPayloadLinkThrow,
  programBoundary,
  programChildren,
  programElement,
  programFlow,
  programTarget,
  type Element,
  type ElementId,
  type EventPayload,
  type Flow,
  type FlowId,
  type GatewayPayload,
  type Header,
  type Program,
  type StartPayload,
  type Work,
} from "../il/types.js";

/** The one entry of a list, `null` for any other length. */
function single<T>(list: readonly T[]): T | null {
  return list.length === 1 ? (list[0] ?? null) : null;
}

function distinct<T>(list: readonly T[]): boolean {
  return distinctCount(list) === list.length;
}

// References.

/**
 * Where an element or boundary sits: its parent Scope, and for a process-level element the called process holding it
 * (`null` for the root process). A boundary sits where its host does.
 */
function place(program: Program, id: ElementId): string | null {
  const located = (element: Element): string => {
    const header = elementHeader(element);
    const process = header.parent === null
      ? program.processes.find((candidate) => candidate.children.includes(header.id))?.definition.key ?? null
      : null;
    return JSON.stringify([header.parent, process]);
  };
  const element = programElement(program, id);
  if (element !== null) return located(element);
  const boundary = programBoundary(program, id);
  return boundary === null ? null : located(boundary[0]);
}

/** The flows that leave an element or boundary by its own lists. */
function leaving(program: Program, id: ElementId): readonly FlowId[] {
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
 * What the admissions read of a Gateway's kind: the candidates and default of a conditional Gateway, and whether it is
 * Inclusive or Parallel.
 */
type Routing = Readonly<{
  conditional: Readonly<{ candidates: readonly FlowId[]; defaultFlow: FlowId | null }> | null;
  inclusive: boolean;
  parallel: boolean;
}>;

function routing(payload: GatewayPayload): Routing {
  const kind = payload.kind;
  switch (kind.tag) {
    case GatewayKindTag.Exclusive:
      return { conditional: { candidates: kind.candidates, defaultFlow: kind.default }, inclusive: false, parallel: false };
    case GatewayKindTag.Inclusive:
      return { conditional: { candidates: kind.candidates, defaultFlow: kind.default }, inclusive: true, parallel: false };
    case GatewayKindTag.Parallel:
      return { conditional: null, inclusive: false, parallel: true };
    case GatewayKindTag.EventBased:
      return { conditional: null, inclusive: false, parallel: false };
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
 * dangling or misplaced reference would be read as no reference at all. Scope membership is `scopes.ts` `references`.
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

function parallel(payload: GatewayPayload): boolean {
  return routing(payload).parallel;
}

function inclusive(payload: GatewayPayload): boolean {
  return routing(payload).inclusive;
}

/**
 * An Event-Based Gateway's arms are catch Events: a Receive Task arm opens through the work feature's wait, which
 * `Hooks.armGateway` cannot name, and a catching Link has no incoming flow (BPMN 2.0.2 §10.5.5) (PC-CF-05, PC-BASIC-02).
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
 * A diverging Exclusive Gateway routes by its conditions and its default only (BPMN 2.0.2 §10.6.2, Table 13.2): an
 * unconditioned non-default flow has no reading there, which CIB takes unconditionally
 * (`BpmnParse#validateExclusiveGateway`). A sole conditioned flow without a default CIB refuses to parse. A converging
 * gateway's one unconditioned flow is its merge (PC-CF-02).
 */
function exclusive(program: Program, payload: GatewayPayload, candidates: readonly FlowId[], defaultFlow: FlowId | null): string | null {
  if (payload.outgoing.length >= 2 && candidates.some((flow) => !conditioned(program, flow))) {
    return "gateway.exclusive.unconditionedFlow";
  }
  if (defaultFlow === null && payload.outgoing.length === 1 && candidates.every((flow) => conditioned(program, flow)) &&
    candidates.length > 0) return "gateway.exclusive.singleConditionWithoutDefault";
  return null;
}

/**
 * What a branch of a structured Inclusive region may hold, as the work feature's admission classifies an Activity:
 * `true` or `false` when it may stand on a branch, `true` when it waits for work before the join, `null` otherwise.
 */
export type BranchWork = (work: Work) => boolean | null;

type Arrival = readonly [ElementId, FlowId];

/**
 * The first converging element a branch reaches from `flow`, with the flow it arrives on. Every element before it is an
 * Activity the branch admits, a Scope or an intermediate Event, each without boundaries and with one outgoing flow, or a
 * Parallel block closed by its own Parallel join; and an Activity or Scope arms every path before it converges.
 */
function reach(program: Program, work: BranchWork, fuel: number, armed: boolean, flow: FlowId): Arrival | null {
  if (fuel === 0) return null;
  const id = programTarget(program, flow);
  const element = id === null ? null : programElement(program, id);
  if (id === null || element === null) return null;
  const onward = (arms: boolean): Arrival | null => {
    const next = single(elementOutgoing(element));
    return next === null ? null : reach(program, work, fuel - 1, armed || arms, next);
  };
  const unbounded = (elementEnvelope(element)?.boundaries.length ?? 0) === 0;
  if (elementIncoming(element).length >= 2) return armed ? [id, flow] : null;
  if (!unbounded) return null;
  const activity = elementActivity(element);
  if (activity !== null) {
    const arms = work(activity[1].work);
    return arms === null ? null : onward(arms);
  }
  if (elementScope(element) !== null) return onward(true);
  const event = elementEvent(element);
  if (event !== null) return event[1].placement === Placement.Intermediate ? onward(false) : null;
  const gateway = elementGateway(element);
  if (gateway === null) return null;
  const payload = gateway[1];
  if (!parallel(payload) || payload.outgoing.length < 2) return null;
  const ends: Arrival[] = [];
  for (const branch of payload.outgoing) {
    const end = reach(program, work, fuel - 1, armed, branch);
    if (end === null) return null;
    ends.push(end);
  }
  const join = ends[0]?.[0];
  const joinElement = join === undefined ? null : programElement(program, join);
  const closing = joinElement === null ? null : elementGateway(joinElement);
  if (closing === null) return null;
  const arrivals = ends.map((end) => end[1]);
  if (!parallel(closing[1]) || !ends.every((end) => end[0] === join) || arrivals.length !== closing[1].incoming.length ||
    !closing[1].incoming.every((incoming) => arrivals.includes(incoming))) return null;
  const next = single(closing[1].outgoing);
  return next === null ? null : reach(program, work, fuel - 1, true, next);
}

/**
 * BPMN 2.0.2 §13.4.3's join rule is reviewed only for the Structured Synchronizing Merge (Table 13.3) while BPMN21-450
 * is open: a converging Inclusive Gateway is admitted only as the one-output join of a region whose Inclusive split,
 * under the same parent, reaches it on one distinct incoming flow per split output through `reach` (PC-CF-04).
 */
function inclusiveJoin(program: Program, work: BranchWork, header: Header, payload: GatewayPayload,
  candidates: readonly FlowId[], defaultFlow: FlowId | null): string | null {
  const fuel = program.elements.length + 1;
  const closes = (split: Element): boolean => {
    const gateway = elementGateway(split);
    if (gateway === null) return false;
    const [splitHeader, splitPayload] = gateway;
    if (!inclusive(splitPayload) || splitHeader.parent !== header.parent || splitPayload.incoming.length !== 1 ||
      splitPayload.outgoing.length < 2) return false;
    const ends: Arrival[] = [];
    for (const branch of splitPayload.outgoing) {
      const end = reach(program, work, fuel, false, branch);
      if (end === null) return false;
      ends.push(end);
    }
    const arrivals = ends.map((end) => end[1]);
    return ends.every((end) => end[0] === header.id) && arrivals.length === payload.incoming.length &&
      payload.incoming.every((incoming) => arrivals.includes(incoming));
  };
  if (payload.incoming.length < 2) return null;
  if (payload.outgoing.length === 1 && candidates.length === 0 && defaultFlow === null && program.elements.some(closes)) return null;
  return "gateway.inclusive.join";
}

/**
 * A diverging Inclusive Gateway whose every candidate is conditioned and which has no default may select nothing, an
 * exception BPMN 2.0.2 §10.6.3 names without a selected reading (PC-CF-04); an unconditioned candidate always holds
 * (CIB-INT-0005).
 */
function inclusiveSplit(program: Program, candidates: readonly FlowId[], defaultFlow: FlowId | null): string | null {
  return defaultFlow === null && candidates.length > 0 && candidates.every((flow) => conditioned(program, flow))
    ? "gateway.inclusive.conditionalWithoutDefault"
    : null;
}

export function gateway(program: Program, work: BranchWork, header: Header, payload: GatewayPayload): string | null {
  const kind = payload.kind;
  switch (kind.tag) {
    case GatewayKindTag.Exclusive:
      return exclusive(program, payload, kind.candidates, kind.default);
    case GatewayKindTag.Parallel:
      return null;
    case GatewayKindTag.Inclusive:
      return inclusiveSplit(program, kind.candidates, kind.default) ??
        inclusiveJoin(program, work, header, payload, kind.candidates, kind.default);
    case GatewayKindTag.EventBased:
      return eventBasedArms(program, payload);
  }
  return assertNever(kind);
}

/**
 * A condition is read only by the exclusive and inclusive gateways, on the flows they list as candidates; on any other
 * flow it would be silently ignored.
 */
export function conditionalOutflow(program: Program, flow: Flow): string | null {
  const refused = "flow.conditionalOutflow";
  if (flow.condition === null) return null;
  const source = programElement(program, flow.source);
  const gateway = source === null ? null : elementGateway(source);
  if (gateway === null) return refused;
  const conditional = routing(gateway[1]).conditional;
  return conditional !== null && conditional.candidates.includes(flow.id) ? null : refused;
}

export function start(_payload: StartPayload): string | null {
  return null;
}

// Links.

/**
 * A throwing Link has exactly one catching Link of its name among its siblings. A catching Link has no incoming flow,
 * and one name has one target in the whole definition (BPMN 2.0.2 §10.5.5, Table 10.89; CIB pairs names resource-wide,
 * CIB-AGR-0018) (PC-BASIC-02).
 */
export function link(program: Program, header: Header, payload: EventPayload): string | null {
  const catches = (name: string) => (element: Element): boolean => {
    const event = elementEvent(element);
    return event !== null && eventPayloadLinkCatch(event[1]) === name;
  };
  const thrown = eventPayloadLinkThrow(payload);
  if (thrown !== null) return programChildren(program, header.parent).filter(catches(thrown)).length === 1 ? null : "link.catch";
  const caught = eventPayloadLinkCatch(payload);
  if (caught === null) return null;
  if (payload.incoming.length > 0) return "link.catch.incoming";
  return program.elements.filter(catches(caught)).length >= 2 ? "link.duplicateCatch" : null;
}

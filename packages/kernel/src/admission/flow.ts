/**
 * Admission of starts, gateways, Links and flow references, transcribed from `Kernel/Admission/Flow.lean`. A refusal
 * carries a stable code. A start's trigger is admitted by `admission/subscriptions.ts`.
 */
import {
  BranchSchedule,
  EventGatewayInstantiation,
  ExpressionTag,
  GatewayKindTag,
  SimpleBooleanTag,
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
  triggerTimer,
  workCall,
  workIsService,
  workIsUser,
  workReceive,
  type Element,
  type ElementId,
  type EventPayload,
  type Expression,
  type Flow,
  type FlowId,
  type GatewayPayload,
  type Header,
  type Mapping,
  type Program,
  type StartPayload,
} from "../il/types.js";

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
 * What the admissions read of a Gateway's kind: the candidates and default of a conditional Gateway, whether one
 * activation may leave on several flows at once, and whether it waits for an event.
 */
type Routing = Readonly<{
  conditional: Readonly<{ candidates: readonly FlowId[]; defaultFlow: FlowId | null }> | null;
  concurrent: boolean;
  waits: boolean;
}>;

function routing(payload: GatewayPayload): Routing {
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

/** A set of variable names, or every name. */
type NameSet = Readonly<{ names: readonly string[]; all: boolean }>;

const noNames: NameSet = { names: [], all: false };

const union = (left: NameSet, right: NameSet): NameSet => ({ names: [...left.names, ...right.names], all: left.all || right.all });

const meets = (left: NameSet, right: NameSet): boolean =>
  (left.all && (right.all || right.names.length > 0)) || (right.all && left.names.length > 0) ||
  left.names.some((name) => right.names.includes(name));

/** What a branch reads and writes within one closure. */
type Footprint = Readonly<{ reads: NameSet; writes: NameSet }>;

const joined = (left: Footprint, right: Footprint): Footprint =>
  ({ reads: union(left.reads, right.reads), writes: union(left.writes, right.writes) });

/** Whether one branch's writes meet the other's reads or writes, in either direction. */
const races = (left: Footprint, right: Footprint): boolean =>
  meets(left.writes, union(right.reads, right.writes)) || meets(right.writes, left.reads);

/**
 * The names an expression reads. A JUEL or foreign text counts as reading every name: a JUEL method or the `execution`
 * object can read a variable no identifier names.
 */
function expressionReads(expression: Expression): NameSet {
  switch (expression.tag) {
    case ExpressionTag.Literal:
      return noNames;
    case ExpressionTag.Variable:
      return { names: [expression.name], all: false };
    case ExpressionTag.SimpleBoolean:
      return expression.body.tag === SimpleBooleanTag.Literal ? noNames : { names: [expression.body.name], all: false };
    case ExpressionTag.Juel:
    case ExpressionTag.Foreign:
      return { names: [], all: true };
  }
  return assertNever(expression);
}

const mappingReads = (mappings: readonly Mapping[]): NameSet =>
  mappings.reduce((found, mapping) => union(found, expressionReads(mapping.source)), noNames);

/**
 * What `element` reads when it begins: its input mappings, and every name for a Multi-Instance definition, whose count,
 * collection and condition it evaluates then or later in the closure.
 */
function beginReads(element: Element): NameSet {
  const envelope = elementEnvelope(element);
  return envelope === null ? noNames : union(mappingReads(envelope.inputs), { names: [], all: envelope.multiInstance !== null });
}

/**
 * What `element` reads and writes when it runs through in the closure: it begins, its outputs read their sources and
 * write their targets, a Call maps its inputs and outputs, and its outgoing conditions are evaluated.
 */
function footprint(program: Program, element: Element): Footprint {
  const outputs = elementEnvelope(element)?.outputs ?? [];
  const activity = elementActivity(element);
  const call = activity === null ? null : workCall(activity[1].work);
  const conditions = elementOutgoing(element).flatMap((id) => {
    const condition = programFlow(program, id)?.condition ?? null;
    return condition === null ? [] : [condition];
  }).reduce((found, condition) => union(found, expressionReads(condition)), noNames);
  return {
    reads: union(union(beginReads(element), mappingReads(outputs)), union(call === null ? noNames : mappingReads(call.inputs), conditions)),
    writes: {
      names: [...outputs.map((mapping) => mapping.target), ...(call?.outputs ?? []).map((mapping) => mapping.target)],
      all: call?.propagateAllOutputs === true,
    },
  };
}

/**
 * An element a token stops at within its closure: a User, Service or Receive Task, a catch Event or an Event-Based
 * Gateway waits for a stimulus, and a converging Parallel or Inclusive Gateway joins the branches (CIB parks its
 * execution there too).
 */
function branchStop(element: Element): boolean {
  const activity = elementActivity(element);
  if (activity !== null) {
    const work = activity[1].work;
    return workIsUser(work) || workIsService(work) || workReceive(work) !== null;
  }
  const event = elementEvent(element);
  if (event !== null) return eventPayloadCatch(event[1]) !== null;
  const gateway = elementGateway(element);
  if (gateway === null) return false;
  const fan = routing(gateway[1]);
  return fan.waits || (fan.concurrent && gateway[1].incoming.length >= 2);
}

/**
 * The flows a token continues on from `element` in the same closure: its outgoing flows, a throwing Link's catch, and
 * the outgoing flows of a Scope's starts, which its occurrence begins at once.
 */
function onward(program: Program, element: Element): readonly FlowId[] {
  const event = elementEvent(element);
  const name = event === null ? null : eventPayloadLinkThrow(event[1]);
  const link = event === null || name === null ? [] : programChildren(program, event[0].parent).flatMap((other) => {
    const caught = elementEvent(other);
    return caught !== null && eventPayloadLinkCatch(caught[1]) === name ? elementOutgoing(other) : [];
  });
  const scope = elementScope(element);
  const starts = scope === null ? []
    : programChildren(program, scope[0].id).flatMap((child) => (elementStart(child) === null ? [] : elementOutgoing(child)));
  return [...elementOutgoing(element), ...link, ...starts];
}

/** What the work a token on `start` reaches may read and write in one closure; an element it stops at only begins. */
function branchFootprint(program: Program, start: FlowId): Footprint {
  let frontier: readonly FlowId[] = [start];
  const seen: FlowId[] = [];
  let found: Footprint = { reads: noNames, writes: noNames };
  // The fuel bounds every visit of every flow, so it is never exhausted; running out answers what was found.
  for (let fuel = (program.flows.length + 1) * (program.flows.length + 1); ; fuel -= 1) {
    const [flow, ...rest] = frontier;
    if (flow === undefined || fuel === 0) return found;
    if (seen.includes(flow)) {
      frontier = rest;
      continue;
    }
    seen.unshift(flow);
    const target = programTarget(program, flow);
    const element = target === null ? null : programElement(program, target);
    if (element === null) {
      frontier = rest;
    } else if (branchStop(element)) {
      frontier = rest;
      found = joined(found, { reads: beginReads(element), writes: noNames });
    } else {
      frontier = [...rest, ...onward(program, element)];
      found = joined(found, footprint(program, element));
    }
  }
}

/**
 * Under `BranchSchedule.orderInvariant`, no branch of a split may write a name another branch reads or writes in the
 * same closure: BPMN 2.0.2 lets concurrent branches interleave in any order (Table 13.1, §13.3.1), so the value left or
 * read would depend on the closure's order, which no input states. CIB runs the first-declared branch first
 * (CIB-OP-0016), the profile option `declarationDepthFirst` (PC-BASIC-03). A split is a Parallel or Inclusive Gateway,
 * or any element or Boundary Event with several outgoing flows. A forward-compatible restriction, and a conservative
 * one: a Call's output mappings count as written in the closure even when the called instance waits, and a JUEL text as
 * reading every name; a later profile may take the interleaving as a choice input instead. Not counted: what an element
 * it stops at evaluates besides its input mappings and Multi-Instance definition.
 */
export function concurrentWrite(program: Program, flow: Flow): string | null {
  switch (program.options.branchSchedule) {
    case BranchSchedule.DeclarationDepthFirst:
      return null;
    case BranchSchedule.OrderInvariant: {
      const source = programElement(program, flow.source);
      const gateway = source === null ? null : elementGateway(source);
      if (gateway !== null && !routing(gateway[1]).concurrent) return null;
      const own = branchFootprint(program, flow.id);
      return leaving(program, flow.source).some((other) => other !== flow.id && races(own, branchFootprint(program, other)))
        ? "flow.concurrentWrite"
        : null;
    }
  }
  return assertNever(program.options.branchSchedule);
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
 * A throwing Link has exactly one catching Link of its name among its siblings, and one name has one target in the whole
 * definition (BPMN 2.0.2 §10.5.5, Table 10.89; CIB pairs names resource-wide, CIB-AGR-0018). A catching Link that a flow
 * also reaches passes that token on like any intermediate Event (PC-BASIC-02).
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
  return program.elements.filter(catches(caught)).length >= 2 ? "link.duplicateCatch" : null;
}

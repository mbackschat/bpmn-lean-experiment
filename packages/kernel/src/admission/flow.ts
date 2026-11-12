/**
 * Admission of starts, gateways, Links and flow references, transcribed from `Kernel/Admission/Flow.lean`. A refusal
 * carries a stable code. A start's trigger is admitted by `admission/subscriptions.ts`.
 */
import {
  BranchSchedule,
  EventGatewayInstantiation,
  GatewayKindTag,
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
  eventPayloadThrow,
  eventPayloadLinkCatch,
  eventPayloadLinkThrow,
  definitionRefEquals,
  programBeginsImplicitly,
  programBoundary,
  programCalledProcessFor,
  programCallerDeployment,
  programChildren,
  programElement,
  programFlow,
  programProcessOf,
  programSiblings,
  programTarget,
  scopeKindStart,
  throwView,
  triggerCondition,
  triggerTimer,
  triggerView,
  workCall,
  workIsService,
  workIsUser,
  workReceive,
  type Boundary,
  type CalledProcess,
  type Element,
  type ElementId,
  type EventPayload,
  type Flow,
  type FlowId,
  type GatewayPayload,
  type Header,
  type Program,
  type StartPayload,
  type Subscription,
} from "../il/types.js";
import { beginReads, footprint, joined, noNames, races, union, type Footprint, type NameSet } from "../il/footprint.js";

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
function branchStop(element: Element): boolean {
  const gateway = elementGateway(element);
  return awaitsStimulus(element) || (gateway !== null && routing(gateway[1]).concurrent && gateway[1].incoming.length >= 2);
}

/** The elements `flows` lead to. */
const flowTargets = (program: Program, flows: readonly FlowId[]): readonly Element[] => flows.flatMap((flow) => {
  const target = programTarget(program, flow);
  const element = target === null ? null : programElement(program, target);
  return element === null ? [] : [element];
});

/**
 * The children an occurrence of the Scope `id` begins on entry: its start Events, or, without one, the children that
 * begin implicitly (`programBeginsImplicitly`), as `feature/scopes.ts` `implicitStart` begins them.
 */
function enteredChildren(program: Program, id: ElementId): readonly Element[] {
  const children = programChildren(program, id);
  return children.some((child) => elementStart(child) !== null)
    ? children.filter((child) => elementStart(child) !== null)
    : children.filter((child) => programBeginsImplicitly(program, child));
}

/**
 * What a closure walk reads of an element beyond the IL, filled by `admission-registry.ts` `reading` from the admissions
 * that own each part, since this module matches none of `Trigger`, `Throw` or `Work`: what an element writes when it
 * runs through its closure beyond its envelope's outputs and a Call's (its work's result, its catch's outputs and
 * variables, what its Signal's receivers install, a loop's output collection), the names a looping element writes into
 * scope occurrences of its own (its counters and each instance's items), what a boundary writes when it fires, whether an element's run may raise an Error, Escalation or Cancel in its
 * closure, whether a subscription catches such a raise, whether an element begins compensation handlers, whether a
 * subscription starts a Compensation Event Sub-Process, and whether a looping element may run no instance.
 */
export type Reading = Readonly<{
  writes: (element: Element) => NameSet;
  locals: (element: Element) => readonly string[];
  fires: (attached: Boundary) => readonly string[];
  raises: (element: Element) => boolean;
  catchesRaise: (subscription: Subscription) => boolean;
  compensates: (element: Element) => boolean;
  compensationStart: (subscription: Subscription) => boolean;
  mayRunNone: (element: Element) => boolean;
}>;

/**
 * One step of a closure walk: an element a token begins, one that completes, a boundary that fires, or an element a
 * raise passes, which writes its outputs (`interruptedOutputs`, a Call's raised outputs) and goes no further.
 */
export enum VisitTag { Enters = "enters", Completes = "completes", Fires = "fires", Passes = "passes" }

export type Visit =
  | { readonly tag: VisitTag.Enters; readonly element: Element }
  | { readonly tag: VisitTag.Completes; readonly element: Element }
  | { readonly tag: VisitTag.Fires; readonly boundary: Boundary }
  | { readonly tag: VisitTag.Passes; readonly element: Element };

const toEnter = (element: Element): Visit => ({ tag: VisitTag.Enters, element });
const toComplete = (element: Element): Visit => ({ tag: VisitTag.Completes, element });
const toFire = (attached: Boundary): Visit => ({ tag: VisitTag.Fires, boundary: attached });
const toPass = (element: Element): Visit => ({ tag: VisitTag.Passes, element });

/**
 * What a walk found: the footprint of the shared names, whether a token may end, every element and boundary it reached
 * (walked through, stopped at or fired), and the names written into scope occurrences of their own.
 */
export type Closure = Readonly<{ footprint: Footprint; ends: boolean; reached: readonly ElementId[]; locals: readonly string[] }>;

/** The elements enclosing the element whose parent is `parent`, innermost first. */
function ancestors(program: Program, parent: ElementId | null): Element[] {
  const found: Element[] = [];
  let id = parent;
  for (let fuel = program.elements.length; fuel > 0 && id !== null; fuel -= 1) {
    const element = programElement(program, id);
    if (element === null) break;
    found.push(element);
    id = elementHeader(element).parent;
  }
  return found;
}

const eventSubProcessStart = (element: Element): Subscription | null => {
  const scope = elementScope(element);
  return scope === null ? null : scopeKindStart(scope[1].kind);
};

/** The Event Sub-Processes among `level` whose start `starts` takes. */
const startingSubProcesses = (level: readonly Element[], starts: (subscription: Subscription) => boolean): Element[] =>
  level.filter((element) => {
    const start = eventSubProcessStart(element);
    return start !== null && starts(start);
  });

/** The Call Activities whose called process is `process`. */
function callers(program: Program, process: CalledProcess): Element[] {
  return program.elements.filter((element) => {
    const activity = elementActivity(element);
    const work = activity === null ? null : workCall(activity[1].work);
    return work !== null && programCalledProcessFor(program, program.options.calledElementResolution,
      programCallerDeployment(program, elementHeader(element)), work).some((called) => definitionRefEquals(called.definition, process.definition));
  });
}

/**
 * Where a raise from `element` may be caught: a boundary of the element itself, if it is an Activity or Scope, or of an
 * enclosing one, whose host it interrupts and passes, an Event Sub-Process of an enclosing Scope or of the process
 * level, and from a called process's level a Call's catchers in its caller. Any raised kind and code counts.
 */
function catchers(reading: Reading, program: Program, element: Element, fuel: number): Visit[] {
  if (fuel === 0) return [];
  const chain = [...(elementEnvelope(element) === null ? [] : [element]), ...ancestors(program, elementHeader(element).parent)];
  const atHost = (host: Element): Visit[] => {
    const scope = elementScope(host);
    return [
      ...(elementEnvelope(host)?.boundaries ?? []).filter((attached) => reading.catchesRaise(attached.subscription))
        .flatMap((attached) => [toFire(attached), toPass(host)]),
      ...(scope === null ? [] : startingSubProcesses(programChildren(program, scope[0].id), reading.catchesRaise).map(toEnter)),
    ];
  };
  const top = chain.at(-1) ?? element;
  const level = startingSubProcesses(programSiblings(program, elementHeader(top)), reading.catchesRaise).map(toEnter);
  const process = programProcessOf(program, elementHeader(top));
  const caller = process === null ? [] : callers(program, process).flatMap((call) => [toPass(call), ...catchers(reading, program, call, fuel - 1)]);
  return [...chain.flatMap(atHost), ...level, ...caller];
}

/** Whether an element is a compensation handler: an Activity or Scope marked `isForCompensation`, or a Compensation Event Sub-Process. */
function handler(reading: Reading, element: Element): boolean {
  const start = eventSubProcessStart(element);
  return elementEnvelope(element)?.forCompensation === true || (start !== null && reading.compensationStart(start));
}

/** Every element declared in `level` and the Scopes it holds. */
function declaredIn(program: Program, fuel: number, level: readonly Element[]): Element[] {
  if (fuel === 0) return [];
  return level.flatMap((element) => {
    const scope = elementScope(element);
    return [element, ...(scope === null ? [] : declaredIn(program, fuel - 1, programChildren(program, scope[0].id)))];
  });
}

/**
 * The handlers a Compensation throw or Cancel End may begin: every handler declared under the nearest Scope enclosing it
 * that is no Event Sub-Process, or under its process level. Which records it finds is the run's; any may be there.
 */
function handlersOf(reading: Reading, program: Program, thrower: Element): Element[] {
  const enclosing = ancestors(program, elementHeader(thrower).parent);
  const scope = enclosing.find((candidate) => eventSubProcessStart(candidate) === null) ?? null;
  const level = scope === null ? programSiblings(program, elementHeader(enclosing.at(-1) ?? thrower)) : programChildren(program, elementHeader(scope).id);
  return declaredIn(program, program.elements.length, level).filter((element) => handler(reading, element));
}

/**
 * The subscriptions a Signal or Conditional catch, boundary or Event Sub-Process start of `element` holds, as visits: a
 * catch completes, a boundary fires, an Event Sub-Process begins.
 */
function catching(picks: (subscription: Subscription) => boolean, element: Element): Visit[] {
  const event = elementEvent(element);
  const caught = event === null ? null : eventPayloadCatch(event[1]);
  const start = eventSubProcessStart(element);
  return [
    ...(caught !== null && picks(caught) ? [toComplete(element)] : []),
    ...(elementEnvelope(element)?.boundaries ?? []).filter((attached) => picks(attached.subscription)).map(toFire),
    ...(start !== null && picks(start) ? [toEnter(element)] : []),
  ];
}

const signalled = (subscription: Subscription): boolean => triggerView(subscription.trigger).signal !== null;
const conditional = (subscription: Subscription): boolean => triggerCondition(subscription.trigger) !== null;

/** Every Conditional catch, boundary and Event Sub-Process start of the program, which a write may resume. */
export function conditionalCatches(program: Program): Visit[] {
  return program.elements.flatMap((element) => catching(conditional, element));
}

/**
 * The visits a token's leaving `element` makes in the same closure beside its flows: the catchers of its raise, the
 * handlers its Compensation throw or Cancel End begins and, when it is a handler that completes, the other handlers of
 * every trigger that may begin it and that trigger's continuation; and every Signal catch a Signal throw resumes in the
 * instance (CIB-OP-0019).
 */
function beyond(reading: Reading, program: Program, element: Element, completes: boolean): Visit[] {
  const raised = reading.raises(element) ? catchers(reading, program, element, program.elements.length + 1) : [];
  const compensated = reading.compensates(element) ? handlersOf(reading, program, element).map(toEnter) : [];
  const id = elementHeader(element).id;
  const continued = completes && handler(reading, element)
    ? program.elements.filter((thrower) => reading.compensates(thrower) &&
        handlersOf(reading, program, thrower).some((other) => elementHeader(other).id === id))
      .flatMap((thrower) => [...handlersOf(reading, program, thrower).map(toEnter), toComplete(thrower)])
    : [];
  const event = elementEvent(element);
  const thrown = event === null ? null : eventPayloadThrow(event[1]);
  const signals = thrown !== null && throwView(thrown).signal !== null ? program.elements.flatMap((other) => catching(signalled, other)) : [];
  return [...raised, ...compensated, ...continued, ...signals];
}

/** The elements `element`'s outgoing flows and throwing Link lead to. */
function continuing(program: Program, element: Element): readonly Element[] {
  const event = elementEvent(element);
  const name = event === null ? null : eventPayloadLinkThrow(event[1]);
  const link = event === null || name === null ? [] : programSiblings(program, event[0]).flatMap((other) => {
    const caught = elementEvent(other);
    return caught !== null && eventPayloadLinkCatch(caught[1]) === name ? elementOutgoing(other) : [];
  });
  return flowTargets(program, [...elementOutgoing(element), ...link]);
}

/**
 * How a walk proceeds: `stop` names the elements that only begin, and `ascends` whether a token ending in a Scope may
 * complete it, a called process's end its Calls, and a looping element's instance begin the next. A branch walk does not
 * ascend: completing the Scope that holds the split waits for every branch.
 */
export type Walk = Readonly<{ stop: (element: Element) => boolean; ascends: boolean }>;

/**
 * The visits after `element` completes: its flows and Link, and under `ascends` its parent's completion or, at a called
 * process's level, its Calls'; a handler completes no parent.
 */
function after(reading: Reading, program: Program, walk: Walk, element: Element): Visit[] {
  const next = continuing(program, element).map(toEnter);
  let ascent: Visit[] = [];
  if (walk.ascends && next.length === 0 && !handler(reading, element)) {
    const parent = elementHeader(element).parent;
    if (parent !== null) {
      const enclosing = programElement(program, parent);
      ascent = enclosing === null ? [] : [toComplete(enclosing)];
    } else {
      const process = programProcessOf(program, elementHeader(element));
      ascent = process === null ? [] : callers(program, process).map(toComplete);
    }
  }
  return [...next, ...ascent, ...beyond(reading, program, element, true)];
}

/**
 * The visits beginning `element` makes: a Scope's entered children and, as before it completes, its flows; a loop that
 * may run no instance completes at once; a Conditional boundary, an Event Sub-Process Conditional start and an
 * Event-Based Gateway's Conditional arm may fire on entry.
 */
function entering(reading: Reading, program: Program, element: Element): Visit[] {
  const conditions = (elementEnvelope(element)?.boundaries ?? []).filter((attached) => conditional(attached.subscription)).map(toFire);
  const gateway = elementGateway(element);
  const arms = gateway !== null && routing(gateway[1]).waits
    ? flowTargets(program, elementOutgoing(element)).flatMap((arm) => {
      const event = elementEvent(arm);
      const caught = event === null ? null : eventPayloadCatch(event[1]);
      return caught !== null && conditional(caught) ? [toComplete(arm)] : [];
    })
    : [];
  const scope = elementScope(element);
  const nested = scope === null ? [] : [
    ...enteredChildren(program, scope[0].id).map(toEnter),
    ...startingSubProcesses(programChildren(program, scope[0].id), conditional).map(toEnter),
  ];
  return [...conditions, ...arms, ...nested, ...(reading.mayRunNone(element) ? [toComplete(element)] : [])];
}

/** Whether a stop runs through anyway: a loop that may run no instance, or a Conditional catch whose condition may hold on arrival. */
function runsThrough(reading: Reading, element: Element): boolean {
  const event = elementEvent(element);
  const caught = event === null ? null : eventPayloadCatch(event[1]);
  return reading.mayRunNone(element) || (caught !== null && conditional(caught));
}

/** What `element` contributes when it runs: its reads, and its shared and own writes. */
function runs(reading: Reading, program: Program, element: Element): readonly [Footprint, readonly string[]] {
  const own = footprint(program, element);
  return [{ reads: own.reads, writes: union(own.writes, reading.writes(element)) }, reading.locals(element)];
}

function visitKey(visit: Visit): string {
  switch (visit.tag) {
    case VisitTag.Enters:
      return `0:${elementHeader(visit.element).id}`;
    case VisitTag.Completes:
      return `1:${elementHeader(visit.element).id}`;
    case VisitTag.Fires:
      return `2:${visit.boundary.id}`;
    case VisitTag.Passes:
      return `3:${elementHeader(visit.element).id}`;
  }
  return assertNever(visit);
}

/**
 * Walk one closure from `begun`. Every element, boundary and passed host is taken at most once per kind of visit; a
 * write arms every Conditional of the program once, since it may resume one in the same closure (CIB-EXT-0035).
 */
export function closureWalk(reading: Reading, program: Program, walk: Walk, begun: readonly Visit[]): Closure {
  const boundaries = program.elements.reduce((count, element) => count + (elementEnvelope(element)?.boundaries.length ?? 0), 0);
  const size = program.elements.length + program.flows.length + boundaries + 1;
  let frontier: Visit[] = [...begun];
  const seen = new Set<string>();
  let found: Footprint = { reads: noNames, writes: noNames };
  let ends = false;
  const reached: ElementId[] = [];
  const locals: string[] = [];
  let armed = false;
  const add = ([part, own]: readonly [Footprint, readonly string[]]): void => {
    found = joined(found, part);
    locals.unshift(...own);
  };
  // What one visit adds to the walk, and the visits it leads to.
  const visited = (visit: Visit): Visit[] => {
    switch (visit.tag) {
      case VisitTag.Fires:
        reached.unshift(visit.boundary.id);
        add([{ reads: noNames, writes: { names: reading.fires(visit.boundary), all: false } }, []]);
        return flowTargets(program, visit.boundary.outgoing).map(toEnter);
      case VisitTag.Passes: {
        reached.unshift(elementHeader(visit.element).id);
        const own = footprint(program, visit.element);
        add([{ reads: own.reads, writes: union(own.writes, reading.writes(visit.element)) }, []]);
        return [];
      }
      case VisitTag.Completes:
        reached.unshift(elementHeader(visit.element).id);
        add(runs(reading, program, visit.element));
        return [...after(reading, program, walk, visit.element),
          ...(walk.ascends && elementEnvelope(visit.element)?.multiInstance != null ? [toEnter(visit.element)] : [])];
      case VisitTag.Enters: {
        const element = visit.element;
        reached.unshift(elementHeader(element).id);
        if (walk.stop(element) && !runsThrough(reading, element)) {
          found = joined(found, { reads: beginReads(element), writes: noNames });
          return entering(reading, program, element);
        }
        const scope = elementScope(element);
        const onward = [...continuing(program, element), ...(scope === null ? [] : enteredChildren(program, scope[0].id))];
        add(runs(reading, program, element));
        ends ||= onward.length === 0;
        return [...entering(reading, program, element), ...after(reading, program, walk, element)];
      }
    }
    return assertNever(visit);
  };
  // The fuel bounds every visit and every visit's successors, so it is never exhausted; running out answers what was found.
  for (let fuel = 4 * size * size; fuel > 0; fuel -= 1) {
    const [visit, ...rest] = frontier;
    if (visit === undefined) break;
    frontier = rest;
    const key = visitKey(visit);
    if (seen.has(key)) continue;
    seen.add(key);
    const next = visited(visit);
    const arms: boolean = !armed && (found.writes.names.length > 0 || found.writes.all);
    frontier = arms ? [...rest, ...next, ...conditionalCatches(program)] : [...rest, ...next];
    armed ||= arms;
  }
  return { footprint: found, ends, reached, locals };
}

/** What the work a token on `start` reaches may read and write in one closure; an element it stops at only begins. */
const branchFootprint = (reading: Reading, program: Program, start: FlowId): Footprint =>
  closureWalk(reading, program, { stop: branchStop, ascends: false }, flowTargets(program, [start]).map(toEnter)).footprint;

/**
 * Under `BranchSchedule.orderInvariant`, no branch of a split may write a name another branch reads or writes in the
 * same closure: BPMN 2.0.2 lets concurrent branches interleave in any order (Table 13.1, §13.3.1), so the value left or
 * read would depend on the closure's order, which no input states. CIB runs the first-declared branch first
 * (CIB-OP-0016), the profile option `declarationDepthFirst` (PC-BASIC-03). A split is a Parallel or Inclusive Gateway,
 * or any element or Boundary Event with several outgoing flows. A forward-compatible restriction, and a conservative
 * one: a branch counts what its elements write (`Reading.writes`), what the catchers, handlers and Signal and Conditional
 * catches it may resume in the closure do, and a loop that may run no instance as completing (issue #99); a Call's
 * output mappings count as written even when the called instance waits, and a JUEL text as reading every name; a later
 * profile may take the interleaving as a choice input instead. Not counted: what an element it stops at evaluates
 * besides its input mappings and Multi-Instance definition.
 */
export function concurrentWrite(reading: Reading, program: Program, flow: Flow): string | null {
  switch (program.options.branchSchedule) {
    case BranchSchedule.DeclarationDepthFirst:
      return null;
    case BranchSchedule.OrderInvariant: {
      const source = programElement(program, flow.source);
      const gateway = source === null ? null : elementGateway(source);
      if (gateway !== null && !routing(gateway[1]).concurrent) return null;
      const own = branchFootprint(reading, program, flow.id);
      return leaving(program, flow.source).some((other) => other !== flow.id && races(own, branchFootprint(reading, program, other)))
        ? "flow.concurrentWrite"
        : null;
    }
  }
  return assertNever(program.options.branchSchedule);
}

/**
 * What the instances of a looping element do in the closure that begins them, which
 * `concurrentInstances` (`admission/multi-instance.ts`) reads: `races` when one instance writes a name before it waits,
 * since every instance has the same footprint and so meets its own, and `completes` when an instance may complete there.
 */
export type InstanceClosure = Readonly<{ races: boolean; completes: boolean }>;

/**
 * A Sub-Process instance runs from its `enteredChildren` and continues past a join, which the instance's own branches reach
 * in that closure; a task instance is its work, which completes at once unless it awaits a stimulus. `completes`
 * over-approximates: a token reaching an element that neither waits nor continues, ignoring that a sibling branch of a
 * Parallel split may wait, which flows a condition selects and whether a nested Call waits.
 */
export function instanceClosure(reading: Reading, program: Program, element: Element): InstanceClosure {
  const scope = elementScope(element);
  if (scope !== null) {
    const closure = closureWalk(reading, program, { stop: awaitsStimulus, ascends: false }, enteredChildren(program, scope[0].id).map(toEnter));
    return { races: races(closure.footprint, closure.footprint), completes: closure.ends };
  }
  if (awaitsStimulus(element)) return { races: false, completes: false };
  const own = footprint(program, element);
  const run: Footprint = { reads: own.reads, writes: union(own.writes, reading.writes(element)) };
  return { races: races(run, run), completes: true };
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
  if (thrown !== null) return programSiblings(program, header).filter(catches(thrown)).length === 1 ? null : "link.catch";
  const caught = eventPayloadLinkCatch(payload);
  if (caught === null) return null;
  return program.elements.filter(catches(caught)).length >= 2 ? "link.duplicateCatch" : null;
}

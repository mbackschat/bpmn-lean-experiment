/**
 * Admission registry, transcribed from `Kernel/AdmissionRegistry.lean`: the first refusal of any element, in program
 * order. Only `run.ts` imports it.
 */
import {
  ElementTag,
  EventRoleTag,
  assertNever,
  elementActivity,
  elementEnvelope,
  elementEvent,
  elementGateway,
  elementHeader,
  elementScope,
  elementStart,
  eventPayloadCatch,
  eventPayloadThrow,
  firstOf,
  programChildren,
  programElement,
  programInCalledProcess,
  programSiblings,
  programSource,
  scopeKindStart,
  throwView,
  triggerMessage,
  workCall,
  workIsUser,
  workReceive,
  type ActivityPayload,
  type Boundary,
  type CalledProcess,
  type Element,
  type ElementId,
  type Envelope,
  type ScopePayload,
  type EventPayload,
  type Flow,
  type Header,
  type Mapping,
  type MessageTrigger,
  type ProfileOptions,
  type Program,
  type SignalTrigger,
  type Subscription,
  type ThrowView,
} from "./il/types.js";
import * as Data from "./admission/data.js";
import * as FlowAdmission from "./admission/flow.js";
import * as Decision from "./admission/work/decision.js";
import * as Profile from "./admission/profile.js";
import * as Work from "./admission/work.js";
import * as MultiInstance from "./admission/multi-instance.js";
import * as Propagation from "./admission/propagation.js";
import * as Scopes from "./admission/scopes.js";
import * as Subscriptions from "./admission/subscriptions.js";
import * as Starts from "./admission/subscriptions/starts.js";
import { noNames, union } from "./il/footprint.js";

/** Whether an element is some Activity's or Scope's compensation handler. */
function isHandler(program: Program, id: ElementId): boolean {
  return program.elements.some((element) => elementEnvelope(element)?.compensationHandlers.includes(id) ?? false);
}

/**
 * Refusals an Activity owes because of how it begins. A compensation handler begins as a token would
 * (`feature/work.ts#arriveActivity`), so it may have inputs and do any admitted work.
 */
function activityOrigin(program: Program, header: Header, payload: ActivityPayload): string | null {
  // CIB skips a compensation handler's loop marks (`BpmnParse.java:2416`), which `state/journal.ts` `marks` would read.
  if (isHandler(program, header.id) && payload.envelope.multiInstance !== null) return "compensation.handlerMultiInstance";
  if (Scopes.implicitChild(program, header) && !Work.beginsWithoutToken(payload.work)) return "scope.implicitStart";
  return null;
}

/**
 * Where a compensation handler sits. BPMN 2.0.2 §10.7.1 puts a Compensation Activity "outside the normal flow" and marks
 * it `isForCompensation` (Table 10.3), so an associated handler without the mark and a handler with a Sequence Flow are
 * refused; CIB refuses both at deployment (`BpmnParse.java:905-910`, `:4327-4337`). A Compensation Event Sub-Process
 * carries no mark and is placed by `processEventSubProcess`.
 */
function handlerPlacement(program: Program, header: Header, envelope: Envelope, eventSubProcess: boolean): string | null {
  if (!isHandler(program, header.id) || eventSubProcess) return null;
  if (!envelope.forCompensation) return "compensation.handlerNotForCompensation";
  if (envelope.incoming.length > 0 || envelope.outgoing.length > 0) return "compensation.handlerFlow";
  return null;
}

/**
 * BPMN 2.0.2 §13.5.5 contains a Compensation Event Sub-Process "within a Process or a Sub-Process"; CIB refuses one at
 * Process level (`BpmnParse.java:1187-1190`, CIB-LIM-0044), whose records would come from the calling hierarchy.
 */
function processEventSubProcess(header: Header, payload: ScopePayload): string | null {
  const start = Scopes.eventSubProcessOf(payload);
  return header.parent === null && start !== null && Subscriptions.compensates(start[0]) ? "compensation.processEventSubProcess" : null;
}

/** The site of an expression in `id`'s scope. */
function site(program: Program, id: ElementId | null): Data.Site {
  return { counters: MultiInstance.countersAt(program, id), hidden: [], scopeItems: Data.scopedItems(program) };
}

/** How a subscription in the scope of `id` reads an expression of its trigger: the Core JUEL table at that site. */
function subscriptionReading(program: Program, id: ElementId | null): Subscriptions.Reading {
  return { juel: (nodes) => Data.juelNodes(nodes, site(program, id)), name: (name) => Data.juelName(site(program, id), name) };
}

/** How a throw Event in `header`'s place reads its trigger's expressions and its mappings. */
/**
 * Where the element `target` a Compensation throw in `header`'s place names lies: at the throw's level, else, when the
 * throw sits directly in an Event Sub-Process, at that Event Sub-Process's level, which a Compensation one makes visible
 * (BPMN 2.0.2 Tables 10.88 and 10.89). A Sub-Process of any kind is an Activity.
 */
function compensationTarget(program: Program, header: Header, target: ElementId): Propagation.Reference {
  const element = programElement(program, target);
  const activity = element !== null && (elementActivity(element) !== null || elementScope(element) !== null);
  const lies = (place: Header): boolean => programSiblings(program, place).some((entry) => elementHeader(entry).id === target);
  if (lies(header)) return { level: Propagation.ReferenceLevel.Visible, activity };
  const parent = header.parent === null ? null : programElement(program, header.parent);
  const scope = parent === null ? null : elementScope(parent);
  const start = scope === null ? null : Scopes.eventSubProcessOf(scope[1]);
  if (scope === null || start === null || !lies(scope[0])) return { level: Propagation.ReferenceLevel.Elsewhere, activity };
  return {
    level: Subscriptions.compensates(start[0]) ? Propagation.ReferenceLevel.Visible : Propagation.ReferenceLevel.EventSubProcessParent,
    activity,
  };
}

function throwSite(program: Program, header: Header): Propagation.ThrowSite {
  const reading = subscriptionReading(program, header.id);
  return {
    signalAddress: (signalRef, name) => Subscriptions.signalAddress(program.options, reading, false, signalRef, name),
    eventsExpression: (refusal, expression) => Subscriptions.eventsExpression(program.options, reading, refusal, expression),
    mappings: (list) => Data.mappings(program.options.evaluator, site(program, header.id), list),
    handlerKey: (token) => Work.handlerKey(program, token),
    reference: (target) => compensationTarget(program, header, target),
  };
}

function targets(mappings: readonly Mapping[]): string[] {
  return mappings.map((entry) => entry.target);
}

/** A subscription's outputs read and write in the scope of `id`. */
function subscriptionData(program: Program, id: ElementId | null, subscription: Subscription): string | null {
  return Data.mappings(program.options.evaluator, site(program, id), subscription.outputs) ??
    MultiInstance.counterTarget(MultiInstance.countersAt(program, id), targets(subscription.outputs));
}

/** A boundary belongs to its host's body, so its outputs are in the scope enclosing the host. */
function boundaryData(program: Program, host: Header, boundaries: readonly Boundary[]): string | null {
  for (const boundary of boundaries) {
    const refused = subscriptionData(program, host.parent, boundary.subscription);
    if (refused !== null) return refused;
  }
  return null;
}

/**
 * An element's own data: its envelope's mappings, each at its site, and the outputs it writes in its scope, which
 * `counterTarget` checks after `activityLoop` has refused a looping element's own outputs. A looping element's own
 * inputs may not read its instance (`ownInputNames`).
 */
function envelopeData(program: Program, header: Header, envelope: Envelope): string | null {
  const here = site(program, header.id);
  const hidden = envelope.multiInstance === null ? [] : MultiInstance.ownInputNames(program.options, envelope.multiInstance);
  return Data.envelope(program.options.evaluator, { ...here, hidden }, here, envelope);
}

function outputTargets(program: Program, header: Header, outputs: readonly Mapping[]): string | null {
  return MultiInstance.counterTarget(MultiInstance.countersAt(program, header.id), targets(outputs));
}

/** The first refusal among `checks`, evaluated lazily in order. */
function first(...checks: readonly (() => string | null)[]): string | null {
  for (const check of checks) {
    const refused = check();
    if (refused !== null) return refused;
  }
  return null;
}

/** Where an element sits for a Cancel End: directly in a Transaction with or without a Cancel boundary, or not. */
function cancelSite(program: Program, header: Header): Propagation.CancelSite {
  const parent = header.parent === null ? null : programElement(program, header.parent);
  const scope = parent === null ? null : elementScope(parent);
  if (scope === null || !Scopes.isTransaction(scope[1])) return Propagation.CancelSite.Outside;
  return scope[1].envelope.boundaries.some(Subscriptions.cancels) ? Propagation.CancelSite.Caught : Propagation.CancelSite.Uncaught;
}

/** What an element throws, if it is a throw Event. */
function thrown(entry: Element): readonly [Header, ThrowView] | null {
  const event = elementEvent(entry);
  const record = event === null ? null : eventPayloadThrow(event[1]);
  return event === null || record === null ? null : [event[0], throwView(record)];
}

function compensationThrow(entry: Element): boolean {
  return thrown(entry)?.[1].compensates ?? false;
}

function eventRole(program: Program, header: Header, payload: EventPayload): string | null {
  const role = payload.role;
  switch (role.tag) {
    case EventRoleTag.Catch:
      return Subscriptions.catchEvent(program.options, subscriptionReading(program, header.id), role.subscription) ?? subscriptionData(program, header.id, role.subscription);
    case EventRoleTag.Throw:
      // A Multiple throw Event (BPMN 2.0.2 §10.5.1); pinned CIB keeps one definition (CIB-LIM-0008) (PC-BASIC-04).
      if (payload.alternativeThrows.length > 0) return "event.multipleDefinitions";
      return Propagation.throwRecord(program.options, throwSite(program, header), cancelSite(program, header), role.record);
    case EventRoleTag.LinkCatch:
    case EventRoleTag.LinkThrow:
      return FlowAdmission.link(program, header, payload);
  }
  return assertNever(role);
}

/** The starts of the Event Sub-Processes among `elements`, in document order. */
function eventSubProcessStarts(elements: readonly Element[]): readonly (readonly [Subscription, boolean])[] {
  return elements.flatMap((entry) => {
    const scope = elementScope(entry);
    const start = scope === null ? null : Scopes.eventSubProcessOf(scope[1]);
    return start === null ? [] : [start];
  });
}

/**
 * The Event Sub-Processes declared together at the root process level and at each called process's level; a Scope's
 * are taken with the Scope (`element`).
 */
function processEventSubProcesses(program: Program): string | null {
  const level = (elements: readonly Element[]) => Subscriptions.eventSubProcessDeclarations(eventSubProcessStarts(elements));
  return level(programChildren(program, null)) ?? firstOf(program.processes, (process) =>
    level(process.children.flatMap((id) => { const found = programElement(program, id); return found === null ? [] : [found]; })));
}

/** The process level holding the parentless element `id`: the root (`null`) or a called process's definition. */
function processLevel(program: Program, id: ElementId): Subscriptions.EventScope {
  const process = program.processes.find((candidate) => candidate.children.includes(id));
  return { tag: Subscriptions.EventScopeTag.Process, definition: process === undefined ? null : process.definition };
}

/** The Event-Based Gateway a catch Event is an arm of, if a flow from one enters it. */
function armOf(program: Program, payload: EventPayload): ElementId | null {
  for (const flowId of payload.incoming) {
    const source = programSource(program, flowId);
    const found = source === null ? null : programElement(program, source);
    const gateway = found === null ? null : elementGateway(found);
    if (gateway !== null && FlowAdmission.routing(gateway[1]).waits) return gateway[0].id;
  }
  return null;
}

/**
 * What `sites` reads of each subscription an element declares, if it is of the compared kind: a boundary's, a Receive
 * Task's own Message, an Event Sub-Process start's, a catch Event's and a root start's trigger.
 */
interface Picks<T> {
  readonly attached: (boundary: Boundary) => T | null;
  readonly received: (work: ActivityPayload["work"]) => T | null;
  readonly handled: (start: Subscription) => T | null;
  readonly caught: (subscription: Subscription) => T | null;
  readonly started: (start: Subscription) => T | null;
}

/**
 * An element's subscriptions of one kind in CIB's event scopes, each also declared with its start mark:
 * - a boundary in its host, or in the host's Multi-Instance body when the host loops (`BpmnParse.java:3290-3301`,
 *   `getMultiInstanceScope` `:3388-3393`, declared at `:3439`, `:3455`);
 * - a Receive Task's own Message in the Receive Task, which its boundaries share unless it loops (`:2753-2760`);
 * - an Event Sub-Process start in the scope holding the Event Sub-Process (`:1112`), unmarked
 *   (`parseEventDefinitionForSubprocess`, `:3499-3503`), so a boundary of that Sub-Process shares it;
 * - an Event-Based Gateway arm in the gateway (`:1526-1527`, parsed from the gateway at `:2132`), any other catch in
 *   itself (`:1529-1530`), declared at `:1596`, `:3520`;
 * - a root start in its process, marked (Message `:1026-1032`, Signal `:1033-1037`, `:3518`), apart from that level's
 *   Event Sub-Process starts.
 * A start nested in a Scope is taken with its Event Sub-Process.
 */
function sites<T>(program: Program, picks: Picks<T>, entry: Element): Subscriptions.Site<T>[] {
  const id = elementHeader(entry).id;
  const own: Subscriptions.EventScope = { tag: Subscriptions.EventScopeTag.Element, id };
  const declared = (scope: Subscriptions.EventScope, start: boolean, trigger: T | null): Subscriptions.Site<T>[] =>
    trigger === null ? [] : [{ scope, start, trigger }];
  const envelope = elementEnvelope(entry);
  const attached = envelope === null ? [] : envelope.boundaries.flatMap((attachedBoundary) => declared(
    envelope.multiInstance === null ? own : { tag: Subscriptions.EventScopeTag.Body, host: id }, false, picks.attached(attachedBoundary)));
  const activityEntry = elementActivity(entry);
  const received = activityEntry === null ? [] : declared(own, false, picks.received(activityEntry[1].work));
  const scopeEntry = elementScope(entry);
  const handler = scopeEntry === null ? null : Scopes.eventSubProcessOf(scopeEntry[1]);
  const handled = scopeEntry === null || handler === null ? [] : declared(scopeEntry[0].parent === null
    ? processLevel(program, id)
    : { tag: Subscriptions.EventScopeTag.Element, id: scopeEntry[0].parent }, false, picks.handled(handler[0]));
  const eventEntry = elementEvent(entry);
  const caughtSubscription = eventEntry === null ? null : eventPayloadCatch(eventEntry[1]);
  const gateway = eventEntry === null ? null : armOf(program, eventEntry[1]);
  const caught = caughtSubscription === null ? [] : declared(
    gateway === null ? own : { tag: Subscriptions.EventScopeTag.Element, id: gateway }, false, picks.caught(caughtSubscription));
  const startEntry = elementStart(entry);
  const started = startEntry === null || startEntry[0].parent !== null || startEntry[1].subscription === null
    ? [] : declared(processLevel(program, id), true, picks.started(startEntry[1].subscription));
  return [...attached, ...received, ...handled, ...caught, ...started];
}

const messages: Picks<MessageTrigger> = {
  attached: (boundary) => triggerMessage(boundary.subscription.trigger),
  received: workReceive,
  handled: (start) => triggerMessage(start.trigger),
  caught: (subscription) => triggerMessage(subscription.trigger),
  started: (start) => triggerMessage(start.trigger),
};

/**
 * The Signals admission reads where it admits them: a boundary's and a catch Event's (`caught`), an Event Sub-Process
 * start's and a root start's (`triggered`).
 */
function signals(options: ProfileOptions): Picks<SignalTrigger> {
  return {
    attached: (boundary) => Subscriptions.caught(options, Subscriptions.unread, boundary.subscription).signal,
    received: () => null,
    handled: (start) => Starts.triggered(options, Subscriptions.unread, true, start.trigger).signal,
    caught: (subscription) => Subscriptions.caught(options, Subscriptions.unread, subscription).signal,
    started: (start) => Starts.triggered(options, Subscriptions.unread, false, start.trigger).signal,
  };
}

/** The Signal names of the whole program: of every Signal it references, then of the subscriptions of each event scope. */
function signalDeclarations(program: Program): string | null {
  const subscribed = program.elements.flatMap((entry) => sites(program, signals(program.options), entry));
  const throws = program.elements.flatMap((entry) => {
    const signal = thrown(entry)?.[1].signal ?? null;
    return signal === null ? [] : [signal];
  });
  return Subscriptions.signalDefinitionNames(program.options, [...subscribed.map((site) => site.trigger), ...throws]) ??
    Subscriptions.signalNames(program.options, subscribed);
}

/** `throws` lists the program's Compensation throws. */
function element(program: Program, throws: readonly Element[], entry: Element): string | null {
  const header = entry.header;
  switch (entry.tag) {
    case ElementTag.Activity: {
      const payload = entry.payload;
      const call = workCall(payload.work);
      const loop = payload.envelope.multiInstance;
      return first(
        () => Data.origin(program, header),
        () => envelopeData(program, header, payload.envelope),
        () => Work.handlerCount(payload.envelope),
        () => (call === null
          ? null
          : Data.mappings(program.options.evaluator, site(program, header.id), call.inputs) ??
            Data.mappings(program.options.evaluator, site(program, header.id), call.outputs)),
        () => Work.activity(program, header, payload),
        () => activityOrigin(program, header, payload),
        () => handlerPlacement(program, header, payload.envelope, false),
        () => (loop === null ? null
          : MultiInstance.activityLoop(program.options, Data.loopExpression, Work.instanceBody(payload.work), payload.envelope, loop)),
        () => outputTargets(program, header, [...payload.envelope.outputs, ...(call?.outputs ?? [])]),
        () => Subscriptions.boundaries(program.options, subscriptionReading(program, header.parent),
          { transaction: false, escalation: workIsUser(payload.work) || call !== null }, payload.envelope.boundaries),
        () => boundaryData(program, header, payload.envelope.boundaries),
        () => Scopes.nestedCompensation(program, throws, header, payload.envelope),
        () => Scopes.boundaryDependency(program, payload.envelope),
      );
    }
    case ElementTag.Scope: {
      const payload = entry.payload;
      const subProcess = Scopes.eventSubProcessOf(payload);
      return first(
        () => Data.origin(program, header),
        () => envelopeData(program, header, payload.envelope),
        () => Work.handlerCount(payload.envelope),
        () => Scopes.scope(program, header, payload),
        () => handlerPlacement(program, header, payload.envelope, subProcess !== null),
        () => processEventSubProcess(header, payload),
        // A Sub-Process instance submits no output data item, so `submits` is false (PC-MI-10).
        () => (payload.envelope.multiInstance === null
          ? null
          : MultiInstance.activityLoop(program.options, Data.loopExpression, false, payload.envelope, payload.envelope.multiInstance)),
        () => outputTargets(program, header, payload.envelope.outputs),
        () => (subProcess === null ? null : Subscriptions.eventSubProcess(subProcess[0], subProcess[1])),
        () => Subscriptions.eventSubProcessDeclarations(eventSubProcessStarts(programChildren(program, header.id))),
        () => Subscriptions.boundaries(
          program.options, subscriptionReading(program, header.parent), { transaction: Scopes.isTransaction(payload), escalation: true },
          payload.envelope.boundaries),
        () => boundaryData(program, header, payload.envelope.boundaries),
        () => Scopes.nestedCompensation(program, throws, header, payload.envelope),
        () => Scopes.boundaryDependency(program, payload.envelope),
      );
    }
    case ElementTag.Event:
      return Data.origin(program, header) ?? eventRole(program, header, entry.payload);
    case ElementTag.Gateway:
      return Data.origin(program, header) ?? FlowAdmission.gateway(program, entry.payload);
    case ElementTag.Start: {
      const subscription = entry.payload.subscription;
      return first(
        () => Data.origin(program, header),
        () => FlowAdmission.startCombination(program, header),
        () => (subscription === null
          ? null
          : Starts.start(program.options, subscriptionReading(program, header.id), header.parent !== null, subscription) ??
            subscriptionData(program, header.id, subscription)),
      );
    }
  }
  return assertNever(entry);
}

/**
 * Whether the program's shape reaches an abnormal scope end: a Terminate in a Sub-Process or at a called process's level
 * (which ends the called instance, not the caller), or an interrupting Event Sub-Process.
 */
function abnormalScope(program: Program): boolean {
  return program.elements.some((entry) => {
    const throw_ = thrown(entry);
    const scope = elementScope(entry);
    return (throw_ !== null && (throw_[0].parent !== null || programInCalledProcess(program, throw_[0].id)) &&
      throw_[1].terminates) ||
      (scope !== null && Scopes.interruptingStart(scope[1]) !== null);
  });
}

/** Whether the program has a Multi-Instance loop, which `admission/profile.ts` reads. */
function loops(program: Program): boolean {
  return program.elements.some((entry) => (elementEnvelope(entry)?.multiInstance ?? null) !== null);
}

/**
 * Whether a Sub-Process an Error can leave retains compensable work: an element with a compensation handler lies in a
 * Sub-Process. Any work may raise an Error, so every such Sub-Process counts.
 */
function errorExit(program: Program): boolean {
  return program.elements.some((entry) =>
    elementHeader(entry).parent !== null && (elementEnvelope(entry)?.compensationHandlers.length ?? 0) > 0);
}

/** Whether a Multi-Instance Task or Call has a compensation handler. */
function loopedHandler(program: Program): boolean {
  return program.elements.some((entry) => {
    const activity = elementActivity(entry);
    return activity !== null && activity[1].envelope.multiInstance !== null && activity[1].envelope.compensationHandlers.length > 0;
  });
}

/** A throw site that refuses nothing, for reading what a throw does rather than whether it is admitted. */
const neutralSite: Propagation.ThrowSite = {
  signalAddress: () => null,
  eventsExpression: () => null,
  mappings: () => null,
  handlerKey: () => null,
  reference: () => ({ level: Propagation.ReferenceLevel.Elsewhere, activity: false }),
};

/**
 * What `admission/flow.ts`'s closure walk reads beyond the IL, each part from its owner: a work's result names and
 * whether it may raise (`admission/work.ts` `traits`), a catch's writes and whether it catches a raise or starts
 * compensation (`admission/subscriptions.ts`), what a Signal throw's receivers install and whether a throw raises or
 * begins compensation handlers (`admission/propagation.ts` `throwReading`), and a loop's output collection, its own names
 * and whether it may run no instance (`admission/multi-instance.ts`).
 */
function reading(program: Program): FlowAdmission.Reading {
  const thrownOf = (element: Element): Propagation.Thrown | null => {
    const event = elementEvent(element);
    const record = event === null ? null : eventPayloadThrow(event[1]);
    return record === null ? null : Propagation.throwReading(program.options, neutralSite, Propagation.CancelSite.Caught, record);
  };
  const caught = (element: Element): Subscription[] => {
    const event = elementEvent(element);
    const start = elementStart(element);
    const scope = elementScope(element);
    return [event === null ? null : eventPayloadCatch(event[1]), start === null ? null : start[1].subscription,
      scope === null ? null : scopeKindStart(scope[1].kind)].filter((subscription) => subscription !== null);
  };
  const traits = (element: Element): Work.Traits | null => {
    const activity = elementActivity(element);
    return activity === null ? null : Work.traits(activity[1].work);
  };
  const loop = (element: Element) => elementEnvelope(element)?.multiInstance ?? null;
  return {
    writes: (element) => {
      const collection = loop(element)?.outputCollection ?? null;
      const names = [...(traits(element)?.names ?? []), ...caught(element).flatMap(Subscriptions.writes), ...(collection === null ? [] : [collection])];
      return union({ names, all: false }, thrownOf(element)?.installs ?? noNames);
    },
    locals: (element) => {
      const found = loop(element);
      return found === null ? [] : MultiInstance.loopLocals(found);
    },
    fires: (attached) => Subscriptions.writes(attached.subscription),
    raises: (element) => traits(element)?.raises === true || thrownOf(element)?.raises === true,
    catchesRaise: (subscription) => Subscriptions.catchView(subscription).raised,
    compensates: (element) => thrownOf(element)?.compensates === true,
    compensationStart: Subscriptions.compensates,
    mayRunNone: (element) => {
      const found = loop(element);
      return found !== null && MultiInstance.mayRunNone(found);
    },
  };
}

/**
 * What one closure from `begun` may reach and write, ascending out of Scopes and called processes: the walk every
 * closure of a run is held to by the closure law (`packages/differential/test/closure-reach.integration-test.ts`).
 */
export function closureReach(program: Program, begun: readonly FlowAdmission.Visit[]): FlowAdmission.Closure {
  return FlowAdmission.closureWalk(reading(program), program, { stop: FlowAdmission.awaitsStimulus, ascends: true }, begun);
}

/**
 * Whether a looping element's instances race one another where they begin: the closure is `admission/flow.ts`'s, the
 * loop's mode and condition `admission/multi-instance.ts`'s.
 */
function loopInstances(program: Program, entry: Element): string | null {
  const loop = elementEnvelope(entry)?.multiInstance ?? null;
  if (loop === null) return null;
  const closure = FlowAdmission.instanceClosure(reading(program), program, entry);
  return MultiInstance.concurrentInstances(program.options, loop, closure.races, closure.completes);
}

/**
 * A flow's condition, evaluated in its source's enclosing scope, then where it may sit, then whether its branch races a
 * sibling's write.
 */
function flow(program: Program, entry: Flow): string | null {
  const source = programElement(program, entry.source);
  const here = site(program, source === null ? null : source.header.parent);
  return Data.flowCondition(program.options.evaluator, here, entry) ?? FlowAdmission.conditionalOutflow(program, entry) ??
    FlowAdmission.concurrentWrite(reading(program), program, entry);
}

/**
 * A called process's deployment, version and version tag are the population's stamps, which `Population.deploy`
 * validates against its registry (PC-SCOPE-03); the population has one tenant, so a tenant stays refused
 * (CIB-LIM-0033).
 */
function calledProcessBinding(process: CalledProcess): string | null {
  return process.definition.tenant !== null ? "process.definition.binding" : null;
}

/**
 * A process not marked executable (BPMN 2.0.2 Table 10.1 `isExecutable`) has no execution meaning; pinned
 * `BpmnParse:560-574` deploys none (CIB-LIM-0008) (PC-BASIC-04).
 */
function executable(program: Program): string | null {
  return !program.executable || program.processes.some((process) => !process.executable) ? "process.notExecutable" : null;
}

/** A refusal code, and the element or flow it names when that element's or flow's own check refused. */
export type AdmissionRefusal = Readonly<{ code: string; element: string | null }>;

/** A check of the whole program, which names no element. */
function unlocated(check: () => string | null): () => AdmissionRefusal | null {
  return () => {
    const code = check();
    return code === null ? null : { code, element: null };
  };
}

/** The first of `items` whose own check refuses, named by `id`. */
function located<T>(items: readonly T[], id: (item: T) => string, check: (item: T) => string | null): () => AdmissionRefusal | null {
  return () => {
    for (const item of items) {
      const code = check(item);
      if (code !== null) return { code, element: id(item) };
    }
    return null;
  };
}

/**
 * The first refusal: references, profile options, a process not marked executable, the carried DMN resources, then
 * called-process bindings, the process levels' Event Sub-Processes, flows and elements in program order, the instances
 * of each loop, the Conditional starts of each process level, then the Message and the Signal names of the whole program.
 * A flow's, an element's or a loop's own refusal names it, so a host can point at the refused element.
 */
export function admitLocated(program: Program): AdmissionRefusal | null {
  const throws = program.elements.filter(compensationThrow);
  const elementId = (entry: Element): string => elementHeader(entry).id;
  for (const check of [
    unlocated(() => FlowAdmission.references(program)),
    unlocated(() => Scopes.membership(program)),
    unlocated(() => Profile.options({
      abnormalScope: abnormalScope(program), loops: loops(program), errorExit: errorExit(program),
      loopedHandler: loopedHandler(program),
    }, program.options)),
    unlocated(() => executable(program)),
    unlocated(() => Decision.resources(program)),
    unlocated(() => firstOf(program.processes, calledProcessBinding)),
    unlocated(() => processEventSubProcesses(program)),
    located(program.flows, (entry) => entry.id, (entry) => flow(program, entry)),
    located(program.elements, elementId, (entry) => element(program, throws, entry)),
    located(program.elements, elementId, (entry) => loopInstances(program, entry)),
    unlocated(() => Starts.startConditions(program)),
    unlocated(() => Subscriptions.messageNames(program.options, program.elements.flatMap((entry) => sites(program, messages, entry)))),
    unlocated(() => signalDeclarations(program)),
  ]) {
    const refused = check();
    if (refused !== null) return refused;
  }
  return null;
}

/** The code of the first refusal (`admitLocated`). */
export function admit(program: Program): string | null {
  return admitLocated(program)?.code ?? null;
}

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
  firstOf,
  programChildren,
  programElement,
  programInCalledProcess,
  programSource,
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
  type EventPayload,
  type Flow,
  type Header,
  type Mapping,
  type MessageTrigger,
  type ProfileOptions,
  type Program,
  type SignalTrigger,
  type Subscription,
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

/** Whether an element is some Activity's or Scope's compensation handler. */
function isHandler(program: Program, id: ElementId): boolean {
  return program.elements.some((element) => elementEnvelope(element)?.compensationHandler === id);
}

/** Refusals an Activity owes because of how it begins or of what its handler restores. */
function activityOrigin(program: Program, header: Header, payload: ActivityPayload): string | null {
  const handler = isHandler(program, header.id);
  if (handler && payload.envelope.inputs.length > 0) return "activity.compensationHandler.input";
  if (handler && !Work.beginsWithoutToken(payload.work)) return "compensation.handlerWork";
  // CIB skips a compensation handler's loop marks (`BpmnParse.java:2416`), which `state/journal.ts` `marks` would read.
  if (handler && payload.envelope.multiInstance !== null) return "compensation.handlerMultiInstance";
  if (Scopes.implicitChild(program, header) && !Work.beginsWithoutToken(payload.work)) return "scope.implicitStart";
  return null;
}

/** The site of an expression in `id`'s scope. */
function site(program: Program, id: ElementId | null): Data.Site {
  return { counters: MultiInstance.countersAt(program, id), hidden: [] };
}

/** How a subscription in the scope of `id` reads an expression of its trigger: the Core JUEL table at that site. */
function subscriptionReading(program: Program, id: ElementId | null): Subscriptions.Reading {
  return { juel: (nodes) => Data.juelNodes(nodes, site(program, id)), name: (name) => Data.juelName(site(program, id), name) };
}

/** How a throw Event in `header`'s place reads its trigger's expressions and its mappings. */
function throwSite(program: Program, header: Header): Propagation.ThrowSite {
  const reading = subscriptionReading(program, header.id);
  return {
    signalAddress: (signalRef, name) => Subscriptions.signalAddress(program.options, reading, false, signalRef, name),
    eventsExpression: (refusal, expression) => Subscriptions.eventsExpression(program.options, reading, refusal, expression),
    mappings: (list) => Data.mappings(program.options.evaluator, site(program, header.id), list),
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

/** Whether an element sits directly in a Transaction. */
function inTransaction(program: Program, header: Header): boolean {
  return header.parent !== null && Scopes.transactionElement(program, header.parent);
}

/** What an element throws, if it is a throw Event. */
function thrown(entry: Element): readonly [Header, Propagation.Reading] | null {
  const event = elementEvent(entry);
  if (event === null) return null;
  const role = event[1].role;
  switch (role.tag) {
    case EventRoleTag.Throw:
      return [event[0], Propagation.reading(role.record)];
    case EventRoleTag.Catch:
    case EventRoleTag.LinkCatch:
    case EventRoleTag.LinkThrow:
      return null;
  }
  return assertNever(role);
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
      return Propagation.throwRecord(program.options, throwSite(program, header), inTransaction(program, header), role.record);
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
 * The Signals admission reads where it admits them: a catch Event's (`caught`), an Event Sub-Process start's and a root
 * start's (`triggered`). A Signal boundary is refused (`boundary.signal`).
 */
function signals(options: ProfileOptions): Picks<SignalTrigger> {
  return {
    attached: () => null,
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
        () => (call === null
          ? null
          : Data.mappings(program.options.evaluator, site(program, header.id), call.inputs) ??
            Data.mappings(program.options.evaluator, site(program, header.id), call.outputs)),
        () => Work.activity(program, payload),
        () => activityOrigin(program, header, payload),
        () => (loop === null ? null
          : MultiInstance.activityLoop(program.options, Data.loopExpression, Work.instanceBody(payload.work), payload.envelope, loop)),
        () => outputTargets(program, header, [...payload.envelope.outputs, ...(call?.outputs ?? [])]),
        () => Subscriptions.boundaries(program.options, subscriptionReading(program, header.parent),
          { transaction: false, escalation: workIsUser(payload.work) || call !== null }, payload.envelope.boundaries),
        () => boundaryData(program, header, payload.envelope.boundaries),
        () => Scopes.nestedCompensation(program, throws, header, payload.envelope),
      );
    }
    case ElementTag.Scope: {
      const payload = entry.payload;
      const subProcess = Scopes.eventSubProcessOf(payload);
      return first(
        () => Data.origin(program, header),
        () => envelopeData(program, header, payload.envelope),
        () => Scopes.scope(program, header, payload),
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
 * Whether a looping element's instances race one another where they begin: the closure is `admission/flow.ts`'s, the
 * loop's mode and condition `admission/multi-instance.ts`'s.
 */
function loopInstances(program: Program, entry: Element): string | null {
  const loop = elementEnvelope(entry)?.multiInstance ?? null;
  if (loop === null) return null;
  const closure = FlowAdmission.instanceClosure(program, entry);
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
    FlowAdmission.concurrentWrite(program, entry);
}

/**
 * A called process's deployment, version and version tag are the population's stamps, which `Population.deploy`
 * validates against its registry (PC-SCOPE-03); the population has one tenant, so a tenant stays refused.
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

/**
 * The first refusal: references, profile options, a process not marked executable, the carried DMN resources, then
 * called-process bindings, the process levels' Event Sub-Processes, flows and elements in program order, the instances
 * of each loop, the Conditional starts of each process level, then the Message and the Signal names of the whole program.
 */
export function admit(program: Program): string | null {
  const throws = program.elements.filter(compensationThrow);
  return first(
    () => FlowAdmission.references(program),
    () => Scopes.membership(program),
    () => Profile.options(abnormalScope(program), loops(program), program.options),
    () => executable(program),
    () => Decision.resources(program),
    () => firstOf(program.processes, calledProcessBinding),
    () => processEventSubProcesses(program),
    () => firstOf(program.flows, (entry) => flow(program, entry)),
    () => firstOf(program.elements, (entry) => element(program, throws, entry)),
    () => firstOf(program.elements, (entry) => loopInstances(program, entry)),
    () => Starts.startConditions(program),
    () => Subscriptions.messageNames(program.options, program.elements.flatMap((entry) => sites(program, messages, entry))),
    () => signalDeclarations(program),
  );
}

/**
 * Admission registry, transcribed from `Kernel/AdmissionRegistry.lean`: the first refusal of any element, in program
 * order. Only `run.ts` imports it.
 */
import {
  ElementTag,
  EventRoleTag,
  assertNever,
  elementEnvelope,
  elementEvent,
  elementScope,
  firstOf,
  programChildren,
  programElement,
  programInCalledProcess,
  workCall,
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
  type Program,
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
      return Propagation.throwRecord(inTransaction(program, header), role.record);
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

/** `throws` lists the program's Compensation throws. */
function element(program: Program, throws: readonly Element[], entry: Element): string | null {
  const header = entry.header;
  switch (entry.tag) {
    case ElementTag.Activity: {
      const payload = entry.payload;
      const call = workCall(payload.work);
      const loop = payload.envelope.multiInstance;
      return first(
        () => Data.origin(header),
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
        () => Subscriptions.boundaries(program.options, subscriptionReading(program, header.parent), false, payload.envelope.boundaries),
        () => boundaryData(program, header, payload.envelope.boundaries),
        () => Scopes.nestedCompensation(program, throws, header, payload.envelope),
      );
    }
    case ElementTag.Scope: {
      const payload = entry.payload;
      const subProcess = Scopes.eventSubProcessOf(payload);
      return first(
        () => Data.origin(header),
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
          program.options, subscriptionReading(program, header.parent), Scopes.isTransaction(payload), payload.envelope.boundaries),
        () => boundaryData(program, header, payload.envelope.boundaries),
        () => Scopes.nestedCompensation(program, throws, header, payload.envelope),
      );
    }
    case ElementTag.Event:
      return Data.origin(header) ?? eventRole(program, header, entry.payload);
    case ElementTag.Gateway:
      return Data.origin(header) ?? FlowAdmission.gateway(program, entry.payload);
    case ElementTag.Start: {
      const subscription = entry.payload.subscription;
      return first(
        () => Data.origin(header),
        () => FlowAdmission.startCombination(program, header),
        () => (subscription === null
          ? null
          : Subscriptions.start(program.options, subscriptionReading(program, header.id), header.parent !== null, subscription) ??
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
 * A called process is bound at assembly to the one definition the program carries, so its definition names no binding
 * of its own (PC-SCOPE-03).
 */
function calledProcessBinding(process: CalledProcess): string | null {
  const definition = process.definition;
  const bound = definition.version !== null || definition.versionTag !== null || definition.deployment !== null ||
    definition.tenant !== null;
  return bound ? "process.definition.binding" : null;
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
 * called-process bindings, the process levels' Event Sub-Processes, flows and elements in program order.
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
  );
}

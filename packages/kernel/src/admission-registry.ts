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
  workCall,
  type ActivityPayload,
  type Boundary,
  type CalledProcess,
  type Element,
  type ElementId,
  type EventPayload,
  type Flow,
  type Header,
  type Program,
  type Subscription,
} from "./il/types.js";
import * as Data from "./admission/data.js";
import * as FlowAdmission from "./admission/flow.js";
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
  // CIB skips a compensation handler's loop marks (`BpmnParse.java:2416`), which `step.ts` `marks` would read.
  if (handler && payload.envelope.multiInstance !== null) return "compensation.handlerMultiInstance";
  if (Scopes.implicitChild(program, header) && !Work.beginsWithoutToken(payload.work)) return "scope.implicitStart";
  return null;
}

function subscriptionData(program: Program, subscription: Subscription): string | null {
  return Data.mappings(program.options.evaluator, subscription.outputs);
}

function boundaryData(program: Program, boundaries: readonly Boundary[]): string | null {
  for (const boundary of boundaries) {
    const refused = subscriptionData(program, boundary.subscription);
    if (refused !== null) return refused;
  }
  return null;
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
      return Subscriptions.catchEvent(role.subscription) ?? subscriptionData(program, role.subscription);
    case EventRoleTag.Throw:
      return Propagation.throwRecord(inTransaction(program, header), role.record);
    case EventRoleTag.LinkCatch:
    case EventRoleTag.LinkThrow:
      return FlowAdmission.link(program, header, payload);
  }
  return assertNever(role);
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
        () => Data.envelope(program.options.evaluator, payload.envelope),
        () => (call === null
          ? null
          : Data.mappings(program.options.evaluator, call.inputs) ?? Data.mappings(program.options.evaluator, call.outputs)),
        () => Work.activity(program, payload),
        () => activityOrigin(program, header, payload),
        () => (loop === null ? null : MultiInstance.activity(Work.instanceBody(payload.work), payload.envelope, loop)),
        () => Subscriptions.boundaries(program.options.errorCatchVariables, false, payload.envelope.boundaries),
        () => boundaryData(program, payload.envelope.boundaries),
        () => Scopes.nestedCompensation(program, throws, header, payload.envelope),
      );
    }
    case ElementTag.Scope: {
      const payload = entry.payload;
      const subProcess = Scopes.eventSubProcessOf(payload);
      return first(
        () => Data.origin(header),
        () => Data.envelope(program.options.evaluator, payload.envelope),
        () => Scopes.scope(program, header, payload),
        () => (subProcess === null ? null : Subscriptions.eventSubProcess(subProcess[0], subProcess[1])),
        () => Subscriptions.boundaries(
          program.options.errorCatchVariables, Scopes.isTransaction(payload), payload.envelope.boundaries),
        () => boundaryData(program, payload.envelope.boundaries),
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
        () => FlowAdmission.start(program, header),
        () => (subscription === null
          ? null
          : Subscriptions.start(program.options.errorCatchVariables, header.parent !== null, subscription) ??
            subscriptionData(program, subscription)),
      );
    }
  }
  return assertNever(entry);
}

/** Whether the program's shape reaches an abnormal scope end: a Terminate in a Sub-Process or an interrupting Event Sub-Process. */
function abnormalScope(program: Program): boolean {
  return program.elements.some((entry) => {
    const throw_ = thrown(entry);
    const scope = elementScope(entry);
    return (throw_ !== null && throw_[0].parent !== null && throw_[1].terminates) ||
      (scope !== null && Scopes.interruptingStart(scope[1]) !== null);
  });
}

/** A flow's condition, then where it may sit. */
function flow(program: Program, entry: Flow): string | null {
  return Data.flowCondition(program.options.evaluator, entry) ?? FlowAdmission.conditionalOutflow(program, entry);
}

/**
 * A called process is bound at assembly to the one definition the program carries, so its definition names no binding
 * of its own (PC-SCOPE-03).
 */
function calledProcess(process: CalledProcess): string | null {
  const definition = process.definition;
  const bound = definition.version !== null || definition.versionTag !== null || definition.deployment !== null ||
    definition.tenant !== null;
  return bound ? "process.definition.binding" : null;
}

/** The first refusal: references, profile options, then called-process bindings, flows and elements in program order. */
export function admit(program: Program): string | null {
  const throws = program.elements.filter(compensationThrow);
  return first(
    () => FlowAdmission.references(program),
    () => Scopes.references(program),
    () => Profile.options(abnormalScope(program), program.options),
    () => firstOf(program.processes, calledProcess),
    () => firstOf(program.flows, (entry) => flow(program, entry)),
    () => firstOf(program.elements, (entry) => element(program, throws, entry)),
  );
}

function firstOf<T>(items: readonly T[], check: (item: T) => string | null): string | null {
  for (const item of items) {
    const refused = check(item);
    if (refused !== null) return refused;
  }
  return null;
}

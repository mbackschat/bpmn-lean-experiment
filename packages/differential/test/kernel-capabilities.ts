/**
 * The capability catalog variants an admitted kernel program exercises: the one table from the IL's own kinds to the
 * product-facing variants of `model-corpus/mvp-capabilities.ts`.
 *
 * Claims are read from the program the kernel admitted, never from the BPMN source, so a form the kernel refuses claims
 * nothing and no construct taxonomy exists beside the reader. Each guarded IL type is matched here in exactly one
 * exhaustive `switch`, the boundary dispatch module of this package for the corpus claims. A kind with no catalog
 * variant at its site is collected as an unclassified construct and fails the whole program, so a construct claims only
 * once its catalog row exists. Which forms, placements and hosts a kind admits stays the kernel's admission: this table
 * restates none of it.
 */
import {
  ElementTag, EventRoleTag, GatewayKindTag, MappingDialect, MultiInstanceMode, Placement, ScopeKindTag, ThrowTag,
  TimerScheduleTag, TriggerTag, WorkTag, assertNever, elementScope,
} from "@bpmn-lean/kernel";
import type {
  Element, Envelope, EventPayload, GatewayKind, Header, Mapping, MultiInstance, Program, ScopeKind, Subscription, Throw,
  Work,
} from "@bpmn-lean/kernel";

import type { MvpBpmnCapabilityId } from "../../../model-corpus/mvp-capabilities.ts";

/** Thrown for an admitted program with a construct no catalog variant names; the message lists every such construct. */
export class UnclassifiedProgramError extends Error {}

/**
 * Where a subscription sits, which decides its variant. A boundary carries its host's own variant and loop; an Event
 * Sub-Process's start is its trigger, claimed with the Event Sub-Process.
 */
type Site =
  | Readonly<{ at: "start" | "catch" | "eventSubProcess" }>
  | Readonly<{ at: "boundary"; host: MvpBpmnCapabilityId; loop: MultiInstance | null; interrupting: boolean }>;

type BoundarySite = Extract<Site, { at: "boundary" }>;

type Claims = Readonly<{
  add: (capability: MvpBpmnCapabilityId) => void;
  unclassified: (construct: string) => void;
}>;

/** What a Scope contributes to its children's variants. */
type ScopeFacts = Readonly<{ variant: MvpBpmnCapabilityId; eventSubProcess: boolean; compensation: boolean }>;

/**
 * The variants `program` exercises, sorted.
 *
 * @throws UnclassifiedProgramError naming every construct of the program that no catalog variant covers.
 */
export function programCapabilities(program: Program): ReadonlyArray<MvpBpmnCapabilityId> {
  const capabilities = new Set<MvpBpmnCapabilityId>(["process"]);
  const unclassified = new Set<string>();
  const claims: Claims = { add: (id) => capabilities.add(id), unclassified: (construct) => unclassified.add(construct) };
  if (program.flows.length > 0) capabilities.add("sequenceFlow");
  const scopes = new Map<string, ScopeFacts>();
  for (const element of program.elements) {
    const scope = elementScope(element);
    if (scope !== null) scopes.set(scope[0].id, scopeFacts(scope[1].kind, claims));
  }
  for (const element of program.elements) elementClaims(element, scopes, claims);
  if (unclassified.size > 0) {
    throw new UnclassifiedProgramError(`unclassified admitted constructs: ${[...unclassified].sort().join("; ")}`);
  }
  return Object.freeze([...capabilities].sort());
}

function elementClaims(element: Element, scopes: ReadonlyMap<string, ScopeFacts>, claims: Claims): void {
  const parent = element.header.parent === null ? undefined : scopes.get(element.header.parent);
  switch (element.tag) {
    case ElementTag.Activity: {
      const host = activityVariant(element.header, element.payload.work, element.payload.envelope, parent, claims);
      if (host !== null) envelopeClaims(host, element.payload.envelope, claims);
      return;
    }
    case ElementTag.Scope: {
      const facts = scopes.get(element.header.id);
      if (facts !== undefined) envelopeClaims(facts.variant, element.payload.envelope, claims);
      return;
    }
    case ElementTag.Event:
      eventClaims(element.payload, claims);
      return;
    case ElementTag.Gateway:
      claims.add(gatewayVariant(element.payload.kind));
      return;
    case ElementTag.Start:
      if (parent?.eventSubProcess === true) return;
      if (element.payload.subscription === null) claims.add("noneStartEvent");
      else subscriptionClaims(element.payload.subscription, { at: "start" }, claims);
      return;
  }
  assertNever(element);
}

/** A looping host claims the Multi-Instance variant beside its own; its boundaries claim with the host's variant. */
function envelopeClaims(host: MvpBpmnCapabilityId, envelope: Envelope, claims: Claims): void {
  claims.add(host);
  if (envelope.multiInstance !== null) claims.add("multiInstanceActivity");
  for (const boundary of envelope.boundaries) {
    subscriptionClaims(boundary.subscription,
      { at: "boundary", host, loop: envelope.multiInstance, interrupting: boundary.interrupting }, claims);
  }
}

/**
 * The variant of an Activity, which is also its boundaries' host. Service work keeps the BPMN element it was read from
 * (`Header.sourceType`), as the catalog names it: a configured Task and a configured Send Task are Service work too.
 */
function activityVariant(
  head: Header, work: Work, envelope: Envelope, parent: ScopeFacts | undefined, claims: Claims,
): MvpBpmnCapabilityId | null {
  switch (work.tag) {
    case WorkTag.None:
      return "abstractTask";
    case WorkTag.Manual:
      return "manualTask";
    case WorkTag.User:
      userTaskClaims(envelope, claims);
      return "userTask";
    case WorkTag.Receive:
      if (work.payload.message.correlation.length > 0) claims.add("messageKeyCorrelation");
      return "receiveTask";
    case WorkTag.Service:
      return serviceVariant(head, envelope, parent, claims);
    case WorkTag.Send:
      return "sendTask";
    case WorkTag.Script:
      return "scriptTask";
    case WorkTag.Rule:
      return "businessRuleTask";
    case WorkTag.Call: {
      const mappings = [...work.payload.inputs, ...work.payload.outputs];
      if (mappings.some(isDataAssociation)) return "callActivityScalarData";
      return mappings.length > 0 || work.payload.propagateAllInputs || work.payload.propagateAllOutputs ||
          work.payload.businessKey !== null
        ? "callActivityVariableMappings"
        : "callActivity";
    }
  }
  return assertNever(work);
}

/**
 * The catalog's Service work variants by the BPMN element the reader read them from; a Business Rule Task without a
 * decisionRef runs its declared implementation as Service work.
 */
const serviceSources: Readonly<Record<string, MvpBpmnCapabilityId>> = {
  serviceTask: "serviceTask",
  task: "configuredTask",
  sendTask: "sendTask",
  businessRuleTask: "businessRuleTask",
};

/** A Service Task that is a compensation handler, by its `isForCompensation` mark or as the body of a Compensation Event Sub-Process. */
function serviceVariant(
  head: Header, envelope: Envelope, parent: ScopeFacts | undefined, claims: Claims,
): MvpBpmnCapabilityId | null {
  const variant = serviceSources[head.sourceType];
  if (variant === undefined) {
    claims.unclassified(`service work on ${head.sourceType}`);
    return null;
  }
  return variant === "serviceTask" && (envelope.forCompensation || parent?.compensation === true)
    ? "compensationHandlerServiceTask"
    : variant;
}

function userTaskClaims(envelope: Envelope, claims: Claims): void {
  if (envelope.multiInstance !== null) {
    claims.add(multiInstanceVariants(envelope.multiInstance).userTask);
    return;
  }
  const input = envelope.inputs.some(isDataAssociation);
  const output = envelope.outputs.some(isDataAssociation);
  if (input && output) claims.add("directDataInputOutputUserTask");
  else if (input) claims.add("directDataInputUserTask");
  else if (output) claims.add("directDataOutputUserTask");
}

function multiInstanceVariants(loop: MultiInstance): Readonly<{ userTask: MvpBpmnCapabilityId; boundaryTimer: MvpBpmnCapabilityId }> {
  switch (loop.mode) {
    case MultiInstanceMode.Sequential:
      return { userTask: "sequentialMultiInstanceUserTask", boundaryTimer: "interruptingSequentialMultiInstanceBoundaryTimerEvent" };
    case MultiInstanceMode.Parallel:
      return { userTask: "parallelMultiInstanceUserTask", boundaryTimer: "interruptingParallelMultiInstanceBoundaryTimerEvent" };
  }
  return assertNever(loop.mode);
}

function isDataAssociation(mapping: Mapping): boolean {
  switch (mapping.dialect) {
    case MappingDialect.DataAssociation: return true;
    case MappingDialect.IoParameter: case MappingDialect.CallVariable: return false;
  }
  return assertNever(mapping.dialect);
}

/** A Scope's variant; an Event Sub-Process's start claims at its own site, a Compensation one marking its body as the handler. */
function scopeFacts(kind: ScopeKind, claims: Claims): ScopeFacts {
  switch (kind.tag) {
    case ScopeKindTag.Embedded:
      return { variant: "embeddedSubProcess", eventSubProcess: false, compensation: false };
    case ScopeKindTag.Transaction:
      return { variant: "transaction", eventSubProcess: false, compensation: false };
    case ScopeKindTag.EventSubProcess:
      return {
        variant: "eventSubProcess", eventSubProcess: true,
        compensation: subscriptionClaims(kind.start, { at: "eventSubProcess" }, claims),
      };
  }
  return assertNever(kind);
}

function gatewayVariant(kind: GatewayKind): MvpBpmnCapabilityId {
  switch (kind.tag) {
    case GatewayKindTag.Exclusive: return "exclusiveGateway";
    case GatewayKindTag.Parallel: return "parallelGateway";
    case GatewayKindTag.Inclusive: return "inclusiveGateway";
    case GatewayKindTag.EventBased: return "eventBasedGateway";
  }
  return assertNever(kind);
}

function eventClaims(payload: EventPayload, claims: Claims): void {
  const role = payload.role;
  switch (role.tag) {
    case EventRoleTag.Catch:
      subscriptionClaims(role.subscription, { at: "catch" }, claims);
      return;
    case EventRoleTag.Throw:
      throwClaims(role.record, isFinish(payload.placement), claims);
      return;
    case EventRoleTag.LinkCatch:
    case EventRoleTag.LinkThrow:
      claims.add("linkIntermediateEventPair");
      return;
  }
  assertNever(role);
}

function throwClaims(thrown: Throw, end: boolean, claims: Claims): void {
  const site = end ? "end" : "intermediate";
  switch (thrown.tag) {
    case ThrowTag.None:
      claims.add(end ? "noneEndEvent" : "noneIntermediateThrowEvent");
      return;
    case ThrowTag.Error:
      if (end) claims.add("errorEndEvent");
      else claims.unclassified(`error ${site} throw`);
      return;
    case ThrowTag.Terminate:
      if (end) claims.add("terminateEndEvent");
      else claims.unclassified(`terminate ${site} throw`);
      return;
    case ThrowTag.Cancel:
      if (end) claims.add("cancelEndEvent");
      else claims.unclassified(`cancel ${site} throw`);
      return;
    case ThrowTag.Compensation:
      claims.add(end ? "compensationEndEvent" : "compensationIntermediateThrowEvent");
      return;
    case ThrowTag.Message:
      claims.add(end ? "messageEndEvent" : "messageIntermediateThrowEvent");
      return;
    case ThrowTag.Signal:
      claims.add(end ? "signalEndEvent" : "signalIntermediateThrowEvent");
      return;
    case ThrowTag.Escalation:
      claims.add(end ? "escalationEndEvent" : "escalationIntermediateThrowEvent");
      return;
  }
  assertNever(thrown);
}

function isFinish(placement: Placement): boolean {
  switch (placement) {
    case Placement.Finish: return true;
    case Placement.Intermediate: return false;
  }
  return assertNever(placement);
}

/**
 * The one match on `Trigger`: the variants of a subscription at its site. Returns whether it opens a compensation
 * handler, which only a Compensation Event Sub-Process's start does.
 */
function subscriptionClaims(subscription: Subscription, site: Site, claims: Claims): boolean {
  const trigger = subscription.trigger;
  switch (trigger.tag) {
    case TriggerTag.Timer:
      if (site.at === "start") claims.add("timerStartEvent");
      else if (site.at === "catch") claims.add("intermediateCatchTimerEvent");
      else if (site.at === "boundary") {
        claims.add("timerBoundaryEvent");
        timerBoundaryClaims(site, isCycle(trigger.payload.schedule.tag), claims);
      }
      return false;
    case TriggerTag.Message:
      if (trigger.payload.correlation.length > 0) claims.add("messageKeyCorrelation");
      if (site.at === "start") claims.add("messageStartEvent");
      else if (site.at === "catch") {
        claims.add("intermediateCatchMessageEvent");
        if (subscription.outputs.some(isDataAssociation)) claims.add("messagePayloadCatchEvent");
      } else if (site.at === "boundary") {
        claims.add("messageBoundaryEvent");
        if (site.host === "userTask") {
          claims.add(site.interrupting ? "interruptingUserTaskBoundaryMessageEvent" : "nonInterruptingUserTaskBoundaryMessageEvent");
        }
      }
      return false;
    case TriggerTag.Error:
      if (site.at === "boundary") {
        claims.add("errorBoundaryEvent");
        if (site.host === "serviceTask") claims.add("serviceTaskBoundaryErrorEvent");
        else if (site.host === "embeddedSubProcess") claims.add("subProcessBoundaryErrorEvent");
      } else if (site.at !== "eventSubProcess") claims.unclassified(`error ${siteName(site)}`);
      return false;
    case TriggerTag.Cancel:
      if (site.at === "boundary") claims.add("transactionCancelBoundaryEvent");
      else if (site.at !== "eventSubProcess") claims.unclassified(`cancel ${siteName(site)}`);
      return false;
    case TriggerTag.Compensation:
      if (site.at === "boundary") claims.add("compensationBoundaryEvent");
      else if (site.at === "eventSubProcess") claims.add("compensationEventSubProcess");
      else claims.unclassified(`compensation ${siteName(site)}`);
      return site.at === "eventSubProcess";
    case TriggerTag.Signal:
      if (site.at === "start") claims.add("signalStartEvent");
      else if (site.at === "catch") claims.add("intermediateCatchSignalEvent");
      else if (site.at === "boundary") claims.add("signalBoundaryEvent");
      return false;
    case TriggerTag.Condition:
      if (site.at === "start") claims.add("conditionalStartEvent");
      else if (site.at === "catch") claims.add("intermediateCatchConditionalEvent");
      else if (site.at === "boundary") claims.add("conditionalBoundaryEvent");
      return false;
    case TriggerTag.Escalation:
      if (site.at === "boundary") claims.add("escalationBoundaryEvent");
      else if (site.at !== "eventSubProcess") claims.unclassified(`escalation ${siteName(site)}`);
      return false;
  }
  return assertNever(trigger);
}

/** The host-specific Timer boundary rows, claimed beside the generic one where a row names the host and the form. */
function timerBoundaryClaims(site: BoundarySite, recurring: boolean, claims: Claims): void {
  if (recurring) {
    if (site.interrupting || site.loop !== null) return;
    if (site.host === "userTask") claims.add("recurringUserTaskBoundaryTimerEvent");
    else if (site.host === "embeddedSubProcess") claims.add("recurringSubProcessBoundaryTimerEvent");
  } else if (site.host === "userTask") {
    if (site.loop === null) {
      claims.add(site.interrupting ? "interruptingUserTaskBoundaryTimerEvent" : "nonInterruptingUserTaskBoundaryTimerEvent");
    } else if (site.interrupting) claims.add(multiInstanceVariants(site.loop).boundaryTimer);
  } else if (site.host === "embeddedSubProcess") {
    claims.add(site.interrupting ? "interruptingSubProcessBoundaryTimerEvent" : "nonInterruptingSubProcessBoundaryTimerEvent");
  }
}

function siteName(site: Site): string {
  return site.at === "boundary" ? `boundary on ${site.host}` : site.at;
}

function isCycle(tag: TimerScheduleTag): boolean {
  switch (tag) {
    case TimerScheduleTag.Cycle: return true;
    case TimerScheduleTag.Duration: case TimerScheduleTag.Date: return false;
  }
  return assertNever(tag);
}

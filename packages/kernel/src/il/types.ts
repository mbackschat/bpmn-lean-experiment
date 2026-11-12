/**
 * Kernel IL, transcribed from `Kernel/IL/Types.lean`, which is the authority.
 *
 * The kernel's program representation: a flat table of elements keyed by identifier, each a header plus one payload
 * record. A field the admitted surface does not cover is refused by the admission modules, never left out of these
 * types. A Lean inductive whose constructors carry arguments is a discriminated union whose `tag` is an enum member
 * spelled exactly as the Lean constructor, so the codec's constructor tables and the derived JSON tags coincide; an
 * all-nullary Lean inductive is a plain string enum. `Option` is `T | null`, `Nat` and `Int` are safe integers, and
 * `ElementId`/`FlowId` are plain strings as on the wire. A Lean query `T.f` is exported as `tF`, `?` dropped.
 */

import { CalledElementResolution, type ProfileOptions } from "./types/options.js";
import {
  ExpressionTag, MappingDialect, SimpleBooleanTag, ValueSourceTag, ValueTag, type Expression, type Mapping,
  type SimpleBoolean, type Value, type ValueSource,
} from "./types/expression.js";
import type { Decision, DecisionResource } from "./types/decision.js";
import {
  type CallWork, callWorkSelects, callWorkNamesDefinition, type DefinitionRef, definitionRefEquals,
  type ProgramIdentity, type QName,
} from "./types/reference.js";
import type { MultiInstance } from "./types/multi-instance.js";
import { assertNever } from "./types/expression.js";
import type { EffectBinding, MessageTrigger } from "./types/message.js";
import type { Work } from "./types/work.js";
export { integerLexeme, isAscii, parseJavaInt, parseJavaLong, signedDigits, withinJavaInt } from "./types/lexical.js";
export {
  CollectionRead, type InstanceCount, InstanceCountTag, type MultiInstance, MultiInstanceMode,
} from "./types/multi-instance.js";
export {
  AbnormalScopeEnd, CallBindingTime, type CompensationHandlerFailure, CompensationHandlerFailureTag, CompensationOrder,
  ImplicitCompensation, ErrorExitCompensation, MultiInstanceCompensation, TransactionMethods, CompensationReferenceScope,
  ConditionOrder, ContinuationFailure, DeliveryVariables, ErrorPathOutputs, Evaluator, MessageCorrelation, RaisedCallOutputs,
  MultiInstanceFinalBody, MultiInstanceOutputs, type ProfileOptions, SubmissionRule, TechnicalFailure, UndeclaredWrite,
  UnhandledError, ErrorCatchVariables,
  MultiInstanceBinding, ResultValues, OutputContext, MultiInstanceCounters, MultiInstanceInputFailure, MultiInstanceCount,
  multiInstanceCounterNames, BusinessRuleTask, InclusiveJoinReach, BranchSchedule, ConditionalRetrigger, MalformedTimer, MessageNames,
  ScopeStart, SignalNames, SignalPayload, SignalDelivery, ConditionalStart, CalledElementResolution, MessageThrowForms,
} from "./types/options.js";
export {
  ExpressionTag, MappingDialect, SimpleBooleanTag, ValueSourceTag, ValueTag, type Expression, type Mapping,
  type SimpleBoolean, type Value, type ValueSource,
};
export {
  type CallBinding, CallBindingTag, type CallWork, callWorkSelects, callWorkNamesDefinition, type DefinitionRef, definitionRefEquals,
  definitionRefEligibleFor, type ProgramIdentity, type QName,
} from "./types/reference.js";
export { assertNever };
export type { CorrelationCriterion, EffectBinding, MessageTrigger } from "./types/message.js";
export {
  DecisionResultMapping, type ReceiveWork, type RuleWork, type ScriptWork, type SendWork, type ServiceWork, type UserWork, type Work,
  WorkTag, workCall, workIsService, workIsUser, workReceive, workResults,
} from "./types/work.js";

export type ElementId = string;
export type FlowId = string;

/** Lean's `String` order: lexicographic by Unicode scalar value, not by UTF-16 code unit. */
export function compareStrings(left: string, right: string): number {
  const a = Array.from(left, (char) => char.codePointAt(0) ?? 0);
  const b = Array.from(right, (char) => char.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

/**
 * Lean's `List.mergeSort` with its `le` comparator, transcribed rather than delegated to `Array.prototype.sort` so that
 * the result agrees with Lean's even for a comparator that is not a total preorder: the first half takes `⌈n/2⌉` items
 * and a merge prefers the left item when `le left right`.
 */
export function mergeSort<T>(items: readonly T[], le: (left: T, right: T) => boolean): readonly T[] {
  if (items.length < 2) return items;
  const half = Math.floor((items.length + 1) / 2);
  const left = mergeSort(items.slice(0, half), le);
  const right = mergeSort(items.slice(half), le);
  const merged: T[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const x = left[i] as T;
    const y = right[j] as T;
    if (le(x, y)) {
      merged.push(x);
      i += 1;
    } else {
      merged.push(y);
      j += 1;
    }
  }
  return [...merged, ...left.slice(i), ...right.slice(j)];
}

/** Lean's `List.findSome?` over refusal checks: the first refusal code an item draws, `null` when none does. */
export function firstOf<T>(items: readonly T[], check: (item: T) => string | null): string | null {
  for (const item of items) {
    const refused = check(item);
    if (refused !== null) return refused;
  }
  return null;
}

/** Lean's `String.utf8ByteSize`, counted per code point; a lone surrogate counts as its replacement character. */
export function utf8ByteSize(text: string): number {
  let size = 0;
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0;
    size += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return size;
}

/** Lean's `List.eraseDups` length: the number of distinct members. */
export function distinctCount<T>(items: readonly T[]): number { return new Set(items).size; }


// Subscriptions

export enum CycleDialect { Iso8601 = "iso8601", Cron = "cron" }

export enum TimerScheduleTag { Duration = "duration", Date = "date", Cycle = "cycle" }

export type TimerSchedule =
  | { readonly tag: TimerScheduleTag.Duration; readonly value: ValueSource }
  | { readonly tag: TimerScheduleTag.Date; readonly value: ValueSource }
  | { readonly tag: TimerScheduleTag.Cycle; readonly value: ValueSource; readonly dialect: CycleDialect };

export interface TimerTrigger { readonly schedule: TimerSchedule; }

/**
 * `signalRef` is the Signal the event references, `null` when the model names none; `name` is that Signal's `name`
 * (BPMN 2.0.2 Table 10.100), `null` when it has none.
 */
export interface SignalTrigger { readonly signalRef: QName | null; readonly name: ValueSource | null; }

/**
 * A variable write a Conditional Event's `camunda:variableEvents` filter can name (`ConditionalEventDefinition.java:91-113`):
 * the kind of every write the kernel logs. Each value is its source name.
 */
export enum VariableEvent { Create = "create", Update = "update", Delete = "delete" }

/** Whether `name` names a variable event; the filter's names stay source text, so admission refuses any other. */
export function variableEventNamed(name: string): boolean {
  return (Object.values(VariableEvent) as string[]).includes(name);
}

export interface ConditionTrigger {
  readonly condition: Expression;
  readonly variableName: string | null;
  readonly variableEvents: readonly string[];
}

/** `code = null` catches every Error. */
export interface ErrorTrigger {
  readonly code: string | null;
  readonly codeVariable: string | null;
  readonly messageVariable: string | null;
}

/** `code = null` catches every Escalation. */
export interface EscalationTrigger { readonly code: string | null; readonly codeVariable: string | null; }

/** Guarded type: `feature/subscriptions` owns matching on it. */
export enum TriggerTag {
  Timer = "timer",
  Message = "message",
  Signal = "signal",
  Condition = "condition",
  Error = "error",
  Escalation = "escalation",
  Compensation = "compensation",
  Cancel = "cancel",
}

export type Trigger =
  | { readonly tag: TriggerTag.Timer; readonly payload: TimerTrigger }
  | { readonly tag: TriggerTag.Message; readonly payload: MessageTrigger }
  | { readonly tag: TriggerTag.Signal; readonly payload: SignalTrigger }
  | { readonly tag: TriggerTag.Condition; readonly payload: ConditionTrigger }
  | { readonly tag: TriggerTag.Error; readonly payload: ErrorTrigger }
  | { readonly tag: TriggerTag.Escalation; readonly payload: EscalationTrigger }
  | { readonly tag: TriggerTag.Compensation }
  | { readonly tag: TriggerTag.Cancel };

/**
 * `alternatives` are a Multiple Event's definitions after the first, in document order, and `parallelMultiple` its
 * Parallel Multiple mark (BPMN 2.0.2 §10.5.1); admission refuses both (CIB-LIM-0008).
 */
export interface Subscription {
  readonly trigger: Trigger;
  readonly outputs: readonly Mapping[];
  readonly alternatives: readonly Trigger[];
  readonly parallelMultiple: boolean;
}

/** `sourceId` as `ElementOrigin.sourceId`: the identifier the author wrote; `id` is unique in the program. */
export interface Boundary {
  readonly id: ElementId;
  readonly sourceId: string;
  readonly subscription: Subscription;
  readonly interrupting: boolean;
  readonly outgoing: readonly FlowId[];
}

// Throws

/** `binding = null` is an unbound pass-through (PC-MESSAGE-09); `handlerKey` as `ServiceWork.handlerKey`. */
export interface MessageThrow {
  readonly binding: EffectBinding | null;
  readonly handlerKey: string | null;
  readonly payload: readonly Mapping[];
}

/**
 * `signalRef` and `name` as `SignalTrigger`'s; `propagateAll` is the position among `payload` at which
 * `camunda:in variables="all"` copies every visible variable (PC-SIGNAL-01).
 */
export interface SignalThrow {
  readonly signalRef: QName | null;
  readonly name: ValueSource | null;
  readonly payload: readonly Mapping[];
  readonly propagateAll: number | null;
  readonly localOnly: boolean;
  readonly businessKey: Expression | null;
  readonly asynchronous: boolean;
}

export interface ErrorThrow { readonly code: string; readonly message: ValueSource | null; }

export interface EscalationThrow { readonly code: string; }

export interface CompensationThrow { readonly activity: ElementId | null; readonly waitForCompletion: boolean; }

/** Guarded type: `feature/propagation` owns matching on it. */
export enum ThrowTag {
  None = "none",
  Message = "message",
  Signal = "signal",
  Error = "error",
  Escalation = "escalation",
  Compensation = "compensation",
  Cancel = "cancel",
  Terminate = "terminate",
}

export type Throw =
  | { readonly tag: ThrowTag.None }
  | { readonly tag: ThrowTag.Message; readonly payload: MessageThrow }
  | { readonly tag: ThrowTag.Signal; readonly payload: SignalThrow }
  | { readonly tag: ThrowTag.Error; readonly payload: ErrorThrow }
  | { readonly tag: ThrowTag.Escalation; readonly payload: EscalationThrow }
  | { readonly tag: ThrowTag.Compensation; readonly payload: CompensationThrow }
  | { readonly tag: ThrowTag.Cancel }
  | { readonly tag: ThrowTag.Terminate };

// The shared activity envelope

export interface Envelope {
  readonly incoming: readonly FlowId[];
  readonly outgoing: readonly FlowId[];
  readonly inputs: readonly Mapping[];
  readonly outputs: readonly Mapping[];
  readonly boundaries: readonly Boundary[];
  readonly multiInstance: MultiInstance | null;
  /**
   * The Activities and Scopes an Association names as this element's compensation handlers; admission admits at most
   * one (`compensation.handlerCount`), the list keeps a second for that refusal.
   */
  readonly compensationHandlers: readonly ElementId[];
  /** BPMN `isForCompensation` (Table 10.3): the element is a compensation handler, outside the normal flow. */
  readonly forCompensation: boolean;
  /** PC-CF-07. */
  readonly defaultFlow: FlowId | null;
  /** A transaction boundary before the element begins and after it completes (CIB-EXT-0027). */
  readonly asyncBefore: boolean;
  readonly asyncAfter: boolean;
}

// Elements

export interface ActivityPayload { readonly work: Work; readonly envelope: Envelope; }

/** BPMN `transactionMethod`. CIB reads no such attribute (`BpmnParse#parseTransaction`). */
export enum TransactionMethodTag { Compensate = "compensate", Store = "store", Image = "image", Other = "other" }

export type TransactionMethod =
  | { readonly tag: TransactionMethodTag.Compensate }
  | { readonly tag: TransactionMethodTag.Store }
  | { readonly tag: TransactionMethodTag.Image }
  | { readonly tag: TransactionMethodTag.Other; readonly uri: string };

export interface TransactionScope { readonly method: TransactionMethod; }

/** Guarded type: `feature/scopes` owns matching on it. */
export enum ScopeKindTag { Embedded = "embedded", Transaction = "transaction", EventSubProcess = "eventSubProcess" }

export type ScopeKind =
  | { readonly tag: ScopeKindTag.Embedded }
  | { readonly tag: ScopeKindTag.Transaction; readonly payload: TransactionScope }
  | { readonly tag: ScopeKindTag.EventSubProcess; readonly start: Subscription; readonly interrupting: boolean };

export interface ScopePayload {
  readonly kind: ScopeKind;
  readonly children: readonly ElementId[];
  readonly localVariables: readonly string[];
  /**
   * The item names the Scope declares, which exist per Scope occurrence (BPMN 2.0.2 §10.4.1): its Properties, Data
   * Objects and their references. Admission refuses every reference to one (`data.scopedItem`).
   */
  readonly items: readonly string[];
  readonly envelope: Envelope;
}

export enum Placement { Intermediate = "intermediate", Finish = "finish" }

/** Guarded type: `step.ts` owns matching on it, and `admission-registry.ts`. */
export enum EventRoleTag { Catch = "catch", Throw = "throw", LinkCatch = "linkCatch", LinkThrow = "linkThrow" }

export type EventRole =
  | { readonly tag: EventRoleTag.Catch; readonly subscription: Subscription }
  | { readonly tag: EventRoleTag.Throw; readonly record: Throw }
  | { readonly tag: EventRoleTag.LinkCatch; readonly name: string }
  | { readonly tag: EventRoleTag.LinkThrow; readonly name: string };

/** `alternativeThrows` are a Multiple throw Event's definitions after the first, in document order (BPMN 2.0.2 §10.5.1). */
export interface EventPayload {
  readonly role: EventRole;
  readonly placement: Placement;
  readonly incoming: readonly FlowId[];
  readonly outgoing: readonly FlowId[];
  readonly alternativeThrows: readonly Throw[];
}

/**
 * How an Event-Based Gateway begins (BPMN 2.0.2 §10.6.6): `instantiate="false"` is `none`; `instantiate="true"` is
 * `exclusive`, or `parallel` with `eventGatewayType="Parallel"`, which also reads `parallel` without `instantiate`.
 */
export enum EventGatewayInstantiation { None = "none", Exclusive = "exclusive", Parallel = "parallel" }

/**
 * Guarded type: `feature/flow` owns matching on it. Conditional candidates keep document order; a Sequence Flow's
 * condition lives on the `Flow`. An Event-Based Gateway's arms are the targets of its outgoing flows.
 */
export enum GatewayKindTag {
  Exclusive = "exclusive",
  Parallel = "parallel",
  Inclusive = "inclusive",
  EventBased = "eventBased",
}

export type GatewayKind =
  | { readonly tag: GatewayKindTag.Exclusive; readonly candidates: readonly FlowId[]; readonly default: FlowId | null }
  | { readonly tag: GatewayKindTag.Parallel }
  | { readonly tag: GatewayKindTag.Inclusive; readonly candidates: readonly FlowId[]; readonly default: FlowId | null }
  | { readonly tag: GatewayKindTag.EventBased; readonly instantiation: EventGatewayInstantiation };

export interface GatewayPayload {
  readonly kind: GatewayKind;
  readonly incoming: readonly FlowId[];
  readonly outgoing: readonly FlowId[];
}

export interface StartPayload { readonly subscription: Subscription | null; readonly outgoing: readonly FlowId[]; }

/**
 * `sourceId` is the identifier the model's author wrote, which publication shows. `Header.id` is unique in the program,
 * so that two versions of one called definition can coexist.
 */
export interface ElementOrigin { readonly definition: DefinitionRef | null; readonly sourceId: string; }

export interface Header {
  readonly id: ElementId;
  readonly origin: ElementOrigin;
  readonly sourceType: string;
  readonly parent: ElementId | null;
}

/** Guarded type: `step.ts` owns matching on it, and `admission-registry.ts`. */
export enum ElementTag { Activity = "activity", Scope = "scope", Event = "event", Gateway = "gateway", Start = "start" }

export type Element =
  | { readonly tag: ElementTag.Activity; readonly header: Header; readonly payload: ActivityPayload }
  | { readonly tag: ElementTag.Scope; readonly header: Header; readonly payload: ScopePayload }
  | { readonly tag: ElementTag.Event; readonly header: Header; readonly payload: EventPayload }
  | { readonly tag: ElementTag.Gateway; readonly header: Header; readonly payload: GatewayPayload }
  | { readonly tag: ElementTag.Start; readonly header: Header; readonly payload: StartPayload };

export interface Flow {
  readonly id: FlowId;
  readonly source: ElementId;
  readonly target: ElementId;
  readonly condition: Expression | null;
}

/**
 * A process the program carries besides its root process, for a Call Activity to call: its bound definition and its
 * process-level elements, which have no parent.
 */
export interface CalledProcess {
  readonly definition: DefinitionRef;
  readonly children: readonly ElementId[];
  /**
   * The item names the process declares: its Properties, Data Objects and their references, and its own Data Inputs and
   * Outputs. They are declared at the instance root before any value is bound (BPMN 2.0.2 §10.4.1).
   */
  readonly variables: readonly string[];
  /** Table 10.1 `isExecutable`, absent read as `false`. */
  readonly executable: boolean;
}

/**
 * `processes` lists the called processes; every other parentless element belongs to the root process, whose declared
 * item names are `variables` (as `CalledProcess.variables`).
 */
export interface Program {
  readonly identity: ProgramIdentity;
  readonly options: ProfileOptions;
  readonly elements: readonly Element[];
  readonly flows: readonly Flow[];
  readonly variables: readonly string[];
  readonly processes: readonly CalledProcess[];
  /** Table 10.1 `isExecutable` of the root process, absent read as `false`. */
  readonly executable: boolean;
  /** The DMN resources deployed with the source, which a Business Rule Task's `decisionRef` names. */
  readonly decisionResources: readonly DecisionResource[];
}

// Queries: read-only projections of a `Program`, in this module so that no module beyond the three hubs has more than
// five direct importers (guard 15). They project; they never dispatch on what an element means, so matching here does
// not compete with the dispatch owners.

export function elementHeader(element: Element): Header {
  switch (element.tag) {
    case ElementTag.Activity:
    case ElementTag.Scope:
    case ElementTag.Event:
    case ElementTag.Gateway:
    case ElementTag.Start:
      return element.header;
  }
  return assertNever(element);
}

/** The envelope of an Activity or Scope; other elements have none. */
export function elementEnvelope(element: Element): Envelope | null {
  switch (element.tag) {
    case ElementTag.Activity: case ElementTag.Scope: return element.payload.envelope;
    case ElementTag.Event: case ElementTag.Gateway: case ElementTag.Start: return null;
  }
  return assertNever(element);
}

export function elementActivity(element: Element): readonly [Header, ActivityPayload] | null {
  switch (element.tag) {
    case ElementTag.Activity: return [element.header, element.payload];
    case ElementTag.Scope: case ElementTag.Event: case ElementTag.Gateway: case ElementTag.Start: return null;
  }
  return assertNever(element);
}

export function elementScope(element: Element): readonly [Header, ScopePayload] | null {
  switch (element.tag) {
    case ElementTag.Scope: return [element.header, element.payload];
    case ElementTag.Activity: case ElementTag.Event: case ElementTag.Gateway: case ElementTag.Start: return null;
  }
  return assertNever(element);
}

export function elementEvent(element: Element): readonly [Header, EventPayload] | null {
  switch (element.tag) {
    case ElementTag.Event: return [element.header, element.payload];
    case ElementTag.Activity: case ElementTag.Scope: case ElementTag.Gateway: case ElementTag.Start: return null;
  }
  return assertNever(element);
}

export function elementGateway(element: Element): readonly [Header, GatewayPayload] | null {
  switch (element.tag) {
    case ElementTag.Gateway: return [element.header, element.payload];
    case ElementTag.Activity: case ElementTag.Scope: case ElementTag.Event: case ElementTag.Start: return null;
  }
  return assertNever(element);
}

export function elementStart(element: Element): readonly [Header, StartPayload] | null {
  switch (element.tag) {
    case ElementTag.Start: return [element.header, element.payload];
    case ElementTag.Activity: case ElementTag.Scope: case ElementTag.Event: case ElementTag.Gateway: return null;
  }
  return assertNever(element);
}

/** The subscription of a catch Event. */
export function eventPayloadCatch(payload: EventPayload): Subscription | null {
  switch (payload.role.tag) {
    case EventRoleTag.Catch: return payload.role.subscription;
    case EventRoleTag.Throw: case EventRoleTag.LinkCatch: case EventRoleTag.LinkThrow: return null;
  }
  return assertNever(payload.role);
}

/** The throw of a throw Event. */
export function eventPayloadThrow(payload: EventPayload): Throw | null {
  switch (payload.role.tag) {
    case EventRoleTag.Throw: return payload.role.record;
    case EventRoleTag.Catch: case EventRoleTag.LinkCatch: case EventRoleTag.LinkThrow: return null;
  }
  return assertNever(payload.role);
}

/** The Link name of a throwing Link Event. */
export function eventPayloadLinkThrow(payload: EventPayload): string | null {
  switch (payload.role.tag) {
    case EventRoleTag.LinkThrow: return payload.role.name;
    case EventRoleTag.Catch: case EventRoleTag.Throw: case EventRoleTag.LinkCatch: return null;
  }
  return assertNever(payload.role);
}

/** The Link name of a catching Link Event. */
export function eventPayloadLinkCatch(payload: EventPayload): string | null {
  switch (payload.role.tag) {
    case EventRoleTag.LinkCatch: return payload.role.name;
    case EventRoleTag.Catch: case EventRoleTag.Throw: case EventRoleTag.LinkThrow: return null;
  }
  return assertNever(payload.role);
}

/**
 * A throw as read outside its owners, the IL's one match on `Throw`; `installs` and `installsAll` are what a Signal's
 * receivers install (its payload targets, and every visible name under `propagateAll`), `effect` is a bound Message
 * throw's (PC-MESSAGE-09).
 */
export interface ThrowView { readonly terminates: boolean; readonly compensates: boolean; readonly signal: SignalTrigger | null;
  readonly installs: readonly string[]; readonly installsAll: boolean; readonly effect: EffectBinding | null; }

export function throwView(thrown: Throw): ThrowView {
  const none: ThrowView = { terminates: false, compensates: false, signal: null, installs: [], installsAll: false, effect: null };
  switch (thrown.tag) {
    case ThrowTag.Terminate: return { ...none, terminates: true };
    case ThrowTag.Compensation: return { ...none, compensates: true };
    case ThrowTag.Signal:
      return {
        ...none, signal: { signalRef: thrown.payload.signalRef, name: thrown.payload.name },
        installs: thrown.payload.payload.map((mapping) => mapping.target), installsAll: thrown.payload.propagateAll !== null,
      };
    case ThrowTag.Message: return { ...none, effect: thrown.payload.binding };
    case ThrowTag.None: case ThrowTag.Error: case ThrowTag.Escalation: case ThrowTag.Cancel: return none;
  }
  return assertNever(thrown);
}

/** The effect a bound Message throw opens, as a Service Task's. */
export function throwEffect(thrown: Throw): EffectBinding | null { return throwView(thrown).effect; }

/** The outgoing flows of an element, boundaries' flows excluded. */
export function elementOutgoing(element: Element): readonly FlowId[] {
  switch (element.tag) {
    case ElementTag.Activity: case ElementTag.Scope: return element.payload.envelope.outgoing;
    case ElementTag.Event: case ElementTag.Gateway: case ElementTag.Start: return element.payload.outgoing;
  }
  return assertNever(element);
}

/** The incoming flows of an element; a start Event has none. */
export function elementIncoming(element: Element): readonly FlowId[] {
  switch (element.tag) {
    case ElementTag.Activity: case ElementTag.Scope: return element.payload.envelope.incoming;
    case ElementTag.Event: case ElementTag.Gateway: return element.payload.incoming;
    case ElementTag.Start: return [];
  }
  return assertNever(element);
}

/**
 * A trigger's payload under its kind, `null` under every other: the IL's one match on `Trigger` (`triggerTimer` and so
 * on); `variables` are what a catch of an Error or Escalation sets from what it caught.
 */
export interface TriggerView { readonly timer: TimerTrigger | null; readonly message: MessageTrigger | null;
  readonly signal: SignalTrigger | null; readonly condition: ConditionTrigger | null; readonly variables: readonly string[]; }

export function triggerView(trigger: Trigger): TriggerView {
  const none: TriggerView = { timer: null, message: null, signal: null, condition: null, variables: [] };
  switch (trigger.tag) {
    case TriggerTag.Timer: return { ...none, timer: trigger.payload };
    case TriggerTag.Message: return { ...none, message: trigger.payload };
    case TriggerTag.Signal: return { ...none, signal: trigger.payload };
    case TriggerTag.Condition: return { ...none, condition: trigger.payload };
    case TriggerTag.Error:
      return { ...none, variables: [trigger.payload.codeVariable, trigger.payload.messageVariable].filter((name) => name !== null) };
    case TriggerTag.Escalation: return { ...none, variables: [trigger.payload.codeVariable].filter((name) => name !== null) };
    case TriggerTag.Compensation: case TriggerTag.Cancel: return none;
  }
  return assertNever(trigger);
}

/** The Timer, Message or Conditional trigger of a trigger, if it is one. */
export function triggerTimer(trigger: Trigger): TimerTrigger | null { return triggerView(trigger).timer; }
export function triggerMessage(trigger: Trigger): MessageTrigger | null { return triggerView(trigger).message; }
export function triggerCondition(trigger: Trigger): ConditionTrigger | null { return triggerView(trigger).condition; }

/** The start subscription of an Event Sub-Process scope, if it is one. */
export function scopeKindStart(kind: ScopeKind): Subscription | null {
  switch (kind.tag) {
    case ScopeKindTag.EventSubProcess: return kind.start;
    case ScopeKindTag.Embedded: case ScopeKindTag.Transaction: return null;
  }
  return assertNever(kind);
}

export function valueSourceLiteral(source: ValueSource): string | null {
  switch (source.tag) { case ValueSourceTag.Literal: return source.value; case ValueSourceTag.Expression: return null; }
  return assertNever(source);
}

export function programElement(program: Program, id: ElementId): Element | null {
  return program.elements.find((element) => elementHeader(element).id === id) ?? null;
}

export function programFlow(program: Program, id: FlowId): Flow | null {
  return program.flows.find((flow) => flow.id === id) ?? null;
}

export function programTarget(program: Program, flow: FlowId): ElementId | null {
  return programFlow(program, flow)?.target ?? null;
}

export function programSource(program: Program, flow: FlowId): ElementId | null {
  return programFlow(program, flow)?.source ?? null;
}

/** Whether `element` is a process-level element of a called process. */
export function programInCalledProcess(program: Program, element: ElementId): boolean {
  return program.processes.some((process) => process.children.includes(element));
}

/** The elements whose parent is `parent`; `null` is the root process level. */
export function programChildren(program: Program, parent: ElementId | null): readonly Element[] {
  return program.elements.filter((element) => {
    const header = elementHeader(element);
    return header.parent === parent && !(parent === null && programInCalledProcess(program, header.id));
  });
}

/**
 * Whether the process an instance runs declares the item `name`: the root process for `null`, else the called process
 * of the definition its Call bound.
 */
export function programDeclares(program: Program, definition: DefinitionRef | null, name: string): boolean {
  if (definition === null) return program.variables.includes(name);
  return program.processes.some((process) => definitionRefEquals(process.definition, definition) && process.variables.includes(name));
}

/**
 * The carried processes a Call's selector admits for a caller deployed at `callerDeployment` (`callWorkSelects`);
 * admission requires exactly one. Two versions of one key coexist because `Header.id` stays unique (PC-SCOPE-03).
 */
export function programCalledProcessFor(program: Program, resolution: CalledElementResolution, callerDeployment: number | null,
  work: CallWork): readonly CalledProcess[] {
  const chosen = callWorkSelects(resolution, callerDeployment, work, program.processes.map((process) => process.definition));
  return program.processes.filter((process) => chosen.some((definition) => definitionRefEquals(definition, process.definition)));
}

/** Whether a Call names the root process: by QName under `qualifiedName`, by key text under `cibKey`. */
export function programCallsRoot(program: Program, resolution: CalledElementResolution, work: CallWork): boolean {
  const { processId: key, namespace } = program.identity;
  return callWorkNamesDefinition(resolution, work, { key, namespace, version: null, versionTag: null, deployment: null, tenant: null, sourceSha256: null });
}

/**
 * The decision a DMN resource the program carries declares under `key`; admission refuses a key two resources declare
 * (`decision.duplicateId`).
 */
export function programDecision(program: Program, key: string): Decision | null {
  return program.decisionResources.flatMap((resource) => resource.decisions).find((decision) => decision.id === key) ?? null;
}

/**
 * Whether an element begins when its parent Scope is entered without a none start Event: it has no incoming flow, is
 * no compensation handler, whether an Association names it or it is only marked `isForCompensation`, and is no Event
 * Sub-Process (BPMN 2.0.2 §10.7.1, §13.3.4, §13.5.5).
 */
export function programBeginsImplicitly(program: Program, element: Element): boolean {
  const id = elementHeader(element).id;
  const handler = program.elements.some((other) => elementEnvelope(other)?.compensationHandlers.includes(id) ?? false);
  const marked = elementEnvelope(element)?.forCompensation ?? false;
  const scope = elementScope(element);
  const eventSubProcess = scope !== null && scopeKindStart(scope[1].kind) !== null;
  return elementIncoming(element).length === 0 && elementStart(element) === null && !handler && !marked && !eventSubProcess;
}

/** The process-level elements of a called process. */
export function programProcessChildren(program: Program, process: CalledProcess): readonly Element[] {
  return process.children.flatMap((id) => {
    const element = programElement(program, id);
    return element === null ? [] : [element];
  });
}

/**
 * The elements on the level of `header`'s element: its parent's children, or at a process's top level that process's
 * own, since `programChildren(program, null)` is only the root process's and a called Process behaves as a normal
 * Process (BPMN 2.0.2 §13.3.4).
 */
export function programSiblings(program: Program, header: Header): readonly Element[] {
  const process = header.parent === null ? program.processes.find((candidate) => candidate.children.includes(header.id)) : undefined;
  return process === undefined ? programChildren(program, header.parent) : programProcessChildren(program, process);
}

/**
 * The called process `header`'s element belongs to: the one whose top level holds the element or its outermost
 * enclosing element; `null` for an element of the root process.
 */
export function programProcessOf(program: Program, header: Header): CalledProcess | null {
  let top = header.id;
  for (let fuel = program.elements.length; fuel > 0; fuel -= 1) {
    const element = programElement(program, top);
    const parent = element === null ? null : elementHeader(element).parent;
    if (parent === null) break;
    top = parent;
  }
  return program.processes.find((process) => process.children.includes(top)) ?? null;
}

/**
 * The deploy ordinal a Call on `header`'s element binds at: its copy's, for an element of another deployment's process
 * the program carries, else the program's own, so a process binds the same callees in every program that carries it
 * (PC-SCOPE-03).
 */
export function programCallerDeployment(program: Program, header: Header): number | null {
  return programProcessOf(program, header)?.definition.deployment ?? program.identity.deployment;
}

/**
 * The source element type of an element or boundary, which semantic publication shows. A boundary has no header; BPMN
 * has one element type for it.
 */
export function programSourceType(program: Program, id: ElementId): string | null {
  const element = programElement(program, id);
  if (element !== null) return elementHeader(element).sourceType;
  const host = program.elements.find((candidate) =>
    (elementEnvelope(candidate)?.boundaries ?? []).some((boundary) => boundary.id === id));
  return host === undefined ? null : "boundaryEvent";
}

/** A boundary by its id, with the element it is attached to. */
export function programBoundary(program: Program, id: ElementId): readonly [Element, Boundary] | null {
  for (const element of program.elements) {
    const envelope = elementEnvelope(element);
    const boundary = envelope?.boundaries.find((candidate) => candidate.id === id);
    if (boundary !== undefined) return [element, boundary];
  }
  return null;
}

/** The identifier publication and addressing show for an element or boundary: the one its author wrote. */
export function programPublicId(program: Program, id: ElementId): ElementId {
  const element = programElement(program, id);
  if (element !== null) return elementHeader(element).origin.sourceId;
  return programBoundary(program, id)?.[1].sourceId ?? id;
}

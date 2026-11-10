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

import {
  AbnormalScopeEnd, CallBindingTime, type CompensationHandlerFailure, CompensationHandlerFailureTag, CompensationOrder,
  ConditionOrder, ContinuationFailure, DeliveryVariables, ErrorPathOutputs, Evaluator, MessageCorrelation,
  MultiInstanceFinalBody, MultiInstanceOutputs, type ProfileOptions, SubmissionRule, TechnicalFailure, UndeclaredWrite,
  UnhandledError, ErrorCatchVariables,
  MultiInstanceBinding, ResultValues, OutputContext, MultiInstanceCounters, MultiInstanceInputFailure, MultiInstanceCount,
  multiInstanceCounterNames, BusinessRuleTask, InclusiveJoinReach, BranchSchedule,
} from "./types/options.js";
import {
  ExpressionTag, MappingDialect, SimpleBooleanTag, ValueSourceTag, ValueTag, type Expression, type Mapping,
  type SimpleBoolean, type Value, type ValueSource,
} from "./types/expression.js";
import type { Decision, DecisionResource } from "./types/decision.js";
export { integerLexeme, isAscii, parseJavaInt, parseJavaLong, signedDigits, withinJavaInt } from "./types/lexical.js";
export {
  AbnormalScopeEnd, CallBindingTime, type CompensationHandlerFailure, CompensationHandlerFailureTag, CompensationOrder,
  ConditionOrder, ContinuationFailure, DeliveryVariables, ErrorPathOutputs, Evaluator, MessageCorrelation,
  MultiInstanceFinalBody, MultiInstanceOutputs, type ProfileOptions, SubmissionRule, TechnicalFailure, UndeclaredWrite,
  UnhandledError, ErrorCatchVariables,
  MultiInstanceBinding, ResultValues, OutputContext, MultiInstanceCounters, MultiInstanceInputFailure, MultiInstanceCount,
  multiInstanceCounterNames, BusinessRuleTask, InclusiveJoinReach, BranchSchedule,
};
export {
  ExpressionTag, MappingDialect, SimpleBooleanTag, ValueSourceTag, ValueTag, type Expression, type Mapping,
  type SimpleBoolean, type Value, type ValueSource,
};

export type ElementId = string;
export type FlowId = string;

/** Exhaustiveness witness for every `switch` over a kernel enum; no kernel switch has a `default:` arm. */
export function assertNever(value: never): never {
  throw new TypeError(`unhandled kernel variant ${JSON.stringify(value)}`);
}

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

export interface CorrelationCriterion { readonly key: string; readonly value: Expression; }

/**
 * `name` is the BPMN Message's identifier, `null` for an unspecified Message (a Receive Task without `messageRef`,
 * which only its waiting occurrence addresses); `interfaceRef` and `operationRef` name the Operation that carries it,
 * when the model gives one.
 */
export interface MessageTrigger {
  readonly name: ValueSource | null;
  readonly correlation: readonly CorrelationCriterion[];
  readonly interfaceRef: string | null;
  readonly operationRef: string | null;
}

export interface SignalTrigger { readonly name: ValueSource; }

export interface ConditionTrigger {
  readonly condition: Expression;
  // guard-exception(19): a Conditional trigger is refused whole (`event.catch.condition`, `boundary.condition`, `start.condition`).
  readonly variableName: string | null;
  // guard-exception(19): refused with its trigger, as `variableName` above.
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

export interface Boundary {
  readonly id: ElementId;
  readonly subscription: Subscription;
  readonly interrupting: boolean;
  readonly outgoing: readonly FlowId[];
}

// Throws

export interface EffectBinding { readonly protocol: string; readonly operation: string; }

/** `binding = null` is an unbound pass-through (PC-MESSAGE-09). */
export interface MessageThrow { readonly binding: EffectBinding | null; readonly payload: readonly Mapping[]; }

export interface SignalThrow {
  readonly name: ValueSource;
  readonly payload: readonly Mapping[];
  // guard-exception(19): a Signal throw is refused whole (`throw.signal`, admission/propagation.ts).
  readonly propagateAll: boolean;
  // guard-exception(19): refused with its throw, as `propagateAll` above.
  readonly localOnly: boolean;
  readonly businessKey: Expression | null;
  // guard-exception(19): refused with its throw, as `propagateAll` above.
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

// Work

export interface UserWork {
  readonly name: string | null;
  readonly assignee: ValueSource | null;
  readonly candidateUsers: readonly ValueSource[];
  readonly candidateGroups: readonly ValueSource[];
  readonly formKey: string | null;
  readonly formFields: readonly (readonly [string, string])[];
  readonly dueDate: ValueSource | null;
  readonly followUpDate: ValueSource | null;
  readonly priority: ValueSource | null;
}

/** `instantiate` marks a Receive Task that instantiates its Process (BPMN 2.0.2 §10.3.3, Table 10.10). */
export interface ReceiveWork { readonly message: MessageTrigger; readonly instantiate: boolean; }

/**
 * `handlerKey` is the root identifier of the `camunda:delegateExpression` the binding was read from, which CIB resolves
 * against process variables before its beans (CIB-LIM-0017); admission compares it with the declared names.
 */
export interface ServiceWork { readonly protocol: string; readonly operation: string; readonly handlerKey: string | null; }

export interface SendWork {
  readonly binding: EffectBinding;
  /** As `ServiceWork.handlerKey`. */
  readonly handlerKey: string | null;
  // guard-exception(19): a Send Task is refused whole (`work.send`, admission/work.ts).
  readonly recipient: ValueSource | null;
  readonly correlation: readonly CorrelationCriterion[];
  // guard-exception(19): refused with its Send Task, as `recipient` above.
  readonly messageRef: string | null;
  readonly operationRef: string | null;
}

export interface ScriptWork {
  // guard-exception(19): a Script Task is refused whole (`work.script`, admission/work.ts).
  readonly format: string;
  readonly source: string;
  readonly resultVariable: string | null;
}

export enum CallBindingTag {
  Latest = "latest",
  Deployment = "deployment",
  Version = "version",
  VersionTag = "versionTag",
}

export type CallBinding =
  | { readonly tag: CallBindingTag.Latest }
  | { readonly tag: CallBindingTag.Deployment }
  | { readonly tag: CallBindingTag.Version; readonly value: ValueSource }
  | { readonly tag: CallBindingTag.VersionTag; readonly value: ValueSource };

export enum DecisionResultMapping {
  SingleEntry = "singleEntry",
  SingleResult = "singleResult",
  CollectEntries = "collectEntries",
  ResultList = "resultList",
}

export interface RuleWork {
  readonly decision: ValueSource;
  readonly resultVariable: string | null;
  readonly binding: CallBinding;
  readonly resultMapping: DecisionResultMapping;
  readonly tenant: ValueSource | null;
}

export interface CallWork {
  readonly calledElement: ValueSource;
  readonly binding: CallBinding;
  readonly tenant: ValueSource | null;
  readonly businessKey: Expression | null;
  readonly inputs: readonly Mapping[];
  readonly outputs: readonly Mapping[];
  readonly propagateAllInputs: boolean;
  readonly propagateAllOutputs: boolean;
}

/** Guarded type: `feature/work` owns matching on it. */
export enum WorkTag {
  None = "none",
  Manual = "manual",
  User = "user",
  Receive = "receive",
  Service = "service",
  Send = "send",
  Script = "script",
  Rule = "rule",
  Call = "call",
}

export type Work =
  | { readonly tag: WorkTag.None }
  | { readonly tag: WorkTag.Manual }
  | { readonly tag: WorkTag.User; readonly payload: UserWork }
  | { readonly tag: WorkTag.Receive; readonly payload: ReceiveWork }
  | { readonly tag: WorkTag.Service; readonly payload: ServiceWork }
  | { readonly tag: WorkTag.Send; readonly payload: SendWork }
  | { readonly tag: WorkTag.Script; readonly payload: ScriptWork }
  | { readonly tag: WorkTag.Rule; readonly payload: RuleWork }
  | { readonly tag: WorkTag.Call; readonly payload: CallWork };

// Multi-Instance and the shared activity envelope

/** Guarded type: `feature/multi-instance` owns matching on it. */
export enum MultiInstanceMode { Sequential = "sequential", Parallel = "parallel" }

export enum InstanceCountTag { Collection = "collection", Cardinality = "cardinality", CountAndCollection = "countAndCollection" }

export type InstanceCount =
  | { readonly tag: InstanceCountTag.Collection; readonly items: Expression }
  | { readonly tag: InstanceCountTag.Cardinality; readonly count: Expression }
  /** Both forms, which CIB reads together; admission refuses it (`multiInstance.countAndCollection`). */
  | { readonly tag: InstanceCountTag.CountAndCollection; readonly count: Expression; readonly items: Expression };

/** Whether the input collection is read once on entry or re-read by a sequential Activity (PC-MI-08). */
export enum CollectionRead { EntrySnapshot = "entrySnapshot", SequentialReread = "sequentialReread" }

export interface MultiInstance {
  readonly mode: MultiInstanceMode;
  readonly count: InstanceCount;
  readonly elementVariable: string | null;
  readonly completionCondition: Expression | null;
  readonly inputDataItem: string | null;
  readonly outputDataItem: string | null;
  readonly outputCollection: string | null;
  readonly mutableCollection: CollectionRead;
  /**
   * A transaction boundary before each instance begins and after it completes, declared on the loop characteristics;
   * the envelope's marks are the body's (CIB-EXT-0027, `BpmnParse#parseMultiInstanceLoopCharacteristics`).
   */
  readonly asyncBefore: boolean;
  readonly asyncAfter: boolean;
  /**
   * The element `loopDataInputRef` names and the `inputDataItem`'s `name`, which `MultiInstanceBinding.LoopReferences`
   * binds instead of the Data Associations (CIB-INT-0014).
   */
  readonly loopDataInputRef: string | null;
  readonly inputDataItemName: string | null;
}

export interface Envelope {
  readonly incoming: readonly FlowId[];
  readonly outgoing: readonly FlowId[];
  readonly inputs: readonly Mapping[];
  readonly outputs: readonly Mapping[];
  readonly boundaries: readonly Boundary[];
  readonly multiInstance: MultiInstance | null;
  readonly compensationHandler: ElementId | null;
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
 * The definition a called process is bound to. `version` to `tenant` name a binding of a Call Activity, `null` for the
 * process this program carries; `sourceSha256` pins the source (PC-SCOPE-03).
 */
export interface DefinitionRef {
  readonly key: string;
  readonly version: number | null;
  readonly versionTag: string | null;
  readonly deployment: string | null;
  readonly tenant: string | null;
  readonly sourceSha256: string | null;
}

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

export interface ProgramIdentity {
  readonly processId: string;
  readonly sourceSha256: string;
  readonly profile: string;
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

/** The Timer of a trigger, if it is one. */
export function triggerTimer(trigger: Trigger): TimerTrigger | null {
  switch (trigger.tag) {
    case TriggerTag.Timer: return trigger.payload;
    case TriggerTag.Message:
    case TriggerTag.Signal:
    case TriggerTag.Condition:
    case TriggerTag.Error:
    case TriggerTag.Escalation:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return null;
  }
  return assertNever(trigger);
}

/** The Message of a trigger, if it is one. */
export function triggerMessage(trigger: Trigger): MessageTrigger | null {
  switch (trigger.tag) {
    case TriggerTag.Message: return trigger.payload;
    case TriggerTag.Timer:
    case TriggerTag.Signal:
    case TriggerTag.Condition:
    case TriggerTag.Error:
    case TriggerTag.Escalation:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return null;
  }
  return assertNever(trigger);
}

/** The Call a work record names, if it is one. */
export function workCall(work: Work): CallWork | null {
  switch (work.tag) {
    case WorkTag.Call: return work.payload;
    case WorkTag.None:
    case WorkTag.Manual:
    case WorkTag.User:
    case WorkTag.Receive:
    case WorkTag.Service:
    case WorkTag.Send:
    case WorkTag.Script:
    case WorkTag.Rule:
      return null;
  }
  return assertNever(work);
}

/** Whether the work opens a host effect (a Service Task). */
export function workIsService(work: Work): boolean {
  switch (work.tag) {
    case WorkTag.Service: return true;
    case WorkTag.None:
    case WorkTag.Manual:
    case WorkTag.User:
    case WorkTag.Receive:
    case WorkTag.Send:
    case WorkTag.Script:
    case WorkTag.Rule:
    case WorkTag.Call:
      return false;
  }
  return assertNever(work);
}

/** Whether the work opens a User Task. */
export function workIsUser(work: Work): boolean {
  switch (work.tag) {
    case WorkTag.User: return true;
    case WorkTag.None:
    case WorkTag.Manual:
    case WorkTag.Receive:
    case WorkTag.Service:
    case WorkTag.Send:
    case WorkTag.Script:
    case WorkTag.Rule:
    case WorkTag.Call:
      return false;
  }
  return assertNever(work);
}

/** The Message a work record waits for, if it does. */
export function workReceive(work: Work): MessageTrigger | null {
  switch (work.tag) {
    case WorkTag.Receive: return work.payload.message;
    case WorkTag.None:
    case WorkTag.Manual:
    case WorkTag.User:
    case WorkTag.Service:
    case WorkTag.Send:
    case WorkTag.Script:
    case WorkTag.Rule:
    case WorkTag.Call:
      return null;
  }
  return assertNever(work);
}

/** The start subscription of an Event Sub-Process scope, if it is one. */
export function scopeKindStart(kind: ScopeKind): Subscription | null {
  switch (kind.tag) {
    case ScopeKindTag.EventSubProcess: return kind.start;
    case ScopeKindTag.Embedded: case ScopeKindTag.Transaction: return null;
  }
  return assertNever(kind);
}

/** The published name of a Multi-Instance mode. */
export function multiInstanceModeName(mode: MultiInstanceMode): string { return mode; }

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

/** Lean's derived `DecidableEq DefinitionRef`. */
function definitionRefEquals(left: DefinitionRef, right: DefinitionRef): boolean {
  return left.key === right.key && left.version === right.version && left.versionTag === right.versionTag &&
    left.deployment === right.deployment && left.tenant === right.tenant && left.sourceSha256 === right.sourceSha256;
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
 * The called process of `key` the latest binding selects: the highest version the program carries, a process without
 * a version counting lowest. Two versions of one key coexist because `Header.id` stays unique (PC-SCOPE-03).
 */
export function programCalledProcess(program: Program, key: string): CalledProcess | null {
  let chosen: CalledProcess | null = null;
  for (const process of program.processes) {
    if (process.definition.key !== key) continue;
    if (chosen === null || (chosen.definition.version ?? 0) < (process.definition.version ?? 0)) chosen = process;
  }
  return chosen;
}

/**
 * The decision a DMN resource the program carries declares under `key`; admission refuses a key two resources declare
 * (`decision.duplicateId`).
 */
export function programDecision(program: Program, key: string): Decision | null {
  return program.decisionResources.flatMap((resource) => resource.decisions).find((decision) => decision.id === key) ?? null;
}

/**
 * The identifier publication and addressing show for an element: the one its author wrote. A boundary has no header
 * and keeps its identifier.
 */
export function programPublicId(program: Program, id: ElementId): ElementId {
  const element = programElement(program, id);
  return element === null ? id : elementHeader(element).origin.sourceId;
}

/**
 * Whether an element begins when its parent Scope is entered without a none start Event: it has no incoming flow, is
 * no compensation handler, and is no Event Sub-Process (BPMN 2.0.2 §13.3.4, §13.5.5).
 */
export function programBeginsImplicitly(program: Program, element: Element): boolean {
  const id = elementHeader(element).id;
  const handler = program.elements.some((other) => elementEnvelope(other)?.compensationHandler === id);
  const scope = elementScope(element);
  const eventSubProcess = scope !== null && scopeKindStart(scope[1].kind) !== null;
  return elementIncoming(element).length === 0 && elementStart(element) === null && !handler && !eventSubProcess;
}

/** The process-level elements of a called process. */
export function programProcessChildren(program: Program, process: CalledProcess): readonly Element[] {
  return process.children.flatMap((id) => {
    const element = programElement(program, id);
    return element === null ? [] : [element];
  });
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

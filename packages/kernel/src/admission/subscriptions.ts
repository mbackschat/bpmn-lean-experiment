/**
 * Admission of catch Events, boundaries and Event Sub-Process starts, transcribed from
 * `Kernel/Admission/Subscriptions.lean`. A refusal carries a stable code. `admission/subscriptions/starts.ts` dispatches a
 * start Event's trigger.
 *
 * Admitted: Timers with a literal `il/timer.ts#classify` admits, Messages with a literal name and no
 * correlation, a correlated Message only on a catch Event, a Signal subscription with a resolvable address, and, on boundaries, the triggers that
 * `feature/propagation.ts` delivers (an interrupting Error, Escalation, Compensation, and Cancel on a Transaction).
 */
import {
  ConditionalRetrigger,
  CycleDialect,
  ErrorCatchVariables,
  Evaluator,
  ExpressionTag,
  MalformedTimer,
  MessageNames,
  SignalNames,
  TimerScheduleTag,
  TriggerTag,
  ValueSourceTag,
  assertNever,
  definitionRefEquals,
  triggerMessage,
  valueSourceLiteral,
  variableEventNamed,
  type Boundary,
  type ConditionTrigger,
  type DefinitionRef,
  type ElementId,
  type Expression,
  type ProfileOptions,
  type CorrelationCriterion,
  type ErrorTrigger,
  type EscalationTrigger,
  type MessageTrigger,
  type QName,
  type SignalTrigger,
  type Subscription,
  type TimerSchedule,
  type TimerTrigger,
  type ValueSource,
} from "../il/types.js";
import type { JuelNode } from "../il/types/juel.js";
import { ClassifiedTag, TimerCode, TimerKind, classify, resolve } from "../il/timer.js";

/** The static refusal of a Timer lexeme family; `il/timer.ts#dynamicCode` is its run-time twin. */
function timerRefusal(code: TimerCode): string {
  switch (code) {
    case TimerCode.Duration:
      return "timer.duration";
    case TimerCode.Date:
      return "timer.date";
    case TimerCode.Cycle:
      return "timer.cycle";
    case TimerCode.Cron:
      return "timer.cron";
  }
  return assertNever(code);
}

/**
 * How a subscription's site reads an expression, given by the registry from `admission/data.ts` at that site: the Core
 * JUEL table, which the Events level reuses for Timer values, Message names and Conditional predicates (ARCHITECTURE-SPEC
 * JUEL levels), and a plain variable read.
 */
export interface Reading {
  readonly juel: (nodes: readonly JuelNode[]) => string | null;
  readonly name: (name: string) => string | null;
}

/** The reading of a site that reads no expression, Lean's `{}`, for a trigger admission only compares. */
export const unread: Reading = { juel: () => null, name: () => null };

/**
 * An Events-level expression under `Evaluator.Juel`: a JUEL table or a plain variable read; any other form, and every
 * expression under Simple Boolean, is refused as `refusal`.
 */
export function eventsExpression(options: ProfileOptions, reading: Reading, refusal: string, expression: Expression): string | null {
  switch (expression.tag) {
    case ExpressionTag.Juel:
      return options.evaluator === Evaluator.Juel ? reading.juel(expression.nodes) : refusal;
    case ExpressionTag.Variable:
      return options.evaluator === Evaluator.Juel ? reading.name(expression.name) : refusal;
    case ExpressionTag.SimpleBoolean:
    case ExpressionTag.Literal:
    case ExpressionTag.Foreign:
      return refusal;
  }
  return assertNever(expression);
}

/**
 * A Conditional catch, boundary or Event Sub-Process start. Its predicate is read by the profile's evaluator: Simple
 * Boolean, or JUEL at the Events level (CIB-EXT-0030 for a condition without a language). CIB's filters
 * `camunda:variableName` and `camunda:variableEvents` belong to its each-write model (CIB-EXT-0035), so they are refused
 * under `edge`, and an event name CIB does not dispatch is refused under `eachWrite`.
 */
export function conditionRefusal(options: ProfileOptions, reading: Reading, trigger: ConditionTrigger): string | null {
  const filters = ((): string | null => {
    switch (options.conditionalRetrigger) {
      case ConditionalRetrigger.Edge:
        return trigger.variableName !== null || trigger.variableEvents.length > 0 ? "event.condition.filter" : null;
      case ConditionalRetrigger.EachWrite:
        return trigger.variableEvents.every(variableEventNamed)
          ? null
          : "event.condition.variableEvents";
    }
    return assertNever(options.conditionalRetrigger);
  })();
  if (filters !== null) return filters;
  if (trigger.condition.tag === ExpressionTag.SimpleBoolean) {
    return options.evaluator === Evaluator.Juel ? "expression.outsideJuel" : null;
  }
  return eventsExpression(options, reading, "event.condition.foreign", trigger.condition);
}

/** The code of a Timer kind, whatever its value or dialect. */
export function familyCode(schedule: TimerSchedule): string {
  switch (schedule.tag) {
    case TimerScheduleTag.Duration:
      return "timer.duration";
    case TimerScheduleTag.Date:
      return "timer.date";
    case TimerScheduleTag.Cycle:
      return "timer.cycle";
  }
  return assertNever(schedule);
}

/**
 * A Timer literal as `il/timer.ts#classify` reads it: outside the subset is refused everywhere, malformed unless
 * `admitMalformed` (`ProfileOptions.malformedTimer = rollsBackArming`), where arming it rolls back. A cycle is admitted
 * at every subscription site, one that fires once taking only its first occurrence (I1). A root start (`rootStart`) is
 * armed by its host from `resolve` at deployment, where no input can roll back, so it takes exactly what that offers
 * (PC-TIMER-04, CIB-INT-0029); anything else keeps its lexeme's code, else its kind's.
 */
export function timer(admitMalformed: boolean, rootStart: boolean, trigger: TimerTrigger): string | null {
  const lexeme = (admitMalformed: boolean, kind: TimerKind, code: TimerCode, value: ValueSource): string | null => {
    const text = valueSourceLiteral(value);
    if (text === null) return timerRefusal(code);
    const classified = classify(kind, text);
    switch (classified.tag) {
      case ClassifiedTag.Admitted:
        return null;
      case ClassifiedTag.Outside:
        return timerRefusal(classified.code);
      case ClassifiedTag.Malformed:
        return admitMalformed ? null : timerRefusal(classified.code);
    }
    return assertNever(classified);
  };
  const schedule = trigger.schedule;
  const literal = (admitMalformed: boolean): string | null => {
    switch (schedule.tag) {
      case TimerScheduleTag.Duration:
        return lexeme(admitMalformed, TimerKind.Duration, TimerCode.Duration, schedule.value);
      case TimerScheduleTag.Date:
        return lexeme(admitMalformed, TimerKind.Date, TimerCode.Date, schedule.value);
      case TimerScheduleTag.Cycle:
        switch (schedule.dialect) {
          case CycleDialect.Cron:
            return lexeme(admitMalformed, TimerKind.Cycle, TimerCode.Cron, schedule.value);
          case CycleDialect.Iso8601:
            return lexeme(admitMalformed, TimerKind.Cycle, TimerCode.Cycle, schedule.value);
        }
        return assertNever(schedule.dialect);
    }
    return assertNever(schedule);
  };
  if (!rootStart) return literal(admitMalformed);
  return resolve(schedule).ok ? null : (literal(false) ?? familyCode(schedule));
}

/**
 * A Timer at a subscription site: a value given by an expression is read at the Events level and classified when it is
 * armed (PC-TIMER-03); a literal is classified now (`timer`). A root start's expression is PC-TIMER-04's.
 */
export function timerAt(options: ProfileOptions, reading: Reading, rootStart: boolean, trigger: TimerTrigger): string | null {
  const schedule = trigger.schedule;
  const code = familyCode(schedule);
  const admitMalformed = options.malformedTimer === MalformedTimer.RollsBackArming;
  switch (schedule.value.tag) {
    case ValueSourceTag.Expression:
      return rootStart ? timer(admitMalformed, rootStart, trigger) : eventsExpression(options, reading, code, schedule.value.body);
    case ValueSourceTag.Literal:
      return timer(admitMalformed, rootStart, trigger);
  }
  return assertNever(schedule.value);
}

/**
 * A Message's name (PC-MESSAGE-01). Under `MessageNames.Description` it is a description: absent or blank is admitted
 * and an expression, which BPMN 2.0.2 does not have, is refused. Under `Addresses` CIB subscribes by it: a missing or
 * blank one (Java's `trim`, `EventSubscriptionDeclaration.java:85-87`) is refused (`BpmnParse.java:1271-1274`), and an
 * expression is read at the Events level, except at a root start (`BpmnParse.java:4888-4899`).
 */
function messageName(options: ProfileOptions, reading: Reading, rootStart: boolean, name: ValueSource | null): string | null {
  const addresses = options.messageNames === MessageNames.Addresses;
  if (name === null) return addresses ? "message.unnamed" : null;
  switch (name.tag) {
    case ValueSourceTag.Literal:
      return addresses && [...name.value].every((char) => char <= " ") ? "message.unnamed" : null;
    case ValueSourceTag.Expression:
      if (!addresses) return "message.nameExpression";
      return rootStart ? "start.messageNameExpression" : eventsExpression(options, reading, "message.nameExpression", name.body);
  }
  return assertNever(name);
}

/**
 * A Message subscription is addressed by its Message (`messageRef`, BPMN 2.0.2 §10.5.5); without one only an
 * occurrence-addressed command could reach it, which CIB-INT-0004 selects for a Receive Task alone (PC-MESSAGE-01).
 */
export function message(options: ProfileOptions, reading: Reading, rootStart: boolean, trigger: MessageTrigger): string | null {
  if (trigger.correlation.length > 0) return "message.correlation";
  if (trigger.messageRef === null) return "message.unspecified";
  return messageName(options, reading, rootStart, trigger.name);
}

/**
 * A Signal's address (PC-SIGNAL-01, PC-SIGNAL-02), shared by catches, starts and throws. Every event names its Signal
 * by `signalRef` (`BpmnParse.java:3536-3545`). Under `SignalNames.Identifier` that QName is the address and the name a
 * description, which BPMN 2.0.2 gives no expression (`tSignal.name` is `xsd:string`). Under `Addresses` CIB keys by the
 * name (CIB-INT-0028): a missing or blank one is refused (`BpmnParse.java:487-488`), and an expression is read at the
 * Events level (CIB-EXT-0041), except at a root start, which CIB resolves at deployment against an empty scope
 * (`EventSubscriptionDeclaration.java:137-142`).
 */
export function signalAddress(
  options: ProfileOptions, reading: Reading, rootStart: boolean, signalRef: QName | null, name: ValueSource | null,
): string | null {
  if (signalRef === null) return "signal.unspecified";
  switch (options.signalNames) {
    case SignalNames.Identifier:
      return name !== null && name.tag === ValueSourceTag.Expression ? "signal.nameExpression" : null;
    case SignalNames.Addresses:
      if (name === null) return "signal.unnamed";
      switch (name.tag) {
        case ValueSourceTag.Literal:
          return [...name.value].every((char) => char <= " ") ? "signal.unnamed" : null;
        case ValueSourceTag.Expression:
          return rootStart ? "start.signalNameExpression" : eventsExpression(options, reading, "signal.nameExpression", name.body);
      }
      return assertNever(name);
  }
  return assertNever(options.signalNames);
}

function criterionValue(
  options: ProfileOptions, reading: Reading, subscription: Subscription, trigger: MessageTrigger, criterion: CorrelationCriterion,
): string | null {
  if (subscription.outputs.length > 0) return "message.correlation.output";
  if (trigger.messageRef === null || trigger.interfaceRef === null || trigger.operationRef === null) return "message.correlation.channel";
  const value = criterion.value;
  switch (value.tag) {
    case ExpressionTag.Variable:
      return message(options, reading, false, { ...trigger, correlation: [] });
    case ExpressionTag.Literal:
    case ExpressionTag.SimpleBoolean:
      return "message.correlation.value";
    case ExpressionTag.Juel:
      return "expression.juel.site";
    case ExpressionTag.Foreign:
      return "expression.outsideSimpleBoolean";
  }
  return assertNever(value);
}

/**
 * A correlated catch, as the [specification](../../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md)
 * bounds it: one key bound to a variable, an Operation channel, and no output, since its payload is never written.
 */
function correlatedCatch(options: ProfileOptions, reading: Reading, subscription: Subscription, trigger: MessageTrigger): string | null {
  const [criterion, ...others] = trigger.correlation;
  if (criterion === undefined) return message(options, reading, false, trigger);
  if (others.length > 0) return "message.correlation.keys";
  return criterionValue(options, reading, subscription, trigger, criterion);
}

/**
 * A Multiple or Parallel Multiple Event (BPMN 2.0.2 §10.5.1): pinned CIB keeps one of several definitions by a precedence
 * that depends on the position and never reads `parallelMultiple` (CIB-LIM-0008) (PC-BASIC-04).
 */
export function definitions(subscription: Subscription): string | null {
  if (subscription.parallelMultiple) return "event.parallelMultiple";
  return subscription.alternatives.length > 0 ? "event.multipleDefinitions" : null;
}

/** Only a Message subscription writes what its delivery carries; any other trigger's outputs would be dropped. */
export function subscriptionOutputs(subscription: Subscription): string | null {
  return triggerMessage(subscription.trigger) !== null || subscription.outputs.length === 0 ? null : "event.outputs";
}

/** Catch variables are a CIB extension (CIB-EXT-0028) the profile selects; BPMN 2.0.2 defines none. */
export function errorTrigger(variables: ErrorCatchVariables, trigger: ErrorTrigger): string | null {
  switch (variables) {
    case ErrorCatchVariables.EventScope:
      return null;
    case ErrorCatchVariables.Refused:
      if (trigger.codeVariable !== null) return "event.error.codeVariable";
      if (trigger.messageVariable !== null) return "event.error.messageVariable";
      return null;
  }
  return assertNever(variables);
}

/** The code variable is CIB's extension (`camunda:escalationCodeVariable`), admitted with the Error catch variables (CIB-EXT-0028). */
export function escalationTrigger(variables: ErrorCatchVariables, trigger: EscalationTrigger): string | null {
  switch (variables) {
    case ErrorCatchVariables.EventScope:
      return null;
    case ErrorCatchVariables.Refused:
      return trigger.codeVariable !== null ? "event.escalation.codeVariable" : null;
  }
  return assertNever(variables);
}

/**
 * The codes of the raised-event catchers one place declared before the one being admitted: the boundaries of a host, or
 * the Event Sub-Processes of a scope; `null` is an Escalation catch-all.
 */
type Declared = { readonly errorCodes: Set<string>; readonly escalations: Array<string | null> };

/**
 * At most one Escalation handler of one kind in one place may match any code: among the boundaries of a host, or among
 * the Event Sub-Processes of a scope, a second one of the same code, a catch-all (`null`) beside any other, or two
 * catch-alls are refused as `refusal`, and an admitted one joins `earlier`. CIB 2.2.0 refuses each at deployment
 * whatever the interruption modes (`BpmnParse.java:3702-3735`). BPMN 2.0.2 §10.5.6 allows several non-interrupting
 * handlers of one declaration, which would all run; the kernel's search takes one catcher per level, so it refuses them
 * under every profile (PC-ESCALATION-02).
 */
function escalationDeclared(refusal: string, earlier: Array<string | null>, code: string | null): string | null {
  const conflicts = code === null ? earlier.length > 0 : earlier.includes(null) || earlier.includes(code);
  if (conflicts) return refusal;
  earlier.push(code);
  return null;
}

/**
 * At most one interrupting Error catcher of one kind in one place per exact code: among the boundaries of a host, or
 * among the Event Sub-Processes of a scope, a second one of a code in `earlier` is refused as `refusal`, and an admitted
 * code joins `earlier`. BPMN 2.0.2 §10.5.6 allows one interrupting handler per Event Declaration ("only one Event
 * Sub-Process for the same Event Declaration MUST be modeled") and orders no two of one code; CIB keeps them and catches
 * with the first in document order (`BpmnParse.java:3645-3650`, a stable sort by precedence), which is not adopted, so
 * they are refused under every profile (PC-ERROR-01, PC-ERROR-02). A catch-all (`null`) is never refused: catch-alls of
 * one place catch in document order (CIB-INT-0010).
 */
function errorDeclared(refusal: string, earlier: Set<string>, code: string | null): string | null {
  if (code === null) return null;
  if (earlier.has(code)) return refusal;
  earlier.add(code);
  return null;
}

/**
 * An interrupting Event Sub-Process started by a Message has no selected meaning for the Scope it interrupts; an Error
 * Event Sub-Process always interrupts (BPMN 2.0.2 Table 10.86, Table 10.87 `isInterrupting`, §13.5.4) (PC-ERROR-02).
 * `seen` holds the Error and Escalation codes of the Event Sub-Processes the same scope declared before this one
 * (`errorDeclared`, `escalationDeclared`).
 */
function eventSubProcessAfter(seen: Declared, start: Subscription, interrupting: boolean): string | null {
  const refused = definitions(start);
  if (refused !== null) return refused;
  const trigger = start.trigger;
  switch (trigger.tag) {
    case TriggerTag.Message:
      return interrupting ? "scope.eventSubProcess.interruptingMessage" : null;
    case TriggerTag.Timer:
      return null;
    case TriggerTag.Error:
      return (interrupting ? null : "start.error.nonInterrupting") ??
        errorDeclared("scope.eventSubProcess.errorDuplicateCode", seen.errorCodes, trigger.payload.code);
    case TriggerTag.Escalation:
      return escalationDeclared("scope.eventSubProcess.escalationDuplicate", seen.escalations, trigger.payload.code);
    case TriggerTag.Signal:
    case TriggerTag.Condition:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return null;
  }
  return assertNever(trigger);
}

export function eventSubProcess(start: Subscription, interrupting: boolean): string | null {
  return eventSubProcessAfter({ errorCodes: new Set<string>(), escalations: [] }, start, interrupting);
}

/** The Event Sub-Processes one scope declares, as their starts in document order, taken together. */
export function eventSubProcessDeclarations(starts: readonly (readonly [Subscription, boolean])[]): string | null {
  const seen: Declared = { errorCodes: new Set<string>(), escalations: [] };
  for (const [start, interrupting] of starts) {
    const refused = eventSubProcessAfter(seen, start, interrupting);
    if (refused !== null) return refused;
  }
  return null;
}

/**
 * What admission reads of a subscription's trigger: its refusal, and the Signal it subscribes to, which `signalNames` and
 * `signalDefinitionNames` compare across the program.
 */
export type Admitted = Readonly<{ refusal: string | null; signal: SignalTrigger | null }>;

const refusing = (refusal: string | null): Admitted => ({ refusal, signal: null });

/** The one dispatch on a catch Event's trigger. */
export function caught(options: ProfileOptions, reading: Reading, subscription: Subscription): Admitted {
  const trigger = subscription.trigger;
  switch (trigger.tag) {
    case TriggerTag.Timer:
      return refusing(timerAt(options, reading, false, trigger.payload));
    case TriggerTag.Message:
      return refusing(correlatedCatch(options, reading, subscription, trigger.payload));
    case TriggerTag.Signal:
      return {
        refusal: signalAddress(options, reading, false, trigger.payload.signalRef, trigger.payload.name),
        signal: trigger.payload,
      };
    case TriggerTag.Condition:
      return refusing(conditionRefusal(options, reading, trigger.payload));
    case TriggerTag.Error:
      return refusing("event.catch.error");
    case TriggerTag.Escalation:
      return refusing("event.catch.escalation");
    case TriggerTag.Compensation:
      return refusing("event.catch.compensation");
    case TriggerTag.Cancel:
      return refusing("event.catch.cancel");
  }
  return assertNever(trigger);
}

export function catchEvent(options: ProfileOptions, reading: Reading, subscription: Subscription): string | null {
  return definitions(subscription) ?? subscriptionOutputs(subscription) ?? caught(options, reading, subscription).refusal;
}

/**
 * What a boundary's admission reads of its host: whether it is a Transaction, and whether an Escalation boundary may
 * hang on it. Pinned CIB admits an Escalation boundary only on a Sub-Process (a Transaction counts as one,
 * `BpmnParse.java:3879`, `:3908`), a Call Activity or a User Task and refuses the deployment otherwise
 * (`BpmnParse.java:3335-3342`). BPMN 2.0.2 §10.5.6 restricts no host, so another host lies outside the target and is
 * refused under every profile (`boundary.escalation.host`, PC-ESCALATION-02).
 */
export interface Host {
  readonly transaction: boolean;
  readonly escalation: boolean;
}

/**
 * `host` says what the boundary hangs on (`Host`). An Error boundary always interrupts (BPMN 2.0.2
 * Table 10.90) (PC-ERROR-01); a Cancel boundary always interrupts and hangs only on a Transaction (Table 10.90, §10.3.5;
 * `BpmnParse#parseBoundaryCancelEventDefinition`) (PC-TX-02). `seen` holds the host's earlier Error boundary codes
 * (`errorDeclared`) and Escalation boundary codes, `null` for a catch-all (`escalationDeclared`).
 */
function boundary(options: ProfileOptions, reading: Reading, host: Host, seen: Declared, attached: Boundary): string | null {
  const variables = options.errorCatchVariables;
  const refused = definitions(attached.subscription) ?? subscriptionOutputs(attached.subscription);
  if (refused !== null) return refused;
  const trigger = attached.subscription.trigger;
  switch (trigger.tag) {
    case TriggerTag.Timer:
      return timerAt(options, reading, false, trigger.payload);
    case TriggerTag.Message:
      return message(options, reading, false, trigger.payload);
    case TriggerTag.Signal:
      return signalAddress(options, reading, false, trigger.payload.signalRef, trigger.payload.name);
    case TriggerTag.Condition:
      return conditionRefusal(options, reading, trigger.payload);
    case TriggerTag.Error: {
      const declared = (attached.interrupting ? null : "boundary.error.nonInterrupting") ?? errorTrigger(variables, trigger.payload);
      if (declared !== null) return declared;
      return errorDeclared("boundary.error.duplicateCode", seen.errorCodes, trigger.payload.code);
    }
    case TriggerTag.Escalation:
      return (host.escalation ? null : "boundary.escalation.host") ?? escalationTrigger(variables, trigger.payload) ??
        escalationDeclared("boundary.escalation.duplicate", seen.escalations, trigger.payload.code);
    case TriggerTag.Compensation:
      return null;
    case TriggerTag.Cancel:
      if (!host.transaction) return "boundary.cancel.host";
      return attached.interrupting ? null : "boundary.cancel.nonInterrupting";
  }
  return assertNever(trigger);
}

export function boundaries(options: ProfileOptions, reading: Reading, host: Host, list: readonly Boundary[]): string | null {
  const seen: Declared = { errorCodes: new Set<string>(), escalations: [] };
  for (const attached of list) {
    const refused = boundary(options, reading, host, seen, attached);
    if (refused !== null) return refused;
  }
  return null;
}

export enum EventScopeTag {
  Process = "process",
  Element = "element",
  Body = "body",
}

/**
 * The event scope CIB declares a Message or Signal subscription in (`BpmnParse#addEventSubscriptionDeclaration`,
 * `BpmnParse.java:1271-1295`): a process level (the root for `null`, else the called process of that definition), an
 * element, or the Multi-Instance body of a looping host.
 */
export type EventScope =
  | { readonly tag: EventScopeTag.Process; readonly definition: DefinitionRef | null }
  | { readonly tag: EventScopeTag.Element; readonly id: ElementId }
  | { readonly tag: EventScopeTag.Body; readonly host: ElementId };

/** Lean's derived `DecidableEq EventScope`. */
function eventScopeEquals(left: EventScope, right: EventScope): boolean {
  switch (left.tag) {
    case EventScopeTag.Process:
      return right.tag === EventScopeTag.Process && (left.definition === null || right.definition === null
        ? left.definition === right.definition
        : definitionRefEquals(left.definition, right.definition));
    case EventScopeTag.Element:
      return right.tag === EventScopeTag.Element && left.id === right.id;
    case EventScopeTag.Body:
      return right.tag === EventScopeTag.Body && left.host === right.host;
  }
  return assertNever(left);
}

/**
 * A Message or Signal subscription as CIB declares it: its event scope, its `isStartEvent` mark, which only a root start
 * sets (`BpmnParse.java:1029`, `:3518`), and its trigger.
 */
export interface Site<T> {
  readonly scope: EventScope;
  readonly start: boolean;
  readonly trigger: T;
}

/**
 * Under `MessageNames.Addresses` two Message subscriptions of one event scope and one start mark may not share a name:
 * CIB refuses the second at deployment when its unresolved name text equals the first's
 * (`hasMultipleEventDefinitionsWithSameName`, `BpmnParse.java:1277-1282`, `:1317-1327`). `sites` are every Message
 * subscription of the program. A literal name compares by its text. Admission cannot compare expression texts: the IL
 * keeps an expression's parsed form, a guarded JUEL table, not its text. So two expression names on one Message, which
 * has one name text, are `message.duplicateName`, and two on different Messages are refused as `message.expressionNames`
 * rather than guessed, which also refuses pairs of different texts that CIB deploys (PC-MESSAGE-01). A literal never
 * collides with an expression: the reader reads every text holding `${` or `#{` as an expression.
 */
export function messageNames(options: ProfileOptions, sites: readonly Site<MessageTrigger>[]): string | null {
  if (options.messageNames !== MessageNames.Addresses) return null;
  const clash = (earlier: Site<MessageTrigger>, site: Site<MessageTrigger>): string | null => {
    if (earlier.start !== site.start || !eventScopeEquals(earlier.scope, site.scope)) return null;
    const left = earlier.trigger.name;
    const right = site.trigger.name;
    if (left === null || right === null) return null;
    switch (left.tag) {
      case ValueSourceTag.Literal:
        return right.tag === ValueSourceTag.Literal && left.value === right.value ? "message.duplicateName" : null;
      case ValueSourceTag.Expression:
        if (right.tag !== ValueSourceTag.Expression) return null;
        return earlier.trigger.messageRef === site.trigger.messageRef ? "message.duplicateName" : "message.expressionNames";
    }
    return assertNever(left);
  };
  for (const [index, site] of sites.entries()) {
    for (const earlier of sites.slice(0, index)) {
      const refused = clash(earlier, site);
      if (refused !== null) return refused;
    }
  }
  return null;
}

/**
 * Structural equality of two IL values, Lean's derived-`Repr` comparison: list order counts, a `bigint` compares by
 * value, and an object compares by its members whatever their insertion order, an absent member equal to an `undefined`
 * one.
 */
export function sameData(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((item, index) => sameData(item, right[index]));
  }
  if (typeof left === "object" && left !== null && typeof right === "object" && right !== null) {
    const leftMembers = left as Readonly<Record<string, unknown>>;
    const rightMembers = right as Readonly<Record<string, unknown>>;
    return [...new Set([...Object.keys(leftMembers), ...Object.keys(rightMembers)])]
      .every((key) => sameData(leftMembers[key], rightMembers[key]));
  }
  return left === right;
}

/**
 * Two Signal names compare as CIB compares their texts: a literal by its text, an expression by its parsed form, which
 * the IL keeps instead of the text. `sameData` makes that exact structural equality without a dispatch over the guarded
 * JUEL types (as `startConditions`), and it equates only texts that differ in layout, which CIB keeps apart. The reader
 * reads every text holding `${` or `#{` as an expression, so a literal never equals an expression.
 */
function sameSignalName(left: SignalTrigger, right: SignalTrigger): boolean {
  return left.name !== null && sameData(left.name, right.name);
}

/** Whether some element of `items` and an earlier one are `related`. */
function anyPair<T>(items: readonly T[], related: (earlier: T, item: T) => boolean): boolean {
  return items.some((item, index) => items.slice(0, index).some((earlier) => related(earlier, item)));
}

/**
 * Under `SignalNames.Addresses` two Signals the program references may not share a name
 * (`signal.duplicateDefinitionName`, CIB-LIM-0026): CIB refuses a document declaring two (`BpmnParse.java:479-482`).
 * `signals` are every Signal the program's subscriptions and throws reference; a Signal no event references never
 * reaches the IL.
 */
export function signalDefinitionNames(options: ProfileOptions, signals: readonly SignalTrigger[]): string | null {
  if (options.signalNames !== SignalNames.Addresses) return null;
  return anyPair(signals, (earlier, signal) => !sameData(earlier.signalRef, signal.signalRef) && sameSignalName(earlier, signal))
    ? "signal.duplicateDefinitionName"
    : null;
}

/**
 * Under `SignalNames.Addresses` two Signal subscriptions of one event scope and one start mark may not share a name
 * (`signal.duplicateName`, CIB-LIM-0026): CIB refuses the second at deployment when its unresolved name text equals the
 * first's (`hasMultipleSignalEventDefinitionsWithSameName`, `BpmnParse.java:1284-1288`, `:1301-1303`, `:1317-1328`), so
 * two root Signal starts of one process on one Signal are refused, which BPMN 2.0.2 admits (§13.2). `sites` are every
 * Signal subscription of the program, compared by `sameSignalName`.
 */
export function signalNames(options: ProfileOptions, sites: readonly Site<SignalTrigger>[]): string | null {
  if (options.signalNames !== SignalNames.Addresses) return null;
  return anyPair(sites, (earlier, site) =>
    earlier.start === site.start && eventScopeEquals(earlier.scope, site.scope) && sameSignalName(earlier.trigger, site.trigger))
    ? "signal.duplicateName"
    : null;
}

/**
 * Subscriptions: catch Events, boundaries, Event Sub-Process starts and Event-Based Gateway arms, transcribed from
 * `Kernel/Feature/Subscriptions.lean`.
 *
 * Owns matching on `Trigger`; `il/timer.ts#resolve` owns resolving a `TimerSchedule`. A Timer or Message trigger opens
 * one item; the triggers that `feature/propagation.ts` delivers (Error, Escalation, Compensation, Cancel) open nothing
 * and are found through `catches`.
 *
 * Firing rules: a Timer fires only at exactly its deadline, which becomes the logical time; a Message fires only on its
 * own channel, with a payload exactly when the subscription writes one. Anything else is `rejected` and changes nothing.
 *
 * A subscription's item holds a reservation (`openSubscription`) that its firing begins. A boundary item is attached to
 * its host occurrence; the arms of one Event-Based Gateway are attached to the gateway's occurrence, so completing that
 * occurrence disarms the siblings of the arm that fired.
 */
import {
  ExpressionTag,
  TriggerTag,
  ValueTag,
  assertNever,
  elementEnvelope,
  elementEvent,
  elementGateway,
  elementHeader,
  elementScope,
  elementStart,
  eventPayloadCatch,
  programBoundary,
  programChildren,
  programElement,
  programTarget,
  valueSourceLiteral,
  type Boundary,
  type CorrelationCriterion,
  type ElementId,
  type EventPayload,
  type Header,
  type Mapping,
  type StartPayload,
  type Subscription,
  type TimerTrigger,
  type Trigger,
  type Value,
} from "../il/types.js";
import {
  CriterionTargetTag,
  FailureTag,
  FiredTag,
  OpenKindTag,
  RaisedTag,
  SignalTag,
  StartTriggerTag,
  WriteRule,
  beginRequest,
  closeItem,
  committed,
  completeSignal,
  disarm,
  failed,
  failedWith,
  leaveFlows,
  leaveOutgoing,
  messageChannelEquals,
  occurrenceOf,
  openItem,
  openKindView,
  openSubscription,
  optionalChannelEquals,
  raisedIsCancel,
  signal,
  type Binding,
  type CorrelationMatch,
  type EvalContext,
  type Fired,
  type MessageChannel,
  type Occurrence,
  type OpenItem,
  type OpenKind,
  type Outcome,
  type Raised,
  type Result,
  type ScopeOccurrenceId,
  type StartTrigger,
  type State,
  type TimerDetail,
} from "../state.js";
import {
  EvaluationTag,
  boundaryFire,
  ctxRequireMappings,
  deliveryTriggerChannel,
  evalContext,
  messageTriggerChannel,
  type Catch,
  type Ctx,
} from "../hooks.js";
import { ResolvedTag, resolve } from "../il/timer.js";

/**
 * A Timer armed at `now`, from its one resolution (`il/timer.ts#resolve`). A cycle's first deadline is one period after
 * arming. Admission refuses every form this answers `unsupported`.
 */
function timerDetail(now: number, trigger: TimerTrigger): Result<TimerDetail> {
  const resolved = resolve(trigger.schedule);
  if (!resolved.ok) return failed(FailureTag.Unsupported, resolved.code);
  const timer = resolved.value;
  switch (timer.tag) {
    case ResolvedTag.Duration:
      return committed({ deadlineMs: now + timer.ms, recurrence: null });
    case ResolvedTag.Cycle:
      return committed({
        deadlineMs: now + timer.periodMs,
        recurrence: { periodMs: timer.periodMs, cron: null, remaining: timer.repetitions },
      });
  }
  return assertNever(timer);
}

/** The item a subscription opens, or `null` for a trigger that propagation delivers. */
function waitKind(now: number, subscription: Subscription): Result<OpenKind | null> {
  const trigger = subscription.trigger;
  switch (trigger.tag) {
    case TriggerTag.Timer: {
      const detail = timerDetail(now, trigger.payload);
      return detail.ok ? committed({ tag: OpenKindTag.Timer, detail: detail.value }) : failedWith(detail.failure);
    }
    case TriggerTag.Message: {
      const channel = messageTriggerChannel(trigger.payload);
      // Admission refuses it (`message.nameExpression`).
      if (channel === null) return failed(FailureTag.Unsupported, "message-name-expression");
      // Admission refuses it (`message.correlation.keys`).
      if (trigger.payload.correlation.length > 1) return failed(FailureTag.Unsupported, "message-correlation-keys");
      const criteria = trigger.payload.correlation.map((criterion) => criterion.key);
      return committed({ tag: OpenKindTag.Message, detail: { channel, payload: subscription.outputs.length > 0, criteria } });
    }
    // Admission refuses both (`event.catch.signal`, `boundary.signal`, `start.signal` and their conditional counterparts).
    case TriggerTag.Signal:
      return failed(FailureTag.Unsupported, "event-catch-signal");
    case TriggerTag.Condition:
      return failed(FailureTag.Unsupported, "event-catch-condition");
    case TriggerTag.Error:
    case TriggerTag.Escalation:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return committed(null);
  }
  return assertNever(trigger);
}

function subscribe(
  state: State,
  subscription: Subscription,
  element: ElementId,
  scope: ScopeOccurrenceId,
  host: number | null,
  passive: boolean,
): Outcome {
  const kind = waitKind(state.logicalTimeMs, subscription);
  if (!kind.ok) return failedWith(kind.failure);
  return committed(kind.value === null ? state : openSubscription(state, kind.value, element, scope, host, passive)[0]);
}

/** `Signal.arm`: open the boundaries of `element`, attached to `host`, in the host's scope `scope`. */
export function arm(ctx: Ctx, host: number, element: ElementId, scope: ScopeOccurrenceId, state: State): Outcome {
  const found = programElement(ctx.program, element);
  const envelope = found === null ? null : elementEnvelope(found);
  if (envelope === null) return failed(FailureTag.SemanticFailure, "arm-without-envelope");
  let current = state;
  for (const boundary of envelope.boundaries) {
    const next = subscribe(current, boundary.subscription, boundary.id, scope, host, false);
    if (!next.ok) return next;
    current = next.value;
  }
  return committed(current);
}

/**
 * `Signal.armGateway`: open one subscription per arm, the catch Events the gateway's outgoing flows reach, attached to
 * the gateway's occurrence. A Receive Task arm would need the work feature's wait and is refused
 * (`gateway.eventBased.receiveArm` at admission).
 */
export function armGateway(ctx: Ctx, occurrence: number, gateway: ElementId, scope: ScopeOccurrenceId, state: State): Outcome {
  const found = programElement(ctx.program, gateway);
  const payload = found === null ? null : elementGateway(found);
  if (payload === null) return failed(FailureTag.SemanticFailure, "arm-gateway-without-gateway");
  let current = state;
  for (const flow of payload[1].outgoing) {
    const target = programTarget(ctx.program, flow);
    const element = target === null ? null : programElement(ctx.program, target);
    const event = element === null ? null : elementEvent(element);
    const subscription = event === null ? null : eventPayloadCatch(event[1]);
    if (event === null || subscription === null) return failed(FailureTag.Unsupported, "gateway-event-based-receive-arm");
    const next = subscribe(current, subscription, event[0].id, scope, occurrence, false);
    if (!next.ok) return next;
    current = next.value;
  }
  return committed(current);
}

/** The start Event of an Event Sub-Process. */
function startEvent(ctx: Ctx, eventSubProcess: ElementId): ElementId | null {
  for (const child of programChildren(ctx.program, eventSubProcess)) {
    const start = elementStart(child);
    if (start !== null) return start[0].id;
  }
  return null;
}

/**
 * `Signal.armScope`: open the start subscriptions of the Event Sub-Processes declared in the scope occurrence's element
 * as passive items on their start Events. A start that opens no item needs no start Event: a Compensation Event
 * Sub-Process's trigger is carried by its `ScopeKind`.
 */
export function armScope(ctx: Ctx, scope: ScopeOccurrenceId, state: State): Outcome {
  const element = state.scopes.find((candidate) => candidate.id === scope)?.element ?? null;
  let current = state;
  for (const child of programChildren(ctx.program, element)) {
    const declared = elementScope(child);
    const start = declared === null ? null : ctx.eventStart(declared[1]);
    if (declared === null || start === null) continue;
    const subscription = start[0];
    const kind = waitKind(current.logicalTimeMs, subscription);
    if (!kind.ok) return failedWith(kind.failure);
    const startId = startEvent(ctx, declared[0].id);
    if (startId !== null) {
      const next = subscribe(current, subscription, startId, scope, null, true);
      if (!next.ok) return next;
      current = next.value;
    } else if (kind.value !== null) {
      return failed(FailureTag.SemanticFailure, "event-subprocess-without-start");
    }
  }
  return committed(current);
}

// Firing

/** Bind the delivered payload to every data output an output mapping reads, then evaluate the mappings. */
function payloadBindings(ctx: Ctx, nowMs: number, outputs: readonly Mapping[], payload: Value): Result<readonly Binding[]> {
  const outputsRead = outputs.flatMap((mapping): Binding[] => {
    const source = mapping.source;
    switch (source.tag) {
      case ExpressionTag.Variable:
        return [[source.name, payload]];
      case ExpressionTag.Literal:
      case ExpressionTag.SimpleBoolean:
      case ExpressionTag.Foreign:
        return [];
    }
    return assertNever(source);
  });
  return ctxRequireMappings(ctx, { variables: outputsRead, nowMs }, outputs);
}

// Correlation, as the message key correlation specification bounds it: a criterion names one correlation key and the
// expression its single property's value is bound to in the subscription's scope; the delivered value is the Message
// payload's. Both must be non-empty Strings, compared by exact equality, and the criterion is evaluated when a
// delivery is matched, never when the subscription opens, so the current Property value decides.

function criteria(trigger: Trigger): readonly CorrelationCriterion[] {
  switch (trigger.tag) {
    case TriggerTag.Message:
      return trigger.payload.correlation;
    case TriggerTag.Timer:
    case TriggerTag.Signal:
    case TriggerTag.Condition:
    case TriggerTag.Error:
    case TriggerTag.Escalation:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return [];
  }
  return assertNever(trigger);
}

/** The key a criterion binds, evaluated in `variables`. */
function keyValue(ctx: Ctx, context: EvalContext, criterion: CorrelationCriterion): Result<string> {
  const evaluation = ctx.evaluate(context, criterion.value);
  switch (evaluation.tag) {
    case EvaluationTag.Value:
      if (evaluation.result.tag !== ValueTag.String) {
        return failed(FailureTag.Unsupported, "correlation-key-type"); // dynamic-only: a key's value type is the run's data
      }
      if (evaluation.result.value === "") {
        return failed(FailureTag.Unsupported, "correlation-key-empty"); // dynamic-only: a key's value is the run's data
      }
      return committed(evaluation.result.value);
    case EvaluationTag.Failure:
      return failed(FailureTag.SemanticFailure, evaluation.code);
  }
  return assertNever(evaluation);
}

/**
 * Whether the delivered `correlation` names exactly the criteria's keys, in order, each with the String its criterion
 * binds. A modeled key matches as `processVariable`; the other targets are `O.messageCorrelation = apiCriteria`, which
 * admission refuses, so no delivery with such a target reaches a correlated wait of an admitted program.
 */
function correlationMatches(
  ctx: Ctx,
  context: EvalContext,
  bound: readonly CorrelationCriterion[],
  correlation: readonly CorrelationMatch[],
): Result<boolean> {
  if (bound.length !== correlation.length) return committed(false);
  for (const [index, criterion] of bound.entries()) {
    const expected = keyValue(ctx, context, criterion);
    if (!expected.ok) return failedWith(expected.failure);
    const matched = criterionMatches(criterion, correlation[index] as CorrelationMatch, expected.value);
    if (!matched.ok || !matched.value) return matched;
  }
  return committed(true);
}

function criterionMatches(criterion: CorrelationCriterion, delivered: CorrelationMatch, expected: string): Result<boolean> {
  const target = delivered.target;
  switch (target.tag) {
    case CriterionTargetTag.ProcessVariable: {
      const value = delivered.expected;
      return committed(criterion.key === target.name && value.tag === ValueTag.String && value.value === expected);
    }
    case CriterionTargetTag.LocalVariable:
    case CriterionTargetTag.BusinessKey:
    case CriterionTargetTag.ProcessInstance:
      return failed(FailureTag.Unsupported, "profile-message-correlation-api-criteria");
  }
  return assertNever(target);
}

/**
 * The subscription an open item belongs to: a boundary's, a catch Event's or an Event Sub-Process start's; an
 * Activity's own subscription (a Receive Task) is the work feature's.
 */
function subscriptionOf(ctx: Ctx, item: OpenItem): Subscription | null {
  const boundary = programBoundary(ctx.program, item.element);
  if (boundary !== null) return boundary[1].subscription;
  const element = programElement(ctx.program, item.element);
  const event = element === null ? null : elementEvent(element);
  const catchEvent = event === null ? null : eventPayloadCatch(event[1]);
  if (catchEvent !== null) return catchEvent;
  const start = element === null ? null : elementStart(element);
  const parent = start === null || start[0].parent === null ? null : programElement(ctx.program, start[0].parent);
  const scope = parent === null ? null : elementScope(parent);
  return (scope === null ? null : ctx.eventStart(scope[1]))?.[0] ?? null;
}

/** `Hooks.correlates`. */
export function correlates(
  ctx: Ctx,
  item: OpenItem,
  channel: MessageChannel,
  correlation: readonly CorrelationMatch[],
  state: State,
): Result<boolean> {
  const waiting = openKindView(item.kind).channel;
  const subscription = subscriptionOf(ctx, item);
  const bound = subscription === null ? [] : criteria(subscription.trigger);
  if (waiting === null || bound.length === 0) return committed(false);
  if (!messageChannelEquals(waiting, channel)) return committed(false);
  return correlationMatches(ctx, evalContext(state, item.scope), bound, correlation);
}

/**
 * Check that `fired` may fire `item` and return the state at the firing's logical time with the values the subscription
 * writes. A Message delivery must carry exactly the subscription's correlation, none for an uncorrelated one; the
 * target rechecks it rather than trusting the population's selection.
 */
function admitFiring(ctx: Ctx, subscription: Subscription, item: OpenItem, fired: Fired, state: State): Result<readonly [State, readonly Binding[]]> {
  const view = openKindView(item.kind);
  switch (fired.tag) {
    case FiredTag.Timer:
      if (view.deadlineMs === null) return failed(FailureTag.Rejected, "not-a-timer");
      return fired.logicalTimeMs === view.deadlineMs && view.deadlineMs <= state.logicalTimeMs
        ? committed([state, []])
        : failed(FailureTag.Rejected, "timer-not-due");
    case FiredTag.Message: {
      const delivery = fired.delivery;
      if (view.channel === null) return failed(FailureTag.Rejected, "not-a-message-subscription");
      if (!optionalChannelEquals(deliveryTriggerChannel(delivery.trigger), view.channel)) {
        return failed(FailureTag.Rejected, "message-channel-mismatch");
      }
      const correlated = correlationMatches(ctx, evalContext(state, item.scope), criteria(subscription.trigger), delivery.correlation);
      if (!correlated.ok) return failedWith(correlated.failure);
      if (!correlated.value) return failed(FailureTag.Rejected, "message-correlation-mismatch");
      if (view.payload && delivery.payload !== null) {
        const values = payloadBindings(ctx, state.logicalTimeMs, subscription.outputs, delivery.payload);
        return values.ok ? committed([state, values.value]) : failedWith(values.failure);
      }
      if (view.payload) return failed(FailureTag.Rejected, "message-payload-required");
      if (delivery.payload !== null) return failed(FailureTag.Rejected, "message-payload-not-accepted");
      return committed([state, []]);
    }
    // Dynamic-only: admission refuses every Signal and conditional subscription (`event.catch.signal`, `boundary.signal`,
    // `start.signal` and their conditional counterparts), so none is open to fire.
    case FiredTag.Signal:
      return failed(FailureTag.Unsupported, "event-catch-signal");
    case FiredTag.Condition:
      return failed(FailureTag.Unsupported, "event-catch-condition");
  }
  return assertNever(fired);
}

/**
 * What remains of a fired subscription that does not interrupt: a Message subscription stays open with the same
 * identity, a cycle Timer opens its next occurrence one period after the deadline it fired at, keeping its attachment,
 * and any other Timer closes. The result is the reservation the firing may begin, `null` when the item stays open, whose
 * identity then remains the subscription's.
 */
function afterFiring(state: State, item: OpenItem): readonly [State, number | null] {
  const view = openKindView(item.kind);
  if (view.deadlineMs === null) return [state, null];
  const closed = closeItem(state, item.id);
  const recurrence = view.recurrence;
  if (recurrence === null) return [closed, item.occurrence];
  const remaining = recurrence.remaining === null ? null : Math.max(0, recurrence.remaining - 1);
  if (recurrence.periodMs === null || remaining === 0) return [closed, item.occurrence];
  const next: OpenKind = {
    tag: OpenKindTag.Timer,
    detail: { deadlineMs: view.deadlineMs + recurrence.periodMs, recurrence: { ...recurrence, remaining } },
  };
  return [openSubscription(closed, next, item.element, item.scope, item.attachedTo, item.passive)[0], item.occurrence];
}

/**
 * A boundary fired: an interrupting one cancels its host, a non-interrupting one leaves it running; either way the
 * boundary's occurrence begins and leaves on its flows in the host's scope (BPMN 2.0.2 §13.5.3, §10.5.6).
 */
function fireBoundary(ctx: Ctx, boundary: Boundary, item: OpenItem, fired: Fired, state: State): Outcome {
  const admitted = admitFiring(ctx, boundary.subscription, item, fired, state);
  if (!admitted.ok) return failedWith(admitted.failure);
  const [current, values] = admitted.value;
  if (boundary.interrupting) {
    if (item.attachedTo === null) return failed(FailureTag.SemanticFailure, "boundary-without-host");
    if (occurrenceOf(current, item.attachedTo) === null) return failed(FailureTag.SemanticFailure, "boundary-host-gone");
    return committed(boundaryFire(boundary, item.attachedTo, item.occurrence, item.scope, values, closeItem(current, item.id)));
  }
  const [after, reserved] = afterFiring(current, item);
  return committed(boundaryFire(boundary, null, reserved, item.scope, values, after));
}

/** A catch Event fired; an Event-Based Gateway arm also completes its gateway, which disarms the other arms. */
function fireCatch(ctx: Ctx, subscription: Subscription, item: OpenItem, fired: Fired, state: State): Outcome {
  const admitted = admitFiring(ctx, subscription, item, fired, state);
  if (!admitted.ok) return failedWith(admitted.failure);
  const [current, values] = admitted.value;
  const closed = closeItem(current, item.id);
  const gateway = item.attachedTo === null
    ? closed
    : signal(closed, completeSignal(item.attachedTo, leaveFlows([]), [], WriteRule.Outward));
  return committed(signal(gateway, completeSignal(item.occurrence, leaveOutgoing, values, WriteRule.Outward)));
}

/**
 * An Event Sub-Process start fired: an interrupting start closes, a non-interrupting one continues as `afterFiring`
 * says. The scopes feature starts the occurrence, which begins the start Event with the reservation, if any.
 */
function fireEventStart(ctx: Ctx, eventSubProcess: ElementId, item: OpenItem, fired: Fired, state: State): Outcome {
  const element = programElement(ctx.program, eventSubProcess);
  const scope = element === null ? null : elementScope(element);
  const start = scope === null ? null : ctx.eventStart(scope[1]);
  if (start === null) return failed(FailureTag.SemanticFailure, "event-start-without-event-subprocess");
  const [subscription, interrupting] = start;
  const admitted = admitFiring(ctx, subscription, item, fired, state);
  if (!admitted.ok) return failedWith(admitted.failure);
  const [current, values] = admitted.value;
  const [after, inner] = interrupting ? [closeItem(current, item.id), item.occurrence] as const : afterFiring(current, item);
  return committed(signal(after, {
    tag: SignalTag.Begin,
    request: beginRequest({ element: eventSubProcess, scope: item.scope, locals: values, inner }),
  }));
}

/** `Hooks.trigger`: the item's element is a boundary, a catch Event or an Event Sub-Process start Event. */
export function trigger(ctx: Ctx, item: OpenItem, fired: Fired, state: State): Outcome {
  const boundary = programBoundary(ctx.program, item.element);
  if (boundary !== null) return fireBoundary(ctx, boundary[1], item, fired, state);
  const element = programElement(ctx.program, item.element);
  const event = element === null ? null : elementEvent(element);
  const catchEvent = event === null ? null : eventPayloadCatch(event[1]);
  if (catchEvent !== null) return fireCatch(ctx, catchEvent, item, fired, state);
  const start = element === null ? null : elementStart(element);
  const eventSubProcess = start === null ? null : start[0].parent;
  if (eventSubProcess !== null) return fireEventStart(ctx, eventSubProcess, item, fired, state);
  return failed(FailureTag.SemanticFailure, "trigger-without-subscription");
}

// Starts

/** Whether `trigger` fires a start with `subscription`. A none trigger names its start by identifier and consumes its trigger itself. */
function fires(trigger: StartTrigger, subscription: Subscription | null): boolean {
  if (trigger.tag === StartTriggerTag.None) return true;
  if (subscription === null) return false;
  const subscribed = subscription.trigger;
  switch (subscribed.tag) {
    case TriggerTag.Timer:
      return trigger.tag === StartTriggerTag.Timer;
    case TriggerTag.Message:
      return trigger.tag === StartTriggerTag.Message &&
        optionalChannelEquals(messageTriggerChannel(subscribed.payload), trigger.channel);
    case TriggerTag.Signal:
      return trigger.tag === StartTriggerTag.Signal && valueSourceLiteral(subscribed.payload.name) === trigger.name;
    case TriggerTag.Condition:
      return trigger.tag === StartTriggerTag.Condition;
    case TriggerTag.Error:
    case TriggerTag.Escalation:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return false;
  }
  return assertNever(subscribed);
}

/**
 * `Hooks.selectStart`: the named start if the trigger fires it, else the one start the trigger fires, and the sole none
 * start for a none trigger.
 */
export function selectStart(ctx: Ctx, named: ElementId | null, trigger: StartTrigger): ElementId | null {
  const starts = programChildren(ctx.program, null).flatMap((element) => {
    const start = elementStart(element);
    return start === null ? [] : [start];
  });
  const accepted = starts.filter(([, start]) => fires(trigger, start.subscription));
  if (named !== null) return accepted.find(([header]) => header.id === named)?.[0].id ?? null;
  const candidates = trigger.tag === StartTriggerTag.None ? starts.filter(([, start]) => start.subscription === null) : accepted;
  const [only] = candidates;
  return candidates.length === 1 && only !== undefined ? only[0].id : null;
}

/**
 * `Hooks.arriveStart`: a start Event leaves on its outgoing flows, writing what its trigger carried; a none trigger's
 * start was consumed by the input that names it.
 */
export function arriveStart(ctx: Ctx, _header: Header, payload: StartPayload, trigger: StartTrigger, occurrence: Occurrence, state: State): Outcome {
  const started = startValues(ctx, payload, trigger, state);
  if (!started.ok) return failedWith(started.failure);
  const [current, values] = started.value;
  return committed(signal(current, completeSignal(occurrence.id, leaveOutgoing, values, WriteRule.Outward)));
}

function startValues(ctx: Ctx, payload: StartPayload, trigger: StartTrigger, state: State): Result<readonly [State, readonly Binding[]]> {
  switch (trigger.tag) {
    case StartTriggerTag.Timer:
      return committed([{ ...state, logicalTimeMs: trigger.logicalTimeMs }, []]);
    case StartTriggerTag.Message: {
      if (trigger.payload === null || payload.subscription === null) return committed([state, []]);
      const bound = payloadBindings(ctx, state.logicalTimeMs, payload.subscription.outputs, trigger.payload);
      return bound.ok ? committed([state, bound.value]) : failedWith(bound.failure);
    }
    case StartTriggerTag.Signal:
      return committed([state, trigger.variables]);
    case StartTriggerTag.None:
    case StartTriggerTag.Condition:
      return committed([state, []]);
  }
  return assertNever(trigger);
}

/** `Hooks.arriveCatch`: the catch Event's occurrence waits on its subscription. */
export function arriveCatch(_ctx: Ctx, _header: Header, _payload: EventPayload, subscription: Subscription, occurrence: Occurrence, state: State): Outcome {
  const kind = waitKind(state.logicalTimeMs, subscription);
  if (!kind.ok) return failedWith(kind.failure);
  // Admission refuses every trigger reaching `null` here (`event.catch.error`, `.escalation`, `.compensation`, `.cancel`);
  // the code names the first.
  return kind.value === null ? failed(FailureTag.Unsupported, "event-catch-error") : committed(openItem(state, kind.value, occurrence));
}

/** `Hooks.leave`: a completing occurrence's attached items go. */
export function leave(_ctx: Ctx, occurrence: Occurrence, state: State): Outcome {
  return committed(disarm(state, occurrence.id));
}

// Catching raised events

function errorFacts(raised: Raised): readonly [string, string | null] | null {
  switch (raised.tag) {
    case RaisedTag.Error:
      return [raised.code, raised.message];
    case RaisedTag.Escalation:
    case RaisedTag.Cancel:
      return null;
  }
  return assertNever(raised);
}

function escalationCode(raised: Raised): string | null {
  switch (raised.tag) {
    case RaisedTag.Escalation:
      return raised.code;
    case RaisedTag.Error:
    case RaisedTag.Cancel:
      return null;
  }
  return assertNever(raised);
}

/**
 * An exact code catches at precedence 0, a catch-all (no code) at 1: at one catching level an exact code precedes a
 * catch-all (CIB `ErrorEventDefinition#getPrecedence`, CIB-INT-0010; Table 10.88 lets both catch).
 */
function codePrecedence(catcher: string | null, code: string): number | null {
  if (catcher === null) return 1;
  return catcher === code ? 0 : null;
}

/** A catch variable's write, when the catcher names one. */
function caughtVariable(name: string | null, value: Value): readonly Binding[] {
  return name === null ? [] : [[name, value]];
}

/**
 * `Ctx.catches`: how `trigger` catches `raised`, lower rank first, and what the catch writes (`camunda:errorCodeVariable`
 * and its siblings).
 */
export function catches(raised: Raised, trigger: Trigger): Catch | null {
  switch (trigger.tag) {
    case TriggerTag.Error: {
      const facts = errorFacts(raised);
      const rank = facts === null ? null : codePrecedence(trigger.payload.code, facts[0]);
      if (facts === null || rank === null) return null;
      const message: Value = facts[1] === null ? { tag: ValueTag.Null } : { tag: ValueTag.String, value: facts[1] };
      return {
        rank,
        writes: [
          ...caughtVariable(trigger.payload.codeVariable, { tag: ValueTag.String, value: facts[0] }),
          ...caughtVariable(trigger.payload.messageVariable, message),
        ],
      };
    }
    case TriggerTag.Escalation: {
      const code = escalationCode(raised);
      const rank = code === null ? null : codePrecedence(trigger.payload.code, code);
      if (code === null || rank === null) return null;
      return { rank, writes: caughtVariable(trigger.payload.codeVariable, { tag: ValueTag.String, value: code }) };
    }
    case TriggerTag.Cancel:
      return raisedIsCancel(raised) ? { rank: 0, writes: [] } : null;
    case TriggerTag.Signal:
    case TriggerTag.Compensation:
    case TriggerTag.Timer:
    case TriggerTag.Message:
    case TriggerTag.Condition:
      return null;
  }
  return assertNever(trigger);
}

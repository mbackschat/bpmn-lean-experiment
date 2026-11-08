/**
 * Subscriptions: catch Events, boundaries, Event Sub-Process starts and Event-Based Gateway arms, transcribed from
 * `Kernel/Feature/Subscriptions.lean`. Owns matching on `Trigger` and `TimerSchedule`.
 *
 * A Timer or Message trigger opens one item; the triggers that propagation delivers (Error, Escalation,
 * Compensation, Cancel) open nothing and are found through `catches`. A Timer fires only at exactly its deadline,
 * which becomes the logical time; a Message fires only on its own channel, with a payload exactly when the
 * subscription writes one. Anything else is `rejected` and changes nothing. A boundary item is attached to its
 * host; the arms of one Event-Based Gateway activation are attached to one freshly issued group number, so firing
 * an arm disarms its siblings without reading the gateway.
 */
import {
  CycleDialect,
  ExpressionTag,
  TimerScheduleTag,
  TriggerTag,
  ValueSourceTag,
  ValueTag,
  assertNever,
  type Boundary,
  type CorrelationCriterion,
  type ElementId,
  type EventPayload,
  type Header,
  type Mapping,
  type MessageTrigger,
  type Subscription,
  type TimerTrigger,
  type Trigger,
  type Value,
  type ValueSource,
} from "../il/types.js";
import {
  elementEnvelope,
  elementEvent,
  elementGateway,
  elementScope,
  elementStart,
  eventPayloadCatch,
  programBoundary,
  programChildren,
  programElement,
  programTarget,
  valueSourceLiteral,
} from "../il/query.js";
import { cyclePeriodMs, durationMs } from "../il/timer.js";
import { EvaluationTag, ctxEvaluateMappings, type Arrival, type Ctx } from "../hooks.js";
import {
  FailureTag,
  FiredTag,
  OpenKindTag,
  RaisedTag,
  SignalTag,
  closeItem,
  committed,
  disarm,
  emit,
  failed,
  issue,
  leaveScope,
  messageChannelEquals,
  openAttached,
  openItem,
  openKindMessage,
  openKindTimer,
  raisedIsCancel,
  signal,
  visible,
  write,
  type Binding,
  type Fired,
  type MessageChannel,
  type OpenItem,
  type OpenKind,
  type Outcome,
  type Raised,
  type Result,
  type ScopeOccurrenceId,
  type State,
  type TimerDetail,
} from "../state.js";

export function channel(trigger: MessageTrigger): Result<MessageChannel> {
  const address = (messageId: string | null): MessageChannel => ({
    messageId,
    interfaceRef: trigger.interfaceRef,
    operationRef: trigger.operationRef,
  });
  if (trigger.name === null) {
    return committed(address(null));
  }
  const name = valueSourceLiteral(trigger.name);
  return name === null ? failed(FailureTag.Unsupported, "message-name-expression") : committed(address(name));
}

/** A Timer armed at `now`. A cycle's first deadline is one period after arming (`il/timer.ts`). */
export function timerDetail(now: number, trigger: TimerTrigger): Result<TimerDetail> {
  const schedule = trigger.schedule;
  switch (schedule.tag) {
    case TimerScheduleTag.Duration: {
      const lexeme = valueSourceLiteral(schedule.value);
      const ms = lexeme === null ? null : durationMs(lexeme);
      return ms === null
        ? failed(FailureTag.Unsupported, "timer-duration")
        : committed({ deadlineMs: now + ms, period: null });
    }
    case TimerScheduleTag.Date:
      return failed(FailureTag.Unsupported, "timer-date");
    case TimerScheduleTag.Cycle: {
      const lexeme = valueSourceLiteral(schedule.value);
      const ms = lexeme === null ? null : cyclePeriodMs(lexeme);
      switch (schedule.dialect) {
        case CycleDialect.Iso8601:
          return ms === null
            ? failed(FailureTag.Unsupported, "timer-cycle")
            : committed({ deadlineMs: now + ms, period: ms });
        case CycleDialect.Cron:
          return failed(FailureTag.Unsupported, "timer-cron");
      }
      return assertNever(schedule.dialect);
    }
  }
  return assertNever(schedule);
}

/** The item a subscription opens, or `null` for a trigger that propagation delivers. */
export function waitKind(now: number, subscription: Subscription): Result<OpenKind | null> {
  const trigger = subscription.trigger;
  switch (trigger.tag) {
    case TriggerTag.Timer: {
      const detail = timerDetail(now, trigger.payload);
      return detail.ok ? committed({ tag: OpenKindTag.Timer, detail: detail.value }) : detail;
    }
    case TriggerTag.Message: {
      const address = channel(trigger.payload);
      if (!address.ok) {
        return address;
      }
      const correlation = trigger.payload.correlation;
      if (correlation.length > 1) {
        return failed(FailureTag.Unsupported, "message-correlation-keys");
      }
      return committed({
        tag: OpenKindTag.Message,
        detail: {
          channel: address.value,
          payload: subscription.outputs.length > 0,
          correlationKey: correlation[0]?.key ?? null,
        },
      });
    }
    case TriggerTag.Signal:
      return failed(FailureTag.Unsupported, "signal-subscription");
    case TriggerTag.Condition:
      return failed(FailureTag.Unsupported, "conditional-subscription");
    case TriggerTag.Error:
    case TriggerTag.Escalation:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return committed(null);
  }
  return assertNever(trigger);
}

export function markPassive(state: State, id: number): State {
  return { ...state, openItems: state.openItems.map((item) => (item.id === id ? { ...item, passive: true } : item)) };
}

export function subscribe(
  state: State,
  subscription: Subscription,
  element: ElementId,
  scope: ScopeOccurrenceId,
  host: number | null,
  passive: boolean,
): Result<State> {
  const kind = waitKind(state.logicalTimeMs, subscription);
  if (!kind.ok) {
    return kind;
  }
  if (kind.value === null) {
    return committed(state);
  }
  const [opened, id] = openAttached(state, kind.value, element, scope, host);
  return committed(passive ? markPassive(opened, id) : opened);
}

/** `Signal.arm`: open the boundaries of `element`, attached to `host`, in the host's scope `scope`. */
export function arm(ctx: Ctx, host: number, element: ElementId, scope: ScopeOccurrenceId, state: State): Outcome {
  const found = programElement(ctx.program, element);
  const envelope = found === null ? null : elementEnvelope(found);
  if (envelope === null) {
    return failed(FailureTag.SemanticFailure, "arm-without-envelope");
  }
  let current = state;
  for (const boundary of envelope.boundaries) {
    const next = subscribe(current, boundary.subscription, boundary.id, scope, host, false);
    if (!next.ok) {
      return next;
    }
    current = next.value;
  }
  return committed(current);
}

/**
 * `Signal.armGateway`: open one subscription per arm, the catch Events the gateway's outgoing flows reach. A
 * Receive Task arm would need the work feature's wait and is refused.
 */
export function armGateway(ctx: Ctx, gateway: ElementId, scope: ScopeOccurrenceId, state: State): Outcome {
  const found = programElement(ctx.program, gateway);
  const payload = found === null ? null : elementGateway(found);
  if (payload === null) {
    return failed(FailureTag.SemanticFailure, "arm-gateway-without-gateway");
  }
  let [current, group] = issue(state);
  for (const flow of payload[1].outgoing) {
    const target = programTarget(ctx.program, flow);
    const targetElement = target === null ? null : programElement(ctx.program, target);
    const event = targetElement === null ? null : elementEvent(targetElement);
    const subscription = event === null ? null : eventPayloadCatch(event[1]);
    if (event === null || subscription === null) {
      return failed(FailureTag.Unsupported, "event-based-gateway-arm");
    }
    const next = subscribe(current, subscription, event[0].id, scope, group, false);
    if (!next.ok) {
      return next;
    }
    current = next.value;
  }
  return committed(current);
}

/** The start Event of an Event Sub-Process. */
export function startEvent(ctx: Ctx, eventSubProcess: ElementId): ElementId | null {
  for (const child of programChildren(ctx.program, eventSubProcess)) {
    const start = elementStart(child);
    if (start !== null) {
      return start[0].id;
    }
  }
  return null;
}

/**
 * `Signal.armScope`: open the start subscriptions of the Event Sub-Processes declared in the scope occurrence's
 * element as passive items on their start Events. A start that opens no item needs no start Event: the lowering
 * carries a Compensation Event Sub-Process without the start Event the checked process erases.
 */
export function armScope(ctx: Ctx, scope: ScopeOccurrenceId, state: State): Outcome {
  const element = state.scopes.find((occurrence) => occurrence.id === scope)?.element ?? null;
  let current = state;
  for (const child of programChildren(ctx.program, element)) {
    const found = elementScope(child);
    const start = found === null ? null : ctx.eventStart(found[1]);
    if (found === null || start === null) {
      continue;
    }
    const [subscription] = start;
    const kind = waitKind(current.logicalTimeMs, subscription);
    if (!kind.ok) {
      return kind;
    }
    const startElement = startEvent(ctx, found[0].id);
    if (startElement !== null) {
      const next = subscribe(current, subscription, startElement, scope, null, true);
      if (!next.ok) {
        return next;
      }
      current = next.value;
    } else if (kind.value !== null) {
      return failed(FailureTag.SemanticFailure, "event-subprocess-without-start");
    }
  }
  return committed(current);
}

// Firing

/** Bind the delivered payload to every data output an output mapping reads, then evaluate the mappings. */
export function payloadBindings(ctx: Ctx, outputs: readonly Mapping[], payload: Value): Result<readonly Binding[]> {
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
  return ctxEvaluateMappings(ctx, outputsRead, outputs);
}

// Correlation
//
// Message key correlation as docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md bounds it: a criterion names one
// correlation key and the expression its single property's value is bound to in the subscription's scope; the
// delivered value is the Message payload's. Both must be non-empty Strings, compared by exact equality, and the
// criterion is evaluated when a delivery is matched, never when the subscription opens, so the current Property
// value decides.

export function criteria(trigger: Trigger): readonly CorrelationCriterion[] {
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
export function keyValue(ctx: Ctx, variables: readonly Binding[], criterion: CorrelationCriterion): Result<string> {
  const evaluation = ctx.evaluate(variables, criterion.value);
  switch (evaluation.tag) {
    case EvaluationTag.Value: {
      const value = evaluation.result;
      if (value.tag !== ValueTag.String) {
        return failed(FailureTag.Unsupported, "correlation-key-type");
      }
      return value.value === "" ? failed(FailureTag.Unsupported, "correlation-key-empty") : committed(value.value);
    }
    case EvaluationTag.NeedsHost:
      return failed(FailureTag.Unsupported, "host-evaluation");
    case EvaluationTag.Failure:
      return failed(FailureTag.SemanticFailure, evaluation.code);
  }
  return assertNever(evaluation);
}

/** Whether `correlation` names exactly the criteria's keys, in order, each with the String its criterion binds. */
export function correlationMatches(
  ctx: Ctx,
  variables: readonly Binding[],
  bound: readonly CorrelationCriterion[],
  correlation: readonly Binding[],
): Result<boolean> {
  if (bound.length !== correlation.length) {
    return committed(false);
  }
  for (const [index, criterion] of bound.entries()) {
    const [key, delivered] = correlation[index] as Binding;
    const expected = keyValue(ctx, variables, criterion);
    if (!expected.ok) {
      return expected;
    }
    if (!(criterion.key === key && delivered.tag === ValueTag.String && delivered.value === expected.value)) {
      return committed(false);
    }
  }
  return committed(true);
}

/**
 * The subscription an open item belongs to: a boundary's, a catch Event's or an Event Sub-Process start's; an
 * Activity's own subscription (a Receive Task) is the work feature's.
 */
export function subscriptionOf(ctx: Ctx, item: OpenItem): Subscription | null {
  const boundary = programBoundary(ctx.program, item.element);
  if (boundary !== null) {
    return boundary[1].subscription;
  }
  const element = programElement(ctx.program, item.element);
  const event = element === null ? null : elementEvent(element);
  const caught = event === null ? null : eventPayloadCatch(event[1]);
  if (caught !== null) {
    return caught;
  }
  const start = element === null ? null : elementStart(element);
  const parentId = start === null ? null : start[0].parent;
  const parent = parentId === null ? null : programElement(ctx.program, parentId);
  const scope = parent === null ? null : elementScope(parent);
  return scope === null ? null : (ctx.eventStart(scope[1])?.[0] ?? null);
}

/** `Hooks.correlates`. */
export function correlates(
  ctx: Ctx,
  item: OpenItem,
  address: MessageChannel,
  correlation: readonly Binding[],
  state: State,
): Result<boolean> {
  const wait = openKindMessage(item.kind);
  const subscription = subscriptionOf(ctx, item);
  const bound = subscription === null ? [] : criteria(subscription.trigger);
  if (wait === null || bound.length === 0) {
    return committed(false);
  }
  return messageChannelEquals(wait.channel, address)
    ? correlationMatches(ctx, visible(state, item.scope), bound, correlation)
    : committed(false);
}

/**
 * Check that `fired` may fire `item` and return the state at the firing's logical time with the values the
 * subscription writes. A Message delivery must carry exactly the subscription's correlation, none for an
 * uncorrelated one; the target rechecks it rather than trusting the population's selection.
 */
export function admitFiring(
  ctx: Ctx,
  subscription: Subscription,
  item: OpenItem,
  fired: Fired,
  state: State,
): Result<readonly [State, readonly Binding[]]> {
  switch (fired.tag) {
    case FiredTag.Timer: {
      const detail = openKindTimer(item.kind);
      if (detail === null) {
        return failed(FailureTag.Rejected, "not-a-timer");
      }
      return fired.logicalTimeMs === detail.deadlineMs
        ? committed([{ ...state, logicalTimeMs: fired.logicalTimeMs }, []] as const)
        : failed(FailureTag.Rejected, "timer-not-due");
    }
    case FiredTag.Message: {
      const wait = openKindMessage(item.kind);
      if (wait === null) {
        return failed(FailureTag.Rejected, "not-a-message-subscription");
      }
      const delivery = fired.delivery;
      if (!messageChannelEquals(delivery.channel, wait.channel)) {
        return failed(FailureTag.Rejected, "message-channel-mismatch");
      }
      const correlated = correlationMatches(
        ctx,
        visible(state, item.scope),
        criteria(subscription.trigger),
        delivery.correlation,
      );
      if (!correlated.ok) {
        return correlated;
      }
      if (!correlated.value) {
        return failed(FailureTag.Rejected, "message-correlation-mismatch");
      }
      if (wait.payload) {
        if (delivery.payload === null) {
          return failed(FailureTag.Rejected, "message-payload-required");
        }
        const values = payloadBindings(ctx, subscription.outputs, delivery.payload);
        return values.ok ? committed([state, values.value] as const) : values;
      }
      return delivery.payload === null
        ? committed([state, []] as const)
        : failed(FailureTag.Rejected, "message-payload-not-accepted");
    }
  }
  return assertNever(fired);
}

/**
 * What remains of a fired subscription that does not interrupt: a Message subscription stays open with the same
 * identity, a cycle Timer opens its next occurrence one period after the deadline it fired at, keeping its
 * attachment, and any other Timer closes.
 */
export function afterFiring(state: State, item: OpenItem): State {
  const detail = openKindTimer(item.kind);
  if (detail === null) {
    return state;
  }
  if (detail.period === null) {
    return closeItem(state, item.id);
  }
  const [reopened, id] = openAttached(
    closeItem(state, item.id),
    { tag: OpenKindTag.Timer, detail: { deadlineMs: detail.deadlineMs + detail.period, period: detail.period } },
    item.element,
    item.scope,
    item.attachedTo,
  );
  return item.passive ? markPassive(reopened, id) : reopened;
}

export function writeAll(state: State, scope: ScopeOccurrenceId, values: readonly Binding[]): State {
  return values.reduce((current, [name, value]) => write(current, scope, name, value), state);
}

/** Cancel the host of an interrupting boundary: the host's own item, or the host scope occurrence. */
export function cancelHost(state: State, host: number): Result<State> {
  if (state.openItems.some((item) => item.id === host)) {
    return committed(disarm(closeItem(state, host), host));
  }
  if (state.scopes.some((occurrence) => occurrence.id === host)) {
    return committed(disarm(leaveScope(state, host), host));
  }
  return failed(FailureTag.SemanticFailure, "boundary-host-gone");
}

/**
 * A boundary fired: an interrupting one cancels its host, a non-interrupting one leaves it running; either way the
 * token leaves on the boundary's flows in the host's scope (BPMN 2.0.2 §10.5.4).
 */
export function fireBoundary(ctx: Ctx, boundary: Boundary, item: OpenItem, fired: Fired, state: State): Outcome {
  const admitted = admitFiring(ctx, boundary.subscription, item, fired, state);
  if (!admitted.ok) {
    return admitted;
  }
  const written = writeAll(admitted.value[0], item.scope, admitted.value[1]);
  if (!boundary.interrupting) {
    return committed(emit(afterFiring(written, item), boundary.outgoing, item.scope));
  }
  if (item.attachedTo === null) {
    return failed(FailureTag.SemanticFailure, "boundary-without-host");
  }
  const cancelled = cancelHost(written, item.attachedTo);
  return cancelled.ok ? committed(emit(cancelled.value, boundary.outgoing, item.scope)) : cancelled;
}

/** A catch Event fired; an Event-Based Gateway arm also disarms its siblings. */
export function fireCatch(
  ctx: Ctx,
  event: EventPayload,
  subscription: Subscription,
  item: OpenItem,
  fired: Fired,
  state: State,
): Outcome {
  const admitted = admitFiring(ctx, subscription, item, fired, state);
  if (!admitted.ok) {
    return admitted;
  }
  const closed = closeItem(admitted.value[0], item.id);
  const disarmed = item.attachedTo === null ? closed : disarm(closed, item.attachedTo);
  return committed(emit(writeAll(disarmed, item.scope, admitted.value[1]), event.outgoing, item.scope));
}

/**
 * An Event Sub-Process start fired: an interrupting start closes, a non-interrupting one continues as
 * `afterFiring` says. The scopes feature starts the occurrence.
 */
export function fireEventStart(
  ctx: Ctx,
  eventSubProcess: ElementId,
  item: OpenItem,
  fired: Fired,
  state: State,
): Outcome {
  const found = programElement(ctx.program, eventSubProcess);
  const scope = found === null ? null : elementScope(found);
  const start = scope === null ? null : ctx.eventStart(scope[1]);
  if (start === null) {
    return failed(FailureTag.SemanticFailure, "event-start-without-event-subprocess");
  }
  const [subscription, interrupting] = start;
  const admitted = admitFiring(ctx, subscription, item, fired, state);
  if (!admitted.ok) {
    return admitted;
  }
  const [firedState, values] = admitted.value;
  const continued = interrupting ? closeItem(firedState, item.id) : afterFiring(firedState, item);
  return committed(
    signal(continued, {
      tag: SignalTag.StartEventSubProcess,
      element: eventSubProcess,
      parent: item.scope,
      variables: values,
    }),
  );
}

/** `Hooks.trigger`: the item's element is a boundary, a catch Event or an Event Sub-Process start Event. */
export function trigger(ctx: Ctx, item: OpenItem, fired: Fired, state: State): Outcome {
  const boundary = programBoundary(ctx.program, item.element);
  if (boundary !== null) {
    return fireBoundary(ctx, boundary[1], item, fired, state);
  }
  const element = programElement(ctx.program, item.element);
  const event = element === null ? null : elementEvent(element);
  const subscription = event === null ? null : eventPayloadCatch(event[1]);
  if (event !== null && subscription !== null) {
    return fireCatch(ctx, event[1], subscription, item, fired, state);
  }
  const start = element === null ? null : elementStart(element);
  const eventSubProcess = start === null ? null : start[0].parent;
  if (eventSubProcess !== null) {
    return fireEventStart(ctx, eventSubProcess, item, fired, state);
  }
  return failed(FailureTag.SemanticFailure, "trigger-without-subscription");
}

/** `Hooks.arriveCatch`: open the catch Event's subscription in the token's scope. */
export function arriveCatch(
  _ctx: Ctx,
  header: Header,
  _payload: EventPayload,
  subscription: Subscription,
  arrival: Arrival,
  state: State,
): Outcome {
  const kind = waitKind(state.logicalTimeMs, subscription);
  if (!kind.ok) {
    return kind;
  }
  return kind.value === null
    ? failed(FailureTag.Unsupported, "catch-event-trigger")
    : committed(openItem(state, kind.value, header.id, arrival.scope));
}

// Catching raised events

export function errorCode(raised: Raised): string | null {
  switch (raised.tag) {
    case RaisedTag.Error:
      return raised.code;
    case RaisedTag.Escalation:
    case RaisedTag.Signal:
    case RaisedTag.Compensation:
    case RaisedTag.Cancel:
      return null;
  }
  return assertNever(raised);
}

export function escalationCode(raised: Raised): string | null {
  switch (raised.tag) {
    case RaisedTag.Escalation:
      return raised.code;
    case RaisedTag.Error:
    case RaisedTag.Signal:
    case RaisedTag.Compensation:
    case RaisedTag.Cancel:
      return null;
  }
  return assertNever(raised);
}

export function signalName(raised: Raised): string | null {
  switch (raised.tag) {
    case RaisedTag.Signal:
      return raised.name;
    case RaisedTag.Error:
    case RaisedTag.Escalation:
    case RaisedTag.Compensation:
    case RaisedTag.Cancel:
      return null;
  }
  return assertNever(raised);
}

export function isCompensation(raised: Raised): boolean {
  switch (raised.tag) {
    case RaisedTag.Compensation:
      return true;
    case RaisedTag.Error:
    case RaisedTag.Escalation:
    case RaisedTag.Signal:
    case RaisedTag.Cancel:
      return false;
  }
  return assertNever(raised);
}

/**
 * An exact code catches at precedence 0, a catch-all (no code) at 1 (BPMN 2.0.2 §10.5.4: a catch with a code is
 * preferred over one without).
 */
export function codePrecedence(catcher: string | null, code: string): number | null {
  if (catcher === null) {
    return 1;
  }
  return catcher === code ? 0 : null;
}

/** `Ctx.catches`: the precedence with which `trigger` catches `raised`, lower first. */
export function catches(raised: Raised, trigger: Trigger): number | null {
  switch (trigger.tag) {
    case TriggerTag.Error: {
      const code = errorCode(raised);
      return code === null ? null : codePrecedence(trigger.payload.code, code);
    }
    case TriggerTag.Escalation: {
      const code = escalationCode(raised);
      return code === null ? null : codePrecedence(trigger.payload.code, code);
    }
    case TriggerTag.Signal: {
      const name = signalName(raised);
      return name !== null && valueSourceLiteral(trigger.payload.name) === name ? 0 : null;
    }
    case TriggerTag.Compensation:
      return isCompensation(raised) ? 0 : null;
    case TriggerTag.Cancel:
      return raisedIsCancel(raised) ? 0 : null;
    case TriggerTag.Timer:
    case TriggerTag.Message:
    case TriggerTag.Condition:
      return null;
  }
  return assertNever(trigger);
}

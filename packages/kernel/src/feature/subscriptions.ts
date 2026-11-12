/**
 * Subscriptions: catch Events, boundaries, Event Sub-Process starts and Event-Based Gateway arms, transcribed from
 * `Kernel/Feature/Subscriptions.lean`.
 *
 * Owns matching on `Trigger`; `il/timer.ts#resolve` owns resolving a `TimerSchedule`. A Timer, Message or Signal trigger
 * opens one item; the triggers that `feature/propagation.ts` delivers (Error, Escalation, Compensation, Cancel) open nothing
 * and are found through `catches`.
 *
 * Firing rules: a Timer fires only at exactly its deadline, which becomes the logical time; a Message fires only on its
 * own channel, with a payload exactly when the subscription writes one and its correlation accepted; a Signal fires only
 * on its own address; either carries variables only where the profile installs them. Anything else is `rejected` and changes nothing.
 *
 * A subscription's item holds a reservation (`openSubscription`) that its firing begins. A boundary item is attached to
 * its host occurrence; the arms of one Event-Based Gateway are attached to the gateway's occurrence. A firing that ends
 * other items (a gateway arm its siblings, an interrupting boundary its host's items, an interrupting Event Sub-Process
 * start its parent scope's) withdraws them in its own micro-step, though the completion or cancellation that ends them
 * is queued: several Conditional items can be true in one step, and a firing queued after this one must find them
 * closed (BPMN 2.0.2 §10.5.6: a gateway takes only its first event).
 */
import {
  ExpressionTag,
  MalformedTimer,
  MessageNames,
  SignalNames,
  SignalPayload,
  TimerScheduleTag,
  TriggerTag,
  ValueSourceTag,
  ValueTag,
  assertNever,
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
  type Boundary,
  type ElementId,
  type EventPayload,
  type Header,
  type ConditionTrigger,
  type Mapping,
  type ProfileOptions,
  type SignalTrigger,
  type Subscription,
  type TimerTrigger,
  type Trigger,
  type Value,
  type ValueSource,
} from "../il/types.js";
import {
  FailureTag,
  FiredTag,
  StartTriggerTag,
  OpenKindTag,
  DeliveryTriggerTag,
  RaisedTag,
  SignalAddressTag,
  SignalTag,
  WriteRule,
  beginRequest,
  closeItem,
  committed,
  completeSignal,
  disarm,
  failed,
  failedWith,
  initial,
  leaveFlows,
  leaveOutgoing,
  messageChannelEquals,
  occurrenceOf,
  openItem,
  openKindView,
  openSubscription,
  ownScope,
  optionalChannelEquals,
  raisedIsCancel,
  root,
  signal,
  signalAddressMatches,
  type Binding,
  type CorrelationMatch,
  type DeliveryTrigger,
  type EvalContext,
  type Fired,
  type Occurrence,
  type OpenItem,
  type OpenKind,
  type Outcome,
  type Raised,
  type Result,
  type ScopeOccurrenceId,
  type SignalAddress,
  type StartInput,
  type State,
  type TimerDetail,
  calledRoot,
  childrenOf,
  visible,
} from "../state.js";
import {
  EvaluationTag, admitValues, boundaryFire, ctxRequireMappings, deliveryTriggerChannel, evalContext,
  messageTriggerChannel, withdrawInside, withdrawOccurrence, type Catch, type Ctx,
} from "../hooks.js";
import { ClassifiedTag, TimerKind, armAt as armTimer, classify, dynamicCode, successor } from "../il/timer.js";
import { armed, predicateHolds, requireOneWinner } from "./subscriptions/conditions.js";

export { offerWrites } from "./subscriptions/conditions.js";

/**
 * Where a subscription is armed: what a Timer value given by an expression reads (`values`), what a Message name given
 * by an expression reads (`names`), and whether the subscription may fire again (`repeats`: a non-interrupting boundary
 * or Event Sub-Process start). CIB resolves a Message name when the subscription's scope execution is initialized
 * (`ExecutionEntity.java:409-413`), before the host's input mappings and a root's start variables, and a Timer value
 * after them (`PvmExecutionImpl.java:278-292`, `:1304-1318`).
 */
interface Arming {
  readonly values: EvalContext;
  readonly names: EvalContext;
  readonly repeats: boolean;
}

/**
 * A Message name, an expression's resolved once when the subscription opens (PC-MESSAGE-01). The channel addresses the
 * subscription; the name is kept for an engine-wide publication under `MessageNames.addresses` (CIB-LIM-0022). CIB casts
 * the value to a String (`EventSubscriptionDeclaration.java:172-184`): a failure or another type rolls the arming back,
 * and `null` or `""` opens a subscription no name reaches, which the kernel does not claim.
 */
function resolveName(ctx: Ctx, context: EvalContext, name: ValueSource | null): Result<string | null> {
  if (name === null) return committed(null);
  switch (name.tag) {
    case ValueSourceTag.Literal:
      return committed(name.value);
    case ValueSourceTag.Expression: {
      const evaluation = ctx.evaluate(context, name.body);
      switch (evaluation.tag) {
        case EvaluationTag.Value: {
          const result = evaluation.result;
          if (result.tag === ValueTag.Null || (result.tag === ValueTag.String && result.value === "")) {
            // dynamic-only: the resolved name is the run's data.
            return failed(FailureTag.Unsupported, "message-name-empty");
          }
          return result.tag === ValueTag.String ? committed(result.value) : failed(FailureTag.RolledBack, "message-name-type");
        }
        case EvaluationTag.Failure:
          return failed(FailureTag.RolledBack, evaluation.code);
        case EvaluationTag.Unsupported:
          return failed(FailureTag.Unsupported, evaluation.code);
      }
      return assertNever(evaluation);
    }
  }
  return assertNever(name);
}

/**
 * The address a Signal subscription opens with (PC-SIGNAL-02): its `signalRef` under `SignalNames.Identifier`, else its
 * name (CIB-INT-0028), an expression's resolved once when the subscription opens (CIB-EXT-0041). CIB casts the value to a
 * String as it does a Message name (`EventSubscriptionDeclaration.java:172-184`): a failure or another type rolls the
 * arming back, and `null` or `""` opens a subscription the kernel does not claim.
 */
function signalAddress(ctx: Ctx, context: EvalContext, trigger: SignalTrigger): Result<SignalAddress> {
  switch (ctx.program.options.signalNames) {
    case SignalNames.Identifier:
      // Admission refuses it (`signal.unspecified`).
      return trigger.signalRef === null
        ? failed(FailureTag.Unsupported, "signal-unspecified")
        : committed({ tag: SignalAddressTag.Qualified, ref: trigger.signalRef });
    case SignalNames.Addresses: {
      const name = trigger.name;
      // Admission refuses it (`signal.unnamed`).
      if (name === null) return failed(FailureTag.Unsupported, "signal-unnamed");
      switch (name.tag) {
        case ValueSourceTag.Literal:
          return committed({ tag: SignalAddressTag.Named, name: name.value });
        case ValueSourceTag.Expression: {
          const evaluation = ctx.evaluate(context, name.body);
          switch (evaluation.tag) {
            case EvaluationTag.Value: {
              const result = evaluation.result;
              if (result.tag === ValueTag.Null || (result.tag === ValueTag.String && result.value === "")) {
                // dynamic-only: the resolved name is the run's data.
                return failed(FailureTag.Unsupported, "signal-name-empty");
              }
              return result.tag === ValueTag.String
                ? committed({ tag: SignalAddressTag.Named, name: result.value })
                : failed(FailureTag.RolledBack, "signal-name-type");
            }
            case EvaluationTag.Failure:
              return failed(FailureTag.RolledBack, evaluation.code);
            case EvaluationTag.Unsupported:
              return failed(FailureTag.Unsupported, evaluation.code);
          }
          return assertNever(evaluation);
        }
      }
      return assertNever(name);
    }
  }
  return assertNever(ctx.program.options.signalNames);
}

/**
 * What the variables visible from `scope`'s parent read, without `scope`'s own: none at a root or a called root, whose
 * start or call variables CIB sets after it subscribes (`PvmExecutionImpl.java:278-286`).
 */
function enclosingContext(state: State, scope: ScopeOccurrenceId): EvalContext {
  const parent = calledRoot(state, scope) ? null : state.scopes.find((entry) => entry.id === scope)?.parent ?? null;
  return { variables: parent === null ? [] : visible(state, parent), nowMs: state.logicalTimeMs };
}

/**
 * The text a Timer value holds when it is armed: a literal's, or an expression's String value, evaluated once
 * (`TimerDeclarationImpl.java:109-153`, PC-TIMER-03). A failure or a value that is no String is CIB's
 * `ProcessEngineException` at arming, which rolls back the input that reached it; `evaluated` marks an evaluated value.
 */
function timerText(ctx: Ctx, context: EvalContext, value: ValueSource): Result<readonly [string, boolean]> {
  switch (value.tag) {
    case ValueSourceTag.Literal:
      return committed([value.value, false]);
    case ValueSourceTag.Expression: {
      const evaluation = ctx.evaluate(context, value.body);
      switch (evaluation.tag) {
        case EvaluationTag.Value:
          // dynamic-only: a value's type is the run's data.
          return evaluation.result.tag === ValueTag.String
            ? committed([evaluation.result.value, true])
            : failed(FailureTag.RolledBack, "timer-value-type");
        case EvaluationTag.Failure:
          return failed(FailureTag.RolledBack, evaluation.code);
        case EvaluationTag.Unsupported:
          return failed(FailureTag.Unsupported, evaluation.code);
      }
      return assertNever(evaluation);
    }
  }
  return assertNever(value);
}

/**
 * A Timer armed at `context.nowMs`, classified by the one Timer lexeme rule (`il/timer.ts#classify`), the dialect of a
 * cycle read from its text as CIB reads it (`CycleBusinessCalendar.java:55`). A lexeme outside the subset is
 * `unsupported`, statically refused when it is a literal; a malformed one rolls back an evaluated value always and a
 * literal under `MalformedTimer.RollsBackArming`. A site that fires once keeps only the first occurrence.
 */
function timerDetail(ctx: Ctx, arming: Arming, trigger: TimerTrigger): Result<TimerDetail> {
  const schedule = trigger.schedule;
  const kind = schedule.tag === TimerScheduleTag.Duration ? TimerKind.Duration
    : schedule.tag === TimerScheduleTag.Date ? TimerKind.Date : TimerKind.Cycle;
  const text = timerText(ctx, arming.values, schedule.value);
  if (!text.ok) return failedWith(text.failure);
  const [lexeme, evaluated] = text.value;
  const classified = classify(kind, lexeme);
  switch (classified.tag) {
    case ClassifiedTag.Admitted: {
      const armedTimer = armTimer(arming.values.nowMs, classified.parsed);
      // dynamic-only: the deadline depends on the arming instant.
      if (armedTimer === null) return failed(FailureTag.Unsupported, "timer-deadline");
      const recurrence = arming.repeats ? armedTimer.recurrence : null;
      return committed({
        deadlineMs: armedTimer.deadlineMs,
        recurrence: recurrence === null ? null : { periodMs: recurrence.periodMs, cron: recurrence.cron, remaining: recurrence.remaining },
      });
    }
    case ClassifiedTag.Outside:
      return failed(FailureTag.Unsupported, dynamicCode(classified.code));
    case ClassifiedTag.Malformed:
      return evaluated || ctx.program.options.malformedTimer === MalformedTimer.RollsBackArming
        ? failed(FailureTag.RolledBack, dynamicCode(classified.code))
        : failed(FailureTag.Unsupported, dynamicCode(classified.code));
  }
  return assertNever(classified);
}

/** The item a subscription opens, or `null` for a trigger that propagation delivers. */
function waitKind(ctx: Ctx, arming: Arming, subscription: Subscription): Result<OpenKind | null> {
  const trigger = subscription.trigger;
  switch (trigger.tag) {
    case TriggerTag.Timer: {
      const detail = timerDetail(ctx, arming, trigger.payload);
      return detail.ok ? committed({ tag: OpenKindTag.Timer, detail: detail.value }) : failedWith(detail.failure);
    }
    case TriggerTag.Message: {
      const named = resolveName(ctx, arming.names, trigger.payload.name);
      if (!named.ok) return failedWith(named.failure);
      const channel = messageTriggerChannel(trigger.payload);
      // Admission refuses it (`message.correlation.keys`).
      if (trigger.payload.correlation.length > 1) return failed(FailureTag.Unsupported, "message-correlation-keys");
      const criteria = trigger.payload.correlation.map((criterion) => criterion.key);
      const name = ctx.program.options.messageNames === MessageNames.Addresses ? named.value : null;
      return committed({ tag: OpenKindTag.Message, detail: { channel, payload: subscription.outputs.length > 0, criteria, name } });
    }
    case TriggerTag.Signal: {
      const address = signalAddress(ctx, arming.names, trigger.payload);
      return address.ok ? committed({ tag: OpenKindTag.Signal, detail: { address: address.value, payload: false } }) : failedWith(address.failure);
    }
    case TriggerTag.Condition:
      return committed({
        tag: OpenKindTag.Conditional,
        detail: { variableName: trigger.payload.variableName, variableEvents: trigger.payload.variableEvents, lastValue: null },
      });
    case TriggerTag.Error:
    case TriggerTag.Escalation:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return committed(null);
  }
  return assertNever(trigger);
}

/** Open a subscription's item and evaluate it once if Conditional; the item comes back when that evaluation fired it. */
function subscribe(
  ctx: Ctx,
  arming: Arming,
  state: State,
  subscription: Subscription,
  element: ElementId,
  scope: ScopeOccurrenceId,
  host: number | null,
  passive: boolean,
): Result<readonly [State, OpenItem | null]> {
  const kind = waitKind(ctx, arming, subscription);
  if (!kind.ok) return failedWith(kind.failure);
  if (kind.value === null) return committed([state, null]);
  const [opened, item] = openSubscription(state, kind.value, element, scope, host, passive);
  const evaluated = armed(ctx, subscription, item, opened);
  if (!evaluated.ok) return failedWith(evaluated.failure);
  return committed([evaluated.value[0], evaluated.value[1] ? item : null]);
}

/** Subscribe each of one arming's subscriptions in order; at most one item of a contest may fire (`requireOneWinner`). */
function subscribeAll<T>(
  ctx: Ctx, state: State, entries: readonly T[], each: (state: State, entry: T) => Result<readonly [State, OpenItem | null]>,
): Outcome {
  let current = state;
  const fired: OpenItem[] = [];
  for (const entry of entries) {
    const next = each(current, entry);
    if (!next.ok) return failedWith(next.failure);
    [current] = next.value;
    if (next.value[1] !== null) fired.push(next.value[1]);
  }
  const winner = requireOneWinner(ctx, fired);
  return winner.ok ? committed(current) : failedWith(winner.failure);
}

/** `Signal.arm`: open the boundaries of `element`, attached to `host`, in the host's scope `scope`. */
export function arm(ctx: Ctx, host: number, element: ElementId, scope: ScopeOccurrenceId, state: State): Outcome {
  const found = programElement(ctx.program, element);
  const envelope = found === null ? null : elementEnvelope(found);
  if (envelope === null) return failed(FailureTag.SemanticFailure, "arm-without-envelope");
  return subscribeAll(ctx, state, envelope.boundaries, (current, boundary) => {
    const arming = {
      values: evalContext(current, ownScope(current, host, scope)), names: evalContext(current, scope), repeats: !boundary.interrupting,
    };
    return subscribe(ctx, arming, current, boundary.subscription, boundary.id, scope, host, false);
  });
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
  return subscribeAll(ctx, state, payload[1].outgoing, (current, flow) => {
    const target = programTarget(ctx.program, flow);
    const element = target === null ? null : programElement(ctx.program, target);
    const event = element === null ? null : elementEvent(element);
    const subscription = event === null ? null : eventPayloadCatch(event[1]);
    if (event === null || subscription === null) return failed(FailureTag.Unsupported, "gateway-event-based-receive-arm");
    const values = evalContext(current, scope);
    return subscribe(ctx, { values, names: values, repeats: false }, current, subscription, event[0].id, scope, occurrence, false);
  });
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
 * `Signal.armScope`: open the start subscriptions of the Event Sub-Processes declared in the scope occurrence
 * (`childrenOf`: a called root's are its called process's) as passive items on their start Events. A start that opens no item needs no start Event: a Compensation Event
 * Sub-Process's trigger is carried by its `ScopeKind`.
 */
export function armScope(ctx: Ctx, scope: ScopeOccurrenceId, state: State): Outcome {
  return subscribeAll(ctx, state, childrenOf(state, ctx.program, scope), (current, child): Result<readonly [State, OpenItem | null]> => {
    const declared = elementScope(child);
    const start = declared === null ? null : ctx.eventStart(declared[1]);
    if (declared === null || start === null) return committed([current, null]);
    const subscription = start[0];
    const arming = { values: evalContext(current, scope), names: enclosingContext(current, scope), repeats: !start[1] };
    const kind = waitKind(ctx, arming, subscription);
    if (!kind.ok) return failedWith(kind.failure);
    const startId = startEvent(ctx, declared[0].id);
    if (startId !== null) return subscribe(ctx, arming, current, subscription, startId, scope, null, true);
    return kind.value === null ? committed([current, null]) : failed(FailureTag.SemanticFailure, "event-subprocess-without-start");
  });
}

// Root start triggers

/**
 * The address a root Signal start subscribes to: its Signal's QName under `SignalNames.identifier` (BPMN 2.0.2
 * Table 10.100), its name under `addresses`, which admission holds literal at a root start (`start.signalNameExpression`).
 */
function startAddress(options: ProfileOptions, trigger: SignalTrigger): SignalAddress | null {
  switch (options.signalNames) {
    case SignalNames.Identifier:
      return trigger.signalRef === null ? null : { tag: SignalAddressTag.Qualified, ref: trigger.signalRef };
    case SignalNames.Addresses: {
      const name = trigger.name === null ? null : valueSourceLiteral(trigger.name);
      return name === null ? null : { tag: SignalAddressTag.Named, name };
    }
  }
  return assertNever(options.signalNames);
}

/**
 * Whether a Conditional root start holds for `input`: evaluated over the submitted variables alone, in a fresh
 * instance's root scope, as CIB evaluates it in a temporary execution (`DefaultConditionHandler.java:121-134`); a
 * `variableName` the input does not submit makes it false, and the predicate reads as every Conditional one does.
 */
function conditionHolds(ctx: Ctx, input: StartInput, trigger: ConditionTrigger): Result<boolean> {
  const variableName = trigger.variableName;
  if (variableName !== null && !input.variables.some(([name]) => name === variableName)) return committed(false);
  const submitted: State = { ...initial(input.instanceId, input.variables, input.businessKey), logicalTimeMs: input.atMs ?? 0 };
  return predicateHolds(ctx, submitted, root, trigger.condition);
}

/**
 * Whether `input`'s trigger fires a start with `subscription` (`feature/starts.ts`, through `StartsHooks.fires`).
 * A none trigger names its start by identifier and consumes its trigger itself.
 */
export function fires(ctx: Ctx, input: StartInput, subscription: Subscription | null): Result<boolean> {
  const trigger = input.trigger;
  if (trigger.tag === StartTriggerTag.None) return committed(true);
  if (subscription === null) return committed(false);
  const subscribed = subscription.trigger;
  switch (subscribed.tag) {
    case TriggerTag.Timer:
      return committed(trigger.tag === StartTriggerTag.Timer);
    case TriggerTag.Message:
      return committed(trigger.tag === StartTriggerTag.Message &&
        trigger.channel !== null && messageChannelEquals(messageTriggerChannel(subscribed.payload), trigger.channel));
    case TriggerTag.Signal: {
      const address = startAddress(ctx.program.options, subscribed.payload);
      return committed(trigger.tag === StartTriggerTag.Signal && address !== null && signalAddressMatches(trigger.address, address));
    }
    case TriggerTag.Condition:
      return trigger.tag === StartTriggerTag.Condition ? conditionHolds(ctx, input, subscribed.payload) : committed(false);
    case TriggerTag.Error:
    case TriggerTag.Escalation:
    case TriggerTag.Compensation:
    case TriggerTag.Cancel:
      return committed(false);
  }
  return assertNever(subscribed);
}

// Firing

/** Bind the delivered payload to every data output an output mapping reads, then evaluate the mappings. */
export function payloadBindings(ctx: Ctx, nowMs: number, outputs: readonly Mapping[], payload: Value): Result<readonly Binding[]> {
  const outputsRead = outputs.flatMap((mapping): Binding[] => {
    const source = mapping.source;
    switch (source.tag) {
      case ExpressionTag.Variable:
        return [[source.name, payload]];
      case ExpressionTag.Literal:
      case ExpressionTag.SimpleBoolean:
      case ExpressionTag.Juel:
      case ExpressionTag.Foreign:
        return [];
    }
    return assertNever(source);
  });
  return ctxRequireMappings(ctx, { variables: outputsRead, nowMs }, outputs);
}

/** The address a delivery names, when it delivers a Signal. */
function signalDelivered(trigger: DeliveryTrigger): SignalAddress | null {
  switch (trigger.tag) {
    case DeliveryTriggerTag.Signal:
      return trigger.address;
    case DeliveryTriggerTag.Message:
      return null;
  }
  return assertNever(trigger);
}

/**
 * What a Signal's variables install in the receiving scope: under `SignalPayload.Variables` all of them, as CIB's
 * `setVariables` on the receiving execution does (CIB-EXT-0043, `EventHandlerImpl.java:56-58`); under `None` a Signal
 * carries no data (BPMN 2.0.2 §10.5.1), so a delivery that brings variables is rejected rather than dropped.
 */
function signalVariables(ctx: Ctx, variables: readonly Binding[]): Result<readonly Binding[]> {
  switch (ctx.program.options.signalPayload) {
    case SignalPayload.Variables: {
      const admitted = admitValues(variables.map(([, value]) => value));
      return admitted.ok ? committed(variables) : failedWith(admitted.failure);
    }
    case SignalPayload.None:
      return variables.length === 0 ? committed([]) : failed(FailureTag.Rejected, "signal-variables-not-admitted");
  }
  return assertNever(ctx.program.options.signalPayload);
}

/**
 * The Correlation rule a Message firing rechecks, which `registry.ts` fills with `feature/correlation.ts#correlationAccepts`,
 * since features never import each other.
 */
export interface SubscriptionsHooks {
  readonly correlationAccepts: (ctx: Ctx, state: State, scope: ScopeOccurrenceId, trigger: Trigger,
    correlation: readonly CorrelationMatch[]) => Result<boolean>;
}

export const defaultSubscriptionsHooks: SubscriptionsHooks = {
  correlationAccepts: () => failed(FailureTag.Unsupported, "subscriptions-correlation"), // dynamic-only: a registry without the hook
};

/**
 * Check that `fired` may fire `item` and return the state at the firing's logical time with the values the subscription
 * writes. A Message delivery's correlation must be accepted (`SubscriptionsHooks.correlationAccepts`); the target
 * rechecks it rather than trusting the population's selection.
 */
function admitFiring(hooks: SubscriptionsHooks, ctx: Ctx, subscription: Subscription, item: OpenItem, fired: Fired, state: State): Result<readonly [State, readonly Binding[]]> {
  const view = openKindView(item.kind);
  switch (fired.tag) {
    case FiredTag.Timer:
      if (view.deadlineMs === null) return failed(FailureTag.Rejected, "not-a-timer");
      return fired.logicalTimeMs === view.deadlineMs && view.deadlineMs <= state.logicalTimeMs
        ? committed([state, []])
        : failed(FailureTag.Rejected, "timer-not-due");
    case FiredTag.Message: {
      const delivery = fired.delivery;
      const admitted = admitValues(delivery.payload === null ? [] : [delivery.payload]);
      if (!admitted.ok) return failedWith(admitted.failure);
      if (view.channel === null) return failed(FailureTag.Rejected, "not-a-message-subscription");
      if (!optionalChannelEquals(deliveryTriggerChannel(delivery.trigger), view.channel)) {
        return failed(FailureTag.Rejected, "message-channel-mismatch");
      }
      const correlated = hooks.correlationAccepts(ctx, state, item.scope, subscription.trigger, delivery.correlation);
      if (!correlated.ok) return failedWith(correlated.failure);
      if (!correlated.value) return failed(FailureTag.Rejected, "message-correlation-mismatch");
      let mapped: readonly Binding[] = [];
      if (view.payload && delivery.payload !== null) {
        const values = payloadBindings(ctx, state.logicalTimeMs, subscription.outputs, delivery.payload);
        if (!values.ok) return failedWith(values.failure);
        mapped = values.value;
      } else if (view.payload) {
        return failed(FailureTag.Rejected, "message-payload-required");
      } else if (delivery.payload !== null) {
        return failed(FailureTag.Rejected, "message-payload-not-accepted");
      }
      const installed = admitValues(delivery.variables.map(([, value]) => value));
      return installed.ok ? committed([state, [...mapped, ...delivery.variables]]) : failedWith(installed.failure);
    }
    case FiredTag.Signal: {
      const delivery = fired.delivery;
      const address = signalDelivered(delivery.trigger);
      if (view.signal === null || address === null) return failed(FailureTag.Rejected, "not-a-signal-subscription");
      if (!signalAddressMatches(address, view.signal.address)) return failed(FailureTag.Rejected, "unknown-signal-subscription");
      if (delivery.payload !== null) return failed(FailureTag.Rejected, "signal-payload-not-accepted");
      const values = signalVariables(ctx, delivery.variables);
      return values.ok ? committed([state, values.value]) : failedWith(values.failure);
    }
    // Only `evaluateItem` fires a Conditional item, after its predicate held.
    case FiredTag.Condition:
      return view.conditional === null ? failed(FailureTag.Rejected, "not-a-conditional-subscription") : committed([state, []]);
  }
  return assertNever(fired);
}

/**
 * What remains of a fired subscription that does not interrupt: a Message subscription stays open with the same
 * identity, a cycle Timer opens its next occurrence (`il/timer.ts#successor`: one period, or the next Cron match, after
 * the deadline it fired at, never after the firing's own time) keeping its attachment, until its count is spent, and
 * any other Timer closes. The result is the reservation the firing may begin, `null` when the item stays open, whose
 * identity then remains the subscription's.
 */
function afterFiring(state: State, item: OpenItem): readonly [State, number | null] {
  const view = openKindView(item.kind);
  if (view.deadlineMs === null) return [state, null];
  const closed = closeItem(state, item.id);
  const recurrence = view.recurrence;
  if (recurrence === null) return [closed, item.occurrence];
  const followed = successor(view.deadlineMs, recurrence);
  if (followed === null) return [closed, item.occurrence];
  const next: OpenKind = {
    tag: OpenKindTag.Timer,
    detail: { deadlineMs: followed[0], recurrence: { ...recurrence, remaining: followed[1].remaining } },
  };
  return [openSubscription(closed, next, item.element, item.scope, item.attachedTo, item.passive)[0], item.occurrence];
}

/**
 * A boundary fired: an interrupting one cancels its host, a non-interrupting one leaves it running; either way the
 * boundary's occurrence begins and leaves on its flows in the host's scope (BPMN 2.0.2 §13.5.3, §10.5.6).
 */
function fireBoundary(hooks: SubscriptionsHooks, ctx: Ctx, boundary: Boundary, item: OpenItem, fired: Fired, state: State): Outcome {
  const admitted = admitFiring(hooks, ctx, boundary.subscription, item, fired, state);
  if (!admitted.ok) return failedWith(admitted.failure);
  const [current, values] = admitted.value;
  if (boundary.interrupting) {
    if (item.attachedTo === null) return failed(FailureTag.SemanticFailure, "boundary-without-host");
    if (occurrenceOf(current, item.attachedTo) === null) return failed(FailureTag.SemanticFailure, "boundary-host-gone");
    const withdrawn = withdrawOccurrence(closeItem(current, item.id), item.attachedTo);
    return committed(boundaryFire(boundary, item.attachedTo, item.occurrence, item.scope, values, withdrawn));
  }
  const [after, reserved] = afterFiring(current, item);
  return committed(boundaryFire(boundary, null, reserved, item.scope, values, after));
}

/** A catch Event fired; an Event-Based Gateway arm also completes its gateway, which disarms the other arms. */
function fireCatch(hooks: SubscriptionsHooks, ctx: Ctx, subscription: Subscription, item: OpenItem, fired: Fired, state: State): Outcome {
  const admitted = admitFiring(hooks, ctx, subscription, item, fired, state);
  if (!admitted.ok) return failedWith(admitted.failure);
  const [current, values] = admitted.value;
  const closed = closeItem(current, item.id);
  const gateway = item.attachedTo === null
    ? closed
    : signal(disarm(closed, item.attachedTo), completeSignal(item.attachedTo, leaveFlows([]), [], WriteRule.Outward));
  return committed(signal(gateway, completeSignal(item.occurrence, leaveOutgoing, values, WriteRule.Outward)));
}

/**
 * An Event Sub-Process start fired: an interrupting start closes, a non-interrupting one continues as `afterFiring`
 * says. The scopes feature starts the occurrence, which begins the start Event with the reservation, if any.
 */
function fireEventStart(hooks: SubscriptionsHooks, ctx: Ctx, eventSubProcess: ElementId, item: OpenItem, fired: Fired, state: State): Outcome {
  const element = programElement(ctx.program, eventSubProcess);
  const scope = element === null ? null : elementScope(element);
  const start = scope === null ? null : ctx.eventStart(scope[1]);
  if (start === null) return failed(FailureTag.SemanticFailure, "event-start-without-event-subprocess");
  const [subscription, interrupting] = start;
  const admitted = admitFiring(hooks, ctx, subscription, item, fired, state);
  if (!admitted.ok) return failedWith(admitted.failure);
  const [current, values] = admitted.value;
  const [after, inner] = interrupting
    ? [withdrawInside(closeItem(current, item.id), item.scope), item.occurrence] as const
    : afterFiring(current, item);
  return committed(signal(after, {
    tag: SignalTag.Begin,
    request: beginRequest({ element: eventSubProcess, scope: item.scope, locals: values, inner }),
  }));
}

/** `Hooks.trigger`: the item's element is a boundary, a catch Event or an Event Sub-Process start Event. */
export function trigger(hooks: SubscriptionsHooks, ctx: Ctx, item: OpenItem, fired: Fired, state: State): Outcome {
  const boundary = programBoundary(ctx.program, item.element);
  if (boundary !== null) return fireBoundary(hooks, ctx, boundary[1], item, fired, state);
  const element = programElement(ctx.program, item.element);
  const event = element === null ? null : elementEvent(element);
  const catchEvent = event === null ? null : eventPayloadCatch(event[1]);
  if (catchEvent !== null) return fireCatch(hooks, ctx, catchEvent, item, fired, state);
  const start = element === null ? null : elementStart(element);
  const eventSubProcess = start === null ? null : start[0].parent;
  if (eventSubProcess !== null) return fireEventStart(hooks, ctx, eventSubProcess, item, fired, state);
  return failed(FailureTag.SemanticFailure, "trigger-without-subscription");
}

/** `Hooks.arriveCatch`: the catch Event's occurrence waits on its subscription. */
export function arriveCatch(ctx: Ctx, _header: Header, _payload: EventPayload, subscription: Subscription, occurrence: Occurrence, state: State): Outcome {
  const values = evalContext(state, occurrence.scope);
  const kind = waitKind(ctx, { values, names: values, repeats: false }, subscription);
  if (!kind.ok) return failedWith(kind.failure);
  // Admission refuses every trigger reaching `null` here (`event.catch.error`, `.escalation`, `.compensation`, `.cancel`);
  // the code names the first.
  if (kind.value === null) return failed(FailureTag.Unsupported, "event-catch-error");
  const opened = openItem(state, kind.value, occurrence);
  const item = opened.openItems[opened.openItems.length - 1];
  if (item === undefined) return committed(opened);
  const evaluated = armed(ctx, subscription, item, opened);
  return evaluated.ok ? committed(evaluated.value[0]) : failedWith(evaluated.failure);
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

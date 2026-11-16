/**
 * Propagation: throw Events, transcribed from `Kernel/Feature/Propagation/Throws.lean`.
 *
 * What a throw Event does when its occurrence arrives (`Hooks.arriveThrow`), the half of `feature/propagation.ts` that
 * owns matching on `Throw`. A none End Event consumes its token; a none intermediate throw passes it on. A Terminate End
 * Event clears the scope occurrence it ends in, which `step.ts` then completes: inside a Sub-Process the Sub-Process
 * completes normally and its parent continues, at the process level the instance completes (BPMN 2.0.2 §13.5.6). An
 * Error or Cancel End Event consumes its token and an Escalation throw stands; each queues a `Signal.raise`, which
 * `feature/propagation.ts#raise` takes, so a throw never searches for a catcher itself. A Compensation throw hands its
 * scope occurrence to `feature/compensation.ts` through `Signal.compensate`; a Signal throw delivers its broadcast; a
 * Message throw opens its effect item.
 */
import {
  Placement,
  SignalNames,
  ThrowTag,
  ValueSourceTag,
  ValueTag,
  assertNever,
  compareStrings,
  mergeSort,
  programPublicId,
  valueSourceLiteral,
  type CompensationThrow,
  type EventPayload,
  type Expression,
  type Header,
  type MessageThrow,
  type SignalThrow,
  type Throw,
} from "../../il/types.js";
import {
  DeliveryTriggerTag,
  FailureTag,
  FiredTag,
  RaisedTag,
  ResumeTag,
  SignalReach,
  SignalTag,
  WriteRule,
  committed,
  completeSignal,
  failed,
  failedWith,
  instanceOf,
  leaveFlows,
  leaveOutgoing,
  occurrenceOf,
  openItem,
  openKindView,
  OpenKindTag,
  signal,
  signalAddressMatches,
  visible,
  type Binding,
  type BroadcastIntent,
  type DeliveryInput,
  type EvalContext,
  type Leave,
  type Occurrence,
  type OccurrenceRef,
  type OpenItem,
  type Origin,
  type Outcome,
  type Raised,
  type Result,
  type SignalAddress,
  SignalAddressTag,
  type State,
} from "../../state.js";
import { EvaluationTag, clearInside, ctxRequireMappings, evalContext, lastWrites, type Ctx } from "../../hooks.js";

/** How a throw Event leaves once it has done its work. */
export function throwLeave(payload: EventPayload): Leave {
  switch (payload.placement) {
    case Placement.Finish:
      return leaveFlows([]);
    case Placement.Intermediate:
      return leaveOutgoing;
  }
  return assertNever(payload.placement);
}

/** The public identity of a trigger: the thrower's occurrence, as `origin` names it. */
export function throwerRef(state: State, origin: Origin): OccurrenceRef {
  return { processInstanceId: instanceOf(state, origin.scope), element: origin.element, activation: origin.activation };
}

/**
 * A Compensation throw compensates the Activities retained in its scope occurrence, or only its `activityRef`'s, and
 * continues once all handlers have completed; only the synchronous form is implemented (`throw.compensation.asynchronous`
 * at admission).
 */
function throwCompensation(header: Header, payload: EventPayload, thrown: CompensationThrow, occurrence: Occurrence, state: State): Outcome {
  if (!thrown.waitForCompletion) return failed(FailureTag.Unsupported, "throw-compensation-asynchronous");
  const triggered = throwerRef(state, { element: header.id, scope: occurrence.scope, activation: occurrence.activation, host: null, patch: [] });
  return committed(signal(state, {
    tag: SignalTag.Compensate,
    scope: occurrence.scope,
    activity: thrown.activity,
    trigger: triggered,
    leave: null,
    resume: { tag: ResumeTag.Complete, occurrence: occurrence.id, leave: throwLeave(payload) },
  }));
}

// Signal throws (PC-SIGNAL-01)
//
// A Signal throw evaluates, in CIB's order, its business key, its payload and its name
// (`ThrowSignalEventActivityBehavior.java:48-51`); the first failure decides. It then fires every open item of the
// Signal's address in its own State, the root instance tree, before it leaves, and appends one `BroadcastIntent` for the
// other States (CIB-OP-0019): receivers are listed before any is delivered, so one armed during the delivery is not, an
// item gone by its turn is skipped (`step.ts`'s `fire`), and the thrower leaves before any receiver's cancellation (#151).

/** A business key (CIB-EXT-0040): a String, `null` being none; another type is CIB's failed cast, which rolls back. */
function signalBusinessKey(ctx: Ctx, context: EvalContext, expression: Expression | null): Result<string | null> {
  if (expression === null) return committed(null);
  const evaluation = ctx.evaluate(context, expression);
  switch (evaluation.tag) {
    case EvaluationTag.Value: {
      const result = evaluation.result;
      if (result.tag === ValueTag.String) return committed(result.value);
      if (result.tag === ValueTag.Null) return committed(null);
      // dynamic-only: a key's value type is the run's data.
      return failed(FailureTag.RolledBack, "signal-business-key-type");
    }
    case EvaluationTag.Failure:
      return failed(FailureTag.RolledBack, evaluation.code);
    case EvaluationTag.Unsupported:
      return failed(FailureTag.Unsupported, evaluation.code);
  }
  return assertNever(evaluation);
}

/**
 * The payload (CIB-EXT-0040): the `camunda:in` copies in document order, `variables="all"` copying every variable
 * `seen` from the throw at its position, a later target replacing an earlier (`VariableMap.put`).
 */
function signalPayload(ctx: Ctx, context: EvalContext, seen: readonly Binding[], record: SignalThrow): Result<readonly Binding[]> {
  const position = record.propagateAll ?? record.payload.length;
  const before = ctxRequireMappings(ctx, context, record.payload.slice(0, position));
  if (!before.ok) return failedWith(before.failure);
  const after = ctxRequireMappings(ctx, context, record.payload.slice(position));
  if (!after.ok) return failedWith(after.failure);
  return committed(lastWrites([...before.value, ...(record.propagateAll === null ? [] : seen), ...after.value]));
}

/**
 * The address a throw broadcasts to: its `signalRef` under `SignalNames.Identifier`, else its name (CIB-INT-0028), an
 * expression's evaluated at the throw (CIB-EXT-0041). A `null` name matches nothing in CIB or fails on an earlier
 * subscription of the same command (`EventSubscriptionManager.java:120-121`), so it is not claimed.
 */
function thrownAddress(ctx: Ctx, context: EvalContext, record: SignalThrow): Result<SignalAddress> {
  switch (ctx.program.options.signalNames) {
    case SignalNames.Identifier:
      // Admission refuses it (`signal.unspecified`).
      return record.signalRef === null
        ? failed(FailureTag.Unsupported, "signal-unspecified")
        : committed({ tag: SignalAddressTag.Qualified, ref: record.signalRef });
    case SignalNames.Addresses: {
      const name = record.name;
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
              if (result.tag === ValueTag.String) return committed({ tag: SignalAddressTag.Named, name: result.value });
              // dynamic-only: the evaluated name is the run's data.
              if (result.tag === ValueTag.Null) return failed(FailureTag.Unsupported, "signal-name-null");
              return failed(FailureTag.RolledBack, "signal-name-type");
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
 * The open items of `address` in the thrower's own State, by process instance, then in arming order, the order the
 * linearization of the population fixes for CIB's unordered `HashSet` (`EventSubscriptionManager.java:111-126`).
 */
function ownReceivers(state: State, address: SignalAddress): readonly OpenItem[] {
  const reached = state.openItems.filter((item) => {
    const detail = openKindView(item.kind).signal;
    return detail !== null && signalAddressMatches(address, detail.address);
  });
  return mergeSort(reached, (left, right) => {
    const order = compareStrings(instanceOf(state, left.scope), instanceOf(state, right.scope));
    return order < 0 || (order === 0 && left.id <= right.id);
  });
}

/** The delivery that fires `item` from a throw. */
function thrownDelivery(ctx: Ctx, state: State, address: SignalAddress, variables: readonly Binding[], item: OpenItem): DeliveryInput {
  return {
    occurrence: {
      processInstanceId: instanceOf(state, item.scope),
      element: programPublicId(ctx.program, item.element),
      activation: occurrenceOf(state, item.occurrence)?.activation ?? 0,
    },
    trigger: { tag: DeliveryTriggerTag.Signal, address, reach: SignalReach.Broadcast },
    correlation: [],
    payload: null,
    variables,
    atMs: null,
    conditionChoices: [],
  };
}

function throwSignal(ctx: Ctx, payload: EventPayload, record: SignalThrow, origin: Origin, occurrence: Occurrence, state: State): Outcome {
  const context = evalContext(state, ctx.program, occurrence.scope);
  const businessKey = signalBusinessKey(ctx, context, record.businessKey);
  if (!businessKey.ok) return failedWith(businessKey.failure);
  const variables = signalPayload(ctx, context, visible(state, ctx.program, occurrence.scope), record);
  if (!variables.ok) return failedWith(variables.failure);
  const address = thrownAddress(ctx, context, record);
  if (!address.ok) return failedWith(address.failure);
  let fired = state;
  for (const item of ownReceivers(state, address.value)) {
    fired = signal(fired, {
      tag: SignalTag.Fire, item: item.id,
      fired: { tag: FiredTag.Signal, delivery: thrownDelivery(ctx, fired, address.value, variables.value, item) },
    });
  }
  const intent: BroadcastIntent = {
    address: address.value, variables: variables.value, businessKey: businessKey.value, origin: throwerRef(state, origin),
  };
  return committed(signal({ ...fired, outbox: [...fired.outbox, intent] },
    completeSignal(occurrence.id, throwLeave(payload), [], WriteRule.Outward)));
}

/**
 * A Message throw under `MessageThrowForms.CibForms` (PC-MESSAGE-09): unbound, it passes its token on, as CIB's
 * `IntermediateThrowNoneEventActivityBehavior` does (CIB-INT-0027); bound, it opens one effect item, as CIB runs its
 * delegate as a Service Task's (CIB-EXT-0039), and `feature/work.ts#effectResult` answers it: a throw Event has no
 * envelope, so a success leaves with no outputs and a business failure raises from the throw's occurrence.
 */
function throwMessage(record: MessageThrow, occurrence: Occurrence, leave: (current: State) => State, state: State): State {
  if (record.binding === null) return leave(state);
  return openItem(state, {
    tag: OpenKindTag.Effect,
    detail: { protocol: record.binding.protocol, operation: record.binding.operation, arguments: [], failures: 0, send: null },
  }, occurrence);
}

export function arriveThrow(ctx: Ctx, header: Header, payload: EventPayload, thrown: Throw, occurrence: Occurrence, state: State): Outcome {
  const origin: Origin = { element: header.id, scope: occurrence.scope, activation: occurrence.activation, host: null, patch: [] };
  const leave = (current: State): State => signal(current, completeSignal(occurrence.id, throwLeave(payload), [], WriteRule.Outward));
  const raiseEvent = (event: Raised): Outcome => committed(signal(leave(state), { tag: SignalTag.Raise, event, origin }));
  switch (thrown.tag) {
    case ThrowTag.None:
      return committed(leave(state));
    case ThrowTag.Terminate:
      return committed(signal(clearInside(state, occurrence.scope, [occurrence.id]),
        completeSignal(occurrence.id, leaveFlows([]), [], WriteRule.Outward)));
    case ThrowTag.Error: {
      // `throw.error.message` at admission refuses an expression, the only message the kernel cannot read.
      const message = thrown.payload.message === null ? null : valueSourceLiteral(thrown.payload.message);
      return raiseEvent({ tag: RaisedTag.Error, code: thrown.payload.code, message });
    }
    // An Escalation is not critical: its thrower leaves after the search, unless the catcher interrupts it (`throwerLeaves`).
    case ThrowTag.Escalation:
      return committed(signal(state, { tag: SignalTag.Raise, event: { tag: RaisedTag.Escalation, code: thrown.payload.code }, origin }));
    case ThrowTag.Message:
      return committed(throwMessage(thrown.payload, occurrence, leave, state));
    case ThrowTag.Signal:
      return throwSignal(ctx, payload, thrown.payload, origin, occurrence, state);
    case ThrowTag.Compensation:
      return throwCompensation(header, payload, thrown.payload, occurrence, state);
    case ThrowTag.Cancel:
      return raiseEvent({ tag: RaisedTag.Cancel });
  }
  return assertNever(thrown);
}

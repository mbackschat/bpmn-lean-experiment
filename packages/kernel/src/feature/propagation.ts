/**
 * Propagation: throw Events and the search for a catcher, transcribed from `Kernel/Feature/Propagation.lean`.
 *
 * Owns matching on `Throw`. A none End Event consumes its token; a none intermediate throw passes it on. A Terminate
 * End Event clears the scope occurrence it ends in, which `step.ts` then completes: inside a Sub-Process the
 * Sub-Process completes normally and its parent continues, at the process level the instance completes
 * (BPMN 2.0.2 §13.5.6; `terminate-end-event-*` baselines).
 *
 * An Error, Escalation or Cancel End Event consumes its token and raises its event from the scope occurrence it ran
 * in. The search for a catcher (BPMN 2.0.2 §13.5.3, §13.5.4) visits, in order: the boundaries of the Activity that
 * raised it, if any; then, for each scope occurrence from the raising one outward, the Event Sub-Processes the
 * occurrence's element declares, then the boundaries on that element. At each of those candidate sets the catch
 * trigger with the lowest `Ctx.catches` precedence wins, document order breaking ties, so an exact code is preferred
 * over a catch-all at the same level but never over a nearer catcher. The search never passes the occurrence of a
 * compensation handler: what reaches it uncaught is the handler's outcome.
 *
 * A Compensation throw and a caught Cancel hand their scope occurrence to `feature/compensation.ts` through
 * `Signal.compensate`, with what follows once its handlers have completed.
 */
import type { Arrival, Ctx } from "../hooks.js";
import {
  Placement,
  ThrowTag,
  assertNever,
  type Boundary,
  type CompensationThrow,
  type ElementId,
  type EventPayload,
  type Header,
  type Subscription,
  type Throw,
  type Trigger,
} from "../il/types.js";
import {
  elementEnvelope,
  elementScope,
  programChildren,
  programElement,
} from "../il/query.js";
import {
  FailureTag,
  RaisedTag,
  SignalTag,
  activate,
  clearInside,
  closeItem,
  committed,
  disarm,
  emit,
  failed,
  instanceOf,
  leaveScope,
  raisedIsCancel,
  signal,
  type OccurrenceRef,
  type Origin,
  type Outcome,
  type Raised,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
} from "../state.js";

/** The catcher with the lowest precedence among `candidates`, the first in document order on a tie. */
export function best<T>(ctx: Ctx, raised: Raised, trigger: (candidate: T) => Trigger, candidates: readonly T[]): T | null {
  let chosen: readonly [number, T] | null = null;
  for (const candidate of candidates) {
    const rank = ctx.catches(raised, trigger(candidate));
    if (rank !== null && (chosen === null || rank < chosen[0])) {
      chosen = [rank, candidate];
    }
  }
  return chosen === null ? null : chosen[1];
}

export function boundaries(ctx: Ctx, element: ElementId): readonly Boundary[] {
  const found = programElement(ctx.program, element);
  return (found === null ? null : elementEnvelope(found))?.boundaries ?? [];
}

/**
 * Leave through `boundary`: an interrupting boundary first runs `interrupt`, then the boundary's outgoing flows start
 * in `scope`, the occurrence that holds the host.
 */
export function leaveThrough(
  boundary: Boundary,
  scope: ScopeOccurrenceId,
  interrupt: (state: State) => State,
  state: State,
): State {
  return emit(boundary.interrupting ? interrupt(state) : state, boundary.outgoing, scope);
}

/** The Event Sub-Processes declared directly in the element of `occurrence`, the process included. */
export function eventSubProcesses(ctx: Ctx, occurrence: ScopeOccurrence): readonly (readonly [ElementId, Subscription])[] {
  return programChildren(ctx.program, occurrence.element).flatMap((child) => {
    const found = elementScope(child);
    if (found === null) {
      return [];
    }
    const start = ctx.eventStart(found[1]);
    return start === null ? [] : [[found[0].id, start[0]] as const];
  });
}

/**
 * Unhandled events have no meaning selected yet: an uncaught Error or Escalation is refused, never treated as a none
 * End Event.
 */
export function unhandled(raised: Raised): Outcome {
  switch (raised.tag) {
    case RaisedTag.Error:
      return failed(FailureTag.Unsupported, "unhandled-error");
    case RaisedTag.Escalation:
      return failed(FailureTag.Unsupported, "unhandled-escalation");
    case RaisedTag.Signal:
      return failed(FailureTag.Unsupported, "raise-signal");
    case RaisedTag.Compensation:
      return failed(FailureTag.Unsupported, "raise-compensation");
    case RaisedTag.Cancel:
      return failed(FailureTag.Unsupported, "raise-cancel");
  }
  return assertNever(raised);
}

/** The public identity of the trigger `element` throws in `scope`: a fresh activation of the thrower. */
export function trigger(state: State, element: ElementId, scope: ScopeOccurrenceId): readonly [State, OccurrenceRef] {
  const [activated, activation] = activate(state, element);
  return [activated, { processInstanceId: instanceOf(activated, scope), element, activation }];
}

/**
 * An event left a compensation handler's occurrence uncaught: an Error fails the handler; what any other event means
 * there is not selected.
 */
export function leaveHandler(raised: Raised, handler: ScopeOccurrenceId, origin: Origin, state: State): Outcome {
  switch (raised.tag) {
    case RaisedTag.Error:
      return committed(
        signal(state, {
          tag: SignalTag.CompensationFailed,
          handler,
          code: raised.code,
          message: raised.message,
          origin,
        }),
      );
    case RaisedTag.Escalation:
      return failed(FailureTag.Unsupported, "compensation-handler-escalation");
    case RaisedTag.Signal:
      return failed(FailureTag.Unsupported, "compensation-handler-signal");
    case RaisedTag.Compensation:
      return failed(FailureTag.Unsupported, "compensation-handler-compensation");
    case RaisedTag.Cancel:
      return failed(FailureTag.Unsupported, "compensation-handler-cancel");
  }
  return assertNever(raised);
}

/**
 * Leave `occurrence`, held in `parent`, through its caught boundary. A Cancel boundary on a Transaction first cancels
 * the Transaction's interior and runs the compensation handlers retained in it, and only then takes the boundary's
 * flows (BPMN 2.0.2 §10.3.5 Transaction: the boundary "will direct the flow after the Transaction has been rolled
 * back and all compensation has been completed").
 */
export function leaveOccurrence(
  raised: Raised,
  origin: Origin,
  occurrence: ScopeOccurrence,
  parent: ScopeOccurrenceId,
  boundary: Boundary,
  state: State,
): State {
  if (raisedIsCancel(raised)) {
    const [triggered, thrown] = trigger(state, origin.element, origin.scope);
    return signal(clearInside(triggered, occurrence.id), {
      tag: SignalTag.Compensate,
      scope: occurrence.id,
      trigger: thrown,
      leave: true,
      resume: boundary.outgoing.map((flow) => ({ flow, scope: parent })),
    });
  }
  return leaveThrough(boundary, parent, (current) => disarm(leaveScope(current, occurrence.id), occurrence.id), state);
}

/**
 * Search outward from `current`; `fuel` bounds the walk by the number of scope occurrences. The search ends at the
 * occurrence of a compensation handler.
 */
export function searchScopes(
  ctx: Ctx,
  raised: Raised,
  origin: Origin,
  state: State,
  fuel: number,
  start: ScopeOccurrenceId | null,
): Outcome {
  let current = start;
  for (let remaining = fuel; remaining > 0 && current !== null; remaining -= 1) {
    const id: ScopeOccurrenceId = current;
    const occurrence = state.scopes.find((candidate) => candidate.id === id);
    if (occurrence === undefined) {
      return failed(FailureTag.SemanticFailure, "raise-from-missing-scope");
    }
    if (occurrence.compensating) {
      return leaveHandler(raised, occurrence.id, origin, state);
    }
    const eventSubProcess = best(ctx, raised, (candidate) => candidate[1].trigger, eventSubProcesses(ctx, occurrence));
    if (eventSubProcess !== null) {
      return committed(
        signal(state, {
          tag: SignalTag.StartEventSubProcess,
          element: eventSubProcess[0],
          parent: occurrence.id,
          variables: [],
        }),
      );
    }
    if (occurrence.element !== null && occurrence.parent !== null) {
      const boundary = best(ctx, raised, (candidate) => candidate.subscription.trigger, boundaries(ctx, occurrence.element));
      if (boundary !== null) {
        return committed(leaveOccurrence(raised, origin, occurrence, occurrence.parent, boundary, state));
      }
    }
    current = occurrence.parent;
  }
  return unhandled(raised);
}

/** `Signal.raise`. */
export function raise(ctx: Ctx, raised: Raised, origin: Origin, state: State): Outcome {
  const host = origin.host;
  if (host !== null) {
    const boundary = best(ctx, raised, (candidate) => candidate.subscription.trigger, boundaries(ctx, origin.element));
    if (boundary !== null) {
      return committed(leaveThrough(boundary, origin.scope, (current) => disarm(closeItem(current, host), host), state));
    }
  }
  return searchScopes(ctx, raised, origin, state, state.scopes.length + 1, origin.scope);
}

/**
 * A Compensation throw compensates the Activities retained in its scope occurrence and continues once all handlers
 * have completed; only the global, synchronous form is implemented.
 */
export function throwCompensation(
  header: Header,
  payload: EventPayload,
  thrown: CompensationThrow,
  arrival: Arrival,
  state: State,
): Outcome {
  if (thrown.activity !== null) {
    return failed(FailureTag.Unsupported, "compensation-throw-activity");
  }
  if (!thrown.waitForCompletion) {
    return failed(FailureTag.Unsupported, "compensation-throw-asynchronous");
  }
  const resume = ((): readonly { flow: string; scope: ScopeOccurrenceId }[] => {
    switch (payload.placement) {
      case Placement.Finish:
        return [];
      case Placement.Intermediate:
        return payload.outgoing.map((flow) => ({ flow, scope: arrival.scope }));
    }
    return assertNever(payload.placement);
  })();
  const [triggered, thrownRef] = trigger(state, header.id, arrival.scope);
  return committed(
    signal(triggered, { tag: SignalTag.Compensate, scope: arrival.scope, trigger: thrownRef, leave: false, resume }),
  );
}

export function arriveThrow(
  _ctx: Ctx,
  header: Header,
  payload: EventPayload,
  thrown: Throw,
  arrival: Arrival,
  state: State,
): Outcome {
  const origin: Origin = { element: header.id, scope: arrival.scope, host: null, activation: null };
  const passOn = (current: State): State => {
    switch (payload.placement) {
      case Placement.Finish:
        return current;
      case Placement.Intermediate:
        return emit(current, payload.outgoing, arrival.scope);
    }
    return assertNever(payload.placement);
  };
  switch (thrown.tag) {
    case ThrowTag.None:
      return committed(passOn(state));
    case ThrowTag.Terminate:
      return committed(clearInside(state, arrival.scope));
    case ThrowTag.Error:
      return committed(
        signal(passOn(state), {
          tag: SignalTag.Raise,
          event: { tag: RaisedTag.Error, code: thrown.payload.code, message: thrown.payload.message },
          origin,
        }),
      );
    case ThrowTag.Escalation:
      return committed(
        signal(passOn(state), {
          tag: SignalTag.Raise,
          event: { tag: RaisedTag.Escalation, code: thrown.payload.code },
          origin,
        }),
      );
    case ThrowTag.Message:
      return failed(FailureTag.Unsupported, "message-throw");
    case ThrowTag.Signal:
      return failed(FailureTag.Unsupported, "signal-throw");
    case ThrowTag.Compensation:
      return throwCompensation(header, payload, thrown.payload, arrival, state);
    case ThrowTag.Cancel:
      return committed(signal(passOn(state), { tag: SignalTag.Raise, event: { tag: RaisedTag.Cancel }, origin }));
  }
  return assertNever(thrown);
}

/**
 * Propagation: throw Events and the search for a catcher, transcribed from `Kernel/Feature/Propagation.lean`.
 *
 * Owns matching on `Throw` and `Raised`. A none End Event consumes its token; a none intermediate throw passes it on. A
 * Terminate End Event clears the scope occurrence it ends in, which `step.ts` then completes: inside a Sub-Process the
 * Sub-Process completes normally and its parent continues, at the process level the instance completes (BPMN 2.0.2
 * §13.5.6).
 *
 * An Error, Escalation or Cancel End Event consumes its token and raises its event from the scope occurrence it ran in.
 * The search for a catcher (BPMN 2.0.2 §13.5.3, §13.5.4) visits, in order: the boundaries of the Activity that raised
 * it, if any; then, for each scope occurrence from the raising one outward, the Event Sub-Processes the occurrence's
 * element declares, then the boundaries on that element. At each of those candidate sets the catch trigger with the
 * lowest `Ctx.catches` precedence wins, document order breaking ties, so an exact code is preferred over a catch-all at
 * the same level (CIB `ErrorEventDefinition#getPrecedence`) but never over a nearer catcher. The search never passes
 * the scope occurrence of a compensation handler: what reaches it uncaught is the handler's outcome. A Multi-Instance
 * instance's scope occurrence offers no boundaries of its own: they belong to the body, whose scope occurrence is the
 * next one out (`BpmnParse:3291-3295`, BPMN 2.0.2 §13.5.3).
 *
 * A boundary that catches begins its occurrence and leaves on its flows. A Compensation throw and a caught Cancel hand
 * their scope occurrence to `feature/compensation.ts` through `Signal.compensate`, with what follows once its handlers
 * have completed.
 *
 * An Error that finds no catcher does what the profile selects (`UnhandledError`): the standards reading fails the
 * process instance, CIB ends only the throwing path, which the thrower's own completion already did. An Escalation or a
 * Cancel that finds no catcher has no selected meaning.
 */
import {
  ErrorPathOutputs,
  Placement,
  ThrowTag,
  UnhandledError,
  assertNever,
  elementEnvelope,
  elementScope,
  programChildren,
  programElement,
  valueSourceLiteral,
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
  FailureTag,
  InstanceStatus,
  RaisedTag,
  ResumeTag,
  SignalTag,
  WriteRule,
  beginRequest,
  clearInside,
  committed,
  completeSignal,
  failed,
  idle,
  instanceOf,
  instanceRoot,
  leaveFlows,
  leaveOutgoing,
  signal,
  type Binding,
  type Leave,
  type Occurrence,
  type OccurrenceRef,
  type Origin,
  type Outcome,
  type Raised,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
} from "../state.js";
import { ScopeRole, boundaryFire, ctxRequireMappings, evalContext, type Ctx } from "../hooks.js";

/** The catcher with the lowest precedence among `candidates`, the first in document order on a tie, with what it writes. */
function best<T>(ctx: Ctx, raised: Raised, trigger: (candidate: T) => Trigger, candidates: readonly T[]): readonly [T, readonly Binding[]] | null {
  let chosen: readonly [number, readonly Binding[], T] | null = null;
  for (const candidate of candidates) {
    const caught = ctx.catches(raised, trigger(candidate));
    if (caught === null) continue;
    if (chosen === null || caught.rank < chosen[0]) chosen = [caught.rank, caught.writes, candidate];
  }
  return chosen === null ? null : [chosen[2], chosen[1]];
}

function boundaries(ctx: Ctx, element: ElementId): readonly Boundary[] {
  const found = programElement(ctx.program, element);
  return (found === null ? null : elementEnvelope(found))?.boundaries ?? [];
}

/** The Event Sub-Processes declared directly in the element of `occurrence`, the process included. */
function eventSubProcesses(ctx: Ctx, occurrence: ScopeOccurrence): readonly (readonly [ElementId, Subscription])[] {
  return programChildren(ctx.program, occurrence.element).flatMap((child) => {
    const scope = elementScope(child);
    const start = scope === null ? null : ctx.eventStart(scope[1]);
    return scope === null || start === null ? [] : [[scope[0].id, start[0]] as const];
  });
}

/** The public identity of a trigger: the thrower's occurrence, as `origin` names it. */
function trigger(state: State, origin: Origin): OccurrenceRef {
  return { processInstanceId: instanceOf(state, origin.scope), element: origin.element, activation: origin.activation };
}

/**
 * Whether the thrower's output mappings would run as its instance ends: it ran directly in its instance's root and
 * nothing else remains there. CIB then rolls the command back (CIB-LIM-0006).
 */
function endsInstanceWithOutputs(ctx: Ctx, origin: Origin, state: State): boolean {
  const thrower = programElement(ctx.program, origin.element);
  const outputs = (thrower === null ? null : elementEnvelope(thrower))?.outputs ?? [];
  return outputs.length > 0 && instanceRoot(state, origin.scope) === origin.scope && idle(state, origin.scope);
}

/**
 * An Error no catcher takes. BPMN 2.0.2 Table 10.88 leaves the outcome unspecified, "a common one being termination of
 * the Process instance": `failsInstance` ends the instance failed, naming the thrower. `endsThrowingPath` is CIB's
 * `execution.end(true)` (`BpmnExceptionHandler#propagateError`, CIB-INT-0013): the thrower's completion already ended
 * its path, and the instance goes on or completes as what remains says.
 */
function unhandledError(ctx: Ctx, code: string, message: string | null, origin: Origin, state: State): Outcome {
  const selected = ctx.program.options.unhandledError;
  switch (selected) {
    case UnhandledError.FailsInstance:
      return committed(signal(state, {
        tag: SignalTag.EndInstance,
        status: InstanceStatus.Failed,
        failure: { code, message, occurrence: trigger(state, origin), related: [] },
      }));
    case UnhandledError.EndsThrowingPath:
      if (!endsInstanceWithOutputs(ctx, origin, state)) return committed(state);
      return failed(FailureTag.Unsupported, "unhandled-error-ends-instance-with-outputs"); // dynamic-only: whether its path is the last
  }
  return assertNever(selected);
}

/**
 * The search found no catcher: it ended at `handler`, the scope occurrence of a compensation handler, which an Error
 * fails, or it passed its instance's root. What an Escalation or a Cancel means at either is not selected. Dynamic-only:
 * whether a raised event finds a catcher depends on where its thrower runs.
 */
function exhausted(ctx: Ctx, raised: Raised, origin: Origin, handler: ScopeOccurrenceId | null, state: State): Outcome {
  switch (raised.tag) {
    case RaisedTag.Error:
      return handler === null
        ? unhandledError(ctx, raised.code, raised.message, origin, state)
        : committed(signal(state, { tag: SignalTag.CompensationFailed, handler, code: raised.code, message: raised.message, origin }));
    case RaisedTag.Escalation:
      return handler === null
        ? failed(FailureTag.Unsupported, "unhandled-escalation") // dynamic-only: where its thrower runs
        : failed(FailureTag.Unsupported, "compensation-handler-escalation"); // dynamic-only: what a handler raises
    case RaisedTag.Cancel:
      return handler === null
        ? failed(FailureTag.Unsupported, "raise-cancel") // dynamic-only: where its thrower runs
        : failed(FailureTag.Unsupported, "compensation-handler-cancel"); // dynamic-only: what a handler raises
  }
  return assertNever(raised);
}

/**
 * Write a catch's code and message variables from the catcher's event scope outward: CIB sets them on the execution of
 * the boundary's host or of the Event Sub-Process's enclosing scope (`BpmnExceptionHandler#propagateError`,
 * CIB-EXT-0028). Admission refuses them unless the profile selects them.
 */
function writeCaught(scope: ScopeOccurrenceId, writes: readonly Binding[], state: State): State {
  return writes.length === 0 ? state : signal(state, { tag: SignalTag.Write, scope, writes, rule: WriteRule.Outward });
}

/**
 * Under `ErrorPathOutputs.mapped` a Scope an Error boundary interrupts writes its output mappings, after the catch
 * variables: CIB runs them as it destroys the Scope (`ExecutionEntity.destroy`, `OutputParameter.execute`,
 * CIB-EXT-0016).
 */
function interruptedOutputs(ctx: Ctx, occurrence: ScopeOccurrence, parent: ScopeOccurrenceId, state: State): Outcome {
  const element = occurrence.element === null ? null : programElement(ctx.program, occurrence.element);
  const mappings = (element === null ? null : elementScope(element))?.[1].envelope.outputs ?? [];
  const selected = ctx.program.options.errorPathOutputs;
  switch (selected) {
    case ErrorPathOutputs.Mapped: {
      if (mappings.length === 0) return committed(state);
      const outputs = ctxRequireMappings(ctx, evalContext(state, occurrence.id), mappings);
      if (!outputs.ok) return outputs;
      return committed(signal(state, { tag: SignalTag.Write, scope: parent, writes: outputs.value, rule: WriteRule.Outward }));
    }
    case ErrorPathOutputs.None:
      return committed(state);
  }
  return assertNever(selected);
}

/**
 * Leave `occurrence`, held in `parent`, through its caught boundary. A Cancel boundary on a Transaction first cancels
 * the Transaction's interior and runs the compensation handlers retained in it, and only then takes the boundary's
 * flows (BPMN 2.0.2 §10.3.5 Transaction: the boundary "will direct the flow after the Transaction has been rolled back
 * and all compensation has been completed").
 */
function leaveOccurrence(
  ctx: Ctx,
  raised: Raised,
  origin: Origin,
  occurrence: ScopeOccurrence,
  parent: ScopeOccurrenceId,
  boundary: Boundary,
  writes: readonly Binding[],
  state: State,
): Outcome {
  const caught = writeCaught(occurrence.id, writes, state);
  switch (raised.tag) {
    case RaisedTag.Error: {
      const written = interruptedOutputs(ctx, occurrence, parent, caught);
      if (!written.ok) return written;
      return committed(boundaryFire(boundary, occurrence.occurrence, null, parent, [], written.value));
    }
    case RaisedTag.Escalation:
      return committed(boundaryFire(boundary, occurrence.occurrence, null, parent, [], caught));
    case RaisedTag.Cancel:
      return committed(signal(clearInside(state, occurrence.id), {
        tag: SignalTag.Compensate,
        scope: occurrence.id,
        activity: null,
        trigger: trigger(state, origin),
        leave: occurrence.occurrence,
        resume: { tag: ResumeTag.Occur, element: boundary.id, scope: parent, leave: leaveFlows(boundary.outgoing) },
      }));
  }
  return assertNever(raised);
}

/**
 * Search outward from `start`; the fuel bounds the walk by the number of scope occurrences. The search ends at the
 * scope occurrence of a compensation handler, and a Multi-Instance instance contributes no boundaries.
 */
function searchScopes(ctx: Ctx, raised: Raised, origin: Origin, state: State, bound: number, start: ScopeOccurrenceId | null): Outcome {
  let current = start;
  for (let fuel = bound; fuel > 0 && current !== null; fuel -= 1) {
    const at = current;
    const occurrence = state.scopes.find((scope) => scope.id === at);
    if (occurrence === undefined) return failed(FailureTag.SemanticFailure, "raise-from-missing-scope");
    const role = ctx.scopeRole(state, occurrence.id);
    if (role === ScopeRole.CompensationHandler) return exhausted(ctx, raised, origin, occurrence.id, state);
    const handled = best(ctx, raised, ([, subscription]) => subscription.trigger, eventSubProcesses(ctx, occurrence));
    if (handled !== null) {
      const [[element], writes] = handled;
      return committed(signal(writeCaught(occurrence.id, writes, state),
        { tag: SignalTag.Begin, request: beginRequest({ element, scope: occurrence.id }) }));
    }
    if (occurrence.element !== null && occurrence.parent !== null) {
      const attached = role === ScopeRole.MultiInstanceInstance ? [] : boundaries(ctx, occurrence.element);
      const caught = best(ctx, raised, (boundary) => boundary.subscription.trigger, attached);
      if (caught !== null) return leaveOccurrence(ctx, raised, origin, occurrence, occurrence.parent, caught[0], caught[1], state);
    }
    current = occurrence.parent;
  }
  return exhausted(ctx, raised, origin, null, state);
}

/** `Signal.raise`. */
export function raise(ctx: Ctx, raised: Raised, origin: Origin, state: State): Outcome {
  const hostBoundaries = ctx.scopeRole(state, origin.scope) === ScopeRole.MultiInstanceInstance ? [] : boundaries(ctx, origin.element);
  if (origin.host !== null) {
    const caught = best(ctx, raised, (boundary) => boundary.subscription.trigger, hostBoundaries);
    if (caught !== null) return committed(boundaryFire(caught[0], null, null, origin.scope, [], writeCaught(origin.scope, caught[1], state)));
  }
  return searchScopes(ctx, raised, origin, state, state.scopes.length + 1, origin.scope);
}

/** How a throw Event leaves once it has done its work. */
function throwLeave(payload: EventPayload): Leave {
  switch (payload.placement) {
    case Placement.Finish:
      return leaveFlows([]);
    case Placement.Intermediate:
      return leaveOutgoing;
  }
  return assertNever(payload.placement);
}

/**
 * A Compensation throw compensates the Activities retained in its scope occurrence and continues once all handlers have
 * completed; only the global, synchronous form is implemented (`throw.compensation.*` at admission).
 */
function throwCompensation(header: Header, payload: EventPayload, thrown: CompensationThrow, occurrence: Occurrence, state: State): Outcome {
  if (thrown.activity !== null) return failed(FailureTag.Unsupported, "throw-compensation-activity");
  if (!thrown.waitForCompletion) return failed(FailureTag.Unsupported, "throw-compensation-asynchronous");
  const triggered = trigger(state, { element: header.id, scope: occurrence.scope, activation: occurrence.activation, host: null });
  return committed(signal(state, {
    tag: SignalTag.Compensate,
    scope: occurrence.scope,
    activity: thrown.activity,
    trigger: triggered,
    leave: null,
    resume: { tag: ResumeTag.Complete, occurrence: occurrence.id, leave: throwLeave(payload) },
  }));
}

export function arriveThrow(_ctx: Ctx, header: Header, payload: EventPayload, thrown: Throw, occurrence: Occurrence, state: State): Outcome {
  const origin: Origin = { element: header.id, scope: occurrence.scope, activation: occurrence.activation, host: null };
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
    case ThrowTag.Escalation:
      return raiseEvent({ tag: RaisedTag.Escalation, code: thrown.payload.code });
    // Admission refuses both (`throw.message`, `throw.signal`).
    case ThrowTag.Message:
      return failed(FailureTag.Unsupported, "throw-message");
    case ThrowTag.Signal:
      return failed(FailureTag.Unsupported, "throw-signal");
    case ThrowTag.Compensation:
      return throwCompensation(header, payload, thrown.payload, occurrence, state);
    case ThrowTag.Cancel:
      return raiseEvent({ tag: RaisedTag.Cancel });
  }
  return assertNever(thrown);
}

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
 * process instance, CIB ends only the throwing path, which the thrower's own completion already did, and is refused
 * inside a Multi-Instance or called instance. An Escalation that finds no catcher lets its thrower leave and changes
 * nothing else; a Cancel that finds none has no selected meaning.
 */
import {
  ErrorPathOutputs,
  Placement,
  RaisedCallOutputs,
  ThrowTag,
  UnhandledError,
  assertNever,
  elementEnvelope,
  elementEvent,
  elementScope,
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
  calledRoot,
  clearInside,
  committed,
  completeSignal,
  failed,
  failedWith,
  idle,
  instanceOf,
  instanceRoot,
  leaveFlows,
  leaveOutgoing,
  raisedIsCancel,
  signal,
  visible,
  type Binding,
  type Leave,
  type Occurrence,
  type OccurrenceRef,
  type Origin,
  type Outcome,
  type Raised,
  type Result,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
  childrenOf,
} from "../state.js";
import { ScopeRole, boundaryFire, ctxOutputReads, ctxRequireMappingsWith, lastWrites, ownVariables, type Ctx } from "../hooks.js";

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

function boundariesOf(ctx: Ctx, element: ElementId): readonly Boundary[] {
  const found = programElement(ctx.program, element);
  return (found === null ? null : elementEnvelope(found))?.boundaries ?? [];
}

type Handler = readonly [ElementId, Subscription, boolean];

/**
 * The Event Sub-Processes declared directly in `occurrence`, the process included, each with its start and whether it
 * interrupts; a called root's are its called process's (`childrenOf`).
 */
function eventSubProcesses(ctx: Ctx, state: State, occurrence: ScopeOccurrence): readonly Handler[] {
  return childrenOf(state, ctx.program, occurrence.id).flatMap((child) => {
    const scope = elementScope(child);
    const start = scope === null ? null : ctx.eventStart(scope[1]);
    return scope === null || start === null ? [] : [[scope[0].id, start[0], start[1]] as const];
  });
}

/**
 * An Escalation's thrower leaves once the search has decided, unless its catcher interrupts and so cancels it with the
 * scope that holds it: CIB starts the catcher's handler and only then leaves the throw, and only when the catcher does
 * not interrupt (`ThrowEscalationEventActivityBehavior.java:44-48`). Only an Escalation's search calls this;
 * `arriveThrow` leaves an Error or a Cancel throw before raising it.
 */
function throwerLeaves(ctx: Ctx, origin: Origin, state: State): State {
  const standing = state.occurrences.find((occurrence) =>
    occurrence.element === origin.element && occurrence.scope === origin.scope && occurrence.activation === origin.activation);
  const element = programElement(ctx.program, origin.element);
  const event = element === null ? null : elementEvent(element);
  return standing === undefined || event === null
    ? state
    : signal(state, completeSignal(standing.id, throwLeave(event[1]), [], WriteRule.Outward));
}

/**
 * Whether the search passes the Event Sub-Process a raise originates in however deep inside it the raise runs, or only
 * when it runs directly in it. CIB's Error finder skips an ancestor flow scope at any depth
 * (`bpmn/helper/ErrorDeclarationForProcessInstanceFinder.java:41-58`, `pvm/process/ScopeImpl.java:170-182`), its
 * Escalation finder only the thrower's direct flow scope (`bpmn/helper/EscalationEventDefinitionFinder.java:58-61`). No
 * Event Sub-Process catches a Cancel (`start.cancel`), so its answer is never read.
 */
function passesHandlerAtAnyDepth(raised: Raised): boolean {
  switch (raised.tag) {
    case RaisedTag.Error: return true;
    case RaisedTag.Escalation: return false;
    case RaisedTag.Cancel: return true;
  }
  return assertNever(raised);
}

/** The scope occurrence held directly in `visited` that the chain from `start` outward passes through, if any. */
function heldOnChain(state: State, visited: ScopeOccurrenceId, start: ScopeOccurrenceId): ScopeOccurrence | null {
  let current: ScopeOccurrenceId | null = start;
  for (let fuel = state.scopes.length + 1; fuel > 0 && current !== null; fuel -= 1) {
    const at: ScopeOccurrenceId = current;
    const occurrence = state.scopes.find((scope) => scope.id === at);
    if (occurrence === undefined) return null;
    if (occurrence.parent === visited) return occurrence;
    current = occurrence.parent;
  }
  return null;
}

/**
 * The Event Sub-Processes of `occurrence` that may catch a raise from `origin` (PC-ERROR-02). One the raise originates
 * inside is no candidate, so a rethrow passes the handler that runs it, or that an interrupting handler's completion is
 * disposing of, to the host's boundaries and outward (BPMN 2.0.2 §13.5.4: "control passes to the boundary Event";
 * CIB-INT-0022). Refused, dynamic-only because they rest on what a running handler raises: an Escalation from deeper
 * inside a handler that matches it, which CIB catches with that handler again (`escalation-rethrow-reenters-handler`);
 * and a raise from an interrupting handler that another Event Sub-Process of the same scope would catch, which §13.5.4
 * rules out ("new Event Handlers MUST NOT be started" while the parent is Failing or Terminating) and CIB starts
 * (CIB-DEV-0003).
 */
function handlerCandidates(ctx: Ctx, raised: Raised, origin: Origin, state: State, occurrence: ScopeOccurrence): Result<readonly Handler[]> {
  const handlers = eventSubProcesses(ctx, state, occurrence);
  const held = heldOnChain(state, occurrence.id, origin.scope);
  const running = held === null ? undefined : handlers.find(([element]) => element === held.element);
  if (held === null || running === undefined) return { ok: true, value: handlers };
  const [element, start, interrupting] = running;
  const others = handlers.filter(([candidate]) => candidate !== element);
  if (ctx.catches(raised, start.trigger) !== null && !passesHandlerAtAnyDepth(raised) && origin.scope !== held.id) {
    return failed(FailureTag.Unsupported, "escalation-rethrow-reenters-handler"); // dynamic-only: how deep in its handler a raise runs
  }
  if (interrupting && best(ctx, raised, ([, subscription]) => subscription.trigger, others) !== null) {
    return failed(FailureTag.Unsupported, "rethrow-caught-by-sibling-handler"); // dynamic-only: what a running handler raises
  }
  return { ok: true, value: others };
}

/** The public identity of a trigger: the thrower's occurrence, as `origin` names it. */
function throwerRef(state: State, origin: Origin): OccurrenceRef {
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
 * Refuse an uncaught Error whose path lies inside a Multi-Instance instance or a called instance, walking out from
 * `start` to the root. What CIB's `execution.end(true)` does to either enclosing instance is PC-ERROR-03's to settle
 * (CIB-INT-0013's boundary).
 */
function enclosingInstances(ctx: Ctx, state: State, start: ScopeOccurrenceId): Outcome {
  let current: ScopeOccurrenceId | null = start;
  for (let fuel = state.scopes.length + 1; fuel > 0 && current !== null; fuel -= 1) {
    if (ctx.scopeRole(state, current) === ScopeRole.MultiInstanceInstance) {
      return failed(FailureTag.Unsupported, "unhandled-error-leaves-multi-instance-instance"); // dynamic-only: where its thrower runs
    }
    if (calledRoot(state, current)) {
      return failed(FailureTag.Unsupported, "unhandled-error-leaves-called-instance"); // dynamic-only: where its thrower runs
    }
    const id: ScopeOccurrenceId = current;
    current = state.scopes.find((scope) => scope.id === id)?.parent ?? null;
  }
  return committed(state);
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
        failure: { code, message, occurrence: throwerRef(state, origin), related: [] },
      }));
    case UnhandledError.EndsThrowingPath: {
      const enclosing = enclosingInstances(ctx, state, origin.scope);
      if (!enclosing.ok) return enclosing;
      if (!endsInstanceWithOutputs(ctx, origin, state)) return committed(state);
      return failed(FailureTag.Unsupported, "unhandled-error-ends-instance-with-outputs"); // dynamic-only: whether its path is the last
    }
  }
  return assertNever(selected);
}

/**
 * The search found no catcher: it ended at `handler`, the scope occurrence of a compensation handler, which an Error
 * fails, or it passed its instance's root. An Escalation that passed the root changes nothing but its thrower's leave
 * (§10.5.1: "execution continues at the location of throwing"; CIB-INT-0021). What an Escalation at a compensation
 * handler or a Cancel at either means is not selected. Dynamic-only: whether a raised event finds a catcher depends on
 * where its thrower runs.
 */
function exhausted(ctx: Ctx, raised: Raised, origin: Origin, handler: ScopeOccurrenceId | null, state: State): Outcome {
  switch (raised.tag) {
    case RaisedTag.Error:
      return handler === null
        ? unhandledError(ctx, raised.code, raised.message, origin, state)
        : committed(signal(state, { tag: SignalTag.CompensationFailed, handler, code: raised.code, message: raised.message, origin }));
    case RaisedTag.Escalation:
      return handler === null
        ? committed(throwerLeaves(ctx, origin, state))
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
 * Under `ErrorPathOutputs.mapped` a Scope an Error or Escalation boundary interrupts writes its output mappings, after
 * the catch variables `caught`: CIB sets those on the Scope's execution and then runs the mappings as it destroys the Scope
 * (`BpmnExceptionHandler.java:146-153`, `ExecutionEntity.java:521-525`, `OutputParameter.execute`, CIB-EXT-0016). The
 * mappings are evaluated before the queued write of `caught` applies, so they read `caught` as installed: `setVariable`
 * on the Scope's execution, the boundary's event scope (`BpmnParse.java:3298,3301`), leaves a caught value in a local
 * of its name or else at its nearest owner or the root (`ctxOutputReads`). `destroy` runs the same parameter list as a
 * normal completion (`IoMapping.java:44-48`), so the outputs read as `completeScope`'s do: under
 * `OutputContext.ActivityScope` a later one reads an earlier one's write, ahead of a caught value no local holds.
 */
function interruptedOutputs(
  ctx: Ctx,
  occurrence: ScopeOccurrence,
  parent: ScopeOccurrenceId,
  caught: readonly Binding[],
  state: State,
): Outcome {
  const element = occurrence.element === null ? null : programElement(ctx.program, occurrence.element);
  const mappings = (element === null ? null : elementScope(element))?.[1].envelope.outputs ?? [];
  const selected = ctx.program.options.errorPathOutputs;
  switch (selected) {
    case ErrorPathOutputs.Mapped: {
      if (mappings.length === 0) return committed(state);
      const outer = occurrence.parent === null ? [] : visible(state, occurrence.parent);
      const reads = ctxOutputReads(ctx, state.logicalTimeMs, ownVariables(state, occurrence.id), caught, outer);
      const outputs = ctxRequireMappingsWith(ctx, reads, mappings);
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
 * and all compensation has been completed"). An interrupting Error or Escalation boundary writes its catch variables
 * from the host and the host's output mappings (`interruptedOutputs`; CIB-EXT-0016 for both, as `deleteCascade`
 * destroys the host either way, `PvmAtomicOperationCancelActivity.java:60`). Only an Escalation boundary is
 * non-interrupting (`boundary.error.nonInterrupting`): it writes its code variable from the host's parent, CIB's flow
 * scope of the boundary (`EscalationHandler.java:80-97`), and its thrower then leaves.
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
  if (raisedIsCancel(raised)) {
    return committed(signal(clearInside(state, occurrence.id), {
      tag: SignalTag.Compensate,
      scope: occurrence.id,
      activity: null,
      trigger: throwerRef(state, origin),
      leave: occurrence.occurrence,
      resume: { tag: ResumeTag.Occur, element: boundary.id, scope: parent, leave: leaveFlows(boundary.outgoing) },
    }));
  }
  if (boundary.interrupting) {
    const written = interruptedOutputs(ctx, occurrence, parent, writes, writeCaught(occurrence.id, writes, state));
    if (!written.ok) return written;
    return committed(boundaryFire(boundary, occurrence.occurrence, null, parent, [], written.value));
  }
  return committed(throwerLeaves(ctx, origin, boundaryFire(boundary, occurrence.occurrence, null, parent, [], writeCaught(parent, writes, state))));
}

/**
 * What Propagation asks of the Work feature it may not import (ARCHITECTURE-SPEC "Modules and build shape"), which
 * `registry.ts` fills from `feature/work`. `mappedErrorOutputs`: how the Activity `origin.host`, still running after its
 * business Error, leaves once the values its catcher installs through its frame are known. `callOutputs`: what a raised
 * Error or Escalation that reaches the root of a called instance writes into the caller, the Call's output mappings
 * under CIB-EXT-0034 (`Work.raisedOutputs`; docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md, PC-SCOPE-06 item 2),
 * applied before the search goes on so that an outer Call's pass reads it.
 */
export interface PropagationHooks {
  readonly mappedErrorOutputs: (ctx: Ctx, origin: Origin, installed: readonly Binding[], state: State) => Outcome;
  readonly callOutputs: (ctx: Ctx, root: ScopeOccurrence, state: State) => Outcome;
}

export const defaultPropagationHooks: PropagationHooks = {
  mappedErrorOutputs: (_ctx, _origin, _installed, state) => committed(state),
  callOutputs: (_ctx, _root, state) => committed(state),
};

/** Under `RaisedCallOutputs.AtCalledRoot` (CIB-EXT-0034) a called root the search visits passes its Call's outputs. */
function passCallOutputs(hooks: PropagationHooks, ctx: Ctx, occurrence: ScopeOccurrence, state: State): Outcome {
  const selected = ctx.program.options.raisedCallOutputs;
  switch (selected) {
    case RaisedCallOutputs.AtCalledRoot:
      return calledRoot(state, occurrence.id) ? hooks.callOutputs(ctx, occurrence, state) : committed(state);
    case RaisedCallOutputs.None:
      return committed(state);
  }
  return assertNever(selected);
}

/**
 * Search outward from `start`; the fuel bounds the walk by the number of scope occurrences. The search ends at the
 * scope occurrence of a compensation handler, and a Multi-Instance instance contributes no boundaries. Each called root
 * it visits passes the Call's outputs (`passCallOutputs`) before any catcher there or further out begins,
 * caught or not (CIB registers `tree/OutputVariablesPropagator.java:34-43` as a pre-visitor of both searches).
 */
function searchScopes(
  hooks: PropagationHooks,
  ctx: Ctx,
  raised: Raised,
  origin: Origin,
  start: State,
  bound: number,
  from: ScopeOccurrenceId | null,
): Outcome {
  let state = start;
  let current = from;
  for (let fuel = bound; fuel > 0 && current !== null; fuel -= 1) {
    const at = current;
    const occurrence = state.scopes.find((scope) => scope.id === at);
    if (occurrence === undefined) return failed(FailureTag.SemanticFailure, "raise-from-missing-scope");
    const role = ctx.scopeRole(state, occurrence.id);
    if (role === ScopeRole.CompensationHandler) return exhausted(ctx, raised, origin, occurrence.id, state);
    const passed = passCallOutputs(hooks, ctx, occurrence, state);
    if (!passed.ok) return passed;
    state = passed.value;
    const handlers = handlerCandidates(ctx, raised, origin, state, occurrence);
    if (!handlers.ok) return failedWith(handlers.failure);
    const handled = best(ctx, raised, ([, subscription]) => subscription.trigger, handlers.value);
    if (handled !== null) {
      const [[element, , interrupting], writes] = handled;
      const begun = signal(writeCaught(occurrence.id, writes, state),
        { tag: SignalTag.Begin, request: beginRequest({ element, scope: occurrence.id }) });
      return committed(interrupting ? begun : throwerLeaves(ctx, origin, begun));
    }
    if (occurrence.element !== null && occurrence.parent !== null) {
      const attached = role === ScopeRole.MultiInstanceInstance ? [] : boundariesOf(ctx, occurrence.element);
      const caught = best(ctx, raised, (boundary) => boundary.subscription.trigger, attached);
      if (caught !== null) return leaveOccurrence(ctx, raised, origin, occurrence, occurrence.parent, caught[0], caught[1], state);
    }
    current = occurrence.parent;
  }
  return exhausted(ctx, raised, origin, null, state);
}

/**
 * `Signal.raise`. An Activity that raised the event (`origin.host`) is still running: its own boundaries are searched
 * first, and a catching one installs its variables through the Activity's frame before the Activity leaves with its
 * mapped Error-path outputs, as CIB sets them on the task's execution before destroying it
 * (`BpmnExceptionHandler.java:146-154`, CIB-EXT-0028). Otherwise the Activity leaves first, installing nothing, and the
 * event is raised again without a host, so every other catcher sees it gone (CIB-EXT-0028's boundary).
 */
export function raise(hooks: PropagationHooks, ctx: Ctx, raised: Raised, origin: Origin, state: State): Outcome {
  const hostBoundaries = ctx.scopeRole(state, origin.scope) === ScopeRole.MultiInstanceInstance ? [] : boundariesOf(ctx, origin.element);
  if (origin.host === null) return searchScopes(hooks, ctx, raised, origin, state, state.scopes.length + 1, origin.scope);
  const caught = best(ctx, raised, (boundary) => boundary.subscription.trigger, hostBoundaries);
  if (caught !== null) {
    const left = hooks.mappedErrorOutputs(ctx, origin, lastWrites(caught[1]), state);
    return left.ok ? committed(boundaryFire(caught[0], null, null, origin.scope, [], left.value)) : left;
  }
  const left = hooks.mappedErrorOutputs(ctx, origin, [], state);
  return left.ok ? committed(signal(left.value, { tag: SignalTag.Raise, event: raised, origin: { ...origin, host: null, patch: [] } })) : left;
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

export function arriveThrow(_ctx: Ctx, header: Header, payload: EventPayload, thrown: Throw, occurrence: Occurrence, state: State): Outcome {
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

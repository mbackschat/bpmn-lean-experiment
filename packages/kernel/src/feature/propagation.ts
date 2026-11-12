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
 * process instance, CIB ends only the throwing path, which the thrower's leave ends, and is refused inside a
 * Multi-Instance instance. An Escalation that finds no catcher lets its thrower leave and changes nothing else; a Cancel
 * that finds none has no selected meaning.
 */
import {
  CompensationHandlerFailureTag,
  ErrorPathOutputs,
  Placement,
  RaisedCallOutputs,
  SignalNames,
  ThrowTag,
  UnhandledError,
  ValueSourceTag,
  ValueTag,
  assertNever,
  compareStrings,
  elementActivity,
  elementEnvelope,
  elementEvent,
  elementScope,
  mergeSort,
  programElement,
  programPublicId,
  valueSourceLiteral,
  workCall,
  type Boundary,
  type CompensationThrow,
  type ElementId,
  type EventPayload,
  type Expression,
  type Header,
  type MessageThrow,
  type SignalThrow,
  type Subscription,
  type Throw,
  type Trigger,
} from "../il/types.js";
import {
  DeliveryTriggerTag,
  FailureTag,
  FiredTag,
  InstanceStatus,
  RaisedTag,
  ResumeTag,
  SignalReach,
  SignalTag,
  WriteRule,
  beginRequest,
  calledRoot,
  committed,
  completeSignal,
  disarm,
  failed,
  failedWith,
  idle,
  instanceOf,
  instanceRoot,
  leaveFlows,
  leaveOutgoing,
  occurrenceOf,
  openItem,
  openKindView,
  OpenKindTag,
  raisedIsCancel,
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
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type SignalAddress,
  SignalAddressTag,
  type State,
  childrenOf,
} from "../state.js";
import {
  EvaluationTag, ScopeRole, boundaryFire, clearInside, ctxOutputReads, ctxRequireMappings, ctxRequireMappingsWith, evalContext,
  idleWithout, lastWrites, ownVariables, type Ctx,
} from "../hooks.js";

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
 * What Propagation asks of the features it may not import (ARCHITECTURE-SPEC "Modules and build shape"), which
 * `registry.ts` fills. `mappedErrorOutputs` (`Work.mappedErrorOutputs`): how the Activity `origin.host`, still running
 * after its business Error, leaves once the search has decided, given the values its own boundary installs through its
 * frame; its writes apply at once and its removal is queued. `writeCaught`: a catcher's code and message variables,
 * written at once from its event scope outward (`Data.writeOutputs`), so that the outputs that run next read them.
 * `callOutputs`: what a raised Error or Escalation that reaches the
 * root of a called instance writes into the caller, the Call's output mappings under CIB-EXT-0034
 * (`Work.raisedOutputs`; docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md, PC-SCOPE-06 item 2), applied before the search
 * goes on so that an outer Call's pass reads it. `dropRuns` (`Compensation.dropWithin`): the compensation runs inside a
 * scope occurrence an interrupting catcher has decided to interrupt go at once, as its items do (`withdrawOccurrence`),
 * so that the leave a raising handler queued before the interruption advances no run the interruption removes.
 */
export interface PropagationHooks {
  readonly mappedErrorOutputs: (ctx: Ctx, origin: Origin, installed: readonly Binding[], state: State) => Outcome;
  readonly writeCaught: (ctx: Ctx, scope: ScopeOccurrenceId, writes: readonly Binding[], state: State) => Outcome;
  readonly callOutputs: (ctx: Ctx, root: ScopeOccurrence, state: State) => Outcome;
  readonly dropRuns: (ctx: Ctx, scope: ScopeOccurrenceId, state: State) => State;
}

export const defaultPropagationHooks: PropagationHooks = {
  mappedErrorOutputs: (_ctx, _origin, _installed, state) => committed(state),
  writeCaught: (_ctx, _scope, _writes, state) => committed(state),
  callOutputs: (_ctx, _root, state) => committed(state),
  dropRuns: (_ctx, _scope, state) => state,
};

/**
 * The Activity `origin.host` that raised a business Error leaves, with its Error-path outputs, once the search has
 * decided: after every Call output pass and the catcher's variables, before the interrupted host's outputs, the
 * catcher's start, a compensation handler's failure or the unhandled outcome. CIB's search starts at the task's own
 * execution, which a Service Task with output parameters is (`BpmnParse.java:4803-4814`), and destroys it only when the
 * catcher starts or the path ends: an interrupting boundary's `deleteCascade` destroys it before its host
 * (`PvmAtomicOperationCancelActivity.java:60`, `PvmAtomicOperationDeleteCascade.java:37-66`), an interrupting Event
 * Sub-Process's `clearScope` with its event scope's other children (`PvmAtomicOperationInterruptScope.java:30-48`,
 * `PvmExecutionImpl.java:345-359`), and an uncaught Error's `end(true)` after the walk
 * (`BpmnExceptionHandler.java:129-137`); each runs the task's output parameters as it destroys the execution
 * (`ExecutionEntity.java:521-525`, CIB-EXT-0016). A raise without a host has nothing to leave: a throw Event left
 * before raising, or leaves through `throwerLeaves`.
 */
function hostLeaves(hooks: PropagationHooks, ctx: Ctx, origin: Origin, state: State): Outcome {
  return origin.host === null ? committed(state) : hooks.mappedErrorOutputs(ctx, origin, [], state);
}

/**
 * Whether the thrower's output mappings would run as its instance ends: it ran directly in its instance's root and
 * nothing but the thrower, whose leave is queued (`hostLeaves`), remains there. CIB then rolls the command back
 * (CIB-LIM-0006).
 */
function endsInstanceWithOutputs(ctx: Ctx, origin: Origin, state: State): boolean {
  const thrower = programElement(ctx.program, origin.element);
  const outputs = (thrower === null ? null : elementEnvelope(thrower))?.outputs ?? [];
  const left = origin.host === null ? idle(state, origin.scope) : idleWithout(state, origin.scope, origin.host);
  return outputs.length > 0 && instanceRoot(state, origin.scope) === origin.scope && left;
}

/**
 * Refuse an uncaught Error whose path lies inside a Multi-Instance instance, walking out from `start` to the root. What
 * CIB's `execution.end(true)` does to an enclosing instance is PC-ERROR-03's to settle (CIB-INT-0013's boundary). A
 * called instance is no such boundary: the thrower's path ends there, and with nothing left the called instance ends
 * and its Call returns normally, unless the thrower's outputs would run as it ends (`endsInstanceWithOutputs`,
 * `finance-unlisted-code`, CIB-LIM-0006).
 */
function enclosingInstances(ctx: Ctx, state: State, start: ScopeOccurrenceId): Outcome {
  let current: ScopeOccurrenceId | null = start;
  for (let fuel = state.scopes.length + 1; fuel > 0 && current !== null; fuel -= 1) {
    if (ctx.scopeRole(state, current) === ScopeRole.MultiInstanceInstance) {
      return failed(FailureTag.Unsupported, "unhandled-error-leaves-multi-instance-instance"); // dynamic-only: where its thrower runs
    }
    const id: ScopeOccurrenceId = current;
    current = state.scopes.find((scope) => scope.id === id)?.parent ?? null;
  }
  return committed(state);
}

/**
 * An Error no catcher takes. BPMN 2.0.2 Table 10.88 leaves the outcome unspecified, "a common one being termination of
 * the Process instance": `failsInstance` ends the instance failed, naming the thrower. `endsThrowingPath` is CIB's
 * `execution.end(true)` (`BpmnExceptionHandler#propagateError`, CIB-INT-0013): the thrower's leave, queued ahead, ends
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
 * fails, or it passed its instance's root. Either way a raising Activity leaves first (`hostLeaves`). An Escalation that
 * passed the root changes nothing but its thrower's leave (§10.5.1: "execution continues at the location of throwing";
 * CIB-INT-0021). What an Escalation at a compensation handler means is not selected; dynamic-only: whether a raised
 * event finds a catcher depends on where its thrower runs. A Cancel always finds one: admission admits a Cancel End only
 * directly in a Transaction with a Cancel boundary (`throw.cancel.outsideTransaction`, `throw.cancel.uncaught`), which
 * the search reaches first.
 */
function exhausted(hooks: PropagationHooks, ctx: Ctx, raised: Raised, origin: Origin, handler: ScopeOccurrenceId | null,
  start: State): Outcome {
  const left = hostLeaves(hooks, ctx, origin, start);
  if (!left.ok) return left;
  const state = left.value;
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
      return failed(FailureTag.SemanticFailure, "cancel-uncaught");
  }
  return assertNever(raised);
}

/**
 * The search decided at a catcher whose event scope is `scope`: write its code and message variables from there
 * outward, at once, then let a raising Activity leave (`hostLeaves`). CIB sets the variables on the execution of the
 * boundary's host or of the Event Sub-Process's enclosing scope (`BpmnExceptionHandler.java:146-153`, CIB-EXT-0028)
 * before it destroys anything, so the outputs that run next read them where `setVariable` left them: in a local of their
 * name on the event scope's chain, else at the nearest owner or the root. A raising Activity's outputs therefore read
 * them behind its own locals and behind the locals of every scope between it and the event scope, and never when the
 * event scope lies in another instance, a Call's boundary or a catcher in a caller. Admission refuses the variables
 * unless the profile selects them.
 */
function catchDecided(hooks: PropagationHooks, ctx: Ctx, origin: Origin, scope: ScopeOccurrenceId, writes: readonly Binding[],
  state: State): Outcome {
  const written = writes.length === 0 ? committed(state) : hooks.writeCaught(ctx, scope, writes, state);
  return written.ok ? hostLeaves(hooks, ctx, origin, written.value) : written;
}

/**
 * Under `ErrorPathOutputs.mapped` a Scope an Error or Escalation boundary interrupts writes its output mappings, after
 * the catch variables and after a raising Activity inside it has left: CIB sets the variables on the Scope's execution
 * and then destroys the executions below it, leaf first, and the Scope's own last, each running its output parameters
 * (`BpmnExceptionHandler.java:146-153`, `PvmAtomicOperationDeleteCascade.java:37-66`, `ExecutionEntity.java:521-525`,
 * `OutputParameter.execute`, CIB-EXT-0016). Both writes have applied (`catchDecided`), so the mappings read the state as
 * they find it. `destroy` runs the same parameter list as a normal completion (`IoMapping.java:44-48`), so the outputs
 * read as `completeScope`'s do: under `OutputContext.ActivityScope` a later one reads an earlier one's write.
 */
function interruptedOutputs(ctx: Ctx, occurrence: ScopeOccurrence, parent: ScopeOccurrenceId, state: State): Outcome {
  const element = occurrence.element === null ? null : programElement(ctx.program, occurrence.element);
  const mappings = (element === null ? null : elementScope(element))?.[1].envelope.outputs ?? [];
  const selected = ctx.program.options.errorPathOutputs;
  switch (selected) {
    case ErrorPathOutputs.Mapped: {
      if (mappings.length === 0) return committed(state);
      const outer = occurrence.parent === null ? [] : visible(state, occurrence.parent);
      const reads = ctxOutputReads(ctx, state.logicalTimeMs, ownVariables(state, occurrence.id), [], outer);
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
 * The scope occurrence a Cancel caught at `occurrence` rolls back (I15): the nearest scope occurrence of the Transaction
 * on the chain from the raise outward, which is `occurrence` itself, or, when `occurrence` is a Multi-Instance
 * Transaction's body, whose instances offer no boundaries, the cancelling instance's. The other instances go on until
 * its run completes; leaving the Activity then cancels them with their runs (D12) and drops the records completed
 * instances retained in the body, never compensated.
 */
function cancelledScope(origin: Origin, occurrence: ScopeOccurrence, state: State): ScopeOccurrenceId {
  let current: ScopeOccurrenceId | null = origin.scope;
  for (let fuel = state.scopes.length + 1; fuel > 0 && current !== null; fuel -= 1) {
    const at: ScopeOccurrenceId = current;
    const entry = state.scopes.find((scope) => scope.id === at);
    if (entry === undefined) return occurrence.id;
    if (entry.element === occurrence.element) return entry.id;
    current = entry.parent;
  }
  return occurrence.id;
}

/**
 * Leave `occurrence`, held in `parent`, through its caught boundary. A Cancel boundary on a Transaction first cancels
 * the interior of the Transaction, or of its cancelling instance (`cancelledScope`), and runs the compensation handlers
 * retained there, and only then takes the boundary's flows (BPMN 2.0.2 §10.3.5 Transaction: the boundary "will direct
 * the flow after the Transaction has been rolled back and all compensation has been completed"); a Cancel raise has no
 * host. From the Cancel on, a Transaction it rolls back as a whole is Terminating, which has no "Activity Interrupted"
 * edge (§13.3.2 Figure 13.2), so the items attached to its occurrence, its Timer, Message, Signal and Conditional
 * boundaries, are disarmed at once (I18), as CIB's Cancel End interrupt deletes their jobs and subscriptions
 * (`ExecutionEntity.java:575-588`); a Multi-Instance body's stay armed while one instance rolls back (D12). An
 * interrupting Error or Escalation boundary writes its catch variables from the host, lets a raising Activity
 * leave (`catchDecided`), and writes the host's output mappings (`interruptedOutputs`; CIB-EXT-0016 for both, as
 * `deleteCascade` destroys the host either way, `PvmAtomicOperationCancelActivity.java:60`). A Call's host is its
 * occurrence in the caller, the called root's `parent`, not the called instance: CIB sets the variables on the
 * execution of the boundary's event scope, the Call's (`BpmnExceptionHandler.java:146-153`, CIB-EXT-0028). Only an
 * Escalation boundary is non-interrupting (`boundary.error.nonInterrupting`): it writes its code variable from the
 * host's parent, CIB's flow scope of the boundary (`EscalationHandler.java:80-97`), and its thrower then leaves.
 */
function leaveOccurrence(
  hooks: PropagationHooks,
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
    const rolledBack = cancelledScope(origin, occurrence, state);
    const terminating = occurrence.occurrence !== null && rolledBack === occurrence.id ? disarm(state, occurrence.occurrence) : state;
    return committed(signal(clearInside(terminating, rolledBack), {
      tag: SignalTag.Compensate,
      scope: rolledBack,
      activity: null,
      trigger: throwerRef(state, origin),
      leave: occurrence.occurrence,
      resume: { tag: ResumeTag.Occur, element: boundary.id, scope: parent, leave: leaveFlows(boundary.outgoing) },
    }));
  }
  if (boundary.interrupting) {
    const host = calledRoot(state, occurrence.id) ? parent : occurrence.id;
    const decided = catchDecided(hooks, ctx, origin, host, writes, hooks.dropRuns(ctx, occurrence.id, state));
    if (!decided.ok) return decided;
    const written = interruptedOutputs(ctx, occurrence, parent, decided.value);
    if (!written.ok) return written;
    return committed(boundaryFire(boundary, occurrence.occurrence, null, parent, [], written.value));
  }
  const decided = catchDecided(hooks, ctx, origin, parent, writes, state);
  if (!decided.ok) return decided;
  return committed(throwerLeaves(ctx, origin, boundaryFire(boundary, occurrence.occurrence, null, parent, [], decided.value)));
}

/**
 * Whether the raise runs directly at the called root `occurrence` while another path stands there and the Call maps
 * outputs. For a thrower that is no CIB scope, an Error or Escalation End Event, CIB's walk then starts at the
 * thrower's concurrent execution, not the process-instance execution
 * (`tree/ActivityExecutionHierarchyWalker.java:52-54`), and stops at a catch by the root's own Event Sub-Process before
 * its propagator sees the root, so whether the outputs pass rests on CIB's execution tree (PC-SCOPE-06 item 4). A
 * catcher further out, the Call's own boundary included, lets the walk reach the process-instance execution, where the
 * outputs pass (retained `caught-at-busy-called-root`). A raising Service Task that CIB makes a scope, one with output
 * parameters or a boundary (`BpmnParse.java:3297`, `:4803-4814`), starts the walk at its own execution, which reaches
 * the root's process-instance execution (`:55-58`), so CIB passes the outputs; the refusal is conservative there. An
 * Error End Event has left before its raise; an Escalation throw and a raising Activity still stand and are no other
 * path.
 */
function busyCalledRoot(ctx: Ctx, origin: Origin, occurrence: ScopeOccurrence, state: State): boolean {
  const element = occurrence.element === null ? null : programElement(ctx.program, occurrence.element);
  const activity = element === null ? null : elementActivity(element);
  const work = activity === null ? null : workCall(activity[1].work);
  const mapsOutputs = work !== null && (work.outputs.length > 0 || work.propagateAllOutputs);
  const otherPath = state.occurrences.some((standing) => standing.scope === occurrence.id &&
    !(standing.element === origin.element && standing.activation === origin.activation)) ||
    state.tokens.some((token) => token.scope === occurrence.id);
  return origin.scope === occurrence.id && mapsOutputs && otherPath;
}

/**
 * Under `RaisedCallOutputs.AtCalledRoot` (CIB-EXT-0034) a called root the search visits passes its Call's outputs.
 * When the root's own Event Sub-Process `catches` at a busy root (`busyCalledRoot`) the run is refused, dynamic-only, as
 * what else runs at the root decides it.
 */
function passCallOutputs(
  hooks: PropagationHooks,
  ctx: Ctx,
  origin: Origin,
  catches: boolean,
  occurrence: ScopeOccurrence,
  state: State,
): Outcome {
  const selected = ctx.program.options.raisedCallOutputs;
  switch (selected) {
    case RaisedCallOutputs.AtCalledRoot:
      if (!calledRoot(state, occurrence.id)) return committed(state);
      if (catches && busyCalledRoot(ctx, origin, occurrence, state)) {
        return failed(FailureTag.Unsupported, "raise-caught-at-busy-called-root"); // dynamic-only: what else runs at the called root
      }
      return hooks.callOutputs(ctx, occurrence, state);
    case RaisedCallOutputs.None:
      return committed(state);
  }
  return assertNever(selected);
}

/** Whether a search passes a compensation handler's context on to the trigger's scope occurrence. */
function propagatesFromTrigger(ctx: Ctx): boolean {
  const failure = ctx.program.options.compensationHandlerFailure;
  switch (failure.tag) {
    case CompensationHandlerFailureTag.PropagatesFromTrigger:
      return true;
    case CompensationHandlerFailureTag.FailsInstance:
    case CompensationHandlerFailureTag.Selected:
      return false;
  }
  return assertNever(failure);
}

/**
 * Search outward from `start`; the fuel bounds the walk by the number of scope occurrences. The search ends at the
 * scope occurrence of a compensation handler (COMPH-FAIL-01), except under `PropagatesFromTrigger`, where it goes on from
 * that context's parent, the scope occurrence the trigger ran in, as CIB's compensating execution is a child of the
 * throwing one (`CompensationUtil.java:62-75`, CIB-INT-0038). A Multi-Instance instance contributes no boundaries. Each called root
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
    if (role === ScopeRole.CompensationHandler && !propagatesFromTrigger(ctx)) {
      return exhausted(hooks, ctx, raised, origin, occurrence.id, state);
    }
    const handlers = handlerCandidates(ctx, raised, origin, state, occurrence);
    if (!handlers.ok) return failedWith(handlers.failure);
    const handled = best(ctx, raised, ([, subscription]) => subscription.trigger, handlers.value);
    const attached = occurrence.element === null || occurrence.parent === null || role === ScopeRole.MultiInstanceInstance
      ? []
      : boundariesOf(ctx, occurrence.element);
    const caught = best(ctx, raised, (boundary) => boundary.subscription.trigger, attached);
    const passed = passCallOutputs(hooks, ctx, origin, handled !== null, occurrence, state);
    if (!passed.ok) return passed;
    state = passed.value;
    if (handled !== null) {
      const [[element, , interrupting], writes] = handled;
      const dropped = interrupting ? hooks.dropRuns(ctx, occurrence.id, state) : state;
      const decided = catchDecided(hooks, ctx, origin, occurrence.id, writes, dropped);
      if (!decided.ok) return decided;
      const begun = signal(decided.value, { tag: SignalTag.Begin, request: beginRequest({ element, scope: occurrence.id }) });
      return committed(interrupting ? begun : throwerLeaves(ctx, origin, begun));
    }
    if (caught !== null && occurrence.parent !== null) {
      return leaveOccurrence(hooks, ctx, raised, origin, occurrence, occurrence.parent, caught[0], caught[1], state);
    }
    current = occurrence.parent;
  }
  return exhausted(hooks, ctx, raised, origin, null, state);
}

/**
 * `Signal.raise`. An Activity that raised the event (`origin.host`) is still running: its own boundaries are searched
 * first, and a catching one installs its variables through the Activity's frame before the Activity leaves with its
 * mapped Error-path outputs, as CIB sets them on the task's execution before destroying it
 * (`BpmnExceptionHandler.java:146-154`, CIB-EXT-0028). Otherwise the search goes on outward with the Activity still
 * standing, and it leaves where the search decides (`hostLeaves`).
 */
export function raise(hooks: PropagationHooks, ctx: Ctx, raised: Raised, origin: Origin, state: State): Outcome {
  const hostBoundaries = ctx.scopeRole(state, origin.scope) === ScopeRole.MultiInstanceInstance ? [] : boundariesOf(ctx, origin.element);
  const caught = origin.host === null ? null : best(ctx, raised, (boundary) => boundary.subscription.trigger, hostBoundaries);
  if (caught !== null) {
    const left = hooks.mappedErrorOutputs(ctx, origin, lastWrites(caught[1]), state);
    return left.ok ? committed(boundaryFire(caught[0], null, null, origin.scope, [], left.value)) : left;
  }
  return searchScopes(hooks, ctx, raised, origin, state, state.scopes.length + 1, origin.scope);
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
// item gone by its turn is skipped (`step.ts`'s `fire`), and the thrower leaves only if its occurrence still stands.

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
  };
}

function throwSignal(ctx: Ctx, payload: EventPayload, record: SignalThrow, origin: Origin, occurrence: Occurrence, state: State): Outcome {
  const context = evalContext(state, occurrence.scope);
  const businessKey = signalBusinessKey(ctx, context, record.businessKey);
  if (!businessKey.ok) return failedWith(businessKey.failure);
  const variables = signalPayload(ctx, context, visible(state, occurrence.scope), record);
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

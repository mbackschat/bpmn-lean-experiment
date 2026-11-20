/**
 * Propagation: throw Events and the search for a catcher, transcribed from `Kernel/Feature/Propagation.lean`.
 *
 * Owns matching on `Throw` and `Raised`. What a throw Event does when it arrives (`arriveThrow`) is
 * `feature/propagation/throws.ts`'s; an Error, Escalation or Cancel throw there queues a raise of its event from the
 * scope occurrence it ran in, which this module takes (`raise`). Which catchers each level of the search offers, and the
 * refusals that rest on where the raise runs, are `feature/propagation/candidates.ts`'s.
 *
 * The search for a catcher (BPMN 2.0.2 §13.5.3, §13.5.4) visits, in order: the boundaries of the Activity that raised
 * it, if any; then, for each scope occurrence from the raising one outward, the Event Sub-Processes the occurrence's
 * element declares, then the boundaries on that element. At each of those candidate sets the catch trigger with the
 * lowest `Ctx.catches` precedence wins, document order breaking ties, so an exact code is preferred over a catch-all at
 * the same level (CIB `ErrorEventDefinition#getPrecedence`) but never over a nearer catcher. Under
 * `CompensationHandlerFailure.failsInstance` the search never passes the scope occurrence of a compensation handler: what
 * reaches it uncaught is the handler's outcome; under `propagatesFromHandler` it goes on through the handler's model
 * scopes, not the trigger's (`searchScopes`, CIB-INT-0038). A Multi-Instance
 * instance's scope occurrence offers no boundaries of its own: they belong to the body, whose scope occurrence is the
 * next one out (`BpmnParse:3291-3295`, BPMN 2.0.2 §13.5.3). A Sub-Process's Event Sub-Processes are offered once, in its
 * instance's scope occurrence, never again in a Multi-Instance instance's or body's or a compensation context that wraps
 * it (`wrapsOwnScope`).
 *
 * A boundary that catches begins its occurrence and leaves on its flows. A caught Cancel hands its scope occurrence to
 * `feature/compensation.ts` through `Signal.compensate`, with what follows once its handlers have completed.
 *
 * An Error that finds no catcher does what the profile selects (`UnhandledError`): the standards reading fails the
 * process instance, CIB ends only the throwing path, which the thrower's leave ends, and is refused inside a
 * Multi-Instance instance. An Escalation that finds no catcher lets its thrower leave and changes nothing else; a Cancel
 * that finds none has no selected meaning.
 */
import {
  CompensationHandlerFailureTag,
  ErrorPathOutputs,
  RaisedCallOutputs,
  UnhandledError,
  assertNever,
  elementActivity,
  elementEnvelope,
  elementEvent,
  elementScope,
  programElement,
  workCall,
  type Boundary,
  type ElementId,
} from "../il/types.js";
import {
  scopeOccurrenceParent,
  FailureTag,
  InstanceStatus,
  RaisedTag,
  ResumeTag,
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
  instanceRoot,
  leaveFlows,
  raisedIsCancel,
  signal,
  visible,
  type Binding,
  type Compensable,
  type Origin,
  type Outcome,
  type Raised,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
  SemanticCause,
  semanticFailure,
  allTokens,
} from "../state.js";
import {
  ScopeRole, boundaryFire, clearInside, ctxOutputReads, ctxRequireMappingsWith, ctxRunsAsInstance, idleWithout, lastWrites,
  ownVariables, type Ctx,
} from "../hooks.js";
import { best, boundariesOf, contextCatcher, levelCandidates } from "./propagation/candidates.js";
import { throwLeave, throwerRef } from "./propagation/throws.js";

export { arriveThrow } from "./propagation/throws.js";

/**
 * An Escalation's thrower leaves once the search has decided, unless its catcher interrupts and so cancels it with the
 * scope that holds it: CIB starts the catcher's handler and only then leaves the throw, and only when the catcher does
 * not interrupt (`ThrowEscalationEventActivityBehavior.java:44-48`). Only an Escalation's search calls this;
 * `arriveThrow` leaves an Error or a Cancel throw before raising it.
 */
function throwerLeaves(ctx: Ctx, origin: Origin, state: State): State {
  const standing = state.occurrences.find((occurrence) => occurrence.id === origin.thrower);
  const element = programElement(ctx.program, origin.element);
  const event = element === null ? null : elementEvent(element);
  return standing === undefined || event === null
    ? state
    : signal(state, completeSignal(standing.id, throwLeave(event[1]), [], WriteRule.Outward));
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
 * `handlerRecord` (`Compensation.runningRecord`): the record whose handler or group runs in a compensation handler's
 * context, which the search reads there under `propagatesFromHandler`.
 */
export interface PropagationHooks {
  readonly mappedErrorOutputs: (ctx: Ctx, origin: Origin, installed: readonly Binding[], state: State) => Outcome;
  readonly writeCaught: (ctx: Ctx, scope: ScopeOccurrenceId, writes: readonly Binding[], state: State) => Outcome;
  readonly callOutputs: (ctx: Ctx, root: ScopeOccurrence, state: State) => Outcome;
  readonly dropRuns: (ctx: Ctx, scope: ScopeOccurrenceId, state: State) => State;
  readonly handlerRecord: (ctx: Ctx, context: ScopeOccurrenceId, state: State) => Compensable | null;
}

export const defaultPropagationHooks: PropagationHooks = {
  mappedErrorOutputs: (_ctx, _origin, _installed, state) => committed(state),
  writeCaught: (_ctx, _scope, _writes, state) => committed(state),
  callOutputs: (_ctx, _root, state) => committed(state),
  dropRuns: (_ctx, _scope, state) => state,
  handlerRecord: () => null,
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
 * Refuse an uncaught Error whose path lies inside a Multi-Instance instance, walking out from `start` to its instance's
 * root and no further. What CIB's `execution.end(true)` does to an enclosing instance is PC-ERROR-03's to settle
 * (CIB-INT-0013's boundary). A called instance's root ends the walk, even under a Multi-Instance Call: the thrower's path
 * ends in the called instance, and with nothing left the called instance ends and its Call returns normally, unless the
 * thrower's outputs would run as it ends (`endsInstanceWithOutputs`, `finance-unlisted-code`, CIB-LIM-0006).
 */
function enclosingInstances(ctx: Ctx, state: State, start: ScopeOccurrenceId): Outcome {
  let current: ScopeOccurrenceId | null = start;
  for (let fuel = state.scopes.length + 1; fuel > 0 && current !== null; fuel -= 1) {
    // The path ends at its process instance's root: a called root is the scope of its Call's occurrence, a
    // Multi-Instance instance's under a Multi-Instance Call, but that instance and all above it lie in the caller.
    if (calledRoot(state, current)) break;
    if (ctx.scopeRole(state, current) === ScopeRole.MultiInstanceInstance) {
      return failed(FailureTag.Unsupported, "unhandled-error-leaves-multi-instance-instance"); // dynamic-only: where its thrower runs
    }
    const id: ScopeOccurrenceId = current;
    current = scopeOccurrenceParent(state.scopes.find((scope) => scope.id === id));
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
      return semanticFailure(SemanticCause.Invariant, "cancel-uncaught");
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
      const above = scopeOccurrenceParent(occurrence);
      const outer = above === null ? [] : visible(state, ctx.program, above);
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
    current = scopeOccurrenceParent(entry);
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
  const otherPath = state.occurrences.some((standing) => standing.scope === occurrence.id && standing.id !== origin.thrower) ||
    allTokens(state).some((token) => token.scope === occurrence.id);
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

/** Whether a search passes a compensation handler's context on through the handler's model scopes. */
function propagatesFromHandler(ctx: Ctx): boolean {
  const failure = ctx.program.options.compensationHandlerFailure;
  switch (failure.tag) {
    case CompensationHandlerFailureTag.PropagatesFromHandler:
      return true;
    case CompensationHandlerFailureTag.FailsInstance:
    case CompensationHandlerFailureTag.Selected:
      return false;
  }
  return assertNever(failure);
}

/**
 * A non-interrupting boundary of a compensated subject that caught at its handler's context fires into `scope`, the
 * scope occurrence holding the subject's record, which declares the subject (`contextCatcher`), and the thrower leaves,
 * as `leaveOccurrence` lets one leave its host's parent.
 */
function contextFires(hooks: PropagationHooks, ctx: Ctx, origin: Origin, scope: ScopeOccurrenceId, boundary: Boundary,
  state: State): Outcome {
  const decided = catchDecided(hooks, ctx, origin, scope, [], state);
  return decided.ok ? committed(throwerLeaves(ctx, origin, boundaryFire(boundary, null, null, scope, [], decided.value))) : decided;
}

/**
 * Search outward from `start`; the fuel bounds the walk by the number of scope occurrences, and `jumped` is set when the
 * search reached the current scope occurrence from a compensation handler's context, `carried` then naming the handler
 * the raise runs in. The search ends at the scope occurrence of a compensation handler (COMPH-FAIL-01), except under
 * `PropagatesFromHandler`, where it goes on through the handler's model scopes (CIB-INT-0038): CIB runs the handler in
 * a compensating execution under the throwing one, which carries its variables (`CompensationUtil.java:62-75`), but
 * walks the handler's model flow scopes, each mapped onto an execution
 * (`tree/ActivityExecutionHierarchyWalker.java:44-73`). So the context offers what `contextCatcher` offers of the
 * completed subject, and the search goes on from the scope occurrence holding the subject's record
 * (`Compensable.scope`), where every Event Sub-Process is a candidate (`jumpCandidates`), never from the context's
 * parent, the trigger's scope occurrence; a group's context passes on the handler it was reached from. That scope
 * occurrence is the subject's parent's, a group's context or, for a Multi-Instance instance's record, the body's, unless
 * `ImplicitCompensation.Refused` moved the record outward when a Sub-Process without a handler completed; no profile
 * selects both. A Multi-Instance instance contributes no boundaries. Each called root it visits passes the Call's
 * outputs (`passCallOutputs`) before any catcher there or further out begins, caught or not (CIB registers
 * `tree/OutputVariablesPropagator.java:34-43` as a pre-visitor of both searches).
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
  let jumped = false;
  let carried: ElementId | null = null;
  for (let fuel = bound; fuel > 0 && current !== null; fuel -= 1) {
    const at = current;
    const occurrence = state.scopes.find((scope) => scope.id === at);
    if (occurrence === undefined) return semanticFailure(SemanticCause.Invariant, "raise-from-missing-scope");
    const role = ctx.scopeRole(state, occurrence.id);
    if (role === ScopeRole.CompensationHandler) {
      if (!propagatesFromHandler(ctx)) return exhausted(hooks, ctx, raised, origin, occurrence.id, state);
      const record = hooks.handlerRecord(ctx, occurrence.id, state);
      if (record === null) return semanticFailure(SemanticCause.Invariant, "compensation-context-without-record");
      const raising: ElementId | null = record.handler ?? (jumped ? carried : null);
      const caught = contextCatcher(ctx, raised, state, record, raising);
      if (!caught.ok) return failedWith(caught.failure);
      if (caught.value !== null) return contextFires(hooks, ctx, origin, record.scope, caught.value, state);
      jumped = true;
      carried = raising;
      current = record.scope;
      continue;
    }
    const handlers = levelCandidates(ctx, raised, origin, state, occurrence, jumped);
    if (!handlers.ok) return failedWith(handlers.failure);
    const handled = best(ctx, raised, ([, subscription]) => subscription.trigger, handlers.value);
    const attached = occurrence.element === null || scopeOccurrenceParent(occurrence) === null || role === ScopeRole.MultiInstanceInstance
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
    const parent = scopeOccurrenceParent(occurrence);
    if (caught !== null && parent !== null) {
      return leaveOccurrence(hooks, ctx, raised, origin, occurrence, parent, caught[0], caught[1], state);
    }
    jumped = false;
    current = scopeOccurrenceParent(occurrence);
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
  const hostBoundaries = ctxRunsAsInstance(ctx, state, origin.element, origin.scope) ? [] : boundariesOf(ctx, origin.element);
  const caught = origin.host === null ? null : best(ctx, raised, (boundary) => boundary.subscription.trigger, hostBoundaries);
  if (caught !== null) {
    const left = hooks.mappedErrorOutputs(ctx, origin, lastWrites(caught[1]), state);
    return left.ok ? committed(boundaryFire(caught[0], null, null, origin.scope, [], left.value)) : left;
  }
  return searchScopes(hooks, ctx, raised, origin, state, state.scopes.length + 1, origin.scope);
}

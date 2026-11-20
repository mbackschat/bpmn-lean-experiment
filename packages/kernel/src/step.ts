/**
 * The single step function, transcribed from `Kernel/Step.lean`.
 *
 * It owns dispatch on element kind, event role, input kind, signal and continuation, the one completion pipeline, and
 * the order in which hooks run. An input's own transition comes first, then the closure: hand the next signal to its
 * hook; else route the next token to the element at the end of its flow, or dispatch the deferred begin it is as its
 * `begin` signal; else complete one idle scope occurrence; until none is left. A closure that does not settle within
 * `closureBound` steps, or whose steps together run over more than `closureWorkBound` state entries, is `unsupported`,
 * never silently truncated. Each of those is one micro-step and appends one `Transition` to the journal; a completion
 * that is the only signal a micro-step enqueued runs inside that micro-step, so a pass-through element begins and
 * completes in one transition.
 *
 * A scope occurrence is idle when it holds no token, no blocking open item, no begun occurrence and no child
 * occurrence, and no slot keeps it alive. An idle Scope element is completed by its hook, an idle called instance's
 * root by its Call Activity's, an idle Multi-Instance body by its feature; an idle process root completes the
 * instance, removing the passive items left in it. An Activity's local-variable scope occurrence has no completion of
 * its own: the completion pipeline disposes of it with its Activity.
 *
 * How a micro-step's draft becomes a journalled transition is `step/commit.ts`; how a closure's failure becomes its
 * input's outcome where CIB runs the work in a job is `step/jobs.ts`; what becomes of a queued signal whose target an
 * interruption removed is `step/stale.ts`; the clock an input advances, its ranking of competing Conditional items and the
 * transitions of a command and an effect result are `step/inputs.ts`.
 */
import {
  BranchSchedule, ElementTag, EventRoleTag, assertNever, elementActivity, elementEnvelope, elementGateway,
  elementHeader, programElement, programSourceType, programTarget, type Element, type ElementId,
  type Envelope, type FlowId, type MultiInstance, type Program,
} from "./il/types.js";
import {
  ActivationRole, CauseTag, ContinuationTag, FailureTag, FiredTag, InputTag,
  InstanceStatus, LeaveTag, SignalTag, Terminal, TokenTag, WriteRule, beginOccurrence, beginRequest,
  busyScopes, closeOwnItems, queueBatch, committed, emptyDraft, entryCount, failed, failedWith, idle, initial, keyOf, localScope, occurrenceOf, recordEnd, reserve, root, signal as enqueue, startReserved, type BeginRequest,
  type Binding, type Cause, type Fired, type Input,
  type InstanceFailure, type Leave, type Occurrence, type OpenItem, type Outcome,
  type Result, type ScopeOccurrence, type ScopeOccurrenceId, type Signal, type StartInput, type StartTrigger, type State,
  type Token,
  SemanticCause, semanticFailure,
  itemAt, iterationHolds, type OccurrenceId,
  compareUnitKey, occurrenceIdParts, orderedAny, orderedCount, orderedErase, orderedHas, orderedSize, scopeEncloses, type UnitKey,
  unitRoot, UnitRootTag,
} from "./state.js";
import {
  ScopeRole, admitThen, cancelOccurrence, chooseStart, clearInside, itemOf, removeOccurrence, type Ctx, type Hooks, type ScopeEntry,
} from "./hooks.js";
import { journalDraft, orderJournal } from "./step/commit.js";
import { earliest, emptyRunLog, firstBreadth, latest, runRecord, type RunLog } from "./step/order.js";
import { deferred, effectContinuation, timerJob } from "./step/jobs.js";
import { advanceClock, admitChoicesThen, command, deliverEffectResult } from "./step/inputs.js";
import { perform, requireScope, queuedNames, type SignalRun } from "./step/stale.js";

/** The name a transition records for a signal: its tag, which spells the Lean constructor. */
export function signalName(next: Signal): string {
  return next.tag;
}

/** The loop characteristics of a body occurrence, read from any element's envelope. */
function bodyLoop(element: Element, occurrence: Occurrence): readonly [Envelope, MultiInstance] | null {
  if (occurrence.role !== ActivationRole.MultiInstanceBody) return null;
  const envelope = elementEnvelope(element);
  return envelope === null || envelope.multiInstance === null ? null : [envelope, envelope.multiInstance];
}

function toElement(hooks: Hooks, ctx: Ctx, element: Element, occurrence: Occurrence, entry: ScopeEntry, trigger: StartTrigger, state: State): Outcome {
  switch (element.tag) {
    case ElementTag.Activity:
      return hooks.arriveActivity(ctx, element.header, element.payload, occurrence, state);
    case ElementTag.Scope:
      return hooks.arriveScope(ctx, element.header, element.payload, occurrence, entry, state);
    case ElementTag.Gateway:
      return hooks.arriveGateway(ctx, element.header, element.payload, occurrence, state);
    case ElementTag.Start:
      if (occurrence.incoming !== null) return semanticFailure(SemanticCause.Invariant, "flow-into-start-event");
      return hooks.arriveStart(ctx, element.header, element.payload, trigger, occurrence, state);
    case ElementTag.Event: {
      const { header, payload } = element;
      switch (payload.role.tag) {
        case EventRoleTag.Catch:
          return hooks.arriveCatch(ctx, header, payload, payload.role.subscription, occurrence, state);
        case EventRoleTag.Throw:
          return hooks.arriveThrow(ctx, header, payload, payload.role.record, occurrence, state);
        case EventRoleTag.LinkCatch:
        case EventRoleTag.LinkThrow:
          return hooks.arriveLink(ctx, header, payload, occurrence, state);
      }
      return assertNever(payload.role);
    }
  }
  return assertNever(element);
}

/**
 * Dispatch a begun occurrence to its element's feature. The body of a Multi-Instance element goes to the
 * Multi-Instance hook; each of its instances runs as an ordinary occurrence of the element.
 */
function dispatch(hooks: Hooks, ctx: Ctx, occurrence: Occurrence, entry: ScopeEntry, trigger: StartTrigger, state: State): Outcome {
  const element = programElement(ctx.program, occurrence.element);
  if (element === null) return semanticFailure(SemanticCause.Invariant, "begin-without-element");
  const loop = bodyLoop(element, occurrence);
  if (loop !== null) return hooks.arriveMultiInstance(ctx, elementHeader(element), loop[0], loop[1], occurrence, state);
  return toElement(hooks, ctx, element, occurrence, entry, trigger, state);
}

/** The counter an occurrence numbers under: a Multi-Instance Activity's body apart from its instances. */
function roleOf(program: Program, request: BeginRequest): ActivationRole {
  const element = programElement(program, request.element);
  const loops = (element === null ? null : elementEnvelope(element))?.multiInstance != null;
  switch (request.continuation.tag) {
    case ContinuationTag.MultiInstance:
      return ActivationRole.Element;
    case ContinuationTag.Flow:
    case ContinuationTag.Compensation:
      return loops ? ActivationRole.MultiInstanceBody : ActivationRole.Element;
  }
  return assertNever(request.continuation);
}

/** Lean's `Step.writeStart`: an Event Sub-Process start's values, written outward from the scope occurrence it entered. */
function writeStart(hooks: Hooks, ctx: Ctx, occurrence: OccurrenceId, writes: readonly Binding[], state: State): Outcome {
  if (writes.length === 0) return committed(state);
  const scope = localScope(state, occurrence);
  return scope === null ? semanticFailure(SemanticCause.Invariant, "start-writes-without-scope") : hooks.writeOutputs(ctx, scope, writes, WriteRule.Outward, state);
}

/** Begin the occurrence `request` names, hand it to its feature (`requireScope`) and write its start's values (`writeStart`). */
function begin(hooks: Hooks, ctx: Ctx, request: BeginRequest, state: State): Outcome {
  const sourceType = programSourceType(ctx.program, request.element);
  if (sourceType === null) return semanticFailure(SemanticCause.Invariant, "begin-without-element");
  const missing = requireScope(state, request.scope);
  if (missing !== null) return missing;
  const [begun, occurrence] = beginOccurrence(state, request, roleOf(ctx.program, request), sourceType);
  const entered = dispatch(hooks, ctx, occurrence, { inner: request.inner }, request.trigger, begun);
  return deferred(ctx.program, begun, entered.ok ? writeStart(hooks, ctx, occurrence.id, request.writes, entered.value) : entered);
}

/**
 * What follows an occurrence that left: its continuation, or, for one raised away, only a compensation run, which learns
 * that its handler ended without completing (`Hooks.handlerEnded`).
 */
function continueAfter(hooks: Hooks, ctx: Ctx, occurrence: Occurrence, leave: Leave, writes: readonly Binding[], state: State): Outcome {
  const raised = leave.tag === LeaveTag.Raised;
  const continuation = occurrence.continuation;
  switch (continuation.tag) {
    case ContinuationTag.Flow:
      return raised ? committed(state) : hooks.outflow(ctx, occurrence, leave, state);
    case ContinuationTag.MultiInstance:
      return raised ? committed(state) : hooks.instanceCompleted(ctx, continuation.body, occurrence, writes, state);
    case ContinuationTag.Compensation:
      return raised ? hooks.handlerEnded(ctx, occurrence, state) : hooks.handlerCompleted(ctx, occurrence, state);
  }
  return assertNever(continuation);
}

/**
 * The one completion pipeline: disarm, write, retain, continue, remove and journal, in that order. The occurrence's
 * record and owned scope go before its continuation runs, so that a continuation leaving its instance or handler scope
 * does not cancel the occurrence that just completed. An occurrence raised away gets no retention, outflow or
 * continuation, only a compensation run's notice (`continueAfter`). A completion naming an occurrence that is gone is an
 * invariant failure (`queued-work-occurrence-gone`, as `gone` refuses it first), never dropped, and no admitted schedule
 * reaches it (a 2026-11-11 probe catching one throw at interrupting Signal boundaries on a Sub-Process and on a task
 * inside it did not): signals run first in, first out, and an interrupting firing withdraws the items inside at once, so a
 * thrower's completion runs before any cancellation its receivers queue. The kernel thus completes a thrower its
 * receiver then removes, where CIB leaves it only after its receivers ran (`ThrowSignalEventActivityBehavior#execute`);
 * the order matters only once a per-activity end state is observed.
 */
function complete(
  hooks: Hooks, ctx: Ctx, id: OccurrenceId, requested: Leave, writes: readonly Binding[], rule: WriteRule, before: State,
): Outcome {
  const found = occurrenceOf(before, id);
  if (found === null) return semanticFailure(SemanticCause.Invariant, "queued-work-occurrence-gone");
  const sourceType = programSourceType(ctx.program, found.element);
  if (sourceType === null) return semanticFailure(SemanticCause.Invariant, "complete-without-element");
  const [started, occurrence] = startReserved(before, found, sourceType);
  const left = hooks.leave(ctx, occurrence, closeOwnItems(started, id));
  if (!left.ok) return left;
  const selected = hooks.select(ctx, occurrence, requested, left.value);
  if (!selected.ok) return selected;
  const written = hooks.writeOutputs(ctx, occurrence.scope, writes, rule, left.value);
  if (!written.ok) return written;
  const state = written.value;
  const key = keyOf(state, occurrence);
  const leave = selected.value;
  switch (leave.tag) {
    case LeaveTag.Raised:
      return continueAfter(hooks, ctx, occurrence, leave, writes, recordEnd(removeOccurrence(state, id), key, Terminal.Cancelled));
    case LeaveTag.Outgoing:
    case LeaveTag.Flows: {
      const retained = hooks.completed(ctx, occurrence, state);
      if (!retained.ok) return retained;
      const removed = removeOccurrence(retained.value, id);
      // An `asyncAfter` boundary lies before the continuation, though the completion's fact is journalled after it.
      const continued = deferred(ctx.program, recordEnd(removed, key, Terminal.Completed),
        continueAfter(hooks, ctx, occurrence, leave, writes, removed));
      return continued.ok ? committed(recordEnd(continued.value, key, Terminal.Completed)) : continued;
    }
  }
  return assertNever(leave);
}

/** A subscription an Activity opened goes back to its Activity; every other one to `Hooks.trigger`. */
function fireItem(hooks: Hooks, ctx: Ctx, item: OpenItem, fired: Fired, state: State): Outcome {
  const element = programElement(ctx.program, item.element);
  const activity = element === null ? null : elementActivity(element);
  return activity === null
    ? hooks.trigger(ctx, item, fired, state)
    : hooks.triggerActivity(ctx, activity[0], activity[1], item, fired, state);
}

/** The one writer of `State.status`: everything left in the instance goes first. */
function endInstance(status: InstanceStatus, failure: InstanceFailure | null, state: State): State {
  return { ...clearInside(state, root), status, failure };
}

const other = (
  run: (state: State) => Outcome, scopes: readonly ScopeOccurrenceId[] = [], occurrences: readonly OccurrenceId[] = [],
  requires: readonly ScopeOccurrenceId[] = [], acts: readonly OccurrenceId[] = [],
  holds: (state: State) => readonly ScopeOccurrenceId[] = () => [],
): SignalRun => ({ completion: false, run, scopes, occurrences, requires, acts, holds });

/** `Kernel.Step.signalWork`: what a queued signal does and the targets it names (`step/stale.ts`). */
function signalRun(hooks: Hooks, ctx: Ctx, next: Signal): SignalRun {
  switch (next.tag) {
    case SignalTag.Arm:
      return other((state) => hooks.arm(ctx, next.host, next.element, next.scope, state), [next.scope], [next.host]);
    case SignalTag.ArmScope:
      return other((state) => hooks.armScope(ctx, next.scope, state), [next.scope]);
    case SignalTag.ArmGateway:
      return other((state) => hooks.armGateway(ctx, next.occurrence, next.gateway, next.scope, state), [next.scope], [next.occurrence]);
    case SignalTag.Raise:
      return other((state) => hooks.raise(ctx, next.event, next.origin, state), [], [], [], [], () => [next.origin.scope]);
    case SignalTag.Begin:
      return other((state) => begin(hooks, ctx, next.request, state), [next.request.scope]);
    case SignalTag.Complete:
      return {
        completion: true, run: (state) => complete(hooks, ctx, next.occurrence, next.leave, next.writes, next.rule, state), scopes: [],
        occurrences: [], requires: [], acts: [next.occurrence], holds: () => [],
      };
    case SignalTag.Write:
      return other((state) => hooks.writeOutputs(ctx, next.scope, next.writes, next.rule, state), [], [], [next.scope]);
    case SignalTag.Remove:
      return other((state) => hooks.removeVariables(ctx, next.scope, next.names, state), [], [], [next.scope]);
    case SignalTag.Occur:
      return other((state) => {
        const missing = requireScope(state, next.scope);
        if (missing !== null) return missing;
        const [reserved, occurrence] = reserve(state, next.element, next.scope);
        return complete(hooks, ctx, occurrence.id, next.leave, next.writes, next.rule, reserved);
      }, [next.scope]);
    case SignalTag.Cancel:
      return other((state) => committed(cancelOccurrence(state, next.occurrence)), [], [], [], [next.occurrence]);
    case SignalTag.Fire:
      return other((state) => {
        const open = itemAt(state.openItems, next.item);
        return open === undefined ? committed(state) : fireItem(hooks, ctx, open, next.fired, state);
      }, [], [], [], [], (state) => [itemAt(state.openItems, next.item)?.scope ?? occurrenceIdParts(next.item.occurrence).scope]);
    case SignalTag.EndInstance:
      return other((state) => committed(endInstance(next.status, next.failure, state)), [], [], [], [],
        (state) => state.scopes.map((scope) => scope.id));
    case SignalTag.Compensate:
      return other((state) => hooks.compensate(ctx, next.scope, next.activity, next.trigger, next.leave, next.resume, state), [], [],
        [next.scope]);
    case SignalTag.CompensationFailed:
      return other((state) => hooks.failCompensation(ctx, next.handler, next.code, next.message, next.origin, state), [], [],
        [next.handler]);
  }
  return assertNever(next);
}

/** `Kernel.Step.dispatchSignal`: run a queued signal, refused when what it names is gone (`perform`). */
function dispatchSignal(hooks: Hooks, ctx: Ctx, next: Signal): (state: State) => Outcome {
  const work = signalRun(hooks, ctx, next);
  return (state) => perform(work, state);
}

/** Run a completion when it is the only signal the micro-step enqueued, inside the micro-step, as `dispatchSignal` runs it. */
function absorb(hooks: Hooks, ctx: Ctx, before: number, state: State): Outcome {
  const queued = state.signals.slice(before);
  const sole = queued.length === 1 && queued[0] !== undefined ? signalRun(hooks, ctx, queued[0]) : null;
  return sole?.completion === true ? perform(sole, { ...state, signals: state.signals.slice(0, before) }) : committed(state);
}

/**
 * Turn the draft into the transition of the unit `unit` (`journalDraft`), tell the features what the micro-step removed
 * and wrote, and queue the micro-step's batches under `unit` (`queueBatch`). A unit key the closure already ran is an
 * invariant failure: no admitted closure runs a unit twice (DC4).
 */
function conclude(hooks: Hooks, ctx: Ctx, unit: UnitKey, cause: Cause, element: ElementId | null, owner: ScopeOccurrenceId, state: State): Outcome {
  if (orderedHas(state.transitions, unit, compareUnitKey)) return semanticFailure(SemanticCause.Invariant, "unit-key-reused");
  let current = journalDraft(unit, cause, element, owner, state);
  for (const occurrence of state.draft.cancelled) {
    const notified = hooks.cancelled(ctx, occurrence, current);
    if (!notified.ok) return notified;
    current = notified.value;
  }
  const written = hooks.written(ctx, state.writes, current);
  return written.ok ? committed(queueBatch(written.value, unit)) : written;
}

/**
 * One micro-step: run `body`, absorb its sole completion and record the transition. Each stage's failure is `deferred`
 * against the state it started from, so a boundary an earlier micro-step or stage crossed counts.
 */
function microStep(
  hooks: Hooks, ctx: Ctx, unit: UnitKey, cause: Cause, element: ElementId | null, owner: ScopeOccurrenceId,
  body: (state: State) => Outcome, state: State,
): Outcome {
  const before = state.signals.length;
  const next = deferred(ctx.program, state, body(state));
  if (!next.ok) return next;
  const absorbed = deferred(ctx.program, next.value, absorb(hooks, ctx, before, next.value));
  return absorbed.ok ? deferred(ctx.program, absorbed.value, conclude(hooks, ctx, unit, cause, element, owner, absorbed.value)) : absorbed;
}

/** Route a token on `flow` to the element at the end of it. */
function arrive(hooks: Hooks, ctx: Ctx, flow: FlowId, scope: ScopeOccurrenceId, state: State): Outcome {
  const element = programTarget(ctx.program, flow);
  if (element === null) return semanticFailure(SemanticCause.Invariant, "flow-without-target");
  return begin(hooks, ctx, beginRequest({ element, scope, incoming: flow }), state);
}

/**
 * Move one token in its own micro-step: route a flow token to the element at the end of its flow; dispatch a deferred
 * begin as the `begin` signal it was, with that signal's journal cause.
 */
function moveToken(hooks: Hooks, ctx: Ctx, unit: UnitKey, token: Token, state: State): Outcome {
  switch (token.tag) {
    case TokenTag.Flow:
      return microStep(hooks, ctx, unit, { tag: CauseTag.Arrive, flow: token.flow }, programTarget(ctx.program, token.flow), token.scope,
        (current) => arrive(hooks, ctx, token.flow, token.scope, current), state);
    case TokenTag.Begin: {
      const next: Signal = { tag: SignalTag.Begin, request: token.request };
      return microStep(hooks, ctx, unit, { tag: CauseTag.Signal, name: signalName(next) }, null, root, dispatchSignal(hooks, ctx, next), state);
    }
  }
  return assertNever(token);
}

/** An Activity's local-variable scope occurrence: owned by an Activity that is no Multi-Instance body and calls no instance. */
function activityLocal(ctx: Ctx, state: State, scope: ScopeOccurrence): boolean {
  if (scope.calledInstance !== null || scope.occurrence === null) return false;
  const occurrence = occurrenceOf(state, scope.occurrence);
  if (occurrence === null) return false;
  const element = programElement(ctx.program, occurrence.element);
  return element !== null && elementActivity(element) !== null && occurrence.role === ActivationRole.Element;
}

/**
 * Complete an idle scope occurrence through the occurrence that owns it: a Scope's by its hook, a called instance's
 * root by its Call Activity's, a Multi-Instance body by its feature.
 */
function completeIdleScope(hooks: Hooks, ctx: Ctx, scope: ScopeOccurrence, state: State): Outcome {
  const notScope: Outcome = semanticFailure(SemanticCause.Invariant, "scope-occurrence-without-scope");
  const occurrence = scope.occurrence === null ? null : occurrenceOf(state, scope.occurrence);
  if (occurrence === null) return notScope;
  const element = programElement(ctx.program, occurrence.element);
  if (element === null) return notScope;
  const loop = bodyLoop(element, occurrence);
  if (loop !== null) return hooks.completeBody(ctx, elementHeader(element), loop[0], loop[1], occurrence, state);
  switch (element.tag) {
    case ElementTag.Scope:
      return hooks.completeScope(ctx, element.header, element.payload, scope, occurrence, state);
    case ElementTag.Activity:
      return scope.calledInstance !== null
        ? hooks.completeCall(ctx, element.header, element.payload, scope, occurrence, state)
        : notScope;
    case ElementTag.Event:
    case ElementTag.Gateway:
    case ElementTag.Start:
      return notScope;
  }
  return assertNever(element);
}

export const closureBound = 100000;

/**
 * The most state entries (`entryCount`) a closure's micro-steps may scan together: a closure that grows the state at every
 * micro-step costs time quadratic in its length (100000 such steps took 77 s to 200 s, measured 2026-11-10), while the
 * longest retained closure scans 12008 (`automatic-loop-long-burst`).
 */
export const closureWorkBound = 10000000;

/** Lean's `signalsHold`: whether a queued signal names `scope` or a scope occurrence inside it, which keeps it busy (DC5). */
function signalsHold(hooks: Hooks, ctx: Ctx, state: State, scope: ScopeOccurrenceId): boolean {
  return orderedAny(state.queuedSignals, (_, next) => queuedNames(signalRun(hooks, ctx, next), state).some((named) => scopeEncloses(scope, named)));
}

/**
 * The next scope occurrence other than the root that is idle, which the closure completes through its owner: no queued
 * work names it or a scope occurrence inside it (DC5).
 */
function idleScope(hooks: Hooks, ctx: Ctx, state: State): ScopeOccurrence | undefined {
  if (!state.scopes.some((scope) => scope.id !== root)) return undefined;
  const busy = busyScopes(state);
  return state.scopes.find((scope) => scope.id !== root && !busy.has(scope.id) && !activityLocal(ctx, state, scope) &&
    !signalsHold(hooks, ctx, state, scope.id));
}

/**
 * The token the closure moves next, and the rest: the oldest under `BranchSchedule.orderInvariant`, whose admitted models
 * no order changes (`flow.concurrentWrite`); the newest under `declarationDepthFirst` (CIB-OP-0016), where `Flow`
 * queues a split's flows reversed and `Feature.MultiInstance` a parallel body's instances, so each branch and each
 * instance runs to its next wait, join or end before the next one starts. Under `declarationDepthFirst` an idle scope
 * occurrence completes before any token moves, as CIB ends a Sub-Process in the operation that ends its last execution,
 * before its LIFO queue reaches a sibling branch (`PvmAtomicOperationActivityEnd:105`).
 */
function nextToken(hooks: Hooks, ctx: Ctx, log: RunLog, state: State): readonly [UnitKey, Token] | undefined {
  switch (ctx.program.options.branchSchedule) {
    case BranchSchedule.OrderInvariant:
      return earliest(log, state.queuedTokens);
    case BranchSchedule.DeclarationDepthFirst:
      return idleScope(hooks, ctx, state) !== undefined ? undefined : latest(log, state.queuedTokens);
  }
  return assertNever(ctx.program.options.branchSchedule);
}

type Reoffered = Readonly<{ gateway: ElementId; scope: ScopeOccurrenceId; occurrence: OccurrenceId; state: State }>;

/**
 * The first parked join that fires when it is offered again, with its scope occurrence and the state it leaves.
 * Table 13.3 activates an Inclusive join by the state, not by an arrival, and `settle` offers the parked joins only
 * once no signal, token or idle scope occurrence is left, so `positions` in `Feature.Flow` sees every position: a
 * completion still queued is no position it can see. Each join is offered its latest parked occurrence, in parking
 * order; a Parallel join is ready only on an arrival, so offering it never fires it.
 */
function reoffer(hooks: Hooks, ctx: Ctx, state: State): Result<Reoffered | null> {
  for (const waiting of state.slots.parked) {
    const target = programTarget(ctx.program, waiting.flow);
    const element = target === null ? null : programElement(ctx.program, target);
    const gateway = element === null ? null : elementGateway(element);
    const latest = state.slots.parked
      .filter((other) => other.scope === waiting.scope && programTarget(ctx.program, other.flow) === target).at(-1);
    const occurrence = latest === undefined ? null : occurrenceOf(state, latest.occurrence);
    if (gateway === null || occurrence === null) return semanticFailure(SemanticCause.Invariant, "parked-without-gateway");
    const offered = hooks.arriveGateway(ctx, gateway[0], gateway[1], occurrence, state);
    if (!offered.ok) return offered;
    if (offered.value.signals.length > 0) {
      return committed({ gateway: gateway[0].id, scope: waiting.scope, occurrence: occurrence.id, state: offered.value });
    }
  }
  return committed(null);
}

/** Lean's `offerRound`: how many times the closure already offered the parked occurrence `occurrence`, a count. */
function offerRound(state: State, occurrence: OccurrenceId): number {
  return orderedCount(state.transitions, (unit) => unit.step === null && unit.root.tag === UnitRootTag.Offer &&
    unit.root.occurrence === occurrence);
}

/**
 * Signals first, in breadth-first key order (`firstBreadth`), then tokens (`nextToken`), then idle scope occurrences,
 * then the parked joins a quiescent closure offers again (`reoffer`, journalled with the `idle` cause of the join's scope
 * occurrence), then the instance's completion, once no signal is queued (DC5). Each unit runs under its unit key, and
 * the run log records when it ran; the committed closure's journal and outbox are put in run order (`orderJournal`).
 */
function settle(hooks: Hooks, ctx: Ctx, bound: number, start: State, unit: UnitKey): Outcome {
  let state = start;
  let log = runRecord(emptyRunLog, unit);
  let work = closureWorkBound;
  for (let fuel = bound; ; fuel -= 1) {
    if (fuel === 0) return failed(FailureTag.Unsupported, "closure-bound"); // dynamic-only: a closure's length depends on the run
    work -= entryCount(state);
    if (work < 0) return failed(FailureTag.Unsupported, "closure-bound"); // dynamic-only: so does its size
    if (state.status !== InstanceStatus.Running) return committed(orderJournal(state, log));
    const signalled = firstBreadth(state.queuedSignals);
    const token = signalled === undefined ? nextToken(hooks, ctx, log, state) : undefined;
    const ready = signalled === undefined && token === undefined ? idleScope(hooks, ctx, state) : undefined;
    let stepped: Outcome;
    let ran: UnitKey;
    if (signalled !== undefined) {
      const [key, next] = signalled;
      ran = key;
      stepped = microStep(hooks, ctx, key, { tag: CauseTag.Signal, name: signalName(next) }, null, root,
        dispatchSignal(hooks, ctx, next), { ...state, queuedSignals: orderedErase(state.queuedSignals, key, compareUnitKey) });
    } else if (token !== undefined) {
      ran = token[0];
      stepped = moveToken(hooks, ctx, token[0], token[1], { ...state, queuedTokens: orderedErase(state.queuedTokens, token[0], compareUnitKey) });
    } else if (ready !== undefined) {
      ran = unitRoot({ tag: UnitRootTag.Idle, scope: ready.id });
      stepped = microStep(hooks, ctx, ran, { tag: CauseTag.Idle, scope: ready.id }, ready.element, ready.id,
        (current) => completeIdleScope(hooks, ctx, ready, current), state);
    } else {
      const offered = reoffer(hooks, ctx, state);
      if (!offered.ok) return offered;
      const fired = offered.value;
      if (fired === null) {
        if (!idle(state, root) || orderedSize(state.queuedSignals) > 0) return committed(orderJournal(state, log));
        const finish = unitRoot({ tag: UnitRootTag.Idle, scope: root });
        const finished = microStep(hooks, ctx, finish, { tag: CauseTag.Idle, scope: root }, null, root,
          (current) => committed(endInstance(InstanceStatus.Completed, null, current)), state);
        return finished.ok ? committed(orderJournal(finished.value, runRecord(log, finish))) : finished;
      }
      ran = unitRoot({ tag: UnitRootTag.Offer, occurrence: fired.occurrence, round: offerRound(state, fired.occurrence) });
      stepped = microStep(hooks, ctx, ran, { tag: CauseTag.Idle, scope: fired.scope }, fired.gateway, fired.scope,
        () => committed(fired.state), state);
    }
    if (!stepped.ok) return stepped;
    state = stepped.value;
    log = runRecord(log, ran);
  }
}

/**
 * Run an input's transition on a running instance at its logical time `atMs`, then settle. A Timer firing without its own
 * time happens at the deadline it names; a host that wakes later states the later time. The input starts from an empty
 * per-input record (journal, outbox, draft and write log); a committed state holds no draft or write log, since every
 * micro-step's `conclude` empties them and the registered `cancelled` and `written` hooks it then runs refill neither,
 * so emptying them here changes no run.
 */
function onRunning(
  hooks: Hooks, ctx: Ctx, tag: InputTag, atMs: number | null, before: State | null, transition: (state: State) => Outcome,
): Outcome {
  if (before === null) return failed(FailureTag.Rejected, "instance-not-started");
  if (before.status !== InstanceStatus.Running) return failed(FailureTag.Rejected, "instance-not-running");
  const advanced = advanceClock(atMs, { ...before, journal: [], outbox: [], transitions: null, outboxes: null, draft: emptyDraft, writes: [] });
  if (!advanced.ok) return advanced;
  const unit = unitRoot({ tag: UnitRootTag.Input });
  const started = admitChoicesThen(hooks, ctx, () => microStep(hooks, ctx, unit, { tag: CauseTag.Input, input: tag }, null, root, transition, advanced.value));
  return started.ok ? settle(hooks, ctx, closureBound, started.value, unit) : started;
}

/** `Ctx.scopeRole`: read from the slots, since the occurrences that ended there may be gone when an event arrives. */
function scopeRole(state: State, scope: ScopeOccurrenceId): ScopeRole {
  const owned = state.scopes.find((candidate) => candidate.id === scope)?.occurrence ?? null;
  const owner = owned === null ? null : occurrenceOf(state, owned);
  const ownedByInstance = owner !== null && ownedByMultiInstance(owner);
  if (state.slots.compensation.runs.some((run) => run.running.some(([held]) => held === scope))) return ScopeRole.CompensationHandler;
  if (ownedByInstance || state.slots.multiInstances.some((run) => run.instances.some((iteration) => iterationHolds(iteration, scope)))) {
    return ScopeRole.MultiInstanceInstance;
  }
  return ScopeRole.Ordinary;
}

function ownedByMultiInstance(owner: Occurrence): boolean {
  switch (owner.continuation.tag) {
    case ContinuationTag.MultiInstance:
      return true;
    case ContinuationTag.Flow:
    case ContinuationTag.Compensation:
      return false;
  }
  return assertNever(owner.continuation);
}

/** The context every hook of `program` reads, its queries filled from `hooks`. */
export function context(hooks: Hooks, program: Program): Ctx {
  return { program, evaluate: hooks.evaluate, catches: hooks.catches, eventStart: hooks.eventStart, scopeRole, conditionChoices: [] };
}

/**
 * The root starts a start input fires (`Hooks.startsFired`), its submitted values admitted first: values are admitted
 * before any transition reads them, and a Conditional start's predicate reads the submitted variables
 * (`Subscriptions.conditionHolds`), so a value outside the domain rejects the input whole as `value-outside-domain`
 * (PBV-BOUND-01) before any start's trigger is asked, whatever the start choice would answer. The start step and a
 * population's Conditional start evaluation (`conditionalStartVerdict`) both fire starts through it.
 */
export function admittedStartsFired(hooks: Hooks, ctx: Ctx, input: StartInput): Result<readonly ElementId[]> {
  return admitThen(ctx.program.options.bounds, input.variables.map(([, value]) => value), () => hooks.startsFired(ctx, input));
}

/**
 * One input. `null` is the state before the instance starts; only a start applies to it. The root's Event Sub-Process
 * starts are armed before the start Event's tokens move. Every hook of the input's closure reads its ranking of
 * competing Conditional items.
 */
export function step(hooks: Hooks, program: Program, before: State | null, input: Input): Outcome {
  const ctx = { ...context(hooks, program), conditionChoices: input.payload.conditionChoices };
  switch (input.tag) {
    case InputTag.Start: {
      const payload = input.payload;
      if (before !== null) return failed(FailureTag.Rejected, "instance-already-started");
      const fired = admittedStartsFired(hooks, ctx, payload);
      const start = fired.ok ? chooseStart(payload.startEvent, fired.value) : failedWith<ElementId>(fired.failure);
      if (!start.ok) return start;
      const seeded = queueBatch(enqueue(initial(payload.instanceId, payload.variables, payload.businessKey), { tag: SignalTag.ArmScope, scope: root }),
        unitRoot({ tag: UnitRootTag.Seed }));
      const fresh = advanceClock(payload.atMs, seeded);
      if (!fresh.ok) return fresh;
      const unit = unitRoot({ tag: UnitRootTag.Input });
      const started = admitChoicesThen(hooks, ctx, () => microStep(hooks, ctx, unit, { tag: CauseTag.Input, input: InputTag.Start }, start.value, root,
        (state) => begin(hooks, ctx, beginRequest({ element: start.value, scope: root, trigger: payload.trigger }), state), fresh.value));
      return started.ok ? settle(hooks, ctx, closureBound, started.value, unit) : started;
    }
    case InputTag.Command:
      return onRunning(hooks, ctx, input.tag, input.payload.atMs, before, (state) => command(hooks, ctx, input.payload, state));
    case InputTag.Deliver:
      return onRunning(hooks, ctx, input.tag, input.payload.atMs, before, (state) => {
        const target = hooks.delivered(ctx, input.payload, state);
        return target.ok ? fireItem(hooks, ctx, target.value[0], target.value[1], state) : target;
      });
    case InputTag.TimerFire: {
      const data = input.payload;
      return timerJob(ctx.program.options.continuationFailure, onRunning(hooks, ctx, input.tag, data.atMs ?? data.logicalTimeMs, before, (state) => {
        const item = itemOf(ctx, state, data.occurrence, (view) => view.deadlineMs);
        return item === null
          ? failed(FailureTag.Rejected, "unknown-timer")
          : fireItem(hooks, ctx, item, { tag: FiredTag.Timer, logicalTimeMs: data.logicalTimeMs }, state);
      }));
    }
    case InputTag.EffectResult:
      return effectContinuation(ctx, input.payload, (data) =>
        onRunning(hooks, ctx, InputTag.EffectResult, data.atMs, before, (state) => deliverEffectResult(hooks, ctx, data, state)));
    case InputTag.CancelInstance: // HD4's general cancellation, refused until its stage fills it
      return failed(FailureTag.Unsupported, "cancel-instance"); // dynamic-only: an input, which no admission sees
  }
  return assertNever(input);
}

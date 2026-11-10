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
 */
import {
  BranchSchedule, ContinuationFailure, ElementTag, EventRoleTag, assertNever, elementActivity, elementEnvelope, elementGateway,
  elementHeader, programElement, programPublicId, programSourceType, programTarget, type Element, type ElementId,
  type Envelope, type FlowId, type MultiInstance, type Program,
} from "./il/types.js";
import {
  ActivationRole, CauseTag, CommandActionTag, ContinuationTag, DeliveryTriggerTag, EffectOutcomeTag, FailureTag,
  FiredTag, InputTag, InstanceStatus, IterationTag, LeaveTag, SignalTag, Terminal, TokenTag, WriteRule, beginOccurrence,
  beginRequest, busyScopes, closeOwnItems, committed, crossed, emptyDraft, entryCount, failed, idle,
  initial, instanceOf, keyOf, occurrenceOf, openKindView, recordEnd, reserve, root, signal as enqueue,
  startReserved,
  type BeginRequest, type Binding, type Cause, type CommandAction, type CommandInput, type EffectInput, type Fired,
  type Input, type InstanceFailure, type Iteration, type Leave, type Occurrence, type OccurrenceRef,
  type OpenItem, type Outcome, type Result, type ScopeOccurrence, type ScopeOccurrenceId, type Signal, type StartTrigger, type State,
  type Token, type Transition, type WaitView,
} from "./state.js";
import {
  ScopeRole, admitThen, cancelOccurrence, clearInside, removeOccurrence, type Ctx, type Hooks, type ScopeEntry,
} from "./hooks.js";

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
      if (occurrence.incoming !== null) return failed(FailureTag.SemanticFailure, "flow-into-start-event");
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
  if (element === null) return failed(FailureTag.SemanticFailure, "begin-without-element");
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

/**
 * `outcome`, unless it rolls back or fails after `state` crossed a transaction boundary: CIB commits an input at the
 * boundary and runs the rest in a job, which alone fails (`ExecutionEntity#performOperation`, CIB-EXT-0027). Rolling the
 * whole input back would be wrong and the kernel does not split it, so the outcome is `unsupported`.
 */
function deferred(program: Program, state: State, outcome: Outcome): Outcome {
  if (outcome.ok) return outcome;
  switch (outcome.failure.tag) {
    case FailureTag.RolledBack:
    case FailureTag.SemanticFailure:
      // dynamic-only: whether a closure fails after it crossed a boundary depends on the run's data and order
      return crossed(program, state) ? failed(FailureTag.Unsupported, "async-boundary-failure") : outcome;
    case FailureTag.Rejected:
    case FailureTag.Unsupported:
      return outcome;
  }
  return assertNever(outcome.failure.tag);
}

/** A rolled-back timer firing stays rolled back under `ContinuationFailure.RolledBack`, `unsupported` under `Incident`. */
function timerJob(failure: ContinuationFailure, outcome: Outcome): Outcome {
  const rolledBack = !outcome.ok && outcome.failure.tag === FailureTag.RolledBack;
  // dynamic-only: whether a firing's closure rolls back depends on the run's data
  return rolledBack && failure === ContinuationFailure.Incident ? failed(FailureTag.Unsupported, "timer-job-failure") : outcome;
}

/** Begin the occurrence `request` names and hand it to its feature. */
function begin(hooks: Hooks, ctx: Ctx, request: BeginRequest, state: State): Outcome {
  const sourceType = programSourceType(ctx.program, request.element);
  if (sourceType === null) return failed(FailureTag.SemanticFailure, "begin-without-element");
  const [begun, occurrence] = beginOccurrence(state, request, roleOf(ctx.program, request), sourceType);
  return deferred(ctx.program, begun, dispatch(hooks, ctx, occurrence, { locals: request.locals, inner: request.inner }, request.trigger, begun));
}

function continueAfter(hooks: Hooks, ctx: Ctx, occurrence: Occurrence, leave: Leave, writes: readonly Binding[], state: State): Outcome {
  const continuation = occurrence.continuation;
  switch (continuation.tag) {
    case ContinuationTag.Flow:
      return hooks.outflow(ctx, occurrence, leave, state);
    case ContinuationTag.MultiInstance:
      return hooks.instanceCompleted(ctx, continuation.body, occurrence, writes, state);
    case ContinuationTag.Compensation:
      return hooks.handlerCompleted(ctx, continuation.run, occurrence, state);
  }
  return assertNever(continuation);
}

/**
 * The one completion pipeline: disarm, write, retain, continue, remove and journal, in that order. The occurrence's
 * record and owned scope go before its continuation runs, so that a continuation leaving its instance or handler scope
 * does not cancel the occurrence that just completed. An occurrence raised away gets no retention, outflow or
 * continuation. A completion naming an occurrence an earlier signal removed is dropped: CIB leaves a Signal thrower only
 * after its receivers ran (`ThrowSignalEventActivityBehavior#execute`), and one of them may have ended it.
 */
function complete(
  hooks: Hooks, ctx: Ctx, id: number, requested: Leave, writes: readonly Binding[], rule: WriteRule, before: State,
): Outcome {
  const found = occurrenceOf(before, id);
  if (found === null) return committed(before);
  const sourceType = programSourceType(ctx.program, found.element);
  if (sourceType === null) return failed(FailureTag.SemanticFailure, "complete-without-element");
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
      return committed(recordEnd(removeOccurrence(state, id), key, Terminal.Cancelled));
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

/** A signal's transition, and whether it is a completion, the one kind `absorb` runs inside the micro-step. */
type SignalRun = Readonly<{ completion: boolean; run: (state: State) => Outcome }>;
const other = (run: (state: State) => Outcome): SignalRun => ({ completion: false, run });

function signalRun(hooks: Hooks, ctx: Ctx, next: Signal): SignalRun {
  switch (next.tag) {
    case SignalTag.Arm:
      return other((state) => hooks.arm(ctx, next.host, next.element, next.scope, state));
    case SignalTag.ArmScope:
      return other((state) => hooks.armScope(ctx, next.scope, state));
    case SignalTag.ArmGateway:
      return other((state) => hooks.armGateway(ctx, next.occurrence, next.gateway, next.scope, state));
    case SignalTag.Raise:
      return other((state) => hooks.raise(ctx, next.event, next.origin, state));
    case SignalTag.Begin:
      return other((state) => begin(hooks, ctx, next.request, state));
    case SignalTag.Complete:
      return { completion: true, run: (state) => complete(hooks, ctx, next.occurrence, next.leave, next.writes, next.rule, state) };
    case SignalTag.Write:
      return other((state) => hooks.writeOutputs(ctx, next.scope, next.writes, next.rule, state));
    case SignalTag.Remove:
      return other((state) => hooks.removeVariables(ctx, next.scope, next.names, state));
    case SignalTag.Occur:
      return other((state) => {
        const [reserved, occurrence] = reserve(state, next.element, next.scope);
        return complete(hooks, ctx, occurrence.id, next.leave, next.writes, next.rule, reserved);
      });
    case SignalTag.Cancel:
      return other((state) => committed(cancelOccurrence(state, next.occurrence)));
    case SignalTag.Fire:
      return other((state) => {
        const open = state.openItems.find((item) => item.id === next.item);
        return open === undefined ? committed(state) : fireItem(hooks, ctx, open, next.fired, state);
      });
    case SignalTag.EndInstance:
      return other((state) => committed(endInstance(next.status, next.failure, state)));
    case SignalTag.Compensate:
      return other((state) => hooks.compensate(ctx, next.scope, next.activity, next.trigger, next.leave, next.resume, state));
    case SignalTag.CompensationFailed:
      return other((state) => hooks.failCompensation(ctx, next.handler, next.code, next.message, next.origin, state));
  }
  return assertNever(next);
}

/** Run a completion when it is the only signal the micro-step enqueued, inside the micro-step. */
function absorb(hooks: Hooks, ctx: Ctx, before: number, state: State): Outcome {
  const queued = state.signals.slice(before);
  const sole = queued.length === 1 && queued[0] !== undefined ? signalRun(hooks, ctx, queued[0]) : null;
  return sole?.completion === true ? sole.run({ ...state, signals: state.signals.slice(0, before) }) : committed(state);
}

/** Turn the draft into one `Transition` and tell the features what the micro-step removed and wrote. */
function conclude(hooks: Hooks, ctx: Ctx, cause: Cause, element: ElementId | null, owner: ScopeOccurrenceId, state: State): Outcome {
  const { draft, writes } = state;
  const transition: Transition = { cause, element, owner, started: draft.started, ended: draft.ended };
  // Appends in place: copying the journal on every micro-step made a closure quadratic in its length (measured
  // 2026-11-10 on `automatic-loop-beyond-bound`). Each input starts a fresh journal (`initial`, `onRunning`) and
  // `conclude` is its only writer, so no state another input or a rolled-back stage keeps sees the push.
  (state.journal as Transition[]).push(transition);
  let current: State = { ...state, draft: emptyDraft, writes: [] };
  for (const occurrence of draft.cancelled) {
    const notified = hooks.cancelled(ctx, occurrence, current);
    if (!notified.ok) return notified;
    current = notified.value;
  }
  return hooks.written(ctx, writes, current);
}

/**
 * One micro-step: run `body`, absorb its sole completion and record the transition. Each stage's failure is `deferred`
 * against the state it started from, so a boundary an earlier micro-step or stage crossed counts.
 */
function microStep(
  hooks: Hooks, ctx: Ctx, cause: Cause, element: ElementId | null, owner: ScopeOccurrenceId,
  body: (state: State) => Outcome, state: State,
): Outcome {
  const before = state.signals.length;
  const next = deferred(ctx.program, state, body(state));
  if (!next.ok) return next;
  const absorbed = deferred(ctx.program, next.value, absorb(hooks, ctx, before, next.value));
  return absorbed.ok ? deferred(ctx.program, absorbed.value, conclude(hooks, ctx, cause, element, owner, absorbed.value)) : absorbed;
}

/** Route a token on `flow` to the element at the end of it. */
function arrive(hooks: Hooks, ctx: Ctx, flow: FlowId, scope: ScopeOccurrenceId, state: State): Outcome {
  const element = programTarget(ctx.program, flow);
  if (element === null) return failed(FailureTag.SemanticFailure, "flow-without-target");
  return begin(hooks, ctx, beginRequest({ element, scope, incoming: flow }), state);
}

/**
 * Move one token in its own micro-step: route a flow token to the element at the end of its flow; dispatch a deferred
 * begin as the `begin` signal it was, with that signal's journal cause.
 */
function moveToken(hooks: Hooks, ctx: Ctx, token: Token, state: State): Outcome {
  switch (token.tag) {
    case TokenTag.Flow:
      return microStep(hooks, ctx, { tag: CauseTag.Arrive, flow: token.flow }, programTarget(ctx.program, token.flow), token.scope,
        (current) => arrive(hooks, ctx, token.flow, token.scope, current), state);
    case TokenTag.Begin: {
      const next: Signal = { tag: SignalTag.Begin, request: token.request };
      return microStep(hooks, ctx, { tag: CauseTag.Signal, name: signalName(next) }, null, root, signalRun(hooks, ctx, next).run, state);
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
  const notScope: Outcome = failed(FailureTag.SemanticFailure, "scope-occurrence-without-scope");
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

/** The next scope occurrence other than the root that is idle, which the closure completes through its owner. */
function idleScope(ctx: Ctx, state: State): ScopeOccurrence | undefined {
  if (!state.scopes.some((scope) => scope.id !== root)) return undefined;
  const busy = busyScopes(state);
  return state.scopes.find((scope) => scope.id !== root && !busy.has(scope.id) && !activityLocal(ctx, state, scope));
}

/**
 * The token the closure moves next, and the rest: the oldest under `BranchSchedule.orderInvariant`, whose admitted models
 * no order changes (`flow.concurrentWrite`); the newest under `declarationDepthFirst` (CIB-OP-0016), where `Flow`
 * queues a split's flows reversed and `Feature.MultiInstance` a parallel body's instances, so each branch and each
 * instance runs to its next wait, join or end before the next one starts. Under `declarationDepthFirst` an idle scope
 * occurrence completes before any token moves, as CIB ends a Sub-Process in the operation that ends its last execution,
 * before its LIFO queue reaches a sibling branch (`PvmAtomicOperationActivityEnd:105`).
 */
function nextToken(ctx: Ctx, state: State): readonly [Token | undefined, readonly Token[]] {
  const queue = state.tokens;
  switch (ctx.program.options.branchSchedule) {
    case BranchSchedule.OrderInvariant:
      return [queue[0], queue.slice(1)];
    case BranchSchedule.DeclarationDepthFirst:
      return idleScope(ctx, state) !== undefined ? [undefined, queue] : [queue.at(-1), queue.slice(0, -1)];
  }
  return assertNever(ctx.program.options.branchSchedule);
}

type Reoffered = Readonly<{ gateway: ElementId; scope: ScopeOccurrenceId; state: State }>;

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
    if (gateway === null || occurrence === null) return failed(FailureTag.SemanticFailure, "parked-without-gateway");
    const offered = hooks.arriveGateway(ctx, gateway[0], gateway[1], occurrence, state);
    if (!offered.ok) return offered;
    if (offered.value.signals.length > 0) return committed({ gateway: gateway[0].id, scope: waiting.scope, state: offered.value });
  }
  return committed(null);
}

/**
 * Signals first, then tokens, then idle scope occurrences, then the parked joins a quiescent closure offers again
 * (`reoffer`, journalled with the `idle` cause of the join's scope occurrence), then the instance's completion.
 */
function settle(hooks: Hooks, ctx: Ctx, bound: number, start: State): Outcome {
  let state = start;
  let work = closureWorkBound;
  for (let fuel = bound; ; fuel -= 1) {
    if (fuel === 0) return failed(FailureTag.Unsupported, "closure-bound"); // dynamic-only: a closure's length depends on the run
    work -= entryCount(state);
    if (work < 0) return failed(FailureTag.Unsupported, "closure-bound"); // dynamic-only: so does its size
    if (state.status !== InstanceStatus.Running) return committed(state);
    const [next, ...signals] = state.signals;
    const [token, tokens] = nextToken(ctx, state);
    const ready = next === undefined && token === undefined ? idleScope(ctx, state) : undefined;
    let stepped: Outcome;
    if (next !== undefined) {
      stepped = microStep(hooks, ctx, { tag: CauseTag.Signal, name: signalName(next) }, null, root,
        signalRun(hooks, ctx, next).run, { ...state, signals });
    } else if (token !== undefined) {
      stepped = moveToken(hooks, ctx, token, { ...state, tokens });
    } else if (ready !== undefined) {
      stepped = microStep(hooks, ctx, { tag: CauseTag.Idle, scope: ready.id }, ready.element, ready.id,
        (current) => completeIdleScope(hooks, ctx, ready, current), state);
    } else {
      const offered = reoffer(hooks, ctx, state);
      if (!offered.ok) return offered;
      const fired = offered.value;
      if (fired === null) {
        if (!idle(state, root)) return committed(state);
        return microStep(hooks, ctx, { tag: CauseTag.Idle, scope: root }, null, root,
          (current) => committed(endInstance(InstanceStatus.Completed, null, current)), state);
      }
      stepped = microStep(hooks, ctx, { tag: CauseTag.Idle, scope: fired.scope }, fired.gateway, fired.scope,
        () => committed(fired.state), state);
    }
    if (!stepped.ok) return stepped;
    state = stepped.value;
  }
}

/** The open item with the public identity `occurrence` whose view has the detail `detail` reads. */
function itemOf(ctx: Ctx, state: State, occurrence: OccurrenceRef, detail: (view: WaitView) => unknown): OpenItem | null {
  return state.openItems.find((item) =>
    programPublicId(ctx.program, item.element) === occurrence.element &&
    occurrenceOf(state, item.occurrence)?.activation === occurrence.activation &&
    detail(openKindView(item.kind)) !== null &&
    instanceOf(state, item.scope) === occurrence.processInstanceId) ?? null;
}

/** The begun occurrence with the public identity `ref`, the instance rather than the body of a Multi-Instance element. */
function occurrenceOfRef(ctx: Ctx, state: State, ref: OccurrenceRef): Occurrence | null {
  return state.occurrences.find((occurrence) =>
    (occurrence.begun || state.openItems.some((item) => item.occurrence === occurrence.id)) && occurrence.role === ActivationRole.Element && occurrence.activation === ref.activation &&
    programPublicId(ctx.program, occurrence.element) === ref.element &&
    instanceOf(state, occurrence.scope) === ref.processInstanceId) ?? null;
}

function command(hooks: Hooks, ctx: Ctx, input: CommandInput, state: State): Outcome {
  const incident = (action: CommandAction): Outcome => {
    const item = itemOf(ctx, state, input.occurrence, (view) => view.incident);
    return item === null ? failed(FailureTag.Rejected, "unknown-incident") : hooks.resolveIncident(ctx, item, action, state);
  };
  const variables = (act: (occurrence: Occurrence) => Signal): Outcome => {
    const occurrence = occurrenceOfRef(ctx, state, input.occurrence);
    return occurrence === null ? failed(FailureTag.Rejected, "unknown-occurrence") : committed(enqueue(state, act(occurrence)));
  };
  const action = input.action;
  switch (action.tag) {
    case CommandActionTag.CompleteUserTask: {
      const item = itemOf(ctx, state, input.occurrence, (view) => view.userTask);
      if (item === null) return failed(FailureTag.Rejected, "unknown-user-task");
      const element = programElement(ctx.program, item.element);
      const activity = element === null ? null : elementActivity(element);
      if (activity === null) return failed(FailureTag.SemanticFailure, "activity-item-without-activity");
      return hooks.completeUserTask(ctx, activity[0], activity[1], item, action.values, state);
    }
    case CommandActionTag.RetryIncident:
    case CommandActionTag.CancelIncidentProcess:
      return incident(action);
    case CommandActionTag.SetVariables:
      return admitThen(action.values.map(([, value]) => value), () => variables((occurrence) => ({ tag: SignalTag.Write, scope: occurrence.scope, writes: action.values, rule: WriteRule.Outward })));
    case CommandActionTag.RemoveVariables:
      return variables((occurrence) => ({ tag: SignalTag.Remove, scope: occurrence.scope, names: action.names }));
  }
  return assertNever(action);
}

function deliverEffectResult(hooks: Hooks, ctx: Ctx, input: EffectInput, state: State): Outcome {
  const item = itemOf(ctx, state, input.occurrence, (view) => view.effect);
  return item === null ? failed(FailureTag.Rejected, "unknown-effect") : hooks.effectResult(ctx, item, input.outcome, state);
}

/**
 * A continuation an effect result reaches that cannot go on rolls back; under a profile selecting the job-failure
 * reading (`ContinuationFailure.incident`, CIB-EXT-0026, the boundary of CIB-INT-0003) it instead turns the effect into
 * a technical failure, the path a real job's retry and incident follow.
 */
function effectContinuation(ctx: Ctx, data: EffectInput, run: (data: EffectInput) => Outcome): Outcome {
  const result = run(data);
  const retried = !result.ok && result.failure.tag === FailureTag.RolledBack &&
    ctx.program.options.continuationFailure === ContinuationFailure.Incident &&
    (data.outcome.tag === EffectOutcomeTag.Success || data.outcome.tag === EffectOutcomeTag.BusinessFailure);
  return retried ? run({ ...data, outcome: { tag: EffectOutcomeTag.TechnicalFailure } }) : result;
}

/**
 * Advance the clock to an input's logical time, `null` leaving it where it is; a time before the clock is rejected,
 * since logical time never runs backward.
 */
function advanceClock(atMs: number | null, state: State): Outcome {
  if (atMs === null) return committed(state);
  return atMs < state.logicalTimeMs ? failed(FailureTag.Rejected, "logical-time-backward") : committed({ ...state, logicalTimeMs: atMs });
}

/**
 * Run an input's transition on a running instance at its logical time `atMs`, then settle. A Timer firing without its own
 * time happens at the deadline it names; a host that wakes later states the later time.
 */
function onRunning(
  hooks: Hooks, ctx: Ctx, tag: InputTag, atMs: number | null, before: State | null, transition: (state: State) => Outcome,
): Outcome {
  if (before === null) return failed(FailureTag.Rejected, "instance-not-started");
  if (before.status !== InstanceStatus.Running) return failed(FailureTag.Rejected, "instance-not-running");
  const advanced = advanceClock(atMs, { ...before, journal: [] });
  if (!advanced.ok) return advanced;
  const started = microStep(hooks, ctx, { tag: CauseTag.Input, input: tag }, null, root, transition, advanced.value);
  return started.ok ? settle(hooks, ctx, closureBound, started.value) : started;
}

function holds(iteration: Iteration, scope: ScopeOccurrenceId): boolean {
  switch (iteration.tag) {
    case IterationTag.Active:
      return iteration.scope === scope;
    case IterationTag.Waiting:
    case IterationTag.Completed:
      return false;
  }
  return assertNever(iteration);
}

/** `Ctx.scopeRole`: read from the slots, since the occurrences that ended there may be gone when an event arrives. */
function scopeRole(state: State, scope: ScopeOccurrenceId): ScopeRole {
  const owned = state.scopes.find((candidate) => candidate.id === scope)?.occurrence ?? null;
  const owner = owned === null ? null : occurrenceOf(state, owned);
  const ownedByInstance = owner !== null && ownedByMultiInstance(owner);
  if (state.slots.compensation.runs.some((run) => run.running.some(([held]) => held === scope))) return ScopeRole.CompensationHandler;
  if (ownedByInstance || state.slots.multiInstances.some((run) => run.instances.some((iteration) => holds(iteration, scope)))) {
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
  return { program, evaluate: hooks.evaluate, catches: hooks.catches, eventStart: hooks.eventStart, scopeRole };
}

function deliver(hooks: Hooks, ctx: Ctx, input: Extract<Input, { tag: InputTag.Deliver }>, state: State): Outcome {
  const data = input.payload;
  switch (data.trigger.tag) {
    case DeliveryTriggerTag.Message: {
      const item = itemOf(ctx, state, data.occurrence, (view) => view.channel);
      return item === null
        ? failed(FailureTag.Rejected, "unknown-message-subscription")
        : fireItem(hooks, ctx, item, { tag: FiredTag.Message, delivery: data }, state);
    }
    case DeliveryTriggerTag.Signal: {
      const item = itemOf(ctx, state, data.occurrence, (view) => view.signal);
      return item === null
        ? failed(FailureTag.Rejected, "unknown-signal-subscription")
        : fireItem(hooks, ctx, item, { tag: FiredTag.Signal, delivery: data }, state);
    }
  }
  return assertNever(data.trigger);
}

/**
 * One input. `null` is the state before the instance starts; only a start applies to it. The root's Event Sub-Process
 * starts are armed before the start Event's tokens move.
 */
export function step(hooks: Hooks, program: Program, before: State | null, input: Input): Outcome {
  const ctx = context(hooks, program);
  switch (input.tag) {
    case InputTag.Start: {
      const payload = input.payload;
      if (before !== null) return failed(FailureTag.Rejected, "instance-already-started");
      const start = hooks.selectStart(ctx, payload.startEvent, payload.trigger);
      if (start === null) return failed(FailureTag.Rejected, "no-start-event");
      const fresh = admitThen(payload.variables.map(([, value]) => value), () => advanceClock(payload.atMs, enqueue(initial(payload.instanceId, payload.variables, payload.businessKey), { tag: SignalTag.ArmScope, scope: root })));
      if (!fresh.ok) return fresh;
      const started = microStep(hooks, ctx, { tag: CauseTag.Input, input: InputTag.Start }, start, root,
        (state) => begin(hooks, ctx, beginRequest({ element: start, scope: root, trigger: payload.trigger }), state), fresh.value);
      return started.ok ? settle(hooks, ctx, closureBound, started.value) : started;
    }
    case InputTag.Command:
      return onRunning(hooks, ctx, input.tag, input.payload.atMs, before, (state) => command(hooks, ctx, input.payload, state));
    case InputTag.Deliver:
      return onRunning(hooks, ctx, input.tag, input.payload.atMs, before, (state) => deliver(hooks, ctx, input, state));
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
  }
  return assertNever(input);
}

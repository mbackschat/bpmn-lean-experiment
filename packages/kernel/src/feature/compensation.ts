/**
 * Compensation and Transaction cancellation, transcribed from `Kernel/Feature/Compensation.lean`.
 *
 * Owns `FeatureSlots.compensation`. An Activity or Scope with a compensation handler that completes is retained in the
 * scope occurrence it completed in, together with the context its handler restores: for a Sub-Process, the variables
 * visible inside it when it completed ("snapshot data", BPMN 2.0.2 §13.5.5); a boundary handler restores none.
 *
 * A trigger (`Signal.compensate`) takes every record retained in its scope occurrence and runs their handlers, each
 * begun in a context scope occurrence of its own inside that one, holding the restored context, with continuation
 * `compensation`. Order (§13.5.5): a Sequence Flow from A to B makes B's handler complete before A's starts, and
 * handlers without such a dependency run concurrently, so every pending handler none of whose successors is still
 * pending or running starts at once, in program order. Once the last handler has completed, the trigger continues as
 * its thrower asked.
 *
 * A handler that an Error leaves uncaught fails the process instance: every token, item and occurrence is removed and
 * the failure is published. BPMN 2.0.2 §13.3.2 leaves this open; it is the interpretation COMPH-FAIL-01 of the trigger
 * account.
 */
import {
  assertNever,
  distinctCount,
  elementActivity,
  elementEnvelope,
  elementHeader,
  elementScope,
  mergeSort,
  programElement,
  type ElementId,
} from "../il/types.js";
import {
  ContinuationTag,
  FailureTag,
  InstanceStatus,
  ResumeTag,
  SignalTag,
  WriteRule,
  beginRequest,
  committed,
  completeSignal,
  enterScope,
  failed,
  instanceOf,
  issue,
  signal,
  visible,
  type Compensable,
  type CompensationRun,
  type Compensations,
  type InstanceFailure,
  type Occurrence,
  type OccurrenceRef,
  type Origin,
  type Outcome,
  type Result,
  type Resume,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
} from "../state.js";
import { leaveScope, type Ctx } from "../hooks.js";

function store(state: State, compensation: Compensations): State {
  return { ...state, slots: { ...state.slots, compensation } };
}

/** The scope occurrence of the Scope element `occurrence` is; a Call's or Activity's owned scope holds no records that outlive it. */
function ownedScope(ctx: Ctx, occurrence: Occurrence, state: State): ScopeOccurrence | null {
  const element = programElement(ctx.program, occurrence.element);
  if (element === null || elementScope(element) === null) return null;
  return state.scopes.find((scope) => scope.occurrence === occurrence.id) ?? null;
}

/**
 * `Hooks.completed`, before the pipeline disposes of the owned scope: a completed Scope's inner records stay
 * compensable (BPMN 2.0.2 §13.5.5). A Scope with a handler keeps them as the children its handler may trigger, the
 * others move to the parent. The record restores the variables visible inside a completed Scope ("snapshot data"), an
 * Activity's handler none.
 */
export function completed(ctx: Ctx, occurrence: Occurrence, state: State): Outcome {
  const element = programElement(ctx.program, occurrence.element);
  const handler = (element === null ? null : elementEnvelope(element))?.compensationHandler ?? null;
  const owned = ownedScope(ctx, occurrence, state);
  const compensation = state.slots.compensation;
  const isInner = (record: Compensable): boolean => owned !== null && owned.id === record.scope;
  const inner = compensation.retained.filter(isInner);
  const outer = compensation.retained.filter((record) => !isInner(record));
  if (handler === null) {
    return committed(store(state, {
      ...compensation,
      retained: [...outer, ...inner.map((record) => ({ ...record, scope: occurrence.scope }))],
    }));
  }
  const [issued, completion] = issue(state);
  const snapshot = owned === null ? [] : visible(issued, owned.id);
  const reference: OccurrenceRef = {
    processInstanceId: instanceOf(issued, occurrence.scope),
    element: occurrence.element,
    activation: occurrence.activation,
  };
  const record: Compensable = {
    subject: occurrence.element,
    handler,
    scope: occurrence.scope,
    occurrence: reference,
    completion,
    snapshot,
    children: inner,
  };
  return committed(store(issued, { ...compensation, retained: [...outer, record] }));
}

/** A Sequence Flow leads from `record`'s subject to `other`'s. */
function precedes(ctx: Ctx, record: Compensable, other: Compensable): boolean {
  return ctx.program.flows.some((flow) => flow.source === record.subject && flow.target === other.subject);
}

function position(ctx: Ctx, element: ElementId): number {
  const index = ctx.program.elements.findIndex((candidate) => elementHeader(candidate).id === element);
  return index < 0 ? ctx.program.elements.length : index;
}

/**
 * Begin `record`'s handler in a new context scope occurrence inside `scope`, where the records of its children become
 * the ones a throw inside the handler compensates.
 */
function beginHandler(ctx: Ctx, scope: ScopeOccurrenceId, state: State, record: Compensable): Result<readonly [State, ScopeOccurrenceId]> {
  const element = programElement(ctx.program, record.handler);
  if (element === null) return failed(FailureTag.SemanticFailure, "compensation-handler-missing");
  if (elementActivity(element) === null && elementScope(element) === null) {
    return failed(FailureTag.SemanticFailure, "compensation-handler-not-activity");
  }
  const [entered, context] = enterScope(state, record.handler, scope, record.snapshot, null);
  const compensation = entered.slots.compensation;
  const children = record.children.map((child) => ({ ...child, scope: context }));
  const stored = store(entered, { ...compensation, retained: [...compensation.retained, ...children] });
  return committed([signal(stored, {
    tag: SignalTag.Begin,
    request: beginRequest({ element: record.handler, scope: context, continuation: { tag: ContinuationTag.Compensation, run: scope } }),
  }), context]);
}

function resumeRun(state: State, resume: Resume | null): State {
  if (resume === null) return state;
  switch (resume.tag) {
    case ResumeTag.Complete:
      return signal(state, completeSignal(resume.occurrence, resume.leave, [], WriteRule.Outward));
    case ResumeTag.Occur:
      return signal(state, {
        tag: SignalTag.Occur,
        element: resume.element,
        scope: resume.scope,
        leave: resume.leave,
        writes: [],
        rule: WriteRule.Outward,
      });
  }
  return assertNever(resume);
}

/**
 * Start every pending handler of the run in `scope` that no pending or running handler's subject succeeds; once none is
 * pending or running, end the run: cancel the occurrence it leaves, if any, then complete its `resume`.
 */
function advance(ctx: Ctx, scope: ScopeOccurrenceId, state: State): Outcome {
  const compensation = state.slots.compensation;
  const run = compensation.runs.find((candidate) => candidate.scope === scope);
  if (run === undefined) return failed(FailureTag.SemanticFailure, "compensation-run-missing");
  const others = compensation.runs.filter((candidate) => candidate.scope !== scope);
  const remaining = [...run.pending, ...run.running.map(([, record]) => record)];
  const isReady = (record: Compensable): boolean => !remaining.some((other) => precedes(ctx, record, other));
  const ready = run.pending.filter(isReady);
  const waiting = run.pending.filter((record) => !isReady(record));
  if (run.pending.length === 0 && run.running.length === 0) {
    const ended = store(state, { ...compensation, runs: others });
    const left = run.leave === null ? ended : signal(ended, { tag: SignalTag.Cancel, occurrence: run.leave });
    return committed(resumeRun(left, run.resume));
  }
  // Dynamic-only: a dependency cycle needs the retained set, which depends on the run.
  if (ready.length === 0 && run.running.length === 0) return failed(FailureTag.Unsupported, "compensation-dependency-cycle");
  const ordered = mergeSort(ready, (left, right) =>
    position(ctx, left.subject) < position(ctx, right.subject) ||
    (position(ctx, left.subject) === position(ctx, right.subject) && right.completion <= left.completion));
  let current = state;
  const started: (readonly [ScopeOccurrenceId, Compensable])[] = [];
  for (const record of ordered) {
    const begun = beginHandler(ctx, scope, current, record);
    if (!begun.ok) return begun;
    current = begun.value[0];
    started.push([begun.value[1], record]);
  }
  const updated: CompensationRun = { ...run, pending: waiting, running: [...run.running, ...started] };
  return committed(store(current, { ...current.slots.compensation, runs: [...others, updated] }));
}

/**
 * `Signal.compensate`: take the records retained in `scope` into a new run: those of `activity` when one is named, else
 * all. Dynamic-only refusals: a second trigger in a scope whose run is in progress, since its relation to the running
 * one is not selected (COMPH-EXCLUSIVE-01 of the trigger account), and a subject retained twice, whose instances
 * §13.5.5 compensates in reverse completion order.
 */
export function compensate(
  ctx: Ctx,
  scope: ScopeOccurrenceId,
  activity: ElementId | null,
  trigger: OccurrenceRef,
  leave: number | null,
  resume: Resume | null,
  state: State,
): Outcome {
  const compensation = state.slots.compensation;
  const selects = (record: Compensable): boolean => record.scope === scope && (activity === null || activity === record.subject);
  const selected = compensation.retained.filter(selects);
  const kept = compensation.retained.filter((record) => !selects(record));
  const subjects = selected.map((record) => record.subject);
  if (compensation.runs.some((run) => run.scope === scope)) {
    return failed(FailureTag.Unsupported, "compensation-concurrent-trigger"); // dynamic-only: whether a run is in progress
  }
  if (distinctCount(subjects) !== subjects.length) {
    return failed(FailureTag.Unsupported, "compensation-repeated-subject"); // dynamic-only: what was retained
  }
  return advance(ctx, scope, store(state, {
    retained: kept,
    runs: [...compensation.runs, { trigger, scope, pending: selected, running: [], leave, resume }],
  }));
}

/** `Hooks.handlerCompleted`: the handler's context is left and the run starts what that releases. */
export function handlerCompleted(ctx: Ctx, run: ScopeOccurrenceId, occurrence: Occurrence, state: State): Outcome {
  const left = leaveScope(state, occurrence.scope);
  const compensation = left.slots.compensation;
  const runs = compensation.runs.map((candidate) => candidate.scope === run
    ? { ...candidate, running: candidate.running.filter(([context]) => context !== occurrence.scope) }
    : candidate);
  return advance(ctx, run, store(left, { ...compensation, runs }));
}

/**
 * `Signal.compensationFailed`: an Error the effect at `origin` reported left the handler context `handler` uncaught.
 * The handler's public occurrence is the raising Activity itself or, for a Sub-Process handler, its occurrence in that
 * context.
 */
export function failCompensation(
  _ctx: Ctx,
  handler: ScopeOccurrenceId,
  code: string,
  message: string | null,
  origin: Origin,
  state: State,
): Outcome {
  const context = state.scopes.find((scope) => scope.id === handler);
  if (context === undefined) return failed(FailureTag.SemanticFailure, "compensation-handler-gone");
  const run = state.slots.compensation.runs.find((candidate) => candidate.running.some(([held]) => held === handler));
  if (run === undefined) return failed(FailureTag.SemanticFailure, "compensation-handler-without-run");
  const element = context.element;
  if (element === null) return failed(FailureTag.SemanticFailure, "compensation-handler-without-element");
  // Dynamic-only: a handler's Error End Event names no effect, the shape COMPH-FAIL-01 leaves open.
  if (origin.host === null) return failed(FailureTag.Unsupported, "compensation-handler-error-without-effect");
  let handlerActivation = origin.activation;
  if (origin.element !== element) {
    const started = state.occurrences.find((candidate) => candidate.scope === handler && candidate.element === element);
    if (started === undefined) return failed(FailureTag.SemanticFailure, "compensation-handler-not-started");
    handlerActivation = started.activation;
  }
  const failure: InstanceFailure = {
    code,
    message,
    occurrence: { processInstanceId: instanceOf(state, origin.scope), element: origin.element, activation: origin.activation },
    related: [
      ["trigger", run.trigger],
      ["handler", { processInstanceId: instanceOf(state, handler), element, activation: handlerActivation }],
    ],
  };
  return committed(signal(state, { tag: SignalTag.EndInstance, status: InstanceStatus.Failed, failure }));
}

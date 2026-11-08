/**
 * Compensation and Transaction cancellation, transcribed from `Kernel/Feature/Compensation.lean`.
 *
 * Owns `FeatureSlots.compensation`. An Activity or Scope with a compensation handler that completes is retained in
 * the scope occurrence it completed in (`Signal.completed`), together with the context its handler restores: for a
 * Sub-Process, the variables visible inside it when it completed ("snapshot data", BPMN 2.0.2 §13.5.5); a boundary
 * handler restores none.
 *
 * A trigger (`Signal.compensate`) takes every record retained in its scope occurrence and runs their handlers, each
 * in a scope occurrence of its own inside that one, holding the restored context and marked `compensating`. A
 * Compensation Activity begins as `Signal.startActivity`, a Compensation Event Sub-Process as
 * `Signal.startEventSubProcess`. Order (§13.5.5): a Sequence Flow from A to B makes B's handler complete before A's
 * starts, and handlers without such a dependency run concurrently, so every pending handler none of whose successors
 * is still pending or running starts at once, in program order. Once the last handler has completed, the trigger
 * continues as its thrower asked.
 *
 * A handler that an Error leaves uncaught fails the process instance: every token, item and occurrence is removed and
 * the failure is published. BPMN 2.0.2 §13.3.2 leaves this open; it is the interpretation COMPH-FAIL-01 of the
 * compensation trigger account.
 */
import type { Ctx } from "../hooks.js";
import type { ElementId } from "../il/types.js";
import {
  elementActivity,
  elementEnvelope,
  elementScope,
  programElement,
} from "../il/query.js";
import {
  FailureTag,
  InstanceStatus,
  SignalTag,
  clearInside,
  committed,
  disarm,
  failed,
  instanceOf,
  issue,
  leaveScope,
  root,
  signal,
  type Binding,
  type Compensable,
  type CompensationFailure,
  type Compensations,
  type OccurrenceRef,
  type Origin,
  type Outcome,
  type Result,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type Signal,
  type State,
  type Token,
} from "../state.js";

export function store(state: State, compensation: Compensations): State {
  return { ...state, slots: { ...state.slots, compensation } };
}

/** `Signal.completed`. */
export function retain(
  ctx: Ctx,
  element: ElementId,
  scope: ScopeOccurrenceId,
  snapshot: readonly Binding[],
  state: State,
): Outcome {
  const found = programElement(ctx.program, element);
  const handler = (found === null ? null : elementEnvelope(found))?.compensationHandler ?? null;
  if (handler === null) {
    return failed(FailureTag.SemanticFailure, "retain-without-compensation-handler");
  }
  const compensation = state.slots.compensation;
  return committed(
    store(state, { ...compensation, retained: [...compensation.retained, { subject: element, handler, scope, snapshot }] }),
  );
}

/** A Sequence Flow leads from `record`'s subject to `other`'s. */
export function precedes(ctx: Ctx, record: Compensable, other: Compensable): boolean {
  return ctx.program.flows.some((flow) => flow.source === record.subject && flow.target === other.subject);
}

/** The program position of `element`, the element count when it is absent, as Lean's `List.idxOf`. */
export function position(ctx: Ctx, element: ElementId): number {
  const index = ctx.program.elements.findIndex((candidate) => candidate.header.id === element);
  return index < 0 ? ctx.program.elements.length : index;
}

/**
 * Begin `record`'s handler in a new occurrence inside `scope`; the handler's own start activates it.
 */
export function begin(
  ctx: Ctx,
  scope: ScopeOccurrenceId,
  state: State,
  record: Compensable,
): Result<readonly [State, ScopeOccurrenceId]> {
  const element = programElement(ctx.program, record.handler);
  if (element === null) {
    return failed(FailureTag.SemanticFailure, "compensation-handler-missing");
  }
  const [issued, occurrence] = issue(state);
  const handler: ScopeOccurrence = {
    id: occurrence,
    element: record.handler,
    parent: scope,
    activation: 0,
    calledInstance: null,
    compensating: true,
  };
  const entered: State = {
    ...issued,
    scopes: [...issued.scopes, handler],
    variables: [...issued.variables, { scope: occurrence, entries: record.snapshot }],
  };
  let start: Signal;
  if (elementActivity(element) !== null) {
    start = { tag: SignalTag.StartActivity, element: record.handler, scope: occurrence };
  } else if (elementScope(element) !== null) {
    start = { tag: SignalTag.StartEventSubProcess, element: record.handler, parent: occurrence, variables: [] };
  } else {
    return failed(FailureTag.SemanticFailure, "compensation-handler-not-activity");
  }
  return committed([signal(entered, start), occurrence]);
}

/**
 * Start every pending handler of the run in `scope` that no pending or running handler's subject succeeds; once none
 * is pending or running, end the run: leave `scope` and disarm its boundaries if the run says so, then add its
 * `resume` tokens.
 */
export function advance(ctx: Ctx, scope: ScopeOccurrenceId, state: State): Outcome {
  const compensation = state.slots.compensation;
  const run = compensation.runs.find((candidate) => candidate.scope === scope);
  if (run === undefined) {
    return failed(FailureTag.SemanticFailure, "compensation-run-missing");
  }
  const others = compensation.runs.filter((candidate) => candidate.scope !== scope);
  const remaining = [...run.pending, ...run.running.map((entry) => entry[1])];
  const isReady = (record: Compensable): boolean => !remaining.some((other) => precedes(ctx, record, other));
  const ready = run.pending.filter(isReady);
  const waiting = run.pending.filter((record) => !isReady(record));
  if (run.pending.length === 0 && run.running.length === 0) {
    const stored = store(state, { ...compensation, runs: others });
    const left = run.leave ? disarm(leaveScope(stored, scope), scope) : stored;
    return committed({ ...left, tokens: [...left.tokens, ...run.resume] });
  }
  if (ready.length === 0 && run.running.length === 0) {
    return failed(FailureTag.Unsupported, "compensation-dependency-cycle");
  }
  const ordered = [...ready].sort((left, right) => position(ctx, left.subject) - position(ctx, right.subject));
  let current = state;
  const started: (readonly [ScopeOccurrenceId, Compensable])[] = [];
  for (const record of ordered) {
    const begun = begin(ctx, scope, current, record);
    if (!begun.ok) {
      return begun;
    }
    const [next, occurrence] = begun.value;
    current = next;
    started.push([occurrence, record]);
  }
  return committed(
    store(current, {
      ...current.slots.compensation,
      runs: [...others, { ...run, pending: waiting, running: [...run.running, ...started] }],
    }),
  );
}

/**
 * `Signal.compensate`: take every record retained in `scope` into a new run. A second trigger in a scope whose run is
 * in progress is refused, since its relation to the running one is not selected (COMPH-EXCLUSIVE-01 of the trigger
 * account), and so is a subject retained twice, whose instances §13.5.5 compensates in reverse completion order.
 */
export function compensate(
  ctx: Ctx,
  scope: ScopeOccurrenceId,
  trigger: OccurrenceRef,
  leave: boolean,
  resume: readonly Token[],
  state: State,
): Outcome {
  const compensation = state.slots.compensation;
  const selected = compensation.retained.filter((record) => record.scope === scope);
  const kept = compensation.retained.filter((record) => record.scope !== scope);
  const subjects = selected.map((record) => record.subject);
  if (compensation.runs.some((run) => run.scope === scope)) {
    return failed(FailureTag.Unsupported, "compensation-concurrent-trigger");
  }
  if (new Set(subjects).size !== subjects.length) {
    return failed(FailureTag.Unsupported, "compensation-repeated-subject");
  }
  return advance(
    ctx,
    scope,
    store(state, {
      retained: kept,
      runs: [...compensation.runs, { trigger, scope, pending: selected, running: [], leave, resume }],
    }),
  );
}

/** A handler's occurrence is idle: the handler completed. Leave the occurrence and start what it releases. */
export function completeCompensation(ctx: Ctx, occurrence: ScopeOccurrence, state: State): Outcome {
  const left = leaveScope(state, occurrence.id);
  const compensation = left.slots.compensation;
  const run = compensation.runs.find((candidate) => candidate.running.some((entry) => entry[0] === occurrence.id));
  if (run === undefined) {
    return failed(FailureTag.SemanticFailure, "compensation-handler-without-run");
  }
  const runs = compensation.runs.map((candidate) =>
    candidate.scope === run.scope
      ? { ...candidate, running: candidate.running.filter((entry) => entry[0] !== occurrence.id) }
      : candidate,
  );
  return advance(ctx, run.scope, store(left, { ...compensation, runs }));
}

/**
 * `Signal.compensationFailed`: an Error the effect at `origin` reported left the handler occurrence `handler`
 * uncaught.
 */
export function failCompensation(
  _ctx: Ctx,
  handler: ScopeOccurrenceId,
  code: string,
  message: string | null,
  origin: Origin,
  state: State,
): Outcome {
  const occurrence = state.scopes.find((candidate) => candidate.id === handler);
  if (occurrence === undefined) {
    return failed(FailureTag.SemanticFailure, "compensation-handler-gone");
  }
  const run = state.slots.compensation.runs.find((candidate) => candidate.running.some((entry) => entry[0] === handler));
  if (run === undefined) {
    return failed(FailureTag.SemanticFailure, "compensation-handler-without-run");
  }
  const element = occurrence.element;
  if (element === null) {
    return failed(FailureTag.SemanticFailure, "compensation-handler-without-element");
  }
  const activation = origin.activation;
  if (activation === null) {
    return failed(FailureTag.Unsupported, "compensation-handler-error-without-effect");
  }
  // The handler's public occurrence is the activation its own start recorded: the raising Activity itself, or the
  // Event Sub-Process occurrence entered inside the handler occurrence.
  let handlerActivation: number;
  if (origin.element === element) {
    handlerActivation = activation;
  } else {
    const inner = state.scopes.find((candidate) => candidate.parent === occurrence.id && candidate.element === element);
    if (inner === undefined) {
      return failed(FailureTag.SemanticFailure, "compensation-handler-not-started");
    }
    handlerActivation = inner.activation;
  }
  const failure: CompensationFailure = {
    trigger: run.trigger,
    handler: { processInstanceId: instanceOf(state, handler), element, activation: handlerActivation },
    effect: { processInstanceId: instanceOf(state, origin.scope), element: origin.element, activation },
    code,
    message,
  };
  return committed({ ...clearInside(state, root), status: InstanceStatus.Failed, failure });
}

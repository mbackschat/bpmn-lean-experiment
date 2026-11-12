/**
 * Compensation and Transaction cancellation, transcribed from `Kernel/Feature/Compensation.lean`.
 *
 * Owns `FeatureSlots.compensation`. An Activity or Scope with a compensation handler that completes is retained in the
 * scope occurrence it completed in, together with the context its handler restores: for a Sub-Process whose handler is a
 * Compensation Event Sub-Process, its own variables as they were when it completed ("snapshot data … associated with the
 * parent Activity", BPMN 2.0.2 §13.5.5; CIB copies only them, `CompensationUtil.java:118-124`), and for an instance of a
 * Multi-Instance Sub-Process also the locals of its own iteration scope occurrence whose names those lack, its item and
 * `loopCounter` ("for each instance the dedicated snapshot is restored", §13.5.5; CIB-DEV-0014); every other name the
 * handler reads live through its context's chain (D9), and a write to a restored name lands in the context's copy. A
 * boundary handler restores none.
 *
 * A trigger (`Signal.compensate`) takes every record visible from its scope occurrence (`visibleScopes`), or its
 * target's, and runs their handlers, each begun in a context scope occurrence of its own inside that one, holding the
 * restored context, with continuation `compensation`. Order (§13.5.5): when A's record completed before B's, a Sequence
 * Flow from A or from a boundary Event of A to B, a name B reads that A can write, or A and B being records of one
 * subject makes B's handler complete before A's starts (`precedes`); handlers without such a dependency run
 * concurrently, so every pending handler none of whose successors is still pending or running starts at once, in
 * program order. Once the last handler has completed, the trigger continues as its thrower asked.
 *
 * Under `ImplicitCompensation.EverySubProcess` (I5) a completed Sub-Process without a handler that holds records is
 * retained as one group record without a handler: compensating it runs its children as a nested run in a context
 * holding the Sub-Process's own variables, which resumes the outer run once they all completed (`Resume.group`).
 *
 * A handler that an Error leaves uncaught fails the process instance: every token, item and occurrence is removed and
 * the failure is published. BPMN 2.0.2 §13.3.2 leaves this open; it is the interpretation COMPH-FAIL-01 of the trigger
 * account.
 */
import {
  CompensationHandlerFailureTag,
  ImplicitCompensation,
  Placement,
  SubmissionRule,
  assertNever,
  elementActivity,
  elementEnvelope,
  elementEvent,
  elementGateway,
  elementHeader,
  elementScope,
  mergeSort,
  programElement,
  workCall,
  workIsService,
  workIsUser,
  workReceive,
  type Element,
  type ElementId,
} from "../il/types.js";
import { catchWrites, footprint, joined, meets, noNames, union, writes, type Footprint } from "../il/footprint.js";
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
  subtree,
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
import { ScopeRole, leaveScope, type Ctx } from "../hooks.js";

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
 * Whether `occurrence` is an instance of a Multi-Instance Activity: it completes in its own iteration scope
 * occurrence, the one `Iteration.active` names, holding its item and, under `cibLocals`, its `loopCounter`.
 */
function isInstance(ctx: Ctx, occurrence: Occurrence, state: State): boolean {
  const element = programElement(ctx.program, occurrence.element);
  const looping = ((element === null ? null : elementEnvelope(element))?.multiInstance ?? null) !== null;
  return looping && ctx.scopeRole(state, occurrence.scope) === ScopeRole.MultiInstanceInstance;
}

/**
 * Where a completion retains its record, and with which handler (D6, I9): an instance of a Multi-Instance Activity
 * completes in its own iteration scope occurrence, which `MultiInstance.instanceCompleted` leaves, so a Sub-Process
 * instance's record goes to that occurrence's parent, the body's instance-holding `MultiInstanceRun.scope`, and a Task
 * or Call instance retains none (`null`), since §13.5.5 compensates a Multi-Instance Activity "only once", by its body's
 * record; a completed Multi-Instance Sub-Process body retains the group of its instance records without the handler,
 * which they carry (§10.7.2: compensation "individually triggers compensation for all instances").
 */
function placement(ctx: Ctx, occurrence: Occurrence, state: State): readonly [ElementId | null, ScopeOccurrenceId] | null {
  const element = programElement(ctx.program, occurrence.element);
  const envelope = element === null ? null : elementEnvelope(element);
  // Admission admits at most one handler (`compensation.handlerCount`).
  const handler = envelope?.compensationHandlers[0] ?? null;
  const looping = (envelope?.multiInstance ?? null) !== null;
  const isScope = element !== null && elementScope(element) !== null;
  if (isInstance(ctx, occurrence, state)) {
    if (!isScope) return null;
    return [handler, state.scopes.find((scope) => scope.id === occurrence.scope)?.parent ?? occurrence.scope];
  }
  if (looping && isScope) return [null, occurrence.scope];
  return [handler, occurrence.scope];
}

/**
 * `Hooks.completed`, before the pipeline disposes of the owned scope: a completed Scope's inner records stay
 * compensable (BPMN 2.0.2 §13.5.5). A Scope with a handler keeps them as the children its handler may trigger; one
 * without keeps them as a group under `ImplicitCompensation.EverySubProcess` (I5) or as a Multi-Instance body (I9),
 * else they move to the parent. A Compensation Event Sub-Process, the handler inside its subject, and a group restore
 * the completed Scope's own variables ("snapshot data"), and for a Multi-Instance Sub-Process instance also the locals
 * of its own iteration scope occurrence whose names those lack, its item and, under `cibLocals`, its `loopCounter`
 * (§13.5.5: "for each instance the dedicated snapshot is restored"; §10.3.8 assigns both to each inner instance); a
 * boundary handler restores none (§13.5.5: it "can only perform black-box compensation"), so it reads the item live.
 */
export function completed(ctx: Ctx, occurrence: Occurrence, state: State): Outcome {
  const placed = placement(ctx, occurrence, state);
  if (placed === null) return committed(state);
  const [handler, target] = placed;
  const owned = ownedScope(ctx, occurrence, state);
  const compensation = state.slots.compensation;
  const isInner = (record: Compensable): boolean => owned !== null && owned.id === record.scope;
  const inner = compensation.retained.filter(isInner);
  const outer = compensation.retained.filter((record) => !isInner(record));
  const element = programElement(ctx.program, occurrence.element);
  const body = ((element === null ? null : elementEnvelope(element))?.multiInstance ?? null) !== null;
  const grouped = (ctx.program.options.implicitCompensation === ImplicitCompensation.EverySubProcess || body) && inner.length > 0;
  if (handler === null && !grouped) {
    return committed(store(state, { ...compensation, retained: [...outer, ...inner.map((record) => ({ ...record, scope: target }))] }));
  }
  const [issued, completion] = issue(state);
  const handlerElement = handler === null ? null : programElement(ctx.program, handler);
  const inside = handler === null || (handlerElement !== null && elementHeader(handlerElement).parent === occurrence.element);
  const locals = (scope: ScopeOccurrenceId): Compensable["snapshot"] =>
    issued.variables.find((scoped) => scoped.scope === scope)?.entries ?? [];
  const own = owned === null ? [] : locals(owned.id);
  const iteration = isInstance(ctx, occurrence, issued) ? locals(occurrence.scope) : [];
  const snapshot = !inside ? [] : [...own, ...iteration.filter(([name]) => !own.some(([held]) => held === name))];
  const reference: OccurrenceRef = {
    processInstanceId: instanceOf(issued, occurrence.scope),
    element: occurrence.element,
    activation: occurrence.activation,
  };
  const record: Compensable = { subject: occurrence.element, handler, scope: target, occurrence: reference, completion, snapshot, children: inner };
  return committed(store(issued, { ...compensation, retained: [...outer, record] }));
}

/** Every element declared inside `element`, at any depth. */
function interior(ctx: Ctx, element: Element): Element[] {
  const go = (fuel: number, ids: readonly ElementId[]): Element[] =>
    fuel === 0 ? [] : ids.flatMap((id) => {
      const inner = programElement(ctx.program, id);
      return inner === null ? [] : [inner, ...go(fuel - 1, elementScope(inner)?.[1].children ?? [])];
    });
  return go(ctx.program.elements.length, elementScope(element)?.[1].children ?? []);
}

/**
 * What `element` itself reads and writes over its whole run, over-approximated: its envelope and outgoing conditions
 * (`footprint`), what it writes when it runs (`writes`) and what its boundaries write when they fire (`catchWrites`), a
 * Multi-Instance element's output data item, every name a User Task installs under `SubmissionRule.InstallsVariables`,
 * and every name for a task kind this feature cannot inspect (none of User, Service, Call or Receive work).
 */
function ownData(ctx: Ctx, element: Element): Footprint {
  const boundaries = (elementEnvelope(element)?.boundaries ?? []).flatMap((boundary) => catchWrites(boundary.subscription));
  const item = elementEnvelope(element)?.multiInstance?.outputDataItem ?? null;
  const caught: Footprint = { reads: noNames, writes: union(writes(element), { names: [...boundaries, ...(item === null ? [] : [item])], all: false }) };
  const activity = elementActivity(element);
  let work: Footprint = { reads: noNames, writes: noNames };
  if (activity !== null) {
    const kind = activity[1].work;
    const uninspected = !(workIsUser(kind) || workIsService(kind) || workCall(kind) !== null || workReceive(kind) !== null);
    const installs = workIsUser(kind) && ctx.program.options.submission === SubmissionRule.InstallsVariables;
    work = { reads: { names: [], all: uninspected }, writes: { names: [], all: uninspected || installs } };
  }
  return joined(joined(footprint(ctx.program, element), caught), work);
}

/** What a run of `subject` reads and writes: its own and, for a Scope, its interior's. */
function data(ctx: Ctx, subject: ElementId): Footprint {
  const element = programElement(ctx.program, subject);
  return element === null ? { reads: noNames, writes: noNames }
    : [element, ...interior(ctx, element)].reduce((found, inner) => joined(found, ownData(ctx, inner)), { reads: noNames, writes: noNames });
}

/**
 * Whether a Sequence Flow path leads from one of `sources` to `target` through Gateways and intermediate Events only,
 * nodes that are no Activity and leave no record (§13.5.5 "A Sequence Flow between Activities A and B", issue #96); an
 * Activity on the path ends it, since its own record, if any, carries the order on. The walk is bounded by the element
 * count, so a cycle of such nodes ends it.
 */
function flowReaches(ctx: Ctx, sources: readonly ElementId[], target: ElementId): boolean {
  const passes = (id: ElementId): boolean => {
    const element = programElement(ctx.program, id);
    return element !== null && (elementGateway(element) !== null || elementEvent(element)?.[1].placement === Placement.Intermediate);
  };
  let frontier = sources;
  for (let fuel = ctx.program.elements.length; fuel > 0; fuel -= 1) {
    const next = ctx.program.flows.filter((flow) => frontier.includes(flow.source)).map((flow) => flow.target);
    if (next.includes(target)) return true;
    frontier = next.filter(passes);
  }
  return false;
}

/**
 * `record`'s subject ran before `other`'s in a way §13.5.5 orders, so `other`'s handler completes before `record`'s
 * starts: (b) a Sequence Flow path (`flowReaches`) leads from a boundary Event attached to `record`'s subject to
 * `other`'s, a different one, whose record may complete while the subject still runs; or `record` completed first and
 * (a) a Sequence Flow path leads from its subject to `other`'s, (c) `other`'s subject reads a name `record`'s can write
 * (`data`), or (d) both are records of one subject, run in reverse completion order.
 */
function precedes(ctx: Ctx, record: Compensable, other: Compensable): boolean {
  const subject = programElement(ctx.program, record.subject);
  const boundaries = ((subject === null ? null : elementEnvelope(subject))?.boundaries ?? []).map((boundary) => boundary.id);
  return (record.subject !== other.subject && flowReaches(ctx, boundaries, other.subject)) ||
    (record.completion < other.completion &&
      (record.subject === other.subject || flowReaches(ctx, [record.subject], other.subject) ||
        meets(data(ctx, other.subject).reads, data(ctx, record.subject).writes)));
}

function position(ctx: Ctx, element: ElementId): number {
  const index = ctx.program.elements.findIndex((candidate) => elementHeader(candidate).id === element);
  return index < 0 ? ctx.program.elements.length : index;
}

/**
 * The recursion bound of `advance`: a nested run starts at most once per element nesting level, and a run's end resumes
 * at most every run in progress.
 */
function runBound(ctx: Ctx, state: State): number {
  return 2 * (ctx.program.elements.length + state.slots.compensation.runs.length) + 2;
}

/**
 * Begin `record`'s handler in a new context scope occurrence inside `scope`, where the records of its children become
 * the ones a throw inside the handler compensates. A group (I5) runs its children instead, as a nested run of that
 * context, which resumes the run in `scope` once they all completed (`Resume.group`).
 */
function beginHandler(
  ctx: Ctx, trigger: OccurrenceRef, scope: ScopeOccurrenceId, state: State, record: Compensable, fuel: number,
): Result<readonly [State, ScopeOccurrenceId]> {
  if (fuel === 0) return failed(FailureTag.SemanticFailure, "compensation-run-depth");
  const handler = record.handler;
  if (handler === null) {
    const [entered, context] = enterScope(state, record.subject, scope, record.snapshot, null);
    const pending = record.children.map((child) => ({ ...child, scope: context }));
    const compensation = entered.slots.compensation;
    const nested: CompensationRun = {
      trigger, scope: context, pending, running: [], leave: null, resume: { tag: ResumeTag.Group, outer: scope, context },
    };
    const advanced = advance(ctx, context, store(entered, { ...compensation, runs: [...compensation.runs, nested] }), fuel - 1);
    return advanced.ok ? committed([advanced.value, context]) : advanced;
  }
  const element = programElement(ctx.program, handler);
  if (element === null) return failed(FailureTag.SemanticFailure, "compensation-handler-missing");
  if (elementActivity(element) === null && elementScope(element) === null) {
    return failed(FailureTag.SemanticFailure, "compensation-handler-not-activity");
  }
  const [entered, context] = enterScope(state, handler, scope, record.snapshot, null);
  const compensation = entered.slots.compensation;
  const children = record.children.map((child) => ({ ...child, scope: context }));
  const stored = store(entered, { ...compensation, retained: [...compensation.retained, ...children] });
  return committed([signal(stored, {
    tag: SignalTag.Begin,
    request: beginRequest({ element: handler, scope: context, continuation: { tag: ContinuationTag.Compensation, run: scope } }),
  }), context]);
}

function resumeRun(ctx: Ctx, state: State, resume: Resume | null, fuel: number): Outcome {
  if (resume === null) return committed(state);
  switch (resume.tag) {
    case ResumeTag.Complete:
      return committed(signal(state, completeSignal(resume.occurrence, resume.leave, [], WriteRule.Outward)));
    case ResumeTag.Occur:
      return committed(signal(state, {
        tag: SignalTag.Occur,
        element: resume.element,
        scope: resume.scope,
        leave: resume.leave,
        writes: [],
        rule: WriteRule.Outward,
      }));
    case ResumeTag.Group:
      return release(ctx, resume.outer, resume.context, state, fuel);
  }
  return assertNever(resume);
}

/**
 * Start every pending handler of the run in `scope` that no pending or running handler's subject succeeds; once none is
 * pending or running, end the run: cancel the occurrence it leaves, if any, then complete its `resume`.
 */
function advance(ctx: Ctx, scope: ScopeOccurrenceId, state: State, fuel: number): Outcome {
  if (fuel === 0) return failed(FailureTag.SemanticFailure, "compensation-run-depth");
  const compensation = state.slots.compensation;
  const run = compensation.runs.find((candidate) => candidate.scope === scope);
  if (run === undefined) return failed(FailureTag.SemanticFailure, "compensation-run-missing");
  const remaining = [...run.pending, ...run.running.map(([, record]) => record)];
  const isReady = (record: Compensable): boolean => !remaining.some((other) => precedes(ctx, record, other));
  const ready = run.pending.filter(isReady);
  const waiting = run.pending.filter((record) => !isReady(record));
  if (run.pending.length === 0 && run.running.length === 0) {
    const ended = store(state, { ...compensation, runs: compensation.runs.filter((candidate) => candidate.scope !== scope) });
    const left = run.leave === null ? ended : signal(ended, { tag: SignalTag.Cancel, occurrence: run.leave });
    return resumeRun(ctx, left, run.resume, fuel - 1);
  }
  // Dynamic-only: a dependency cycle needs the retained set, which depends on the run.
  if (ready.length === 0 && run.running.length === 0) return failed(FailureTag.Unsupported, "compensation-dependency-cycle");
  const ordered = mergeSort(ready, (left, right) =>
    position(ctx, left.subject) < position(ctx, right.subject) ||
    (position(ctx, left.subject) === position(ctx, right.subject) && right.completion <= left.completion));
  let current = state;
  const started: (readonly [ScopeOccurrenceId, Compensable])[] = [];
  for (const record of ordered) {
    const begun = beginHandler(ctx, run.trigger, scope, current, record, fuel - 1);
    if (!begun.ok) return begun;
    current = begun.value[0];
    started.push([begun.value[1], record]);
  }
  // A group's nested run joined the runs while its handlers began.
  const updated: CompensationRun = { ...run, pending: waiting, running: [...run.running, ...started] };
  const runs = current.slots.compensation.runs.filter((candidate) => candidate.scope !== scope);
  return committed(store(current, { ...current.slots.compensation, runs: [...runs, updated] }));
}

/** The handler or group that ran in `context` is done: the context is left and the run in `scope` starts what that releases. */
function release(ctx: Ctx, scope: ScopeOccurrenceId, context: ScopeOccurrenceId, state: State, fuel: number): Outcome {
  if (fuel === 0) return failed(FailureTag.SemanticFailure, "compensation-run-depth");
  const left = leaveScope(state, context);
  const compensation = left.slots.compensation;
  const runs = compensation.runs.map((candidate) => candidate.scope === scope
    ? { ...candidate, running: candidate.running.filter(([running]) => running !== context) }
    : candidate);
  return advance(ctx, scope, store(left, { ...compensation, runs }), fuel - 1);
}

/**
 * The scope occurrences whose records a throw in `scope` sees (I2, D15): the Activities "visible" from it, those at its
 * own level or, from a Compensation Event Sub-Process, in the Sub-Process containing it (BPMN 2.0.2 Tables 10.88 and
 * 10.89). The walk goes outward from `scope` through Event Sub-Process occurrences up to and including the first scope
 * occurrence of another kind, as CIB's does (`CompensationUtil.java:184-206`); a compensation handler's context ends
 * it, included, since `beginHandler` moved the records of the handler's subject there.
 */
function visibleScopes(ctx: Ctx, state: State, scope: ScopeOccurrenceId): ScopeOccurrenceId[] {
  const go = (fuel: number, id: ScopeOccurrenceId): ScopeOccurrenceId[] => {
    if (fuel === 0) return [];
    const entry = state.scopes.find((candidate) => candidate.id === id) ?? null;
    const element = entry?.element == null ? null : programElement(ctx.program, entry.element);
    const payload = element === null ? null : elementScope(element);
    const eventSubProcess = payload !== null && ctx.eventStart(payload[1]) !== null;
    const parent = entry?.parent ?? null;
    if (parent === null) return [id];
    return ctx.scopeRole(state, id) !== ScopeRole.CompensationHandler && eventSubProcess ? [id, ...go(fuel - 1, parent)] : [id];
  };
  return go(state.scopes.length + 1, scope);
}

/**
 * `Signal.compensate`: take into a new run in `scope` every record the throw sees (`visibleScopes`), or only
 * `activity`'s when one is named (I3). Dynamic-only refusal: a trigger while a run is in progress in a scope occurrence
 * it covers, since its relation to the running one is not selected (COMPH-EXCLUSIVE-01 of the trigger account).
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
  const covered = visibleScopes(ctx, state, scope);
  const selects = (record: Compensable): boolean => covered.includes(record.scope) && (activity === null || activity === record.subject);
  const selected = compensation.retained.filter(selects);
  const kept = compensation.retained.filter((record) => !selects(record));
  if (compensation.runs.some((run) => covered.includes(run.scope))) {
    return failed(FailureTag.Unsupported, "compensation-concurrent-trigger"); // dynamic-only: whether a run is in progress
  }
  return advance(ctx, scope, store(state, {
    retained: kept,
    runs: [...compensation.runs, { trigger, scope, pending: selected, running: [], leave, resume }],
  }), runBound(ctx, state));
}

/** `Hooks.handlerCompleted`: the handler's context is left and the run starts what that releases. */
export function handlerCompleted(ctx: Ctx, run: ScopeOccurrenceId, occurrence: Occurrence, state: State): Outcome {
  return release(ctx, run, occurrence.scope, state, runBound(ctx, state));
}

/**
 * The runs in `scope` and inside it go at once, when a catcher that interrupts `scope` has decided
 * (`PropagationHooks.dropRuns`): its interruption is still queued, and a run it would remove must begin no handler before
 * then.
 */
export function dropWithin(_ctx: Ctx, scope: ScopeOccurrenceId, state: State): State {
  const inside = subtree(state, scope);
  const compensation = state.slots.compensation;
  return store(state, { ...compensation, runs: compensation.runs.filter((run) => !inside.includes(run.scope)) });
}

/**
 * `Hooks.handlerEnded`: a handler left without completing, raised away by an event. Under `PropagatesFromTrigger` (I11)
 * the run goes on as `handlerCompleted` does unless the catcher interrupts a scope occurrence holding it, which drops the
 * run when the catch is decided (`dropWithin`), before the handler's leave arrives here; with no catcher, or one that
 * does not interrupt, the run goes on. Under `FailsInstance` the failure that follows ends the instance, so nothing
 * changes.
 */
export function handlerEnded(ctx: Ctx, run: ScopeOccurrenceId, occurrence: Occurrence, state: State): Outcome {
  const failure = ctx.program.options.compensationHandlerFailure;
  switch (failure.tag) {
    case CompensationHandlerFailureTag.PropagatesFromTrigger:
      return state.slots.compensation.runs.some((candidate) => candidate.scope === run)
        ? handlerCompleted(ctx, run, occurrence, state)
        : committed(state);
    case CompensationHandlerFailureTag.FailsInstance:
    case CompensationHandlerFailureTag.Selected:
      return committed(state);
  }
  return assertNever(failure);
}

/**
 * `Signal.compensationFailed`: an Error raised at `origin`, an effect's reported Error or an Error End Event inside a
 * handler Sub-Process, left the handler context `handler` uncaught (COMPH-FAIL-01). The handler's public occurrence is
 * the raising Activity itself or, for a Sub-Process handler, its occurrence in that context.
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

/**
 * Propagation: the catchers a level of the search offers, transcribed from `Kernel/Feature/Propagation/Candidates.lean`.
 *
 * What `feature/propagation.ts`'s search for a catcher offers at each of its levels, and the refusals that rest on where
 * a raise runs: the catcher with the lowest precedence among a level's candidates (`best`); the boundaries on an
 * element; the Event Sub-Processes of a scope occurrence, which a raise passes when it originates inside them
 * (`handlerCandidates`) and which a search reaching the scope occurrence holding a compensated subject's record offers
 * whole (`jumpCandidates`); and what a compensation handler's context offers of its completed subject
 * (`contextCatcher`). Everything here reads the program and the state and changes nothing; where the search decides and
 * what a catch does is the search's.
 */
import {
  assertNever,
  elementEnvelope,
  elementScope,
  programChildren,
  programElement,
  type Boundary,
  type Element,
  type ElementId,
  type Subscription,
  type Trigger,
} from "../../il/types.js";
import {
  FailureTag,
  RaisedTag,
  calledRoot,
  childrenOf,
  failed,
  raisedIsCancel,
  type Binding,
  type Compensable,
  type Origin,
  type Raised,
  type Result,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
} from "../../state.js";
import { type Ctx } from "../../hooks.js";

/** The catcher with the lowest precedence among `candidates`, the first in document order on a tie, with what it writes. */
export function best<T>(ctx: Ctx, raised: Raised, trigger: (candidate: T) => Trigger, candidates: readonly T[]): readonly [T, readonly Binding[]] | null {
  let chosen: readonly [number, readonly Binding[], T] | null = null;
  for (const candidate of candidates) {
    const caught = ctx.catches(raised, trigger(candidate));
    if (caught === null) continue;
    if (chosen === null || caught.rank < chosen[0]) chosen = [caught.rank, caught.writes, candidate];
  }
  return chosen === null ? null : [chosen[2], chosen[1]];
}

export function boundariesOf(ctx: Ctx, element: ElementId): readonly Boundary[] {
  const found = programElement(ctx.program, element);
  return (found === null ? null : elementEnvelope(found))?.boundaries ?? [];
}

type Handler = readonly [ElementId, Subscription, boolean];

/** The Event Sub-Processes among `children`, each with its start and whether it interrupts. */
function startsOf(ctx: Ctx, children: readonly Element[]): readonly Handler[] {
  return children.flatMap((child) => {
    const scope = elementScope(child);
    const start = scope === null ? null : ctx.eventStart(scope[1]);
    return scope === null || start === null ? [] : [[scope[0].id, start[0], start[1]] as const];
  });
}

/**
 * The Event Sub-Processes declared directly in `occurrence`, the process included, each with its start and whether it
 * interrupts; a called root's are its called process's (`childrenOf`).
 */
function eventSubProcesses(ctx: Ctx, state: State, occurrence: ScopeOccurrence): readonly Handler[] {
  return startsOf(ctx, childrenOf(state, ctx.program, occurrence.id));
}

/** Whether `inner` is `outer` or declared inside it at any depth of the model; the fuel bounds the walk by the number of elements. */
function within(ctx: Ctx, outer: ElementId, inner: ElementId): boolean {
  let current: ElementId | null = inner;
  for (let fuel = ctx.program.elements.length + 1; fuel > 0 && current !== null; fuel -= 1) {
    if (current === outer) return true;
    current = programElement(ctx.program, current)?.header.parent ?? null;
  }
  return false;
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
 * Whether `occurrence` only wraps `held`, the scope occurrence directly inside it on the raise's chain, of its own
 * element: a Multi-Instance body's scope occurrence around an instance's, an instance's around the Sub-Process
 * instance's, or a compensation handler's context around the handler Sub-Process's. Its element's Event Sub-Processes
 * belong to the innermost one, the Sub-Process instance, whose `enter` armed them and where the search offered them, or
 * passed the one the raise runs in, already: BPMN 2.0.2 §10.3.5 gives each Sub-Process instance its Event
 * Sub-Processes, and CIB's finders visit each flow scope once, the Multi-Instance body `#multiInstanceBody` declaring
 * none (#158). A called root wraps nothing: its Event Sub-Processes are its called process's, and a recursive Call's
 * root holds a root of the same Call.
 */
function wrapsOwnScope(state: State, occurrence: ScopeOccurrence, held: ScopeOccurrence | null): boolean {
  return held !== null && held.element === occurrence.element && !calledRoot(state, occurrence.id);
}

/**
 * The Event Sub-Processes of `occurrence` that may catch a raise from `origin` (PC-ERROR-02). One the raise originates
 * inside is no candidate, so a rethrow passes the handler that runs it, or that an interrupting handler's completion is
 * disposing of, to the host's boundaries and outward (BPMN 2.0.2 §13.5.4: "control passes to the boundary Event";
 * CIB-INT-0022). Refused under every profile, dynamic-only because they rest on what a running handler raises: an
 * Escalation from deeper inside a handler that matches it (`escalation-rethrow-reenters-handler`), which CIB catches
 * with that handler again; and a raise from an interrupting handler that another Event Sub-Process of the same scope
 * would catch (`rethrow-caught-by-sibling-handler`), which CIB starts (CIB-DEV-0003). Both are restrictions of the
 * `bpmn-2.0.2` meaning, never that meaning: §13.5.4 passes the running handler at any depth and starts no new handler
 * while the parent is Failing or Terminating, so both raises would go on outward. A scope occurrence that only wraps one
 * of its own element offers none (`wrapsOwnScope`).
 */
function handlerCandidates(ctx: Ctx, raised: Raised, origin: Origin, state: State, occurrence: ScopeOccurrence): Result<readonly Handler[]> {
  const held = heldOnChain(state, occurrence.id, origin.scope);
  if (wrapsOwnScope(state, occurrence, held)) return { ok: true, value: [] };
  const handlers = eventSubProcesses(ctx, state, occurrence);
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

/**
 * What a compensation handler's context offers a raise under `propagatesFromHandler` (#159), as the Event Sub-Processes
 * and the boundaries of `record`'s completed subject, whose place the context stands for: the subject's catchers only
 * when the subject encloses `raising`, the handler the raise runs in, in the model, as CIB's search walks the handler's
 * model flow scopes (`tree/ActivityExecutionHierarchyWalker.java:44-73`); its Event Sub-Processes but one holding that
 * handler, unless the record is a Multi-Instance body's, and its boundaries, unless it is a Multi-Instance instance's,
 * whose boundaries belong to the body (`BpmnParse.java:3290-3295`). An instance's record is retained in a scope
 * occurrence of its own subject, the body's or its group's context.
 */
function contextCandidates(ctx: Ctx, state: State, record: Compensable, raising: ElementId | null):
  readonly [readonly Handler[], readonly Boundary[]] {
  const encloses = raising !== null && within(ctx, record.subject, raising);
  const subject = programElement(ctx.program, record.subject);
  const looping = ((subject === null ? null : elementEnvelope(subject))?.multiInstance ?? null) !== null;
  const perInstance = state.scopes.find((scope) => scope.id === record.scope)?.element === record.subject;
  const handlers = encloses && (!looping || perInstance)
    ? startsOf(ctx, programChildren(ctx.program, record.subject))
      .filter(([element]) => !(raising !== null && within(ctx, element, raising)))
    : [];
  return [handlers, encloses && (!looping || !perInstance) ? boundariesOf(ctx, record.subject) : []];
}

/**
 * The catcher a compensation handler's context offers (`contextCandidates`) that fires. A catcher there has no chosen
 * meaning yet, so these are refused, dynamic-only, as they rest on what a running handler raises: an Event Sub-Process
 * that catches, which would start into a completed subject; a boundary that interrupts, or catches a Cancel, which
 * interrupts whatever the boundary declares (`leaveOccurrence`); a boundary's catch variables (CIB-EXT-0028); and a
 * boundary whose flows would leave into a scope occurrence that does not declare the subject. What is left is a
 * non-interrupting boundary, which the search fires (`contextFires`).
 */
export function contextCatcher(ctx: Ctx, raised: Raised, state: State, record: Compensable, raising: ElementId | null): Result<Boundary | null> {
  const [handlers, attached] = contextCandidates(ctx, state, record, raising);
  if (best(ctx, raised, ([, subscription]) => subscription.trigger, handlers) !== null) {
    return failed(FailureTag.Unsupported, "compensation-context-event-subprocess"); // dynamic-only: what a running handler raises
  }
  const caught = best(ctx, raised, (boundary) => boundary.subscription.trigger, attached);
  if (caught === null) return { ok: true, value: null };
  const [boundary, writes] = caught;
  if (boundary.interrupting || raisedIsCancel(raised)) {
    return failed(FailureTag.Unsupported, "compensation-context-interrupting-boundary"); // dynamic-only: what a running handler raises
  }
  if (writes.length > 0) {
    return failed(FailureTag.Unsupported, "compensation-context-catch-variables"); // dynamic-only: what a running handler raises
  }
  if (!(state.scopes.some((scope) => scope.id === record.scope) &&
    childrenOf(state, ctx.program, record.scope).some((child) => child.header.id === record.subject))) {
    return failed(FailureTag.Unsupported, "compensation-context-boundary-unplaced"); // dynamic-only: where the record was retained
  }
  return { ok: true, value: boundary };
}

/**
 * The Event Sub-Processes of `occurrence`, the scope occurrence holding a compensated subject's record, that a search
 * reaching it from the handler's context offers: all of them, since the chain it came along is not the handler's, and
 * CIB passes only the thrower's own model flow scope (`EscalationEventDefinitionFinder.java:58-61`). Refused,
 * dynamic-only, when an interrupting one of them runs and one of them would catch: a parent that is Terminating starts no
 * Event Sub-Process (BPMN 2.0.2 §13.5.4), where CIB starts it (CIB-DEV-0003), as `handlerCandidates` refuses a sibling
 * of a running interrupting handler.
 */
function jumpCandidates(ctx: Ctx, raised: Raised, state: State, occurrence: ScopeOccurrence): Result<readonly Handler[]> {
  const handlers = eventSubProcesses(ctx, state, occurrence);
  const interrupted = handlers.some(([element, , interrupting]) =>
    interrupting && state.scopes.some((entry) => entry.parent === occurrence.id && entry.element === element));
  if (interrupted && best(ctx, raised, ([, subscription]) => subscription.trigger, handlers) !== null) {
    return failed(FailureTag.Unsupported, "compensation-raise-in-interrupted-scope"); // dynamic-only: what a running handler raises
  }
  return { ok: true, value: handlers };
}

/**
 * The Event Sub-Processes an ordinary scope occurrence offers: `jumpCandidates` when the search reached it from a
 * compensation handler's context (`jumped`), else `handlerCandidates`.
 */
export function levelCandidates(ctx: Ctx, raised: Raised, origin: Origin, state: State, occurrence: ScopeOccurrence,
  jumped: boolean): Result<readonly Handler[]> {
  return jumped ? jumpCandidates(ctx, raised, state, occurrence) : handlerCandidates(ctx, raised, origin, state, occurrence);
}

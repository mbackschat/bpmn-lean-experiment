/**
 * Scopes: Sub-Processes, Transactions and Event Sub-Processes, transcribed from `Kernel/Feature/Scopes.lean`.
 *
 * Owns matching on `ScopeKind`. Entering a Scope activates its element, evaluates its input mappings against the
 * variables visible from the parent occurrence and makes them the new occurrence's local variables, arms the Scope's
 * boundaries and Event Sub-Process starts, and emits the outgoing flows of its start Event inside the occurrence. A
 * re-entered Scope is a fresh occurrence with a fresh activation and freshly evaluated locals.
 *
 * Completing a Scope evaluates its output mappings against the variables visible inside the occurrence, leaves the
 * occurrence with everything in it, disarms its boundaries, writes the outputs from the parent outward and emits the
 * Scope's outgoing flows in the parent; a Scope with a compensation handler signals `completed` with the variables
 * visible inside it as the snapshot its handler restores. A Transaction that completes normally completes like an
 * embedded Sub-Process; its cancellation belongs to `feature/propagation.ts` and `feature/compensation.ts`.
 */
import { ctxEvaluateMappings, type Arrival, type Ctx } from "../hooks.js";
import {
  ScopeKindTag,
  assertNever,
  type Element,
  type ElementId,
  type Header,
  type ScopePayload,
  type StartPayload,
  type Subscription,
} from "../il/types.js";
import {
  elementActivity,
  elementEnvelope,
  elementIncoming,
  elementScope,
  elementStart,
  programChildren,
  programElement,
} from "../il/query.js";
import {
  FailureTag,
  SignalTag,
  clearInside,
  committed,
  disarm,
  emit,
  enterScope,
  failed,
  leaveScope,
  signal,
  visible,
  writeOutward,
  type Binding,
  type Outcome,
  type Result,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
} from "../state.js";

/** `Ctx.eventStart`: the start subscription and interrupting flag of an Event Sub-Process. */
export function eventStart(payload: ScopePayload): readonly [Subscription, boolean] | null {
  const kind = payload.kind;
  switch (kind.tag) {
    case ScopeKindTag.EventSubProcess:
      return [kind.start, kind.interrupting];
    case ScopeKindTag.Embedded:
      return null;
    case ScopeKindTag.Transaction:
      return null;
  }
  return assertNever(kind);
}

/**
 * The start Event whose outgoing flows begin an occurrence of `scope`: the triggered start of an Event Sub-Process,
 * the none start of any other Scope.
 */
export function innerStart(ctx: Ctx, scope: ElementId, payload: ScopePayload): StartPayload | null {
  const starts = programChildren(ctx.program, scope).flatMap((child) => {
    const start = elementStart(child);
    return start === null ? [] : [start[1]];
  });
  const kind = payload.kind;
  switch (kind.tag) {
    case ScopeKindTag.EventSubProcess:
      return starts.find((start) => start.subscription !== null) ?? null;
    case ScopeKindTag.Embedded:
      return starts.find((start) => start.subscription === null) ?? null;
    case ScopeKindTag.Transaction:
      return starts.find((start) => start.subscription === null) ?? null;
  }
  return assertNever(kind);
}

/**
 * The children that begin when a Scope without a start Event is entered: every Activity without incoming Sequence
 * Flow (BPMN 2.0.2 §13.3.4), except a compensation handler, which is outside normal flow (§13.5.5), and an Event
 * Sub-Process. A Gateway or Event without incoming flow, which §13.3.4 would also begin, is refused.
 */
export function implicitStart(ctx: Ctx, scope: ElementId): Result<readonly ElementId[]> {
  const handler = (id: ElementId): boolean =>
    ctx.program.elements.some((element) => (elementEnvelope(element)?.compensationHandler ?? null) === id);
  const eventSubProcess = (element: Element): boolean => {
    const found = elementScope(element);
    return found !== null && eventStart(found[1]) !== null;
  };
  const begun: ElementId[] = [];
  for (const child of programChildren(ctx.program, scope)) {
    const id = child.header.id;
    if (elementIncoming(child).length !== 0 || elementStart(child) !== null || handler(id) || eventSubProcess(child)) {
      continue;
    }
    if (elementActivity(child) === null) {
      return failed(FailureTag.Unsupported, "scope-implicit-start");
    }
    begun.push(id);
  }
  return committed(begun);
}

export function enter(
  ctx: Ctx,
  header: Header,
  payload: ScopePayload,
  parent: ScopeOccurrenceId,
  extra: readonly Binding[],
  state: State,
): Outcome {
  const locals = ctxEvaluateMappings(ctx, visible(state, parent), payload.envelope.inputs);
  if (!locals.ok) {
    return locals;
  }
  const [entered, occurrence] = enterScope(state, header.id, parent, [...locals.value, ...extra]);
  const armed =
    payload.envelope.boundaries.length === 0
      ? entered
      : signal(entered, { tag: SignalTag.Arm, host: occurrence, element: header.id, scope: parent });
  const scoped = signal(armed, { tag: SignalTag.ArmScope, scope: occurrence });
  const start = innerStart(ctx, header.id, payload);
  if (start !== null) {
    return committed(emit(scoped, start.outgoing, occurrence));
  }
  const begun = implicitStart(ctx, header.id);
  if (!begun.ok) {
    return begun;
  }
  if (begun.value.length === 0) {
    return failed(FailureTag.SemanticFailure, "scope-without-start-event");
  }
  return committed(
    begun.value.reduce(
      (current, element) => signal(current, { tag: SignalTag.StartActivity, element, scope: occurrence }),
      scoped,
    ),
  );
}

export function arriveScope(ctx: Ctx, header: Header, payload: ScopePayload, arrival: Arrival, state: State): Outcome {
  if (payload.envelope.multiInstance !== null) {
    return failed(FailureTag.Unsupported, "scope-multi-instance");
  }
  const kind = payload.kind;
  switch (kind.tag) {
    case ScopeKindTag.Embedded:
      return enter(ctx, header, payload, arrival.scope, [], state);
    case ScopeKindTag.Transaction:
      return enter(ctx, header, payload, arrival.scope, [], state);
    case ScopeKindTag.EventSubProcess:
      return failed(FailureTag.SemanticFailure, "flow-into-event-subprocess");
  }
  return assertNever(kind);
}

/**
 * The Activities completed in a Sub-Process stay compensable after it completes: its handler "can recursively
 * trigger compensation" for them, and a global throw compensates every completed Activity (BPMN 2.0.2 §13.5.5).
 * Neither is implemented, so a Scope that completes while it retains a compensation record is refused.
 */
export function completeScope(
  ctx: Ctx,
  header: Header,
  payload: ScopePayload,
  occurrence: ScopeOccurrence,
  state: State,
): Outcome {
  const parent = occurrence.parent;
  if (parent === null) {
    return failed(FailureTag.SemanticFailure, "scope-occurrence-without-parent");
  }
  if (state.slots.compensation.retained.some((record) => record.scope === occurrence.id)) {
    return failed(FailureTag.Unsupported, "compensation-retained-at-scope-completion");
  }
  const outputs = ctxEvaluateMappings(ctx, visible(state, occurrence.id), payload.envelope.outputs);
  if (!outputs.ok) {
    return outputs;
  }
  const snapshot = visible(state, occurrence.id);
  const left = disarm(leaveScope(state, occurrence.id), occurrence.id);
  const written = outputs.value.reduce((current, binding) => writeOutward(current, parent, binding), left);
  const emitted = emit(written, payload.envelope.outgoing, parent);
  return committed(
    payload.envelope.compensationHandler !== null
      ? signal(emitted, { tag: SignalTag.Completed, element: header.id, scope: parent, snapshot })
      : emitted,
  );
}

/**
 * `Signal.startEventSubProcess`. An interrupting Event Sub-Process first clears its parent occurrence, its other
 * Event Sub-Process starts included (BPMN 2.0.2 §13.5.4); the parent's own boundaries stay armed in the grandparent
 * until the parent completes.
 */
export function startEventSubProcess(
  ctx: Ctx,
  element: ElementId,
  parent: ScopeOccurrenceId,
  variables: readonly Binding[],
  state: State,
): Outcome {
  const found = programElement(ctx.program, element);
  const scope = found === null ? null : elementScope(found);
  if (scope === null) {
    return failed(FailureTag.SemanticFailure, "event-subprocess-without-scope");
  }
  const [header, payload] = scope;
  const kind = payload.kind;
  switch (kind.tag) {
    case ScopeKindTag.EventSubProcess:
      return enter(ctx, header, payload, parent, variables, kind.interrupting ? clearInside(state, parent) : state);
    case ScopeKindTag.Embedded:
      return failed(FailureTag.SemanticFailure, "event-subprocess-not-event-subprocess");
    case ScopeKindTag.Transaction:
      return failed(FailureTag.SemanticFailure, "event-subprocess-not-event-subprocess");
  }
  return assertNever(kind);
}

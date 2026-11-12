/**
 * Scopes: Sub-Processes, Transactions and Event Sub-Processes, transcribed from `Kernel/Feature/Scopes.lean`.
 *
 * Owns matching on `ScopeKind`. Entering a Scope evaluates its input mappings against the variables visible from the
 * parent occurrence and makes them the new occurrence's local variables, arms the Scope's boundaries and Event
 * Sub-Process starts, and begins its start Event inside the occurrence. A re-entered Scope is a fresh occurrence with a
 * fresh activation and freshly evaluated locals.
 *
 * An idle Scope evaluates its output mappings against the variables visible inside the occurrence and completes through
 * the pipeline, which leaves the occurrence, writes the outputs from the parent outward and takes the Scope's outgoing
 * flows. A Transaction that completes normally completes like an embedded Sub-Process; its cancellation belongs to
 * `feature/propagation.ts` and `feature/compensation.ts`.
 */
import {
  ScopeKindTag,
  assertNever,
  elementActivity,
  elementBeginsImplicitly,
  elementHeader,
  elementScope,
  elementStart,
  programChildren,
  type ElementId,
  type Header,
  type ScopePayload,
  type Subscription,
} from "../il/types.js";
import {
  FailureTag,
  SignalTag,
  WriteRule,
  beginRequest,
  committed,
  completeSignal,
  enterScope,
  failed,
  leaveOutgoing,
  signal,
  visible,
  type Occurrence,
  type Outcome,
  type Result,
  type ScopeOccurrence,
  type State,
} from "../state.js";
import {
  clearInside, ctxOutputReads, ctxRequireMappings, ctxRequireMappingsWith, evalContext, ownVariables, type Ctx,
  type ScopeEntry,
} from "../hooks.js";

/** `Ctx.eventStart`: the start subscription and interrupting flag of an Event Sub-Process. */
export function eventStart(payload: ScopePayload): readonly [Subscription, boolean] | null {
  const kind = payload.kind;
  switch (kind.tag) {
    case ScopeKindTag.EventSubProcess:
      return [kind.start, kind.interrupting];
    case ScopeKindTag.Embedded:
    case ScopeKindTag.Transaction:
      return null;
  }
  return assertNever(kind);
}

/**
 * The start Event that begins an occurrence of `scope`: the triggered start of an Event Sub-Process, the none start of
 * any other Scope.
 */
function innerStart(ctx: Ctx, scope: ElementId, payload: ScopePayload): ElementId | null {
  const starts = programChildren(ctx.program, scope).flatMap((child) => {
    const start = elementStart(child);
    return start === null ? [] : [start];
  });
  const kind = payload.kind;
  switch (kind.tag) {
    case ScopeKindTag.EventSubProcess:
      return starts.find(([, start]) => start.subscription !== null)?.[0].id ?? null;
    case ScopeKindTag.Embedded:
    case ScopeKindTag.Transaction:
      return starts.find(([, start]) => start.subscription === null)?.[0].id ?? null;
  }
  return assertNever(kind);
}

/**
 * The children that begin when a Scope without a start Event is entered (`elementBeginsImplicitly`). A Gateway or Event
 * among them is refused (`scope.implicitStart` at admission).
 */
function implicitStart(ctx: Ctx, scope: ElementId): Result<readonly ElementId[]> {
  const begun: ElementId[] = [];
  for (const child of programChildren(ctx.program, scope)) {
    if (!elementBeginsImplicitly(child)) continue;
    if (elementActivity(child) === null && elementScope(child) === null) return failed(FailureTag.Unsupported, "scope-implicit-start");
    begun.push(elementHeader(child).id);
  }
  return committed(begun);
}

function enter(ctx: Ctx, header: Header, payload: ScopePayload, occurrence: Occurrence, entry: ScopeEntry, state: State): Outcome {
  const locals = ctxRequireMappings(ctx, evalContext(state, ctx.program, occurrence.scope), payload.envelope.inputs);
  if (!locals.ok) return locals;
  const [entered, scope] = enterScope(state, header.id, occurrence.scope, [...locals.value, ...entry.locals], occurrence.id);
  const armed = payload.envelope.boundaries.length === 0 || payload.envelope.multiInstance !== null
    ? entered
    : signal(entered, { tag: SignalTag.Arm, host: occurrence.id, element: header.id, scope: occurrence.scope });
  const scoped = signal(armed, { tag: SignalTag.ArmScope, scope });
  const start = innerStart(ctx, header.id, payload);
  if (start !== null) {
    return committed(signal(scoped, { tag: SignalTag.Begin, request: beginRequest({ element: start, scope, reserved: entry.inner }) }));
  }
  const begun = implicitStart(ctx, header.id);
  if (!begun.ok) return begun;
  if (begun.value.length === 0) return failed(FailureTag.SemanticFailure, "scope-without-start-event");
  return committed(begun.value.reduce(
    (current, element) => signal(current, { tag: SignalTag.Begin, request: beginRequest({ element, scope }) }), scoped));
}

/**
 * A Scope's occurrence began. An interrupting Event Sub-Process first clears its parent occurrence, its other Event
 * Sub-Process starts included (BPMN 2.0.2 §13.5.4), keeping its own occurrence and its start Event's reservation; the
 * parent's own boundaries stay armed in the grandparent until the parent completes.
 */
export function arriveScope(ctx: Ctx, header: Header, payload: ScopePayload, occurrence: Occurrence, entry: ScopeEntry, state: State): Outcome {
  const kind = payload.kind;
  switch (kind.tag) {
    case ScopeKindTag.Embedded:
    case ScopeKindTag.Transaction:
      return enter(ctx, header, payload, occurrence, entry, state);
    case ScopeKindTag.EventSubProcess: {
      if (occurrence.incoming !== null) return failed(FailureTag.SemanticFailure, "flow-into-event-subprocess");
      const keep = entry.inner === null ? [occurrence.id] : [occurrence.id, entry.inner];
      const cleared = kind.interrupting ? clearInside(state, occurrence.scope, keep) : state;
      return enter(ctx, header, payload, occurrence, entry, cleared);
    }
  }
  return assertNever(kind);
}

/** An idle Scope's outputs read its own variables, then the parent's chain they are written into (`ctxOutputReads`). */
export function completeScope(
  ctx: Ctx,
  _header: Header,
  payload: ScopePayload,
  scope: ScopeOccurrence,
  owner: Occurrence,
  state: State,
): Outcome {
  const outer = scope.parent === null ? [] : visible(state, ctx.program, scope.parent);
  const reads = ctxOutputReads(ctx, state.logicalTimeMs, ownVariables(state, scope.id), [], outer);
  const outputs = ctxRequireMappingsWith(ctx, reads, payload.envelope.outputs);
  if (!outputs.ok) return outputs;
  return committed(signal(state, completeSignal(owner.id, leaveOutgoing, outputs.value, WriteRule.Outward)));
}

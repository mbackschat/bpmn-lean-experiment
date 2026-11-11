/**
 * Flow: starts, gateways and Links, transcribed from `Kernel/Feature/Flow.lean`.
 *
 * Owns matching on `GatewayKind` and `Leave`, and is the only module that adds flow tokens (guard 17): every
 * occurrence leaves through `outflow`. Gateway semantics follow BPMN 2.0.2 §13.4:
 *
 * - Exclusive (§13.4.2): the first true candidate in document order, else the default.
 * - Parallel (§13.4.1): a gateway with more than one incoming flow waits until every incoming flow holds a token in the
 *   same scope occurrence, consumes one token from each and emits on every outgoing flow.
 * - Inclusive (§13.4.3): a join fires once at least one incoming flow holds a token and no token still upstream in the
 *   same scope occurrence can reach an incoming flow that holds none; it consumes one token from each filled flow. A
 *   split takes every true candidate, else the default.
 * - Event-Based (§13.4.4): the gateway's occurrence stays open and `Hooks.armGateway` opens the arms; the arm that
 *   fires completes it.
 *
 * Each token that reaches a join is its own occurrence, parked in `state.slots.parked` until the join fires; then every
 * consumed occurrence completes, one with the outgoing flows and the others with none, since a join ends one activity
 * instance per joined execution (CIB `ParallelGatewayActivityBehavior`, `PvmExecutionImpl.leaveActivityViaTransitions`).
 * An element's own selection (`ownFlows`) is an inclusive choice over its outgoing flows, which only an Activity's or a
 * Scope's may condition. A diverging gateway or an Activity that finds no outgoing flow rolls the command back.
 *
 * A parked Inclusive join also fires when no token arrives at it: Table 13.3 activates it by the state, and `settle`
 * offers the parked joins again once the closure is otherwise quiescent (`reoffer` in `step.ts`).
 */
import {
  BranchSchedule,
  ConditionOrder,
  GatewayKindTag,
  InclusiveJoinReach,
  ValueTag,
  assertNever,
  elementEnvelope,
  elementEvent,
  elementOutgoing,
  eventPayloadLinkCatch,
  eventPayloadLinkThrow,
  programChildren,
  programElement,
  programFlow,
  programTarget,
  type Element,
  type ElementId,
  type EventPayload,
  type FlowId,
  type GatewayPayload,
  type Header,
  type Program,
} from "../il/types.js";
import {
  FailureTag,
  LeaveTag,
  SignalTag,
  WriteRule,
  committed,
  completeSignal,
  emit,
  failed,
  failedWith,
  leaveFlows,
  leaveOutgoing,
  parkedEquals,
  signal,
  tokenArrivalFlow,
  type EvalContext,
  type Leave,
  type Occurrence,
  type Outcome,
  type Parked,
  type Result,
  type ScopeOccurrenceId,
  type State,
} from "../state.js";
import { EvaluationTag, evalContext, type Ctx } from "../hooks.js";

function signalComplete(state: State, id: number, leave: Leave): State {
  return signal(state, completeSignal(id, leave, [], WriteRule.Outward));
}

/**
 * A candidate's condition, read from its Sequence Flow; an unconditioned candidate holds. A failing or non-Boolean
 * condition rolls the command back, as CIB's `UelExpressionCondition` does (CIB-OP-0004); Simple Boolean never fails.
 */
function condition(ctx: Ctx, context: EvalContext, candidate: FlowId): Result<boolean> {
  const flow = programFlow(ctx.program, candidate);
  if (flow === null) return failed(FailureTag.SemanticFailure, "gateway-candidate-without-flow");
  if (flow.condition === null) return committed(true);
  const evaluation = ctx.evaluate(context, flow.condition);
  switch (evaluation.tag) {
    case EvaluationTag.Value:
      return evaluation.result.tag === ValueTag.Bool
        ? committed(evaluation.result.value)
        : failed(FailureTag.RolledBack, "condition-not-boolean");
    case EvaluationTag.Failure:
      return failed(FailureTag.RolledBack, evaluation.code);
    case EvaluationTag.Unsupported:
      return failed(FailureTag.Unsupported, evaluation.code);
  }
  return assertNever(evaluation);
}

/** The candidates whose condition holds, in order; the first failure stops the filter. */
function holding(ctx: Ctx, context: EvalContext, candidates: readonly FlowId[], firstOnly: boolean): Result<readonly FlowId[]> {
  const chosen: FlowId[] = [];
  for (const candidate of candidates) {
    const held = condition(ctx, context, candidate);
    if (!held.ok) return failedWith(held.failure);
    if (held.value) {
      chosen.push(candidate);
      if (firstOnly) break;
    }
  }
  return committed(chosen);
}

/**
 * The flows an inclusive choice takes: every candidate whose condition holds, else the default; with neither the command
 * rolls back with `noFlow`. A choice without candidates takes all of `outgoing`, which are unconditioned.
 */
function inclusiveChoice(
  ctx: Ctx,
  context: EvalContext,
  candidates: readonly FlowId[],
  fallback: FlowId | null,
  outgoing: readonly FlowId[],
  noFlow: string,
): Result<readonly FlowId[]> {
  if (candidates.length === 0) return committed(outgoing);
  const chosen = holding(ctx, context, candidates, false);
  if (!chosen.ok || chosen.value.length > 0) return chosen;
  return fallback === null ? failed(FailureTag.RolledBack, noFlow) : committed([fallback]);
}

/**
 * The flows an element's own selection takes. Several outgoing flows of an Activity form a parallel split, conditioned
 * ones an inclusive split, and a mix of both (BPMN 2.0.2 §13.3.1, Figure 13.1): every flow whose condition holds or that
 * has none, the default only when no other flow is taken (§10.3.1 `default`), and, when it takes none, Table 13.3's
 * exception, read as a rollback (CIB-INT-0012; CIB `BpmnActivityBehavior#performOutgoingBehavior`). Admission puts
 * conditions and a default only on Activities' and Scopes' flows, so every other element takes all its flows.
 */
function ownFlows(ctx: Ctx, element: Element, context: EvalContext): Result<readonly FlowId[]> {
  const fallback = elementEnvelope(element)?.defaultFlow ?? null;
  const outgoing = elementOutgoing(element);
  return inclusiveChoice(ctx, context, outgoing.filter((flow) => flow !== fallback), fallback, outgoing, "activity-no-outgoing-flow");
}

/**
 * The order a split's tokens are queued in. `Step.settle` takes the newest token first under
 * `BranchSchedule.declarationDepthFirst`, so the flows are queued reversed and the first-declared branch runs first, each
 * to its next wait, join or end, as CIB reverses its outgoing executions for a LIFO queue (CIB-OP-0016).
 */
function queued(ctx: Ctx, flows: readonly FlowId[]): readonly FlowId[] {
  switch (ctx.program.options.branchSchedule) {
    case BranchSchedule.OrderInvariant:
      return flows;
    case BranchSchedule.DeclarationDepthFirst:
      return [...flows].reverse();
  }
  return assertNever(ctx.program.options.branchSchedule);
}

/**
 * `Hooks.outflow`: the only place flow tokens are added. An element's own selection is `ownFlows`, read after the
 * completion's writes.
 */
export function outflow(ctx: Ctx, occurrence: Occurrence, leave: Leave, state: State): Outcome {
  switch (leave.tag) {
    case LeaveTag.Flows:
      return committed(emit(state, queued(ctx, leave.selected), occurrence.scope));
    case LeaveTag.Outgoing: {
      const element = programElement(ctx.program, occurrence.element);
      if (element === null) return failed(FailureTag.SemanticFailure, "outflow-without-element");
      const selected = ownFlows(ctx, element, evalContext(state, occurrence.scope));
      return selected.ok
        ? committed(emit(state, queued(ctx, selected.value), occurrence.scope))
        : failedWith(selected.failure);
    }
    case LeaveTag.Raised:
      return failed(FailureTag.SemanticFailure, "outflow-of-raised-occurrence");
  }
  return assertNever(leave);
}

function exclusive(ctx: Ctx, candidates: readonly FlowId[], fallback: FlowId | null, occurrence: Occurrence, state: State): Outcome {
  const chosen = holding(ctx, evalContext(state, occurrence.scope), candidates, true);
  if (!chosen.ok) return failedWith(chosen.failure);
  const flow = chosen.value[0] ?? fallback;
  return flow === null
    ? failed(FailureTag.RolledBack, "exclusive-gateway-no-outgoing-flow")
    : committed(signalComplete(state, occurrence.id, leaveFlows([flow])));
}

/** The flows an inclusive split takes. A gateway that lists no candidates is a pure join. */
function inclusiveFlows(
  ctx: Ctx,
  candidates: readonly FlowId[],
  fallback: FlowId | null,
  outgoing: readonly FlowId[],
  scope: ScopeOccurrenceId,
  state: State,
): Result<readonly FlowId[]> {
  return inclusiveChoice(ctx, evalContext(state, scope), candidates, fallback, outgoing, "inclusive-gateway-no-outgoing-flow");
}

/**
 * `Hooks.select`. Under `ConditionOrder.beforeOutputs` a completion's outgoing conditions are evaluated before its
 * output writes, from inside the scope occurrence it still owns, which holds an Activity's locals (CIB-INT-0011); under
 * BPMN order `outflow` resolves the leave after the writes.
 */
export function select(ctx: Ctx, occurrence: Occurrence, leave: Leave, state: State): Result<Leave> {
  switch (ctx.program.options.conditionOrder) {
    case ConditionOrder.AfterOutputs:
      return committed(leave);
    case ConditionOrder.BeforeOutputs:
      return selectBeforeOutputs(ctx, occurrence, leave, state);
  }
  return assertNever(ctx.program.options.conditionOrder);
}

function selectBeforeOutputs(ctx: Ctx, occurrence: Occurrence, leave: Leave, state: State): Result<Leave> {
  switch (leave.tag) {
    case LeaveTag.Flows:
    case LeaveTag.Raised:
      return committed(leave);
    case LeaveTag.Outgoing: {
      const element = programElement(ctx.program, occurrence.element);
      if (element === null) return failed(FailureTag.SemanticFailure, "outflow-without-element");
      const inside = state.scopes.find((scope) => scope.occurrence === occurrence.id)?.id ?? occurrence.scope;
      const chosen = ownFlows(ctx, element, evalContext(state, inside));
      return chosen.ok ? committed(leaveFlows(chosen.value)) : failedWith(chosen.failure);
    }
  }
  return assertNever(leave);
}

/**
 * The flows a position held by `element` continues on: its outgoing flows and, under the standards reach, its Boundary
 * Events' flows, since an attached Event can still fire (BPMN 2.0.2 §10.5.4); CIB's `isReachable` follows outgoing
 * transitions only (CIB-INT-0020).
 */
function leaving(ctx: Ctx, element: Element): readonly FlowId[] {
  const envelope = elementEnvelope(element);
  if (envelope === null) return elementOutgoing(element);
  switch (ctx.program.options.inclusiveJoinReach) {
    case InclusiveJoinReach.WithBoundaries:
      return [...envelope.outgoing, ...envelope.boundaries.flatMap((boundary) => boundary.outgoing)];
    case InclusiveJoinReach.OutgoingOnly:
      return envelope.outgoing;
  }
  return assertNever(ctx.program.options.inclusiveJoinReach);
}

/** The Link catch Events named `name` among the siblings of `parent`. */
function linkCatches(program: Program, parent: ElementId | null, name: string): readonly (readonly [Header, EventPayload])[] {
  return programChildren(program, parent).flatMap((element) => {
    const event = elementEvent(element);
    return event !== null && eventPayloadLinkCatch(event[1]) === name ? [event] : [];
  });
}

/** The flows a token continues on after reaching `element`; a throwing Link continues at its catching Links. */
function successors(ctx: Ctx, element: Element): readonly FlowId[] {
  const event = elementEvent(element);
  const name = event === null ? null : eventPayloadLinkThrow(event[1]);
  if (event === null || name === null) return leaving(ctx, element);
  return linkCatches(ctx.program, event[0].parent, name).flatMap(([, payload]) => payload.outgoing);
}

/** Whether a token on one of `start` can reach one of `targets` without passing through `gateway`. */
function reaches(ctx: Ctx, gateway: ElementId, targets: readonly FlowId[], start: readonly FlowId[]): boolean {
  const program = ctx.program;
  let frontier = [...start];
  const seen: FlowId[] = [];
  // The fuel bounds every visit of every flow by every edge into it, so it is never exhausted; running out answers
  // "reachable", which only keeps the join waiting.
  for (let fuel = (program.flows.length + 1) * (program.flows.length + 1); ; fuel -= 1) {
    const [flow, ...rest] = frontier;
    if (flow === undefined) return false;
    if (fuel === 0) return true;
    if (targets.includes(flow)) return true;
    if (seen.includes(flow)) {
      frontier = rest;
      continue;
    }
    const target = programTarget(program, flow);
    const element = target === null || target === gateway ? null : programElement(program, target);
    frontier = [...rest, ...(element === null ? [] : successors(ctx, element))];
    seen.unshift(flow);
  }
}

/**
 * The flows from which the remaining work of scope occurrence `scope` continues, excluding the tokens parked at
 * `gateway`: queued tokens, the elements of open items and child scope occurrences, and tokens parked at other joins.
 * A passive item keeps nothing alive and is no position; a boundary item is no element, and its host's position covers
 * the boundary's flows as far as `leaving` follows them.
 */
function positions(ctx: Ctx, state: State, gateway: ElementId, scope: ScopeOccurrenceId): readonly FlowId[] {
  const program = ctx.program;
  const continuing = (element: ElementId): readonly FlowId[] => {
    const found = programElement(program, element);
    return found === null ? [] : successors(ctx, found);
  };
  const queued = state.tokens.filter((token) => token.scope === scope).flatMap((token) => tokenArrivalFlow(token) ?? []);
  const items = state.openItems.filter((item) => item.scope === scope && !item.passive).flatMap((item) => continuing(item.element));
  const children = state.scopes.filter((child) => child.parent === scope)
    .flatMap((child) => (child.element === null ? [] : continuing(child.element)));
  const parked = state.slots.parked
    .filter((waiting) => waiting.scope === scope && programTarget(program, waiting.flow) !== gateway)
    .flatMap((waiting) => {
      const target = programTarget(program, waiting.flow);
      return target === null ? [] : continuing(target);
    });
  return [...queued, ...items, ...children, ...parked];
}

function park(state: State, waiting: Parked): State {
  return { ...state, slots: { ...state.slots, parked: [...state.slots.parked, waiting] } };
}

function filled(state: State, incoming: readonly FlowId[], scope: ScopeOccurrenceId): readonly FlowId[] {
  return incoming.filter((flow) => state.slots.parked.some((waiting) => waiting.flow === flow && waiting.scope === scope));
}

/** The occurrences a firing join consumes: the first parked on each filled flow. */
function consumedAt(state: State, incoming: readonly FlowId[], scope: ScopeOccurrenceId): readonly Parked[] {
  return incoming.flatMap((flow) => {
    const waiting = state.slots.parked.find((candidate) => candidate.flow === flow && candidate.scope === scope);
    return waiting === undefined ? [] : [waiting];
  });
}

function unpark(state: State, consumed: readonly Parked[]): State {
  const parked = state.slots.parked.filter((waiting) => !consumed.some((entry) => parkedEquals(entry, waiting)));
  return { ...state, slots: { ...state.slots, parked } };
}

/**
 * Park the occurrence at a join, unless `reoffer` in `step.ts` offers one already parked, and fire when `ready` holds; a gateway with
 * one incoming flow passes it on. When the join fires, the offered occurrence, if consumed, is the one that leaves with
 * the flows and the others end with none.
 */
function join(
  occurrence: Occurrence,
  incoming: readonly FlowId[],
  state: State,
  ready: (parked: State) => boolean,
  flows: (state: State) => Result<readonly FlowId[]>,
): Outcome {
  const flow = occurrence.incoming;
  if (flow === null) return failed(FailureTag.SemanticFailure, "gateway-without-flow");
  if (incoming.length <= 1) {
    const selected = flows(state);
    return selected.ok ? committed(signalComplete(state, occurrence.id, leaveFlows(selected.value))) : failedWith(selected.failure);
  }
  const parked = state.slots.parked.some((waiting) => waiting.occurrence === occurrence.id)
    ? state
    : park(state, { occurrence: occurrence.id, flow, scope: occurrence.scope });
  if (!ready(parked)) return committed(parked);
  const consumed = consumedAt(parked, incoming, occurrence.scope);
  const unparked = unpark(parked, consumed);
  const selected = flows(unparked);
  if (!selected.ok) return failedWith(selected.failure);
  const firing = consumed.some((entry) => entry.occurrence === occurrence.id)
    ? occurrence.id
    : consumed.at(-1)?.occurrence ?? occurrence.id;
  const others = consumed.map((entry) => entry.occurrence).filter((id) => id !== firing);
  const ended = others.reduce((current, id) => signalComplete(current, id, leaveFlows([])), unparked);
  return committed(signalComplete(ended, firing, leaveFlows(selected.value)));
}

export function arriveGateway(ctx: Ctx, header: Header, payload: GatewayPayload, occurrence: Occurrence, state: State): Outcome {
  const scope = occurrence.scope;
  const kind = payload.kind;
  switch (kind.tag) {
    case GatewayKindTag.Exclusive:
      return exclusive(ctx, kind.candidates, kind.default, occurrence, state);
    case GatewayKindTag.Parallel:
      return join(occurrence, payload.incoming, state,
        (parked) => filled(parked, payload.incoming, scope).length === payload.incoming.length,
        () => committed(payload.outgoing));
    case GatewayKindTag.Inclusive:
      return join(occurrence, payload.incoming, state,
        (parked) => {
          const full = filled(parked, payload.incoming, scope);
          const empty = payload.incoming.filter((flow) => !full.includes(flow));
          return !reaches(ctx, header.id, empty, positions(ctx, parked, header.id, scope));
        },
        (current) => inclusiveFlows(ctx, kind.candidates, kind.default, payload.outgoing, scope, current));
    case GatewayKindTag.EventBased:
      // Admission admits only a non-instantiating gateway (`gateway.eventBased.instantiate`).
      return committed(signal(state, { tag: SignalTag.ArmGateway, occurrence: occurrence.id, gateway: header.id, scope }));
  }
  return assertNever(kind);
}

/**
 * A throwing Link continues at the catching Link of the same name in the same process level or Sub-Process (BPMN 2.0.2
 * §10.5.6); a catching Link reached by a flow passes the token on.
 */
export function arriveLink(ctx: Ctx, header: Header, payload: EventPayload, occurrence: Occurrence, state: State): Outcome {
  const name = eventPayloadLinkThrow(payload);
  if (name === null) return committed(signalComplete(state, occurrence.id, leaveOutgoing));
  const catches = linkCatches(ctx.program, header.parent, name);
  const [only] = catches;
  if (only === undefined) return failed(FailureTag.SemanticFailure, "link-without-catch");
  if (catches.length > 1) return failed(FailureTag.SemanticFailure, "link-ambiguous-catch");
  return committed(signalComplete(state, occurrence.id, leaveFlows(only[1].outgoing)));
}

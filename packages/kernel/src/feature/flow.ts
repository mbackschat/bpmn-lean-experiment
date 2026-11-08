/**
 * Flow: starts, gateways and Links, transcribed from `Kernel/Feature/Flow.lean`. Owns matching on `GatewayKind`.
 *
 * Gateway semantics follow BPMN 2.0.2 §13.4: an Exclusive Gateway takes the first true candidate in document
 * order, else the default; a Parallel join waits until every incoming flow holds a token in the same scope
 * occurrence; an Inclusive join fires once no token still upstream in the same scope occurrence can reach an
 * incoming flow that holds none, and its split takes every true candidate, else the default; an Event-Based
 * Gateway consumes the token and signals `armGateway`. A diverging gateway that finds no outgoing flow rolls the
 * command back. Waiting tokens are parked in `state.slots.parked` on the incoming flow they arrived on.
 */
import {
  ValueTag,
  GatewayKindTag,
  assertNever,
  type ConditionalFlow,
  type Element,
  type ElementId,
  type EventPayload,
  type FlowId,
  type GatewayPayload,
  type Header,
  type Program,
  type StartPayload,
} from "../il/types.js";
import {
  elementEnvelope,
  elementEvent,
  elementGateway,
  elementStart,
  eventPayloadLinkCatch,
  eventPayloadLinkThrow,
  programChildren,
  programElement,
  programTarget,
} from "../il/query.js";
import { EvaluationTag, type Arrival, type Ctx } from "../hooks.js";
import {
  FailureTag,
  committed,
  emit,
  failed,
  root,
  signal,
  SignalTag,
  visible,
  type Binding,
  type Outcome,
  type Result,
  type ScopeOccurrenceId,
  type State,
} from "../state.js";

/**
 * A start Event emits on its outgoing flows whether it is a none start or a triggered one: a triggered start's
 * trigger is already consumed by the input that names it.
 */
export function startProcess(_ctx: Ctx, _header: Header, payload: StartPayload, state: State): Outcome {
  return committed(emit(state, payload.outgoing, root));
}

export function condition(ctx: Ctx, variables: readonly Binding[], candidate: ConditionalFlow): Result<boolean> {
  if (candidate.condition === null) {
    return committed(true);
  }
  const evaluation = ctx.evaluate(variables, candidate.condition);
  switch (evaluation.tag) {
    case EvaluationTag.Value:
      return evaluation.result.tag === ValueTag.Bool
        ? committed(evaluation.result.value)
        : failed(FailureTag.SemanticFailure, "condition-not-boolean");
    case EvaluationTag.NeedsHost:
      return failed(FailureTag.Unsupported, "host-evaluation");
    case EvaluationTag.Failure:
      return failed(FailureTag.SemanticFailure, evaluation.code);
  }
  return assertNever(evaluation);
}

/** The first candidate whose condition holds; an unconditioned candidate holds. */
export function firstTrue(
  ctx: Ctx,
  variables: readonly Binding[],
  candidates: readonly ConditionalFlow[],
): Result<FlowId | null> {
  for (const candidate of candidates) {
    const holds = condition(ctx, variables, candidate);
    if (!holds.ok) {
      return holds;
    }
    if (holds.value) {
      return committed(candidate.flow);
    }
  }
  return committed(null);
}

export function exclusive(
  ctx: Ctx,
  candidates: readonly ConditionalFlow[],
  fallback: FlowId | null,
  scope: ScopeOccurrenceId,
  state: State,
): Outcome {
  const chosen = firstTrue(ctx, visible(state, scope), candidates);
  if (!chosen.ok) {
    return chosen;
  }
  const flow = chosen.value ?? fallback;
  return flow === null
    ? failed(FailureTag.RolledBack, "exclusive-gateway-no-outgoing-flow")
    : committed(emit(state, [flow], scope));
}

/**
 * An inclusive split. A gateway that lists no candidates is a pure join whose outgoing flows are unconditioned
 * (the lowering lists candidates only for a diverging gateway), so it emits on all of them.
 */
export function inclusiveSplit(
  ctx: Ctx,
  candidates: readonly ConditionalFlow[],
  fallback: FlowId | null,
  outgoing: readonly FlowId[],
  scope: ScopeOccurrenceId,
  state: State,
): Outcome {
  if (candidates.length === 0) {
    return committed(emit(state, outgoing, scope));
  }
  const variables = visible(state, scope);
  const chosen: FlowId[] = [];
  for (const candidate of candidates) {
    const holds = condition(ctx, variables, candidate);
    if (!holds.ok) {
      return holds;
    }
    if (holds.value) {
      chosen.push(candidate.flow);
    }
  }
  if (chosen.length > 0) {
    return committed(emit(state, chosen, scope));
  }
  return fallback === null
    ? failed(FailureTag.RolledBack, "inclusive-gateway-no-outgoing-flow")
    : committed(emit(state, [fallback], scope));
}

/** The flows leaving an element, its boundaries' flows included. */
export function leaving(element: Element): readonly FlowId[] {
  const envelope = elementEnvelope(element);
  if (envelope !== null) {
    return [...envelope.outgoing, ...envelope.boundaries.flatMap((boundary) => boundary.outgoing)];
  }
  return elementEvent(element)?.[1].outgoing ?? elementGateway(element)?.[1].outgoing ??
    elementStart(element)?.[1].outgoing ?? [];
}

/** The Link catch Events named `name` among the siblings of `parent`. */
export function linkCatches(
  program: Program,
  parent: ElementId | null,
  name: string,
): readonly (readonly [Header, EventPayload])[] {
  return programChildren(program, parent).flatMap((element) => {
    const event = elementEvent(element);
    return event !== null && eventPayloadLinkCatch(event[1]) === name ? [event] : [];
  });
}

/** The flows a token continues on after reaching `element`; a throwing Link continues at its catching Links. */
export function successors(program: Program, element: Element): readonly FlowId[] {
  const event = elementEvent(element);
  const name = event === null ? null : eventPayloadLinkThrow(event[1]);
  if (event !== null && name !== null) {
    return linkCatches(program, event[0].parent, name).flatMap((target) => target[1].outgoing);
  }
  return leaving(element);
}

/** Whether a token on one of `start` can reach one of `targets` without passing through `gateway`. */
export function reaches(
  program: Program,
  gateway: ElementId,
  targets: readonly FlowId[],
  start: readonly FlowId[],
): boolean {
  let frontier = start;
  const seen: FlowId[] = [];
  // The fuel bounds every visit of every flow by every edge into it, so it is never exhausted; running out
  // answers "reachable", which only keeps the join waiting.
  let fuel = (program.flows.length + 1) * (program.flows.length + 1);
  while (frontier.length > 0) {
    if (fuel === 0) {
      return true;
    }
    fuel -= 1;
    const [flow, ...rest] = frontier as [FlowId, ...FlowId[]];
    if (targets.includes(flow)) {
      return true;
    }
    if (seen.includes(flow)) {
      frontier = rest;
      continue;
    }
    const target = programTarget(program, flow);
    const targetElement = target === null || target === gateway ? null : programElement(program, target);
    const next = targetElement === null ? [] : successors(program, targetElement);
    frontier = [...rest, ...next];
    seen.unshift(flow);
  }
  return false;
}

/**
 * The flows from which the remaining work of scope occurrence `scope` continues, excluding the tokens parked at
 * `gateway`: queued tokens, the elements of open items and child scope occurrences, and tokens parked at other
 * joins. A passive item keeps nothing alive and is no position; a boundary item is no element, and its host's
 * position already covers the boundary's flows.
 */
export function positions(
  program: Program,
  state: State,
  gateway: ElementId,
  scope: ScopeOccurrenceId,
): readonly FlowId[] {
  const continuing = (element: ElementId): readonly FlowId[] => {
    const found = programElement(program, element);
    return found === null ? [] : successors(program, found);
  };
  const queued = state.tokens.filter((token) => token.scope === scope).map((token) => token.flow);
  const items = state.openItems
    .filter((item) => item.scope === scope && !item.passive)
    .flatMap((item) => continuing(item.element));
  const children = state.scopes
    .filter((child) => child.parent === scope)
    .flatMap((child) => (child.element === null ? [] : continuing(child.element)));
  const parked = state.slots.parked
    .filter((token) => token.scope === scope && programTarget(program, token.flow) !== gateway)
    .flatMap((token) => {
      const target = programTarget(program, token.flow);
      return target === null ? [] : continuing(target);
    });
  return [...queued, ...items, ...children, ...parked];
}

export function park(state: State, arrival: Arrival): State {
  return {
    ...state,
    slots: { ...state.slots, parked: [...state.slots.parked, { flow: arrival.flow, scope: arrival.scope }] },
  };
}

/** Remove one parked token from each of `flows` in `scope`. */
export function unpark(state: State, flows: readonly FlowId[], scope: ScopeOccurrenceId): State {
  const parked = flows.reduce((remaining, flow) => {
    const at = remaining.findIndex((token) => token.flow === flow && token.scope === scope);
    return at < 0 ? remaining : [...remaining.slice(0, at), ...remaining.slice(at + 1)];
  }, state.slots.parked);
  return { ...state, slots: { ...state.slots, parked } };
}

export function filled(state: State, incoming: readonly FlowId[], scope: ScopeOccurrenceId): readonly FlowId[] {
  return incoming.filter((flow) => state.slots.parked.some((token) => token.flow === flow && token.scope === scope));
}

/** Park the arrival at a join and fire when `ready` holds; a gateway with one incoming flow passes it on. */
export function join(
  incoming: readonly FlowId[],
  arrival: Arrival,
  state: State,
  ready: (parked: State) => boolean,
  fire: (state: State) => Outcome,
): Outcome {
  if (incoming.length <= 1) {
    return fire(state);
  }
  const parked = park(state, arrival);
  return ready(parked)
    ? fire(unpark(parked, filled(parked, incoming, arrival.scope), arrival.scope))
    : committed(parked);
}

export function arriveGateway(
  ctx: Ctx,
  header: Header,
  payload: GatewayPayload,
  arrival: Arrival,
  state: State,
): Outcome {
  const scope = arrival.scope;
  const kind = payload.kind;
  switch (kind.tag) {
    case GatewayKindTag.Exclusive:
      return exclusive(ctx, kind.candidates, kind.default, scope, state);
    case GatewayKindTag.Parallel:
      return join(
        payload.incoming,
        arrival,
        state,
        (parked) => filled(parked, payload.incoming, scope).length === payload.incoming.length,
        (next) => committed(emit(next, payload.outgoing, scope)),
      );
    case GatewayKindTag.Inclusive:
      return join(
        payload.incoming,
        arrival,
        state,
        (parked) => {
          const full = filled(parked, payload.incoming, scope);
          const empty = payload.incoming.filter((flow) => !full.includes(flow));
          return !reaches(ctx.program, header.id, empty, positions(ctx.program, parked, header.id, scope));
        },
        (next) => inclusiveSplit(ctx, kind.candidates, kind.default, payload.outgoing, scope, next),
      );
    case GatewayKindTag.EventBased:
      return committed(signal(state, { tag: SignalTag.ArmGateway, gateway: header.id, scope }));
  }
  return assertNever(kind);
}

/**
 * A throwing Link continues at the catching Link of the same name in the same process level or Sub-Process
 * (BPMN 2.0.2 §10.5.6); a catching Link reached by a flow passes the token on.
 */
export function arriveLink(ctx: Ctx, header: Header, payload: EventPayload, arrival: Arrival, state: State): Outcome {
  const name = eventPayloadLinkThrow(payload);
  if (name === null) {
    return committed(emit(state, payload.outgoing, arrival.scope));
  }
  const targets = linkCatches(ctx.program, header.parent, name);
  const [only] = targets;
  if (only === undefined) {
    return failed(FailureTag.SemanticFailure, "link-without-catch");
  }
  return targets.length === 1
    ? committed(emit(state, only[1].outgoing, arrival.scope))
    : failed(FailureTag.SemanticFailure, "link-ambiguous-catch");
}

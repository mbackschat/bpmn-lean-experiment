/**
 * Admission of starts, gateways and Links, transcribed from `Kernel/Admission/Flow.lean`. A refusal carries a stable
 * code. A start's trigger is admitted by `admission/subscriptions.ts`.
 */
import {
  GatewayKindTag,
  assertNever,
  elementEvent,
  elementGateway,
  eventPayloadCatch,
  eventPayloadLinkCatch,
  eventPayloadLinkThrow,
  programChildren,
  programElement,
  programTarget,
  type EventPayload,
  type Flow,
  type FlowId,
  type GatewayPayload,
  type Header,
  type Program,
  type StartPayload,
} from "../il/types.js";

/**
 * An Event-Based Gateway's arms are catch Events: a Receive Task arm opens through the work feature's wait, which
 * `Hooks.armGateway` cannot name.
 */
function eventBasedArms(program: Program, payload: GatewayPayload): string | null {
  const catchEvent = (flow: FlowId): boolean => {
    const target = programTarget(program, flow);
    const element = target === null ? null : programElement(program, target);
    const event = element === null ? null : elementEvent(element);
    return event !== null && eventPayloadCatch(event[1]) !== null;
  };
  return payload.outgoing.every(catchEvent) ? null : "gateway.eventBased.receiveArm";
}

export function gateway(program: Program, payload: GatewayPayload): string | null {
  switch (payload.kind.tag) {
    case GatewayKindTag.Exclusive:
    case GatewayKindTag.Parallel:
    case GatewayKindTag.Inclusive:
      return null;
    case GatewayKindTag.EventBased:
      return eventBasedArms(program, payload);
  }
  return assertNever(payload.kind);
}

/**
 * A condition is read only by the exclusive and inclusive gateways, on the flows they list as candidates; on any other
 * flow it would be silently ignored.
 */
export function conditionalOutflow(program: Program, flow: Flow): string | null {
  const refused = "flow.conditionalOutflow";
  if (flow.condition === null) return null;
  const source = programElement(program, flow.source);
  const gateway = source === null ? null : elementGateway(source);
  if (gateway === null) return refused;
  const kind = gateway[1].kind;
  switch (kind.tag) {
    case GatewayKindTag.Exclusive:
    case GatewayKindTag.Inclusive:
      return kind.candidates.includes(flow.id) ? null : refused;
    case GatewayKindTag.Parallel:
    case GatewayKindTag.EventBased:
      return refused;
  }
  return assertNever(kind);
}

export function start(_payload: StartPayload): string | null {
  return null;
}

/** A throwing Link has exactly one catching Link of its name among its siblings (BPMN 2.0.2 §10.5.6). */
export function link(program: Program, header: Header, payload: EventPayload): string | null {
  const name = eventPayloadLinkThrow(payload);
  if (name === null) return null;
  const catches = programChildren(program, header.parent).filter((element) => {
    const event = elementEvent(element);
    return event !== null && eventPayloadLinkCatch(event[1]) === name;
  });
  return catches.length === 1 ? null : "link.catch";
}

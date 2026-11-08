/**
 * Admission of starts, gateways and Links, transcribed from `Kernel/Admission/Flow.lean`. A refusal carries a
 * stable code. A start's trigger is admitted by `admission/subscriptions.ts`.
 */
import {
  GatewayKindTag,
  assertNever,
  type EventPayload,
  type GatewayPayload,
  type StartPayload,
} from "../il/types.js";

export function gateway(payload: GatewayPayload): string | null {
  const kind = payload.kind;
  switch (kind.tag) {
    case GatewayKindTag.Exclusive:
    case GatewayKindTag.Parallel:
    case GatewayKindTag.Inclusive:
    case GatewayKindTag.EventBased:
      return null;
  }
  return assertNever(kind);
}

export function start(_payload: StartPayload): string | null {
  return null;
}

export function link(_payload: EventPayload): string | null {
  return null;
}

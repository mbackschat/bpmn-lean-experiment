/** Admission of starts and gateways, transcribed from `Kernel/Admission/Flow.lean`. A refusal carries a stable code. */
import { GatewayKindTag, assertNever, type GatewayPayload, type StartPayload } from "../il/types.js";

export function gateway(payload: GatewayPayload): string | null {
  const kind = payload.kind;
  switch (kind.tag) {
    case GatewayKindTag.Exclusive:
      return null;
    case GatewayKindTag.Parallel:
      return "gateway.parallel";
    case GatewayKindTag.Inclusive:
      return "gateway.inclusive";
    case GatewayKindTag.EventBased:
      return "gateway.eventBased";
  }
  return assertNever(kind);
}

export function start(payload: StartPayload): string | null {
  return payload.subscription === null ? null : "start.triggered";
}

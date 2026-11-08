/**
 * Propagation: throw Events, transcribed from `Kernel/Feature/Propagation.lean`.
 *
 * Owns matching on `Throw`. A none End Event consumes its token; a none intermediate throw passes it on.
 */
import { Placement, ThrowTag, assertNever, type EventPayload, type Header, type Throw } from "../il/types.js";
import type { Arrival, Ctx } from "../hooks.js";
import { FailureTag, committed, emit, failed, type Outcome, type State } from "../state.js";

function noneThrow(payload: EventPayload, arrival: Arrival, state: State): Outcome {
  switch (payload.placement) {
    case Placement.Finish:
      return committed(state);
    case Placement.Intermediate:
      return committed(emit(state, payload.outgoing, arrival.scope));
  }
  return assertNever(payload.placement);
}

export function arriveThrow(
  _ctx: Ctx,
  _header: Header,
  payload: EventPayload,
  thrown: Throw,
  arrival: Arrival,
  state: State,
): Outcome {
  switch (thrown.tag) {
    case ThrowTag.None:
      return noneThrow(payload, arrival, state);
    case ThrowTag.Message:
      return failed(FailureTag.Unsupported, "message-throw");
    case ThrowTag.Signal:
      return failed(FailureTag.Unsupported, "signal-throw");
    case ThrowTag.Error:
      return failed(FailureTag.Unsupported, "error-throw");
    case ThrowTag.Escalation:
      return failed(FailureTag.Unsupported, "escalation-throw");
    case ThrowTag.Compensation:
      return failed(FailureTag.Unsupported, "compensation-throw");
    case ThrowTag.Cancel:
      return failed(FailureTag.Unsupported, "cancel-throw");
    case ThrowTag.Terminate:
      return failed(FailureTag.Unsupported, "terminate-end");
  }
  return assertNever(thrown);
}

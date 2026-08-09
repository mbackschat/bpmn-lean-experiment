/**
 * The host's identity for one durable timer scope, derived from committed semantic state alone.
 *
 * Distinct from the firing command identity in `timer-command.ts`: that one carries logical time,
 * while this must stay equal across every activation that recomputes it while the same wait is armed,
 * so that a replay recognizes its own scope and a replaced wait cannot pass as the one still live.
 */
import type { OpenTimer } from "@bpmn-lean/semantic-core";

import { canonicalTypedTupleEncoding } from "./canonical-encoding.js";

/**
 * Encodes the committed occurrence and deadline as a comparable host key.
 *
 * Delimited rather than separator-joined. The shared wire domain admits every Unicode scalar value,
 * including the control characters an ad-hoc separator would rely on being absent, so joining the
 * parts let one identifier absorb the separator and forge another timer's key.
 */
export function durableTimerKey(timer: OpenTimer): string {
  return canonicalTypedTupleEncoding([
    "durableTimer",
    [
      timer.id.processInstanceId,
      timer.id.elementId,
      timer.id.activation,
    ],
    timer.deadlineMs,
  ]);
}

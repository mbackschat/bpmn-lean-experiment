import { StimulusKind } from "@bpmn-lean/semantic-core";
import type {
  FireTimerStimulus,
  OpenTimer,
  TimerOccurrenceId,
} from "@bpmn-lean/semantic-core";

import { canonicalTypedTupleEncoding } from "./canonical-encoding.js";
import { deterministicSha256Hex } from "./deterministic-sha256.js";

/**
 * Canonical timer content excludes its derived command ID. The answer-free scenario and the
 * Workflow-owned wakeup mapping both use this exact typed form.
 */
export function canonicalTimerFiringEncoding(
  timerId: TimerOccurrenceId,
  logicalTimeMs: number,
): string {
  return canonicalTypedTupleEncoding([
    StimulusKind.FireTimer,
    [
      timerId.processInstanceId,
      timerId.elementId,
      timerId.activation,
    ],
    logicalTimeMs,
  ]);
}

export function timerFiringCommandId(
  timerId: TimerOccurrenceId,
  logicalTimeMs: number,
): string {
  return `fire-timer-sha256:${
    deterministicSha256Hex(
      canonicalTimerFiringEncoding(timerId, logicalTimeMs),
    )
  }`;
}

export function timerFiringStimulus(
  timer: OpenTimer,
): FireTimerStimulus {
  return {
    kind: StimulusKind.FireTimer,
    commandId: timerFiringCommandId(timer.id, timer.deadlineMs),
    timerId: timer.id,
    logicalTimeMs: timer.deadlineMs,
  };
}

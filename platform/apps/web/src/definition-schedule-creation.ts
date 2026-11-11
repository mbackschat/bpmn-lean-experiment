import type { PublicTimerStartCapability } from "@bpmn-lean/platform-contracts";

export const ScheduleCreationKind = {
  NoTimerStart: "noTimerStart",
  Available: "available",
  MultipleTimerStarts: "multipleTimerStarts",
} as const;

export type ScheduleCreationKind = typeof ScheduleCreationKind[keyof typeof ScheduleCreationKind];

/**
 * Whether the browser offers Schedule creation for one exact definition version. A Schedule fires one occurrence of the
 * version's single Timer Start, whatever its form; the engine lists the occurrences.
 */
export type ScheduleCreation =
  | Readonly<{ kind: typeof ScheduleCreationKind.NoTimerStart }>
  | Readonly<{ kind: typeof ScheduleCreationKind.Available; timerStart: PublicTimerStartCapability }>
  | Readonly<{ kind: typeof ScheduleCreationKind.MultipleTimerStarts }>;

export function scheduleCreation(
  timerStarts: readonly PublicTimerStartCapability[],
): ScheduleCreation {
  const [timerStart, ...others] = timerStarts;
  if (timerStart === undefined) return { kind: ScheduleCreationKind.NoTimerStart };
  return others.length > 0 ? { kind: ScheduleCreationKind.MultipleTimerStarts } : { kind: ScheduleCreationKind.Available, timerStart };
}

import type { PublicTimerStartCapability } from "@bpmn-lean/platform-contracts";

export const ScheduleCreationKind = {
  NoTimerStart: "noTimerStart",
  Available: "available",
  MultipleTimerStarts: "multipleTimerStarts",
  UnresolvedDuration: "unresolvedDuration",
} as const;

export type ScheduleCreationKind = typeof ScheduleCreationKind[keyof typeof ScheduleCreationKind];

/**
 * Whether the browser offers Schedule creation for one exact definition version. A Schedule binds the version's single
 * Timer Start, and the server refuses one whose duration the engine leaves unresolved (`durationMs: null`).
 */
export type ScheduleCreation =
  | Readonly<{ kind: typeof ScheduleCreationKind.NoTimerStart }>
  | Readonly<{ kind: typeof ScheduleCreationKind.Available; timerStart: PublicTimerStartCapability }>
  | Readonly<{ kind: typeof ScheduleCreationKind.MultipleTimerStarts }>
  | Readonly<{ kind: typeof ScheduleCreationKind.UnresolvedDuration; timerStart: PublicTimerStartCapability }>;

export function scheduleCreation(
  timerStarts: readonly PublicTimerStartCapability[],
): ScheduleCreation {
  const [timerStart, ...others] = timerStarts;
  if (timerStart === undefined) return { kind: ScheduleCreationKind.NoTimerStart };
  if (others.length > 0) return { kind: ScheduleCreationKind.MultipleTimerStarts };
  return timerStart.durationMs === null
    ? { kind: ScheduleCreationKind.UnresolvedDuration, timerStart }
    : { kind: ScheduleCreationKind.Available, timerStart };
}

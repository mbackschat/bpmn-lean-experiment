const maximumAudiencePauseMs = 10_000;

export const AlphaDemoLandmark = Object.freeze({
  NaturalCompleted: "natural-completed",
  InterruptionReady: "interruption-ready",
  InterruptedCompleted: "interrupted-completed",
} as const);
export type AlphaDemoLandmark =
  typeof AlphaDemoLandmark[keyof typeof AlphaDemoLandmark];

export function readAlphaDemoPauseMs(
  environment: Readonly<Record<string, string | undefined>>,
): number {
  const source = environment.MUE_ALPHA_DEMO_PAUSE_MS;
  if (source === undefined) return 0;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(source)) {
    throw new TypeError("MUE_ALPHA_DEMO_PAUSE_MS must be a canonical nonnegative integer");
  }
  const value = Number(source);
  if (!Number.isSafeInteger(value) || value > maximumAudiencePauseMs) {
    throw new RangeError(`MUE_ALPHA_DEMO_PAUSE_MS must not exceed ${maximumAudiencePauseMs}`);
  }
  return value;
}

export function alphaDemoLandmarkLabel(landmark: AlphaDemoLandmark): string {
  switch (landmark) {
    case AlphaDemoLandmark.NaturalCompleted:
      return "Natural completion and ordered aggregate";
    case AlphaDemoLandmark.InterruptionReady:
      return "Timer interruption and escalation task";
    case AlphaDemoLandmark.InterruptedCompleted:
      return "Interrupted completion without partial output";
  }
}

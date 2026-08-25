const maximumAudiencePauseMs = 10_000;

export const AlphaDemoLandmark = Object.freeze({
  NaturalCompleted: "natural-completed",
  InterruptionReady: "interruption-ready",
  InterruptedCompleted: "interrupted-completed",
} as const);
export type AlphaDemoLandmark =
  typeof AlphaDemoLandmark[keyof typeof AlphaDemoLandmark];

export type AlphaDemoFallbackFrame = Readonly<{
  alt: string;
  filename: string;
  landmark: AlphaDemoLandmark;
}>;

export const alphaDemoFallbackFrames: readonly AlphaDemoFallbackFrame[] = Object.freeze([
  Object.freeze({
    alt: "MUE Preview Alpha showing the natural Sequential Multi-Instance completion and ordered aggregate",
    filename: "01-natural-completion.png",
    landmark: AlphaDemoLandmark.NaturalCompleted,
  }),
  Object.freeze({
    alt: "MUE Preview Alpha showing the committed Boundary Timer interruption and escalation task",
    filename: "02-timer-interruption.png",
    landmark: AlphaDemoLandmark.InterruptionReady,
  }),
  Object.freeze({
    alt: "MUE Preview Alpha showing interrupted completion without a partial output collection",
    filename: "03-interrupted-completion.png",
    landmark: AlphaDemoLandmark.InterruptedCompleted,
  }),
]);

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

export function readAlphaDemoCaptureEnabled(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  const source = environment.MUE_ALPHA_DEMO_CAPTURE;
  if (source === undefined) return false;
  if (source !== "true") {
    throw new TypeError("MUE_ALPHA_DEMO_CAPTURE must be exactly true when supplied");
  }
  return true;
}

export function alphaDemoFallbackFrame(
  landmark: AlphaDemoLandmark,
): AlphaDemoFallbackFrame {
  switch (landmark) {
    case AlphaDemoLandmark.NaturalCompleted:
      return alphaDemoFallbackFrames[0]!;
    case AlphaDemoLandmark.InterruptionReady:
      return alphaDemoFallbackFrames[1]!;
    case AlphaDemoLandmark.InterruptedCompleted:
      return alphaDemoFallbackFrames[2]!;
  }
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

const maximumHeadlinePauseMs = 10_000;

export const HeadlineDemoLandmark = Object.freeze({
  CapabilityBreadth: "capability-breadth",
  ProcessDiagram: "process-diagram",
  ApproveForm: "approve-form",
  RequestChangesForm: "request-changes-form",
  AbortForm: "abort-form",
  CommittedEvidence: "committed-evidence",
} as const);
export type HeadlineDemoLandmark =
  typeof HeadlineDemoLandmark[keyof typeof HeadlineDemoLandmark];

export type HeadlineDemoConfig = Readonly<{
  enabled: boolean;
  pauseMs: number;
}>;

export function readHeadlineDemoConfig(
  environment: Readonly<Record<string, string | undefined>>,
): HeadlineDemoConfig {
  const enabledSource = environment.MUE_HEADLINE_DEMO;
  const pauseSource = environment.MUE_HEADLINE_DEMO_PAUSE_MS;
  if (enabledSource === undefined) {
    if (pauseSource !== undefined) {
      throw new TypeError("MUE_HEADLINE_DEMO_PAUSE_MS requires MUE_HEADLINE_DEMO=true");
    }
    return Object.freeze({ enabled: false, pauseMs: 0 });
  }
  if (enabledSource !== "true") {
    throw new TypeError("MUE_HEADLINE_DEMO must be exactly true when supplied");
  }
  if (pauseSource === undefined || !/^(?:0|[1-9][0-9]*)$/u.test(pauseSource)) {
    throw new TypeError("MUE_HEADLINE_DEMO_PAUSE_MS must be a canonical nonnegative integer");
  }
  const pauseMs = Number(pauseSource);
  if (!Number.isSafeInteger(pauseMs) || pauseMs > maximumHeadlinePauseMs) {
    throw new RangeError(
      `MUE_HEADLINE_DEMO_PAUSE_MS must not exceed ${maximumHeadlinePauseMs}`,
    );
  }
  return Object.freeze({ enabled: true, pauseMs });
}

export function headlineDemoLandmarkLabel(
  landmark: HeadlineDemoLandmark,
): string {
  switch (landmark) {
    case HeadlineDemoLandmark.CapabilityBreadth:
      return "Exact engine breadth and non-conformance boundary";
    case HeadlineDemoLandmark.ProcessDiagram:
      return "Expense exception BPMN process";
    case HeadlineDemoLandmark.ApproveForm:
      return "Approve form with six real field kinds";
    case HeadlineDemoLandmark.RequestChangesForm:
      return "Request changes with conditional rationale";
    case HeadlineDemoLandmark.AbortForm:
      return "Abort with destructive intent and required rationale";
    case HeadlineDemoLandmark.CommittedEvidence:
      return "Committed semantic History and Work audit";
  }
}

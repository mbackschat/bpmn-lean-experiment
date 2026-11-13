import type {
  InternalFailureReport,
  InternalFailureReporter,
} from "@bpmn-lean/platform-contracts";

/** For tests that exercise no failure: a report is a test failure, and its throw surfaces at the awaited `handle`. */
export const unexpectedInternalFailure: InternalFailureReporter = (report) => {
  throw new Error(
    `unexpected internal failure report from ${report.route}: ${String(report.error)}`,
  );
};

/** For tests that exercise a 500: every report is kept, in order. */
export function recordingInternalFailures(): Readonly<{
  reporter: InternalFailureReporter;
  reports: readonly InternalFailureReport[];
}> {
  const reports: InternalFailureReport[] = [];
  return { reporter: (report) => reports.push(report), reports };
}

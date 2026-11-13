import type {
  InternalFailureReport,
  InternalFailureReporter,
} from "@bpmn-lean/platform-contracts";

/**
 * Reports each internal failure as one JSON line on stderr, where the container runtime collects it.
 *
 * The write is best effort: a closed or failing sink must never turn a 500 answer into a hung or crashed request.
 */
export function createStderrInternalFailureReporter(
  writeLine: (line: string) => void = (line) => {
    process.stderr.write(line);
  },
): InternalFailureReporter {
  return (report) => {
    try {
      writeLine(`${JSON.stringify(logRecord(report))}\n`);
    } catch {
      // Nothing left to tell: this reporter is the last place a failure can be told.
    }
  };
}

function logRecord(report: InternalFailureReport): Readonly<Record<string, unknown>> {
  return {
    event: "internalFailure",
    route: report.route,
    method: report.method,
    path: report.path,
    error: renderError(report.error),
  };
}

/** How many `cause` links are rendered; a deeper or cyclic chain ends there. */
const causeDepth = 8;

function renderError(error: unknown, depth = 0): Readonly<Record<string, unknown>> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(typeof error.stack === "string" ? { stack: error.stack } : {}),
      ...(error.cause !== undefined && depth < causeDepth ? { cause: renderError(error.cause, depth + 1) } : {}),
    };
  }
  return { name: typeof error, message: renderValue(error) };
}

function renderValue(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[unrenderable thrown value]";
  }
}

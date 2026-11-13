/**
 * One unexpected failure an HTTP boundary answered with `500 internalFailure`.
 *
 * `path` is the URL pathname only: the query string, headers and body may carry business data and never reach the operator log.
 * `error` is the caught value untouched, so the sink decides how to render it.
 */
export type InternalFailureReport = Readonly<{
  route: string;
  method: string;
  path: string;
  error: unknown;
}>;

/**
 * Receives each {@link InternalFailureReport} on the request path, after the failure and before its 500 is answered.
 *
 * It must not throw. Every HTTP boundary requires one and none defaults to a no-op: a silent default would recreate the
 * defect this type exists for, a 500 whose cause nobody can read.
 */
export type InternalFailureReporter = (report: InternalFailureReport) => void;

/** Reports one caught failure, building the report from the request so no caller can leak its query string. */
export function reportInternalFailure(
  reporter: InternalFailureReporter,
  route: string,
  request: Readonly<{ method: string; url: string }>,
  error: unknown,
): void {
  reporter({
    route,
    method: request.method,
    path: new URL(request.url).pathname,
    error,
  });
}

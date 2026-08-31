/** Continue-As-New cannot carry managed host readiness into the successor Run. */
export function workflowRolloverPermitted(
  rolloverRequested: boolean,
  managedBoundaryDeadlineArmed: boolean,
  managedReadinessCallbackPending: boolean,
): boolean {
  return rolloverRequested &&
    !managedBoundaryDeadlineArmed &&
    !managedReadinessCallbackPending;
}

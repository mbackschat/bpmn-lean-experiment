/** Continue-As-New cannot carry managed host readiness into the successor Run. */
export function workflowRolloverPermitted(
  safety: Readonly<{
    requested: boolean;
    managedBoundaryDeadlineArmed: boolean;
    managedReadinessCallbackPending: boolean;
    compensationActivityUnreconciled: boolean;
  }>,
): boolean {
  return safety.requested &&
    !safety.managedBoundaryDeadlineArmed &&
    !safety.managedReadinessCallbackPending &&
    !safety.compensationActivityUnreconciled;
}

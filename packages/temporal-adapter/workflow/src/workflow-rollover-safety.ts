/** Continue-As-New cannot carry a managed boundary-deadline Timer into the successor Run. */
export function workflowRolloverPermitted(
  rolloverRequested: boolean,
  managedBoundaryDeadlineArmed: boolean,
): boolean {
  return rolloverRequested && !managedBoundaryDeadlineArmed;
}

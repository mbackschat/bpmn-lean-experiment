/**
 * The failure a Workflow raises when pre-start host admission let through a state it cannot host.
 *
 * One owner because the type is operator-visible. A scheduler, an admission check, and a projection
 * that each spelled the same identity separately would be indistinguishable to an operator filtering
 * on it, and a single typo would silently split one contract into two.
 */
import { ApplicationFailure } from "@temporalio/workflow";

export const bpmnHostCapabilityInvariantViolationFailureType =
  "BpmnHostCapabilityInvariantViolation";

export function hostInvariantFailure(message: string): ApplicationFailure {
  return ApplicationFailure.nonRetryable(
    message,
    bpmnHostCapabilityInvariantViolationFailureType,
  );
}

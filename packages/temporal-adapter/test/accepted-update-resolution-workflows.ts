/**
 * Isolates one service guarantee from BPMN semantics: how an accepted but unresolved Update ends
 * when its Workflow fails.
 *
 * The bounded-Activity refusal emits exactly this shape — an Update acknowledged, its result never
 * produced, then a non-retryable Workflow failure. Whether the caller awaiting that Update is
 * answered or left waiting is decided by the service, not by Workflow code, so it cannot be observed
 * from the direct-VM harness that establishes the emitted commands. This probe carries no BPMN
 * meaning; it exists so the service half can be checked on its own.
 */
import {
  ApplicationFailure,
  condition,
  defineUpdate,
  setHandler,
} from "@temporalio/workflow";

export const acceptedUpdateName = "premiseAcceptedUpdate";
export const acceptedUpdateFailureType = "BpmnPremiseAcceptedUpdateUnresolved";

const acceptedUpdate = defineUpdate<void>(acceptedUpdateName);

/**
 * Accepts one Update, never resolves it, then fails.
 *
 * The handler blocks forever on purpose: resolving it would answer the caller through the ordinary
 * path and prove nothing about the failure path.
 */
export async function acceptedThenFailingWorkflow(): Promise<void> {
  let accepted = false;
  setHandler(acceptedUpdate, async () => {
    accepted = true;
    await condition(() => false);
  });
  await condition(() => accepted);
  throw ApplicationFailure.nonRetryable(
    "Workflow failed while one accepted Update remained unresolved",
    acceptedUpdateFailureType,
  );
}

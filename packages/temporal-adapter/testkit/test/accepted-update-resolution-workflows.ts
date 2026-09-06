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
  continueAsNew,
  currentUpdateInfo,
  defineQuery,
  defineUpdate,
  setHandler,
} from "@temporalio/workflow";
import { CommandOutcome, sameStimulus } from "@bpmn-lean/semantic-core";
import {
  bpmnWorkflowChainCommandRecoveryQueryName,
  WorkflowChainCommandRecoveryResponseKind,
} from "@bpmn-lean/temporal-protocol";
import type {
  ExternallyRetryableStimulus,
  WorkflowChainCommandRecoveryRequest,
} from "@bpmn-lean/temporal-protocol";

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

type AcceptedCommand = Readonly<{ stimulus: ExternallyRetryableStimulus; updateId: string }>;

/** Carries the accepted command through an unresolved Update's Continue-As-New boundary. */
export async function acceptedThenContinuingWorkflow(retained?: AcceptedCommand): Promise<void> {
  let accepted: AcceptedCommand | undefined;
  let resolved = false;
  setHandler(defineQuery("acceptedCommandAudit"), () => ({ retained, resolved }));
  setHandler(defineQuery<unknown, [WorkflowChainCommandRecoveryRequest]>(
    bpmnWorkflowChainCommandRecoveryQueryName,
  ), (request) => ({
    ...request,
    kind: WorkflowChainCommandRecoveryResponseKind.UnknownWhileActive,
  }));
  setHandler(defineUpdate<CommandOutcome, [ExternallyRetryableStimulus]>(acceptedUpdateName), async (stimulus) => {
    const updateId = currentUpdateInfo()!.id;
    if (retained !== undefined) {
      if (updateId !== retained.updateId || !sameStimulus(stimulus, retained.stimulus)) {
        throw ApplicationFailure.nonRetryable("Retried command changed across Runs", "ProbeIdentityMismatch");
      }
      resolved = true;
      return CommandOutcome.Committed;
    }
    accepted = { stimulus, updateId };
    await condition(() => false);
    throw new Error("unreachable accepted handler");
  });
  if (retained !== undefined) {
    await condition(() => false);
    return;
  }
  await condition(() => accepted !== undefined);
  await continueAsNew<typeof acceptedThenContinuingWorkflow>(accepted);
}

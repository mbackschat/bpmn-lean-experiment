import {
  condition, continueAsNew, currentUpdateInfo, defineQuery, defineSignal,
  defineUpdate, setHandler, workflowInfo,
} from "@temporalio/workflow";
import { CommandOutcome, sameStimulus } from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind, WorkflowChainCommandRecoveryResponseKind,
  bpmnWorkflowChainCommandRecoveryQueryName, contentBoundUpdateId,
  workflowChainProductionLimit, workflowTerminalResultFormatV1,
} from "@bpmn-lean/temporal-protocol";
import type {
  ExternallyRetryableStimulus, TerminalProcessReceipt, WorkflowChainCommandRecoveryRequest,
  WorkflowTerminalResultV1,
} from "@bpmn-lean/temporal-protocol";
import {
  WorkflowChainCapacityState, WorkflowChainFenceState, WorkflowCommandCapacityState,
  WorkflowCommandRecoveryLedger, WorkflowCommandRecoveryPreflightKind,
  validateWorkflowChainUpdate,
} from "@bpmn-lean/temporal-workflow";
import type { WorkflowChainRuntime } from "@bpmn-lean/temporal-workflow";

export type FenceProbeInput = Readonly<{
  fence: "rollover" | "terminal";
  stimulus: ExternallyRetryableStimulus;
  receipt: TerminalProcessReceipt;
  successor?: boolean;
}>;

/** Uses the production validator and recovery ledger while the test controls the Run boundary. */
export async function commandFenceProbe(input: FenceProbeInput): Promise<WorkflowTerminalResultV1> {
  let released = false;
  let commits = 0;
  const runtime: WorkflowChainRuntime = {
    eventHistoryEventLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryEvents),
    eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes),
    runId: workflowInfo().runId,
    runOrdinal: input.successor === true ? 2 : 1,
    firstExecutionRunId: workflowInfo().firstExecutionRunId,
    segmentDirectory: { format: "bpmn-lean.workflow-publication-segment-directory.v1", segments: [] },
    recovery: new WorkflowCommandRecoveryLedger(),
    capacity: new WorkflowChainCapacityState({
      processInstanceId: input.receipt.processInstanceId,
      runOrdinal: input.successor === true ? 2 : 1,
    }),
    commandCapacity: new WorkflowCommandCapacityState(),
  };
  const fence = input.successor === true ? WorkflowChainFenceState.Active
    : input.fence === "rollover" ? WorkflowChainFenceState.Rollover : WorkflowChainFenceState.Terminal;
  setHandler(defineSignal("releaseFence"), () => { released = true; });
  setHandler(defineQuery("fenceAudit"), () => ({ commits, entries: runtime.recovery.snapshot() }));
  setHandler(defineQuery<unknown, [WorkflowChainCommandRecoveryRequest]>(
    bpmnWorkflowChainCommandRecoveryQueryName,
  ), (request) => runtime.recovery.projectResponse(input.receipt.processInstanceId, request,
    input.fence === "terminal" && released
      ? { kind: WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry, receipt: input.receipt }
      : { kind: WorkflowChainCommandRecoveryResponseKind.UnknownWhileActive }));
  setHandler(defineUpdate<CommandOutcome, [ExternallyRetryableStimulus]>("fencedCommand"), (stimulus) => {
    if (!sameStimulus(stimulus, input.stimulus) || currentUpdateInfo()!.id !== contentBoundUpdateId(input.stimulus)) {
      throw new Error("Fence recovery changed command content or Update identity");
    }
    const admission = runtime.recovery.preflight(stimulus);
    switch (admission.kind) {
      case WorkflowCommandRecoveryPreflightKind.Resolved:
        return admission.outcome;
      case WorkflowCommandRecoveryPreflightKind.Admitted:
        commits += 1;
        runtime.recovery.record(admission.admission, CommandOutcome.Committed);
        return CommandOutcome.Committed;
      default:
        throw new Error("Unexpected probe recovery admission");
    }
  }, { validator: (stimulus) => validateWorkflowChainUpdate(runtime, fence, stimulus, 1) });
  await condition(() => released);
  if (input.fence === "rollover" && input.successor !== true) {
    return continueAsNew<typeof commandFenceProbe>({ ...input, successor: true });
  }
  return { format: workflowTerminalResultFormatV1, receipt: input.receipt, entries: runtime.recovery.snapshot() };
}

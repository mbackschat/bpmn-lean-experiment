/** Terminal semantic-state detection and ordinary Workflow receipt construction. */
import {
  ApplicationFailure,
} from "@temporalio/workflow";
import {
  CanonicalObservationKind,
  ControlStateKind,
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  RuntimeState,
  SemanticProcessProgram,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type {
  TerminalProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import {
  processTerminalReceiptFormatV1,
} from "@bpmn-lean/temporal-protocol";

export function isTerminalProcessState(state: RuntimeState): boolean {
  return state.control.kind === ControlStateKind.Completed ||
    state.control.kind === ControlStateKind.Cancelled;
}

export function terminalProcessReceipt(
  semanticProcess: SemanticProcessProgram,
  processInstanceId: string,
  state: RuntimeState,
  trace: ReadonlyArray<CanonicalObservation>,
): TerminalProcessReceipt {
  switch (state.control.kind) {
    case ControlStateKind.Completed:
      return {
        format: processTerminalReceiptFormatV1,
        definition: semanticProcess.identity,
        processId: semanticProcess.processId,
        processInstanceId,
        finalState: requireCompletedState(trace, processInstanceId),
      };
    case ControlStateKind.Cancelled:
      return {
        format: processTerminalReceiptFormatV1,
        definition: semanticProcess.identity,
        processId: semanticProcess.processId,
        processInstanceId,
        finalState: requireCancelledState(trace, processInstanceId),
      };
    case ControlStateKind.NotStarted:
    case ControlStateKind.Running:
      throw terminalReceiptFailure();
  }
}

function requireCompletedState(
  trace: ReadonlyArray<CanonicalObservation>,
  processInstanceId: string,
): StateObservation & { status: ProcessStatus.Completed } {
  const finalState = trace.findLast(
    (observation): observation is StateObservation & {
      status: ProcessStatus.Completed;
    } =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  if (finalState === undefined || finalState.instanceId !== processInstanceId) {
    throw terminalReceiptFailure();
  }
  return finalState;
}

function requireCancelledState(
  trace: ReadonlyArray<CanonicalObservation>,
  processInstanceId: string,
): StateObservation & { status: ProcessStatus.Cancelled } {
  const finalState = trace.findLast(
    (observation): observation is StateObservation & {
      status: ProcessStatus.Cancelled;
    } =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Cancelled,
  );
  if (finalState === undefined || finalState.instanceId !== processInstanceId) {
    throw terminalReceiptFailure();
  }
  return finalState;
}

function terminalReceiptFailure(): ApplicationFailure {
  return ApplicationFailure.nonRetryable(
    "Terminal semantic Process has no matching final observation",
    "BpmnTerminalReceiptFailure",
  );
}

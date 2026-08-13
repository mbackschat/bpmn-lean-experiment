/** One admitted BPMN model executed through the production external-Temporal runtime. */
import { readFile } from "node:fs/promises";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  BpmnSourceDiagnostic,
  BpmnSourceIdentity,
} from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  BpmnProcessAdmissionResultKind,
  BpmnProcessStartResultKind,
  ExternalTemporalRuntime,
  HostInteractionEventKind,
  HostInteractionResultKind,
  assessBpmnProcessAdmission,
  createHostEffectActivities,
  driveHostInteractions,
  isCancelledProcessReceipt,
  isCompletedProcessReceipt,
  isTerminalProcessReceipt,
  processWorkflowId,
  readBpmnProcessTrace,
  readUserTaskDetail,
  startBpmnProcess,
  submitMessageDelivery,
  submitIncidentProcessCancellation,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-runner";
import type {
  BpmnProcessAdmissionFailure,
  CancelledProcessReceipt,
  CompletedProcessReceipt,
  ExternalTemporalRuntimeOptions,
  HostInteractionEvent,
  HostInteractionResult,
} from "@bpmn-lean/temporal-runner";

import {
  validateRunnableMvpConfig,
} from "./runnable-mvp-config.ts";
import type { RunnableMvpConfig } from "./runnable-mvp-config.ts";
import { createRunnableMvpStartStimulus } from "./runnable-mvp-start.ts";

export const RunnableMvpEventKind = {
  SourceAdmissionAccepted: "sourceAdmissionAccepted",
  SourceAdmissionRejected: "sourceAdmissionRejected",
  ProcessAdmissionRejected: "processAdmissionRejected",
  ProcessStarted: "processStarted",
  ProcessState: "processState",
  InteractionReady: HostInteractionEventKind.InteractionReady,
  DelayStarted: HostInteractionEventKind.DelayStarted,
  DelayFinished: HostInteractionEventKind.DelayFinished,
  InteractionResolved: HostInteractionEventKind.InteractionResolved,
  HostWaitObserved: HostInteractionEventKind.HostWaitObserved,
  InteractionRefused: "interactionRefused",
  ProcessCompleted: "processCompleted",
  ProcessCancelled: "processCancelled",
} as const;

export type RunnableMvpEvent = DeepReadonly<
  | {
      kind: typeof RunnableMvpEventKind.SourceAdmissionAccepted;
      source: BpmnSourceIdentity;
      semanticProfile: string;
      processId: string;
    }
  | {
      kind: typeof RunnableMvpEventKind.SourceAdmissionRejected;
      source: BpmnSourceIdentity;
      diagnostics: BpmnSourceDiagnostic[];
    }
  | {
      kind: typeof RunnableMvpEventKind.ProcessAdmissionRejected;
      failure: BpmnProcessAdmissionFailure;
    }
  | {
      kind: typeof RunnableMvpEventKind.ProcessStarted;
      processId: string;
      processInstanceId: string;
      temporalWorkflowId: string;
      temporal: Pick<
        ExternalTemporalRuntimeOptions,
        "namespace" | "taskQueue"
      >;
    }
  | {
      kind: typeof RunnableMvpEventKind.ProcessState;
      state: StateObservation;
    }
  | Exclude<
      HostInteractionEvent,
      { kind: typeof HostInteractionEventKind.StateObserved }
    >
  | {
      kind: typeof RunnableMvpEventKind.InteractionRefused;
      refusal: Extract<
        HostInteractionResult,
        { kind: typeof HostInteractionResultKind.Refused }
      >;
    }
  | {
      kind: typeof RunnableMvpEventKind.ProcessCompleted;
      receipt: CompletedProcessReceipt;
    }
  | {
      kind: typeof RunnableMvpEventKind.ProcessCancelled;
      receipt: CancelledProcessReceipt;
    }
>;

export const RunnableMvpResultKind = {
  Completed: "completed",
  Cancelled: "cancelled",
  SourceAdmissionRejected: "sourceAdmissionRejected",
  ProcessAdmissionRejected: "processAdmissionRejected",
  InteractionRefused: "interactionRefused",
} as const;

export type RunnableMvpResult = DeepReadonly<
  | {
      kind: typeof RunnableMvpResultKind.Completed;
      receipt: CompletedProcessReceipt;
    }
  | {
      kind: typeof RunnableMvpResultKind.Cancelled;
      receipt: CancelledProcessReceipt;
    }
  | {
      kind: typeof RunnableMvpResultKind.SourceAdmissionRejected;
      diagnostics: BpmnSourceDiagnostic[];
    }
  | {
      kind: typeof RunnableMvpResultKind.ProcessAdmissionRejected;
      failure: BpmnProcessAdmissionFailure;
    }
  | {
      kind: typeof RunnableMvpResultKind.InteractionRefused;
      refusal: Extract<
        HostInteractionResult,
        { kind: typeof HostInteractionResultKind.Refused }
      >;
    }
>;

type RuntimeConnect = typeof ExternalTemporalRuntime.connect;

export type RunnableMvpDependencies = Readonly<{
  connect: RuntimeConnect;
}>;

const productionDependencies: RunnableMvpDependencies = {
  connect: (options, activities) =>
    ExternalTemporalRuntime.connect(options, activities),
};

export async function runRunnableTemporalMvp(
  config: RunnableMvpConfig,
  observe: (event: RunnableMvpEvent) => void = () => undefined,
  dependencies: RunnableMvpDependencies = productionDependencies,
): Promise<RunnableMvpResult> {
  validateRunnableMvpConfig(config);
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(config.bpmn.file),
    sourceId: config.bpmn.sourceId,
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: config.bpmn.semanticProfile,
    limits: config.bpmn.limits,
  });
  switch (compilation.status) {
    case BpmnCompilationStatus.Rejected: {
      observe({
        kind: RunnableMvpEventKind.SourceAdmissionRejected,
        source: compilation.source,
        diagnostics: compilation.diagnostics,
      });
      return {
        kind: RunnableMvpResultKind.SourceAdmissionRejected,
        diagnostics: compilation.diagnostics,
      };
    }
    case BpmnCompilationStatus.Accepted:
      break;
    default:
      return assertNever(compilation);
  }

  observe({
    kind: RunnableMvpEventKind.SourceAdmissionAccepted,
    source: compilation.source,
    semanticProfile: compilation.semanticProcess.identity.semanticProfile,
    processId: compilation.semanticProcess.processId,
  });
  const start = createRunnableMvpStartStimulus(
    config,
    compilation.semanticProcess,
  );
  const admission = assessBpmnProcessAdmission(
    start,
    compilation.semanticProcess,
  );
  switch (admission.kind) {
    case BpmnProcessAdmissionResultKind.Rejected:
      observe({
        kind: RunnableMvpEventKind.ProcessAdmissionRejected,
        failure: admission.failure,
      });
      return {
        kind: RunnableMvpResultKind.ProcessAdmissionRejected,
        failure: admission.failure,
      };
    case BpmnProcessAdmissionResultKind.Admitted:
      break;
    default:
      return assertNever(admission);
  }

  const runtime = await dependencies.connect(
    config.temporal,
    createHostEffectActivities(config.effectHandlers),
  );
  try {
    runtime.assertHealthy();
    const started = await startBpmnProcess(
      runtime.workflowClient,
      start,
      compilation.semanticProcess,
      { taskQueue: config.temporal.taskQueue },
    );
    switch (started.kind) {
      case BpmnProcessStartResultKind.Rejected:
        observe({
          kind: RunnableMvpEventKind.ProcessAdmissionRejected,
          failure: started.failure,
        });
        return {
          kind: RunnableMvpResultKind.ProcessAdmissionRejected,
          failure: started.failure,
        };
      case BpmnProcessStartResultKind.Started:
        break;
      default:
        return assertNever(started);
    }
    observe({
      kind: RunnableMvpEventKind.ProcessStarted,
      processId: start.processId,
      processInstanceId: start.instanceId,
      temporalWorkflowId: processWorkflowId(start.instanceId),
      temporal: {
        namespace: config.temporal.namespace,
        taskQueue: config.temporal.taskQueue,
      },
    });

    const driven = await driveHostInteractions(
      config.interactions,
      {
        readState: () => readLatestState(
          runtime.workflowClient,
          start.instanceId,
        ),
        readUserTaskDetail: (request) => readUserTaskDetail(
          runtime.workflowClient,
          start.instanceId,
          request,
        ),
        submitCompletion: (stimulus) => submitUserTaskCompletion(
          runtime.workflowClient,
          start.instanceId,
          stimulus,
        ),
        submitMessage: (stimulus) => submitMessageDelivery(
          runtime.workflowClient,
          start.instanceId,
          stimulus,
        ),
        submitCancellation: (stimulus) =>
          submitIncidentProcessCancellation(
            runtime.workflowClient,
            start.instanceId,
            stimulus,
          ),
      },
      undefined,
      (event) => observeDriverEvent(event, observe),
    );
    switch (driven.kind) {
      case HostInteractionResultKind.Refused:
        observe({
          kind: RunnableMvpEventKind.InteractionRefused,
          refusal: driven,
        });
        return {
          kind: RunnableMvpResultKind.InteractionRefused,
          refusal: driven,
        };
      case HostInteractionResultKind.Driven:
        break;
      default:
        return assertNever(driven);
    }

    const receipt: unknown = await started.handle.result();
    if (!isTerminalProcessReceipt(receipt)) {
      throw new TypeError(
        "Temporal Workflow returned a malformed terminal Process receipt",
      );
    }
    runtime.assertHealthy();
    if (isCompletedProcessReceipt(receipt)) {
      observe({ kind: RunnableMvpEventKind.ProcessCompleted, receipt });
      return { kind: RunnableMvpResultKind.Completed, receipt };
    }
    if (isCancelledProcessReceipt(receipt)) {
      observe({ kind: RunnableMvpEventKind.ProcessCancelled, receipt });
      return { kind: RunnableMvpResultKind.Cancelled, receipt };
    }
    throw new TypeError("Terminal receipt status was not recognized");
  } finally {
    await runtime.shutdown();
  }
}

/**
 * Reads the newest committed canonical state of one addressed Process.
 *
 * The Query returns the retained observation trace, whose last state is the current one. A trace
 * without any state observation means the Workflow never published one, which is an infrastructure
 * failure rather than a semantic outcome.
 */
async function readLatestState(
  client: Parameters<typeof readBpmnProcessTrace>[0],
  processInstanceId: string,
): Promise<StateObservation> {
  const trace = await readBpmnProcessTrace(client, processInstanceId);
  const state = trace.findLast(
    (observation): observation is StateObservation =>
      observation.kind === CanonicalObservationKind.State,
  );
  if (state === undefined || state.instanceId !== processInstanceId) {
    throw new TypeError(
      "Addressed Process did not expose a committed canonical state",
    );
  }
  return state;
}

/** Republishes driver events as product records, mapping observed state to the product's own kind. */
function observeDriverEvent(
  event: HostInteractionEvent,
  observe: (event: RunnableMvpEvent) => void,
): void {
  switch (event.kind) {
    case HostInteractionEventKind.StateObserved:
      observe({
        kind: RunnableMvpEventKind.ProcessState,
        state: event.state,
      });
      return;
    case HostInteractionEventKind.InteractionReady:
    case HostInteractionEventKind.DelayStarted:
    case HostInteractionEventKind.DelayFinished:
    case HostInteractionEventKind.InteractionResolved:
    case HostInteractionEventKind.HostWaitObserved:
      observe(event);
      return;
    default:
      assertNever(event);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported runnable MVP variant: ${String(value)}`);
}

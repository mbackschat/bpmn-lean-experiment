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
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  BpmnProcessAdmissionResultKind,
  BpmnProcessStartResultKind,
  DummyUserTaskActorEventKind,
  DummyUserTaskActorResultKind,
  ExternalTemporalRuntime,
  ProcessCommandResultKind,
  assessBpmnProcessAdmission,
  isCompletedProcessReceipt,
  listOpenUserTasks,
  processWorkflowId,
  readBpmnProcessTrace,
  readUserTaskDetail,
  runDummyUserTaskActor,
  startBpmnProcess,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-adapter";
import type {
  BpmnProcessAdmissionFailure,
  CompletedProcessReceipt,
  DummyUserTaskActorEvent,
  DummyUserTaskActorResult,
  ExternalTemporalRuntimeOptions,
  ProcessCommandResult,
} from "@bpmn-lean/temporal-adapter";

import {
  validateRunnableMvpConfig,
} from "./runnable-mvp-config.ts";
import type { RunnableMvpConfig } from "./runnable-mvp-config.ts";

export const RunnableMvpEventKind = {
  SourceAdmissionAccepted: "sourceAdmissionAccepted",
  SourceAdmissionRejected: "sourceAdmissionRejected",
  ProcessAdmissionRejected: "processAdmissionRejected",
  ProcessStarted: "processStarted",
  ProcessState: "processState",
  TaskReady: DummyUserTaskActorEventKind.TaskReady,
  DelayStarted: DummyUserTaskActorEventKind.DelayStarted,
  DelayFinished: DummyUserTaskActorEventKind.DelayFinished,
  CompletionResolved: DummyUserTaskActorEventKind.CompletionResolved,
  ActorRefused: "actorRefused",
  CompletionNotCommitted: "completionNotCommitted",
  ProcessCompleted: "processCompleted",
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
  | DummyUserTaskActorEvent
  | {
      kind: typeof RunnableMvpEventKind.ActorRefused;
      refusal: Extract<
        DummyUserTaskActorResult,
        { kind: "refused" }
      >;
    }
  | {
      kind: typeof RunnableMvpEventKind.CompletionNotCommitted;
      result: ProcessCommandResult;
    }
  | {
      kind: typeof RunnableMvpEventKind.ProcessCompleted;
      receipt: CompletedProcessReceipt;
    }
>;

export const RunnableMvpResultKind = {
  Completed: "completed",
  SourceAdmissionRejected: "sourceAdmissionRejected",
  ProcessAdmissionRejected: "processAdmissionRejected",
  ActorRefused: "actorRefused",
  CompletionNotCommitted: "completionNotCommitted",
} as const;

export type RunnableMvpResult = DeepReadonly<
  | {
      kind: typeof RunnableMvpResultKind.Completed;
      receipt: CompletedProcessReceipt;
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
      kind: typeof RunnableMvpResultKind.ActorRefused;
      refusal: Extract<DummyUserTaskActorResult, { kind: "refused" }>;
    }
  | {
      kind: typeof RunnableMvpResultKind.CompletionNotCommitted;
      result: ProcessCommandResult;
    }
>;

type RuntimeConnect = typeof ExternalTemporalRuntime.connect;

export type RunnableMvpDependencies = Readonly<{
  connect: RuntimeConnect;
}>;

const productionDependencies: RunnableMvpDependencies = {
  connect: (options) => ExternalTemporalRuntime.connect(options),
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
  const start = createStartStimulus(config, compilation.semanticProcess.processId);
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

  const runtime = await dependencies.connect(config.temporal);
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

    const waitingState = requireRunningState(
      await readBpmnProcessTrace(runtime.workflowClient, start.instanceId),
      start.instanceId,
    );
    observe({ kind: RunnableMvpEventKind.ProcessState, state: waitingState });

    const actorResult = await runDummyUserTaskActor(
      config.dummyUserTask,
      {
        listOpenUserTasks: () => listOpenUserTasks(
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
      },
      undefined,
      (event) => observeActorEvent(event, observe),
    );
    switch (actorResult.kind) {
      case DummyUserTaskActorResultKind.Refused:
        observe({
          kind: RunnableMvpEventKind.ActorRefused,
          refusal: actorResult,
        });
        return {
          kind: RunnableMvpResultKind.ActorRefused,
          refusal: actorResult,
        };
      case DummyUserTaskActorResultKind.Submitted:
        break;
      default:
        return assertNever(actorResult);
    }
    if (!isCommittedCompletion(actorResult.completion)) {
      observe({
        kind: RunnableMvpEventKind.CompletionNotCommitted,
        result: actorResult.completion,
      });
      return {
        kind: RunnableMvpResultKind.CompletionNotCommitted,
        result: actorResult.completion,
      };
    }

    const receipt: unknown = await started.handle.result();
    if (!isCompletedProcessReceipt(receipt)) {
      throw new TypeError(
        "Temporal Workflow returned a malformed completed Process receipt",
      );
    }
    observe({ kind: RunnableMvpEventKind.ProcessCompleted, receipt });
    runtime.assertHealthy();
    return { kind: RunnableMvpResultKind.Completed, receipt };
  } finally {
    await runtime.shutdown();
  }
}

function createStartStimulus(
  config: RunnableMvpConfig,
  processId: string,
): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId: `mvp-start:${config.process.instanceId}`,
    processId,
    instanceId: config.process.instanceId,
    initialVariables: config.process.initialVariables,
  };
}

function requireRunningState(
  trace: ReadonlyArray<
    import("@bpmn-lean/semantic-core").CanonicalObservation
  >,
  processInstanceId: string,
): StateObservation & { status: ProcessStatus.Running } {
  const state = trace.findLast(
    (
      observation,
    ): observation is StateObservation & { status: ProcessStatus.Running } =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Running,
  );
  if (state === undefined || state.instanceId !== processInstanceId) {
    throw new TypeError(
      "Started Process did not expose its expected stable running state",
    );
  }
  return state;
}

function observeActorEvent(
  event: DummyUserTaskActorEvent,
  observe: (event: RunnableMvpEvent) => void,
): void {
  switch (event.kind) {
    case DummyUserTaskActorEventKind.TaskReady:
    case DummyUserTaskActorEventKind.DelayStarted:
    case DummyUserTaskActorEventKind.DelayFinished:
    case DummyUserTaskActorEventKind.CompletionResolved:
      observe(event);
      return;
  }
  assertNever(event);
}

function isCommittedCompletion(result: ProcessCommandResult): boolean {
  return result.kind === ProcessCommandResultKind.Semantic &&
    result.outcome === CommandOutcome.Committed;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported runnable MVP variant: ${String(value)}`);
}

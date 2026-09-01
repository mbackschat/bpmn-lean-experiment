import {
  CompensationCompletionFactKind,
  MessageChannelKind,
  MultiInstanceCompensationCompletionOutcome,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  StimulusKind,
  type CompensationActivityRetentionDeclaration,
  type CompensationCompletionFacts,
  type RuntimeState,
  type SemanticOperation,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";

export function withLimits(
  source: SemanticProcessProgram,
  limits: { readonly maxRecords: number; readonly maxCanonicalBytes: number },
): SemanticProcessProgram {
  const declaration = source.compensationActivityRetention;
  if (declaration === undefined) throw new TypeError("expected retention declaration");
  return {
    ...source,
    compensationActivityRetention: { ...declaration, limits },
  };
}

export function programForTarget(
  source: SemanticProcessProgram,
  declaration: CompensationActivityRetentionDeclaration,
  kind:
    | SemanticOperationKind.AwaitUserTask
    | SemanticOperationKind.AwaitDataInputUserTask
    | SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
    | SemanticOperationKind.AwaitParallelMultiInstanceUserTask,
  targetElementId: string,
): SemanticProcessProgram {
  const wait = source.operations.find(({ id }) => id === "Wait_Eligible");
  if (wait === undefined || !("task" in wait)) throw new TypeError("expected task wait");
  const replacement = {
    ...wait,
    kind,
    origin: { ...wait.origin, elementId: targetElementId },
    task: { ...wait.task, elementId: targetElementId },
  } as unknown as SemanticOperation;
  return {
    ...source,
    operations: source.operations.map((operation) =>
      operation.id === wait.id ? replacement : operation
    ),
    compensationActivityRetention: {
      ...declaration,
      targets: [{
        activityElementId: targetElementId,
        boundaryEventElementId: `Boundary_${targetElementId}`,
        compensationActivityElementId: `Undo_${targetElementId}`,
      }],
    },
  };
}

export function stateForTarget(
  source: RuntimeState,
  targetElementId: string,
): RuntimeState {
  const retention = source.compensationActivityRetentions?.[0];
  if (retention === undefined) throw new TypeError("expected retention register");
  return {
    ...source,
    compensationActivityRetentions: [{
      ...retention,
      records: [],
    }],
    activityActivations: [{ elementId: targetElementId, count: 1 }],
  };
}

export function multiInstanceFacts(
  activity: CompensationCompletionFacts["activity"],
  plannedInstances: number,
  successfullyCompletedInstances: number,
  outcome = MultiInstanceCompensationCompletionOutcome.AllSuccessfulCompletion,
): CompensationCompletionFacts {
  return {
    kind: CompensationCompletionFactKind.MultiInstanceUserTask,
    activity: { ...activity, activityElementId: "Task_Multi" },
    plannedInstances,
    successfullyCompletedInstances,
    outcome,
  };
}

export function requireOperation(
  source: SemanticProcessProgram,
  kind: SemanticOperationKind.CompleteScope,
): Extract<SemanticOperation, { kind: SemanticOperationKind.CompleteScope }> {
  const operation = source.operations.find((candidate) => candidate.kind === kind);
  if (operation?.kind !== SemanticOperationKind.CompleteScope) {
    throw new TypeError(`expected ${kind}`);
  }
  return operation;
}

export function startFixture(
  kind:
    | SemanticOperationKind.Initiate
    | SemanticOperationKind.InitiateMessage
    | SemanticOperationKind.InitiateTimer,
  channel?: {
    readonly kind: typeof MessageChannelKind.OperationMessage;
    readonly interfaceId: string;
    readonly interfaceOperationId: string;
    readonly messageId: string;
  },
) {
  const suffix = kind;
  const processId = `Process_${suffix}`;
  const taskElementId = `Task_${suffix}`;
  const startElementId = `Start_${suffix}`;
  const initiation = kind === SemanticOperationKind.Initiate
    ? {
        ...operationBase(startElementId),
        kind,
        output: "place:Flow_StartToTask",
      }
    : kind === SemanticOperationKind.InitiateMessage
    ? {
        ...operationBase(startElementId),
        kind,
        channel: channel ?? (() => {
          throw new TypeError("Message start requires a channel");
        })(),
        outputs: ["place:Flow_StartToTask"] as [string],
      }
    : {
        ...operationBase(startElementId),
        kind,
        timer: { durationMs: 1000 as const },
        outputs: ["place:Flow_StartToTask"] as [string],
      };
  const profile = kind === SemanticOperationKind.Initiate
    ? SemanticProfileId.UserTask
    : kind === SemanticOperationKind.InitiateMessage
    ? SemanticProfileId.MessageStart
    : SemanticProfileId.TimerStart;
  const startProgram = rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: profile,
      sourceId: `source-${suffix}`,
      sourceSha256: "1".repeat(64),
      sourceOverlay: null,
    },
    processId,
    controlPlaces: [controlPlace("Flow_StartToTask"), controlPlace("Flow_TaskToEnd")],
    operations: [
      {
        ...operationBase("End"),
        kind: SemanticOperationKind.ReachNoneEnd,
        input: "place:Flow_TaskToEnd",
      },
      initiation,
      {
        ...operationBase(taskElementId),
        kind: SemanticOperationKind.AwaitUserTask,
        input: "place:Flow_StartToTask",
        output: "place:Flow_TaskToEnd",
        task: { elementId: taskElementId, name: null },
      },
    ],
    compensationActivityRetention: {
      definitionScopeId: `scope:${processId}`,
      targets: [{
        activityElementId: taskElementId,
        boundaryEventElementId: `Boundary_${suffix}`,
        compensationActivityElementId: `Undo_${suffix}`,
      }],
      limits: { maxRecords: 4, maxCanonicalBytes: 65_536 },
    },
  });
  const instanceId = `Instance_${suffix}`;
  const stimulus = kind === SemanticOperationKind.Initiate
    ? {
        kind: StimulusKind.StartProcess,
        commandId: `command-${suffix}`,
        processId,
        instanceId,
        initialVariables: [],
      } as const
    : kind === SemanticOperationKind.InitiateMessage
    ? {
        kind: StimulusKind.TriggerMessageStart,
        commandId: `command-${suffix}`,
        processId,
        instanceId,
        startEventId: startElementId,
        channel: channel as NonNullable<typeof channel>,
      } as const
    : {
        kind: StimulusKind.TriggerTimerStart,
        commandId: `command-${suffix}`,
        processId,
        instanceId,
        startEventId: startElementId,
      } as const;
  return { startProgram, stimulus };
}

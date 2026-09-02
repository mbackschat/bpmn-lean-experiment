import {
  EffectOperation,
  EffectProtocol,
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  compareCanonicalStrings,
  initialState,
  type CompleteUserTaskInstanceStimulus,
  type ControlPlace,
  type RuntimeState,
  type SemanticOperation,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

export const compensationProcessId = "Process_Compensation_Trigger";
export const compensationInstanceId = "Instance_Compensation_Trigger";
export const compensationRootScopeId = `scope:${compensationProcessId}`;
export const compensationSubjectBScopeId = "scope:B";
export const compensationHandlerBScopeId = "scope:Undo_B";
export const compensationTriggerOperationId = "operation:Trigger";

const descriptor = {
  protocol: EffectProtocol.Activity,
  operation: EffectOperation.CompensationSingleEffect,
} as const;

const subjectA = {
  kind: "boundaryActivity",
  subjectElementId: "A",
  body: {
    kind: "singleEffect",
    handlerElementId: "Undo_A",
    effectElementId: "Undo_A",
    descriptor,
    input: { kind: "empty" },
  },
} as const;

const subjectB = {
  kind: "eventSubProcess",
  parentScopeId: compensationSubjectBScopeId,
  handlerScopeId: compensationHandlerBScopeId,
  body: {
    kind: "singleEffect",
    handlerElementId: "Undo_B",
    effectElementId: "Effect_Undo_B",
    descriptor,
    input: {
      kind: "restoredProcessBinding",
      sourceName: "completionContext",
      argumentName: "archivedContext",
    },
  },
} as const;

const subjectC = {
  kind: "boundaryActivity",
  subjectElementId: "C",
  body: {
    kind: "singleEffect",
    handlerElementId: "Undo_C",
    effectElementId: "Undo_C",
    descriptor,
    input: { kind: "empty" },
  },
} as const;

const controlPlaces = [
  "A_To_B",
  "B_Entry",
  "B_Task_To_End",
  "B_To_C",
  "C_To_Trigger",
  "Start_To_A",
  "Trigger_To_End",
].map((elementId): ControlPlace => ({
  id: `place:${elementId}`,
  origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId },
})).sort((left, right) => compareCanonicalStrings(left.id, right.id));

const operations = ([
  {
    id: "operation:A",
    kind: SemanticOperationKind.AwaitUserTask,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "A" },
    input: "place:Start_To_A",
    output: "place:A_To_B",
    task: { elementId: "A", name: null },
  },
  {
    id: "operation:B",
    kind: SemanticOperationKind.EnterScope,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "B" },
    input: "place:A_To_B",
    childEntry: "place:B_Entry",
    childScopeId: compensationSubjectBScopeId,
  },
  {
    id: "operation:B_End",
    kind: SemanticOperationKind.ReachNoneEnd,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "B_End" },
    input: "place:B_Task_To_End",
  },
  {
    id: "operation:B_Task",
    kind: SemanticOperationKind.AwaitUserTask,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "B_Task" },
    input: "place:B_Entry",
    output: "place:B_Task_To_End",
    task: { elementId: "B_Task", name: null },
  },
  {
    id: "operation:C",
    kind: SemanticOperationKind.AwaitUserTask,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "C" },
    input: "place:B_To_C",
    output: "place:C_To_Trigger",
    task: { elementId: "C", name: null },
  },
  {
    id: "operation:End",
    kind: SemanticOperationKind.ReachNoneEnd,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "End" },
    input: "place:Trigger_To_End",
  },
  {
    id: "operation:Start",
    kind: SemanticOperationKind.Initiate,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Start" },
    output: "place:Start_To_A",
  },
  {
    id: compensationTriggerOperationId,
    kind: SemanticOperationKind.TriggerCompensation,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Trigger" },
    definitionScopeId: compensationRootScopeId,
    input: "place:C_To_Trigger",
    output: "place:Trigger_To_End",
  },
  {
    id: `operation:complete-scope:${compensationRootScopeId}`,
    kind: SemanticOperationKind.CompleteScope,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: compensationProcessId },
    scopeId: compensationRootScopeId,
    parentOutput: null,
  },
  {
    id: `operation:complete-scope:${compensationSubjectBScopeId}`,
    kind: SemanticOperationKind.CompleteScope,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: "B" },
    scopeId: compensationSubjectBScopeId,
    parentOutput: "place:B_To_C",
  },
] satisfies SemanticOperation[]).sort((left, right) =>
  compareCanonicalStrings(left.id, right.id)
);

export const compensationSemanticProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: SemanticProfileId.UserTask,
    sourceId: "compensation-trigger-handler-semantics",
    sourceSha256: "1".repeat(64),
    sourceOverlay: null,
  },
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  processId: compensationProcessId,
  definitionScopes: [
    {
      id: compensationHandlerBScopeId,
      parentScopeId: compensationSubjectBScopeId,
      originElementId: "Undo_B",
    },
    {
      id: compensationRootScopeId,
      parentScopeId: null,
      originElementId: compensationProcessId,
    },
    {
      id: compensationSubjectBScopeId,
      parentScopeId: compensationRootScopeId,
      originElementId: "B",
    },
  ].sort((left, right) => compareCanonicalStrings(left.id, right.id)),
  operationScopes: operations.map(({ id: operationId }) => ({
    operationId,
    scopeId: operationId.includes(":B_") ||
        operationId === `operation:complete-scope:${compensationSubjectBScopeId}`
      ? compensationSubjectBScopeId
      : compensationRootScopeId,
  })),
  controlPlaceScopes: controlPlaces.map(({ id: controlPlaceId }) => ({
    controlPlaceId,
    scopeId: controlPlaceId === "place:B_Entry" ||
        controlPlaceId === "place:B_Task_To_End"
      ? compensationSubjectBScopeId
      : compensationRootScopeId,
  })),
  controlPlaces,
  operations,
  compensationActivityRetention: {
    definitionScopeId: compensationRootScopeId,
    targets: [
      {
        activityElementId: "A",
        boundaryEventElementId: "Boundary_A",
        compensationActivityElementId: "Undo_A",
      },
      {
        activityElementId: "C",
        boundaryEventElementId: "Boundary_C",
        compensationActivityElementId: "Undo_C",
      },
    ],
    limits: { maxRecords: 8, maxCanonicalBytes: 65_536 },
  },
  compensationEventSubProcessSnapshots: {
    targets: [{
      parentScopeId: compensationSubjectBScopeId,
      handlerScopeId: compensationHandlerBScopeId,
    }],
    limits: { maxRecords: 8, maxCanonicalBytes: 65_536 },
  },
  compensationExecution: {
    definitionScopeId: compensationRootScopeId,
    triggerOperationId: compensationTriggerOperationId,
    subjects: [subjectA, subjectB, subjectC],
    dependencies: [{
      predecessorElementId: "A",
      successorElementId: "B",
      reason: "sequenceFlow",
    }],
    limits: { maxTriggers: 2, maxHandlers: 3, maxCanonicalBytes: 65_536 },
  },
} as const satisfies SemanticProcessProgram;

export type TriggerReadyFixture = Readonly<{
  state: RuntimeState;
  completion: CompleteUserTaskInstanceStimulus;
}>;

export function triggerReadyFixture(
  program: SemanticProcessProgram = compensationSemanticProgram,
): TriggerReadyFixture {
  let state = applyStimulus(program, initialState, {
    kind: StimulusKind.StartProcess,
    commandId: "start-compensation",
    processId: compensationProcessId,
    instanceId: compensationInstanceId,
    initialVariables: [{
      name: "completionContext",
      value: { kind: VariableValueKind.String, value: "frozen-at-b-completion" },
    }],
  }).state;
  state = completeTask(program, state, "A", "complete-a");
  state = completeTask(program, state, "B_Task", "complete-b-task");
  state = {
    ...state,
    variables: {
      ...state.variables,
      process: {
        bindings: [{
          name: "completionContext",
          value: { kind: VariableValueKind.String, value: "newer-root-value" },
        }],
      },
    },
  };
  const wait = state.userTaskWaits.find(({ id }) => id.elementId === "C");
  if (wait === undefined) throw new TypeError("fixture did not reach C");
  return {
    state,
    completion: {
      kind: StimulusKind.CompleteUserTaskInstance,
      commandId: "complete-c",
      taskId: wait.id,
      submittedValues: [],
    },
  };
}

function completeTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  elementId: string,
  commandId: string,
): RuntimeState {
  const wait = state.userTaskWaits.find(({ id }) => id.elementId === elementId);
  if (wait === undefined) throw new TypeError(`fixture did not reach ${elementId}`);
  return applyStimulus(program, state, {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId: wait.id,
    submittedValues: [],
  }).state;
}

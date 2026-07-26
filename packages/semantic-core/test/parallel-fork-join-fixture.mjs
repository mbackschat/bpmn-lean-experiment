import {
  ObservationRequestKind,
  ScenarioDocumentKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
} from "../dist/index.js";

const sourceSha256 = "1".repeat(64);

export const parallelProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "parallel-fork-join-draft",
    sourceId: "parallel-two-user-tasks-process",
    sourceSha256,
  },
  processId: "Process_ParallelForkJoin",
  controlPlaces: [
    controlPlace("Flow_AToJoin"),
    controlPlace("Flow_BToJoin"),
    controlPlace("Flow_ForkToA"),
    controlPlace("Flow_ForkToB"),
    controlPlace("Flow_JoinToEnd"),
    controlPlace("Flow_StartToFork"),
  ],
  operations: [
    {
      ...operationBase("EndEvent_1"),
      kind: SemanticOperationKind.Terminate,
      input: "place:Flow_JoinToEnd",
    },
    {
      ...operationBase("Gateway_Fork"),
      kind: SemanticOperationKind.Duplicate,
      input: "place:Flow_StartToFork",
      outputs: ["place:Flow_ForkToA", "place:Flow_ForkToB"],
    },
    {
      ...operationBase("Gateway_Join"),
      kind: SemanticOperationKind.Synchronize,
      inputs: ["place:Flow_AToJoin", "place:Flow_BToJoin"],
      output: "place:Flow_JoinToEnd",
    },
    {
      ...operationBase("StartEvent_1"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToFork",
    },
    {
      ...operationBase("UserTask_A"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_ForkToA",
      output: "place:Flow_AToJoin",
      task: { elementId: "UserTask_A", name: "A" },
    },
    {
      ...operationBase("UserTask_B"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_ForkToB",
      output: "place:Flow_BToJoin",
      task: { elementId: "UserTask_B", name: "B" },
    },
  ],
};

export const parallelScenario = {
  kind: ScenarioDocumentKind.Scenario,
  id: "parallel-fork-join-a-then-b",
  profile: parallelProgram.identity.semanticProfile,
  bpmn: {
    id: parallelProgram.identity.sourceId,
    relativePath: "scenarios/parallel-fork-join/process.bpmn",
    sha256: sourceSha256,
  },
  stimuli: [
    startStimulus(),
    completionStimulus("UserTask_A"),
    completionStimulus("UserTask_B"),
  ],
  observations: [
    ObservationRequestKind.Deployment,
    ObservationRequestKind.CommandResults,
    ObservationRequestKind.ProcessStatus,
    ObservationRequestKind.ActiveWaits,
    ObservationRequestKind.OpenUserTasks,
    ObservationRequestKind.OpenTimers,
    ObservationRequestKind.EnabledInteractions,
    ObservationRequestKind.LogicalTime,
  ],
  provenance: {
    normativeRefs: [
      "BPMN 2.0.2 §10.6.4",
      "BPMN 2.0.2 §13.4.1",
    ],
    cib: {
      repository: "https://github.com/cibseven/cibseven",
      revision: "834a9874760de8a0107f7c1b32806e37f17fb017",
    },
  },
};

export function startStimulus() {
  return {
    kind: StimulusKind.StartProcess,
    commandId: "start-process",
    processId: parallelProgram.processId,
    instanceId: "Instance_1",
  };
}

export function completionStimulus(elementId) {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: {
      processInstanceId: "Instance_1",
      elementId,
      activation: 1,
    },
  };
}

function controlPlace(elementId) {
  return {
    id: `place:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId,
    },
  };
}

function operationBase(elementId) {
  return {
    id: `operation:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId,
    },
  };
}

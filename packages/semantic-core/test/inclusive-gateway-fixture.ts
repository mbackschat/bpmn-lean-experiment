import {
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SimpleBooleanExpressionKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
  VariableBinding,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";

const flows = [
  "Flow_A",
  "Flow_A_Join",
  "Flow_B",
  "Flow_B_Join",
  "Flow_Default",
  "Flow_Default_Join",
  "Flow_End",
  "Flow_Start",
];

export const inclusiveProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-inclusive-gateway-selected-branches-draft",
    sourceId: "inclusive-gateway-selected-branches",
    sourceSha256: "8".repeat(64),
  },
  processId: "Process_Inclusive",
  controlPlaces: flows.map(controlPlace),
  operations: [
    {
      ...operationBase("End"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_End",
    },
    {
      ...operationBase("Join"),
      kind: SemanticOperationKind.SynchronizeSelected,
      inputs: ["place:Flow_A_Join", "place:Flow_B_Join", "place:Flow_Default_Join"],
      output: "place:Flow_End",
      selectionKey: "Split",
    },
    {
      ...operationBase("Split"),
      kind: SemanticOperationKind.SelectMany,
      input: "place:Flow_Start",
      candidates: [
        {
          condition: { kind: SimpleBooleanExpressionKind.IsPresent, variable: "takeA" },
          output: "place:Flow_A",
          expectedJoinInput: "place:Flow_A_Join",
          origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Flow_A" },
        },
        {
          condition: { kind: SimpleBooleanExpressionKind.IsPresent, variable: "takeB" },
          output: "place:Flow_B",
          expectedJoinInput: "place:Flow_B_Join",
          origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Flow_B" },
        },
      ],
      defaultBranch: {
        output: "place:Flow_Default",
        expectedJoinInput: "place:Flow_Default_Join",
        origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Flow_Default" },
      },
      selectionKey: "Split",
    },
    {
      ...operationBase("Start"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_Start",
    },
    task("Task_A", "Flow_A", "Flow_A_Join", "A"),
    task("Task_B", "Flow_B", "Flow_B_Join", "B"),
    task("Task_Default", "Flow_Default", "Flow_Default_Join", "Default"),
  ],
});

export function inclusiveStart(initialVariables: VariableBinding[]): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId: "start-inclusive",
    processId: inclusiveProgram.processId,
    instanceId: "inclusive-instance",
    initialVariables,
  };
}

export function inclusiveCompletion(elementId: "Task_A" | "Task_B" | "Task_Default"): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: {
      processInstanceId: "inclusive-instance",
      elementId,
      activation: 1,
    },
    submittedValues: [],
  };
}

export function present(name: string): VariableBinding {
  return { name, value: { kind: VariableValueKind.Null } };
}

function task(elementId: string, input: string, output: string, name: string) {
  return {
    ...operationBase(elementId),
    kind: SemanticOperationKind.AwaitUserTask,
    input: `place:${input}`,
    output: `place:${output}`,
    task: { elementId, name },
  } as const;
}

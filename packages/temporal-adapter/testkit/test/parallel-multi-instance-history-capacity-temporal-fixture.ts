/** Source-derived maximal fixtures for real-service parallel Multi-Instance capacity. */
import assert from "node:assert/strict";

import {
  SemanticOperationKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  ParallelMultiInstanceCapacityTopology,
} from "@bpmn-lean/temporal-workflow";
import type {
  ParallelMultiInstanceHistoryMeasurement,
} from "@bpmn-lean/temporal-workflow";

import {
  compileExecutionInput,
  loadJson,
} from "./temporal-test-support.ts";
import {
  measureParallelMultiInstanceHistoryCapacity,
} from "./parallel-multi-instance-history-capacity-probe.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/parallel-multi-instance/all.scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/parallel-multi-instance/process.bpmn",
  import.meta.url,
);

export type ParallelMultiInstanceServiceCapacityExecution = Readonly<{
  start: StartProcessStimulus;
  completions: readonly CompleteUserTaskInstanceStimulus[];
  escalationCompletion: CompleteUserTaskInstanceStimulus;
}>;

export type ParallelMultiInstanceServiceCapacityFixture = Readonly<{
  program: SemanticProcessProgram;
  serializer: ParallelMultiInstanceHistoryMeasurement;
  execution: (
    topology: ParallelMultiInstanceCapacityTopology,
  ) => ParallelMultiInstanceServiceCapacityExecution;
}>;

export async function createParallelMultiInstanceServiceCapacityFixture():
Promise<ParallelMultiInstanceServiceCapacityFixture> {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess: program } = await compileExecutionInput(scenario, bpmnUrl);
  const serializer = await measureParallelMultiInstanceHistoryCapacity();
  const operation = program.operations.find(({ kind }) =>
    kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask
  );
  assert.ok(operation?.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask);
  const collection = maximumCollection();

  return {
    program,
    serializer,
    execution: (topology) => {
      const instanceId = `ParallelMultiInstance_Capacity_${topology}`;
      const policy = topology === ParallelMultiInstanceCapacityTopology.EarlyCompletion
        ? "first"
        : "all";
      const start: StartProcessStimulus = {
        kind: StimulusKind.StartProcess,
        commandId: `start-parallel-capacity-${topology}`,
        processId: program.processId,
        instanceId,
        initialVariables: [{
          name: operation.data.input.dataObjectReferenceId,
          value: { kind: VariableValueKind.StringList, value: collection },
        }, {
          name: "completionPolicy",
          value: { kind: VariableValueKind.String, value: policy },
        }],
      };
      const completions = collection.map((value, index) => ({
        kind: StimulusKind.CompleteUserTaskInstance,
        commandId: `complete-parallel-capacity-${topology}-${String(index)}`,
        taskId: {
          processInstanceId: instanceId,
          elementId: operation.task.elementId,
          activation: index + 1,
        },
        submittedValues: [{
          name: operation.data.output.taskDataOutputId,
          value: { kind: VariableValueKind.String, value },
        }],
      } satisfies CompleteUserTaskInstanceStimulus));
      return {
        start,
        completions,
        escalationCompletion: {
          kind: StimulusKind.CompleteUserTaskInstance,
          commandId: `complete-parallel-capacity-escalation-${topology}`,
          taskId: {
            processInstanceId: instanceId,
            elementId: "UserTask_Escalation",
            activation: 1,
          },
          submittedValues: [],
        },
      };
    },
  };
}

function maximumCollection(): string[] {
  const collection = [
    "x".repeat(512),
    ...Array.from({ length: 14 }, () => "x".repeat(509)),
    "x".repeat(505),
  ];
  assert.equal(collection.length, 16);
  return collection;
}

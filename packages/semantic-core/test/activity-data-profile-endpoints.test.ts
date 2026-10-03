import assert from "node:assert/strict";
import test from "node:test";
import {
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticProfileId,
  profileAllowsCheckedProcessShape,
  profileAllowsProgramShape,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  DirectActivityDataInput,
  DirectActivityDataOutput,
  SemanticOperation,
} from "@bpmn-lean/semantic-core";
import { dataInputProgram, directInput } from "./activity-data-input-fixture.ts";

test("existing Activity data profiles admit Property arms only in checked and executable forms", () => {
  const task = dataInputProgram.operations.find((operation) => operation.kind === SemanticOperationKind.AwaitDataInputUserTask);
  assert.ok(task?.kind === SemanticOperationKind.AwaitDataInputUserTask);
  const { directInput: _input, ...base } = task;
  for (const processInput of [false, true]) {
    for (const processOutput of [false, true]) {
      const input: DirectActivityDataInput = {
        ...directInput,
        source: processInput
          ? { kind: "processDataInput", dataInputId: "ProcessInput" }
          : { kind: "property", propertyId: "Request" },
      };
      const output: DirectActivityDataOutput = {
        associationId: "Write", sourceDataOutputId: "TaskOutput", sourceDataOutputName: null,
        target: processOutput
          ? { kind: "processDataOutput", dataOutputId: "ProcessOutput" }
          : { kind: "property", propertyId: "Result" },
      };
      const cases: ReadonlyArray<Readonly<{
        profile: string;
        operation: SemanticOperation;
        node: CheckedNode;
        accepted: boolean;
      }>> = [
        {
          profile: SemanticProfileId.ActivityDataInputUserTask,
          operation: { ...base, kind: SemanticOperationKind.AwaitDataInputUserTask, directInput: input },
          node: { kind: CheckedNodeKind.DataInputUserTask, id: task.task.elementId, name: null, directInput: input },
          accepted: !processInput,
        },
        {
          profile: SemanticProfileId.ActivityDataOutputUserTask,
          operation: { ...base, kind: SemanticOperationKind.AwaitDataOutputUserTask, directOutput: output },
          node: { kind: CheckedNodeKind.DataOutputUserTask, id: task.task.elementId, name: null, directOutput: output },
          accepted: !processOutput,
        },
        {
          profile: SemanticProfileId.ActivityDataInputOutputUserTask,
          operation: { ...base, kind: SemanticOperationKind.AwaitDataInputOutputUserTask, directInput: input, directOutput: output },
          node: { kind: CheckedNodeKind.DataInputOutputUserTask, id: task.task.elementId, name: null, directInput: input, directOutput: output },
          accepted: !processInput && !processOutput,
        },
      ];
      for (const { profile, operation, node, accepted } of cases) {
        const operations: ReadonlyArray<SemanticOperation> = dataInputProgram.operations.map((candidate) => candidate.id === task.id ? operation : candidate);
        const nodes: ReadonlyArray<CheckedNode> = [
          { kind: CheckedNodeKind.NoneStartEvent, id: "Start" },
          node,
          { kind: CheckedNodeKind.NoneEndEvent, id: "End" },
        ];
        const context = `${profile}: Process input=${processInput}, output=${processOutput}`;
        assert.equal(profileAllowsProgramShape(profile, operations, 1), accepted, `program ${context}`);
        assert.equal(profileAllowsCheckedProcessShape(profile, nodes, 1), accepted, `checked ${context}`);
      }
    }
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InternalSchedulingMode, SemanticOperationKind, isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type { ScalarCallData, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { calledScopeId, callerScopeId } from "./call-activity-fixture.ts";

import { data, program } from "./call-data-fixture.ts";

function changedOperations(change: (operation: SemanticOperation) => SemanticOperation): SemanticProcessProgram {
  return { ...program, operations: program.operations.map(change) };
}
function changedData(change: (value: ScalarCallData) => ScalarCallData): SemanticProcessProgram {
  return changedOperations((operation) => operation.kind === SemanticOperationKind.InvokeProcess || operation.kind === SemanticOperationKind.ReturnProcess
    ? { ...operation, data: change(data) } : operation);
}
function changedTask(elementId: string, change: (operation: Extract<SemanticOperation, { kind: SemanticOperationKind.AwaitDataInputOutputUserTask }>) => SemanticOperation) {
  return changedOperations((operation) => operation.kind === SemanticOperationKind.AwaitDataInputOutputUserTask && operation.task.elementId === elementId
    ? change(operation) : operation);
}

test("standalone Call data Program admits separate owned interfaces and unused Properties", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(isWellFormedSemanticProcessProgram(changedData((value) => ({ ...value,
    called: { ...value.called, inputSet: { ...value.called.inputSet, name: "descriptive only" } },
  }))), true);
});

for (const [name, changed] of [
  ["called task reads a caller Property", changedTask("Task_Called", (operation) => ({ ...operation,
    directInput: { ...operation.directInput, source: { kind: "property", propertyId: "Request" } },
  }))],
  ["called task writes caller result before return", changedTask("Task_Called", (operation) => ({ ...operation,
    directOutput: { ...operation.directOutput, target: { kind: "property", propertyId: "Result" } },
  }))],
  ["caller reads request instead of returned result", changedTask("Task_Caller", (operation) => ({ ...operation,
    directInput: { ...operation.directInput, source: { kind: "property", propertyId: "Request" } },
  }))],
  ["caller receipt overwrites result", changedTask("Task_Caller", (operation) => ({ ...operation,
    directOutput: { ...operation.directOutput, target: { kind: "property", propertyId: "Result" } },
  }))],
  ["undeclared caller receipt", changedData((value) => ({ ...value, callerProperties: value.callerProperties.filter((id) => id !== "Receipt") }))],
  ["noncanonical Property inventory", changedData((value) => ({ ...value, callerProperties: [...value.callerProperties].reverse() }))],
  ["Property aliases retained flow", changedData((value) => ({ ...value, callerProperties: ["Called_End", ...value.callerProperties] }))],
  ["caller task precedes invocation", changedOperations((operation) => {
    switch (operation.kind) {
      case SemanticOperationKind.Initiate: return { ...operation, output: "place:Call_To_Caller_Task" };
      case SemanticOperationKind.ReturnProcess: return { ...operation, callerOutput: "place:Caller_End" };
      case SemanticOperationKind.AwaitDataInputOutputUserTask: return operation.task.elementId === "Task_Caller"
        ? { ...operation, output: "place:Caller_Start" } : operation;
      default: return operation;
    }
  })],
  ["unrequested scheduler mode", { ...program, internalSchedulingMode: InternalSchedulingMode.RequireChoiceSchedule }],
  ["foreign task scope", { ...program, operationScopes: program.operationScopes.map((binding) => binding.operationId === "operation:Task_Called"
    ? { ...binding, scopeId: callerScopeId } : binding) }],
  ["called scope has caller identity", { ...program, definitionScopes: program.definitionScopes.map((scope) => scope.id === calledScopeId
    ? { ...scope, originElementId: program.processId } : scope) }],
] as const) {
  test(`standalone Call data Program refuses ${name}`, () => {
    assert.equal(isWellFormedSemanticProcessProgram(changed), false);
  });
}

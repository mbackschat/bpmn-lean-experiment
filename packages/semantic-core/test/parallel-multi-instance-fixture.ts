/** Test-only exact parallel Multi-Instance successor of the sequential review fixture. */
import assert from "node:assert/strict";

import {
  SemanticOperationKind,
  VariableValueKind,
  type SemanticProcessProgram,
  type StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import {
  reviewProgram,
  start,
} from "./sequential-multi-instance-fixture.ts";

export const parallelEntryOperationId = "operation:Review";
export const parallelCompletionOperationId = `${parallelEntryOperationId}:complete`;
const entryScopeId = reviewProgram.operationScopes.find(
  ({ operationId }) => operationId === parallelEntryOperationId,
)?.scopeId;
assert.notEqual(entryScopeId, undefined);

export const parallelProgram = {
  ...reviewProgram,
  identity: {
    ...reviewProgram.identity,
    semanticProfile: "bpmn-2.0.2-parallel-multi-instance-user-task-draft",
  },
  operationScopes: [
    ...reviewProgram.operationScopes,
    { operationId: parallelCompletionOperationId, scopeId: entryScopeId },
  ],
  operations: [
    ...reviewProgram.operations.map((operation) =>
      operation.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
        ? {
          ...operation,
          kind: SemanticOperationKind.AwaitParallelMultiInstanceUserTask,
          completionCondition: {
            kind: "stringEquals",
            variable: "completionPolicy",
            value: "first",
          },
        }
        : operation
    ),
    {
      id: parallelCompletionOperationId,
      kind: SemanticOperationKind.CompleteParallelMultiInstanceUserTask,
      origin: { kind: "bpmnElement", elementId: "Review" },
      entryOperationId: parallelEntryOperationId,
      taskElementId: "Review",
      normalOutput: "place:Flow_Normal",
    },
  ],
} as unknown as SemanticProcessProgram;

export const parallelStart: StartProcessStimulus = {
  ...start,
  initialVariables: [
    ...start.initialVariables,
    {
      name: "completionPolicy",
      value: { kind: VariableValueKind.String, value: "all" },
    },
  ],
};

export function startWithParallelItems(
  commandId: string,
  collection: ReadonlyArray<string>,
  policy: "all" | "first",
): StartProcessStimulus {
  return {
    ...parallelStart,
    commandId,
    initialVariables: parallelStart.initialVariables.map((binding) =>
      binding.name === "completionPolicy"
        ? {
          ...binding,
          value: { kind: VariableValueKind.String, value: policy },
        }
        : {
          ...binding,
          value: { kind: VariableValueKind.StringList, value: [...collection] },
        }
    ),
  };
}

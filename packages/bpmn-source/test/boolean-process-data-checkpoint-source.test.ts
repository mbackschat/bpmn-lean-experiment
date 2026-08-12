import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  SemanticOperationKind,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticCheckpointProfileId,
} from "@bpmn-lean/semantic-core";

import {
  compileSemanticProcessFixture,
} from "./semantic-process-compilation-test-support.ts";

test("generic source compilation admits the checkpoint profile with the existing sequential shape", async () => {
  const result = await compileSemanticProcessFixture(
    new URL(
      "../../../scenarios/user-task-discovery-completion/process.bpmn",
      import.meta.url,
    ),
    "sequential-user-task-process",
    SemanticCheckpointProfileId.UserTaskBooleanCompletionData,
  );

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  assert.deepEqual(result.checkedProcess.nodes.map(({ kind }) => kind), [
    CheckedNodeKind.NoneEndEvent,
    CheckedNodeKind.NoneStartEvent,
    CheckedNodeKind.UserTask,
  ]);
  assert.deepEqual(result.semanticProcess.operations.map(({ kind }) => kind), [
    SemanticOperationKind.ReachNoneEnd,
    SemanticOperationKind.Initiate,
    SemanticOperationKind.AwaitUserTask,
    SemanticOperationKind.CompleteScope,
  ]);
  assert.equal(
    result.semanticProcess.identity.semanticProfile,
    SemanticCheckpointProfileId.UserTaskBooleanCompletionData,
  );
});

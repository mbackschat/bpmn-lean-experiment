import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  SemanticOperationKind,
} from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";

import {
  compileSemanticProcessFixture,
} from "./semantic-process-compilation-test-support.ts";

test("generic source compilation admits the registered Boolean profile with the existing sequential shape", async () => {
  const sourceUrl = new URL(
    "../../../scenarios/user-task-discovery-completion/process.bpmn",
    import.meta.url,
  );
  const result = await compileSemanticProcessFixture(
    sourceUrl,
    "sequential-user-task-process",
    SemanticProfileId.UserTaskBooleanCompletionData,
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
    SemanticProfileId.UserTaskBooleanCompletionData,
  );

  const oldResult = await compileSemanticProcessFixture(
    sourceUrl,
    "sequential-user-task-process",
    SemanticProfileId.UserTask,
  );
  assert.equal(oldResult.status, BpmnCompilationStatus.Accepted);
  if (
    result.status !== BpmnCompilationStatus.Accepted ||
    oldResult.status !== BpmnCompilationStatus.Accepted
  ) {
    throw new Error("both sequential profiles must compile");
  }
  assert.deepEqual(
    {
      ...result.checkedProcess,
      identity: {
        ...result.checkedProcess.identity,
        semanticProfile: SemanticProfileId.UserTask,
      },
    },
    oldResult.checkedProcess,
  );
  assert.deepEqual(
    {
      ...result.semanticProcess,
      identity: {
        ...result.semanticProcess.identity,
        semanticProfile: SemanticProfileId.UserTask,
      },
    },
    oldResult.semanticProcess,
  );
});

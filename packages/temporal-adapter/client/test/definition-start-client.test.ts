/** Direct definition starts bind preparation, one SDK request, and retained description. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { WorkflowNotFoundError } from "@temporalio/client";

import {
  TemporalDefinitionStartDescriptionResultKind,
  TemporalDefinitionStartPreparationResultKind,
  TemporalPreparedDefinitionStartResultKind,
  describeTemporalDefinitionStart,
  prepareTemporalDefinitionStart,
  startPreparedTemporalDefinition,
} from "@bpmn-lean/temporal-client/definition-start";
import {
  processProgramFixture as program,
  processStartFixture as start,
} from "./process-start-fixture.ts";

const workflowId = "private-direct-address-42";
const taskQueue = "direct-start-queue";

test("prepares immutable admitted intent with zero SDK calls and starts one exact request", async () => {
  const calls: unknown[] = [];
  const client = fakeClient(calls);
  const prepared = prepareTemporalDefinitionStart({ start, semanticProcess: program, workflowId, taskQueue });

  assert.equal(prepared.kind, TemporalDefinitionStartPreparationResultKind.Admitted);
  assert.equal(calls.length, 0);
  if (prepared.kind !== TemporalDefinitionStartPreparationResultKind.Admitted) {
    throw new TypeError("expected admitted start");
  }
  const mutableStart = structuredClone(start) as { instanceId: string } & typeof start;
  const mutableProgram = structuredClone(program) as { processId: string } & typeof program;
  const pending = startPreparedTemporalDefinition(client, {
    start: mutableStart,
    semanticProcess: mutableProgram,
    workflowId,
    taskQueue,
    expectedIntent: prepared.intent,
  });
  mutableStart.instanceId = "mutated";
  mutableProgram.processId = "mutated";

  assert.deepEqual(await pending, { kind: TemporalPreparedDefinitionStartResultKind.Started });
  assert.equal(calls.length, 1);
  const call = calls[0] as { workflowType: string; options: Record<string, unknown> };
  assert.equal(call.workflowType, "runBpmnProcess");
  assert.equal(call.options.workflowId, workflowId);
  assert.equal(call.options.taskQueue, taskQueue);
  assert.equal(call.options.workflowIdReusePolicy, "REJECT_DUPLICATE");
  assert.equal(call.options.workflowIdConflictPolicy, "FAIL");
  assert.equal("retry" in call.options, false);
  assert.deepEqual(call.options.args, [start, program]);
  assert.deepEqual(call.options.memo, {
    bpmnLeanDirectStartIntentSha256: prepared.intent.intentSha256,
  });
});

test("rejects marker drift before an SDK call", async () => {
  const calls: unknown[] = [];
  const result = await startPreparedTemporalDefinition(fakeClient(calls), {
    start,
    semanticProcess: program,
    workflowId,
    taskQueue,
    expectedIntent: { protocol: "bpmn-direct-start-v1", intentSha256: "0".repeat(64) },
  });

  assert.equal(result.kind, TemporalPreparedDefinitionStartResultKind.IntegrityFailure);
  assert.equal(calls.length, 0);
});

test("describes retained marker without a handle and exposes facts needed for type and queue divergence", async () => {
  const prepared = prepareTemporalDefinitionStart({ start, semanticProcess: program, workflowId, taskQueue });
  if (prepared.kind !== TemporalDefinitionStartPreparationResultKind.Admitted) {
    throw new TypeError("expected admitted start");
  }
  for (const [type, queue] of [["runBpmnProcess", taskQueue], ["wrongType", taskQueue], ["runBpmnProcess", "wrongQueue"]]) {
    const result = await describeTemporalDefinitionStart(fakeClient([], {
      workflowId,
      type,
      taskQueue: queue,
      status: { name: "RUNNING" },
      memo: { bpmnLeanDirectStartIntentSha256: prepared.intent.intentSha256 },
    }), workflowId);
    assert.equal(result.kind, TemporalDefinitionStartDescriptionResultKind.Found);
    if (result.kind === TemporalDefinitionStartDescriptionResultKind.Found) {
      assert.equal(result.description.workflowType, type);
      assert.equal(result.description.taskQueue, queue);
      assert.equal(JSON.stringify(result).includes("privateHandle"), false);
    }
  }
});

test("classifies missing and unavailable descriptions", async () => {
  assert.deepEqual(
    await describeTemporalDefinitionStart(fakeClient([], undefined, new WorkflowNotFoundError("missing", workflowId, undefined)), workflowId),
    { kind: TemporalDefinitionStartDescriptionResultKind.Missing },
  );
  assert.deepEqual(
    await describeTemporalDefinitionStart(fakeClient([], undefined, new Error("down")), workflowId),
    { kind: TemporalDefinitionStartDescriptionResultKind.Unavailable },
  );
});

function fakeClient(calls: unknown[], description?: unknown, describeError?: Error): never {
  return {
    start: async (workflowType: string, options: unknown) => {
      calls.push({ workflowType, options });
      return { privateHandle: "must-not-escape" };
    },
    getHandle: () => ({
      privateHandle: "must-not-escape",
      describe: async () => {
        if (describeError !== undefined) throw describeError;
        return description;
      },
    }),
  } as never;
}

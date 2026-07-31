/**
 * Proves that the product Worker connects to an existing Temporal service and runs the production
 * Process Workflow on the caller-selected Task Queue without owning server or port lifecycle.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type { OpenUserTask } from "@bpmn-lean/semantic-core";
import {
  BpmnProcessStartResultKind,
  ExternalTemporalRuntime,
  ProcessCommandResultKind,
  bpmnOpenUserTasksQueryName,
  createCachedLocalEnvironment,
  startBpmnProcess,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-adapter";

import { withDeadline } from "./temporal-test-support.ts";

const capsuleUrl = new URL(
  "../../../scenarios/user-task-discovery-completion/",
  import.meta.url,
);
const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);
const taskQueue = "bpmn-mvp-external-runtime";

test("rejects an empty server address before attempting a connection", async () => {
  await assert.rejects(
    ExternalTemporalRuntime.connect({
      address: "",
      namespace: "default",
      taskQueue,
      identity: "bpmn-mvp-worker",
    }),
    TypeError,
  );
});

test("connects to the supplied server and runs on the supplied Task Queue", async () => {
  const scenario = JSON.parse(
    await readFile(new URL("scenario.json", capsuleUrl), "utf8"),
  );
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("process.bpmn", capsuleUrl)),
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    semanticProfile: scenario.profile,
    limits: {
      maxBytes: 1024 * 1024,
      parserDeadlineMs: 1_000,
    },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("MVP acceptance source was rejected");
  }
  const start = scenario.stimuli[0];
  const completion = scenario.stimuli[1];
  assert.equal(start?.kind, StimulusKind.StartProcess);
  assert.equal(completion?.kind, StimulusKind.CompleteUserTaskInstance);
  if (
    start?.kind !== StimulusKind.StartProcess ||
    completion?.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError("MVP acceptance scenario has the wrong stimuli");
  }

  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-mvp-server",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "MVP Temporal server startup",
  );
  let runtime: ExternalTemporalRuntime | undefined;
  try {
    runtime = await withDeadline(
      ExternalTemporalRuntime.connect({
        address: environment.address,
        namespace: environment.namespace ?? "default",
        taskQueue,
        identity: "bpmn-mvp-worker",
      }),
      20_000,
      "external BPMN runtime connection",
    );
    const started = await startBpmnProcess(
      runtime.workflowClient,
      start,
      compilation.semanticProcess,
      { taskQueue },
    );
    switch (started.kind) {
      case BpmnProcessStartResultKind.Started:
        break;
      case BpmnProcessStartResultKind.Rejected:
        throw new Error(`MVP Process was rejected: ${started.failure.code}`);
    }
    const openTasks = await withDeadline(
      started.handle.query<ReadonlyArray<OpenUserTask>>(
        bpmnOpenUserTasksQueryName,
      ),
      5_000,
      "MVP open-task Query",
    );
    assert.equal(openTasks.length, 1);

    const completionResult = await submitUserTaskCompletion(
      runtime.workflowClient,
      start.instanceId,
      completion,
    );
    assert.deepEqual(completionResult, {
      kind: ProcessCommandResultKind.Semantic,
      commandId: completion.commandId,
      outcome: CommandOutcome.Committed,
    });
    const receipt = await withDeadline(
      started.handle.result(),
      5_000,
      "MVP Process completion",
    );
    assert.equal(receipt.processInstanceId, start.instanceId);
  } finally {
    if (runtime !== undefined) {
      await withDeadline(
        runtime.shutdown(),
        10_000,
        "external BPMN runtime shutdown",
      );
    }
    await withDeadline(
      environment.teardown(),
      10_000,
      "MVP Temporal server teardown",
    );
  }
});

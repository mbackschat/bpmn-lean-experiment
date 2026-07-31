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
import {
  BpmnProcessStartResultKind,
  DummyUserTaskActorEventKind,
  DummyUserTaskActorResultKind,
  ExternalTemporalRuntime,
  ProcessCommandResultKind,
  createCachedLocalEnvironment,
  listOpenUserTasks,
  readUserTaskDetail,
  runDummyUserTaskActor,
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
    const connectedRuntime = runtime;
    const started = await startBpmnProcess(
      connectedRuntime.workflowClient,
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
    const actorEvents: string[] = [];
    const actorResult = await runDummyUserTaskActor(
      {
        elementId: completion.taskId.elementId,
        delayMs: 25,
        inputVariableNames: ["requestTitle"],
        submittedValues: completion.submittedValues,
      },
      {
        listOpenUserTasks: () => listOpenUserTasks(
          connectedRuntime.workflowClient,
          start.instanceId,
        ),
        readUserTaskDetail: (request) => readUserTaskDetail(
          connectedRuntime.workflowClient,
          start.instanceId,
          request,
        ),
        submitCompletion: (stimulus) => submitUserTaskCompletion(
          connectedRuntime.workflowClient,
          start.instanceId,
          stimulus,
        ),
      },
      undefined,
      ({ kind }) => actorEvents.push(kind),
    );
    switch (actorResult.kind) {
      case DummyUserTaskActorResultKind.Submitted:
        break;
      case DummyUserTaskActorResultKind.Refused:
        throw new Error(`MVP dummy actor refused: ${actorResult.code}`);
    }
    assert.deepEqual(actorResult.completion, {
      kind: ProcessCommandResultKind.Semantic,
      commandId: "dummy-form-submit:UserTask_Approve:1",
      outcome: CommandOutcome.Committed,
    });
    assert.deepEqual(actorResult.detail.inputVariables, start.initialVariables);
    assert.deepEqual(actorEvents, [
      DummyUserTaskActorEventKind.TaskReady,
      DummyUserTaskActorEventKind.DelayStarted,
      DummyUserTaskActorEventKind.DelayFinished,
      DummyUserTaskActorEventKind.CompletionResolved,
    ]);
    const receipt = await withDeadline(
      started.handle.result(),
      5_000,
      "MVP Process completion",
    );
    assert.equal(receipt.processInstanceId, start.instanceId);
    assert.deepEqual(receipt.finalState.variables, [
      completion.submittedValues[0],
      start.initialVariables[0],
      completion.submittedValues[1],
    ]);
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

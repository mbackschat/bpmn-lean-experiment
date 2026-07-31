/**
 * Proves that the product Worker connects to an existing Temporal service and runs the production
 * Process Workflow on the caller-selected Task Queue without owning server or port lifecycle.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CommandOutcome,
} from "@bpmn-lean/semantic-core";
import {
  ExternalTemporalRuntime,
  ProcessCommandResultKind,
  createCachedLocalEnvironment,
} from "@bpmn-lean/temporal-adapter";

import { loadRunnableMvpConfig } from "../cli/runnable-mvp-config.ts";
import {
  RunnableMvpEventKind,
  RunnableMvpResultKind,
  runRunnableTemporalMvp,
} from "../cli/runnable-mvp.ts";
import type { RunnableMvpEvent } from "../cli/runnable-mvp.ts";

import { withDeadline } from "./temporal-test-support.ts";

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
  const exampleConfig = await loadRunnableMvpConfig(fileURLToPath(
    new URL("../../../examples/temporal-mvp/accepted.json", import.meta.url),
  ));
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-mvp-server",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "MVP Temporal server startup",
  );
  try {
    const events: RunnableMvpEvent[] = [];
    const result = await withDeadline(
      runRunnableTemporalMvp({
        ...exampleConfig,
        process: {
          ...exampleConfig.process,
          instanceId: "MvpExternalTest_1",
        },
        dummyUserTask: {
          ...exampleConfig.dummyUserTask,
          delayMs: 25,
        },
        temporal: {
          ...exampleConfig.temporal,
          address: environment.address,
          namespace: environment.namespace ?? "default",
          taskQueue,
        },
      }, (event) => events.push(event)),
      30_000,
      "runnable external-Temporal MVP",
    );
    switch (result.kind) {
      case RunnableMvpResultKind.Completed:
        break;
      case RunnableMvpResultKind.SourceAdmissionRejected:
      case RunnableMvpResultKind.ProcessAdmissionRejected:
      case RunnableMvpResultKind.ActorRefused:
      case RunnableMvpResultKind.CompletionNotCommitted:
        throw new Error(`MVP did not complete: ${result.kind}`);
    }
    assert.deepEqual(events.map(({ kind }) => kind), [
      RunnableMvpEventKind.SourceAdmissionAccepted,
      RunnableMvpEventKind.ProcessStarted,
      RunnableMvpEventKind.ProcessState,
      RunnableMvpEventKind.TaskReady,
      RunnableMvpEventKind.DelayStarted,
      RunnableMvpEventKind.DelayFinished,
      RunnableMvpEventKind.CompletionResolved,
      RunnableMvpEventKind.ProcessCompleted,
    ]);
    const waiting = events.find(
      (event) => event.kind === RunnableMvpEventKind.ProcessState,
    );
    assert.deepEqual(
      waiting?.state.variables,
      exampleConfig.process.initialVariables,
    );
    assert.equal(waiting?.state.openUserTasks[0]?.id.elementId, "UserTask_Approve");
    const ready = events.find(
      (event) => event.kind === RunnableMvpEventKind.TaskReady,
    );
    assert.deepEqual(
      ready?.detail.inputVariables,
      exampleConfig.process.initialVariables,
    );
    const completion = events.find(
      (event) => event.kind === RunnableMvpEventKind.CompletionResolved,
    );
    assert.deepEqual(completion?.result, {
      kind: ProcessCommandResultKind.Semantic,
      commandId: "dummy-form-submit:UserTask_Approve:1",
      outcome: CommandOutcome.Committed,
    });
    assert.equal(result.receipt.processInstanceId, "MvpExternalTest_1");
    assert.deepEqual(result.receipt.finalState.variables, [
      exampleConfig.dummyUserTask.submittedValues[0],
      exampleConfig.process.initialVariables[0],
      exampleConfig.dummyUserTask.submittedValues[1],
    ]);
  } finally {
    await withDeadline(
      environment.teardown(),
      10_000,
      "MVP Temporal server teardown",
    );
  }
});

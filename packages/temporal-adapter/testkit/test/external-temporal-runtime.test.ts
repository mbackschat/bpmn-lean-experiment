/**
 * Proves that the product Worker connects to an existing Temporal service and runs the production
 * Process Workflow on the caller-selected Task Queue without owning server or port lifecycle.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CommandOutcome,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import {
  ExternalTemporalRuntime,
  ProcessCommandResultKind,
  createCachedLocalEnvironment,
  createHostEffectActivities,
} from "@bpmn-lean/temporal-testkit";

import { loadRunnableMvpConfig } from "../../runner/cli/runnable-mvp-config.ts";
import {
  RunnableMvpEventKind,
  RunnableMvpResultKind,
  runRunnableTemporalMvp,
} from "../../runner/cli/runnable-mvp.ts";
import type { RunnableMvpEvent } from "../../runner/cli/runnable-mvp.ts";

import { withDeadline } from "./temporal-test-support.ts";

const temporalCacheDirectory = fileURLToPath(
  new URL("../../../../.cache/temporal-cli/", import.meta.url),
);
const taskQueue = "bpmn-mvp-external-runtime";

test("rejects an empty server address before attempting a connection", async () => {
  await assert.rejects(
    ExternalTemporalRuntime.connect({
      address: "",
      namespace: "default",
      taskQueue,
      identity: "bpmn-mvp-worker",
    }, createHostEffectActivities([])),
    TypeError,
  );
});

test("connects to the supplied server and runs on the supplied Task Queue", async () => {
  const exampleConfig = await loadRunnableMvpConfig(fileURLToPath(
    new URL("../../../../examples/temporal-mvp/user-task-discovery-completion.json", import.meta.url),
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
        interactions: exampleConfig.interactions.map((response) => ({
          ...response,
          delayMs: 25,
        })),
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
      case RunnableMvpResultKind.InteractionRefused:
        throw new Error(`MVP did not complete: ${result.kind}`);
    }
    assert.deepEqual(events.map(({ kind }) => kind), [
      RunnableMvpEventKind.SourceAdmissionAccepted,
      RunnableMvpEventKind.ProcessStarted,
      RunnableMvpEventKind.ProcessState,
      RunnableMvpEventKind.InteractionReady,
      RunnableMvpEventKind.DelayStarted,
      RunnableMvpEventKind.DelayFinished,
      RunnableMvpEventKind.InteractionResolved,
      RunnableMvpEventKind.ProcessState,
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
      (event) => event.kind === RunnableMvpEventKind.InteractionReady,
    );
    assert.deepEqual(
      ready?.detail?.inputVariables,
      exampleConfig.process.initialVariables,
    );
    const completion = events.find(
      (event) => event.kind === RunnableMvpEventKind.InteractionResolved,
    );
    assert.deepEqual(completion?.result, {
      kind: ProcessCommandResultKind.Semantic,
      commandId: "mvp-complete-task:UserTask_Approve:1",
      outcome: CommandOutcome.Committed,
    });
    assert.equal(result.receipt.processInstanceId, "MvpExternalTest_1");
    const submitted = exampleConfig.interactions.find(
      (response) => response.kind === StimulusKind.CompleteUserTaskInstance,
    );
    assert.deepEqual(result.receipt.finalState.variables, [
      submitted?.submittedValues[0],
      exampleConfig.process.initialVariables[0],
      submitted?.submittedValues[1],
    ]);
  } finally {
    await withDeadline(
      environment.teardown(),
      10_000,
      "MVP Temporal server teardown",
    );
  }
});

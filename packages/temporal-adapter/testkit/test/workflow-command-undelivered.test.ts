import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { defaultPayloadConverter, isGrpcServiceError, WorkflowNotFoundError } from "@temporalio/client";
import proto from "@temporalio/proto";
import { bundleWorkflowCode, DefaultLogger, Worker } from "@temporalio/worker";
import { StimulusKind, runScenario } from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import { resolveSemanticUpdate } from "@bpmn-lean/temporal-client";
import {
  contentBoundUpdateId, processTerminalReceiptFormatV1, requireTerminalProcessReceipt,
  workflowTerminalResultFormatV1,
} from "@bpmn-lean/temporal-protocol";
import { createCachedLocalEnvironment } from "@bpmn-lean/temporal-testkit";
import { compileExecutionInput, loadJson, requiredAt, temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory } from "./temporal-worker-test-support.ts";
import type { FenceProbeInput } from "./workflow-command-fence-probe.ts";

const { temporal } = proto;

for (const fence of ["rollover", "terminal"] as const) {
  test(`an admitted undelivered Update preserves its identity across ${fence}`, async () => {
    const scenario = await loadJson<Scenario>(new URL(
      "../../../../scenarios/user-task-discovery-completion/scenario.json", import.meta.url,
    ));
    const { semanticProcess } = await compileExecutionInput(scenario, new URL(
      "../../../../scenarios/user-task-discovery-completion/process.bpmn", import.meta.url,
    ));
    const start = requiredAt(scenario.stimuli, 0, "undelivered start");
    const stimulus = requiredAt(scenario.stimuli, 1, "undelivered command");
    if (start.kind !== StimulusKind.StartProcess || stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
      assert.fail("Undelivered probe requires the registered User Task scenario");
    }
    const receipt = requireTerminalProcessReceipt({
      format: processTerminalReceiptFormatV1, definition: semanticProcess.identity,
      processId: semanticProcess.processId, processInstanceId: start.instanceId,
      finalState: runScenario(scenario, semanticProcess).trace.at(-1),
    });
    const bundle = await bundleWorkflowCode({
      workflowsPath: fileURLToPath(new URL("./workflow-command-fence-probe.ts", import.meta.url)),
      logger: new DefaultLogger("ERROR"),
    });
    const environment = await withDeadline(createCachedLocalEnvironment({
      identity: `undelivered-${fence}`, downloadDirectory: temporalCacheDirectory,
    }), 40_000, "undelivered probe startup");
    try {
      await environment.client.connection.withDeadline(Date.now() + 15_000, async () => {
        const workflowId = `undelivered-${fence}`;
        const taskQueue = workflowId;
        const input: FenceProbeInput = { fence, stimulus, receipt, closeWithoutDelivery: true };
        const handle = await environment.client.workflow.start("commandFenceProbe", {
          workflowId, taskQueue, args: [input],
        });
        const first = environment.client.workflow.getHandle(workflowId, handle.firstExecutionRunId);
        const service = environment.client.workflowService;
        // The Service's ADMITTED stage after this poll proves the held Task never delivered the Update.
        const task = await service.pollWorkflowTaskQueue({
          namespace: "default", taskQueue: { name: taskQueue, kind: temporal.api.enums.v1.TaskQueueKind.TASK_QUEUE_KIND_NORMAL },
          identity: "held-task-probe",
        });
        assert.equal(task.messages.length, 0);
        const updateId = contentBoundUpdateId(stimulus);
        const attempt = handle.executeUpdate("fencedCommand", { args: [stimulus], updateId }).then(
          (value) => ({ value }), (error: unknown) => ({ error }),
        );
        while (true) {
          try {
            const admitted = await service.pollWorkflowExecutionUpdate({
              namespace: "default", updateRef: { workflowExecution: { workflowId, runId: handle.firstExecutionRunId }, updateId },
              waitPolicy: { lifecycleStage: temporal.api.enums.v1.UpdateWorkflowExecutionLifecycleStage.UPDATE_WORKFLOW_EXECUTION_LIFECYCLE_STAGE_ADMITTED },
            });
            assert.equal(admitted.stage, temporal.api.enums.v1.UpdateWorkflowExecutionLifecycleStage.UPDATE_WORKFLOW_EXECUTION_LIFECYCLE_STAGE_ADMITTED);
            break;
          } catch (error: unknown) {
            if (!isGrpcServiceError(error) || error.code !== 5) throw error;
            await delay(10);
          }
        }
        const terminal = { format: workflowTerminalResultFormatV1, receipt, entries: [] };
        const command = fence === "rollover" ? {
          commandType: temporal.api.enums.v1.CommandType.COMMAND_TYPE_CONTINUE_AS_NEW_WORKFLOW_EXECUTION,
          continueAsNewWorkflowExecutionCommandAttributes: {
            workflowType: { name: "commandFenceProbe" }, taskQueue: { name: taskQueue },
            input: { payloads: [defaultPayloadConverter.toPayload({ ...input, successor: true })] },
          },
        } : {
          commandType: temporal.api.enums.v1.CommandType.COMMAND_TYPE_COMPLETE_WORKFLOW_EXECUTION,
          completeWorkflowExecutionCommandAttributes: { result: { payloads: [defaultPayloadConverter.toPayload(terminal)] } },
        };
        await service.respondWorkflowTaskCompleted({ taskToken: task.taskToken, identity: "held-task-probe", commands: [command] });
        const firstHistory = await first.fetchHistory();
        assert.equal(firstHistory.events?.some((event) => event.workflowExecutionUpdateAcceptedEventAttributes != null), false);
        const worker = await Worker.create({ connection: environment.nativeConnection, taskQueue, workflowBundle: bundle });
        await worker.runUntil(async () => {
          const nativeResult = await attempt;
          if (fence === "terminal") {
            assert.ok("error" in nativeResult && nativeResult.error instanceof WorkflowNotFoundError);
          } else {
            assert.deepEqual(nativeResult, { value: "committed" });
          }
          const resolution = {
            client: environment.client.workflow, workflowId, processInstanceId: start.instanceId,
            stimulus, updateName: "fencedCommand", operation: "undelivered command recovery",
          };
          const result = await resolveSemanticUpdate(resolution);
          assert.deepEqual(result, fence === "rollover"
            ? { kind: "semantic", commandId: stimulus.commandId, outcome: "committed" }
            : { kind: "processClosed", commandId: stimulus.commandId, receipt });
          assert.deepEqual(await resolveSemanticUpdate(resolution), result);
          assert.deepEqual(await first.query("fenceAudit"), { commits: 0, entries: [] });
          const audit = await handle.query<{ commits: number; entries: unknown[] }>("fenceAudit");
          assert.equal(audit.commits, fence === "rollover" ? 1 : 0);
          assert.equal(audit.entries.length, audit.commits);
          if (fence === "rollover") {
            const successor = await handle.describe();
            await handle.signal("releaseFence");
            await handle.result();
            await replayBpmnHistory(bundle, await environment.client.workflow.getHandle(workflowId, successor.runId).fetchHistory(), workflowId);
          }
        });
        await replayBpmnHistory(bundle, firstHistory, workflowId);
      });
    } finally {
      await environment.teardown();
    }
  });
}

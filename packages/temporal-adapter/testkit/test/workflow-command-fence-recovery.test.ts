import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ApplicationFailure, WorkflowUpdateFailedError } from "@temporalio/client";
import { bundleWorkflowCode, DefaultLogger } from "@temporalio/worker";
import { StimulusKind, runScenario } from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import { resolveSemanticUpdate } from "@bpmn-lean/temporal-client";
import { processTerminalReceiptFormatV1, requireTerminalProcessReceipt } from "@bpmn-lean/temporal-protocol";
import { bpmnSemanticTaskQueue, createCachedLocalEnvironment } from "@bpmn-lean/temporal-testkit";
import {
  compileExecutionInput, loadJson, requiredAt, temporalCacheDirectory, withDeadline,
} from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

for (const fence of ["rollover", "terminal"] as const) {
  test(`real ${fence} validator refusal resolves through content-bound client recovery`, async () => {
    const scenario = await loadJson<Scenario>(new URL(
      "../../../../scenarios/user-task-discovery-completion/scenario.json", import.meta.url,
    ));
    const { semanticProcess } = await compileExecutionInput(scenario, new URL(
      "../../../../scenarios/user-task-discovery-completion/process.bpmn", import.meta.url,
    ));
    const start = requiredAt(scenario.stimuli, 0, "fence start");
    const stimulus = requiredAt(scenario.stimuli, 1, "fence command");
    if (start.kind !== StimulusKind.StartProcess || stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
      assert.fail("Fence probe requires the registered User Task scenario");
    }
    const receipt = requireTerminalProcessReceipt({
      format: processTerminalReceiptFormatV1,
      definition: semanticProcess.identity,
      processId: semanticProcess.processId,
      processInstanceId: start.instanceId,
      finalState: runScenario(scenario, semanticProcess).trace.at(-1),
    });
    const bundle = await bundleWorkflowCode({
      workflowsPath: fileURLToPath(new URL("./workflow-command-fence-probe.ts", import.meta.url)),
      logger: new DefaultLogger("ERROR"),
    });
    const environment = await withDeadline(createCachedLocalEnvironment({
      identity: `command-${fence}-probe`, downloadDirectory: temporalCacheDirectory,
    }), 40_000, "fence probe startup");
    let worker: WorkerLease | undefined;
    try {
      worker = await startBpmnTestWorker(environment, bundle, `command-${fence}-probe`);
      const workflowId = `command-${fence}-probe`;
      const handle = await environment.client.workflow.start("commandFenceProbe", {
        workflowId, taskQueue: bpmnSemanticTaskQueue, args: [{ fence, stimulus, receipt }],
      });
      let observedRefusals = 0;
      const realClient = environment.client.workflow;
      const client = new Proxy(realClient, {
        get(target, property, receiver) {
          if (property !== "getHandle") return Reflect.get(target, property, receiver);
          return (...args: Parameters<typeof realClient.getHandle>) => {
            const realHandle = realClient.getHandle(...args);
            return new Proxy(realHandle, {
              get(targetHandle, member, handleReceiver) {
                const value = Reflect.get(targetHandle, member, handleReceiver);
                if (member !== "executeUpdate") return value;
                return async (...updateArgs: unknown[]) => {
                  try {
                    return await Reflect.apply(value, targetHandle, updateArgs);
                  } catch (error: unknown) {
                    if (observedRefusals === 0) {
                      assert.ok(error instanceof WorkflowUpdateFailedError);
                      assert.ok(error.cause instanceof ApplicationFailure);
                      assert.equal(error.cause.type, fence === "rollover"
                        ? "BpmnWorkflowRolloverInProgress" : "BpmnWorkflowTerminalReceiptPending");
                      assert.deepEqual(await handle.query("fenceAudit"), { commits: 0, entries: [] });
                      observedRefusals += 1;
                      await handle.signal("releaseFence");
                    }
                    throw error;
                  }
                };
              },
            });
          };
        },
      });
      const resolution = {
        client, workflowId, processInstanceId: start.instanceId, stimulus,
        updateName: "fencedCommand", operation: `${fence} fence recovery`,
      };
      const result = await resolveSemanticUpdate(resolution);
      assert.equal(observedRefusals, 1);
      assert.deepEqual(result, fence === "rollover"
        ? { kind: "semantic", commandId: stimulus.commandId, outcome: "committed" }
        : { kind: "processClosed", commandId: stimulus.commandId, receipt });
      assert.deepEqual(await resolveSemanticUpdate(resolution), result);
      const audit = await handle.query<{ commits: number; entries: unknown[] }>("fenceAudit");
      assert.equal(audit.commits, fence === "rollover" ? 1 : 0);
      assert.equal(audit.entries.length, audit.commits);
      const latest = await handle.describe();
      const first = realClient.getHandle(workflowId, handle.firstExecutionRunId);
      assert.equal((await first.describe()).status.name, fence === "rollover" ? "CONTINUED_AS_NEW" : "COMPLETED");
      if (fence === "rollover") {
        await handle.signal("releaseFence");
        await withDeadline(handle.result(), 15_000, "successor probe completion");
        await replayBpmnHistory(bundle, await realClient.getHandle(workflowId, latest.runId).fetchHistory(), workflowId);
      }
      await replayBpmnHistory(bundle, await first.fetchHistory(), workflowId);
    } finally {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
      await environment.teardown();
    }
  });
}

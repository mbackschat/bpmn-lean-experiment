import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Context } from "@temporalio/activity";
import { WorkflowClient } from "@temporalio/client";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CommandOutcome, EffectExecutionResultKind, StimulusKind,
  TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID } from "@bpmn-lean/semantic-core";
import {
  ProcessCommandResultKind, BpmnProcessStartResultKind, ExecutionPublicationResultKind, FlowNodeOccurrencePublicationResultKind,
  EffectExecutionSchedule, EffectProbeStore, bpmnProcessWorkflowType, bpmnSemanticTaskQueue,
  createCachedLocalEnvironment, loadBpmnWorkflowBundle, listOpenUserTasks,
  observeTemporalExecutionPublication, observeTemporalFlowNodeOccurrences, processWorkflowId,
  readTestProcessTerminalResult, startBpmnProcess, submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type { EffectActivityImplementations, FlowNodeOccurrencePage,
  TemporalExecutionPublicationClient, TemporalFlowNodeOccurrencePublicationClient } from "@bpmn-lean/temporal-testkit";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker, waitForOpenUserTaskIds } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { compensationWorkflowEvidence, deferred } from "./compensation-durability-support.ts";
import { historyEvents } from "./temporal-history-facts.ts";

const deadlineMs = 20_000;

test("Transaction public commands preserve paired publication through empty, compensated and failed cancellation", async (t) => {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("../../../bpmn-source/test/fixtures/transaction-cancellation.bpmn", import.meta.url)),
    sourceId: "reservation-withdrawal-live", expectedSha256: undefined, sourceOverlay: null,
    semanticProfile: TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) return;
  const program = compilation.semanticProcess;
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity: "bpmn-transaction-publication", downloadDirectory: temporalCacheDirectory,
  }), 40_000, "Transaction Temporal environment startup");
  let worker: WorkerLease | undefined;
  let released = false;
  let outcome: "empty" | "success" | "failure" = "empty";
  let firstStarted = deferred();
  let replacementStarted = deferred();
  let store = new EffectProbeStore();
  let invocations = 0;
  const activities: EffectActivityImplementations = {
    async executeBpmnEffect(request) {
      invocations += 1;
      assert.deepEqual(request.arguments, []);
      const result = await store.execute(request, EffectExecutionSchedule.PlainSuccess);
      if (invocations === 1) firstStarted.resolve();
      else replacementStarted.resolve();
      while (!released) {
        Context.current().heartbeat();
        await Context.current().sleep(25);
      }
      return outcome === "failure"
        ? { kind: EffectExecutionResultKind.BpmnError, code: "release-refused", message: "Reservation release refused", localPatch: [] }
        : result;
    },
  };
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "transaction-publication", activities);
    // The public start path remains intact; only the host's history budget is lowered to exercise its production rollover fence.
    const client = new WorkflowClient({
      connection: environment.client.connection, namespace: environment.client.options.namespace,
      interceptors: [{ async start(input, next) {
        if (input.workflowType !== bpmnProcessWorkflowType) return next(input);
        const args = input.options.args;
        const hostInput = args[2];
        assert.ok(typeof hostInput === "object" && hostInput !== null);
        return next({ ...input, options: { ...input.options,
          args: [args[0], args[1], { ...hostInput, eventHistoryEventLimit: 3 }],
        } });
      } }],
    });
    for (const selected of ["empty", "success", "failure"] as const) {
      await t.test(selected, async () => {
        outcome = selected; released = false; invocations = 0;
        firstStarted = deferred(); replacementStarted = deferred(); store = new EffectProbeStore();
        const instanceId = `Transaction_Public_${selected}`;
        const workflowId = processWorkflowId(instanceId);
        const identity = { definition: program.identity, processId: program.processId, processInstanceId: instanceId };
        const handle = environment.client.workflow.getHandle(workflowId);
        const started = await startBpmnProcess(client, { kind: StimulusKind.StartProcess,
          commandId: `start-${selected}`, processId: program.processId, instanceId, initialVariables: [] },
          program, { taskQueue: bpmnSemanticTaskQueue });
        assert.equal(started.kind, BpmnProcessStartResultKind.Started);
        await waitForOpenUserTaskIds(handle, ["Task_Reserve", "Task_Withdraw"]);
        const complete = async (elementId: string) => {
          const task = (await listOpenUserTasks(client, instanceId)).find(({ id }) => id.elementId === elementId);
          assert.ok(task);
          const stimulus = { kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${selected}-${elementId}`,
            taskId: task.id, submittedValues: [] } as const;
          const result = await submitUserTaskCompletion(client, instanceId, stimulus);
          assert.equal(result.kind, ProcessCommandResultKind.Semantic);
          if (result.kind !== ProcessCommandResultKind.Semantic) throw new Error("Expected semantic command receipt");
          assert.equal(result.outcome, CommandOutcome.Committed);
          return { stimulus, result };
        };
        const pages = async (): Promise<FlowNodeOccurrencePage[]> => {
          const result: FlowNodeOccurrencePage[] = [];
          let afterRevision = 0;
          for (let page = 0; page < 16; page += 1) {
            const [e1, e2] = await Promise.all([
              observeTemporalExecutionPublication(client as unknown as TemporalExecutionPublicationClient, workflowId, identity, { afterRevision }),
              observeTemporalFlowNodeOccurrences(client as unknown as TemporalFlowNodeOccurrencePublicationClient, workflowId, identity, { afterRevision }),
            ]);
            assert.equal(e1.kind, ExecutionPublicationResultKind.Available);
            assert.equal(e2.kind, FlowNodeOccurrencePublicationResultKind.Available);
            if (e1.kind !== ExecutionPublicationResultKind.Available || e2.kind !== FlowNodeOccurrencePublicationResultKind.Available) throw new Error("Missing paired publication");
            assert.equal(e1.page.pageThroughRevision, e2.page.pageThroughRevision);
            assert.equal(e1.page.headRevision, e2.page.headRevision);
            assert.deepEqual(e1.page.batches.map(({ fromRevision, throughRevision }) => [fromRevision, throughRevision]),
              e2.page.batches.map(({ fromRevision, throughRevision }) => [fromRevision, throughRevision]));
            result.push(e2.page);
            if (e2.page.pageThroughRevision === e2.page.headRevision) return result;
            assert.ok(e2.page.pageThroughRevision > afterRevision);
            afterRevision = e2.page.pageThroughRevision;
          }
          throw new Error("Transaction publication exceeded bounded pages");
        };
        if (selected !== "empty") {
          await complete("Task_Reserve");
          await waitForOpenUserTaskIds(handle, ["Task_Prepare", "Task_Withdraw"]);
        }
        const withdrawal = await complete("Task_Withdraw");
        if (selected !== "empty") {
          await withDeadline(firstStarted.promise, deadlineMs, "Transaction compensation Activity start");
          assert.deepEqual(await listOpenUserTasks(client, instanceId), []);
          const before = await pages();
          const open = before.at(-1)?.currentOpen?.map(({ elementId }) => elementId).sort();
          assert.deepEqual(open, ["Task_Release", "Transaction_Reservation"]);
          assert.equal(before.flatMap((page) => page.batches.flatMap((batch) => batch.transitions.flatMap(({ lifecycle }) => lifecycle.started)))
            .some(({ elementId }) => elementId === "Boundary_Cancel"), false);
          if (selected === "success") {
            await stopBpmnTestWorker(worker!); worker = undefined;
            worker = await startBpmnTestWorker(environment, bundle, "transaction-replacement", activities);
            await withDeadline(replacementStarted.promise, deadlineMs, "Transaction compensation retry after Worker replacement");
            assert.deepEqual(await pages(), before);
            assert.equal(store.evidence().mutations, 1);
          }
          released = true;
        }
        if (selected !== "failure") {
          await waitForOpenUserTaskIds(handle, ["Task_Acknowledge"]);
          const duplicate = await submitUserTaskCompletion(client, instanceId, withdrawal.stimulus);
          assert.deepEqual(duplicate, withdrawal.result);
          await complete("Task_Acknowledge");
        }
        const terminal = await withDeadline(readTestProcessTerminalResult(handle), deadlineMs, "Transaction terminal receipt");
        assert.equal(terminal.receipt.finalState.status, selected === "failure" ? "failed" : "completed");
        const final = await pages();
        assert.deepEqual(final.at(-1)?.currentOpen, []);
        const transitions = final.flatMap((page) => page.batches.flatMap(({ transitions }) => transitions));
        const startedFacts = transitions.flatMap(({ lifecycle }) => lifecycle.started);
        assert.equal(startedFacts.filter(({ elementId }) => elementId === "Boundary_Cancel").length, selected === "failure" ? 0 : 1);
        assert.equal(startedFacts.filter(({ elementId }) => elementId === "End_Normal").length, 0);
        const transaction = startedFacts.find(({ elementId }) => elementId === "Transaction_Reservation");
        assert.ok(transaction);
        assert.equal(transitions.flatMap(({ lifecycle }) => lifecycle.ended).filter(({ id, terminal }) =>
          JSON.stringify(id) === JSON.stringify(transaction.id) && terminal === "cancelled").length, 1);
        const evidence = await compensationWorkflowEvidence(environment, workflowId);
        assert.ok(evidence.runs.length > 1);
        if (selected !== "empty") {
          const activityRun = evidence.histories.findIndex((history) => historyEvents(history, "activityTaskScheduledEventAttributes").length > 0);
          assert.ok(activityRun > 0);
          assert.equal(historyEvents(evidence.histories[activityRun - 1]!, "workflowExecutionContinuedAsNewEventAttributes").length, 1);
        } else store.requireEmpty();
        for (const run of evidence.runs) await replayBpmnHistory(bundle, run.history, workflowId);
      });
    }
  } finally {
    released = true;
    if (worker) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

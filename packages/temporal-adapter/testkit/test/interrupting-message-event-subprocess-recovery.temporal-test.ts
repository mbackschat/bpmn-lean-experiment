import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CommandOutcome, INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID, ScenarioStepKind,
  StimulusKind, advanceScenario, observeStableState } from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, CompleteUserTaskInstanceStimulus, DeliverMessageStimulus } from "@bpmn-lean/semantic-core";
import {
  BpmnCommandIdentityConflict, BpmnWorkflowHostInputKind, WorkflowChainBudgetKind,
  bpmnDeliverMessageSignalName, bpmnProcessWorkflowType, bpmnSemanticTaskQueue, bpmnTraceQueryName,
  bpmnWorkflowContinuationV1, createCachedLocalEnvironment, loadBpmnWorkflowBundle, processWorkflowId,
  readTestProcessTerminalResult, requireBpmnWorkflowContinuationStateV1, submitMessageDelivery,
  submitUserTaskCompletion, workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";
import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { decodeJsonPayload, historyEvents } from "./temporal-history-facts.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

const compilation = await compileBpmnToSemanticProcess({
  bytes: await readFile(new URL("../../../bpmn-source/test/fixtures/application-review-withdrawal.bpmn", import.meta.url)),
  sourceId: "application-review-withdrawal", expectedSha256: undefined,
  semanticProfile: INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID, sourceOverlay: null,
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 },
});
assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
if (compilation.status !== BpmnCompilationStatus.Accepted) throw new Error("Application source must compile");
const program = compilation.semanticProcess;
const declaration = program.interruptingMessageEventSubProcesses![0]!;

for (const mode of ["withdraw-both", "withdraw-last", "normal", "terminate-handler"] as const) {
  test(`private Message handler recovery: ${mode}`, async () => {
    const environment = await withDeadline(createCachedLocalEnvironment({ identity: `imes-${mode}`,
      downloadDirectory: temporalCacheDirectory }), 40_000, "Message handler environment startup");
    let worker: WorkerLease | undefined;
    try {
      const bundle = await loadBpmnWorkflowBundle();
      worker = await startBpmnTestWorker(environment, bundle, `imes-original-${mode}`);
      const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
        instanceId: `application-${mode}`, initialVariables: [] } as const;
      const workflowId = processWorkflowId(start.instanceId);
      const oracle = createBusinessTaskHostOracle(environment, program, start);
      const delivery: DeliverMessageStimulus = { kind: StimulusKind.DeliverMessage, commandId: "withdraw",
        subscriptionId: { processInstanceId: start.instanceId, elementId: declaration.startEventId, activation: 1 }, channel: declaration.channel };
      const complete = (elementId: string, commandId = `complete-${elementId}`) => ({ kind: StimulusKind.CompleteUserTaskInstance,
        commandId, taskId: { processInstanceId: start.instanceId, elementId, activation: 1 }, submittedValues: [] } as const);
      const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
        args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
          eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
        workflowId, taskQueue: bpmnSemanticTaskQueue, workflowIdReusePolicy: "REJECT_DUPLICATE",
      });
      oracle.advance(start);
      async function assertCurrent() {
        const expected = observeStableState(program, oracle.state);
        assert.deepEqual(await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
          state => isDeepStrictEqual(state, expected)), expected);
        await oracle.assertPublications();
      }
      async function replaceWorker() {
        await stopBpmnTestWorker(worker!);
        worker = undefined;
        worker = await startBpmnTestWorker(environment, bundle, `imes-replacement-${mode}`);
        await assertCurrent();
      }
      async function submit(command: DeliverMessageStimulus | CompleteUserTaskInstanceStimulus, outcome: CommandOutcome) {
        const result = command.kind === StimulusKind.DeliverMessage
          ? await submitMessageDelivery(environment.client.workflow, start.instanceId, command)
          : await submitUserTaskCompletion(environment.client.workflow, start.instanceId, command);
        assert.deepEqual(result, { kind: "semantic", commandId: command.commandId, outcome });
        if (outcome === CommandOutcome.Committed) oracle.advance(command);
        else {
          const refused = advanceScenario(program, oracle.state, command);
          assert.equal(refused.kind, ScenarioStepKind.Terminal);
          assert.deepEqual(refused.state, oracle.state);
          oracle.trace.push(...refused.observations);
        }
        await assertCurrent();
      }
      await assertCurrent();
      await submit({ ...delivery, commandId: "wrong-channel", channel: { ...delivery.channel, messageId: "Other_Message" } }, CommandOutcome.Rejected);
      assert.ok((await workflowChainRuns(environment, workflowId)).length > 1);
      await replaceWorker();
      if (mode === "withdraw-last" || mode === "normal") await submit(complete("Task_Eligibility"), CommandOutcome.Committed);
      if (mode === "normal") {
        await submit(complete("Task_Documents"), CommandOutcome.Committed);
        assert.equal((await submitMessageDelivery(environment.client.workflow, start.instanceId, delivery)).kind, "processClosed");
      } else {
        // The result is deliberately unobserved; capsule IMES-REFUSE-01 requires recovery without another handler.
        await environment.client.workflow.getHandle(workflowId).signal(bpmnDeliverMessageSignalName, delivery);
        oracle.advance(delivery);
        await assertCurrent();
        assert.deepEqual(oracle.state.userTaskWaits.map(wait => wait.id.elementId), ["Task_Withdrawal"]);
        await replaceWorker();
        assert.deepEqual(await submitMessageDelivery(environment.client.workflow, start.instanceId, delivery),
          { kind: "semantic", commandId: delivery.commandId, outcome: CommandOutcome.Committed });
        await assert.rejects(submitMessageDelivery(environment.client.workflow, start.instanceId,
          { ...delivery, channel: { ...delivery.channel, messageId: "Changed_Message" } }), BpmnCommandIdentityConflict);
        await submit({ ...delivery, commandId: "second-withdrawal" }, CommandOutcome.Rejected);
        await submit(complete("Task_Documents", "cancelled-task"), CommandOutcome.Rejected);
        if (mode === "terminate-handler") {
          await environment.client.workflow.getHandle(workflowId).terminate("Stop during withdrawal handling");
          await oracle.assertPublications();
        } else await submit(complete("Task_Withdrawal"), CommandOutcome.Committed);
      }
      if (mode !== "terminate-handler") {
        const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "Message handler terminal receipt");
        assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
        await oracle.assertPublications();
      }
      const trace: CanonicalObservation[] = [];
      let dormantCarried = 0;
      let handlerCarried = 0;
      let terminations = 0;
      for (const run of await workflowChainRuns(environment, workflowId)) {
        const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
        const history = await runHandle.fetchHistory();
        trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
        terminations += historyEvents(history as TemporalHistory, "workflowExecutionTerminatedEventAttributes").length;
        for (const event of historyEvents(history as TemporalHistory, "workflowExecutionContinuedAsNewEventAttributes")) {
          const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
          const state = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, start.instanceId);
          if (state.eventSubProcessMessageSubscriptions?.length === 1) dormantCarried++;
          if (state.userTaskWaits.some(wait => wait.id.elementId === "Task_Withdrawal")) handlerCarried++;
        }
        await replayBpmnHistory(bundle, history, workflowId);
      }
      assert.ok(dormantCarried > 0);
      assert.equal(handlerCarried > 0, mode !== "normal");
      assert.equal(terminations, mode === "terminate-handler" ? 1 : 0);
      assert.deepEqual(trace, oracle.trace);
    } finally {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
      await environment.teardown();
    }
  });
}

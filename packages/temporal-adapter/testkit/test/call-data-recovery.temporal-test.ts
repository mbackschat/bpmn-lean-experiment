import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { CommandOutcome, ScenarioStepKind, StimulusKind, advanceScenario, observeStableState } from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, CompleteUserTaskInstanceStimulus } from "@bpmn-lean/semantic-core";
import {
  BpmnProcessStartResultKind, getTestProcessHandle, startBpmnProcess,
  BpmnWorkflowHostInputKind, WorkflowChainBudgetKind, bpmnProcessWorkflowType, bpmnSemanticTaskQueue,
  bpmnTraceQueryName, bpmnWorkflowContinuationV1, createCachedLocalEnvironment, loadBpmnWorkflowBundle,
  processWorkflowId, readTestProcessTerminalResult, readUserTaskDetail, requireBpmnWorkflowContinuationStateV1,
  submitUserTaskCompletion, workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";
import { scalar, supplierProgram as program, supplierStart } from "./call-data-test-support.ts";
import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { decodeJsonPayload, historyEvents } from "./temporal-history-facts.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

test("private Call data preserves supplier isolation through continuation, replacement and termination", async t => {
  const environment = await withDeadline(createCachedLocalEnvironment({ identity: "call-data-recovery",
    downloadDirectory: temporalCacheDirectory }), 40_000, "Call data Temporal environment startup");
  let worker: WorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "call-data-original");
    for (const mode of ["string", "null", "host-termination"] as const) {
      await t.test(mode, async () => {
        const value = mode === "null" ? null : "supplier-summary";
        const start = supplierStart(`supplier-host-${mode}`, value);
        const workflowId = processWorkflowId(start.instanceId);
        const oracle = createBusinessTaskHostOracle(environment, program, start);
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
        async function refuse(command: CompleteUserTaskInstanceStimulus) {
          assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, command),
            { kind: "semantic", commandId: command.commandId, outcome: CommandOutcome.Rejected });
          const refused = advanceScenario(program, oracle.state, command);
          assert.equal(refused.kind, ScenarioStepKind.Terminal);
          if (refused.kind !== ScenarioStepKind.Terminal) assert.fail("Expected a refused oracle command");
          assert.deepEqual(refused.state, oracle.state);
          oracle.trace.push(...refused.observations);
          await assertCurrent();
        }
        await assertCurrent();
        const calledTask = oracle.state.userTaskWaits[0]!;
        const detail = await readUserTaskDetail(environment.client.workflow, start.instanceId, {
          taskId: calledTask.id, inputVariableNames: ["Property_InternalNote", "Property_SupplierSummary"],
        });
        assert.deepEqual(detail?.inputVariables, []);
        assert.deepEqual(detail?.task.inputs, [scalar("Input_TaskSummary", value)]);
        const completion = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "assess",
          taskId: calledTask.id, submittedValues: [scalar("Output_TaskDecision", value)] } as const;
        await refuse({ ...completion, commandId: "missing-output", submittedValues: [] });
        await refuse({ ...completion, commandId: "wrong-output", submittedValues: [scalar("Output_ProcessDecision", value)] });
        assert.ok((await workflowChainRuns(environment, workflowId)).length > 1);
        await stopBpmnTestWorker(worker!);
        worker = undefined;
        worker = await startBpmnTestWorker(environment, bundle, `call-data-replacement-${mode}`);
        await assertCurrent();
        if (mode === "host-termination") {
          await handle.terminate("Supplier onboarding stopped before due diligence returned");
          await oracle.assertPublications();
          assert.deepEqual(oracle.state.variables.process.bindings.find(binding => binding.name === "Property_DueDiligenceDecision"),
            scalar("Property_DueDiligenceDecision", "prior-decision"));
        } else {
          assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, completion),
            { kind: "semantic", commandId: completion.commandId, outcome: CommandOutcome.Committed });
          oracle.advance(completion);
          await assertCurrent();
          assert.deepEqual(oracle.state.variables.processInterfaces, []);
          const callerDetail = await readUserTaskDetail(environment.client.workflow, start.instanceId, {
            taskId: oracle.state.userTaskWaits[0]!.id,
            inputVariableNames: ["Property_DueDiligenceDecision", "Property_InternalNote"],
          });
          assert.deepEqual(callerDetail?.inputVariables,
            [scalar("Property_DueDiligenceDecision", value), scalar("Property_InternalNote", "caller-only")]);
          assert.deepEqual(callerDetail?.task.inputs, [scalar("Input_FinalReviewDecision", value)]);
          assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, completion),
            { kind: "semantic", commandId: completion.commandId, outcome: CommandOutcome.Committed });
          await refuse({ ...completion, commandId: "stale-assess" });
          await oracle.completeHuman("Task_FinalReview", "finish", [scalar("Output_FinalReviewReceipt", "onboarded")]);
          const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "Call data terminal result");
          assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
          await oracle.assertPublications();
        }
        const runs = await workflowChainRuns(environment, workflowId);
        const trace: CanonicalObservation[] = [];
        let carriedInterface = 0;
        let terminations = 0;
        for (const run of runs) {
          const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
          const history = await runHandle.fetchHistory();
          trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
          terminations += historyEvents(history as TemporalHistory, "workflowExecutionTerminatedEventAttributes").length;
          for (const event of historyEvents(history as TemporalHistory, "workflowExecutionContinuedAsNewEventAttributes")) {
            const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
            const state = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, start.instanceId);
            if (state.variables.processInterfaces.length === 1) {
              carriedInterface++;
              assert.deepEqual(state.variables.processInterfaces[0]!.inputs, [scalar("Input_ProcessSummary", value)]);
              assert.deepEqual(state.variables.process.bindings, start.initialVariables);
            }
          }
          await replayBpmnHistory(bundle, history, workflowId);
        }
        assert.ok(carriedInterface > 0);
        assert.equal(terminations, mode === "host-termination" ? 1 : 0);
        assert.deepEqual(trace, oracle.trace);
      });
    }
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

test("public supplier Call admission completes scalar data and publishes replayable outcomes", async t => {
  const environment = await withDeadline(createCachedLocalEnvironment({ identity: "call-data-public",
    downloadDirectory: temporalCacheDirectory }), 40_000, "Public Call Temporal environment startup");
  let worker: WorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "call-data-public");
    for (const value of ["supplier-summary", null]) {
      await t.test(value === null ? "null" : "string", async () => {
        const start = supplierStart(`supplier-public-${value === null ? "null" : "string"}`, value);
        const started = await startBpmnProcess(environment.client.workflow, start, program, { taskQueue: bpmnSemanticTaskQueue });
        assert.deepEqual(started, { kind: BpmnProcessStartResultKind.Started, processInstanceId: start.instanceId });
        const oracle = createBusinessTaskHostOracle(environment, program, start);
        oracle.advance(start);
        await oracle.assertPublications();
        await oracle.completeHuman("Task_AssessSupplier", "assess", [scalar("Output_TaskDecision", value)]);
        await oracle.assertPublications();
        await oracle.completeHuman("Task_FinalReview", "finish", [scalar("Output_FinalReviewReceipt", "onboarded")]);
        const handle = getTestProcessHandle(environment.client.workflow, start.instanceId);
        const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "Public Call completion");
        assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
        await oracle.assertPublications();
        for (const run of await workflowChainRuns(environment, handle.workflowId)) {
          const history = await environment.client.workflow.getHandle(handle.workflowId, run.runId).fetchHistory();
          await replayBpmnHistory(bundle, history, handle.workflowId);
        }
      });
    }
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

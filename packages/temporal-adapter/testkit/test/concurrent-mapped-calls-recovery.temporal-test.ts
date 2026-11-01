import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, SemanticProfileId, StimulusKind, VariableValueKind, deriveCalledProcessInstanceId, observeStableState,
} from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, CompleteUserTaskInstanceStimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind, WorkflowChainBudgetKind, bpmnProcessWorkflowType, bpmnSemanticTaskQueue,
  bpmnTraceQueryName, bpmnWorkflowContinuationV1, createCachedLocalEnvironment, loadBpmnWorkflowBundle,
  processWorkflowId, readTestProcessTerminalResult, readUserTaskDetail, requireBpmnWorkflowContinuationStateV1,
  submitUserTaskCompletion, workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";
import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { decodeJsonPayload, historyEvents } from "./temporal-history-facts.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

const compiled = await compileBpmnToSemanticProcess({
  bytes: new Uint8Array(await readFile(new URL(
    "../../../../scenarios/concurrent-mapped-calls/supplier-onboarding.bpmn", import.meta.url))),
  sourceId: "supplier-onboarding-mapped", expectedSha256: undefined,
  semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion, sourceOverlay: null,
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5_000 },
});
assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
const program = compiled.semanticProcess;
const text = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });

// The proposal's smallest refinement witness: both expert calls of one definition live across a Continue-As-New, a
// Worker replacement while both are open, the compliance expert answering first, then the financial expert, then
// approval, with every Run replayed and the final Process variables compared with the core.
test("two mapped calls of one definition keep their own frames through continuation, Worker replacement and replay",
  async () => {
    const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
      instanceId: "Supplier_mapped_hosted", initialVariables: [text("supplierName", "Acme")] } as const;
    const workflowId = processWorkflowId(start.instanceId);
    const financial = deriveCalledProcessInstanceId(start.instanceId, "FinancialExpertOpinion", 1);
    const compliance = deriveCalledProcessInstanceId(start.instanceId, "ComplianceExpertOpinion", 1);
    const environment = await withDeadline(createCachedLocalEnvironment({ identity: "concurrent-mapped-calls-recovery",
      downloadDirectory: temporalCacheDirectory }), 40_000, "concurrent mapped Calls Temporal environment startup");
    const oracle = createBusinessTaskHostOracle(environment, program, start);
    let worker: WorkerLease | undefined;
    // Addresses the open task by its instance and element, after the host has published exactly the oracle's state.
    const complete = async (processInstanceId: string, elementId: string,
      submittedValues: readonly VariableBinding[] = []): Promise<void> => {
      const expected = observeStableState(program, oracle.state);
      await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
        state => isDeepStrictEqual(state, expected));
      await oracle.assertPublications();
      const wait = oracle.state.userTaskWaits.find(({ id }) =>
        id.processInstanceId === processInstanceId && id.elementId === elementId);
      assert.ok(wait !== undefined, `${elementId} of ${processInstanceId} must be open`);
      const stimulus: CompleteUserTaskInstanceStimulus = { kind: StimulusKind.CompleteUserTaskInstance,
        commandId: `complete-${elementId}-${wait.id.activation}`, taskId: wait.id, submittedValues };
      assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, stimulus),
        { kind: "semantic", commandId: stimulus.commandId, outcome: CommandOutcome.Committed });
      oracle.advance(stimulus);
    };
    try {
      const bundle = await loadBpmnWorkflowBundle();
      worker = await startBpmnTestWorker(environment, bundle, "concurrent-mapped-calls-original");
      const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
        args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
          eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
        workflowId, taskQueue: bpmnSemanticTaskQueue, workflowIdReusePolicy: "REJECT_DUPLICATE",
      });
      oracle.advance(start);
      await complete(start.instanceId, "PrepareFinancialFile");
      await complete(start.instanceId, "PrepareComplianceFile");
      const bothOpen = observeStableState(program, oracle.state);
      await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
        state => isDeepStrictEqual(state, bothOpen));
      await stopBpmnTestWorker(worker);
      worker = undefined;
      worker = await startBpmnTestWorker(environment, bundle, "concurrent-mapped-calls-replacement");
      // CMCALL-IN-01 and CVM-OBSERVE-01 on the host: each expert's detail shows only its own mapped input.
      const names = ["dossier", "file", "screeningFile", "supplierName"];
      const detail = async (processInstanceId: string) => (await readUserTaskDetail(environment.client.workflow,
        start.instanceId, { taskId: oracle.state.userTaskWaits.find(({ id }) => id.processInstanceId === processInstanceId)!.id,
          inputVariableNames: names }))?.inputVariables;
      assert.deepEqual(await detail(financial), [text("dossier", "Acme")]);
      assert.deepEqual(await detail(compliance), [text("screeningFile", "sanctions screening")]);
      // CMCALL-OUT-01 in reverse invocation order.
      await complete(compliance, "GiveExpertOpinion", [text("finding", "clear")]);
      await complete(financial, "GiveExpertOpinion", [text("dossier", "Acme revised"), text("opinion", "solvent")]);
      await complete(start.instanceId, "ApproveSupplier");
      const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "supplier onboarding completion");
      assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
      assert.deepEqual(oracle.state.variables.process.bindings,
        [text("complianceVerdict", "clear"), text("financialVerdict", "solvent"), text("supplierName", "Acme")]);
      await oracle.assertPublications();

      const trace: CanonicalObservation[] = [];
      let bothCarried = 0;
      for (const run of await workflowChainRuns(environment, workflowId)) {
        const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
        const history = await runHandle.fetchHistory();
        trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
        for (const event of historyEvents(history as TemporalHistory, "workflowExecutionContinuedAsNewEventAttributes")) {
          const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
          const state = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program,
            start.instanceId);
          const frames = state.variables.scopes.map(({ owner }) => owner.processInstanceId);
          if (frames.includes(financial) && frames.includes(compliance)) bothCarried++;
        }
        await replayBpmnHistory(bundle, history, workflowId);
      }
      assert.ok(bothCarried > 0, "both called-root frames must be live across a Continue-As-New");
      assert.deepEqual(trace, oracle.trace);
    } finally {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
      await environment.teardown();
    }
  });

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  EffectExecutionResultKind, SemanticProfileId, StimulusKind, VariableValueKind, deriveCalledProcessInstanceId,
  observeStableState,
} from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, VariableBinding } from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind, WorkflowChainBudgetKind, bpmnProcessWorkflowType, bpmnSemanticTaskQueue,
  bpmnTraceQueryName, bpmnWorkflowContinuationV1, createCachedLocalEnvironment, loadBpmnWorkflowBundle,
  processWorkflowId, readTestProcessTerminalResult, readUserTaskDetail, requireBpmnWorkflowContinuationStateV1,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type { EffectRequest, TemporalHistory } from "@bpmn-lean/temporal-testkit";
import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { decodeJsonPayload, historyEvents } from "./temporal-history-facts.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

const directory = new URL("../../../../scenarios/repeated-nested-concurrent-calls/", import.meta.url);
const overlay = new Uint8Array(await readFile(new URL("guarantor-loan-overlay.json", directory)));
const compiled = await compileBpmnToSemanticProcess({
  bytes: new Uint8Array(await readFile(new URL("guarantor-loan.bpmn", directory))), sourceId: "guarantor-loan",
  expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
  sourceOverlay: { id: "guarantor-loan-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5_000 },
});
assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
const program = compiled.semanticProcess;
const text = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const acknowledged = { kind: EffectExecutionResultKind.Success, localPatch: [] } as const;

// The proposal's Stage B refinement witness: the mapping account's recovery witness moved onto the guarantor loan,
// with the Sub-Process-placed Call carried live through Continue-As-New, its called-task detail read after a Worker
// replacement, and every Run replayed.
test("a Sub-Process-placed mapped Call keeps its caller frame through continuation, Worker replacement and replay", async () => {
  const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId: "Loan_guarantor_hosted",
    initialVariables: [text("amount", "25000"), text("applicant", "Ada"), text("guarantor", "Bob")] } as const;
  const workflowId = processWorkflowId(start.instanceId);
  const guarantorCall = deriveCalledProcessInstanceId(start.instanceId, "VerifyGuarantor", 1);
  const requests: EffectRequest[] = [];
  const activities = { executeBpmnEffect: async (request: EffectRequest) => {
    assert.equal(request.operation, "registerApplication");
    requests.push(structuredClone(request));
    return acknowledged;
  } };
  const environment = await withDeadline(createCachedLocalEnvironment({ identity: "embedded-mapped-calls-recovery",
    downloadDirectory: temporalCacheDirectory }), 40_000, "embedded mapped Calls Temporal environment startup");
  const oracle = createBusinessTaskHostOracle(environment, program, start);
  let worker: WorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "embedded-mapped-calls-original", activities);
    const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
      args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
      workflowId, taskQueue: bpmnSemanticTaskQueue, workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    oracle.advance(start);
    oracle.completeEffect(acknowledged);
    await oracle.completeHuman("CollectDocument", "applicant-collect", [text("amount", "20000")]);
    await oracle.completeHuman("RecordVerdict", "applicant-verdict", [text("verdict", "approved")]);
    const guarantorOpen = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
      state => state.openUserTasks.some(task => task.id.processInstanceId === guarantorCall));
    assert.deepEqual(guarantorOpen, observeStableState(program, oracle.state));
    assert.ok((await workflowChainRuns(environment, workflowId)).length > 1);
    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(environment, bundle, "embedded-mapped-calls-replacement", activities);
    // CALLN-FRAME-01 on the host: the Call read `guarantor` along the Sub-Process chain, and neither the caller-only
    // name nor the first Call's `amount` is visible to the second Call's task.
    const detail = await readUserTaskDetail(environment.client.workflow, start.instanceId, {
      taskId: oracle.state.userTaskWaits[0]!.id, inputVariableNames: ["amount", "customer", "guarantor"],
    });
    assert.deepEqual(detail?.inputVariables, [text("customer", "Bob")]);
    await oracle.completeHuman("CollectDocument", "guarantor-collect");
    await oracle.completeHuman("RecordVerdict", "guarantor-verdict", [text("verdict", "rejected")]);
    await oracle.completeHuman("ConfirmGuarantor", "confirm");
    const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "guarantor loan completion");
    assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
    await oracle.assertPublications();
    assert.deepEqual(requests, oracle.requests);

    const trace: CanonicalObservation[] = [];
    let embeddedCarried = 0;
    for (const run of await workflowChainRuns(environment, workflowId)) {
      const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
      const history = await runHandle.fetchHistory();
      trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
      for (const event of historyEvents(history as TemporalHistory, "workflowExecutionContinuedAsNewEventAttributes")) {
        const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
        const state = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, start.instanceId);
        const record = state.calledProcessOccurrences.find(({ id }) => id.elementId === "VerifyGuarantor");
        if (record === undefined) continue;
        embeddedCarried++;
        // The embedded-caller record survives the checkpoint, and the declaring Sub-Process frame, not the Process,
        // holds the target until the Call returns.
        assert.equal(record.caller.definitionScopeId, "scope:GuarantorReview");
        assert.ok(state.variables.scopes.some(({ owner, bindings }) =>
          owner.processInstanceId === start.instanceId && owner.definitionScopeId === "scope:GuarantorReview" &&
          bindings.some(({ name }) => name === "guarantorVerdict")));
        assert.equal(state.variables.process.bindings.some(({ name }) => name === "guarantorVerdict"), false);
      }
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assert.ok(embeddedCarried > 0, "the Sub-Process-placed Call must be live across a Continue-As-New");
    assert.deepEqual(trace, oracle.trace);
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

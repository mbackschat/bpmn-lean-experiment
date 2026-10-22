import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
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

const directory = new URL("../../../../scenarios/call-variable-mapping/", import.meta.url);
const overlay = new Uint8Array(await readFile(new URL("loan-application-overlay.json", directory)));
const compiled = await compileBpmnToSemanticProcess({
  bytes: new Uint8Array(await readFile(new URL("loan-application.bpmn", directory))), sourceId: "loan-application",
  expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
  sourceOverlay: { id: "loan-application-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5_000 },
});
assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
const program = compiled.semanticProcess;
const text = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const acknowledged = { kind: EffectExecutionResultKind.Success, localPatch: [] } as const;

// The capsule's smallest refinement witness: one live mapped call carried through Continue-As-New, a Worker
// replacement between its two called tasks, return into the review frame, and every Run replayed.
test("a mapped Call keeps its called-root frame through continuation, Worker replacement and replay", async () => {
  const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId: "Loan_hosted", initialVariables: [text("amount", "25000"), text("applicant", "Ada")] } as const;
  const workflowId = processWorkflowId(start.instanceId);
  const calledInstanceId = deriveCalledProcessInstanceId(start.instanceId, "VerifyIdentity", 1);
  const requests: EffectRequest[] = [];
  const activities = { executeBpmnEffect: async (request: EffectRequest) => {
    assert.equal(request.operation, "acknowledgeApplication");
    requests.push(structuredClone(request));
    return acknowledged;
  } };
  const environment = await withDeadline(createCachedLocalEnvironment({ identity: "call-variable-mapping-recovery",
    downloadDirectory: temporalCacheDirectory }), 40_000, "Call variable mapping Temporal environment startup");
  const oracle = createBusinessTaskHostOracle(environment, program, start);
  let worker: WorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "call-mapping-original", activities);
    const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
      args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
      workflowId, taskQueue: bpmnSemanticTaskQueue, workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    oracle.advance(start);
    oracle.completeEffect(acknowledged);
    await oracle.completeHuman("CollectDocument", "collect", [text("amount", "1")]);
    const recordVerdict = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
      state => state.openUserTasks.some(task => task.id.elementId === "RecordVerdict"));
    assert.deepEqual(recordVerdict, observeStableState(program, oracle.state));
    assert.ok((await workflowChainRuns(environment, workflowId)).length > 1);
    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(environment, bundle, "call-mapping-replacement", activities);
    // CVM-OBSERVE-01 on the host: the caller-only name stays hidden and the copied target reads the called value.
    const detail = await readUserTaskDetail(environment.client.workflow, start.instanceId, {
      taskId: oracle.state.userTaskWaits[0]!.id, inputVariableNames: ["amount", "applicant", "customer"],
    });
    assert.deepEqual(detail?.inputVariables, [text("amount", "1"), text("customer", "Ada")]);
    await oracle.completeHuman("RecordVerdict", "verdict", [text("verdict", "approved")]);
    await oracle.completeHuman("ConfirmDecision", "confirm", [text("decision", "referred")]);
    const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "Call variable mapping completion");
    assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
    await oracle.assertPublications();
    assert.deepEqual(requests, oracle.requests);

    const trace: CanonicalObservation[] = [];
    let carriedFrames = 0;
    for (const run of await workflowChainRuns(environment, workflowId)) {
      const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
      const history = await runHandle.fetchHistory();
      trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
      for (const event of historyEvents(history as TemporalHistory, "workflowExecutionContinuedAsNewEventAttributes")) {
        const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
        const state = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, start.instanceId);
        const frame = state.variables.scopes.find(scope => scope.owner.processInstanceId === calledInstanceId);
        if (frame === undefined) continue;
        carriedFrames++;
        // CVM-ISOLATE-01 across the checkpoint: the caller's `amount` never takes the called write.
        assert.ok(isDeepStrictEqual(state.variables.process.bindings.find(({ name }) => name === "amount"), text("amount", "25000")));
      }
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assert.ok(carriedFrames > 0);
    assert.deepEqual(trace, oracle.trace);
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

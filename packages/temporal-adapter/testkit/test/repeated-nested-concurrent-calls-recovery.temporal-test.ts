import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CommandOutcome, SemanticProfileId, StimulusKind, observeStableState } from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, CompleteUserTaskInstanceStimulus } from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind, ExecutionPublicationResultKind, FlowNodeOccurrencePublicationResultKind,
  WorkflowChainBudgetKind, bpmnProcessWorkflowType, bpmnSemanticTaskQueue, bpmnTraceQueryName,
  bpmnWorkflowContinuationV1, createCachedLocalEnvironment, loadBpmnWorkflowBundle,
  observeTemporalExecutionPublication, observeTemporalFlowNodeOccurrences, processWorkflowId,
  readPublicationUntilAnswered, readTestProcessTerminalResult, requireBpmnWorkflowContinuationStateV1,
  submitUserTaskCompletion, workflowChainCanonicalUtf8ByteLength, workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalExecutionPublicationClient, TemporalFlowNodeOccurrencePublicationClient, TemporalHistory,
} from "@bpmn-lean/temporal-testkit";
import { embeddedCompletionHostingIdentityByteLimit } from "@bpmn-lean/temporal-protocol";
import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { decodeJsonPayload, historyEvents } from "./temporal-history-facts.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

const compiled = await compileBpmnToSemanticProcess({
  bytes: new Uint8Array(await readFile(new URL(
    "../../../../scenarios/repeated-nested-concurrent-calls/supplier-onboarding.bpmn", import.meta.url))),
  sourceId: "supplier-onboarding", expectedSha256: undefined,
  semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion, sourceOverlay: null,
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5_000 },
});
assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
const program = compiled.semanticProcess;

// The proposal's smallest Stage A refinement witness: both concurrent approval calls live across a
// Continue-As-New with a Worker replacement between their completions, the calls completing in reverse order,
// the nested risk-review chain live across a later Continue-As-New, and every Run replayed. The hosting identity is
// the longest Start admits, so every publication, Query and terminal envelope is measured at that bound.
test("concurrent and nested Calls keep their records through continuation, Worker replacement and replay", async (t) => {
  const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId: "Supplier_hosted_".padEnd(embeddedCompletionHostingIdentityByteLimit, "x"),
    initialVariables: [] } as const;
  const workflowId = processWorkflowId(start.instanceId);
  const environment = await withDeadline(createCachedLocalEnvironment({ identity: "repeated-nested-calls-recovery",
    downloadDirectory: temporalCacheDirectory }), 40_000, "repeated nested Calls Temporal environment startup");
  const oracle = createBusinessTaskHostOracle(environment, program, start);
  let worker: WorkerLease | undefined;
  // Addresses the open task by element and activation, which name one wait across every called instance
  // (CALLN-IDENTITY-01), after the host has published exactly the oracle's state.
  const complete = async (task: string, activation: number): Promise<void> => {
    const expected = observeStableState(program, oracle.state);
    await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
      state => isDeepStrictEqual(state, expected));
    await oracle.assertPublications();
    const wait = oracle.state.userTaskWaits.find(({ id }) =>
      id.elementId === `UserTask_${task}` && id.activation === activation);
    assert.ok(wait !== undefined, `${task} activation ${activation} must be open`);
    const stimulus: CompleteUserTaskInstanceStimulus = { kind: StimulusKind.CompleteUserTaskInstance,
      commandId: `complete-${task}-${activation}`, taskId: wait.id, submittedValues: [] };
    assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, stimulus),
      { kind: "semantic", commandId: stimulus.commandId, outcome: CommandOutcome.Committed });
    oracle.advance(stimulus);
  };
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "repeated-nested-calls-original");
    const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
      args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
      workflowId, taskQueue: bpmnSemanticTaskQueue, workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    oracle.advance(start);
    for (const task of ["RegisterSupplier", "CollectTaxDocuments", "CollectBankDetails"]) await complete(task, 1);
    // CALLN-RETURN-01 in reverse order: the bank instance, invoked second, progresses and returns first.
    await complete("PrepareApproval", 2);
    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(environment, bundle, "repeated-nested-calls-replacement");
    await complete("Approve", 1);
    await complete("PrepareApproval", 1);
    await complete("Approve", 2);
    await complete("AssessRisk", 1);
    await complete("ScreenSanctions", 1);
    await complete("PrepareApproval", 3);
    await complete("Approve", 3);
    const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "supplier onboarding completion");
    assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
    await oracle.assertPublications();
    const terminalBytes = workflowChainCanonicalUtf8ByteLength(terminal);
    assert.ok(terminalBytes <= workflowChainProductionLimit(WorkflowChainBudgetKind.TerminalResultEnvelopeBytes));
    const identity = { definition: program.identity, processId: program.processId, processInstanceId: start.instanceId };
    const [execution, occurrences] = await Promise.all([
      readPublicationUntilAnswered("supplier E1 publication", () => observeTemporalExecutionPublication(
        environment.client.workflow as unknown as TemporalExecutionPublicationClient, workflowId, identity,
        { afterRevision: 0 })),
      readPublicationUntilAnswered("supplier E2 publication", () => observeTemporalFlowNodeOccurrences(
        environment.client.workflow as unknown as TemporalFlowNodeOccurrencePublicationClient, workflowId, identity,
        { afterRevision: 0 })),
    ]);
    if (execution.kind !== ExecutionPublicationResultKind.Available ||
        occurrences.kind !== FlowNodeOccurrencePublicationResultKind.Available) assert.fail("publications must be available");
    const publicationBytes = workflowChainCanonicalUtf8ByteLength(execution.page) +
      workflowChainCanonicalUtf8ByteLength(occurrences.page);
    assert.ok(publicationBytes <= workflowChainProductionLimit(WorkflowChainBudgetKind.QueryResponseBytes));
    t.diagnostic(`terminal ${terminalBytes} bytes, first E1+E2 publication page ${publicationBytes} bytes, ` +
      `through revision ${execution.page.pageThroughRevision} of ${execution.page.headRevision}`);

    const trace: CanonicalObservation[] = [];
    let concurrentCarried = 0;
    let nestedCarried = 0;
    for (const run of await workflowChainRuns(environment, workflowId)) {
      const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
      const history = await runHandle.fetchHistory();
      trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
      for (const event of historyEvents(history as TemporalHistory, "workflowExecutionContinuedAsNewEventAttributes")) {
        const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
        const state = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program,
          start.instanceId);
        const calls = state.calledProcessOccurrences.map(({ id }) => id.elementId);
        if (calls.includes("CallActivity_TaxApproval") && calls.includes("CallActivity_BankApproval")) concurrentCarried++;
        if (calls.includes("CallActivity_CheckCompliance")) nestedCarried++;
      }
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assert.ok(concurrentCarried > 0, "both approval calls must be live across a Continue-As-New");
    assert.ok(nestedCarried > 0, "the nested risk-review chain must be live across a Continue-As-New");
    assert.deepEqual(trace, oracle.trace);
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

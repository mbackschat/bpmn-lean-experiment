import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind, CommandOutcome, SemanticProfileId, StimulusKind, VariableValueKind,
  observeStableState,
} from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, VariableBinding } from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind, WorkflowChainBudgetKind, bpmnProcessWorkflowType, bpmnSemanticTaskQueue,
  bpmnTraceQueryName, bpmnWorkflowContinuationV1, createCachedLocalEnvironment, loadBpmnWorkflowBundle,
  processWorkflowId, readTestProcessTerminalResult, submitUserTaskCompletion, workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

const directory = new URL("../../../../scenarios/exclusive-choice-without-default/", import.meta.url);
const overlay = new Uint8Array(await readFile(new URL("ticket-triage-overlay.json", directory)));
const compiled = await compileBpmnToSemanticProcess({
  bytes: new Uint8Array(await readFile(new URL("ticket-triage.bpmn", directory))), sourceId: "ticket-triage",
  expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
  sourceOverlay: { id: "ticket-triage-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5_000 },
});
assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
const program = compiled.semanticProcess;
const severity = (value: string): VariableBinding[] => [{ name: "severity", value: { kind: VariableValueKind.String, value } }];

// The proposal's smallest refinement witness (XND-HOST-02): a completion whose Choice matches no route returns the
// semantic result `rolledBack`, a retry of the same command after a Worker replacement recovers that result, nothing
// is published, the Workflow stays open with the task completable, and a distinct later command commits. Every Run
// replays.
test("a rolled-back completion Update answers rolledBack, survives Worker replacement and leaves the task completable", async () => {
  const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId: "Ticket_hosted", initialVariables: [{ name: "ticket", value: { kind: VariableValueKind.String, value: "T-9" } }] } as const;
  const workflowId = processWorkflowId(start.instanceId);
  const activities = { executeBpmnEffect: async () => assert.fail("no journey here reaches Auto-close") };
  const environment = await withDeadline(createCachedLocalEnvironment({ identity: "exclusive-choice-without-default-recovery",
    downloadDirectory: temporalCacheDirectory }), 40_000, "Default-less Choice Temporal environment startup");
  const oracle = createBusinessTaskHostOracle(environment, program, start);
  let worker: WorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "defaultless-choice-original", activities);
    const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
      args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryEvents),
        eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
      workflowId, taskQueue: bpmnSemanticTaskQueue, workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    oracle.advance(start);
    const opened = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
      state => state.openUserTasks.some(task => task.id.elementId === "TriageTicket"));
    assert.deepEqual(opened, observeStableState(program, oracle.state));
    const medium = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "triage-medium",
      taskId: opened.openUserTasks[0]!.id, submittedValues: severity("medium") } as const;
    const rolledBack = { kind: "semantic", commandId: medium.commandId, outcome: CommandOutcome.RolledBack };
    assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, medium), rolledBack);
    // The Workflow records the rolled-back command and republishes the unchanged state, as the core's terminal step does.
    oracle.trace.push({ kind: CanonicalObservationKind.Command, commandId: medium.commandId, outcome: CommandOutcome.RolledBack },
      observeStableState(program, oracle.state)!);

    await stopBpmnTestWorker(worker);
    worker = undefined;
    worker = await startBpmnTestWorker(environment, bundle, "defaultless-choice-replacement", activities);
    assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, medium), rolledBack);
    await oracle.assertPublications();

    await oracle.completeHuman("TriageTicket", "triage-high", severity("high"));
    await oracle.completeHuman("Escalate", "escalate");
    const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "Default-less Choice completion");
    assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
    await oracle.assertPublications();

    const trace: CanonicalObservation[] = [];
    for (const run of await workflowChainRuns(environment, workflowId)) {
      const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
      trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
      await replayBpmnHistory(bundle, await runHandle.fetchHistory(), workflowId);
    }
    assert.deepEqual(trace, oracle.trace);
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

/**
 * The Activity host refinement witness of the proposal's Temporal preflight, on the claim review model with the
 * registered `claim-expert` values.
 *
 * The expert opinion's result opens *Review claim* through its second incoming flow, so the pending User Task is the
 * host's arrival from `Flow_OpinionReceived`. A lowered Event History limit makes the Runs roll over, so Continue-As-New
 * carries that wait and the Program with its hosts. The successor completes the review and fetches the outcome. The
 * preserved relation is the preflight's: publications follow the core oracle after every command, every Run replays,
 * and the final state equals the core's.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, ProcessStatus, SemanticOperationKind, SemanticProfileId, StimulusKind,
  observeStableState,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation, EffectExecutionResult, EffectOccurrenceId, StartProcessStimulus, Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind, WorkflowChainBudgetKind, bpmnProcessWorkflowType, bpmnSemanticTaskQueue, bpmnTraceQueryName,
  bpmnWorkflowContinuationV1, completeEffectStimulus, createCachedLocalEnvironment, loadBpmnWorkflowBundle,
  processWorkflowId, readTestProcessTerminalResult, requireBpmnWorkflowContinuationStateV1, submitUserTaskCompletion,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type { EffectRequest, TemporalHistory } from "@bpmn-lean/temporal-testkit";
import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { decodeJsonPayload, historyEvents } from "./temporal-history-facts.ts";
import { temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

const directory = new URL("../../../../scenarios/activity-host-merge/", import.meta.url);
const instanceId = "activity-host-merge-recovery";

/** The registered schedule's Start variables and each effect's result, keyed by its handler operation. */
async function registeredValues() {
  const scenario = JSON.parse(await readFile(new URL("claim-expert.scenario.json", directory), "utf8")) as
    { stimuli: Stimulus[] };
  const [start] = scenario.stimuli;
  assert.ok(start?.kind === StimulusKind.StartProcess);
  const results = new Map(scenario.stimuli.flatMap(stimulus =>
    stimulus.kind === StimulusKind.CompleteEffect ? [[stimulus.effectId.elementId, stimulus.result] as const] : []));
  return { initialVariables: start.initialVariables, results };
}

test("a host's second-flow arrival survives forced Continue-As-New and every-Run replay", { timeout: 90_000 }, async () => {
  const overlay = await readFile(new URL("claim-review-overlay.json", directory));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("claim-review.bpmn", directory)), sourceId: "claim-review", expectedSha256: undefined,
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "claim-review-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 },
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
  const program = compiled.semanticProcess;
  assert.ok(program.operations.some(operation => operation.kind === SemanticOperationKind.Activity &&
    operation.origin.elementId === "ReviewClaim"), "Review claim must lower to a host");
  const { initialVariables, results } = await registeredValues();
  const resultOf = (elementId: string): EffectExecutionResult => {
    const result = results.get(elementId);
    assert.ok(result !== undefined && result.kind === EffectExecutionResultKind.Success, elementId);
    return result;
  };
  const elementOf = new Map([["triageClaim", "TriageClaim"], ["obtainExpertOpinion", "ObtainExpertOpinion"],
    ["fetchReviewOutcome", "FetchReviewOutcome"]]);
  const start: StartProcessStimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId, initialVariables };
  const workflowId = processWorkflowId(instanceId);
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity: "activity-host-merge-recovery", downloadDirectory: temporalCacheDirectory,
  }), 40_000, "Activity host merge Temporal environment startup");
  const oracle = createBusinessTaskHostOracle(environment, program, start);
  const effectId = (elementId: string): EffectOccurrenceId => ({ processInstanceId: instanceId, elementId, activation: 1 });
  const activities = {
    executeBpmnEffect: async (request: EffectRequest) => resultOf(elementOf.get(request.operation) ?? request.operation),
  };

  async function published(): Promise<void> {
    const expected = observeStableState(program, oracle.state);
    assert.deepEqual(await waitForPublishedWorkflowChainState(environment, workflowId, program, instanceId,
      state => isDeepStrictEqual(state, expected)), expected);
    await oracle.assertPublications();
  }

  let worker: WorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "activity-host-merge", activities);
    const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
      args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
      taskQueue: bpmnSemanticTaskQueue, workflowId, workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    oracle.advance(start);
    oracle.advance(completeEffectStimulus(effectId("TriageClaim"), resultOf("TriageClaim")));
    oracle.advance(completeEffectStimulus(effectId("ObtainExpertOpinion"), resultOf("ObtainExpertOpinion")));
    // Review claim is pending through its second incoming flow, after the Runs have rolled over.
    await published();

    const review = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "complete-review-claim",
      taskId: { processInstanceId: instanceId, elementId: "ReviewClaim", activation: 1 }, submittedValues: [] } as const;
    assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, instanceId, review),
      { kind: "semantic", commandId: review.commandId, outcome: CommandOutcome.Committed });
    oracle.advance(review);
    oracle.advance(completeEffectStimulus(effectId("FetchReviewOutcome"), resultOf("FetchReviewOutcome")));

    const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "claim review terminal result");
    assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
    assert.equal(terminal.receipt.finalState.status, ProcessStatus.Completed);
    await oracle.assertPublications();

    const runs = await workflowChainRuns(environment, workflowId);
    const trace: CanonicalObservation[] = [];
    let carriedReviewWaits = 0;
    for (const run of runs) {
      const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
      const history = await runHandle.fetchHistory();
      trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
      for (const event of historyEvents(history as TemporalHistory, "workflowExecutionContinuedAsNewEventAttributes")) {
        const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
        const state = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, instanceId);
        if (state.userTaskWaits.some(({ id }) => id.elementId === "ReviewClaim")) carriedReviewWaits++;
      }
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assert.ok(runs.length > 1);
    assert.ok(carriedReviewWaits > 0, "Continue-As-New must carry the pending Review claim wait");
    assert.deepEqual(trace, oracle.trace);
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

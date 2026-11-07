/**
 * The Activity host split refinement witness of the proposal's Temporal preflight, on the insurance claim intake model
 * with the registered `intake-archive-first` values.
 *
 * *Register claim* and *Review claim* each lower to a host with two outputs. A lowered Event History limit makes the Runs
 * roll over, and a rollover waits for every issued Activity to settle, so Continue-As-New carries *Register claim*'s
 * effect wait with both outputs unscheduled, and later *Order assessment*'s effect wait beside *Inform customer*, both
 * opened by *Review claim*'s one completion step. The preserved relation is the preflight's: publications follow the core
 * oracle after every command, every Run replays, and the final state equals the core's.
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

const directory = new URL("../../../../scenarios/activity-host-split/", import.meta.url);
const instanceId = "activity-host-split-recovery";

/** The registered schedule's Start variables and each effect's result, keyed by its element. */
async function registeredValues() {
  const scenario = JSON.parse(await readFile(new URL("intake-archive-first.scenario.json", directory), "utf8")) as
    { stimuli: Stimulus[] };
  const [start] = scenario.stimuli;
  assert.ok(start?.kind === StimulusKind.StartProcess);
  const results = new Map(scenario.stimuli.flatMap(stimulus =>
    stimulus.kind === StimulusKind.CompleteEffect ? [[stimulus.effectId.elementId, stimulus.result] as const] : []));
  return { initialVariables: start.initialVariables, results };
}

test("both outputs of a splitting host survive forced Continue-As-New and every-Run replay", { timeout: 90_000 }, async () => {
  const overlay = await readFile(new URL("insurance-claim-intake-overlay.json", directory));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("insurance-claim-intake.bpmn", directory)), sourceId: "insurance-claim-intake",
    expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "insurance-claim-intake-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 },
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
  const program = compiled.semanticProcess;
  for (const elementId of ["RegisterClaim", "ReviewClaim"]) {
    assert.ok(program.operations.some(operation => operation.kind === SemanticOperationKind.Activity &&
      operation.origin.elementId === elementId && operation.inputs.length === 1 && operation.outputs.length === 2),
    `${elementId} must lower to a splitting host`);
  }
  const { initialVariables, results } = await registeredValues();
  const resultOf = (elementId: string): EffectExecutionResult => {
    const result = results.get(elementId);
    assert.ok(result !== undefined && result.kind === EffectExecutionResultKind.Success, elementId);
    return result;
  };
  const elementOf = new Map([["registerClaim", "RegisterClaim"], ["notifyBroker", "NotifyBroker"],
    ["orderAssessment", "OrderAssessment"]]);
  const start: StartProcessStimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId, initialVariables };
  const workflowId = processWorkflowId(instanceId);
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity: "activity-host-split-recovery", downloadDirectory: temporalCacheDirectory,
  }), 40_000, "Activity host split Temporal environment startup");
  const oracle = createBusinessTaskHostOracle(environment, program, start);
  const effectId = (elementId: string): EffectOccurrenceId => ({ processInstanceId: instanceId, elementId, activation: 1 });
  const effectCompleted = (elementId: string) => oracle.advance(completeEffectStimulus(effectId(elementId), resultOf(elementId)));
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
    worker = await startBpmnTestWorker(environment, bundle, "activity-host-split", activities);
    const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
      args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
      taskQueue: bpmnSemanticTaskQueue, workflowId, workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    oracle.advance(start);
    // *Notify broker* opens only when *Register claim* completes, so the two results settle in this order.
    effectCompleted("RegisterClaim");
    effectCompleted("NotifyBroker");
    const complete = async (elementId: string): Promise<void> => {
      const stimulus = { kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}`,
        taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues: [] } as const;
      assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, instanceId, stimulus),
        { kind: "semantic", commandId: stimulus.commandId, outcome: CommandOutcome.Committed });
      oracle.advance(stimulus);
    };
    await published();
    await complete("ArchiveDocuments");
    await published();
    await complete("ReviewClaim");
    effectCompleted("OrderAssessment");
    await published();
    await complete("InformCustomer");
    await published();
    await complete("DecideClaim");

    const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "insurance claim intake terminal result");
    assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
    assert.equal(terminal.receipt.finalState.status, ProcessStatus.Completed);
    await oracle.assertPublications();

    const runs = await workflowChainRuns(environment, workflowId);
    const trace: CanonicalObservation[] = [];
    let carriedSplitEffect = 0;
    let carriedSplitPair = 0;
    for (const run of runs) {
      const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
      const history = await runHandle.fetchHistory();
      trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
      for (const event of historyEvents(history as TemporalHistory, "workflowExecutionContinuedAsNewEventAttributes")) {
        const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
        const state = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, instanceId);
        // ACSP-WAIT-01: the carried effect wait keeps both of the host's outputs.
        if (state.effectWaits.some(wait => wait.id.elementId === "RegisterClaim" && wait.outputs.length === 2)) {
          carriedSplitEffect++;
        }
        if (state.effectWaits.some(({ id }) => id.elementId === "OrderAssessment") &&
          state.userTaskWaits.some(({ id }) => id.elementId === "InformCustomer")) carriedSplitPair++;
      }
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assert.ok(runs.length > 1);
    assert.ok(carriedSplitEffect > 0, "Continue-As-New must carry Register claim's effect wait with both outputs");
    assert.ok(carriedSplitPair > 0, "Continue-As-New must carry both waits Review claim's split opened");
    assert.deepEqual(trace, oracle.trace);
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

/**
 * The scope host refinement witness of the proposal's Temporal preflight, on the employee onboarding model with the
 * registered `onboarding-register-first` values.
 *
 * *Issue equipment*'s body Start splits, so its host opens *Issue badge* and *Issue laptop* in one entry step. A lowered
 * Event History limit makes the Runs roll over, so Continue-As-New carries both waits and the Program with its hosts and
 * exit. The successor completes both, the exit opens *Confirm IT access* beside the terminal branch, and its completion
 * ends the Process. The preserved relation is the preflight's: publications follow the core oracle after every command,
 * every Run replays, and the final state equals the core's.
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

const directory = new URL("../../../../scenarios/scope-host-split/", import.meta.url);
const instanceId = "scope-host-split-recovery";

/** The registered schedule's Start variables and each effect's result, keyed by its handler operation. */
async function registeredValues() {
  const scenario = JSON.parse(await readFile(new URL("onboarding-register-first.scenario.json", directory), "utf8")) as
    { stimuli: Stimulus[] };
  const [start] = scenario.stimuli;
  assert.ok(start?.kind === StimulusKind.StartProcess);
  const results = new Map(scenario.stimuli.flatMap(stimulus =>
    stimulus.kind === StimulusKind.CompleteEffect ? [[stimulus.effectId.elementId, stimulus.result] as const] : []));
  return { initialVariables: start.initialVariables, results };
}

test("both entries of a body Start split survive forced Continue-As-New and every-Run replay", { timeout: 90_000 }, async () => {
  const overlay = await readFile(new URL("employee-onboarding-overlay.json", directory));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL("employee-onboarding.bpmn", directory)), sourceId: "employee-onboarding", expectedSha256: undefined,
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "employee-onboarding-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 },
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
  const program = compiled.semanticProcess;
  assert.ok(program.operations.some(operation => operation.kind === SemanticOperationKind.Scope &&
    operation.origin.elementId === "IssueEquipment"), "Issue equipment must lower to a scope host");
  assert.ok(program.operations.some(operation => operation.kind === SemanticOperationKind.ScopeExit &&
    operation.origin.elementId === "IssueEquipment"), "Issue equipment's completion must lower to a scope exit");
  const { initialVariables, results } = await registeredValues();
  const resultOf = (elementId: string): EffectExecutionResult => {
    const result = results.get(elementId);
    assert.ok(result !== undefined && result.kind === EffectExecutionResultKind.Success, elementId);
    return result;
  };
  const elementOf = new Map([["registerHire", "RegisterHire"]]);
  const start: StartProcessStimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId, initialVariables };
  const workflowId = processWorkflowId(instanceId);
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity: "scope-host-split-recovery", downloadDirectory: temporalCacheDirectory,
  }), 40_000, "scope host split Temporal environment startup");
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
    worker = await startBpmnTestWorker(environment, bundle, "scope-host-split", activities);
    const handle = await environment.client.workflow.start(bpmnProcessWorkflowType, {
      args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: 4, eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
      taskQueue: bpmnSemanticTaskQueue, workflowId, workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    oracle.advance(start);
    oracle.advance(completeEffectStimulus(effectId("RegisterHire"), resultOf("RegisterHire")));
    const complete = async (elementId: string): Promise<void> => {
      const stimulus = { kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}`,
        taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues: [] } as const;
      assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, instanceId, stimulus),
        { kind: "semantic", commandId: stimulus.commandId, outcome: CommandOutcome.Committed });
      oracle.advance(stimulus);
    };
    await published();
    await complete("PrepareWorkstation");
    // Issue badge and Issue laptop are both pending after the body split, once the Runs have rolled over.
    await published();
    await complete("IssueBadge");
    await complete("IssueLaptop");
    await published();
    await complete("ConfirmItAccess");

    const terminal = await withDeadline(readTestProcessTerminalResult(handle), 20_000, "employee onboarding terminal result");
    assert.deepEqual(terminal.receipt.finalState, observeStableState(program, oracle.state));
    assert.equal(terminal.receipt.finalState.status, ProcessStatus.Completed);
    await oracle.assertPublications();

    const runs = await workflowChainRuns(environment, workflowId);
    const trace: CanonicalObservation[] = [];
    let carriedSplitWaits = 0;
    for (const run of runs) {
      const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
      const history = await runHandle.fetchHistory();
      trace.push(...await runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName));
      for (const event of historyEvents(history as TemporalHistory, "workflowExecutionContinuedAsNewEventAttributes")) {
        const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
        const state = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, instanceId);
        const pending = new Set(state.userTaskWaits.map(({ id }) => id.elementId));
        if (pending.has("IssueBadge") && pending.has("IssueLaptop")) carriedSplitWaits++;
      }
      await replayBpmnHistory(bundle, history, workflowId);
    }
    assert.ok(runs.length > 1);
    assert.ok(carriedSplitWaits > 0, "Continue-As-New must carry both waits the body split opened");
    assert.deepEqual(trace, oracle.trace);
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});

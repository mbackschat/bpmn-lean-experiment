import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  CommandOutcome, ScenarioStepKind, StimulusKind, advanceScenario, deployProcess,
  initialState, observeStableState, projectEffectTransportMaterial, projectOpenEffects,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation, EffectExecutionResult, RuntimeState, Stimulus, VariableBinding,
  SemanticFlowNodeOccurrenceAnchor, SemanticProcessProgram, StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  completeEffectStimulus, effectTransportKey, processWorkflowId, submitUserTaskCompletion,
  ExecutionPublicationResultKind, FlowNodeOccurrencePublicationResultKind,
  readPublicationUntilAnswered,
  observeTemporalExecutionPublication, observeTemporalFlowNodeOccurrences,
} from "@bpmn-lean/temporal-testkit";
import type {
  EffectRequest, FlowNodeOccurrenceStart, TemporalExecutionPublicationClient,
  TemporalFlowNodeOccurrencePublicationClient,
} from "@bpmn-lean/temporal-testkit";
import { waitForPublishedWorkflowChainState } from "./workflow-chain-test-support.ts";

/** Core transitions supply expected publications independently of Workflow history and Activity callbacks. */
export function createBusinessTaskHostOracle(
  environment: TestWorkflowEnvironment,
  program: SemanticProcessProgram,
  start: StartProcessStimulus,
) {
  const workflowId = processWorkflowId(start.instanceId);
  let expected: RuntimeState = initialState;
  const expectedTrace: CanonicalObservation[] = [deployProcess(start, program).observation];
  const expectedRequests: EffectRequest[] = [];
  const expectedResults: EffectExecutionResult[] = [];
  const expectedExecution: unknown[] = [];
  const expectedOccurrences: unknown[] = [];
  const openOccurrences: Array<{ anchor: SemanticFlowNodeOccurrenceAnchor; start: FlowNodeOccurrenceStart }> = [];
  let revision = 0;
  let expectedCurrent: unknown;
  function advance(stimulus: Stimulus): void {
    const step = advanceScenario(program, expected, stimulus);
    assert.equal(step.kind, ScenarioStepKind.Committed);
    if (step.kind !== ScenarioStepKind.Committed) assert.fail("Expected committed oracle step");
    expected = step.state;
    expectedTrace.push(...step.observations);
    assert.ok(step.publication !== null && step.flowNodeOccurrenceLifecycles !== null);
    const fromRevision = revision;
    const transitions = step.publication.transitions.map(transition => ({ ...transition, revision: ++revision }));
    const occurrenceTransitions = step.flowNodeOccurrenceLifecycles.map((lifecycle, index) => {
      const currentRevision = fromRevision + index + 1;
      const started = lifecycle.started.map(({ anchor, ...fact }, startIndex) => {
        assert.ok(!openOccurrences.some(entry => isDeepStrictEqual(entry.anchor, anchor)));
        const startFact = { ...fact, id: { processInstanceId: start.instanceId, startRevision: currentRevision, startIndex } };
        openOccurrences.push({ anchor, start: startFact });
        return startFact;
      });
      const ended = lifecycle.ended.map(({ anchor, terminal }) => {
        const position = openOccurrences.findIndex(entry => isDeepStrictEqual(entry.anchor, anchor));
        assert.ok(position >= 0);
        return { id: openOccurrences.splice(position, 1)[0]!.start.id, terminal };
      });
      return { revision: currentRevision, lifecycle: { started, ended } };
    });
    const batch = { commandId: stimulus.commandId, fromRevision, throughRevision: revision };
    expectedExecution.push({ ...batch, transitions });
    expectedOccurrences.push({ ...batch, transitions: occurrenceTransitions });
    expectedCurrent = { ...step.publication.current, revision };
  }

  async function assertPublications(): Promise<void> {
    const identity = { definition: program.identity, processId: program.processId, processInstanceId: start.instanceId };
    const executionBatches: unknown[] = [];
    const occurrenceBatches: unknown[] = [];
    let afterRevision = 0;
    for (let pageIndex = 0; pageIndex <= expectedExecution.length; pageIndex += 1) {
      const [execution, occurrences] = await Promise.all([
        readPublicationUntilAnswered("business-task E1 publication", () => observeTemporalExecutionPublication(
          environment.client.workflow as unknown as TemporalExecutionPublicationClient,
          workflowId, identity, { afterRevision, limit: 2 })),
        readPublicationUntilAnswered("business-task E2 publication", () => observeTemporalFlowNodeOccurrences(
          environment.client.workflow as unknown as TemporalFlowNodeOccurrencePublicationClient,
          workflowId, identity, { afterRevision, limit: 2 })),
      ]);
      assert.equal(execution.kind, ExecutionPublicationResultKind.Available);
      assert.equal(occurrences.kind, FlowNodeOccurrencePublicationResultKind.Available);
      if (execution.kind !== ExecutionPublicationResultKind.Available || occurrences.kind !== FlowNodeOccurrencePublicationResultKind.Available) {
        assert.fail("Both public histories must be available");
      }
      const { batches, current, ...executionPage } = execution.page;
      const { batches: occurrencePageBatches, currentOpen, ...occurrencePage } = occurrences.page;
      assert.deepEqual(executionPage, { ...identity, requestedAfterRevision: afterRevision,
        pageThroughRevision: execution.page.pageThroughRevision, headRevision: revision });
      assert.deepEqual(occurrencePage, executionPage);
      executionBatches.push(...batches);
      occurrenceBatches.push(...occurrencePageBatches.map(({ committedAtEpochMs, ...batch }) => {
        assert.ok(Number.isSafeInteger(committedAtEpochMs) && committedAtEpochMs > 0);
        return batch;
      }));
      if (execution.page.pageThroughRevision === revision) {
        assert.deepEqual(current, expectedCurrent);
        assert.ok(currentOpen !== null);
        assert.deepEqual(currentOpen.map(({ startedAtEpochMs, ...fact }) => {
          assert.ok(Number.isSafeInteger(startedAtEpochMs) && startedAtEpochMs > 0);
          return fact;
        }), openOccurrences.map(({ start: fact }) => fact));
        assert.deepEqual(executionBatches, expectedExecution);
        assert.deepEqual(occurrenceBatches, expectedOccurrences);
        return;
      }
      assert.equal(current, null);
      assert.equal(currentOpen, null);
      assert.ok(execution.page.pageThroughRevision > afterRevision);
      afterRevision = execution.page.pageThroughRevision;
    }
    assert.fail("Publication traversal exceeded the committed command count");
  }

  function completeExpectedEffect(result: EffectExecutionResult): void {
    const effect = projectOpenEffects(expected)[0]!;
    assert.ok(effect !== undefined);
    expectedRequests.push({ ...effect.descriptor, arguments: effect.arguments,
      idempotencyKey: effectTransportKey(projectEffectTransportMaterial(program, effect)) });
    expectedResults.push(result);
    advance(completeEffectStimulus(effect.id, result));
  }

  async function completeHuman(elementId: string, commandId: string, submittedValues: readonly VariableBinding[] = []) {
    const state = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
      state => state.openUserTasks.length === 1 && state.openUserTasks[0]!.id.elementId === elementId);
    assert.deepEqual(state, observeStableState(program, expected));
    await assertPublications();
    const stimulus = { kind: StimulusKind.CompleteUserTaskInstance, commandId,
      taskId: state.openUserTasks[0]!.id, submittedValues } as const;
    assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, stimulus), {
      kind: "semantic", commandId, outcome: CommandOutcome.Committed,
    });
    advance(stimulus);
    return stimulus;
  }

  return {
    get state() { return expected; },
    trace: expectedTrace,
    requests: expectedRequests,
    results: expectedResults,
    advance,
    completeEffect: completeExpectedEffect,
    completeHuman,
    assertPublications,
  };
}

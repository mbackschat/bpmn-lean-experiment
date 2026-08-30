import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  MessageChannelKind,
  ProcessStatus,
  ScenarioOutcomeKind,
  StimulusKind,
  WaitKind,
  isWellFormedSemanticProcessProgram,
  isWellFormedStimulus,
  profileAllowsProgramShape,
  scenarioObservationsForProfile,
  sameSourceOverlayIdentity,
  supportsSemanticProcessScenario,
} from "@bpmn-lean/semantic-core";
import {
  ComparisonKind,
  DifferentialTarget,
  compareTargetResults,
} from "@bpmn-lean/differential";

import {
  messagePayloadCatchLeanCoreCases,
} from "./message-payload-catch-lean-core-cases.ts";
import { mutableClone } from "./pipeline-target-support.ts";
import {
  loadAndCompileCases,
  runCoreTargets,
  runLeanTargets,
} from "./semantic-differential-targets.ts";

test("runs the three Message payload cases through the semantic core", async () => {
  const contexts = await loadAndCompileCases(messagePayloadCatchLeanCoreCases);
  for (const { scenario, semanticProcess } of contexts) {
    assert.equal(
      supportsSemanticProcessScenario(scenario, semanticProcess),
      true,
      JSON.stringify({
        scenarioId: scenario.id,
        programWellFormed: isWellFormedSemanticProcessProgram(semanticProcess),
        profileAllowsProgram: profileAllowsProgramShape(
          semanticProcess.identity.semanticProfile,
          semanticProcess.operations,
          semanticProcess.definitionScopes.length,
        ),
        stimuliWellFormed: scenario.stimuli.map(isWellFormedStimulus),
        semanticProfile: semanticProcess.identity.semanticProfile,
        scenarioProfile: scenario.profile,
        sourceId: semanticProcess.identity.sourceId,
        scenarioSourceId: scenario.bpmn.id,
        sourceSha256: semanticProcess.identity.sourceSha256,
        scenarioSha256: scenario.bpmn.sha256,
        sourceOverlayMatches: sameSourceOverlayIdentity(
          semanticProcess.identity.sourceOverlay,
          scenario.bpmn.sourceOverlay,
        ),
        processId: semanticProcess.processId,
        startProcessId: scenario.stimuli[0]?.kind === StimulusKind.StartProcess
          ? scenario.stimuli[0].processId
          : null,
        observations: scenario.observations,
        expectedObservations: scenarioObservationsForProfile(scenario.profile),
      }),
    );
  }
  const results = runCoreTargets(contexts).results;

  assert.equal(contexts.length, 3);
  for (const context of contexts) {
    const result = results.get(context.scenario.id);
    assert.ok(result !== undefined);
    const mutated = mutableClone(result);
    context.pipelineCase.injectMutation(mutated);
    const comparison = compareTargetResults(
      { target: DifferentialTarget.SemanticCore, result },
      [{ target: DifferentialTarget.SemanticCore, result: mutated }],
    );
    assert.equal(comparison.kind, ComparisonKind.Disagreement);
    if (comparison.kind !== ComparisonKind.Disagreement) {
      throw new Error(
        `${context.pipelineCase.id} mutation did not produce a disagreement`,
      );
    }
    assert.deepEqual(
      comparison.disagreement,
      context.pipelineCase.expectedInjectedDisagreement,
    );
  }

  const absentContext = contexts.find(
    ({ pipelineCase }) =>
      pipelineCase.id === "message-payload-catch-absent-payload",
  );
  assert.ok(absentContext !== undefined);
  const absent = results.get(absentContext.scenario.id);
  assert.ok(absent !== undefined);
  assert.deepEqual(absent.outcome, {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Rejected,
  });
  const finalState = absent.trace[4];
  assert.equal(finalState?.kind, CanonicalObservationKind.State);
  if (finalState?.kind !== CanonicalObservationKind.State) {
    throw new Error("absent payload scenario omitted its final stable state");
  }

  const subscriptionId = {
    processInstanceId: "MessagePayloadCatchAbsentPayload",
    elementId: "MessageCatch_SettlementConfirmed",
    activation: 1,
  } as const;
  const channel = {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "Interface_ClearingHouse",
    interfaceOperationId: "Operation_ConfirmSettlement",
    messageId: "Message_SettlementConfirmed",
  } as const;
  assert.equal(finalState.status, ProcessStatus.Running);
  assert.deepEqual(finalState.activeWaits, [{
    elementId: subscriptionId.elementId,
    kind: WaitKind.Message,
    multiplicity: 1,
  }]);
  assert.deepEqual(finalState.openMessageSubscriptions, [{
    id: subscriptionId,
    channel,
  }]);
  assert.deepEqual(finalState.openUserTasks, []);
  assert.deepEqual(finalState.variables, []);
  assert.deepEqual(finalState.enabledInteractions, [{
    kind: StimulusKind.DeliverPayloadMessage,
    subscriptionId,
    channel,
  }]);
});

test("compares the three Message payload cases between Lean and the semantic core", async () => {
  const contexts = await loadAndCompileCases(messagePayloadCatchLeanCoreCases);
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "bpmn-message-payload-lean-core-"),
  );
  try {
    const [lean, core] = await Promise.all([
      runLeanTargets(
        contexts,
        path.join(temporaryDirectory, "definitions.jsonl"),
      ),
      Promise.resolve(runCoreTargets(contexts)),
    ]);
    for (const { scenario } of contexts) {
      const leanResult = lean.results.get(scenario.id);
      const coreResult = core.results.get(scenario.id);
      assert.ok(leanResult !== undefined);
      assert.ok(coreResult !== undefined);
      const comparison = compareTargetResults(
        { target: DifferentialTarget.Lean, result: leanResult },
        [{ target: DifferentialTarget.SemanticCore, result: coreResult }],
      );
      assert.equal(comparison.kind, ComparisonKind.Agreement);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

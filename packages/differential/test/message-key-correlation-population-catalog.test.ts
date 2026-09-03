import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EnginePopulationPublicationOutcomeKind,
  ProcessStatus,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";

import {
  loadMessageKeyCorrelationPopulationCases,
  messageKeyCorrelationPopulationCases,
  runMessageKeyCorrelationPopulationCore,
} from "./message-key-correlation-population-cases.ts";

test("keeps the four population cases separate from the ordinary scenario catalog", () => {
  assert.deepEqual(
    messageKeyCorrelationPopulationCases.map((populationCase) => ({
      id: populationCase.id,
      scenarioRelativePath: populationCase.scenarioRelativePath,
      expectedOutcome: populationCase.expectedOutcome,
    })),
    [{
      id: "message-key-correlation-ambiguous",
      scenarioRelativePath:
        "scenarios/message-key-correlation/ambiguous.population-scenario.json",
      expectedOutcome:
        EnginePopulationPublicationOutcomeKind.RejectedAmbiguous,
    }, {
      id: "message-key-correlation-cross-definition",
      scenarioRelativePath:
        "scenarios/message-key-correlation/cross-definition.population-scenario.json",
      expectedOutcome: EnginePopulationPublicationOutcomeKind.Committed,
    }, {
      id: "message-key-correlation-unique",
      scenarioRelativePath:
        "scenarios/message-key-correlation/unique.population-scenario.json",
      expectedOutcome: EnginePopulationPublicationOutcomeKind.Committed,
    }, {
      id: "message-key-correlation-zero",
      scenarioRelativePath:
        "scenarios/message-key-correlation/zero.population-scenario.json",
      expectedOutcome:
        EnginePopulationPublicationOutcomeKind.RejectedNoMatch,
    }],
  );
});

test("runs every answer-free population input through compiled semantic programs", async () => {
  const contexts = await loadMessageKeyCorrelationPopulationCases();
  const results = runMessageKeyCorrelationPopulationCore(contexts);

  assert.equal(results.size, 4);
  for (const context of contexts) {
    const result = results.get(context.scenario.id);
    assert.ok(result !== undefined);
    assert.equal(result.scenarioId, context.scenario.id);
    assert.equal(
      result.publicationResults[0]?.outcome.kind,
      context.populationCase.expectedOutcome,
    );
    assert.deepEqual(result.ingressOrdinals, [{
      commandId: context.scenario.publications[0].commandId,
      ingressOrdinal: 1,
    }]);
    assert.deepEqual(
      result.processStates.map(({ instanceId }) => instanceId),
      result.processStates.map(({ instanceId }) => instanceId)
        .toSorted(compareCanonicalStrings),
    );
  }
});

test("unique and cross-definition schedules advance one target while zero and ambiguity preserve both", async () => {
  const contexts = await loadMessageKeyCorrelationPopulationCases();
  const results = runMessageKeyCorrelationPopulationCore(contexts);

  for (const context of contexts) {
    const result = results.get(context.scenario.id);
    assert.ok(result !== undefined);
    const advanced = result.processStates.filter(
      ({ openUserTasks }) => openUserTasks.length === 1,
    );
    const waiting = result.processStates.filter(
      ({ openMessageSubscriptions }) => openMessageSubscriptions.length === 1,
    );
    assert.equal(
      result.processStates.every(({ status }) => status === ProcessStatus.Running),
      true,
    );
    switch (context.populationCase.expectedOutcome) {
      case EnginePopulationPublicationOutcomeKind.Committed:
        assert.equal(advanced.length, 1);
        assert.equal(waiting.length, 1);
        break;
      case EnginePopulationPublicationOutcomeKind.RejectedNoMatch:
      case EnginePopulationPublicationOutcomeKind.RejectedAmbiguous:
        assert.equal(advanced.length, 0);
        assert.equal(waiting.length, 2);
        break;
    }
  }

  const crossDefinition = results.get(
    "message-key-correlation-cross-definition",
  );
  assert.ok(crossDefinition !== undefined);
  assert.equal(
    crossDefinition.processStates.find(({ instanceId }) =>
      instanceId === "CorrelationCrossDefinitionB"
    )?.openMessageSubscriptions.length,
    1,
  );
});

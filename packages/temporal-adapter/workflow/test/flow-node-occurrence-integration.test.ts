import assert from "node:assert/strict";
import test from "node:test";

import {
  ScenarioStepKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";

import {
  accumulateExecutionPublication,
  createExecutionPublicationState,
} from "../dist/execution-publication-state.js";
import {
  commandOutcome,
  createCommandPublicationState,
  integrateCommandPublication,
  recordCommandPublicationOutcome,
} from "../dist/command-publication-integration.js";
import {
  publicationCompletion,
  publicationProcessInstanceId,
  publicationProgram,
  publicationStart,
} from "./execution-publication-fixture.ts";

function integrateAndRecord(
  state: ReturnType<typeof createCommandPublicationState>,
  stimulus: Parameters<typeof integrateCommandPublication>[2],
  step: Parameters<typeof integrateCommandPublication>[3],
  clock: () => number,
) {
  const candidate = integrateCommandPublication(
    publicationProgram,
    state,
    stimulus,
    step,
    clock,
  );
  return recordCommandPublicationOutcome(
    candidate,
    stimulus,
    step.observations,
  );
}

test("samples once per committed command, not per transition or after result recording", () => {
  const start = advanceScenario(
    publicationProgram,
    initialState,
    publicationStart,
  );
  assert.ok(start.kind === ScenarioStepKind.Committed);
  assert.ok((start.publication?.transitions.length ?? 0) > 2);
  let integrated = createCommandPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  let samples = 0;
  integrated = integrateAndRecord(
    integrated,
    publicationStart,
    start,
    () => {
      samples += 1;
      assert.equal(commandOutcome(integrated, publicationStart.commandId), undefined);
      assert.equal(integrated.execution.headRevision, 0);
      return 4_000;
    },
  );
  assert.equal(samples, 1);
  assert.equal(commandOutcome(integrated, publicationStart.commandId), "committed");
  assert.equal(
    integrated.flowNodeOccurrences.batches[0]?.committedAtEpochMs,
    4_000,
  );

  const completion = publicationCompletion("UserTask_A");
  const completed = advanceScenario(
    publicationProgram,
    start.state,
    completion,
  );
  assert.ok(completed.kind === ScenarioStepKind.Committed);
  integrated = integrateAndRecord(
    integrated,
    completion,
    completed,
    () => {
      samples += 1;
      assert.equal(commandOutcome(integrated, completion.commandId), undefined);
      return 4_000;
    },
  );
  assert.equal(samples, 2);
  assert.deepEqual(
    integrated.flowNodeOccurrences.batches.map(
      ({ committedAtEpochMs }) => committedAtEpochMs,
    ),
    [4_000, 4_000],
  );
});

test("preserves exact E1 JSON while adding the aligned occurrence successor", () => {
  const step = advanceScenario(
    publicationProgram,
    initialState,
    publicationStart,
  );
  assert.ok(step.kind === ScenarioStepKind.Committed);
  const standalone = accumulateExecutionPublication(
    publicationProgram,
    createExecutionPublicationState(
      publicationProgram,
      publicationProcessInstanceId,
    ),
    publicationStart,
    step,
  );
  const combined = integrateCommandPublication(
    publicationProgram,
    createCommandPublicationState(
      publicationProgram,
      publicationProcessInstanceId,
    ),
    publicationStart,
    step,
    () => 4_000,
  );
  assert.equal(
    JSON.stringify(combined.execution),
    JSON.stringify(standalone),
  );
});

test("does not sample or append for a rejection or duplicate recovery", () => {
  const start = advanceScenario(
    publicationProgram,
    initialState,
    publicationStart,
  );
  assert.ok(start.kind === ScenarioStepKind.Committed);
  const started = integrateAndRecord(
    createCommandPublicationState(
      publicationProgram,
      publicationProcessInstanceId,
    ),
    publicationStart,
    start,
    () => 3_000,
  );
  const rejectedStimulus = publicationCompletion("UserTask_A", 99);
  const rejected = advanceScenario(
    publicationProgram,
    start.state,
    rejectedStimulus,
  );
  assert.ok(rejected.kind === ScenarioStepKind.Terminal);
  let samples = 0;
  const publicationCandidate = integrateCommandPublication(
    publicationProgram,
    started,
    rejectedStimulus,
    rejected,
    () => {
      samples += 1;
      return 4_000;
    },
  );
  const recorded = recordCommandPublicationOutcome(
    publicationCandidate,
    rejectedStimulus,
    rejected.observations,
  );
  assert.equal(samples, 0);
  assert.equal(recorded.execution, started.execution);
  assert.equal(recorded.flowNodeOccurrences, started.flowNodeOccurrences);
  assert.equal(commandOutcome(recorded, rejectedStimulus.commandId), "rejected");

  const recovered = integrateCommandPublication(
    publicationProgram,
    recorded,
    rejectedStimulus,
    rejected,
    () => {
      samples += 1;
      return 5_000;
    },
  );
  assert.equal(recovered, recorded);
  assert.equal(samples, 0);
});

test("samples no time and exposes neither successor for malformed occurrence publication", () => {
  const step = advanceScenario(
    publicationProgram,
    initialState,
    publicationStart,
  );
  assert.ok(step.kind === ScenarioStepKind.Committed);
  for (const corrupt of [
    (corrupted: typeof step) => {
      assert.ok(corrupted.flowNodeOccurrenceLifecycles !== null);
      const lifecycle = corrupted.flowNodeOccurrenceLifecycles.find(
        ({ started }) => started.length > 0,
      );
      assert.ok(lifecycle?.started[0] !== undefined);
      lifecycle.started.push(structuredClone(lifecycle.started[0]));
    },
    (corrupted: typeof step) => {
      assert.ok(corrupted.flowNodeOccurrenceLifecycles !== null);
      const lifecycle = corrupted.flowNodeOccurrenceLifecycles.find(
        ({ ended }) => ended.length > 0,
      );
      assert.ok(lifecycle?.ended[0] !== undefined);
      Object.assign(lifecycle.ended[0], {
        anchor: {
          kind: SemanticFlowNodeOccurrenceAnchorKind.Wait,
          id: {
            processInstanceId: publicationProcessInstanceId,
            elementId: "Unknown_Flow_Node",
            activation: 1,
          },
        },
      });
    },
  ]) {
    const corrupted = structuredClone(step);
    corrupt(corrupted);
    const before = createCommandPublicationState(
      publicationProgram,
      publicationProcessInstanceId,
    );
    const exactBefore = structuredClone(before);
    let samples = 0;
    assert.throws(
      () => integrateCommandPublication(
        publicationProgram,
        before,
        publicationStart,
        corrupted,
        () => {
          samples += 1;
          return 4_000;
        },
      ),
      /not canonical|reused an open anchor|unknown anchor/u,
    );
    assert.equal(samples, 0);
    assert.deepEqual(before, exactBefore);
  }
});

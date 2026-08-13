/** Live report, Worker replacement, retry, completion, and post-retry failure evidence. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  StimulusKind,
  projectEffectTransportMaterial,
  runScenario,
} from "@bpmn-lean/semantic-core";
import {
  EffectExecutionSchedule,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
  durableUpdateOutcomes,
  effectTransportKey,
  requireDurableIncidentActivityHistory,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalScenarioRunner } from "@bpmn-lean/temporal-testkit";

import {
  compileExecutionInput,
  loadJson,
  withDeadline,
} from "./temporal-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/service-task-incident/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/service-task-effect/process.bpmn",
  import.meta.url,
);

export function registerServiceTaskIncidentTemporalTests(
  getRunner: () => TemporalScenarioRunner,
): void {
  test("incident report survives Worker replacement and retry completes the same effect", async () => {
    const input = await incidentInput();
    const expected = runScenario(input.scenario, input.semanticProcess);
    const execution = await withDeadline(
      getRunner().runScenario(input.scenario, input.semanticProcess, {
        workflowId: "service-task-incident-success",
        completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule: TemporalExecutionSchedule.Normal,
        effectExecutionSchedule:
          EffectExecutionSchedule.IncidentReportRetrySuccess,
      }),
      20_000,
      "Service Task incident success execution",
    );

    assert.deepEqual(execution.waitTrace, expected.trace.slice(0, 5));
    assert.deepEqual(execution.result, expected);
    assert.deepEqual(execution.effectProbeEvidence, {
      invocations: 2,
      mutations: 1,
      keys: [effectRequest(input).idempotencyKey],
    });
    assert.deepEqual(durableUpdateOutcomes(execution.history), new Map([
      [retry(input).commandId, "committed"],
    ]));
    requireDurableIncidentActivityHistory(
      execution.history,
      effectRequest(input),
      [{ kind: "technicalFailure" }, completion(input).result],
    );
    await withDeadline(
      getRunner().replayHistory(
        execution.history,
        "service-task-incident-success-replay",
      ),
      10_000,
      "Service Task incident success replay",
    );
  });

  test("technical failure after retry leaves the restored effect and creates no second incident", async () => {
    const input = await incidentInput();
    const expected = runScenario(
      { ...input.scenario, stimuli: input.scenario.stimuli.slice(0, 3) },
      input.semanticProcess,
    );
    const execution = await withDeadline(
      getRunner().probes.runIncidentRetryFailure(
        input.scenario,
        input.semanticProcess,
        "service-task-incident-retry-failure",
      ),
      20_000,
      "Service Task incident post-retry failure",
    );

    assert.equal(
      execution.failureType,
      "BPMN_EFFECT_INCIDENT_RETRY_EXHAUSTED",
    );
    assert.deepEqual(execution.lastCommittedTrace, expected.trace);
    const finalState = execution.lastCommittedTrace.at(-1);
    assert.equal(finalState?.kind, CanonicalObservationKind.State);
    if (finalState?.kind !== CanonicalObservationKind.State) {
      throw new TypeError("Post-retry failure has no final committed state");
    }
    assert.equal(finalState.openIncidents.length, 0);
    const expectedFinalState = expected.trace.at(-1);
    if (expectedFinalState?.kind !== CanonicalObservationKind.State) {
      throw new TypeError("Core post-retry prefix has no committed state");
    }
    assert.deepEqual(
      finalState.openEffects,
      expectedFinalState.openEffects,
    );
    assert.deepEqual(execution.effectProbeEvidence, {
      invocations: 2,
      mutations: 1,
      keys: [effectRequest(input).idempotencyKey],
    });
    requireDurableIncidentActivityHistory(
      execution.history,
      effectRequest(input),
      [{ kind: "technicalFailure" }, { kind: "technicalFailure" }],
    );
    await withDeadline(
      getRunner().replayHistory(
        execution.history,
        "service-task-incident-retry-failure-replay",
      ),
      10_000,
      "Service Task incident failure replay",
    );
  });

  test("two distinct incident retries commit once and reject once", async () => {
    const input = await incidentInput();
    const execution = await withDeadline(
      getRunner().runIncidentRetryRace(
        input.scenario,
        input.semanticProcess,
        "service-task-incident-retry-race",
      ),
      20_000,
      "Service Task incident retry race",
    );

    assert.deepEqual([...execution.outcomes].sort(), ["committed", "rejected"]);
    assert.equal(execution.receipt.finalState.openIncidents.length, 0);
    assert.equal(execution.receipt.finalState.openEffects.length, 0);
    assert.equal(
      execution.trace.filter(
        (observation) =>
          observation.kind === CanonicalObservationKind.Command &&
          observation.commandId.startsWith("retry-service-task-effect-incident"),
      ).length,
      2,
    );
    await withDeadline(
      getRunner().replayHistory(
        execution.history,
        "service-task-incident-retry-race-replay",
      ),
      10_000,
      "Service Task incident race replay",
    );
  });
}

async function incidentInput() {
  return compileExecutionInput(
    await loadJson<import("@bpmn-lean/semantic-core").Scenario>(scenarioUrl),
    bpmnUrl,
  );
}

function retry(input: Awaited<ReturnType<typeof incidentInput>>) {
  const stimulus = input.scenario.stimuli[2];
  if (stimulus?.kind !== StimulusKind.RetryIncident) {
    throw new TypeError("Incident scenario has no retry stimulus");
  }
  return stimulus;
}

function completion(input: Awaited<ReturnType<typeof incidentInput>>) {
  const stimulus = input.scenario.stimuli[3];
  if (stimulus?.kind !== StimulusKind.CompleteEffect) {
    throw new TypeError("Incident scenario has no completion stimulus");
  }
  return stimulus;
}

function effectRequest(input: Awaited<ReturnType<typeof incidentInput>>) {
  const waiting = runScenario(
    { ...input.scenario, stimuli: input.scenario.stimuli.slice(0, 1) },
    input.semanticProcess,
  );
  const state = waiting.trace.at(-1);
  if (state?.kind !== CanonicalObservationKind.State) {
    throw new TypeError("Incident scenario has no open effect state");
  }
  const effect = state.openEffects[0];
  if (effect === undefined) {
    throw new TypeError("Incident scenario has no open effect");
  }
  const material = projectEffectTransportMaterial(input.semanticProcess, effect);
  return {
    ...material.descriptor,
    idempotencyKey: effectTransportKey(material),
    arguments: material.arguments,
  };
}

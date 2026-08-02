import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
} from "@bpmn-lean/semantic-core";
import {
  ComparisonKind,
  DifferentialTarget,
  compareTargetResults,
} from "@bpmn-lean/differential";

import {
  artifactCases,
  normativeArtifactCases,
} from "../../../scripts/contract-artifact-cases.ts";
import {
  verifyPipelineRegistration,
} from "../../../scripts/capsule-roundtrip.ts";
import {
  eventBasedGatewayPipelineCases,
} from "./event-based-gateway-pipeline-cases.ts";
import {
  callActivityPipelineCases,
} from "./call-activity-pipeline-cases.ts";
import {
  pipelineCases,
} from "./pipeline-cases.ts";
import {
  mutableClone,
} from "./pipeline-target-support.ts";
import {
  loadAndCompileCases,
  runCoreTargets,
} from "./pipeline-targets.ts";
import {
  TemporalCaseRelation,
} from "./pipeline-types.ts";

test("registers every Event race artifact once with exact Temporal refinement", () => {
  assert.doesNotThrow(() =>
    verifyPipelineRegistration(
      artifactCases,
      normativeArtifactCases,
      pipelineCases,
    )
  );
  assert.deepEqual(
    eventBasedGatewayPipelineCases.map((pipelineCase) => ({
      id: pipelineCase.id,
      cib: pipelineCase.cib,
      temporalRelation: pipelineCase.temporalRelation,
    })),
    [
      {
        id: "event-based-gateway-message-wins",
        cib: null,
        temporalRelation: TemporalCaseRelation.ExactSemantic,
      },
      {
        id: "event-based-gateway-timer-wins",
        cib: null,
        temporalRelation: TemporalCaseRelation.ExactSemantic,
      },
    ],
  );
});

test("registers the bounded Call Activity artifact once with exact Temporal refinement", () => {
  assert.doesNotThrow(() =>
    verifyPipelineRegistration(
      artifactCases,
      normativeArtifactCases,
      pipelineCases,
    )
  );
  assert.deepEqual(
    callActivityPipelineCases.map((pipelineCase) => ({
      id: pipelineCase.id,
      cib: pipelineCase.cib,
      temporalRelation: pipelineCase.temporalRelation,
    })),
    [
      {
        id: "called-process-call-activity",
        cib: null,
        temporalRelation: TemporalCaseRelation.ExactSemantic,
      },
    ],
  );
});

test("rejects an omitted or identity-unprotected Call Activity catalog entry", () => {
  const [callCase] = callActivityPipelineCases;
  assert.ok(callCase !== undefined);
  assert.throws(
    () =>
      verifyPipelineRegistration(
        artifactCases,
        normativeArtifactCases,
        pipelineCases.filter(({ id }) => id !== callCase.id),
      ),
    /registered scenario missing from pipeline.*called-process-call-activity/u,
  );
  assert.throws(
    () =>
      verifyPipelineRegistration(
        artifactCases,
        normativeArtifactCases,
        pipelineCases.map((pipelineCase) =>
          pipelineCase === callCase
            ? { ...pipelineCase, injectMutation: undefined }
            : pipelineCase
        ),
      ),
    /pipeline case has no seeded mutation.*called-process-call-activity/u,
  );
});

test("rejects an omitted, duplicated, or unprotected Event race catalog entry", () => {
  const [messageCase] = eventBasedGatewayPipelineCases;
  assert.ok(messageCase !== undefined);
  assert.throws(
    () =>
      verifyPipelineRegistration(
        artifactCases,
        normativeArtifactCases,
        pipelineCases.filter(({ id }) => id !== messageCase.id),
      ),
    /registered scenario missing from pipeline.*message-wins/u,
  );
  assert.throws(
    () =>
      verifyPipelineRegistration(
        artifactCases,
        normativeArtifactCases,
        [...pipelineCases, { ...messageCase, id: `${messageCase.id}-duplicate` }],
      ),
    /pipeline scenarios contains duplicates.*message-wins/u,
  );
  assert.throws(
    () =>
      verifyPipelineRegistration(
        artifactCases,
        normativeArtifactCases,
        pipelineCases.map((pipelineCase) =>
          pipelineCase === messageCase
            ? { ...pipelineCase, injectMutation: undefined }
            : pipelineCase
        ),
      ),
    /pipeline case has no seeded mutation.*message-wins/u,
  );
});

test("distinguishes a retained Timer loser and a wrong Timer-wins continuation", async () => {
  const contexts = await loadAndCompileCases(eventBasedGatewayPipelineCases);
  const results = runCoreTargets(contexts).results;
  for (const { pipelineCase, scenario } of contexts) {
    const result = results.get(scenario.id);
    assert.ok(result !== undefined);
    const armed = result.trace[2];
    const selected = result.trace[4];
    assert.equal(armed?.kind, CanonicalObservationKind.State);
    assert.equal(selected?.kind, CanonicalObservationKind.State);
    if (
      armed?.kind !== CanonicalObservationKind.State ||
      selected?.kind !== CanonicalObservationKind.State
    ) {
      throw new Error("Event race scenarios omitted their stable states");
    }
    assert.deepEqual(
      armed.activeWaits.map(({ kind }) => kind),
      ["message", "timer"],
    );
    assert.equal(armed.openMessageSubscriptions.length, 1);
    assert.equal(armed.openTimers.length, 1);
    assert.deepEqual(selected.openTimers, []);
    assert.deepEqual(selected.openMessageSubscriptions, []);
    assert.deepEqual(
      selected.openUserTasks.map(({ id }) => id.elementId),
      [
        pipelineCase.id === "event-based-gateway-message-wins"
          ? "MessageTask"
          : "TimerTask",
      ],
    );
    assert.equal(
      selected.logicalTimeMs,
      pipelineCase.id === "event-based-gateway-message-wins" ? 0 : 1000,
    );

    const mutated = mutableClone(result);
    pipelineCase.injectMutation(mutated);
    const comparison = compareTargetResults(
      { target: DifferentialTarget.SemanticCore, result },
      [{ target: DifferentialTarget.SemanticCore, result: mutated }],
    );
    assert.equal(comparison.kind, ComparisonKind.Disagreement);
    if (comparison.kind !== ComparisonKind.Disagreement) {
      throw new Error("Event race mutation did not create a disagreement");
    }
    assert.deepEqual(
      comparison.disagreement,
      pipelineCase.expectedInjectedDisagreement,
    );
  }
});

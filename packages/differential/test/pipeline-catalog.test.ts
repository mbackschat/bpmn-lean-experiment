import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import {
  ComparisonKind,
  DifferentialTarget,
  ScenarioBindingIssueKind,
  ScenarioBindingKind,
  compareTargetResults,
  verifyScenarioBinding,
} from "@bpmn-lean/differential";

import {
  artifactCases,
  normativeArtifactCases,
} from "../../../scripts/contract-artifact-cases.ts";
import {
  verifyPipelineRegistration,
} from "../../../scripts/capsule-roundtrip.ts";
import {
  defaultWarmBudgetMs,
  warmBudgetPerCaseMs,
} from "../../../scripts/pipeline-budget.ts";
import {
  eventBasedGatewayPipelineCases,
} from "./event-based-gateway-pipeline-cases.ts";
import {
  callActivityPipelineCases,
} from "./call-activity-pipeline-cases.ts";
import {
  messageStartPipelineCases,
} from "./message-start-pipeline-cases.ts";
import {
  timerStartPipelineCases,
} from "./timer-start-pipeline-cases.ts";
import {
  terminateEndPipelineCases,
} from "./terminate-end-pipeline-cases.ts";
import {
  configuredTaskPipelineCases,
} from "./configured-task-pipeline-cases.ts";
import {
  booleanProcessDataPipelineCases,
} from "./boolean-process-data-pipeline-cases.ts";
import {
  userTaskMetadataMutations,
  userTaskMetadataPipelineCases,
} from "./user-task-metadata-pipeline-cases.ts";
import {
  pipelineCases,
} from "./pipeline-cases.ts";
import { pipelineCaseIdRegistry } from "./pipeline-case-id-registry.ts";
import {
  mutableClone,
  projectRoot,
  readJson,
} from "./pipeline-target-support.ts";
import {
  loadAndCompileCases,
  runCoreTargets,
} from "./pipeline-targets.ts";
import {
  CibCaseRelation,
  CibEffectExecutionSchedule,
  PipelineReplaySelection,
  TemporalCaseRelation,
} from "./pipeline-types.ts";
import type { PipelineCase } from "./pipeline-types.ts";

const unregisteredPipelineCaseId = "unregistered-pipeline-case";
// @ts-expect-error The registry must reject a case before the expensive pipeline can start.
const rejectedPipelineCaseId: PipelineCase["id"] = unregisteredPipelineCaseId;

test("binds the complete ordered pipeline inventory before target execution", () => {
  assert.deepEqual(
    pipelineCases.map(({ id }) => id),
    pipelineCaseIdRegistry,
  );
  assert.equal(
    pipelineCaseIdRegistry.includes(unregisteredPipelineCaseId as never),
    false,
  );
  assert.equal(rejectedPipelineCaseId, unregisteredPipelineCaseId);
});

// Every target batch is keyed by scenario identity and every projection looks a result up by it, so
// a case identity that names something else addresses a key space no producer builds.
test("names every pipeline case after the scenario it runs", async () => {
  const mismatched = (await Promise.all(
    pipelineCases.map(async ({ id, scenarioRelativePath }) => {
      const scenario = await readJson<Scenario>(
        path.join(projectRoot, scenarioRelativePath),
      );
      return { id, scenarioId: scenario.id };
    }),
  )).filter(({ id, scenarioId }) => id !== scenarioId);

  assert.deepEqual(mismatched, []);
});

test("every registered wait prefix ends at a canonical state", async () => {
  const contexts = await loadAndCompileCases(pipelineCases);
  const results = runCoreTargets(contexts).results;

  for (const context of contexts) {
    const result = results.get(context.scenario.id);
    assert.ok(result !== undefined);
    assert.equal(
      result.trace[context.pipelineCase.expectedWaitTraceLength - 1]?.kind,
      CanonicalObservationKind.State,
      `${context.pipelineCase.id} expectedWaitTraceLength must include its stable wait state`,
    );
  }
});

const timerStartScenarioRelativePath =
  "scenarios/timer-start-event/scenario.json";
const configuredTaskScenarioRelativePath =
  "scenarios/configured-task/scenario.json";
const booleanScenarioRelativePath =
  "scenarios/user-task-boolean-completion/scenario.json";
const metadataScenarioRelativePath =
  "scenarios/user-task-assignment-form-metadata/scenario.json";
const incidentCancellationScenarioRelativePath =
  "scenarios/service-task-incident-cancellation/scenario.json";

test("registers the incident cancellation scenario in the pipeline catalog", () => {
  assert.equal(
    pipelineCases.some(
      ({ scenarioRelativePath }) =>
        scenarioRelativePath === incidentCancellationScenarioRelativePath,
    ),
    true,
  );
});

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

test("registers the operation-addressed Message Start artifact once with exact Temporal refinement", () => {
  assert.doesNotThrow(() =>
    verifyPipelineRegistration(
      artifactCases,
      normativeArtifactCases,
      pipelineCases,
    )
  );
  assert.deepEqual(
    messageStartPipelineCases.map((pipelineCase) => ({
      id: pipelineCase.id,
      cib: pipelineCase.cib,
      temporalRelation: pipelineCase.temporalRelation,
    })),
    [
      {
        id: "message-start-event",
        cib: null,
        temporalRelation: TemporalCaseRelation.ExactSemantic,
      },
    ],
  );
});

test("registers Timer Start atomically as one standards-only exact-semantic case", () => {
  assert.deepEqual(
    normativeArtifactCases.filter(
      ({ scenarioRelativePath }) =>
        scenarioRelativePath === timerStartScenarioRelativePath,
    ),
    [{ scenarioRelativePath: timerStartScenarioRelativePath }],
  );
  assert.deepEqual(
    pipelineCases.filter(
      ({ scenarioRelativePath }) =>
        scenarioRelativePath === timerStartScenarioRelativePath,
    ).map(({ id, cib, temporalRelation }) => ({
      id,
      cib,
      temporalRelation,
    })),
    [{
      id: "timer-start-event",
      cib: null,
      temporalRelation: TemporalCaseRelation.ExactSemantic,
    }],
  );
});

test("registers Terminate End atomically as three standards-only exact-semantic cases", () => {
  assert.deepEqual(
    terminateEndPipelineCases.map(
      ({ id, cib, temporalRelation }) => ({ id, cib, temporalRelation }),
    ),
    [
      {
        id: "terminate-end-event-trigger-first",
        cib: null,
        temporalRelation: TemporalCaseRelation.ExactSemantic,
      },
      {
        id: "terminate-end-event-sibling-first",
        cib: null,
        temporalRelation: TemporalCaseRelation.ExactSemantic,
      },
      {
        id: "terminate-end-event-stale-sibling-after-termination",
        cib: null,
        temporalRelation: TemporalCaseRelation.ExactSemantic,
      },
    ],
  );
});

test("registers configured Task atomically as one standards-only exact-semantic case", () => {
  assert.deepEqual(
    normativeArtifactCases.filter(
      ({ scenarioRelativePath }) =>
        scenarioRelativePath === configuredTaskScenarioRelativePath,
    ),
    [{ scenarioRelativePath: configuredTaskScenarioRelativePath }],
  );
  assert.deepEqual(
    pipelineCases.filter(
      ({ scenarioRelativePath }) =>
        scenarioRelativePath === configuredTaskScenarioRelativePath,
    ).map(({ id, cib, temporalRelation }) => ({
      id,
      cib,
      temporalRelation,
    })),
    [{
      id: "configured-task",
      cib: null,
      temporalRelation: TemporalCaseRelation.ExactSemantic,
    }],
  );
});

test("appends Boolean completion as one four-target exact-semantic case", () => {
  const [booleanCase] = booleanProcessDataPipelineCases;
  assert.ok(booleanCase !== undefined);
  assert.deepEqual(artifactCases.find(
    ({ scenarioRelativePath }) =>
      scenarioRelativePath === booleanScenarioRelativePath,
  ), {
    scenarioRelativePath: booleanScenarioRelativePath,
    evidenceRelativePath:
      "scenarios/user-task-boolean-completion/cibseven-evidence.json",
  });
  assert.equal(pipelineCases.includes(booleanCase), true);
  assert.deepEqual(
    {
      id: booleanCase.id,
      scenarioRelativePath: booleanCase.scenarioRelativePath,
      cib: booleanCase.cib,
      temporalRelation: booleanCase.temporalRelation,
      replaySelection: booleanCase.replaySelection,
    },
    {
      id: "user-task-boolean-completion",
      scenarioRelativePath: booleanScenarioRelativePath,
      cib: {
        evidenceRelativePath:
          "scenarios/user-task-boolean-completion/cibseven-evidence.json",
        version: "2.2.0",
        relation: CibCaseRelation.ExactSemantic,
        effectExecutionSchedule: CibEffectExecutionSchedule.None,
      },
      temporalRelation: TemporalCaseRelation.ExactSemantic,
      replaySelection: PipelineReplaySelection.PrimaryAndIsolation,
    },
  );
});

test("appends User Task metadata as one four-target exact-semantic case", () => {
  const [metadataCase] = userTaskMetadataPipelineCases;
  assert.ok(metadataCase !== undefined);
  assert.deepEqual(artifactCases.find(
    ({ scenarioRelativePath }) =>
      scenarioRelativePath === metadataScenarioRelativePath,
  ), {
    scenarioRelativePath: metadataScenarioRelativePath,
    evidenceRelativePath:
      "scenarios/user-task-assignment-form-metadata/cibseven-evidence.json",
  });
  assert.equal(pipelineCases.includes(metadataCase), true);
  assert.deepEqual(
    {
      id: metadataCase.id,
      scenarioRelativePath: metadataCase.scenarioRelativePath,
      cib: metadataCase.cib,
      temporalRelation: metadataCase.temporalRelation,
      replaySelection: metadataCase.replaySelection,
    },
    {
      id: "user-task-assignment-form-metadata",
      scenarioRelativePath: metadataScenarioRelativePath,
      cib: {
        evidenceRelativePath:
          "scenarios/user-task-assignment-form-metadata/cibseven-evidence.json",
        version: "2.2.0",
        relation: CibCaseRelation.ExactSemantic,
        effectExecutionSchedule: CibEffectExecutionSchedule.None,
      },
      temporalRelation: TemporalCaseRelation.ExactSemantic,
      replaySelection: PipelineReplaySelection.PrimaryAndIsolation,
    },
  );
});

test("seeds candidate, form-key, and Boolean-to-string metadata disagreements", () => {
  assert.deepEqual(
    userTaskMetadataMutations.map(({ id, expectedDisagreement }) => ({
      id,
      path: expectedDisagreement.path,
      expected: expectedDisagreement.expected,
      actual: expectedDisagreement.actual,
    })),
    [
      {
        id: "candidate-group",
        path: "trace[2].openUserTasks[0].metadata.assignment.candidates[0].id",
        expected: "reviewers",
        actual: "approvers",
      },
      {
        id: "form-key",
        path: "trace[2].openUserTasks[0].metadata.form.fields[0].key",
        expected: "approved",
        actual: "decision",
      },
      {
        id: "field-type",
        path: "trace[2].openUserTasks[0].metadata.form.fields[0].type",
        expected: "boolean",
        actual: "string",
      },
    ],
  );
});

test("makes every User Task metadata mutation reach its exact open-task locus", async () => {
  const [context] = await loadAndCompileCases(userTaskMetadataPipelineCases);
  assert.ok(context !== undefined);
  const result = runCoreTargets([context]).results.get(context.scenario.id);
  assert.ok(result !== undefined);
  for (const mutation of userTaskMetadataMutations) {
    const mutated = mutableClone(result);
    mutation.injectMutation(mutated);
    const comparison = compareTargetResults(
      { target: DifferentialTarget.SemanticCore, result },
      [{ target: DifferentialTarget.SemanticCore, result: mutated }],
    );
    assert.equal(comparison.kind, ComparisonKind.Disagreement, mutation.id);
    if (comparison.kind !== ComparisonKind.Disagreement) {
      throw new Error(`${mutation.id} did not create a disagreement`);
    }
    assert.deepEqual(
      comparison.disagreement,
      mutation.expectedDisagreement,
      mutation.id,
    );
  }
});

test("makes Boolean-to-string conversion reach the exact value-kind disagreement", async () => {
  const [context] = await loadAndCompileCases(booleanProcessDataPipelineCases);
  assert.ok(context !== undefined);
  const result = runCoreTargets([context]).results.get(context.scenario.id);
  assert.ok(result !== undefined);
  const mutated = mutableClone(result);
  context.pipelineCase.injectMutation(mutated);

  const comparison = compareTargetResults(
    { target: DifferentialTarget.SemanticCore, result },
    [{ target: DifferentialTarget.SemanticCore, result: mutated }],
  );
  assert.equal(comparison.kind, ComparisonKind.Disagreement);
  if (comparison.kind !== ComparisonKind.Disagreement) {
    throw new Error("Boolean stringification did not create a disagreement");
  }
  assert.deepEqual(
    comparison.disagreement,
    context.pipelineCase.expectedInjectedDisagreement,
  );
});

test("detects configured Task effect pass-through and early User Task exposure", async () => {
  const [context] = await loadAndCompileCases(configuredTaskPipelineCases);
  assert.ok(context !== undefined);
  const result = runCoreTargets([context]).results.get(context.scenario.id);
  assert.ok(result !== undefined);
  const mutated = mutableClone(result);
  context.pipelineCase.injectMutation(mutated);

  const comparison = compareTargetResults(
    { target: DifferentialTarget.SemanticCore, result },
    [{ target: DifferentialTarget.SemanticCore, result: mutated }],
  );
  assert.equal(comparison.kind, ComparisonKind.Disagreement);
  if (comparison.kind !== ComparisonKind.Disagreement) {
    throw new Error("configured Task mutation did not create a disagreement");
  }
  assert.deepEqual(
    comparison.disagreement,
    context.pipelineCase.expectedInjectedDisagreement,
  );
});

test("makes every Terminate End regional-cancellation mutation reach its declared disagreement", async () => {
  const contexts = await loadAndCompileCases(terminateEndPipelineCases);
  const results = runCoreTargets(contexts).results;

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
      throw new Error("Terminate End mutation did not create a disagreement");
    }
    assert.deepEqual(
      comparison.disagreement,
      context.pipelineCase.expectedInjectedDisagreement,
    );
  }
});

test("makes the Timer Start instance-identity mutation reach its declared disagreement", async () => {
  const [context] = await loadAndCompileCases(timerStartPipelineCases);
  assert.ok(context !== undefined);
  const result = runCoreTargets([context]).results.get(context.scenario.id);
  assert.ok(result !== undefined);
  const mutated = mutableClone(result);
  context.pipelineCase.injectMutation(mutated);

  const comparison = compareTargetResults(
    { target: DifferentialTarget.SemanticCore, result },
    [{ target: DifferentialTarget.SemanticCore, result: mutated }],
  );
  assert.equal(comparison.kind, ComparisonKind.Disagreement);
  if (comparison.kind !== ComparisonKind.Disagreement) {
    throw new Error("Timer Start mutation did not create a disagreement");
  }
  assert.deepEqual(
    comparison.disagreement,
    context.pipelineCase.expectedInjectedDisagreement,
  );
});

test("reports an exact Message Start Interface Operation binding disagreement", async () => {
  const [context] = await loadAndCompileCases(messageStartPipelineCases);
  assert.ok(context !== undefined);
  const echoed = mutableClone(context.scenario);
  const trigger = echoed.stimuli[0];
  assert.equal(trigger?.kind, StimulusKind.TriggerMessageStart);
  if (trigger?.kind !== StimulusKind.TriggerMessageStart) {
    throw new TypeError("Message Start scenario must begin with its exact trigger");
  }
  trigger.channel.interfaceOperationId = "Operation_Other";

  assert.deepEqual(
    verifyScenarioBinding(
      DifferentialTarget.Lean,
      context.scenario,
      echoed,
    ),
    {
      kind: ScenarioBindingKind.Unbound,
      target: DifferentialTarget.Lean,
      issue: ScenarioBindingIssueKind.ContentMismatch,
      path: "scenario.stimuli[0].channel.interfaceOperationId",
      expected: "Operation_ReceiveApprovalRequest",
      actual: "Operation_Other",
    },
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
        [...pipelineCases, messageCase],
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

test("the pathology ceiling still covers the registered catalog", () => {
  // The budget module states the per-case rate but cannot read the case list: the deadlines derive
  // from it before any catalog exists, and the infrastructure gate that owns its unit assertions
  // runs before any package is built. This is the half that needs the catalog, so it lives here.
  assert.ok(
    defaultWarmBudgetMs >= pipelineCases.length * warmBudgetPerCaseMs,
    `the ${defaultWarmBudgetMs}ms ceiling is below ${pipelineCases.length} cases at ${warmBudgetPerCaseMs}ms each`,
  );
});

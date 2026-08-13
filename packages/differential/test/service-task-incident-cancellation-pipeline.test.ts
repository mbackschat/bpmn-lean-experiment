import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CanonicalObservationKind,
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import {
  ComparisonKind,
  DifferentialTarget,
  compareTargetResults,
} from "@bpmn-lean/differential";
import {
  EffectExecutionSchedule,
} from "@bpmn-lean/temporal-testkit";

import {
  serviceTaskIncidentCancellationDefinitionArtifacts,
} from "../../../scripts/contract-incident-cancellation-artifact-test-fixtures.ts";
import {
  serviceTaskIncidentDefinitionArtifacts,
} from "../../../scripts/contract-incident-artifact-test-fixtures.ts";
import {
  verifyServiceTaskIncidentCancellationSuccessor,
} from "../../../scripts/service-task-incident-cancellation-profile-consistency.ts";
import {
  pipelineCases,
} from "./pipeline-cases.ts";
import {
  incidentCancellationSchedule,
  serviceTaskIncidentCancellationPipelineCases,
} from "./service-task-incident-cancellation-pipeline-cases.ts";
import type {
  MutableScenarioResult,
} from "./pipeline-types.ts";
import {
  loadAndCompileCases,
  runCoreTargets,
} from "./pipeline-targets.ts";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("has the exact Temporal incident cancellation execution seam", () => {
  assert.equal(
    Object.values(EffectExecutionSchedule).includes(
      incidentCancellationSchedule as EffectExecutionSchedule,
    ),
    true,
  );
});

test("has retained CIB evidence for the registered cancellation case", async () => {
  const pipelineCase = serviceTaskIncidentCancellationPipelineCases[0];
  assert.ok(pipelineCase?.cib !== null && pipelineCase !== undefined);
  await access(`${projectRoot}/${pipelineCase.cib.evidenceRelativePath}`);
});

test("registers the exact successor shape and canonical cancellation trace", async () => {
  const cancellationCase = required(
    serviceTaskIncidentCancellationPipelineCases[0],
  );
  assert.deepEqual(
    pipelineCases.find(({ id }) => id === cancellationCase.id),
    cancellationCase,
  );
  assert.doesNotThrow(() => verifyServiceTaskIncidentCancellationSuccessor(
    serviceTaskIncidentDefinitionArtifacts(),
    serviceTaskIncidentCancellationDefinitionArtifacts(),
  ));

  const predecessorCase = required(pipelineCases.find(
    ({ id }) => id === "service-task-effect-incident-retry-success",
  ));
  const [predecessorContext, context] = await loadAndCompileCases([
    withoutRetainedEvidence(predecessorCase),
    cancellationCase,
  ]);
  assert.ok(
    predecessorContext !== undefined &&
    context !== undefined &&
    context.retainedEvidence !== null,
  );
  assert.doesNotThrow(() => verifyServiceTaskIncidentCancellationSuccessor(
    predecessorContext,
    context,
  ));
  const result = required(runCoreTargets([context]).results.get(cancellationCase.id));
  assert.deepEqual(result, context.retainedEvidence.result);
  const incident = result.trace[4];
  const cancelled = result.trace[6];
  assert.ok(
    incident?.kind === CanonicalObservationKind.State &&
    cancelled?.kind === CanonicalObservationKind.State,
  );
  assert.deepEqual(
    incident.enabledInteractions.map(({ kind }) => kind),
    ["retryIncident", "cancelIncidentProcess"],
  );
  assert.equal(cancelled.status, ProcessStatus.Cancelled);
  assert.deepEqual(cancelled.variables, [{
    name: "preserved",
    value: { kind: "string", value: "before-cancel" },
  }]);
  assert.deepEqual({
    activeWaits: cancelled.activeWaits,
    openUserTasks: cancelled.openUserTasks,
    openMessageSubscriptions: cancelled.openMessageSubscriptions,
    openTimers: cancelled.openTimers,
    openEffects: cancelled.openEffects,
    openIncidents: cancelled.openIncidents,
    enabledInteractions: cancelled.enabledInteractions,
  }, {
    activeWaits: [],
    openUserTasks: [],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    openIncidents: [],
    enabledInteractions: [],
  });
});

test("detects completed-state and predecessor target substitution", async () => {
  const cancellationCase = required(
    serviceTaskIncidentCancellationPipelineCases[0],
  );
  const predecessorCase = required(pipelineCases.find(
    ({ id }) => id === "service-task-effect-incident-retry-success",
  ));
  const contexts = await loadAndCompileCases([
    cancellationCase,
    withoutRetainedEvidence(predecessorCase),
  ]);
  const results = runCoreTargets(contexts).results;
  const cancellation = required(results.get(cancellationCase.id));
  const predecessor = required(results.get(predecessorCase.id));

  const completed = structuredClone(cancellation) as MutableScenarioResult;
  cancellationCase.injectMutation(completed);
  assert.deepEqual(
    compareTargetResults(
      { target: DifferentialTarget.CibSeven, result: cancellation },
      [{ target: DifferentialTarget.SemanticCore, result: completed }],
    ),
    {
      kind: ComparisonKind.Disagreement,
      referenceTarget: DifferentialTarget.CibSeven,
      candidateTarget: DifferentialTarget.SemanticCore,
      disagreement: cancellationCase.expectedInjectedDisagreement,
    },
  );

  for (const target of [
    DifferentialTarget.CibSeven,
    DifferentialTarget.Lean,
    DifferentialTarget.SemanticCore,
    DifferentialTarget.Temporal,
  ]) {
    assert.equal(
      compareTargetResults(
        { target: DifferentialTarget.RetainedCibEvidence, result: cancellation },
        [{ target, result: predecessor }],
      ).kind,
      ComparisonKind.Disagreement,
      target,
    );
  }
});

function required<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new Error("required cancellation pipeline value is absent");
  }
  return value;
}

function withoutRetainedEvidence(
  pipelineCase: typeof pipelineCases[number],
): typeof pipelineCases[number] {
  return { ...pipelineCase, cib: null };
}

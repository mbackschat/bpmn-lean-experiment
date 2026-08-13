import assert from "node:assert/strict";
import { test } from "node:test";

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
  pipelineCases,
} from "./pipeline-cases.ts";
import {
  serviceTaskIncidentPipelineCases,
} from "./service-task-incident-pipeline-cases.ts";
import type {
  MutableScenarioResult,
} from "./pipeline-types.ts";
import {
  loadAndCompileCases,
  runCoreTargets,
} from "./pipeline-targets.ts";
import {
  verifyServiceTaskIncidentSuccessor,
} from "../../../scripts/service-task-incident-profile-consistency.ts";

test("registers one exact incident case over the predecessor BPMN definition", async () => {
  const incidentCase = required(serviceTaskIncidentPipelineCases[0]);
  assert.deepEqual(incidentCase, pipelineCases.find(
    ({ id }) => id === incidentCase.id,
  ));
  assert.equal(
    incidentCase.bpmnRelativePath,
    "scenarios/service-task-effect/process.bpmn",
  );
  assert.equal(incidentCase.expectedWaitTraceLength, 5);

  const predecessorCase = required(pipelineCases.find(
    ({ id }) => id === "service-task-effect-success",
  ));
  const [predecessor, successor] = await loadAndCompileCases([
    withoutRetainedEvidence(predecessorCase),
    withoutRetainedEvidence(incidentCase),
  ]);
  assert.ok(predecessor !== undefined && successor !== undefined);
  assert.doesNotThrow(() =>
    verifyServiceTaskIncidentSuccessor(predecessor, successor)
  );
});

test("detects nested incident identity drift and predecessor-result substitution", async () => {
  const incidentCase = required(serviceTaskIncidentPipelineCases[0]);
  const predecessorCase = required(pipelineCases.find(
    ({ id }) => id === "service-task-effect-success",
  ));
  const contexts = await loadAndCompileCases([
    withoutRetainedEvidence(predecessorCase),
    withoutRetainedEvidence(incidentCase),
  ]);
  const core = runCoreTargets(contexts).results;
  const incidentResult = required(core.get(incidentCase.id));
  const predecessorResult = required(core.get(predecessorCase.id));

  const mutated = structuredClone(incidentResult) as MutableScenarioResult;
  incidentCase.injectMutation(mutated);
  const identityComparison = compareTargetResults(
    { target: DifferentialTarget.SemanticCore, result: incidentResult },
    [{ target: DifferentialTarget.CibSeven, result: mutated }],
  );
  assert.deepEqual(identityComparison, {
    kind: ComparisonKind.Disagreement,
    referenceTarget: DifferentialTarget.SemanticCore,
    candidateTarget: DifferentialTarget.CibSeven,
    disagreement: incidentCase.expectedInjectedDisagreement,
  });

  const substitution = compareTargetResults(
    { target: DifferentialTarget.SemanticCore, result: incidentResult },
    [{ target: DifferentialTarget.Temporal, result: predecessorResult }],
  );
  assert.equal(substitution.kind, ComparisonKind.Disagreement);
  if (substitution.kind !== ComparisonKind.Disagreement) {
    throw new Error("predecessor target substitution was not detected");
  }
  assert.equal(
    incidentResult.trace.some(
      (observation) =>
        observation.kind === CanonicalObservationKind.State &&
        observation.status === ProcessStatus.Running &&
        observation.openIncidents.length === 1,
    ),
    true,
  );
});

function required<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new Error("required incident pipeline value is absent");
  }
  return value;
}

function withoutRetainedEvidence(
  pipelineCase: typeof pipelineCases[number],
): typeof pipelineCases[number] {
  return { ...pipelineCase, cib: null };
}

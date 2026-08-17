import assert from "node:assert/strict";
import test from "node:test";

import {
  ScenarioStepKind,
  VariableValueKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  workflowChainCanonicalUtf8ByteLength,
} from "@bpmn-lean/temporal-protocol";
import {
  WorkflowSemanticCandidatePreflightKind,
  createCommandPublicationState,
  integrateCommandPublication,
  preflightWorkflowSemanticCandidate,
  recordCommandPublicationOutcome,
} from "../dist/index.js";

import {
  publicationCompletion,
  publicationProcessInstanceId,
  publicationProgram,
  publicationStart,
} from "./execution-publication-fixture.ts";

test("accepts exact canonical state and paired-publication byte boundaries", () => {
  const candidate = startCandidate();
  const limits = exactLimits(candidate);

  assert.deepEqual(
    preflightWorkflowSemanticCandidate(candidate, limits),
    {
      kind: WorkflowSemanticCandidatePreflightKind.Ready,
      observedStateBytes: limits.committedRuntimeStateBytes,
      observedPublicationBatchBytes: limits.publicationBatchBytes,
    },
  );
});

test("refuses a multibyte state candidate before mutating any retained fact", () => {
  const candidate = startCandidate();
  const before = structuredClone(candidate);
  const oversized = {
    ...candidate,
    state: {
      ...candidate.state,
      variables: {
        ...candidate.state.variables,
        process: {
          bindings: [{
            name: "payload",
            value: { kind: VariableValueKind.String, value: "€" },
          }],
        },
      },
    },
  };
  const observedValue = workflowChainCanonicalUtf8ByteLength(oversized.state);

  assert.deepEqual(
    preflightWorkflowSemanticCandidate(oversized, {
      committedRuntimeStateBytes: observedValue - 1,
      publicationBatchBytes: exactLimits(candidate).publicationBatchBytes,
    }),
    {
      kind: WorkflowSemanticCandidatePreflightKind.CapacityExceeded,
      failure: {
        budget: WorkflowChainBudgetKind.CommittedRuntimeStateBytes,
        configuredBound: observedValue - 1,
        observedValue,
      },
    },
  );
  assert.deepEqual(candidate, before);
});

test("refuses an oversized paired batch before either publication advances", () => {
  const candidate = startCandidate();
  const limits = exactLimits(candidate);

  assert.deepEqual(
    preflightWorkflowSemanticCandidate(candidate, {
      ...limits,
      publicationBatchBytes: limits.publicationBatchBytes - 1,
    }),
    {
      kind: WorkflowSemanticCandidatePreflightKind.CapacityExceeded,
      failure: {
        budget: WorkflowChainBudgetKind.PublicationBatchBytes,
        configuredBound: limits.publicationBatchBytes - 1,
        observedValue: limits.publicationBatchBytes,
      },
    },
  );
});

test("measures only the new paired batch and rejects asymmetric publication growth", () => {
  const first = startCandidate();
  const completion = publicationCompletion("UserTask_A");
  const step = advanceScenario(publicationProgram, first.state, completion);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) {
    assert.fail("completion did not reach a committed stable state");
  }
  const integrated = integrateCommandPublication(
    publicationProgram,
    first.publication,
    completion,
    step,
    () => 2_000,
  );
  const publication = recordCommandPublicationOutcome(
    integrated,
    completion,
    step.observations,
  );
  const candidate = {
    state: step.state,
    publicationBefore: first.publication,
    publication,
  };
  const limits = exactLimits(candidate);

  assert.equal(
    preflightWorkflowSemanticCandidate(candidate, limits).kind,
    WorkflowSemanticCandidatePreflightKind.Ready,
  );
  assert.ok(
    workflowChainCanonicalUtf8ByteLength(publication) >
      limits.publicationBatchBytes,
  );
  assert.throws(
    () => preflightWorkflowSemanticCandidate({
      ...candidate,
      publication: {
        ...publication,
        flowNodeOccurrences: first.publication.flowNodeOccurrences,
      },
    }, limits),
    /paired publication candidate advanced asymmetrically/u,
  );
});

test("permits lowered limits but never raises a production ceiling", () => {
  const candidate = startCandidate();
  const limits = exactLimits(candidate);

  assert.throws(
    () => preflightWorkflowSemanticCandidate(candidate, {
      ...limits,
      publicationBatchBytes: 64 * 1_024 + 1,
    }),
    /publicationBatchBytes limit exceeds production/u,
  );
});

function startCandidate() {
  const step = advanceScenario(publicationProgram, initialState, publicationStart);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) {
    assert.fail("publication Start did not reach a committed stable state");
  }
  const publicationBefore = createCommandPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  const integrated = integrateCommandPublication(
    publicationProgram,
    publicationBefore,
    publicationStart,
    step,
    () => 1_000,
  );
  const publication = recordCommandPublicationOutcome(
    integrated,
    publicationStart,
    step.observations,
  );
  return { state: step.state, publicationBefore, publication };
}

function exactLimits(candidate: ReturnType<typeof startCandidate>) {
  const execution = candidate.publication.execution.batches.at(-1);
  const flowNodeOccurrences =
    candidate.publication.flowNodeOccurrences.batches.at(-1);
  assert.ok(execution !== undefined && flowNodeOccurrences !== undefined);
  return {
    committedRuntimeStateBytes:
      workflowChainCanonicalUtf8ByteLength(candidate.state),
    publicationBatchBytes: workflowChainCanonicalUtf8ByteLength({
      execution,
      flowNodeOccurrences,
    }),
  };
}

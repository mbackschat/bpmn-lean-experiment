import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalObservationKind,
  ScenarioStepKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
} from "@bpmn-lean/temporal-protocol";
import {
  WorkflowRunRetentionPreflightKind,
  createCommandPublicationState,
  initializeWorkflowRunRetention,
  integrateCommandPublication,
  measureWorkflowRunRetention,
  preflightWorkflowRunRetentionCandidate,
  recordCommandPublicationOutcome,
  workflowRunRetentionCandidateReserveBytes,
} from "../dist/index.js";

import {
  publicationProcessInstanceId,
  publicationProgram,
  publicationStart,
} from "./execution-publication-fixture.ts";

test("accepts the exact retained Run byte boundary without mutating the prior state", () => {
  const candidate = startCandidate();
  const initialTrace = [deploymentObservation] as const;
  const exactBytes = measureWorkflowRunRetention(
    [...initialTrace, ...candidate.step.observations],
    candidate.publication,
  );
  const retention = initializeWorkflowRunRetention(
    initialTrace,
    candidate.publicationBefore,
    { retainedRunTraceAndPublicationBytes: exactBytes },
  );
  const before = structuredClone(retention);

  const preflight = preflightWorkflowRunRetentionCandidate(retention, {
    traceEntriesBefore: initialTrace.length,
    observations: candidate.step.observations,
    publicationBefore: candidate.publicationBefore,
    publication: candidate.publication,
  });

  assert.equal(preflight.kind, WorkflowRunRetentionPreflightKind.Ready);
  if (preflight.kind !== WorkflowRunRetentionPreflightKind.Ready) {
    assert.fail("exact retained candidate was not admitted");
  }
  assert.equal(preflight.successor.retainedCanonicalUtf8Bytes, exactBytes);
  assert.equal(preflight.successor.rolloverRequested, true);
  assert.deepEqual(retention, before);
});

test("refuses a one-byte multibyte overage before any retained fact advances", () => {
  const candidate = startCandidate("Command_€");
  const initialTrace = [deploymentObservation] as const;
  const observedValue = measureWorkflowRunRetention(
    [...initialTrace, ...candidate.step.observations],
    candidate.publication,
  );
  const retention = initializeWorkflowRunRetention(
    initialTrace,
    candidate.publicationBefore,
    { retainedRunTraceAndPublicationBytes: observedValue - 1 },
  );

  assert.deepEqual(
    preflightWorkflowRunRetentionCandidate(retention, {
      traceEntriesBefore: initialTrace.length,
      observations: candidate.step.observations,
      publicationBefore: candidate.publicationBefore,
      publication: candidate.publication,
    }),
    {
      kind: WorkflowRunRetentionPreflightKind.CapacityExceeded,
      failure: {
        budget: WorkflowChainBudgetKind.RetainedRunTraceAndPublicationBytes,
        configuredBound: observedValue - 1,
        observedValue,
      },
    },
  );
  assert.equal(retention.retainedCanonicalUtf8Bytes, measureWorkflowRunRetention(
    initialTrace,
    candidate.publicationBefore,
  ));
});

test("requests rollover with room for the closing candidate and one racing Signal", () => {
  const candidate = startCandidate();
  const initialTrace = [deploymentObservation] as const;
  const candidateBytes = measureWorkflowRunRetention(
    [...initialTrace, ...candidate.step.observations],
    candidate.publication,
  );
  const reserve = workflowRunRetentionCandidateReserveBytes();
  const exactTwoCandidateHeadroom = candidateBytes + (2 * reserve);
  const exact = preflightWorkflowRunRetentionCandidate(
    initializeWorkflowRunRetention(initialTrace, candidate.publicationBefore, {
      retainedRunTraceAndPublicationBytes: exactTwoCandidateHeadroom,
    }),
    candidateInput(candidate, initialTrace.length),
  );
  const oneByteShort = preflightWorkflowRunRetentionCandidate(
    initializeWorkflowRunRetention(initialTrace, candidate.publicationBefore, {
      retainedRunTraceAndPublicationBytes: exactTwoCandidateHeadroom - 1,
    }),
    candidateInput(candidate, initialTrace.length),
  );

  assert.equal(exact.kind, WorkflowRunRetentionPreflightKind.Ready);
  assert.equal(oneByteShort.kind, WorkflowRunRetentionPreflightKind.Ready);
  if (
    exact.kind !== WorkflowRunRetentionPreflightKind.Ready ||
    oneByteShort.kind !== WorkflowRunRetentionPreflightKind.Ready
  ) {
    assert.fail("headroom candidates were not admitted");
  }
  assert.equal(exact.successor.rolloverRequested, false);
  assert.equal(oneByteShort.successor.rolloverRequested, true);
});

test("keeps incremental bytes exact after existing trace and publication entries", () => {
  const candidate = startCandidate();
  const initialTrace = [deploymentObservation] as const;
  const first = preflightWorkflowRunRetentionCandidate(
    initializeWorkflowRunRetention(initialTrace, candidate.publicationBefore),
    candidateInput(candidate, initialTrace.length),
  );
  assert.equal(first.kind, WorkflowRunRetentionPreflightKind.Ready);
  if (first.kind !== WorkflowRunRetentionPreflightKind.Ready) {
    assert.fail("Start retention candidate was not admitted");
  }
  const stimulus = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "rejected-command",
    taskId: {
      processInstanceId: publicationProcessInstanceId,
      elementId: "UserTask_A",
      activation: 99,
    },
    submittedValues: [{
      name: "decision",
      value: { kind: VariableValueKind.String, value: "approved" },
    }],
  } as const;
  const rejected = advanceScenario(publicationProgram, candidate.step.state, stimulus);
  assert.equal(rejected.kind, ScenarioStepKind.Terminal);
  if (rejected.kind !== ScenarioStepKind.Terminal) {
    assert.fail("stale completion unexpectedly committed");
  }
  const publication = recordCommandPublicationOutcome(
    candidate.publication,
    stimulus,
    rejected.observations,
  );
  const second = preflightWorkflowRunRetentionCandidate(first.successor, {
    traceEntriesBefore: initialTrace.length + candidate.step.observations.length,
    observations: rejected.observations,
    publicationBefore: candidate.publication,
    publication,
  });

  assert.equal(second.kind, WorkflowRunRetentionPreflightKind.Ready);
  if (second.kind !== WorkflowRunRetentionPreflightKind.Ready) {
    assert.fail("rejected retention candidate was not admitted");
  }
  assert.equal(
    second.successor.retainedCanonicalUtf8Bytes,
    measureWorkflowRunRetention(
      [...initialTrace, ...candidate.step.observations, ...rejected.observations],
      publication,
    ),
  );
});

test("rejects impossible candidate growth beyond the derived reservation", () => {
  const publication = createCommandPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  const retention = initializeWorkflowRunRetention([], publication);
  const oversizedObservation: CanonicalObservation = {
    kind: CanonicalObservationKind.Command,
    commandId: "x".repeat(workflowRunRetentionCandidateReserveBytes()),
    outcome: "committed",
  };

  assert.throws(
    () => preflightWorkflowRunRetentionCandidate(retention, {
      traceEntriesBefore: 0,
      observations: [oversizedObservation],
      publicationBefore: publication,
      publication,
    }),
    /candidate exceeded its derived byte reservation/u,
  );
});

test("rejects a substituted retained prefix and raised production limit", () => {
  const candidate = startCandidate();
  const retention = initializeWorkflowRunRetention(
    [deploymentObservation],
    candidate.publicationBefore,
  );

  assert.throws(
    () => preflightWorkflowRunRetentionCandidate(retention, {
      ...candidateInput(candidate, 2),
    }),
    /retained trace prefix changed/u,
  );
  assert.throws(
    () => initializeWorkflowRunRetention([], candidate.publicationBefore, {
      retainedRunTraceAndPublicationBytes: (2 * 1_024 * 1_024) + 1,
    }),
    /retained Run limit exceeds production/u,
  );
});

const deploymentObservation: CanonicalObservation = {
  kind: CanonicalObservationKind.Deployment,
  outcome: "committed",
};

function startCandidate(commandId = publicationStart.commandId) {
  const stimulus = { ...publicationStart, commandId };
  const step = advanceScenario(publicationProgram, initialState, stimulus);
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
    stimulus,
    step,
    () => 1_000,
  );
  const publication = recordCommandPublicationOutcome(
    integrated,
    stimulus,
    step.observations,
  );
  return { step, publicationBefore, publication };
}

function candidateInput(
  candidate: ReturnType<typeof startCandidate>,
  traceEntriesBefore: number,
) {
  return {
    traceEntriesBefore,
    observations: candidate.step.observations,
    publicationBefore: candidate.publicationBefore,
    publication: candidate.publication,
  };
}

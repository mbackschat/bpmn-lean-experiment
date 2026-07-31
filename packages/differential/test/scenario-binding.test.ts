import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ObservationRequestKind,
  ScenarioDocumentKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import {
  DifferentialTarget,
  ScenarioBindingIssueKind,
  ScenarioBindingKind,
  verifyScenarioBinding,
} from "@bpmn-lean/differential";
import type { ScenarioBinding } from "@bpmn-lean/differential";

import type { DeepMutable } from "./pipeline-types.ts";

const admittedScenario: Scenario = {
  kind: ScenarioDocumentKind.Scenario,
  id: "user-task-wrong-activation",
  profile: "cibseven-2.2.0-user-task-process-data-draft",
  bpmn: {
    id: "sequential-user-task-process",
    relativePath: "scenarios/user-task-discovery-completion/process.bpmn",
    sha256:
      "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d",
  },
  stimuli: [
    {
      kind: StimulusKind.StartProcess,
      commandId: "start-process",
      processId: "Process_SequentialUserTask",
      instanceId: "Instance_1",
      initialVariables: [],
    },
    {
      kind: StimulusKind.CompleteUserTaskInstance,
      commandId: "wrong-activation",
      taskId: {
        processInstanceId: "Instance_1",
        elementId: "UserTask_Approve",
        activation: 2,
      },
      submittedValues: [],
    },
  ],
  observations: [
    ObservationRequestKind.Deployment,
    ObservationRequestKind.CommandResults,
    ObservationRequestKind.ProcessStatus,
    ObservationRequestKind.ActiveWaits,
    ObservationRequestKind.OpenUserTasks,
    ObservationRequestKind.OpenTimers,
    ObservationRequestKind.OpenEffects,
    ObservationRequestKind.EnabledInteractions,
    ObservationRequestKind.LogicalTime,
  ],
  provenance: {
    normativeRefs: [
      "BPMN 2.0.2 §10.7.3",
      "BPMN 2.0.2 §13.3.2",
      "BPMN 2.0.2 §13.3.3",
    ],
    cibRevision: "834a9874760de8a0107f7c1b32806e37f17fb017",
    cibRefs: [
      "UserTaskTest.java#testTaskPropertiesNotNull",
      "TaskAssigneeTest.java#testTaskAssignee",
      "TaskServiceTest.java#testCompleteTaskUnexistingTaskId",
    ],
  },
};

function driftedEcho(
  mutate: (scenario: DeepMutable<Scenario>) => void,
): DeepMutable<Scenario> {
  const echoed = structuredClone(admittedScenario) as DeepMutable<Scenario>;
  mutate(echoed);
  return echoed;
}

/** Requires an exact-content rejection and returns its located disagreement. */
function requireContentMismatch(
  binding: ScenarioBinding,
): Extract<
  ScenarioBinding,
  { issue: ScenarioBindingIssueKind.ContentMismatch }
> {
  assert.equal(binding.kind, ScenarioBindingKind.Unbound);
  assert.ok(
    binding.kind === ScenarioBindingKind.Unbound &&
      binding.issue === ScenarioBindingIssueKind.ContentMismatch,
    "the binding must report an exact content mismatch",
  );
  return binding;
}

test("an exact echo binds the target to the admitted scenario", () => {
  assert.deepEqual(
    verifyScenarioBinding(
      DifferentialTarget.Lean,
      admittedScenario,
      structuredClone(admittedScenario),
    ),
    {
      kind: ScenarioBindingKind.Bound,
      target: DifferentialTarget.Lean,
      scenarioId: "user-task-wrong-activation",
    },
  );
});

test("a drifted submitted activation is an exact content mismatch", () => {
  const echoed = driftedEcho((scenario) => {
    const completion = scenario.stimuli[1];
    assert.ok(
      completion?.kind === StimulusKind.CompleteUserTaskInstance,
      "the admitted scenario completes a User Task second",
    );
    completion.taskId.activation = 3;
  });
  assert.deepEqual(
    verifyScenarioBinding(DifferentialTarget.Lean, admittedScenario, echoed),
    {
      kind: ScenarioBindingKind.Unbound,
      target: DifferentialTarget.Lean,
      issue: ScenarioBindingIssueKind.ContentMismatch,
      path: "scenario.stimuli[1].taskId.activation",
      expected: 2,
      actual: 3,
    },
  );
});

test("a drifted BPMN content identity is an exact content mismatch", () => {
  const echoed = driftedEcho((scenario) => {
    scenario.bpmn.sha256 = `${"0".repeat(64)}`;
  });
  const binding = requireContentMismatch(
    verifyScenarioBinding(DifferentialTarget.Lean, admittedScenario, echoed),
  );
  assert.equal(binding.path, "scenario.bpmn.sha256");
});

test("a drifted normative reference is an exact content mismatch", () => {
  const echoed = driftedEcho((scenario) => {
    scenario.provenance.normativeRefs = [
      "BPMN 2.0.2 §13.2",
      "BPMN 2.0.2 §13.3",
    ];
  });
  const binding = requireContentMismatch(
    verifyScenarioBinding(DifferentialTarget.Lean, admittedScenario, echoed),
  );
  assert.equal(binding.path, "scenario.provenance.normativeRefs.length");
});

test("a drifted scenario identity is an exact content mismatch", () => {
  const echoed = driftedEcho((scenario) => {
    scenario.id = "user-task-discovery-completion";
  });
  const binding = requireContentMismatch(
    verifyScenarioBinding(DifferentialTarget.Lean, admittedScenario, echoed),
  );
  assert.equal(binding.path, "scenario.id");
});

test("an absent echo is a missing self-description, not a mismatch", () => {
  for (const echoed of [undefined, null, "scenario", 7, []]) {
    assert.deepEqual(
      verifyScenarioBinding(DifferentialTarget.Lean, admittedScenario, echoed),
      {
        kind: ScenarioBindingKind.Unbound,
        target: DifferentialTarget.Lean,
        issue: ScenarioBindingIssueKind.MissingEcho,
      },
    );
  }
});

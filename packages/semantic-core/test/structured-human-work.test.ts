import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BASELINE_SCENARIO_OBSERVATIONS,
  CommandOutcome,
  ControlStateKind,
  EffectExecutionResultKind,
  ScenarioDocumentKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProfileId,
  SimpleBooleanExpressionKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  evaluateSimpleBooleanExpression,
  initialState,
  isUserTaskMetadata,
  isWellFormedStimulus,
  sameStimulus,
  supportsSemanticProcessExecution,
  supportsSemanticProcessScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  SemanticOperation,
  SemanticProcessProgram,
  StartProcessStimulus,
  VariableBinding,
  VariableValue,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";

const profile = "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";
const processId = "Process_ExpenseExceptionReview";
const instanceId = "Instance_ExpenseExceptionReview";

const metadata = {
  assignment: {
    candidates: [{ kind: "group", id: "reviewers" }],
  },
} as const;

function structuredHumanWorkProgram(): SemanticProcessProgram {
  const places = [
    "Flow_Aborted",
    "Flow_Approved",
    "Flow_ChangesRequested",
    "Flow_ReviewToResolution",
    "Flow_StartToReview",
  ];
  const operations: ReadonlyArray<SemanticOperation> = [
    {
      ...operationBase("Start_ExpenseException"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToReview",
    },
    {
      ...operationBase("ReviewException"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_StartToReview",
      output: "place:Flow_ReviewToResolution",
      task: {
        elementId: "ReviewException",
        name: "Review exception",
        metadata,
      },
    },
    {
      ...operationBase("Resolution"),
      kind: SemanticOperationKind.Choose,
      input: "place:Flow_ReviewToResolution",
      candidates: [
        {
          condition: {
            kind: SimpleBooleanExpressionKind.StringEquals,
            variable: "resolution",
            value: "approved",
          },
          output: "place:Flow_Approved",
          origin: {
            kind: SemanticOriginKind.BpmnSequenceFlow,
            elementId: "Flow_Approved",
          },
        },
        {
          condition: {
            kind: SimpleBooleanExpressionKind.StringEquals,
            variable: "resolution",
            value: "changes-requested",
          },
          output: "place:Flow_ChangesRequested",
          origin: {
            kind: SemanticOriginKind.BpmnSequenceFlow,
            elementId: "Flow_ChangesRequested",
          },
        },
      ],
      defaultOutput: "place:Flow_Aborted",
      defaultOrigin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: "Flow_Aborted",
      },
    },
    ...[
      ["End_Aborted", "Flow_Aborted"],
      ["End_Approved", "Flow_Approved"],
      ["End_ChangesRequested", "Flow_ChangesRequested"],
    ].map(([elementId, flowId]): SemanticOperation => ({
      ...operationBase(elementId ?? ""),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: `place:${flowId ?? ""}`,
    })),
  ];
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: profile,
      sourceId: "expense-exception-review",
      sourceSha256: "6".repeat(64),
      sourceOverlay: null,
    },
    processId,
    controlPlaces: places.map(controlPlace),
    operations,
  });
}

const program = structuredHumanWorkProgram();
const start: StartProcessStimulus = {
  kind: StimulusKind.StartProcess,
  commandId: "start-expense-exception-review",
  processId,
  instanceId,
  initialVariables: [{
    name: "requestReference",
    value: { kind: VariableValueKind.String, value: "EXP-1042" },
  }],
};
const taskId = {
  processInstanceId: instanceId,
  elementId: "ReviewException",
  activation: 1,
} as const;

function complete(
  commandId: string,
  submittedValues: ReadonlyArray<VariableBinding>,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId,
    submittedValues: [...submittedValues],
  };
}

function binding(name: string, value: VariableValue): VariableBinding {
  return { name, value };
}

test("registers the exact M6 profile, program shape, and assignment-only metadata", () => {
  assert.equal(SemanticProfileId.StructuredHumanWork, profile);
  assert.equal(isUserTaskMetadata(metadata), true);
  assert.equal(supportsSemanticProcessExecution(start, program), true);

  const withLegacyForm = structuredClone(program);
  const wait = withLegacyForm.operations.find(
    (operation) => operation.kind === SemanticOperationKind.AwaitUserTask,
  );
  assert.ok(wait?.kind === SemanticOperationKind.AwaitUserTask);
  Object.assign(wait.task.metadata ?? {}, {
    form: { fields: [{ key: "approved", type: "boolean" }] },
  });
  assert.equal(supportsSemanticProcessExecution(start, withLegacyForm), false);
});

test("refuses every non-String-equality condition only for the M6 profile", () => {
  const conditions = [
    { kind: SimpleBooleanExpressionKind.Literal, value: true },
    { kind: SimpleBooleanExpressionKind.IsPresent, variable: "resolution" },
    { kind: SimpleBooleanExpressionKind.IsNull, variable: "resolution" },
  ] as const;
  for (const condition of conditions) {
    const mutation = structuredClone(program);
    const choice = mutation.operations.find(
      (operation) => operation.kind === SemanticOperationKind.Choose,
    );
    assert.ok(choice?.kind === SemanticOperationKind.Choose);
    const first = choice.candidates[0];
    assert.ok(first !== undefined);
    assert.equal(Reflect.set(choice.candidates, 0, { ...first, condition }), true);
    assert.equal(supportsSemanticProcessExecution(start, mutation), false);
  }
});

test("commits one mixed completion patch atomically and detaches caller list storage", () => {
  const waiting = applyStimulus(program, initialState, start);
  assert.equal(waiting.outcome, CommandOutcome.Committed);
  assert.equal(
    Object.hasOwn(waiting.state.userTaskWaits[0]?.metadata ?? {}, "form"),
    false,
  );

  const riskFlags = ["policy", "policy"];
  const stimulus = complete("approve-expense", [
    binding("approvedAmount", {
      kind: VariableValueKind.Integer,
      value: Number.MAX_SAFE_INTEGER,
    }),
    binding("notifySubmitter", {
      kind: VariableValueKind.Boolean,
      value: true,
    }),
    binding("resolution", {
      kind: VariableValueKind.String,
      value: "approved",
    }),
    binding("riskFlags", {
      kind: VariableValueKind.StringList,
      value: riskFlags,
    }),
  ]);
  assert.equal(isWellFormedStimulus(stimulus), true);

  const completed = applyStimulus(program, waiting.state, stimulus);
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.equal(completed.state.control.kind, ControlStateKind.Completed);
  assert.deepEqual(completed.state.variables.process.bindings, [
    binding("approvedAmount", {
      kind: VariableValueKind.Integer,
      value: Number.MAX_SAFE_INTEGER,
    }),
    binding("notifySubmitter", {
      kind: VariableValueKind.Boolean,
      value: true,
    }),
    binding("requestReference", {
      kind: VariableValueKind.String,
      value: "EXP-1042",
    }),
    binding("resolution", {
      kind: VariableValueKind.String,
      value: "approved",
    }),
    binding("riskFlags", {
      kind: VariableValueKind.StringList,
      value: ["policy", "policy"],
    }),
  ]);

  riskFlags[0] = "mutated-after-commit";
  assert.deepEqual(
    completed.state.variables.process.bindings.find(
      ({ name }) => name === "riskFlags",
    )?.value,
    {
      kind: VariableValueKind.StringList,
      value: ["policy", "policy"],
    },
  );
});

test("rejects every invalid generic integer and string-list boundary", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const invalidValues: ReadonlyArray<VariableValue> = [
    { kind: VariableValueKind.Integer, value: -0 },
    { kind: VariableValueKind.Integer, value: -1 },
    { kind: VariableValueKind.Integer, value: 1.5 },
    { kind: VariableValueKind.Integer, value: Number.MAX_SAFE_INTEGER + 1 },
    { kind: VariableValueKind.StringList, value: Array(33).fill("a") },
    { kind: VariableValueKind.StringList, value: ["a".repeat(1025)] },
    {
      kind: VariableValueKind.StringList,
      value: Array(17).fill("a".repeat(1024)),
    },
  ];
  for (const [index, value] of invalidValues.entries()) {
    const invalid = complete(`invalid-${index}`, [binding("value", value)]);
    assert.equal(
      isWellFormedStimulus(invalid),
      false,
      JSON.stringify(value),
    );
    assert.equal(applyStimulus(program, waiting, invalid).outcome, CommandOutcome.Rejected);
  }
});

test("keeps new values closed to Process Start, effects, old profiles, and conditions", () => {
  const integer = binding("approvedAmount", {
    kind: VariableValueKind.Integer,
    value: 42,
  });
  const invalidStart = { ...start, commandId: "integer-start", initialVariables: [integer] };
  assert.equal(isWellFormedStimulus(invalidStart), true);
  assert.equal(supportsSemanticProcessExecution(invalidStart, program), false);
  assert.deepEqual(applyStimulus(program, initialState, invalidStart).state, initialState);

  const oldProgram = {
    ...program,
    identity: {
      ...program.identity,
      semanticProfile: SemanticProfileId.ExclusiveGatewaySimpleBoolean,
    },
  };
  const waiting = applyStimulus(program, initialState, start).state;
  assert.equal(
    applyStimulus(oldProgram, waiting, complete("old-profile", [integer])).outcome,
    CommandOutcome.Rejected,
  );

  const effectScenario: Scenario = {
    kind: ScenarioDocumentKind.Scenario,
    id: "m6-effect-refusal",
    profile,
    bpmn: {
      id: program.identity.sourceId,
      relativePath: "test-only/structured-human-work.bpmn",
      sha256: program.identity.sourceSha256,
      sourceOverlay: null,
    },
    stimuli: [start, {
      kind: StimulusKind.CompleteEffect,
      commandId: "effect-new-value",
      effectId: {
        processInstanceId: instanceId,
        elementId: "Effect",
        activation: 1,
      },
      result: {
        kind: EffectExecutionResultKind.Success,
        localPatch: [integer],
      },
    }],
    observations: BASELINE_SCENARIO_OBSERVATIONS,
    provenance: { normativeRefs: [], cibRevision: "", cibRefs: [] },
  };
  assert.equal(supportsSemanticProcessScenario(effectScenario, program), false);
  assert.equal(
    evaluateSimpleBooleanExpression(
      {
        kind: SimpleBooleanExpressionKind.StringEquals,
        variable: "approvedAmount",
        value: "42",
      },
      [integer],
    ),
    false,
  );
});

test("preserves list order, multiplicity, and stimulus identity", () => {
  const left = complete("same-command", [binding("riskFlags", {
    kind: VariableValueKind.StringList,
    value: ["a", "b", "a"],
  })]);
  const identical = structuredClone(left);
  const reordered = complete("same-command", [binding("riskFlags", {
    kind: VariableValueKind.StringList,
    value: ["b", "a", "a"],
  })]);

  assert.equal(sameStimulus(left, identical), true);
  assert.equal(sameStimulus(left, reordered), false);
});

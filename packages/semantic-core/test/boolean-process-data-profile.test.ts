import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  BASELINE_SCENARIO_OBSERVATIONS,
  CommandOutcome,
  EffectExecutionResultKind,
  MappingExpressionKind,
  ScenarioDocumentKind,
  SemanticGraphPolicyKind,
  SemanticOriginKind,
  SemanticProfileId,
  SimpleBooleanExpressionKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  createEffectLocalDataOwner,
  evaluateSimpleBooleanExpression,
  initialState,
  isWellFormedStimulus,
  semanticGraphPolicyForProfile,
  supportsSemanticProcessExecution,
  supportsSemanticProcessScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteEffectStimulus,
  CompleteUserTaskInstanceStimulus,
  RuntimeState,
  Scenario,
  StartProcessStimulus,
  VariableBinding,
} from "@bpmn-lean/semantic-core";

import { semanticProcessFor } from "./user-task-fixture.ts";

const booleanProfile = SemanticProfileId.UserTaskBooleanCompletionData;
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

const scenarioIdentity = Object.freeze({
  kind: ScenarioDocumentKind.Scenario,
  id: "boolean-process-data-profile",
  profile: booleanProfile,
  bpmn: {
    id: "sequential-user-task-process",
    relativePath: "test-only/sequential-user-task-process.bpmn",
    sha256:
      "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d",
    sourceOverlay: null,
  },
} as const);

const booleanProgram = semanticProcessFor({
  ...scenarioIdentity,
  stimuli: [],
  observations: [],
  provenance: {
    normativeRefs: [],
    cibRevision: "834a9874760de8a0107f7c1b32806e37f17fb017",
    cibRefs: [],
  },
});

const booleanStart: StartProcessStimulus = {
  kind: StimulusKind.StartProcess,
  commandId: "start-checkpoint",
  processId: booleanProgram.processId,
  instanceId: "Instance_Boolean",
  initialVariables: [],
};

const taskId = Object.freeze({
  processInstanceId: booleanStart.instanceId,
  elementId: "UserTask_Approve",
  activation: 1,
});

function booleanBinding(value: boolean): VariableBinding {
  return {
    name: "decision",
    value: { kind: VariableValueKind.Boolean, value },
  };
}

function completeBoolean(value: boolean): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${String(value)}`,
    taskId,
    submittedValues: [booleanBinding(value)],
  };
}

test("registers the Boolean profile with the exact sequential User Task shape", () => {
  assert.deepEqual(Object.values(SemanticProfileId), [
    "bpmn-2.0.2-activity-boundary-message-draft",
    "bpmn-2.0.2-activity-boundary-timer-draft",
    "bpmn-2.0.2-activity-data-input-user-task-draft",
    "bpmn-2.0.2-activity-data-output-user-task-draft",
    "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
    "bpmn-2.0.2-parallel-multi-instance-user-task-draft",
    "cibseven-2.0.0-mapped-boundary-error-service-task-draft",
    "bpmn-2.0.2-called-process-call-activity-draft",
    "cibseven-2.0.0-mapped-success-service-task-draft",
    "bpmn-2.0.2-message-start-event-draft",
    "bpmn-2.0.2-timer-start-event-draft",
    "bpmn-2.0.2-terminate-end-event-draft",
    "cibseven-2.2.0-embedded-subprocess-completion-draft",
    "bpmn-2.0.2-subprocess-boundary-timer-draft",
    "cibseven-2.2.0-subprocess-error-propagation-draft",
    "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft",
    "bpmn-2.0.2-inclusive-gateway-selected-branches-draft",
    "bpmn-2.0.2-event-based-gateway-message-timer-draft",
    "cibseven-2.2.0-intermediate-catch-timer-draft",
    "bpmn-2.0.2-intermediate-catch-message-draft",
    "bpmn-2.0.2-message-payload-catch-draft",
    "bpmn-2.0.2-message-key-correlation-draft",
    "cibseven-2.2.0-message-addressed-receive-task-draft",
    "bpmn-2.0.2-non-interrupting-boundary-timer-draft",
    "parallel-fork-join-draft",
    "cibseven-2.2.0-service-task-effect-draft",
    "cibseven-2.2.0-service-task-incident-draft",
    "cibseven-2.2.0-service-task-incident-cancellation-draft",
    "bpmn-2.0.2-timer-user-task-composition-draft",
    "cibseven-2.2.0-user-task-process-data-draft",
    "bpmn-2.0.2-user-task-cycle-draft",
    "bpmn-2.0.2-user-task-preserved-notation-draft",
    "cibseven-2.2.0-user-task-process-data-preserved-notation-draft",
    "bpmn-2.0.2-bpmn-lean-configured-task-effect-draft",
    booleanProfile,
    "cibseven-2.2.0-user-task-assignment-form-metadata-draft",
    "cibseven-2.2.0-parallel-user-task-assignment-form-metadata-draft",
    "bpmn-2.0.2-bpmn-lean-structured-human-work-draft",
  ]);
  assert.deepEqual(semanticGraphPolicyForProfile(booleanProfile), {
    kind: SemanticGraphPolicyKind.Acyclic,
  });
  assert.equal(
    supportsSemanticProcessExecution(booleanStart, booleanProgram),
    true,
  );
});

test("applies the same profile value domain at scenario deployment", () => {
  const booleanScenario: Scenario = {
    kind: ScenarioDocumentKind.Scenario,
    id: scenarioIdentity.id,
    profile: booleanProfile,
    bpmn: scenarioIdentity.bpmn,
    stimuli: [booleanStart, completeBoolean(true)],
    observations: BASELINE_SCENARIO_OBSERVATIONS,
    provenance: {
      normativeRefs: ["BPMN 2.0.2 §10.3.1"],
      cibRevision: "834a9874760de8a0107f7c1b32806e37f17fb017",
      cibRefs: ["test-only-boolean-value-domain"],
    },
  };
  assert.equal(
    supportsSemanticProcessScenario(booleanScenario, booleanProgram),
    true,
  );
  assert.equal(
    supportsSemanticProcessScenario(
      {
        ...booleanScenario,
        stimuli: [{
          ...booleanStart,
          initialVariables: [booleanBinding(true)],
        }, completeBoolean(true)],
      },
      booleanProgram,
    ),
    false,
  );
  const oldProfile = SemanticProfileId.UserTask;
  assert.equal(
    supportsSemanticProcessScenario(
      { ...booleanScenario, profile: oldProfile },
      {
        ...booleanProgram,
        identity: {
          ...booleanProgram.identity,
          semanticProfile: oldProfile,
        },
      },
    ),
    false,
  );
});

test("rejects Boolean Process Start even under the Boolean-completion profile", () => {
  const rejectedStart: StartProcessStimulus = {
    ...booleanStart,
    commandId: "reject-boolean-start",
    initialVariables: [booleanBinding(true)],
  };

  assert.equal(isWellFormedStimulus(rejectedStart), true);
  assert.equal(
    supportsSemanticProcessExecution(rejectedStart, booleanProgram),
    false,
  );
  const rejected = applyStimulus(booleanProgram, initialState, rejectedStart);
  assert.equal(rejected.outcome, CommandOutcome.Rejected);
  assert.deepEqual(rejected.state, initialState);
});

test("commits Boolean true and false distinctly on exact User Task completion", () => {
  for (const value of [false, true]) {
    const waiting = applyStimulus(
      booleanProgram,
      initialState,
      booleanStart,
    );
    assert.equal(waiting.outcome, CommandOutcome.Committed);

    const completed = applyStimulus(
      booleanProgram,
      waiting.state,
      completeBoolean(value),
    );

    assert.equal(completed.outcome, CommandOutcome.Committed);
    assert.deepEqual(completed.state.variables.process.bindings, [
      booleanBinding(value),
    ]);
  }
});

test("old profile rejects direct Boolean completion without consuming the task", () => {
  const oldProgram = {
    ...booleanProgram,
    identity: {
      ...booleanProgram.identity,
      semanticProfile: SemanticProfileId.UserTask,
    },
  };
  const waiting = applyStimulus(oldProgram, initialState, booleanStart);
  assert.equal(waiting.outcome, CommandOutcome.Committed);

  const rejected = applyStimulus(
    oldProgram,
    waiting.state,
    completeBoolean(true),
  );
  assert.equal(rejected.outcome, CommandOutcome.Rejected);
  assert.deepEqual(rejected.state, waiting.state);

  const accepted = applyStimulus(oldProgram, rejected.state, {
    ...completeBoolean(true),
    commandId: "complete-valid-string",
    submittedValues: [{
      name: "decision",
      value: { kind: VariableValueKind.String, value: "approved" },
    }],
  });
  assert.equal(accepted.outcome, CommandOutcome.Committed);
  assert.deepEqual(accepted.state.variables.process.bindings, [{
    name: "decision",
    value: { kind: VariableValueKind.String, value: "approved" },
  }]);
});

test("rejects Boolean effect success and BPMN Error patches with exact state preservation", () => {
  const waiting = applyStimulus(
    booleanProgram,
    initialState,
    booleanStart,
  ).state;
  const owner = waiting.userTaskWaits[0]?.owner;
  assert.ok(owner !== undefined);
  const effectId = {
    processInstanceId: booleanStart.instanceId,
    elementId: "Effect_Boolean_Probe",
    activation: 1,
  } as const;
  const effectWaiting: RuntimeState = {
    ...waiting,
    userTaskWaits: [],
    effectWaits: [{
      id: effectId,
      owner,
      descriptor: {
        protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
        operation: "urn:bpmn-lean:effect-operation:probe-v1",
      },
      arguments: [],
      outputMappings: [{
        target: "decision",
        expression: {
          kind: MappingExpressionKind.LocalVariable,
          name: "result",
        },
      }],
      bpmnErrorRoute: {
        code: "BooleanError",
        output: "place:Flow_TaskToEnd",
        origin: {
          kind: SemanticOriginKind.BpmnElement,
          boundaryEventId: "Boundary_BooleanError",
          errorDefinitionId: "ErrorDefinition_BooleanError",
          errorElementId: "Error_BooleanError",
          sequenceFlowId: "Flow_TaskToEnd",
        },
      },
      output: "place:Flow_TaskToEnd",
      incidentAlreadyRetried: false,
    }],
    variables: {
      process: waiting.variables.process,
      activities: [{ owner: createEffectLocalDataOwner(effectId), bindings: [] }],
    },
  };

  const results = [
    {
      kind: EffectExecutionResultKind.Success,
      localPatch: [{ name: "result", value: booleanBinding(true).value }],
    },
    {
      kind: EffectExecutionResultKind.BpmnError,
      code: "BooleanError",
      message: null,
      localPatch: [{ name: "result", value: booleanBinding(false).value }],
    },
  ] as const;
  for (const [index, result] of results.entries()) {
    const stimulus: CompleteEffectStimulus = {
      kind: StimulusKind.CompleteEffect,
      commandId: `reject-boolean-effect-${index}`,
      effectId,
      result,
    };
    assert.equal(isWellFormedStimulus(stimulus), true);
    const rejected = applyStimulus(
      booleanProgram,
      effectWaiting,
      stimulus,
    );
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, effectWaiting);
  }
});

test("keeps Simple Boolean evaluation total without equating Boolean and string values", () => {
  const bindings = [booleanBinding(true)];
  assert.equal(evaluateSimpleBooleanExpression(
    { kind: SimpleBooleanExpressionKind.IsPresent, variable: "decision" },
    bindings,
  ), true);
  assert.equal(evaluateSimpleBooleanExpression(
    { kind: SimpleBooleanExpressionKind.IsNull, variable: "decision" },
    bindings,
  ), false);
  assert.equal(evaluateSimpleBooleanExpression(
    {
      kind: SimpleBooleanExpressionKind.StringEquals,
      variable: "decision",
      value: "true",
    },
    bindings,
  ), false);
  assert.notDeepEqual(booleanBinding(true), {
    name: "decision",
    value: { kind: VariableValueKind.String, value: "true" },
  });
  assert.notDeepEqual(booleanBinding(false), {
    name: "decision",
    value: { kind: VariableValueKind.Null },
  });
});

test("admits only the exact Boolean variable-value wire arm", async () => {
  const schema = JSON.parse(await readFile(
    `${projectRoot}/contracts/schemas/scenario.schema.json`,
    "utf8",
  )) as Record<string, unknown>;
  const definitions = schema.$defs as Record<string, unknown>;
  const validator = new Ajv2020({ strict: true }).compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: definitions,
    $ref: "#/$defs/variableValue",
  });

  assert.equal(validator({ kind: "boolean", value: true }), true);
  assert.equal(validator({ kind: "boolean", value: false }), true);
  assert.equal(validator({ kind: "boolean", value: "true" }), false);
  assert.equal(validator({ kind: "boolean" }), false);
  assert.equal(
    validator({ kind: "boolean", value: true, extra: null }),
    false,
  );
});

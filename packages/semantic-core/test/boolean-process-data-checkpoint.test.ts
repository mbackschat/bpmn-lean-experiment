import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  CommandOutcome,
  EffectExecutionResultKind,
  MappingExpressionKind,
  ObservationRequestKind,
  ScenarioDocumentKind,
  SemanticCheckpointProfileId,
  SemanticGraphPolicyKind,
  SemanticOriginKind,
  SemanticProfileId,
  SimpleBooleanExpressionKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
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

const checkpointProfile =
  SemanticCheckpointProfileId.UserTaskBooleanCompletionData;
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

const scenarioIdentity = Object.freeze({
  kind: ScenarioDocumentKind.Scenario,
  id: "boolean-process-data-checkpoint",
  profile: checkpointProfile,
  bpmn: {
    id: "sequential-user-task-process",
    relativePath: "test-only/sequential-user-task-process.bpmn",
    sha256:
      "b5704a6d526ce5029e21b2de214653860bb23f7ed6169c4d912cd2412486378d",
    sourceOverlay: null,
  },
} as const);

const checkpointProgram = semanticProcessFor({
  ...scenarioIdentity,
  stimuli: [],
  observations: [],
  provenance: {
    normativeRefs: [],
    cibRevision: "834a9874760de8a0107f7c1b32806e37f17fb017",
    cibRefs: [],
  },
});

const checkpointStart: StartProcessStimulus = {
  kind: StimulusKind.StartProcess,
  commandId: "start-checkpoint",
  processId: checkpointProgram.processId,
  instanceId: "Instance_Boolean",
  initialVariables: [],
};

const taskId = Object.freeze({
  processInstanceId: checkpointStart.instanceId,
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

test("admits the checkpoint profile only with its exact sequential User Task shape", () => {
  assert.equal(
    new Set<string>(Object.values(SemanticProfileId)).has(checkpointProfile),
    false,
  );
  assert.deepEqual(semanticGraphPolicyForProfile(checkpointProfile), {
    kind: SemanticGraphPolicyKind.Acyclic,
  });
  assert.equal(
    supportsSemanticProcessExecution(checkpointStart, checkpointProgram),
    true,
  );
});

test("applies the same profile value domain at scenario deployment", () => {
  const checkpointScenario: Scenario = {
    kind: ScenarioDocumentKind.Scenario,
    id: scenarioIdentity.id,
    profile: checkpointProfile,
    bpmn: scenarioIdentity.bpmn,
    stimuli: [checkpointStart, completeBoolean(true)],
    observations: Object.values(ObservationRequestKind),
    provenance: {
      normativeRefs: ["BPMN 2.0.2 §10.3.1"],
      cibRevision: "834a9874760de8a0107f7c1b32806e37f17fb017",
      cibRefs: ["test-only-boolean-value-domain"],
    },
  };
  assert.equal(
    supportsSemanticProcessScenario(checkpointScenario, checkpointProgram),
    true,
  );
  assert.equal(
    supportsSemanticProcessScenario(
      {
        ...checkpointScenario,
        stimuli: [{
          ...checkpointStart,
          initialVariables: [booleanBinding(true)],
        }, completeBoolean(true)],
      },
      checkpointProgram,
    ),
    false,
  );
  const oldProfile = "cibseven-2.2.0-user-task-process-data-draft";
  assert.equal(
    supportsSemanticProcessScenario(
      { ...checkpointScenario, profile: oldProfile },
      {
        ...checkpointProgram,
        identity: {
          ...checkpointProgram.identity,
          semanticProfile: oldProfile,
        },
      },
    ),
    false,
  );
});

test("rejects Boolean Process Start even under the Boolean-completion checkpoint", () => {
  const booleanStart: StartProcessStimulus = {
    ...checkpointStart,
    commandId: "reject-boolean-start",
    initialVariables: [booleanBinding(true)],
  };

  assert.equal(isWellFormedStimulus(booleanStart), true);
  assert.equal(
    supportsSemanticProcessExecution(booleanStart, checkpointProgram),
    false,
  );
  const rejected = applyStimulus(checkpointProgram, initialState, booleanStart);
  assert.equal(rejected.outcome, CommandOutcome.Rejected);
  assert.deepEqual(rejected.state, initialState);
});

test("commits Boolean true and false distinctly on exact checkpoint User Task completion", () => {
  for (const value of [false, true]) {
    const waiting = applyStimulus(
      checkpointProgram,
      initialState,
      checkpointStart,
    );
    assert.equal(waiting.outcome, CommandOutcome.Committed);

    const completed = applyStimulus(
      checkpointProgram,
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
    ...checkpointProgram,
    identity: {
      ...checkpointProgram.identity,
      semanticProfile: "cibseven-2.2.0-user-task-process-data-draft",
    },
  };
  const waiting = applyStimulus(oldProgram, initialState, checkpointStart);
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
    checkpointProgram,
    initialState,
    checkpointStart,
  ).state;
  const owner = waiting.userTaskWaits[0]?.owner;
  assert.ok(owner !== undefined);
  const effectId = {
    processInstanceId: checkpointStart.instanceId,
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
    }],
    variables: {
      process: waiting.variables.process,
      activities: [{ owner: effectId, bindings: [] }],
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
      checkpointProgram,
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

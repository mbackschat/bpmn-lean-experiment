import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  CommandOutcome,
  EffectExecutionResultKind,
  MappingExpressionKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  initialState,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  EffectExecutionResult,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import { lastStateObservation } from "./canonical-observations.ts";
import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";

const program: SemanticProcessProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "cibseven-2.0.0-a12-boundary-error-draft",
    sourceId: "a12-boundary-error",
    sourceSha256:
      "68ad931204e62da12494766393b380026addb1e230d5a3a64205e655831f62b6",
  },
  processId: "Process_BoundaryError",
  controlPlaces: [
    controlPlace("Flow_ErrorToUserTask"),
    controlPlace("Flow_ServiceToEnd"),
    controlPlace("Flow_StartToService"),
    controlPlace("Flow_UserTaskToEnd"),
  ],
  operations: [
    {
      ...operationBase("CreateRelationshipLinkTask"),
      kind: SemanticOperationKind.AwaitEffect,
      input: "place:Flow_StartToService",
      output: "place:Flow_ServiceToEnd",
      effect: {
        elementId: "CreateRelationshipLinkTask",
        descriptor: {
          protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
          operation:
            "urn:bpmn-lean:effect-operation:mapped-boundary-error-v1",
        },
        inputMappings: [
          {
            target: "relationshipModel",
            expression: {
              kind: MappingExpressionKind.StringLiteral,
              value: "RelationshipModel",
            },
          },
        ],
        outputMappings: [
          {
            target: "relationshipLinkId",
            expression: {
              kind: MappingExpressionKind.LocalVariable,
              name: "newLinkId",
            },
          },
        ],
      },
      bpmnErrorRoute: {
        code: "LinkLimitReachedError",
        output: "place:Flow_ErrorToUserTask",
        origin: {
          kind: SemanticOriginKind.BpmnElement,
          boundaryEventId: "BoundaryEvent_LinkLimitReached",
          errorDefinitionId: "ErrorEventDefinition_LinkLimitReached",
          errorElementId: "Error_LinkLimitReached",
          sequenceFlowId: "Flow_ErrorToUserTask",
        },
      },
    },
    {
      ...operationBase("EndEvent_AfterError"),
      kind: SemanticOperationKind.Terminate,
      input: "place:Flow_UserTaskToEnd",
    },
    {
      ...operationBase("EndEvent_Normal"),
      kind: SemanticOperationKind.Terminate,
      input: "place:Flow_ServiceToEnd",
    },
    {
      ...operationBase("ExpectedUserTaskAfterBPMNError"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_ErrorToUserTask",
      output: "place:Flow_UserTaskToEnd",
      task: {
        elementId: "ExpectedUserTaskAfterBPMNError",
        name: "Expected User Task After BPMN Error",
      },
    },
    {
      ...operationBase("StartEvent_None"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToService",
    },
  ],
};

const effectId = Object.freeze({
  processInstanceId: "Instance_1",
  elementId: "CreateRelationshipLinkTask",
  activation: 1,
});

const start: StartProcessStimulus = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-boundary-error",
  processId: program.processId,
  instanceId: effectId.processInstanceId,
});

const result = Object.freeze({
  kind: EffectExecutionResultKind.BpmnError,
  code: "LinkLimitReachedError",
  message: "Link limit reached",
  localPatch: [
    {
      name: "newLinkId",
      value: { kind: VariableValueKind.Null },
    },
  ],
} as const) satisfies EffectExecutionResult;

// The retained scenario is a tracked answer-free document locked by the
// contract gate, so its declared type is the current wire contract.
const scenario = JSON.parse(
  await readFile(
    new URL("../../../scenarios/boundary-error/scenario.json", import.meta.url),
    "utf8",
  ),
) as Scenario;

test("runs the exact answer-free caught-Error scenario", () => {
  const execution = runScenario(scenario, program);

  assert.deepEqual(execution.outcome, {
    kind: "semantic",
    outcome: CommandOutcome.Committed,
  });
  assert.deepEqual(execution.trace[4], {
    kind: "state",
    instanceId: "Instance_1",
    status: "running",
    activeWaits: [{
      elementId: "ExpectedUserTaskAfterBPMNError",
      kind: "userTask",
      multiplicity: 1,
    }],
    openUserTasks: [{
      id: {
        processInstanceId: "Instance_1",
        elementId: "ExpectedUserTaskAfterBPMNError",
        activation: 1,
      },
      name: "Expected User Task After BPMN Error",
      state: "active",
    }],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    variables: [{
      name: "relationshipLinkId",
      value: { kind: "null" },
    }],
    enabledInteractions: [{
      kind: "completeUserTaskInstance",
      taskId: {
        processInstanceId: "Instance_1",
        elementId: "ExpectedUserTaskAfterBPMNError",
        activation: 1,
      },
    }],
    logicalTimeMs: 0,
  });
  assert.equal(lastStateObservation(execution.trace).status, "completed");
});

test("applies the validated null patch and opens only the boundary route", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const caught = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "complete-boundary-error",
    effectId,
    result,
  });

  assert.equal(caught.outcome, CommandOutcome.Committed);
  assert.deepEqual(caught.state.effectWaits, []);
  assert.deepEqual(caught.state.userTaskWaits, [
    {
      id: {
        processInstanceId: "Instance_1",
        elementId: "ExpectedUserTaskAfterBPMNError",
        activation: 1,
      },
      name: "Expected User Task After BPMN Error",
      output: "place:Flow_UserTaskToEnd",
    },
  ]);
  assert.deepEqual(caught.state.variables, {
    process: { bindings: [
    {
      name: "relationshipLinkId",
      value: { kind: "null" },
    },
    ] },
    activities: [],
  });
  assert.equal(caught.state.endOccurrences, 0);
});

test("rejects mismatched codes and undeclared locals with exact state preservation", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const mutations: ReadonlyArray<EffectExecutionResult> = [
    { ...result, code: "RelationshipLinkageError" },
    {
      ...result,
      localPatch: [
        {
          name: "undeclaredLocal",
          value: { kind: VariableValueKind.Null },
        },
      ],
    },
  ];

  for (const [index, mutation] of mutations.entries()) {
    const rejected = applyStimulus(program, waiting, {
      kind: StimulusKind.CompleteEffect,
      commandId: `reject-error-${index}`,
      effectId,
      result: mutation,
    });
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, waiting);
  }
});

test("keeps absence, null, and empty string semantically distinct", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const absent = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "absent-error-patch",
    effectId,
    result: { ...result, localPatch: [] },
  });
  const empty = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "empty-string-error-patch",
    effectId,
    result: {
      ...result,
      localPatch: [{
        name: "newLinkId",
        value: { kind: VariableValueKind.String, value: "" },
      }],
    },
  });
  const nullValue = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "null-error-patch",
    effectId,
    result,
  });

  assert.equal(absent.outcome, CommandOutcome.Rejected);
  assert.equal(empty.outcome, CommandOutcome.Committed);
  assert.equal(nullValue.outcome, CommandOutcome.Committed);
  assert.notDeepEqual(
    empty.state.variables.process.bindings,
    nullValue.state.variables.process.bindings,
  );
});

test("contrasts the real Error branch with treating the result as success", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const caught = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "caught-result",
    effectId,
    result,
  });
  const wrongAccount = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "wrong-success-result",
    effectId,
    result: {
      kind: EffectExecutionResultKind.Success,
      localPatch: [{
        name: "newLinkId",
        value: { kind: VariableValueKind.String, value: "normal" },
      }],
    },
  });

  assert.equal(caught.state.userTaskWaits.length, 1);
  assert.equal(caught.state.endOccurrences, 0);
  assert.equal(wrongAccount.state.userTaskWaits.length, 0);
  assert.equal(wrongAccount.state.endOccurrences, 1);
});

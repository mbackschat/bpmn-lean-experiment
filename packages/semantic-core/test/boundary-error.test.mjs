import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  CommandOutcome,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  applyStimulus,
  initialState,
  runScenario,
} from "../dist/index.js";

const program = {
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
          protocol: "urn:bpmn-lean:a12-delegate:v1",
          handler: "createRelationshipLinkDelegate",
        },
        inputMappings: [
          {
            target: "relationshipModel",
            expression: {
              kind: "stringLiteral",
              value: "RelationshipModel",
            },
          },
        ],
        outputMappings: [
          {
            target: "relationshipLinkId",
            expression: {
              kind: "localVariable",
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

const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-boundary-error",
  processId: program.processId,
  instanceId: effectId.processInstanceId,
});

const result = Object.freeze({
  kind: "bpmnError",
  code: "LinkLimitReachedError",
  message: "Link limit reached",
  localPatch: [
    {
      name: "newLinkId",
      value: { kind: "null" },
    },
  ],
});

const scenario = JSON.parse(
  await readFile(
    new URL("../../../scenarios/boundary-error/scenario.json", import.meta.url),
    "utf8",
  ),
);

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
  assert.equal(execution.trace.at(-1)?.status, "completed");
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
  assert.deepEqual(caught.state.processVariables, [
    {
      name: "relationshipLinkId",
      value: { kind: "null" },
    },
  ]);
  assert.equal(caught.state.endOccurrences, 0);
});

test("rejects mismatched codes and undeclared locals with exact state preservation", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const mutations = [
    { ...result, code: "RelationshipLinkageError" },
    {
      ...result,
      localPatch: [
        {
          name: "undeclaredLocal",
          value: { kind: "null" },
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
        value: { kind: "string", value: "" },
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
    empty.state.processVariables,
    nullValue.state.processVariables,
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
      kind: "success",
      localPatch: [{
        name: "newLinkId",
        value: { kind: "string", value: "normal" },
      }],
    },
  });

  assert.equal(caught.state.userTaskWaits.length, 1);
  assert.equal(caught.state.endOccurrences, 0);
  assert.equal(wrongAccount.state.userTaskWaits.length, 0);
  assert.equal(wrongAccount.state.endOccurrences, 1);
});

function controlPlace(elementId) {
  return {
    id: `place:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId,
    },
  };
}

function operationBase(elementId) {
  return {
    id: `operation:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId,
    },
  };
}

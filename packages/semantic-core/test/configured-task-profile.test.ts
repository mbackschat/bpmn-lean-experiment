import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CheckedNodeKind,
  CommandOutcome,
  EffectExecutionResultKind,
  EffectOperation,
  EffectProtocol,
  ControlStateKind,
  SemanticOperationKind,
  SemanticCheckpointProfileId,
  SemanticProfileId,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  applyStimulus,
  initialState,
  profileAllowsCheckedProcessShape,
  profileAllowsProgramShape,
  projectOpenEffects,
  projectOpenUserTasks,
  semanticGraphPolicyForProfile,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";

const checkpointProfile = SemanticCheckpointProfileId.ConfiguredTask;
const descriptor = Object.freeze({
  protocol: EffectProtocol.Activity,
  operation: EffectOperation.Probe,
});

const configuredNodes: ReadonlyArray<CheckedNode> = [
  { kind: CheckedNodeKind.NoneStartEvent, id: "StartEvent_1" },
  {
    kind: CheckedNodeKind.ConfiguredTask,
    id: "ConfiguredTask_Probe",
    descriptor,
  },
  { kind: CheckedNodeKind.UserTask, id: "UserTask_Review", name: "Review" },
  { kind: CheckedNodeKind.NoneEndEvent, id: "EndEvent_1" },
] as const;

const configuredProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: checkpointProfile,
    sourceId: "configured-task-process",
    sourceOverlay: null,
    sourceSha256:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
  processId: "Process_ConfiguredTask",
  controlPlaces: [
    controlPlace("Flow_ConfiguredToUser"),
    controlPlace("Flow_StartToConfigured"),
    controlPlace("Flow_UserToEnd"),
  ],
  operations: [
    {
      ...operationBase("ConfiguredTask_Probe"),
      kind: SemanticOperationKind.AwaitEffect,
      input: "place:Flow_StartToConfigured",
      output: "place:Flow_ConfiguredToUser",
      effect: {
        elementId: "ConfiguredTask_Probe",
        descriptor,
        inputMappings: [],
        outputMappings: [],
      },
      bpmnErrorRoute: null,
    },
    {
      ...operationBase("EndEvent_1"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_UserToEnd",
    },
    {
      ...operationBase("StartEvent_1"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToConfigured",
    },
    {
      ...operationBase("UserTask_Review"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_ConfiguredToUser",
      output: "place:Flow_UserToEnd",
      task: { elementId: "UserTask_Review", name: "Review" },
    },
  ],
});

const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-process",
  processId: configuredProgram.processId,
  instanceId: "Instance_1",
  initialVariables: [],
} as const);

test("admits only the exact configured checked and program shape", () => {
  assert.equal(
    profileAllowsCheckedProcessShape(checkpointProfile, configuredNodes, 1),
    true,
  );
  assert.equal(
    profileAllowsProgramShape(
      checkpointProfile,
      configuredProgram.operations,
      configuredProgram.definitionScopes.length,
    ),
    true,
  );
  assert.deepEqual(semanticGraphPolicyForProfile(checkpointProfile), {
    kind: "acyclic",
  });
  assert.equal(supportsSemanticProcessExecution(start, configuredProgram), true);
  assert.equal(
    new Set<string>(Object.values(SemanticProfileId)).has(checkpointProfile),
    false,
  );
});

test("descriptor drift, a Service Task discriminator, and pass-through refuse", () => {
  const configuredNode = configuredNodes[1];
  assert.ok(configuredNode !== undefined);
  assert.equal(profileAllowsCheckedProcessShape(
    checkpointProfile,
    configuredNodes.with(1, {
      ...configuredNode,
      descriptor: { ...descriptor, operation: EffectOperation.MappedSuccess },
    } as CheckedNode),
    1,
  ), false);
  assert.equal(profileAllowsCheckedProcessShape(
    checkpointProfile,
    configuredNodes.with(1, {
      kind: CheckedNodeKind.ServiceTask,
      id: "ConfiguredTask_Probe",
      descriptor,
      inputMappings: [],
      outputMappings: [],
      bpmnErrorRoute: null,
    }),
    1,
  ), false);

  const driftedOperations = configuredProgram.operations.map((operation) =>
    operation.kind === SemanticOperationKind.AwaitEffect
      ? {
          ...operation,
          effect: {
            ...operation.effect,
            descriptor: {
              ...descriptor,
              operation: EffectOperation.MappedSuccess,
            },
          },
        }
      : operation
  );
  assert.equal(profileAllowsProgramShape(
    checkpointProfile,
    driftedOperations,
    1,
  ), false);

  const passThroughProgram = {
    ...configuredProgram,
    operations: configuredProgram.operations
      .filter(({ kind }) => kind !== SemanticOperationKind.AwaitEffect)
      .map((operation) =>
        operation.kind === SemanticOperationKind.AwaitUserTask
          ? { ...operation, input: "place:Flow_StartToConfigured" }
          : operation
      ),
    operationScopes: configuredProgram.operationScopes.filter(
      ({ operationId }) => operationId !== "operation:ConfiguredTask_Probe",
    ),
  } as SemanticProcessProgram;
  assert.equal(supportsSemanticProcessExecution(start, passThroughProgram), false);
  const leaked = applyStimulus(passThroughProgram, initialState, start);
  assert.equal(projectOpenEffects(leaked.state).length, 0);
  assert.equal(projectOpenUserTasks(leaked.state).length, 1);
});

test("specializes existing effect completion and occurrence-only refusal", () => {
  const started = applyStimulus(configuredProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.equal(projectOpenEffects(started.state).length, 1);
  assert.equal(projectOpenUserTasks(started.state).length, 0);

  const effectId = {
    processInstanceId: start.instanceId,
    elementId: "ConfiguredTask_Probe",
    activation: 1,
  };
  const refused = applyStimulus(configuredProgram, started.state, {
    kind: StimulusKind.CompleteEffect,
    commandId: "wrong-effect",
    effectId: { ...effectId, activation: 2 },
    result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
  });
  assert.equal(refused.outcome, CommandOutcome.Rejected);
  assert.deepEqual(refused.state, started.state);

  const effectCompleted = applyStimulus(configuredProgram, started.state, {
    kind: StimulusKind.CompleteEffect,
    commandId: "complete-effect",
    effectId,
    result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
  });
  assert.equal(effectCompleted.outcome, CommandOutcome.Committed);
  assert.equal(projectOpenEffects(effectCompleted.state).length, 0);
  assert.equal(projectOpenUserTasks(effectCompleted.state).length, 1);

  const completed = applyStimulus(configuredProgram, effectCompleted.state, {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-user-task",
    taskId: {
      processInstanceId: start.instanceId,
      elementId: "UserTask_Review",
      activation: 1,
    },
    submittedValues: [],
  });
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.equal(completed.state.control.kind, ControlStateKind.Completed);
});

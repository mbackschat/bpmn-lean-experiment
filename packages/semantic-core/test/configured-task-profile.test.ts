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

const configuredTaskProfile = SemanticProfileId.ConfiguredTask;
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
    semanticProfile: configuredTaskProfile,
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

const effectId = Object.freeze({
  processInstanceId: start.instanceId,
  elementId: "ConfiguredTask_Probe",
  activation: 1,
} as const);

const effectCompletion = Object.freeze({
  kind: StimulusKind.CompleteEffect,
  commandId: "complete-effect",
  effectId,
  result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
} as const);

const userTaskCompletion = Object.freeze({
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-user-task",
  taskId: {
    processInstanceId: start.instanceId,
    elementId: "UserTask_Review",
    activation: 1,
  },
  submittedValues: [],
} as const);

test("admits only the exact configured checked and program shape", () => {
  assert.equal(
    profileAllowsCheckedProcessShape(configuredTaskProfile, configuredNodes, 1),
    true,
  );
  assert.equal(
    profileAllowsProgramShape(
      configuredTaskProfile,
      configuredProgram.operations,
      configuredProgram.definitionScopes.length,
    ),
    true,
  );
  assert.deepEqual(semanticGraphPolicyForProfile(configuredTaskProfile), {
    kind: "acyclic",
  });
  assert.equal(supportsSemanticProcessExecution(start, configuredProgram), true);
  assert.equal(
    new Set<string>(Object.values(SemanticProfileId)).has(configuredTaskProfile),
    true,
  );
});

test("descriptor drift, a Service Task discriminator, and pass-through refuse", () => {
  const configuredNode = configuredNodes[1];
  assert.ok(configuredNode !== undefined);
  assert.equal(profileAllowsCheckedProcessShape(
    configuredTaskProfile,
    configuredNodes.with(1, {
      ...configuredNode,
      descriptor: { ...descriptor, operation: EffectOperation.MappedSuccess },
    } as CheckedNode),
    1,
  ), false);
  assert.equal(profileAllowsCheckedProcessShape(
    configuredTaskProfile,
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
    configuredTaskProfile,
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

  const refused = applyStimulus(configuredProgram, started.state, {
    ...effectCompletion,
    commandId: "wrong-effect",
    effectId: { ...effectId, activation: 2 },
  });
  assert.equal(refused.outcome, CommandOutcome.Rejected);
  assert.deepEqual(refused.state, started.state);

  const effectCompleted = applyStimulus(
    configuredProgram,
    started.state,
    effectCompletion,
  );
  assert.equal(effectCompleted.outcome, CommandOutcome.Committed);
  assert.equal(projectOpenEffects(effectCompleted.state).length, 0);
  assert.equal(projectOpenUserTasks(effectCompleted.state).length, 1);

  const completed = applyStimulus(
    configuredProgram,
    effectCompleted.state,
    userTaskCompletion,
  );
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.equal(completed.state.control.kind, ControlStateKind.Completed);
});

test("locks exact configured Task closure limits and one-smaller overflow", () => {
  assert.equal(
    applyStimulus(configuredProgram, initialState, start, 1)
      .internalStepBoundExceeded,
    true,
  );
  const started = applyStimulus(configuredProgram, initialState, start, 2);
  assert.equal(started.internalStepBoundExceeded, false);
  assert.equal(projectOpenEffects(started.state).length, 1);

  assert.equal(
    applyStimulus(configuredProgram, started.state, effectCompletion, 0)
      .internalStepBoundExceeded,
    true,
  );
  const effectCompleted = applyStimulus(
    configuredProgram,
    started.state,
    effectCompletion,
    1,
  );
  assert.equal(effectCompleted.internalStepBoundExceeded, false);
  assert.equal(projectOpenUserTasks(effectCompleted.state).length, 1);

  assert.equal(
    applyStimulus(
      configuredProgram,
      effectCompleted.state,
      userTaskCompletion,
      1,
    ).internalStepBoundExceeded,
    true,
  );
  const completed = applyStimulus(
    configuredProgram,
    effectCompleted.state,
    userTaskCompletion,
    2,
  );
  assert.equal(completed.internalStepBoundExceeded, false);
  assert.equal(completed.state.control.kind, ControlStateKind.Completed);
});

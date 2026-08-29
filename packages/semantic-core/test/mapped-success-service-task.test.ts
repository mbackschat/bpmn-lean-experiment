import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ControlStateKind,
  EffectExecutionResultKind,
  MappingExpressionKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  addActivityVariableScope,
  advanceScenario,
  applyInternalOperation,
  applyStimulus,
  completeActivityVariableScope,
  createEffectLocalDataOwner,
  enabledInternalOperationCount,
  initialState,
  isStableStateResumable,
  isWellFormedSemanticProcessProgram,
  projectOpenEffects,
  semanticProcessClosureLimit,
} from "@bpmn-lean/semantic-core";
import type {
  EffectExecutionResult,
  RuntimeState,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

type SuccessLocalPatch = Extract<
  EffectExecutionResult,
  { kind: EffectExecutionResultKind.Success }
>["localPatch"];

const program = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile:
      "cibseven-2.0.0-mapped-success-service-task-draft",
    sourceId: "mapped-success-service-task",
    sourceOverlay: null,
    sourceSha256:
      "3b5bcd5167f4d48753f8efede35f47484bddf9c278cc8fe2f4dc87549da26b4a",
  },
  processId: "Process_MappedSuccess",
  controlPlaces: [
    controlPlace("Flow_MappedSuccessToEnd"),
    controlPlace("Flow_StartToMappedSuccess"),
  ],
  operations: [
    {
      ...operationBase("MappedSuccessTask"),
      kind: SemanticOperationKind.AwaitEffect,
      input: "place:Flow_StartToMappedSuccess",
      output: "place:Flow_MappedSuccessToEnd",
      effect: {
        elementId: "MappedSuccessTask",
        descriptor: {
          protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
          operation: "urn:bpmn-lean:effect-operation:mapped-success-v1",
        },
        inputMappings: [
          {
            target: "requestValue",
            expression: {
              kind: MappingExpressionKind.StringLiteral,
              value: "example-input",
            },
          },
        ],
        outputMappings: [
          {
            target: "resultValue",
            expression: {
              kind: MappingExpressionKind.LocalVariable,
              name: "result",
            },
          },
        ],
      },
      bpmnErrorRoute: null,
    },
    {
      ...operationBase("EndEvent_MappedSuccess"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_MappedSuccessToEnd",
    },
    {
      ...operationBase("StartEvent_MappedSuccess"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToMappedSuccess",
    },
  ],
});

const effectId = Object.freeze({
  processInstanceId: "Instance_1",
  elementId: "MappedSuccessTask",
  activation: 1,
});

const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-mapped-success",
  processId: program.processId,
  instanceId: effectId.processInstanceId,
  initialVariables: [],
});

const successResult = Object.freeze({
  kind: EffectExecutionResultKind.Success,
  localPatch: [
    {
      name: "result",
      value: {
        kind: VariableValueKind.String,
        value: "example-result",
      },
    },
  ],
} as const) satisfies EffectExecutionResult;

test("commits the literal input as immutable effect arguments", () => {
  const waiting = applyStimulus(program, initialState, start);

  assert.equal(waiting.outcome, CommandOutcome.Committed);
  assert.deepEqual(projectOpenEffects(waiting.state), [
    {
      id: effectId,
      descriptor: {
        protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
        operation: "urn:bpmn-lean:effect-operation:mapped-success-v1",
      },
      arguments: [
        {
          name: "requestValue",
          value: {
            kind: "string",
            value: "example-input",
          },
        },
      ],
    },
  ]);
  assert.deepEqual(waiting.state.variables, {
    process: { bindings: [] },
    activities: [{
      owner: createEffectLocalDataOwner(effectId),
      bindings: [{
        name: "requestValue",
        value: {
          kind: VariableValueKind.String,
          value: "example-input",
        },
      }],
    }],
  });
});

test("maps one successful local patch into Process scope and removes local state", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const completed = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "complete-mapped-success",
    effectId,
    result: successResult,
  });

  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(completed.state.effectWaits, []);
  assert.deepEqual(completed.state.variables, {
    process: {
      bindings: [{
        name: "resultValue",
        value: {
          kind: "string",
          value: "example-result",
        },
      }],
    },
    activities: [],
  });

  const hostOwnedMappingMutation = {
    ...waiting,
    variables: {
      process: {
        bindings: successResult.localPatch,
      },
      activities: [],
    },
    effectWaits: [],
  };
  assert.deepEqual(hostOwnedMappingMutation.variables.process.bindings, [
    {
      name: "result",
      value: {
        kind: "string",
        value: "example-result",
      },
    },
  ]);
  assert.notDeepEqual(
    hostOwnedMappingMutation.variables.process.bindings,
    completed.state.variables.process.bindings,
  );
});

test("rejects every malformed patch with exact state preservation", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  // `kind: "number"` is not a `VariableValueKind` member, so the malformed
  // cases stay outside the compile-time contract on purpose: the semantic core
  // must reject them at runtime rather than the compiler rejecting the test.
  const malformed: ReadonlyArray<unknown> = [
    [],
    [
      ...successResult.localPatch,
      {
        name: "extra",
        value: { kind: "string", value: "extra" },
      },
    ],
    [
      {
        name: "wrongName",
        value: { kind: "string", value: "example-result" },
      },
    ],
    [
      ...successResult.localPatch,
      ...successResult.localPatch,
    ],
    [
      {
        name: "result",
        value: { kind: "number", value: 42 },
      },
    ],
    [
      {
        name: "result",
        value: { kind: "null" },
      },
    ],
  ];

  for (const [index, localPatch] of malformed.entries()) {
    const rejected = applyStimulus(program, waiting, {
      kind: StimulusKind.CompleteEffect,
      commandId: `reject-patch-${index}`,
      effectId,
      result: {
        kind: EffectExecutionResultKind.Success,
        localPatch: localPatch as SuccessLocalPatch,
      },
    });
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, waiting);
  }
});

test("keys local scopes by complete occurrence and removes only the matching owner", () => {
  const secondOwner = {
    ...effectId,
    activation: 2,
  };
  const arguments_ = [{
    name: "requestValue",
    value: {
      kind: VariableValueKind.String,
      value: "example-input",
    },
  }] as const;
  const withFirst = addActivityVariableScope(
    initialState.variables,
    effectId,
    arguments_,
  );
  const withBoth = addActivityVariableScope(
    withFirst,
    secondOwner,
    arguments_,
  );
  const effectOperation = program.operations.find(
    (operation) => operation.kind === SemanticOperationKind.AwaitEffect,
  );
  assert.ok(
    effectOperation?.kind === SemanticOperationKind.AwaitEffect,
  );

  const completed = completeActivityVariableScope(
    withBoth,
    effectId,
    effectOperation.effect.outputMappings,
    successResult.localPatch,
    false,
  );

  assert.deepEqual(completed, {
    process: {
      bindings: [{
        name: "resultValue",
        value: {
          kind: VariableValueKind.String,
          value: "example-result",
        },
      }],
    },
    activities: [{
      owner: createEffectLocalDataOwner(secondOwner),
      bindings: arguments_,
    }],
  });
  assert.throws(
    () => addActivityVariableScope(withBoth, effectId, arguments_),
    /owner must be unique/,
  );
  assert.equal(
    completeActivityVariableScope(
      {
        ...withFirst,
        activities: [
          ...withFirst.activities,
          ...withFirst.activities,
        ],
      },
      effectId,
      effectOperation.effect.outputMappings,
      successResult.localPatch,
      false,
    ),
    null,
  );
});

test("rejects completion when the complete occurrence has no owned local scope", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const missingOwner = {
    ...waiting,
    variables: {
      ...waiting.variables,
      activities: [],
    },
  };

  const rejected = applyStimulus(program, missingOwner, {
    kind: StimulusKind.CompleteEffect,
    commandId: "missing-local-owner",
    effectId,
    result: successResult,
  });

  assert.equal(rejected.outcome, CommandOutcome.Rejected);
  assert.deepEqual(rejected.state, missingOwner);
});

test("keeps private local bindings outside canonical observations", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const activity = waiting.variables.activities[0];
  assert.ok(activity !== undefined);
  const withPrivateLocal: RuntimeState = {
    ...waiting,
    variables: {
      ...waiting.variables,
      activities: [{
        ...activity,
        bindings: [
          ...activity.bindings,
          {
            name: "privateOnly",
            value: {
              kind: VariableValueKind.String,
              value: "secret",
            },
          },
        ],
      }],
    },
  };

  assert.deepEqual(
    projectOpenEffects(withPrivateLocal),
    projectOpenEffects(waiting),
  );
  const rejected = advanceScenario(program, withPrivateLocal, {
    kind: StimulusKind.CompleteEffect,
    commandId: "wrong-private-observation",
    effectId: { ...effectId, activation: 2 },
    result: successResult,
  });
  const observation = rejected.observations.find(
    (candidate) => candidate.kind === CanonicalObservationKind.State,
  );
  assert.ok(observation?.kind === CanonicalObservationKind.State);
  assert.deepEqual(observation.variables, []);
});

test("does not add closure steps or make enabledness depend on scoped data", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(semanticProcessClosureLimit, 8);
  assert.equal(
    applyStimulus(program, initialState, start, 2)
      .internalStepBoundExceeded,
    false,
  );
  assert.equal(
    applyStimulus(program, initialState, start, 1)
      .internalStepBoundExceeded,
    true,
  );

  const beforeClosure: RuntimeState = {
    ...initialState,
    control: {
      kind: ControlStateKind.Running,
      instanceId: effectId.processInstanceId,
    },
    controlTokens: [{
      placeId: "place:Flow_StartToMappedSuccess",
      owner: rootScopeOccurrence(program.processId, effectId.processInstanceId),
      multiplicity: 1,
    }],
    scopeOccurrences: [{
      id: rootScopeOccurrence(program.processId, effectId.processInstanceId),
      parent: null,
    }],
  };
  const withUnrelatedData = {
    ...beforeClosure,
    variables: addActivityVariableScope(
      beforeClosure.variables,
      { ...effectId, elementId: "OtherEffect" },
      [],
    ),
  };
  const enabledPattern = (state: RuntimeState) =>
    program.operations.map(
      (operation) => applyInternalOperation(program, operation, state) !== null,
    );

  assert.deepEqual(
    enabledPattern(withUnrelatedData),
    enabledPattern(beforeClosure),
  );
  assert.equal(enabledInternalOperationCount(program, beforeClosure), 1);

  const stableWait = applyStimulus(program, initialState, start);
  assert.equal(stableWait.internalStepBoundExceeded, false);
  assert.equal(enabledInternalOperationCount(program, stableWait.state), 0);
  assert.equal(isStableStateResumable(stableWait.state), true);
});

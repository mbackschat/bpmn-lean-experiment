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
  initialState,
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
    semanticProfile: "cibseven-2.0.0-a12-create-document-draft",
    sourceId: "a12-create-document-data",
    sourceSha256:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
  processId: "Process_A12CreateDocument",
  controlPlaces: [
    controlPlace("Flow_CreateToEnd"),
    controlPlace("Flow_StartToCreate"),
  ],
  operations: [
    {
      ...operationBase("CreateDocument"),
      kind: SemanticOperationKind.AwaitEffect,
      input: "place:Flow_StartToCreate",
      output: "place:Flow_CreateToEnd",
      effect: {
        elementId: "CreateDocument",
        descriptor: {
          protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
          operation: "urn:bpmn-lean:effect-operation:mapped-success-v1",
        },
        inputMappings: [
          {
            target: "documentModelName",
            expression: {
              kind: MappingExpressionKind.StringLiteral,
              value: "MyDocumentModel",
            },
          },
        ],
        outputMappings: [
          {
            target: "myDocumentReference",
            expression: {
              kind: MappingExpressionKind.LocalVariable,
              name: "newDocRef",
            },
          },
        ],
      },
      bpmnErrorRoute: null,
    },
    {
      ...operationBase("EndEvent_CreateDocument"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_CreateToEnd",
    },
    {
      ...operationBase("StartEvent_CreateDocument"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToCreate",
    },
  ],
});

const effectId = Object.freeze({
  processInstanceId: "Instance_1",
  elementId: "CreateDocument",
  activation: 1,
});

const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-create-document",
  processId: program.processId,
  instanceId: effectId.processInstanceId,
  initialVariables: [],
});

const successResult = Object.freeze({
  kind: EffectExecutionResultKind.Success,
  localPatch: [
    {
      name: "newDocRef",
      value: {
        kind: VariableValueKind.String,
        value: "Document:42",
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
          name: "documentModelName",
          value: {
            kind: "string",
            value: "MyDocumentModel",
          },
        },
      ],
    },
  ]);
  assert.deepEqual(waiting.state.variables, {
    process: { bindings: [] },
    activities: [{
      owner: effectId,
      bindings: [{
        name: "documentModelName",
        value: {
          kind: VariableValueKind.String,
          value: "MyDocumentModel",
        },
      }],
    }],
  });
});

test("maps one successful local patch into Process scope and removes local state", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const completed = applyStimulus(program, waiting, {
    kind: StimulusKind.CompleteEffect,
    commandId: "complete-create-document",
    effectId,
    result: successResult,
  });

  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(completed.state.effectWaits, []);
  assert.deepEqual(completed.state.variables, {
    process: {
      bindings: [{
        name: "myDocumentReference",
        value: {
          kind: "string",
          value: "Document:42",
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
      name: "newDocRef",
      value: {
        kind: "string",
        value: "Document:42",
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
        value: { kind: "string", value: "Document:42" },
      },
    ],
    [
      ...successResult.localPatch,
      ...successResult.localPatch,
    ],
    [
      {
        name: "newDocRef",
        value: { kind: "number", value: 42 },
      },
    ],
    [
      {
        name: "newDocRef",
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
    name: "documentModelName",
    value: {
      kind: VariableValueKind.String,
      value: "MyDocumentModel",
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
        name: "myDocumentReference",
        value: {
          kind: VariableValueKind.String,
          value: "Document:42",
        },
      }],
    },
    activities: [{
      owner: secondOwner,
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
  const withPrivateLocal = {
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
      placeId: "place:Flow_StartToCreate",
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
});

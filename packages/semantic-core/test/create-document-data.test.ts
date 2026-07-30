import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  EffectExecutionResultKind,
  MappingExpressionKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  applyStimulus,
  initialState,
  projectOpenEffects,
} from "@bpmn-lean/semantic-core";
import type {
  EffectExecutionResult,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";

type SuccessLocalPatch = Extract<
  EffectExecutionResult,
  { kind: EffectExecutionResultKind.Success }
>["localPatch"];

const program: SemanticProcessProgram = {
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
      kind: SemanticOperationKind.Terminate,
      input: "place:Flow_CreateToEnd",
    },
    {
      ...operationBase("StartEvent_CreateDocument"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToCreate",
    },
  ],
};

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
  assert.deepEqual(waiting.state.processVariables, []);
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
  assert.deepEqual(completed.state.processVariables, [
    {
      name: "myDocumentReference",
      value: {
        kind: "string",
        value: "Document:42",
      },
    },
  ]);

  const hostOwnedMappingMutation = {
    ...waiting,
    effectWaits: [],
    processVariables: successResult.localPatch,
  };
  assert.deepEqual(hostOwnedMappingMutation.processVariables, [
    {
      name: "newDocRef",
      value: {
        kind: "string",
        value: "Document:42",
      },
    },
  ]);
  assert.notDeepEqual(
    hostOwnedMappingMutation.processVariables,
    completed.state.processVariables,
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

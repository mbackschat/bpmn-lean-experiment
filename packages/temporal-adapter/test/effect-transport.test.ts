/**
 * Specifies the effect transport boundary independently of Temporal host identity.
 *
 * The semantic core owns structured material. The adapter owns domain-separated canonical
 * encodings and deterministic digests. Pairwise and omission mutations guard every identity field.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EffectExecutionResultKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  EffectExecutionResult,
  EffectOccurrenceId,
  EffectTransportMaterial,
} from "@bpmn-lean/semantic-core";
import {
  EffectExecutionSchedule,
  EffectProbeStore,
  canonicalCompleteEffectEncoding,
  canonicalEffectTransportEncoding,
  completeEffectCommandId,
  completeEffectStimulus,
  deterministicSha256Hex,
  effectTransportKey,
} from "@bpmn-lean/temporal-adapter";
import type { EffectRequest } from "@bpmn-lean/temporal-adapter";

/** The three transport-material groups whose fields must each be identifying. */
type MaterialGroup = "definition" | "occurrence" | "descriptor";

/** One field mutation plus the group and field name it exercises. */
type IdentityMutation = Readonly<{
  group: MaterialGroup;
  field: string;
  mutate: (base: EffectTransportMaterial) => EffectTransportMaterial;
}>;

/** One completed effect as the adapter submits it. */
type EffectCompletion = Readonly<{
  effectId: EffectOccurrenceId;
  result: EffectExecutionResult;
}>;

const material: EffectTransportMaterial = Object.freeze({
  definition: {
    semanticProfile: "cibseven-2.2.0-service-task-effect-draft",
    sourceId: "service-task-effect-process",
    sourceSha256:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    sourceOverlay: null,
    processId: "Process_ServiceTaskEffect",
  },
  occurrence: {
    processInstanceId: "Instance_1",
    elementId: "ServiceTask_Record",
    activation: 1,
  },
  descriptor: {
    protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
    operation: "urn:bpmn-lean:effect-operation:probe-v1",
  },
  arguments: [],
});
const mappedSuccessMaterial: EffectTransportMaterial = Object.freeze({
  definition: {
    semanticProfile: "cibseven-2.0.0-mapped-success-service-task-draft",
    sourceId: "mapped-success-service-task",
    sourceSha256:
      "3b5bcd5167f4d48753f8efede35f47484bddf9c278cc8fe2f4dc87549da26b4a",
    sourceOverlay: null,
    processId: "Process_MappedSuccess",
  },
  occurrence: {
    processInstanceId: "Instance_1",
    elementId: "MappedSuccessTask",
    activation: 1,
  },
  descriptor: {
    protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
    operation: "urn:bpmn-lean:effect-operation:mapped-success-v1",
  },
  arguments: [
    {
      name: "requestValue",
      value: { kind: VariableValueKind.String, value: "example-input" },
    },
  ],
});
const mappedSuccessResult = Object.freeze({
  kind: EffectExecutionResultKind.Success,
  localPatch: [
    {
      name: "result",
      value: { kind: VariableValueKind.String, value: "example-result" },
    },
  ],
} as const) satisfies EffectExecutionResult;
const boundaryErrorResult = Object.freeze({
  kind: EffectExecutionResultKind.BpmnError,
  code: "MappedBusinessError",
  message: "mapped business error",
  localPatch: [{
    name: "result",
    value: { kind: VariableValueKind.Null },
  }],
} as const) satisfies EffectExecutionResult;

test("encodes and digests the complete committed effect intent", () => {
  const result = {
    kind: EffectExecutionResultKind.Success,
    localPatch: [],
  } as const satisfies EffectExecutionResult;
  assert.equal(
    canonicalEffectTransportEncoding(material),
    '["effectTransport",["cibseven-2.2.0-service-task-effect-draft","service-task-effect-process","0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",["none"],"Process_ServiceTaskEffect"],["Instance_1","ServiceTask_Record",1],["urn:bpmn-lean:effect-protocol:activity-v1","urn:bpmn-lean:effect-operation:probe-v1"],[]]',
  );
  assert.equal(
    effectTransportKey(material),
    "effect-transport-sha256:6a0d33e4736128bd026bb67edd3965fda477f87d8b8b26fae085ac92e3ff88a8",
  );
  assert.equal(
    canonicalCompleteEffectEncoding(material.occurrence, result),
    '["completeEffect",["Instance_1","ServiceTask_Record",1],["success",[]]]',
  );
  assert.equal(
    completeEffectCommandId(material.occurrence, result),
    "complete-effect-sha256:64b75e53c74d30141f8c4e05db4cea269453a6cecdd09e190d1943f029797e5e",
  );
  assert.deepEqual(completeEffectStimulus(material.occurrence, result), {
    kind: StimulusKind.CompleteEffect,
    commandId: completeEffectCommandId(material.occurrence, result),
    effectId: material.occurrence,
    result,
  });
  assert.notEqual(
    effectTransportKey(material).split(":")[1],
    completeEffectCommandId(material.occurrence, result).split(":")[1],
  );
});

test("content-binds mapped-success arguments and typed result bytes", () => {
  assert.equal(
    canonicalEffectTransportEncoding(mappedSuccessMaterial),
    '["effectTransport",["cibseven-2.0.0-mapped-success-service-task-draft","mapped-success-service-task","3b5bcd5167f4d48753f8efede35f47484bddf9c278cc8fe2f4dc87549da26b4a",["none"],"Process_MappedSuccess"],["Instance_1","MappedSuccessTask",1],["urn:bpmn-lean:effect-protocol:activity-v1","urn:bpmn-lean:effect-operation:mapped-success-v1"],[["requestValue",["string","example-input"]]]]',
  );
  assert.equal(
    effectTransportKey(mappedSuccessMaterial),
    "effect-transport-sha256:a912114769a249d963940223231dace25c9985397f63a90972ac1d64da31f384",
  );
  assert.equal(
    canonicalCompleteEffectEncoding(
      mappedSuccessMaterial.occurrence,
      mappedSuccessResult,
    ),
    '["completeEffect",["Instance_1","MappedSuccessTask",1],["success",[["result",["string","example-result"]]]]]',
  );
  assert.equal(
    completeEffectCommandId(
      mappedSuccessMaterial.occurrence,
      mappedSuccessResult,
    ),
    "complete-effect-sha256:800f7d60cbcbc6663c0d4aed7ccacb643951d3075836188b96083ee2cba1c22a",
  );
});

test("domain-separates the exact typed BPMN Error result", () => {
  const occurrence: EffectOccurrenceId = {
    processInstanceId: "Instance_1",
    elementId: "MappedBoundaryEffectTask",
    activation: 1,
  };
  assert.equal(
    canonicalCompleteEffectEncoding(occurrence, boundaryErrorResult),
    '["completeEffect",["Instance_1","MappedBoundaryEffectTask",1],["bpmnError","MappedBusinessError",["some","mapped business error"],[["result",["null"]]]]]',
  );
  assert.equal(
    completeEffectCommandId(occurrence, boundaryErrorResult),
    "complete-effect-sha256:937f7a5c5565cde928afe3526bc64fc80c1ddb34281a0e8a259ae5ac6af2ec2e",
  );

  const variants: ReadonlyArray<EffectExecutionResult> = [
    { ...boundaryErrorResult, code: "UnmatchedMappedBusinessError" },
    { ...boundaryErrorResult, message: null },
    { ...boundaryErrorResult, message: "" },
    { ...boundaryErrorResult, localPatch: [] },
    {
      ...boundaryErrorResult,
      localPatch: [{
        name: "result",
        value: { kind: VariableValueKind.String, value: "" },
      }],
    },
  ];
  for (const variant of variants) {
    assert.notEqual(
      completeEffectCommandId(occurrence, boundaryErrorResult),
      completeEffectCommandId(occurrence, variant),
    );
  }
});

test("argument and result omission mutations collapse discriminating pairs", () => {
  const otherArguments: EffectTransportMaterial = {
    ...mappedSuccessMaterial,
    arguments: [
      {
        name: "requestValue",
        value: {
          kind: VariableValueKind.String,
          value: "other-input",
        },
      },
    ],
  };
  assert.notEqual(
    effectTransportKey(mappedSuccessMaterial),
    effectTransportKey(otherArguments),
  );
  assert.throws(
    () =>
      requireDistinctTransportKeys(
        mappedSuccessMaterial,
        otherArguments,
        effectTransportKeyWithoutArguments,
        "arguments",
      ),
    /arguments transport identity mutation collapsed/u,
  );

  const otherResult: EffectExecutionResult = {
    kind: EffectExecutionResultKind.Success,
    localPatch: [
      {
        name: "result",
        value: {
          kind: VariableValueKind.String,
          value: "other-result",
        },
      },
    ],
  };
  assert.notEqual(
    completeEffectCommandId(
      mappedSuccessMaterial.occurrence,
      mappedSuccessResult,
    ),
    completeEffectCommandId(
      mappedSuccessMaterial.occurrence,
      otherResult,
    ),
  );
  assert.throws(
    () =>
      requireDistinctTransportKeys(
        {
          effectId: mappedSuccessMaterial.occurrence,
          result: mappedSuccessResult,
        },
        {
          effectId: mappedSuccessMaterial.occurrence,
          result: otherResult,
        },
        completeEffectCommandIdWithoutResult,
        "result",
      ),
    /result transport identity mutation collapsed/u,
  );
});

const identityMutations: ReadonlyArray<IdentityMutation> = [
  {
    group: "definition",
    field: "semanticProfile",
    mutate: (base) => ({
      ...base,
      definition: { ...base.definition, semanticProfile: "other-profile" },
    }),
  },
  {
    group: "definition",
    field: "sourceId",
    mutate: (base) => ({
      ...base,
      definition: { ...base.definition, sourceId: "other-source" },
    }),
  },
  {
    group: "definition",
    field: "sourceSha256",
    mutate: (base) => ({
      ...base,
      definition: { ...base.definition, sourceSha256: "f".repeat(64) },
    }),
  },
  {
    group: "definition",
    field: "sourceOverlay",
    mutate: (base) => ({
      ...base,
      definition: {
        ...base.definition,
        sourceOverlay: {
          id: "alternate-source-binding",
          sha256: "b".repeat(64),
        },
      },
    }),
  },
  {
    group: "definition",
    field: "processId",
    mutate: (base) => ({
      ...base,
      definition: { ...base.definition, processId: "Other_Process" },
    }),
  },
  {
    group: "occurrence",
    field: "processInstanceId",
    mutate: (base) => ({
      ...base,
      occurrence: { ...base.occurrence, processInstanceId: "Instance_2" },
    }),
  },
  {
    group: "occurrence",
    field: "elementId",
    mutate: (base) => ({
      ...base,
      occurrence: { ...base.occurrence, elementId: "Other_Effect" },
    }),
  },
  {
    group: "occurrence",
    field: "activation",
    mutate: (base) => ({
      ...base,
      occurrence: { ...base.occurrence, activation: 2 },
    }),
  },
  {
    group: "descriptor",
    field: "protocol",
    mutate: (base) => ({
      ...base,
      descriptor: {
        ...base.descriptor,
        protocol: "urn:bpmn-lean:effect-protocol:other-v1",
      },
    }),
  },
  {
    group: "descriptor",
    field: "operation",
    mutate: (base) => ({
      ...base,
      descriptor: {
        ...base.descriptor,
        operation: "urn:bpmn-lean:effect-operation:mapped-success-v1",
      },
    }),
  },
];

/** The retained field-drop pairs whose omitted-field projection must collide. */
const droppedFieldDiscriminators: ReadonlyArray<IdentityMutation> =
  identityMutations.filter(
    ({ group, field }) =>
      (group === "definition" &&
        (field === "processId" || field === "sourceOverlay")) ||
      group === "occurrence",
  );

test("varies every definition, occurrence, and descriptor field", () => {
  for (const { group, field, mutate } of identityMutations) {
    assert.notEqual(
      effectTransportKey(material),
      effectTransportKey(mutate(material)),
      `${group}.${field} must participate in transport identity`,
    );
  }
});

test("retained field-drop mutations collide on constructed pairs", () => {
  for (const { group, field, mutate } of droppedFieldDiscriminators) {
    assert.throws(
      () =>
        requireDistinctTransportKeys(
          material,
          mutate(material),
          (candidate) =>
            effectTransportKeyWithOmittedField(candidate, group, field),
          `${group}.${field}`,
        ),
      new RegExp(`${group}\\.${field}`),
    );
  }
});

test("isolates ordinary probe stores and reconciles one lost completion", async () => {
  const plainStore = new EffectProbeStore();
  plainStore.requireEmpty();
  assert.deepEqual(
    await plainStore.execute(
      effectRequest(material),
      EffectExecutionSchedule.PlainSuccess,
    ),
    { kind: "success", localPatch: [] },
  );
  assert.deepEqual(plainStore.evidence(), {
    invocations: 1,
    mutations: 1,
    keys: [effectTransportKey(material)],
  });

  const retryStore = new EffectProbeStore();
  retryStore.requireEmpty();
  await assert.rejects(
    retryStore.execute(
      effectRequest(material),
      EffectExecutionSchedule.FailAfterMutationOnce,
    ),
    /after external mutation/u,
  );
  assert.deepEqual(
    await retryStore.execute(
      effectRequest(material),
      EffectExecutionSchedule.FailAfterMutationOnce,
    ),
    { kind: "success", localPatch: [] },
  );
  assert.deepEqual(retryStore.evidence(), {
    invocations: 2,
    mutations: 1,
    keys: [effectTransportKey(material)],
  });
  assert.throws(
    () => retryStore.requireEmpty(),
    /must be empty/u,
  );
});

test("two semantic Process instances remain distinct in one shared store", async () => {
  const sharedStore = new EffectProbeStore();
  const second = {
    ...material,
    occurrence: {
      ...material.occurrence,
      processInstanceId: "Instance_2",
    },
  };

  sharedStore.requireEmpty();
  await sharedStore.execute(
    effectRequest(material),
    EffectExecutionSchedule.PlainSuccess,
  );
  await sharedStore.execute(
    effectRequest(second),
    EffectExecutionSchedule.PlainSuccess,
  );
  assert.deepEqual(sharedStore.evidence(), {
    invocations: 2,
    mutations: 2,
    keys: [
      effectTransportKey(material),
      effectTransportKey(second),
    ].sort(),
  });
});

test("host-derived attempt identity defeats lost-completion reconciliation", async () => {
  const store = new EffectProbeStore();
  const baseRequest = effectRequest(material);

  await assert.rejects(
    store.execute(
      {
        ...baseRequest,
        idempotencyKey: hostDerivedKey(baseRequest.idempotencyKey, 1),
      },
      EffectExecutionSchedule.FailAfterMutationOnce,
    ),
    /after external mutation/u,
  );
  await assert.rejects(
    store.execute(
      {
        ...baseRequest,
        idempotencyKey: hostDerivedKey(baseRequest.idempotencyKey, 2),
      },
      EffectExecutionSchedule.FailAfterMutationOnce,
    ),
    /after external mutation/u,
  );
  assert.equal(store.evidence().mutations, 2);
});

function effectRequest(value: EffectTransportMaterial): EffectRequest {
  return {
    ...value.descriptor,
    idempotencyKey: effectTransportKey(value),
    arguments: value.arguments,
  };
}

function hostDerivedKey(baseKey: string, attempt: number): string {
  return `effect-transport-sha256:${
    deterministicSha256Hex(`${baseKey}:attempt-${attempt}`)
  }`;
}

function requireDistinctTransportKeys<Value>(
  left: Value,
  right: Value,
  deriveKey: (value: Value) => string,
  label: string,
): void {
  assert.notEqual(
    deriveKey(left),
    deriveKey(right),
    `${label} transport identity mutation collapsed`,
  );
}

/**
 * Projects a transport key that omits one identity field.
 *
 * This is a deliberately defective encoding retained as a seeded mutation: the
 * pair it is applied to must collide so the real encoding stays discriminating.
 */
function effectTransportKeyWithOmittedField(
  value: EffectTransportMaterial,
  group: MaterialGroup,
  field: string,
): string {
  const withoutField = Object.values(
    Object.fromEntries(
      Object.entries(value[group]).filter(([name]) => name !== field),
    ),
  );
  return JSON.stringify([
    "effectTransport",
    group === "definition" ? withoutField : Object.values(value.definition),
    group === "occurrence" ? withoutField : Object.values(value.occurrence),
    Object.values(value.descriptor),
    value.arguments,
  ]);
}

function effectTransportKeyWithoutArguments(
  value: EffectTransportMaterial,
): string {
  return JSON.stringify([
    "effectTransport",
    Object.values(value.definition),
    Object.values(value.occurrence),
    Object.values(value.descriptor),
  ]);
}

function completeEffectCommandIdWithoutResult(
  completion: EffectCompletion,
): string {
  return JSON.stringify([
    "completeEffect",
    Object.values(completion.effectId),
  ]);
}

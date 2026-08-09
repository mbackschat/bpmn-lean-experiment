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
const createDocumentMaterial: EffectTransportMaterial = Object.freeze({
  definition: {
    semanticProfile: "cibseven-2.0.0-a12-create-document-draft",
    sourceId: "a12-create-document-data",
    sourceSha256:
      "34b2b2e6592e04d0d5821099b4deca9ddb84b12fb349ce16abee656a79849b13",
    processId: "Process_A12CreateDocument",
  },
  occurrence: {
    processInstanceId: "Instance_1",
    elementId: "CreateDocument",
    activation: 1,
  },
  descriptor: {
    protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
    operation: "urn:bpmn-lean:effect-operation:mapped-success-v1",
  },
  arguments: [
    {
      name: "documentModelName",
      value: { kind: VariableValueKind.String, value: "MyDocumentModel" },
    },
  ],
});
const createDocumentResult = Object.freeze({
  kind: EffectExecutionResultKind.Success,
  localPatch: [
    {
      name: "newDocRef",
      value: { kind: VariableValueKind.String, value: "Document:42" },
    },
  ],
} as const) satisfies EffectExecutionResult;
const boundaryErrorResult = Object.freeze({
  kind: EffectExecutionResultKind.BpmnError,
  code: "LinkLimitReachedError",
  message: "Link limit reached",
  localPatch: [{
    name: "newLinkId",
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
    '["effectTransport",["cibseven-2.2.0-service-task-effect-draft","service-task-effect-process","0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","Process_ServiceTaskEffect"],["Instance_1","ServiceTask_Record",1],["urn:bpmn-lean:effect-protocol:activity-v1","urn:bpmn-lean:effect-operation:probe-v1"],[]]',
  );
  assert.equal(
    effectTransportKey(material),
    "effect-transport-sha256:ddf0be90e3c504ba65452cc6961647f9e6e041cbaac08a707b006e42bf9cacf7",
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

test("content-binds CreateDocument arguments and typed result bytes", () => {
  assert.equal(
    canonicalEffectTransportEncoding(createDocumentMaterial),
    '["effectTransport",["cibseven-2.0.0-a12-create-document-draft","a12-create-document-data","34b2b2e6592e04d0d5821099b4deca9ddb84b12fb349ce16abee656a79849b13","Process_A12CreateDocument"],["Instance_1","CreateDocument",1],["urn:bpmn-lean:effect-protocol:activity-v1","urn:bpmn-lean:effect-operation:mapped-success-v1"],[["documentModelName",["string","MyDocumentModel"]]]]',
  );
  assert.equal(
    effectTransportKey(createDocumentMaterial),
    "effect-transport-sha256:0c53e91ee1ad870c4a37f45d216157ac47045080885cd444b7d1612b205ffbfd",
  );
  assert.equal(
    canonicalCompleteEffectEncoding(
      createDocumentMaterial.occurrence,
      createDocumentResult,
    ),
    '["completeEffect",["Instance_1","CreateDocument",1],["success",[["newDocRef",["string","Document:42"]]]]]',
  );
  assert.equal(
    completeEffectCommandId(
      createDocumentMaterial.occurrence,
      createDocumentResult,
    ),
    "complete-effect-sha256:f596120e7c23b39e80a25da929e64ee8c5a311a0f8281a132833d6afd33f4c88",
  );
});

test("domain-separates the exact typed BPMN Error result", () => {
  const occurrence: EffectOccurrenceId = {
    processInstanceId: "Instance_1",
    elementId: "CreateRelationshipLinkTask",
    activation: 1,
  };
  assert.equal(
    canonicalCompleteEffectEncoding(occurrence, boundaryErrorResult),
    '["completeEffect",["Instance_1","CreateRelationshipLinkTask",1],["bpmnError","LinkLimitReachedError",["some","Link limit reached"],[["newLinkId",["null"]]]]]',
  );
  assert.equal(
    completeEffectCommandId(occurrence, boundaryErrorResult),
    "complete-effect-sha256:49ddf71a5f8e23b59c039a65bd64a2ed16232c31a47790b2273e1b05c3c971d5",
  );

  const variants: ReadonlyArray<EffectExecutionResult> = [
    { ...boundaryErrorResult, code: "RelationshipLinkageError" },
    { ...boundaryErrorResult, message: null },
    { ...boundaryErrorResult, message: "" },
    { ...boundaryErrorResult, localPatch: [] },
    {
      ...boundaryErrorResult,
      localPatch: [{
        name: "newLinkId",
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
    ...createDocumentMaterial,
    arguments: [
      {
        name: "documentModelName",
        value: {
          kind: VariableValueKind.String,
          value: "OtherDocumentModel",
        },
      },
    ],
  };
  assert.notEqual(
    effectTransportKey(createDocumentMaterial),
    effectTransportKey(otherArguments),
  );
  assert.throws(
    () =>
      requireDistinctTransportKeys(
        createDocumentMaterial,
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
        name: "newDocRef",
        value: {
          kind: VariableValueKind.String,
          value: "Document:other",
        },
      },
    ],
  };
  assert.notEqual(
    completeEffectCommandId(
      createDocumentMaterial.occurrence,
      createDocumentResult,
    ),
    completeEffectCommandId(
      createDocumentMaterial.occurrence,
      otherResult,
    ),
  );
  assert.throws(
    () =>
      requireDistinctTransportKeys(
        {
          effectId: createDocumentMaterial.occurrence,
          result: createDocumentResult,
        },
        {
          effectId: createDocumentMaterial.occurrence,
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
      (group === "definition" && field === "processId") ||
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

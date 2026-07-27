/**
 * Specifies the effect transport boundary independently of Temporal host identity.
 *
 * The semantic core owns structured material. The adapter owns domain-separated canonical
 * encodings and deterministic digests. Pairwise and omission mutations guard every identity field.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EffectExecutionSchedule,
  EffectProbeStore,
  canonicalCompleteEffectEncoding,
  canonicalEffectTransportEncoding,
  completeEffectCommandId,
  completeEffectStimulus,
  deterministicSha256Hex,
  effectTransportKey,
} from "../dist/index.js";

const material = Object.freeze({
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
    protocol: "urn:bpmn-lean:effect:probe-v1",
    handler: "bpmnLeanEffectHandler",
  },
  arguments: [],
});
const createDocumentMaterial = Object.freeze({
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
    protocol: "urn:bpmn-lean:a12-delegate:v1",
    handler: "createDocumentDelegate",
  },
  arguments: [
    {
      name: "documentModelName",
      value: { kind: "string", value: "MyDocumentModel" },
    },
  ],
});
const createDocumentResult = Object.freeze({
  kind: "success",
  localPatch: [
    {
      name: "newDocRef",
      value: { kind: "string", value: "Document:42" },
    },
  ],
});

test("encodes and digests the complete committed effect intent", () => {
  const result = { kind: "success", localPatch: [] };
  assert.equal(
    canonicalEffectTransportEncoding(material),
    '["effectTransport",["cibseven-2.2.0-service-task-effect-draft","service-task-effect-process","0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","Process_ServiceTaskEffect"],["Instance_1","ServiceTask_Record",1],["urn:bpmn-lean:effect:probe-v1","bpmnLeanEffectHandler"],[]]',
  );
  assert.equal(
    effectTransportKey(material),
    "effect-transport-sha256:c26d9095cbca0dd542631ac07a4271cef739265d1357c1a6225c3c8b47d06713",
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
    kind: "completeEffect",
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
    '["effectTransport",["cibseven-2.0.0-a12-create-document-draft","a12-create-document-data","34b2b2e6592e04d0d5821099b4deca9ddb84b12fb349ce16abee656a79849b13","Process_A12CreateDocument"],["Instance_1","CreateDocument",1],["urn:bpmn-lean:a12-delegate:v1","createDocumentDelegate"],[["documentModelName",["string","MyDocumentModel"]]]]',
  );
  assert.equal(
    effectTransportKey(createDocumentMaterial),
    "effect-transport-sha256:a0698192512794db66d09219648fca793f8354719af59eafb990262e107ba76e",
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

test("argument and result omission mutations collapse discriminating pairs", () => {
  const otherArguments = {
    ...createDocumentMaterial,
    arguments: [
      {
        name: "documentModelName",
        value: { kind: "string", value: "OtherDocumentModel" },
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

  const otherResult = {
    kind: "success",
    localPatch: [
      {
        name: "newDocRef",
        value: { kind: "string", value: "Document:other" },
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

test("varies every definition, occurrence, and descriptor field", () => {
  const mutations = [
    ["definition", "semanticProfile", "other-profile"],
    ["definition", "sourceId", "other-source"],
    ["definition", "sourceSha256", "f".repeat(64)],
    ["definition", "processId", "Other_Process"],
    ["occurrence", "processInstanceId", "Instance_2"],
    ["occurrence", "elementId", "Other_Effect"],
    ["occurrence", "activation", 2],
    ["descriptor", "protocol", "urn:bpmn-lean:effect:other-v1"],
    ["descriptor", "handler", "otherHandler"],
  ];

  for (const [group, field, value] of mutations) {
    const mutated = {
      ...material,
      [group]: {
        ...material[group],
        [field]: value,
      },
    };
    assert.notEqual(
      effectTransportKey(material),
      effectTransportKey(mutated),
      `${group}.${field} must participate in transport identity`,
    );
  }
});

test("retained field-drop mutations collide on constructed pairs", () => {
  const discriminators = [
    ["definition", "processId", "Other_Process"],
    ["occurrence", "processInstanceId", "Instance_2"],
    ["occurrence", "elementId", "Other_Effect"],
    ["occurrence", "activation", 2],
  ];

  for (const [group, field, value] of discriminators) {
    const other = {
      ...material,
      [group]: {
        ...material[group],
        [field]: value,
      },
    };
    assert.throws(
      () =>
        requireDistinctTransportKeys(
          material,
          other,
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

function effectRequest(value) {
  return {
    ...value.descriptor,
    idempotencyKey: effectTransportKey(value),
    arguments: value.arguments,
  };
}

function hostDerivedKey(baseKey, attempt) {
  return `effect-transport-sha256:${
    deterministicSha256Hex(`${baseKey}:attempt-${attempt}`)
  }`;
}

function requireDistinctTransportKeys(left, right, deriveKey, label) {
  assert.notEqual(
    deriveKey(left),
    deriveKey(right),
    `${label} transport identity mutation collapsed`,
  );
}

function effectTransportKeyWithOmittedField(value, group, field) {
  const withoutField = Object.fromEntries(
    Object.entries(value[group]).filter(([name]) => name !== field),
  );
  const tuple = [
    "effectTransport",
    group === "definition"
      ? Object.values(withoutField)
      : Object.values(value.definition),
    group === "occurrence"
      ? Object.values(withoutField)
      : Object.values(value.occurrence),
    Object.values(value.descriptor),
    value.arguments,
  ];
  return JSON.stringify(tuple);
}

function effectTransportKeyWithoutArguments(value) {
  return JSON.stringify([
    "effectTransport",
    Object.values(value.definition),
    Object.values(value.occurrence),
    Object.values(value.descriptor),
  ]);
}

function completeEffectCommandIdWithoutResult(completion) {
  return JSON.stringify([
    "completeEffect",
    Object.values(completion.effectId),
  ]);
}

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
});

test("encodes and digests the complete committed effect intent", () => {
  assert.equal(
    canonicalEffectTransportEncoding(material),
    '["effectTransport",["cibseven-2.2.0-service-task-effect-draft","service-task-effect-process","0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","Process_ServiceTaskEffect"],["Instance_1","ServiceTask_Record",1],["urn:bpmn-lean:effect:probe-v1","bpmnLeanEffectHandler"]]',
  );
  assert.equal(
    effectTransportKey(material),
    "effect-transport-sha256:e62fada76d5f08a59cea4dbe4131a01e4564350007fb2e351d23e8e7279e9341",
  );
  assert.equal(
    canonicalCompleteEffectEncoding(material.occurrence),
    '["completeEffect",["Instance_1","ServiceTask_Record",1]]',
  );
  assert.equal(
    completeEffectCommandId(material.occurrence),
    "complete-effect-sha256:490f047958adccc3d67516a5758fe2bb7ecd8683de10173c3a40816bb7f71eb1",
  );
  assert.deepEqual(completeEffectStimulus(material.occurrence), {
    kind: "completeEffect",
    commandId: completeEffectCommandId(material.occurrence),
    effectId: material.occurrence,
  });
  assert.notEqual(
    effectTransportKey(material).split(":")[1],
    completeEffectCommandId(material.occurrence).split(":")[1],
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
    { kind: "success" },
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
    { kind: "success" },
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
  ];
  return JSON.stringify(tuple);
}

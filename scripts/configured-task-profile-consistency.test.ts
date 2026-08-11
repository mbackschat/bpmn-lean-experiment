/**
 * Characterizes the exact configured source-to-neutral-effect profile binding.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  verifyConfiguredTaskProfileBinding,
} from "./configured-task-profile-consistency.ts";

const exactProfile = {
  id: "bpmn-2.0.2-bpmn-lean-configured-task-effect-draft",
  effectBindings: [{
    source: {
      taskDefinitionNamespace: "urn:bpmn-lean:bpmn:extensions:v1",
      taskDefinitionType: "urn:bpmn-lean:task-handler:probe-v1",
    },
    descriptor: {
      protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
      operation: "urn:bpmn-lean:effect-operation:probe-v1",
    },
  }],
} as const;

test("accepts the exact configured Task profile binding", () => {
  assert.doesNotThrow(() => verifyConfiguredTaskProfileBinding(exactProfile));
  assert.doesNotThrow(() =>
    verifyConfiguredTaskProfileBinding({ id: "unrelated-profile" })
  );
});

test("rejects every configured Task binding drift", () => {
  const binding = exactProfile.effectBindings[0];
  assert.ok(binding !== undefined);
  const mutations = [
    { ...exactProfile, effectBindings: [{
      ...binding,
      source: {
        ...binding.source,
        taskDefinitionNamespace: "urn:other",
      },
    }] },
    { ...exactProfile, effectBindings: [{
      ...binding,
      source: {
        ...binding.source,
        taskDefinitionType: "urn:other",
      },
    }] },
    { ...exactProfile, effectBindings: [{
      ...binding,
      descriptor: { ...binding.descriptor, operation: "urn:other" },
    }] },
    { ...exactProfile, effectBindings: [] },
    { ...exactProfile, effectBindings: [binding, binding] },
  ] as const;

  for (const profile of mutations) {
    assert.throws(
      () => verifyConfiguredTaskProfileBinding(profile),
      /configured Task profile binding/u,
    );
  }
});

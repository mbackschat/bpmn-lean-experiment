/**
 * Locks the product effect Activity against its configured deterministic handlers.
 *
 * The oracle is the declared handler list: an effect request may only produce the exact result its
 * neutral descriptor declares, and an undeclared descriptor must fail typed rather than fabricate a
 * success that the semantic core would commit.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  EffectExecutionResultKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";

import {
  createHostEffectActivities,
} from "@bpmn-lean/temporal-testkit";
import type { HostEffectHandler } from "@bpmn-lean/temporal-testkit";

const successHandler = {
  protocol: "activity",
  operation: "probe",
  result: { kind: EffectExecutionResultKind.Success, localPatch: [] },
} as const satisfies HostEffectHandler;

const mappedHandler = {
  protocol: "activity",
  operation: "mappedSuccess",
  result: {
    kind: EffectExecutionResultKind.Success,
    localPatch: [
      {
        name: "documentId",
        value: { kind: VariableValueKind.String, value: "doc-1" },
      },
    ],
  },
} as const satisfies HostEffectHandler;

const errorHandler = {
  protocol: "activity",
  operation: "rejecting",
  result: {
    kind: EffectExecutionResultKind.BpmnError,
    code: "DOCUMENT_REJECTED",
    message: null,
    localPatch: [],
  },
} as const satisfies HostEffectHandler;

function request(operation: string, protocol = "activity") {
  return {
    protocol,
    operation,
    idempotencyKey: `key:${protocol}:${operation}`,
    arguments: [],
  } as const;
}

test("returns the declared result for a configured descriptor", async () => {
  const activities = createHostEffectActivities([
    successHandler,
    mappedHandler,
  ]);

  assert.deepEqual(
    await activities.executeBpmnEffect(request("mappedSuccess")),
    mappedHandler.result,
  );
});

test("returns a declared bpmnError result without throwing", async () => {
  const activities = createHostEffectActivities([errorHandler]);

  assert.deepEqual(
    await activities.executeBpmnEffect(request("rejecting")),
    errorHandler.result,
  );
});

test("is deterministic across repeated attempts of one effect", async () => {
  const activities = createHostEffectActivities([mappedHandler]);
  const first = await activities.executeBpmnEffect(request("mappedSuccess"));
  const second = await activities.executeBpmnEffect(request("mappedSuccess"));

  assert.deepEqual(first, second);
});

test("fails typed for an undeclared operation instead of fabricating success", async () => {
  const activities = createHostEffectActivities([successHandler]);

  await assert.rejects(
    activities.executeBpmnEffect(request("unconfigured")),
    /no configured product effect handler/u,
  );
});

test("distinguishes descriptors that share an operation but not a protocol", async () => {
  const activities = createHostEffectActivities([successHandler]);

  await assert.rejects(
    activities.executeBpmnEffect(request("probe", "externalTask")),
    /no configured product effect handler/u,
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EffectOperation,
  EffectProtocol,
  EffectExecutionResultKind,
  VariableValueKind,
  type VariableBinding,
} from "@bpmn-lean/semantic-core";
import {
  EffectExecutionSchedule,
  EffectProbeActivityRegistry,
  EffectProbeStore,
  type EffectRequest,
} from "@bpmn-lean/temporal-testkit";

const zeroArgumentRequest = compensationRequest("1", []);
const restoredStringRequest = compensationRequest("2", [{
  name: "archivedContext",
  value: { kind: VariableValueKind.String, value: "frozen" },
}]);

test("executes admitted compensation probes with empty-patch success", async () => {
  const registry = new EffectProbeActivityRegistry();
  const plainStore = new EffectProbeStore();
  const retryStore = new EffectProbeStore();

  registry.register(zeroArgumentRequest, (request) =>
    plainStore.execute(request, EffectExecutionSchedule.PlainSuccess)
  );
  registry.register(restoredStringRequest, (request) =>
    retryStore.execute(request, EffectExecutionSchedule.FailAfterMutationOnce)
  );

  assert.deepEqual(
    await registry.activities.executeBpmnEffect(zeroArgumentRequest),
    { kind: EffectExecutionResultKind.Success, localPatch: [] },
  );
  await assert.rejects(
    registry.activities.executeBpmnEffect(restoredStringRequest),
    /after external mutation/u,
  );
  assert.deepEqual(
    await registry.activities.executeBpmnEffect(restoredStringRequest),
    { kind: EffectExecutionResultKind.Success, localPatch: [] },
  );
  assert.deepEqual(plainStore.evidence(), {
    invocations: 1,
    mutations: 1,
    keys: [zeroArgumentRequest.idempotencyKey],
  });
  assert.deepEqual(retryStore.evidence(), {
    invocations: 2,
    mutations: 1,
    keys: [restoredStringRequest.idempotencyKey],
  });
});

test("accepts every transport-supported compensation binding value", async () => {
  const supportedBindings: ReadonlyArray<VariableBinding> = [
    {
      name: "booleanContext",
      value: { kind: VariableValueKind.Boolean, value: true },
    },
    {
      name: "stringContext",
      value: { kind: VariableValueKind.String, value: "restored" },
    },
    {
      name: "nullContext",
      value: { kind: VariableValueKind.Null },
    },
  ];

  for (const [index, binding] of supportedBindings.entries()) {
    const registry = new EffectProbeActivityRegistry();
    const request = compensationRequest(String(index + 3), [binding]);
    registry.register(request, async () => ({
      kind: EffectExecutionResultKind.Success,
      localPatch: [],
    }));
    assert.deepEqual(
      await registry.activities.executeBpmnEffect(request),
      { kind: EffectExecutionResultKind.Success, localPatch: [] },
    );
  }
});

test("rejects inadmissible compensation arguments before probe invocation", async () => {
  const invalidArguments: ReadonlyArray<ReadonlyArray<unknown>> = [
    [
      {
        name: "first",
        value: { kind: VariableValueKind.String, value: "one" },
      },
      {
        name: "second",
        value: { kind: VariableValueKind.String, value: "two" },
      },
    ],
    [{
      name: "integerContext",
      value: { kind: VariableValueKind.Integer, value: 1 },
    }],
    [{
      name: "listContext",
      value: { kind: VariableValueKind.StringList, value: ["one"] },
    }],
    [{
      name: "",
      value: { kind: VariableValueKind.String, value: "missing-name" },
    }],
    [{
      name: "extraField",
      value: { kind: VariableValueKind.Null },
      extra: true,
    }],
  ];

  for (const [index, arguments_] of invalidArguments.entries()) {
    const keyDiscriminator = (index + 6).toString(16);
    const request = compensationRequest(
      keyDiscriminator,
      arguments_ as ReadonlyArray<VariableBinding>,
    );
    const registrationRegistry = new EffectProbeActivityRegistry();
    assert.throws(
      () => registrationRegistry.register(request, async () => ({
        kind: EffectExecutionResultKind.Success,
        localPatch: [],
      })),
      /admitted protocol, operation, and argument contract/u,
    );

    const invocationRegistry = new EffectProbeActivityRegistry();
    const admitted = compensationRequest(
      keyDiscriminator,
      [],
    );
    let invocations = 0;
    invocationRegistry.register(admitted, async () => {
      invocations += 1;
      return { kind: EffectExecutionResultKind.Success, localPatch: [] };
    });
    await assert.rejects(
      invocationRegistry.activities.executeBpmnEffect(request),
      /admitted protocol, operation, and argument contract/u,
    );
    assert.equal(invocations, 0);
  }
});

test("requires the exact Activity envelope for compensation probes", () => {
  const registry = new EffectProbeActivityRegistry();
  assert.throws(
    () => registry.register(
      {
        ...zeroArgumentRequest,
        protocol: "urn:bpmn-lean:effect-protocol:other-v1",
      },
      async () => ({ kind: EffectExecutionResultKind.Success, localPatch: [] }),
    ),
    /admitted protocol, operation, and argument contract/u,
  );
  assert.throws(
    () => registry.register(
      { ...zeroArgumentRequest, idempotencyKey: "host-derived-key" },
      async () => ({ kind: EffectExecutionResultKind.Success, localPatch: [] }),
    ),
    /content-bound transport key/u,
  );
});

function compensationRequest(
  keyDiscriminator: string,
  arguments_: ReadonlyArray<VariableBinding>,
): EffectRequest {
  return {
    protocol: EffectProtocol.Activity,
    operation: EffectOperation.CompensationSingleEffect,
    idempotencyKey: `effect-transport-sha256:${keyDiscriminator.repeat(64)}`,
    arguments: [...arguments_],
  };
}

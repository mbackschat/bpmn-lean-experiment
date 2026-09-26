import assert from "node:assert/strict";
import { test } from "node:test";

import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";
import { EffectExecutionResultKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import {
  RcShowcaseActors,
  loadRcShowcaseBindings,
  mergeRcEffectHandlers,
} from "../src/rc-showcase-actor.ts";

function instance(sha256: string, semanticProfile: string): PublicProcessInstanceIdentity {
  return {
    processInstanceId: "discovered-instance",
    definition: {
      processId: "same-process", version: 1, semanticProfile,
      source: { kind: "bpmnSource", id: "source", sha256, byteLength: 1,
        declaredEncoding: null, decodedAs: "UTF-8" },
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  };
}

test("only exact retained guided source bytes and profile acquire an actor", async () => {
  const bindings = await loadRcShowcaseBindings();
  assert.equal(bindings.length, 12);
  assert.equal(bindings.filter((binding) => binding.mode === "human").length, 3);
  const guided = bindings.find((binding) => binding.mode === "guided")!;
  const launched: string[] = [];
  const actors = new RcShowcaseActors(bindings, async (binding) => {
    launched.push(binding.modelId);
  });
  assert.equal(actors.discover(instance("0".repeat(64), guided.semanticProfile)), false);
  assert.equal(actors.discover(instance(guided.sourceSha256, "wrong-profile")), false);
  for (const human of bindings.filter((binding) => binding.mode === "human")) {
    assert.equal(actors.discover(instance(human.sourceSha256, human.semanticProfile)), false);
  }
  assert.equal(actors.discover(instance(guided.sourceSha256, guided.semanticProfile)), true);
  await actors.drain();
  assert.deepEqual(launched, [guided.modelId]);
});

test("duplicate discovery launches once both during and after completion", async () => {
  const bindings = await loadRcShowcaseBindings();
  const guided = bindings.find((binding) => binding.mode === "guided")!;
  const exact = instance(guided.sourceSha256, guided.semanticProfile);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let launches = 0;
  const actors = new RcShowcaseActors(bindings, async () => { launches++; await gate; });
  assert.equal(actors.discover(exact), true);
  assert.equal(actors.discover(exact), false);
  release();
  await actors.drain();
  assert.equal(actors.discover(exact), false);
  assert.equal(launches, 1);
});

test("actor failure is retained for the caller and never retried on discovery", async () => {
  const bindings = await loadRcShowcaseBindings();
  const guided = bindings.find((binding) => binding.mode === "guided")!;
  const failure = new Error("published interaction refused");
  const actors = new RcShowcaseActors(bindings, async () => { throw failure; });
  const exact = instance(guided.sourceSha256, guided.semanticProfile);
  actors.discover(exact);
  await assert.rejects(actors.drain(), (error: unknown) =>
    error instanceof AggregateError && error.errors.includes(failure));
  assert.equal(actors.discover(exact), false);
});

test("shared effect descriptors require identical results", async () => {
  const bindings = await loadRcShowcaseBindings();
  const compensation = bindings.find((binding) => binding.modelId === "confirmed-travel-cancellation")!;
  const transaction = bindings.find((binding) => binding.modelId === "reservation-withdrawal")!;
  const shared = mergeRcEffectHandlers([compensation, transaction]);
  assert.equal(shared.length, 1);
  assert.deepEqual(shared, compensation.config.effectHandlers);
  const handler = shared[0]!;
  assert.throws(() => mergeRcEffectHandlers([compensation, {
    ...transaction,
    config: { ...transaction.config, effectHandlers: [{ ...handler,
      result: { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "different", value: { kind: VariableValueKind.String, value: "result" } }] },
    }] },
  }]), /Conflicting.*effect/);
});

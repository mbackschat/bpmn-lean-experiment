import assert from "node:assert/strict";
import test from "node:test";

import { FlowNodeMetricsResultKind } from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  FlowNodeMetricsResult,
} from "@bpmn-lean/platform-contracts";

import {
  FlowNodeMetricsLoader,
  FlowNodeMetricsLoadStateKind,
} from "../src/flow-node-metrics-load.ts";

const definitionA = definition("Definition_A", 1, "a");
const definitionB = definition("Definition_B", 2, "b");

test("a delayed A response cannot become current after selecting B", async () => {
  const requests: Array<PromiseWithResolvers<FlowNodeMetricsResult>> = [];
  const loader = new FlowNodeMetricsLoader({
    get: async () => {
      const request = Promise.withResolvers<FlowNodeMetricsResult>();
      requests.push(request);
      return await request.promise;
    },
  });
  const pendingA = loader.load(definitionA);
  const pendingB = loader.load(definitionB);
  requests[0]!.resolve(available(definitionA));
  assert.equal(await pendingA, null);
  requests[1]!.resolve(available(definitionB));
  assert.deepEqual(await pendingB, {
    kind: FlowNodeMetricsLoadStateKind.Available,
    snapshot: available(definitionB).snapshot,
  });
});

test("tab abandonment invalidates both delayed success and delayed failure", async () => {
  for (const outcome of ["success", "failure"] as const) {
    const request = Promise.withResolvers<FlowNodeMetricsResult>();
    const loader = new FlowNodeMetricsLoader({ get: async () => await request.promise });
    const pending = loader.load(definitionA);
    loader.invalidate();
    if (outcome === "success") request.resolve(available(definitionA));
    else request.reject(new Error("transport failed"));
    assert.equal(await pending, null);
  }
});

test("a current unavailable result or transport failure exposes no snapshot", async () => {
  const unavailableLoader = new FlowNodeMetricsLoader({
    get: async () => ({
      kind: FlowNodeMetricsResultKind.Unavailable,
      reason: "flowNodeMetricsUnavailable",
    }),
  });
  assert.deepEqual(await unavailableLoader.load(definitionA), {
    kind: FlowNodeMetricsLoadStateKind.Unavailable,
  });

  const failedLoader = new FlowNodeMetricsLoader({
    get: async () => { throw new Error("transport failed"); },
  });
  assert.deepEqual(await failedLoader.load(definitionA), {
    kind: FlowNodeMetricsLoadStateKind.Unavailable,
  });
});

function definition(
  processId: string,
  version: number,
  digestCharacter: string,
): DeployedDefinitionVersion {
  return {
    processId,
    version,
    source: {
      kind: "bpmnSource",
      id: `${processId}.bpmn`,
      sha256: digestCharacter.repeat(64),
      byteLength: 100,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile: "metrics-profile",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  };
}

function available(definition: DeployedDefinitionVersion) {
  return {
    kind: FlowNodeMetricsResultKind.Available,
    snapshot: {
      definition,
      population: { processInstances: 1, label: "allRetainedEvidence" },
      flowNodes: [],
    },
  } as const;
}

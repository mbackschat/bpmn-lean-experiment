import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowNodeMetricsResult } from "@bpmn-lean/platform-contracts";

import {
  FlowNodeMetricsHttpRoutes,
} from "@bpmn-lean/platform-operate";
import {
  OperationsAuthorizationDecision,
} from "@bpmn-lean/platform-identity-policy";

const route = "http://platform.example/api/v1/definitions/Process_1/versions/7/flow-node-metrics";

test("denies before definition, membership, reconciliation, or gateway work", async () => {
  let protectedCalls = 0;
  const routes = new FlowNodeMetricsHttpRoutes({
    actors: { resolveActor: () => ({ id: "reviewer", groups: ["reviewers"] }) },
    authorization: { decide: () => OperationsAuthorizationDecision.Forbidden },
    aggregation: {
      get: async () => {
        protectedCalls += 1;
        throw new Error("must not be called");
      },
    },
  });
  const response = await routes.handle(new Request(route));
  assert.equal(response?.status, 403);
  assert.equal(protectedCalls, 0);
  assert.deepEqual(await response?.json(), {
    error: {
      code: "forbidden",
      message: "The requested flow-node metrics are forbidden.",
    },
  });
});

test("maps every unavailable aggregate to one privacy-preserving 503", async () => {
  const routes = permittedRoutes(async () => ({
    kind: "unavailable",
    reason: "flowNodeMetricsUnavailable",
  }));
  const response = await routes.handle(new Request(route));
  assert.equal(response?.status, 503);
  const body = await response?.text();
  assert.equal(body, JSON.stringify({
    error: {
      code: "flowNodeMetricsUnavailable",
      message: "Flow-node metrics are unavailable.",
    },
  }));
  assert.doesNotMatch(body ?? "", /instance|locator|workflow|101|member/u);
});

test("serves available exact-version metrics and maps absence to 404", async () => {
  const definition = {
    processId: "Process_1",
    version: 7,
    source: {
      kind: "bpmnSource" as const,
      id: "process.bpmn",
      sha256: "a".repeat(64),
      byteLength: 42,
      declaredEncoding: null,
      decodedAs: "UTF-8" as const,
    },
    semanticProfile: "profile",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  };
  const result = {
    kind: "available" as const,
    snapshot: {
      definition,
      population: { processInstances: 0, label: "allRetainedEvidence" as const },
      flowNodes: [],
    },
  };
  const available = await permittedRoutes(async () => result).handle(new Request(route));
  assert.equal(available?.status, 200);
  assert.deepEqual(await available?.json(), result);

  const missing = await permittedRoutes(async () => null).handle(new Request(route));
  assert.equal(missing?.status, 404);
});

test("admits only bodyless GET on the canonical route", async () => {
  const routes = permittedRoutes(async () => null);
  assert.equal((await routes.handle(new Request(route, { method: "POST" })))?.status, 405);
  assert.equal((await routes.handle(new Request(`${route}?unexpected=1`)))?.status, 400);
  assert.equal((await routes.handle(new Request(route, {
    method: "GET",
    headers: { "content-type": "application/json" },
  })))?.status, 400);
});

function permittedRoutes(
  get: () => Promise<FlowNodeMetricsResult | null>,
) {
  return new FlowNodeMetricsHttpRoutes({
    actors: { resolveActor: () => ({ id: "operator", groups: ["operators"] }) },
    authorization: { decide: () => OperationsAuthorizationDecision.Permitted },
    aggregation: { get },
  });
}

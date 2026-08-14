import assert from "node:assert/strict";
import test from "node:test";

import {
  flowNodeMetricsPath,
  FlowNodeMetricsApiErrorCodes,
  FlowNodeMetricsUnavailableMessage,
  matchFlowNodeMetricsPath,
  PublicApiErrorCode,
  requireFlowNodeMetricsRequestBodyLength,
} from "@bpmn-lean/platform-contracts";

test("builds and matches only the canonical exact-definition metrics route", () => {
  assert.equal(
    flowNodeMetricsPath("Metrics/Process", 7),
    "/api/v1/definitions/Metrics%2FProcess/versions/7/flow-node-metrics",
  );
  assert.deepEqual(matchFlowNodeMetricsPath(
    "/api/v1/definitions/Metrics%2FProcess/versions/7/flow-node-metrics",
  ), { processId: "Metrics/Process", version: 7 });
  assert.equal(matchFlowNodeMetricsPath("/api/v1/definitions/P/versions/7/source"), null);
});

test("rejects noncanonical versions, URI encodings, queries, methods, and bodies", () => {
  for (const path of [
    "/api/v1/definitions/P/versions/01/flow-node-metrics",
    "/api/v1/definitions/P/versions/0/flow-node-metrics",
    "/api/v1/definitions/P/versions/9007199254740992/flow-node-metrics",
    "/api/v1/definitions/%50/versions/1/flow-node-metrics",
    "/api/v1/definitions/P/versions/1/flow-node-metrics?period=all",
  ]) {
    assert.throws(() => matchFlowNodeMetricsPath(path));
  }
  assert.throws(() => requireFlowNodeMetricsRequestBodyLength("POST", 0), /GET/u);
  assert.throws(() => requireFlowNodeMetricsRequestBodyLength("GET", 1), /body/u);
  assert.throws(() => flowNodeMetricsPath("P", 0), /positive safe integer/u);
});

test("publishes the exact Operations error set and unavailable message", () => {
  assert.deepEqual(FlowNodeMetricsApiErrorCodes, [
    PublicApiErrorCode.InvalidRequest,
    PublicApiErrorCode.MethodNotAllowed,
    PublicApiErrorCode.NotFound,
    PublicApiErrorCode.Forbidden,
    PublicApiErrorCode.FlowNodeMetricsUnavailable,
    PublicApiErrorCode.InternalFailure,
  ]);
  assert.equal(
    FlowNodeMetricsUnavailableMessage,
    "Flow-node metrics are unavailable.",
  );
});

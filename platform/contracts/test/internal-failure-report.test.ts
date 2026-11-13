import assert from "node:assert/strict";
import { test } from "node:test";

import { reportInternalFailure } from "@bpmn-lean/platform-contracts";
import type { InternalFailureReport } from "@bpmn-lean/platform-contracts";

test("reports the route, method, pathname and the caught value itself, once", () => {
  const reports: InternalFailureReport[] = [];
  const error = new Error("store unavailable");

  reportInternalFailure(
    (report) => reports.push(report),
    "ExampleHttpRoutes",
    new Request("http://platform.test/api/v1/example/1/start", { method: "POST" }),
    error,
  );

  assert.equal(reports.length, 1);
  assert.deepEqual(Object.keys(reports[0]!).sort(), ["error", "method", "path", "route"]);
  assert.equal(reports[0]!.route, "ExampleHttpRoutes");
  assert.equal(reports[0]!.method, "POST");
  assert.equal(reports[0]!.path, "/api/v1/example/1/start");
  assert.equal(reports[0]!.error, error);
});

test("never carries the query string or fragment, which may hold business data", () => {
  const reports: InternalFailureReport[] = [];

  reportInternalFailure(
    (report) => reports.push(report),
    "ExampleHttpRoutes",
    { method: "GET", url: "http://platform.test/api/v1/example?actor=alice&secret=1#frag" },
    "not an error",
  );

  assert.equal(reports[0]!.path, "/api/v1/example");
  assert.equal(reports[0]!.error, "not an error");
  assert.doesNotMatch(JSON.stringify(reports[0]), /alice|secret|frag/u);
});

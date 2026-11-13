import assert from "node:assert/strict";
import { test } from "node:test";

import { createStderrInternalFailureReporter } from "@bpmn-lean/platform-server";

const report = {
  route: "DefinitionHttpRoutes",
  method: "POST",
  path: "/api/v1/definitions/Process_1/versions/1/start",
} as const;

test("writes exactly one JSON line per report with the error's name, message and stack", () => {
  const lines: string[] = [];
  const reporter = createStderrInternalFailureReporter((line) => lines.push(line));
  const error = new TypeError("store unavailable");

  reporter({ ...report, error });

  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.endsWith("\n"), true);
  assert.equal(lines[0]!.slice(0, -1).includes("\n"), false);
  const record = JSON.parse(lines[0]!) as Record<string, unknown>;
  assert.deepEqual(Object.keys(record), ["event", "route", "method", "path", "error"]);
  assert.deepEqual({ ...record, error: undefined }, {
    event: "internalFailure",
    ...report,
    error: undefined,
  });
  const rendered = record.error as Record<string, unknown>;
  assert.deepEqual(Object.keys(rendered), ["name", "message", "stack"]);
  assert.equal(rendered.name, "TypeError");
  assert.equal(rendered.message, "store unavailable");
  assert.equal(rendered.stack, error.stack);
});

test("renders a thrown non-Error with String() and no stack", () => {
  const lines: string[] = [];
  const reporter = createStderrInternalFailureReporter((line) => lines.push(line));

  reporter({ ...report, error: "plain string" });
  reporter({ ...report, error: { toString: () => "custom rendering" } });
  reporter({ ...report, error: Object.create(null) });

  const rendered = lines.map((line) => (JSON.parse(line) as { error: unknown }).error);
  assert.deepEqual(rendered, [
    { name: "string", message: "plain string" },
    { name: "object", message: "custom rendering" },
    { name: "object", message: "[unrenderable thrown value]" },
  ]);
});

test("never throws into the request path when the sink fails", () => {
  const reporter = createStderrInternalFailureReporter(() => {
    throw new Error("stderr closed");
  });

  assert.doesNotThrow(() => reporter({ ...report, error: new Error("cause") }));
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ProjectionFreshnessHttpHeader,
  projectionFreshnessResponseHeaders,
} from "@bpmn-lean/platform-contracts";

test("formats the exact projection freshness response headers", () => {
  assert.deepEqual(
    projectionFreshnessResponseHeaders({
      observedAfterEpochMs: 1_723_891_200_000,
      maxAgeMs: 30_000,
    }),
    {
      [ProjectionFreshnessHttpHeader.ObservedAfterEpochMs]: "1723891200000",
      [ProjectionFreshnessHttpHeader.MaxAgeMs]: "30000",
    },
  );
});

test("rejects unsafe, negative, and zero projection freshness values", () => {
  for (const value of [
    { observedAfterEpochMs: -1, maxAgeMs: 1 },
    { observedAfterEpochMs: 0.5, maxAgeMs: 1 },
    { observedAfterEpochMs: Number.MAX_SAFE_INTEGER + 1, maxAgeMs: 1 },
    { observedAfterEpochMs: 0, maxAgeMs: 0 },
    { observedAfterEpochMs: 0, maxAgeMs: 1.5 },
    { observedAfterEpochMs: 0, maxAgeMs: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.throws(() => projectionFreshnessResponseHeaders(value), TypeError);
  }
});

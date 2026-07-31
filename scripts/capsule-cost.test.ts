import assert from "node:assert/strict";
import { test } from "node:test";
import { measureCapsuleDiff } from "./capsule-cost.ts";

test("counts nonblank code and documentation churn from a unified diff", () => {
  const diff = [
    "diff --git a/packages/core/src/example.ts b/packages/core/src/example.ts",
    "--- a/packages/core/src/example.ts",
    "+++ b/packages/core/src/example.ts",
    "@@ -1,2 +1,3 @@",
    "-const previous = true;",
    "-",
    "+const current = true;",
    "+",
    '+const added = "value";',
    "diff --git a/docs/example.md b/docs/example.md",
    "--- a/docs/example.md",
    "+++ b/docs/example.md",
    "@@ -1 +1,2 @@",
    "-Old account.",
    "+New account.",
    "+Additional evidence.",
    "diff --git a/scenarios/example.json b/scenarios/example.json",
    "--- a/scenarios/example.json",
    "+++ b/scenarios/example.json",
    "@@ -1 +1 @@",
    '-{"old":true}',
    '+{"new":true}',
  ].join("\n");

  assert.deepEqual(measureCapsuleDiff(diff), {
    code: { added: 2, removed: 1 },
    documentation: { added: 2, removed: 1 },
  });
});

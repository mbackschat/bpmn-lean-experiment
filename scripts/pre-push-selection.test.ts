import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  parsePushPathFilters,
  prePushWorkflowGates,
  selectedPrePushGates,
} from "./pre-push-selection.ts";

const workflowSources = new Map(
  await Promise.all(
    prePushWorkflowGates.map(async ({ gate, workflow }) => [
      workflow,
      {
        gate,
        pushPaths: parsePushPathFilters(await readFile(workflow, "utf8")),
      },
    ] as const),
  ),
);

function selected(paths: readonly string[]): readonly string[] {
  return selectedPrePushGates(paths, workflowSources).map(({ gate }) => gate);
}

test("derives every Product 2 pre-push boundary from its real push path filters", () => {
  assert.deepEqual(
    selected(["packages/engine-api/src/index.ts"]),
    [
      "test:pre-push:verify",
      "test:pre-push:platform",
      "test:pre-push:platform-postgresql",
      "test:pre-push:showcase",
    ],
  );
  assert.deepEqual(
    selected(["showcase/mue-preview-alpha/src/showcase-runtime.ts"]),
    ["test:pre-push:showcase"],
  );
  assert.deepEqual(
    selected(["platform/apps/web/src/app.tsx"]),
    ["test:pre-push:ui"],
  );
  assert.deepEqual(
    selected(["docs/TESTING-SPEC.md"]),
    ["test:pre-push:verify"],
  );
});

test("a shared manifest selects the complete workflow set without hand-maintained duplication", () => {
  assert.deepEqual(
    selected(["package.json"]),
    [
      "test:pre-push:verify",
      "test:pre-push:platform",
      "test:pre-push:platform-postgresql",
      "test:pre-push:showcase",
      "test:pre-push:ui",
    ],
  );
});

test("each Product 2 workflow selects its own local equivalent", () => {
  for (const { gate, workflow } of prePushWorkflowGates) {
    assert.ok(
      selected([workflow]).includes(gate),
      `${workflow} must select ${gate}`,
    );
  }
});

test("rejects an absent or malformed push path boundary instead of under-selecting", () => {
  assert.throws(
    () => parsePushPathFilters("on:\n  pull_request:\n    paths:\n      - \"src/**\"\n"),
    /push path filters/u,
  );
  assert.throws(
    () => parsePushPathFilters("on:\n  push:\n    paths:\n      - src/**\n"),
    /quoted path filter/u,
  );
});

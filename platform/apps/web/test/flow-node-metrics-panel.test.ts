import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspace = await readFile(
  new URL("../src/operations-workspace.tsx", import.meta.url),
  "utf8",
);
const panel = await readFile(
  new URL("../src/flow-node-metrics-panel.tsx", import.meta.url),
  "utf8",
);

test("owns metrics in Operations with the existing honest metric states", () => {
  assert.match(workspace, /label: "Process metrics"/u);
  assert.match(workspace, /<ProcessMetricsWorkspace/u);
  assert.match(workspace, /metricsApi/u);
  assert.match(panel, /Process metrics are unavailable\./u);
  assert.match(panel, />Retry</u);
  assert.match(panel, /All retained evidence/u);
  assert.match(panel, /No completed samples/u);
  assert.match(panel, /onMissingMetricElementIds/u);
});

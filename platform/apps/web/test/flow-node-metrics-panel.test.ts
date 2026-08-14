import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspace = await readFile(
  new URL("../src/definition-workspace.tsx", import.meta.url),
  "utf8",
);
const panel = await readFile(
  new URL("../src/flow-node-metrics-panel.tsx", import.meta.url),
  "utf8",
);

test("adds the bounded definition-version detail and explicit tab-abandonment callback", () => {
  assert.match(workspace, /label: "Flow-node metrics"/u);
  assert.match(workspace, /<FlowNodeMetricsPanel/u);
  assert.match(workspace, /active=\{selectedTab === "metrics"\}/u);
  assert.match(workspace, /metricsApi/u);
  assert.match(panel, /Flow-node metrics are unavailable\./u);
  assert.match(panel, />Retry</u);
  assert.match(panel, /All retained evidence/u);
  assert.match(panel, /No completed samples/u);
  assert.match(panel, /onMissingMetricElementIds/u);
});

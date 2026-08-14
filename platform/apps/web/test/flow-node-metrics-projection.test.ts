import assert from "node:assert/strict";
import test from "node:test";

import type { FlowNodeMetricsSnapshot } from "@bpmn-lean/platform-contracts";

import {
  FlowNodeMetricMode,
  projectFlowNodeMetrics,
} from "../src/flow-node-metrics-projection.ts";

const snapshot = {
  definition: {
    processId: "Metrics_Process",
    version: 1,
    source: {
      kind: "bpmnSource",
      id: "metrics.bpmn",
      sha256: "a".repeat(64),
      byteLength: 100,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile: "metrics-profile",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  },
  population: { processInstances: 3, label: "allRetainedEvidence" },
  flowNodes: [{
    elementId: "Task_A",
    frequency: 3,
    running: 1,
    completed: 2,
    cancelled: 0,
    completedDuration: {
      sampleCount: 2,
      minimumMs: 10,
      maximumMs: 21,
      averageMs: 15,
    },
  }, {
    elementId: "Task_B",
    frequency: 1,
    running: 0,
    completed: 0,
    cancelled: 1,
    completedDuration: null,
  }],
} as const satisfies FlowNodeMetricsSnapshot;

test("mode switches replace every badge and omit zero-completion duration without a server filter", () => {
  const frequency = projectFlowNodeMetrics(snapshot, FlowNodeMetricMode.Frequency);
  const duration = projectFlowNodeMetrics(snapshot, FlowNodeMetricMode.Duration);

  assert.deepEqual(frequency.badges, [
    { elementId: "Task_A", text: "3" },
    { elementId: "Task_B", text: "1" },
  ]);
  assert.deepEqual(duration.badges, [
    { elementId: "Task_A", text: "15ms" },
  ]);
  assert.equal(duration.rows[1]!.completedDuration, null);
});

test("one shared projection makes badge and table disagreement impossible", () => {
  for (const mode of [FlowNodeMetricMode.Frequency, FlowNodeMetricMode.Duration]) {
    const projection = projectFlowNodeMetrics(snapshot, mode);
    for (const badge of projection.badges) {
      const row = projection.rows.find(({ elementId }) => elementId === badge.elementId);
      assert.ok(row !== undefined);
      switch (mode) {
        case FlowNodeMetricMode.Frequency:
          assert.equal(badge.text, String(row.frequency));
          break;
        case FlowNodeMetricMode.Duration:
          assert.ok(row.completedDuration !== null);
          assert.equal(badge.text, `${row.completedDuration.averageMs}ms`);
          break;
      }
    }
  }
});

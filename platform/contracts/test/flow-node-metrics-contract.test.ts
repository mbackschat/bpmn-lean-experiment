import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeFlowNodeMetricsResult,
  FlowNodeMetricsResultKind,
} from "@bpmn-lean/platform-contracts";
import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";

const definition = {
  processId: "MetricsProcess",
  version: 2,
  source: {
    kind: "bpmnSource",
    id: "metrics.bpmn",
    sha256: "a".repeat(64),
    byteLength: 42,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "profile",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const satisfies DeployedDefinitionVersion;

function availableMetrics() {
  return {
    kind: "available",
    snapshot: {
      definition,
      population: { processInstances: 3, label: "allRetainedEvidence" },
      flowNodes: [{
        elementId: "Activity_A",
        frequency: 3,
        running: 1,
        completed: 2,
        cancelled: 0,
        completedDuration: {
          sampleCount: 2,
          minimumMs: 10,
          maximumMs: 20,
          averageMs: 15,
        },
      }, {
        elementId: "Activity_B",
        frequency: 1,
        running: 0,
        completed: 0,
        cancelled: 1,
        completedDuration: null,
      }],
    },
  } as const;
}

test("decodes exact available, empty-population, and unavailable metric results", () => {
  const available = availableMetrics();
  assert.deepEqual(decodeFlowNodeMetricsResult(available, definition), available);
  const empty = {
    kind: FlowNodeMetricsResultKind.Available,
    snapshot: {
      definition,
      population: { processInstances: 0, label: "allRetainedEvidence" },
      flowNodes: [],
    },
  };
  assert.deepEqual(decodeFlowNodeMetricsResult(empty, definition), empty);
  assert.deepEqual(decodeFlowNodeMetricsResult({
    kind: FlowNodeMetricsResultKind.Unavailable,
    reason: "flowNodeMetricsUnavailable",
  }, definition), {
    kind: "unavailable",
    reason: "flowNodeMetricsUnavailable",
  });
});

test("rejects exact-definition drift, partial unavailable details, and private fields", () => {
  const available = availableMetrics();
  assert.throws(() => decodeFlowNodeMetricsResult({
    ...available,
    snapshot: {
      ...available.snapshot,
      definition: {
        ...definition,
        source: { ...definition.source, workflowId: "private" },
      },
    },
  }, definition), /definition\.source.*public fields/u);
  assert.throws(() => decodeFlowNodeMetricsResult({
    ...available,
    snapshot: {
      ...available.snapshot,
      definition: { ...definition, version: 3 },
    },
  }, definition), /expected definition/u);
  assert.throws(() => decodeFlowNodeMetricsResult({
    kind: "unavailable",
    reason: "flowNodeMetricsUnavailable",
    failedProcessInstanceId: "private",
  }, definition), /public fields/u);
});

test("rejects inconsistent frequency and independent duration inconsistencies", () => {
  const available = availableMetrics();
  const first = available.snapshot.flowNodes[0]!;
  const invalidMetrics = [
    { ...first, frequency: 4 },
    { ...first, completedDuration: null },
    { ...first, completedDuration: { ...first.completedDuration!, sampleCount: 1 } },
    {
      ...first,
      completedDuration: {
        sampleCount: 2,
        minimumMs: 21,
        maximumMs: 20,
        averageMs: 15,
      },
    },
    { ...first, frequency: 0, running: 0, completed: 0, completedDuration: null },
    { ...first, frequency: Number.MAX_SAFE_INTEGER + 1 },
  ];
  for (const metric of invalidMetrics) {
    assert.throws(() => decodeFlowNodeMetricsResult({
      ...available,
      snapshot: { ...available.snapshot, flowNodes: [metric] },
    }, definition));
  }
});

test("requires canonical element order and exact completed-duration bounds", () => {
  const available = availableMetrics();
  assert.throws(() => decodeFlowNodeMetricsResult({
    ...available,
    snapshot: {
      ...available.snapshot,
      flowNodes: available.snapshot.flowNodes.toReversed(),
    },
  }, definition), /canonical elementId order/u);
  const first = available.snapshot.flowNodes[0]!;
  assert.throws(() => decodeFlowNodeMetricsResult({
    ...available,
    snapshot: {
      ...available.snapshot,
      flowNodes: [{
        ...first,
        completedDuration: {
          ...first.completedDuration!,
          averageMs: 21,
        },
      }],
    },
  }, definition), /minimum.*average.*maximum/u);
  assert.throws(() => decodeFlowNodeMetricsResult({
    ...available,
    snapshot: {
      ...available.snapshot,
      population: { processInstances: 101, label: "allRetainedEvidence" },
    },
  }, definition), /must not exceed 100/u);
});

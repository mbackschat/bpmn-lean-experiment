import type {
  FlowNodeMetric,
  FlowNodeMetricsSnapshot,
} from "@bpmn-lean/platform-contracts";

import type { FlowNodeMetricBadge } from "./flow-node-metric-overlay.ts";

export const FlowNodeMetricMode = {
  Frequency: "frequency",
  Duration: "duration",
} as const;

export type FlowNodeMetricMode =
  typeof FlowNodeMetricMode[keyof typeof FlowNodeMetricMode];

export type FlowNodeMetricsProjection = Readonly<{
  badges: readonly FlowNodeMetricBadge[];
  rows: readonly FlowNodeMetric[];
}>;

/** Derives every diagram and table value from the same exact decoded snapshot. */
export function projectFlowNodeMetrics(
  snapshot: FlowNodeMetricsSnapshot,
  mode: FlowNodeMetricMode,
): FlowNodeMetricsProjection {
  const badges: FlowNodeMetricBadge[] = [];
  for (const metric of snapshot.flowNodes) {
    switch (mode) {
      case FlowNodeMetricMode.Frequency:
        badges.push({ elementId: metric.elementId, text: String(metric.frequency) });
        break;
      case FlowNodeMetricMode.Duration:
        if (metric.completedDuration !== null) {
          badges.push({
            elementId: metric.elementId,
            text: `${metric.completedDuration.averageMs}ms`,
          });
        }
        break;
    }
  }
  return { badges, rows: snapshot.flowNodes };
}

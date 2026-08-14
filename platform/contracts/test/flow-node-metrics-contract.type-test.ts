import type { FlowNodeMetricsResult } from "@bpmn-lean/platform-contracts";

declare const result: FlowNodeMetricsResult;

if (result.kind === "available") {
  // @ts-expect-error metrics are deeply immutable
  result.snapshot.flowNodes[0]!.completedDuration!.averageMs = 10;
} else {
  // @ts-expect-error unavailable carries no partial snapshot
  result.snapshot;
}

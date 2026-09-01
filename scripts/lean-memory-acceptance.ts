/**
 * Immutable cgroup-controlled Lean receipts and their fail-closed acceptance rule.
 *
 * GNU RSS remains the comparable per-module cost series. These receipts instead
 * decide whether a complete process tree stayed strictly below its enforced
 * cgroup bound without any pressure or OOM event, including when Lean exits zero.
 */

export const leanMemoryEventNames = [
  "high",
  "max",
  "oom",
  "oom_kill",
  "oom_group_kill",
] as const;

export type LeanMemoryEventName = (typeof leanMemoryEventNames)[number];

export type LeanMemoryAcceptanceReceipt = Readonly<{
  command: string;
  measuredAtCommit: string;
  outputSha256: string;
  exitStatus: number;
  cgroupPeakBytes: number;
  memoryEvents: Readonly<Record<LeanMemoryEventName, number>>;
}>;

export type LeanMemoryAcceptanceRecord = Readonly<{
  memoryBoundBytes: number;
  receipts: readonly LeanMemoryAcceptanceReceipt[];
}>;

export type LeanMemoryAcceptanceViolation = Readonly<
  | { kind: "nonzero-exit"; command: string; exitStatus: number }
  | { kind: "cgroup-bound"; command: string; peakBytes: number; boundBytes: number }
  | { kind: "memory-event"; command: string; event: LeanMemoryEventName; count: number }
>;

export const leanMemoryAcceptanceRecord = {
  memoryBoundBytes: 3_221_225_472,
  receipts: [
    {
      command: "./scripts/lake.sh test",
      measuredAtCommit: "7b3ca41f",
      outputSha256: "aaec15959030baf4dae2b0327c50fdb5b8a765e3f80ad93b82629f4339833d58",
      exitStatus: 0,
      cgroupPeakBytes: 136_794_112,
      memoryEvents: { high: 0, max: 0, oom: 0, oom_kill: 0, oom_group_kill: 0 },
    },
    {
      command: "./scripts/lake.sh build",
      measuredAtCommit: "7b3ca41f",
      outputSha256: "748a58696eab89272da962e2f88d514187abf2aab87a66985dfedc4e14ee0a13",
      exitStatus: 0,
      cgroupPeakBytes: 36_450_304,
      memoryEvents: { high: 0, max: 0, oom: 0, oom_kill: 0, oom_group_kill: 0 },
    },
  ],
} as const satisfies LeanMemoryAcceptanceRecord;

/** Rejects every receipt that did not remain strictly below the process-tree bound. */
export function leanMemoryAcceptanceViolations(
  record: LeanMemoryAcceptanceRecord,
): LeanMemoryAcceptanceViolation[] {
  const violations: LeanMemoryAcceptanceViolation[] = [];
  for (const receipt of record.receipts) {
    if (receipt.exitStatus !== 0) {
      violations.push({ kind: "nonzero-exit", command: receipt.command, exitStatus: receipt.exitStatus });
    }
    if (receipt.cgroupPeakBytes >= record.memoryBoundBytes) {
      violations.push({
        kind: "cgroup-bound",
        command: receipt.command,
        peakBytes: receipt.cgroupPeakBytes,
        boundBytes: record.memoryBoundBytes,
      });
    }
    for (const event of leanMemoryEventNames) {
      const count = receipt.memoryEvents[event];
      if (count !== 0) {
        violations.push({ kind: "memory-event", command: receipt.command, event, count });
      }
    }
  }
  return violations;
}

export function formatLeanMemoryAcceptanceViolation(
  violation: LeanMemoryAcceptanceViolation,
): string {
  switch (violation.kind) {
    case "nonzero-exit":
      return `${violation.command} exited ${violation.exitStatus}`;
    case "cgroup-bound":
      return `${violation.command} reached cgroup peak ${violation.peakBytes} at or above bound ${violation.boundBytes}`;
    case "memory-event":
      return `${violation.command} recorded memory.events ${violation.event}=${violation.count}`;
  }
}

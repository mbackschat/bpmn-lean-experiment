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
  | { kind: "memory-bound-configuration"; actualBytes: number; expectedBytes: number }
  | { kind: "missing-command"; command: string }
  | { kind: "duplicate-command"; command: string }
  | { kind: "unknown-command"; command: string }
  | { kind: "baseline-missing-command"; command: string }
  | { kind: "baseline-duplicate-command"; command: string }
  | { kind: "baseline-unknown-command"; command: string }
  | { kind: "measurement-ratchet"; command: string }
  | { kind: "nonzero-exit"; command: string; exitStatus: number }
  | { kind: "cgroup-bound"; command: string; peakBytes: number; boundBytes: number }
  | { kind: "memory-event"; command: string; event: LeanMemoryEventName; count: number }
>;

export const leanMemoryBoundBytes = 3_221_225_472;

export const leanMemoryRequiredCommands = [
  "./scripts/lake.sh test",
  "./scripts/lake.sh build",
] as const;

export const leanMemoryAcceptanceRecord = {
  memoryBoundBytes: leanMemoryBoundBytes,
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

function hasSameMeasurementIdentity(
  receipt: LeanMemoryAcceptanceReceipt,
  baseline: LeanMemoryAcceptanceReceipt,
): boolean {
  return receipt.measuredAtCommit === baseline.measuredAtCommit &&
    receipt.outputSha256 === baseline.outputSha256;
}

function hasSameMeasurementTuple(
  receipt: LeanMemoryAcceptanceReceipt,
  baseline: LeanMemoryAcceptanceReceipt,
): boolean {
  return receipt.exitStatus === baseline.exitStatus &&
    receipt.cgroupPeakBytes === baseline.cgroupPeakBytes &&
    leanMemoryEventNames.every(
      (event) => receipt.memoryEvents[event] === baseline.memoryEvents[event],
    );
}

/**
 * Rejects incomplete, reconfigured, or mutated evidence as well as pressure.
 *
 * The caller supplies the preceding committed record. A current record cannot
 * serve as that baseline because changing both together would hide the drift.
 */
export function leanMemoryAcceptanceViolations(
  record: LeanMemoryAcceptanceRecord,
  baseline: LeanMemoryAcceptanceRecord,
): LeanMemoryAcceptanceViolation[] {
  const violations: LeanMemoryAcceptanceViolation[] = [];
  if (record.memoryBoundBytes !== leanMemoryBoundBytes) {
    violations.push({
      kind: "memory-bound-configuration",
      actualBytes: record.memoryBoundBytes,
      expectedBytes: leanMemoryBoundBytes,
    });
  }
  for (const command of leanMemoryRequiredCommands) {
    const matching = record.receipts.filter((receipt) => receipt.command === command);
    const baselineMatching = baseline.receipts.filter(
      (receipt) => receipt.command === command,
    );
    if (baselineMatching.length === 0) {
      violations.push({ kind: "baseline-missing-command", command });
    } else if (baselineMatching.length > 1) {
      violations.push({ kind: "baseline-duplicate-command", command });
    }
    if (matching.length === 0) {
      violations.push({ kind: "missing-command", command });
      continue;
    }
    if (matching.length > 1) {
      violations.push({ kind: "duplicate-command", command });
      continue;
    }
    const [receipt] = matching;
    if (receipt === undefined) continue;
    if (receipt.exitStatus !== 0) {
      violations.push({ kind: "nonzero-exit", command: receipt.command, exitStatus: receipt.exitStatus });
    }
    if (receipt.cgroupPeakBytes >= leanMemoryBoundBytes) {
      violations.push({
        kind: "cgroup-bound",
        command: receipt.command,
        peakBytes: receipt.cgroupPeakBytes,
        boundBytes: leanMemoryBoundBytes,
      });
    }
    for (const event of leanMemoryEventNames) {
      const count = receipt.memoryEvents[event];
      if (count !== 0) {
        violations.push({ kind: "memory-event", command: receipt.command, event, count });
      }
    }
    const [baselineReceipt] = baselineMatching;
    if (
      baselineReceipt !== undefined &&
      hasSameMeasurementIdentity(receipt, baselineReceipt) &&
      !hasSameMeasurementTuple(receipt, baselineReceipt)
    ) {
      violations.push({ kind: "measurement-ratchet", command: receipt.command });
    }
  }
  const acceptedCommands = new Set<string>(
    leanMemoryRequiredCommands,
  );
  for (const receipt of record.receipts) {
    if (!acceptedCommands.has(receipt.command)) {
      violations.push({ kind: "unknown-command", command: receipt.command });
    }
  }
  for (const receipt of baseline.receipts) {
    if (!acceptedCommands.has(receipt.command)) {
      violations.push({ kind: "baseline-unknown-command", command: receipt.command });
    }
  }
  return violations;
}

export function formatLeanMemoryAcceptanceViolation(
  violation: LeanMemoryAcceptanceViolation,
): string {
  switch (violation.kind) {
    case "memory-bound-configuration":
      return `Lean memory bound ${violation.actualBytes} differs from fixed bound ${violation.expectedBytes}`;
    case "missing-command":
      return `missing required Lean memory receipt for ${violation.command}`;
    case "duplicate-command":
      return `duplicate Lean memory receipt for ${violation.command}`;
    case "unknown-command":
      return `unknown Lean memory receipt command ${violation.command}`;
    case "baseline-missing-command":
      return `prior committed Lean memory record is missing ${violation.command}`;
    case "baseline-duplicate-command":
      return `prior committed Lean memory record duplicates ${violation.command}`;
    case "baseline-unknown-command":
      return `prior committed Lean memory record has unknown command ${violation.command}`;
    case "measurement-ratchet":
      return `${violation.command} measurement tuple changed without a new commit and output digest`;
    case "nonzero-exit":
      return `${violation.command} exited ${violation.exitStatus}`;
    case "cgroup-bound":
      return `${violation.command} reached cgroup peak ${violation.peakBytes} at or above bound ${violation.boundBytes}`;
    case "memory-event":
      return `${violation.command} recorded memory.events ${violation.event}=${violation.count}`;
  }
}

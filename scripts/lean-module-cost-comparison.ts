/** Pure comparison of recorded Lean memory evidence; see [the cost record](./lean-module-cost.ts). */

import {
  derivedNearCapModules,
  measurementIdentityFor,
  nearCapThresholdKib,
  type LeanModuleCostBaseline,
  type LeanModuleCostProvenance,
  type LeanModuleCostRecord,
  type LeanModuleCostViolation,
  type LeanModuleMeasurementSourceMismatch,
} from "./lean-module-cost.ts";

/**
 * Rejects a provenance field that is empty or otherwise unusable.
 *
 * Fields are read from the object's own keys rather than a written list, so a
 * field added to the provenance type is covered without a second edit. Any
 * value that is neither a non-empty string nor a positive integer fails closed.
 */
function provenanceViolations(
  provenance: LeanModuleCostProvenance,
): LeanModuleCostViolation[] {
  const violations: LeanModuleCostViolation[] = [];
  for (const [field, value] of Object.entries(provenance)) {
    if (typeof value === "string") {
      if (value.trim().length === 0) {
        violations.push({ kind: "incomplete-provenance", field, reason: "is empty" });
      }
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isInteger(value) || value <= 0) {
        violations.push({
          kind: "incomplete-provenance",
          field,
          reason: `is not a positive integer (${String(value)})`,
        });
      }
      continue;
    }
    violations.push({
      kind: "incomplete-provenance",
      field,
      reason: `is not a recordable provenance value (${typeof value})`,
    });
  }
  return violations;
}

function completenessViolations(
  record: LeanModuleCostRecord,
  trackedModules: readonly string[],
): LeanModuleCostViolation[] {
  const violations: LeanModuleCostViolation[] = [];
  const recorded = new Set<string>();
  for (const row of record.rows) {
    if (recorded.has(row.module)) {
      violations.push({ kind: "duplicate-row", module: row.module });
      continue;
    }
    recorded.add(row.module);
  }
  const tracked = new Set(trackedModules);
  for (const module of [...tracked].sort()) {
    if (!recorded.has(module)) {
      violations.push({ kind: "missing-row", module });
    }
  }
  for (const module of [...recorded].sort()) {
    if (!tracked.has(module)) {
      violations.push({ kind: "unknown-row", module });
    }
  }
  return violations;
}

/**
 * Rejects any recorded figure changed from its baseline under the same
 * measurement identity.
 *
 * A lowered figure can hide a near-cap module just as an inflated figure can
 * misstate its cost. Either direction therefore requires a new immutable
 * measurement target.
 */
function ratchetViolations(
  record: LeanModuleCostRecord,
  baseline: LeanModuleCostBaseline | null,
): LeanModuleCostViolation[] {
  if (baseline === null) {
    return [];
  }
  const baselineMeasurements = new Map(
    baseline.measurements.map(([module, kib, measuredAtCommit, sourceSha256]) => [
      module,
      { kib, measuredAtCommit, sourceSha256 },
    ]),
  );
  const violations: LeanModuleCostViolation[] = [];
  for (const row of record.rows) {
    const previous = baselineMeasurements.get(row.module);
    const measuredAtCommit = measurementIdentityFor(record, row);
    if (row.measurementReceiptSha256 === undefined && previous?.measuredAtCommit !== measuredAtCommit) {
      violations.push({
        kind: "measurement-source-mismatch",
        module: row.module,
        measuredAtCommit,
        reason: "new measurement requires a receipt digest",
      });
    }
    const sourceChanged = previous?.sourceSha256 !== undefined && previous.sourceSha256 !== row.sourceSha256;
    if (
      previous !== undefined &&
      previous.measuredAtCommit === measuredAtCommit &&
      (row.peakResidentKib !== previous.kib || sourceChanged)
    ) {
      violations.push({
        kind: "changed-without-remeasurement",
        module: row.module,
        baselineKib: previous.kib,
        recordedKib: row.peakResidentKib,
        measuredAtCommit,
        sourceChanged,
      });
    }
  }
  return violations;
}

function measurementSourceViolations(
  mismatches: readonly LeanModuleMeasurementSourceMismatch[],
): LeanModuleCostViolation[] {
  return [...mismatches]
    .sort((left, right) =>
      left.module < right.module ? -1 : left.module > right.module ? 1 : 0,
    )
    .map((mismatch) => ({ kind: "measurement-source-mismatch" as const, ...mismatch }));
}

function disclosureViolations(record: LeanModuleCostRecord): LeanModuleCostViolation[] {
  const thresholdKib = nearCapThresholdKib(record.provenance);
  const derived = new Set(derivedNearCapModules(record));
  const declared = new Set(record.nearCapModules);
  const violations: LeanModuleCostViolation[] = [];
  for (const module of [...derived].sort()) {
    if (!declared.has(module)) {
      const recordedKib = record.rows.find((row) => row.module === module)?.peakResidentKib ?? 0;
      violations.push({ kind: "undisclosed-near-cap", module, recordedKib, thresholdKib });
    }
  }
  for (const module of [...declared].sort()) {
    if (!derived.has(module)) {
      violations.push({ kind: "stale-near-cap-disclosure", module, thresholdKib });
    }
  }
  return violations;
}

/**
 * Reports every way the recorded cost surface has drifted from what binds it.
 *
 * Inputs are injected rather than read from the repository so each separating
 * case is testable without adding, renaming, or deleting a Lean module. The
 * returned order is deterministic: provenance, completeness, ratchet, then
 * disclosure, each sorted by module.
 */
export function leanModuleCostViolations(
  comparison: Readonly<{
    record: LeanModuleCostRecord;
    baseline: LeanModuleCostBaseline | null;
    trackedModules: readonly string[];
    measurementSourceMismatches: readonly LeanModuleMeasurementSourceMismatch[];
  }>,
): LeanModuleCostViolation[] {
  return [
    ...provenanceViolations(comparison.record.provenance),
    ...completenessViolations(comparison.record, comparison.trackedModules),
    ...measurementSourceViolations(comparison.measurementSourceMismatches),
    ...ratchetViolations(comparison.record, comparison.baseline),
    ...disclosureViolations(comparison.record),
  ];
}

export function formatLeanModuleCostViolation(violation: LeanModuleCostViolation): string {
  switch (violation.kind) {
    case "incomplete-provenance":
      return `provenance field ${violation.field} ${violation.reason}`;
    case "duplicate-row":
      return `${violation.module} is recorded more than once`;
    case "missing-row":
      return `${violation.module} is a tracked conformance module with no recorded row`;
    case "unknown-row":
      return `${violation.module} has a recorded row but is not a tracked conformance module`;
    case "changed-without-remeasurement":
      if (violation.sourceChanged) return `${violation.module} changed source while its measurement target remains ${violation.measuredAtCommit}`;
      return `${violation.module} changed from ${violation.baselineKib} to ${violation.recordedKib} KiB while its measurement target remains ${violation.measuredAtCommit}`;
    case "measurement-source-mismatch":
      return `${violation.module} does not match measurement target ${violation.measuredAtCommit}: ${violation.reason}`;
    case "undisclosed-near-cap":
      return `${violation.module} at ${violation.recordedKib} KiB is at or above the ${violation.thresholdKib} KiB near-cap threshold and is absent from nearCapModules`;
    case "stale-near-cap-disclosure":
      return `${violation.module} is declared in nearCapModules but is below the ${violation.thresholdKib} KiB near-cap threshold`;
    default: {
      const unhandled: never = violation;
      throw new TypeError(`unhandled cost violation ${JSON.stringify(unhandled)}`);
    }
  }
}

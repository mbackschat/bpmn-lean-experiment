/**
 * Recorded per-module cost of the Lean conformance corpus, plus the pure
 * comparison that keeps that record complete, ratcheted, and disclosed.
 *
 * Every conformance module kernel-decides fixtures, and kernel reduction holds
 * its terms in resident memory, so the corpus carries a host-memory cost that
 * grows with every capsule. [`lean-module-cost.test.ts`](lean-module-cost.test.ts)
 * is the guard that enforces this record.
 *
 * Keep this module free of import-time side effects and of runtime imports that
 * need the workspace path mapping. The ratchet obtains its baseline by loading
 * this file's own previous committed revision from a temporary directory, so an
 * older revision must import safely and resolve outside the repository.
 */

import type { DeepReadonly } from "@bpmn-lean/contract-types";

/**
 * One measured module.
 *
 * `peakResidentKib` is GNU `time`'s `ru_maxrss` in KiB, exactly as measured.
 * `elapsedSeconds` is recorded as reading context only and is deliberately not
 * ratcheted: memory is the resource that terminates a build, and rebuild time
 * cannot manufacture the headroom that a raised memory figure would.
 */
export type LeanModuleCostRow = DeepReadonly<{
  module: string;
  peakResidentKib: number;
  elapsedSeconds: number;
  measuredAtCommit?: string;
}>;

export type LeanModuleCostProvenance = DeepReadonly<{
  measuredAtCommit: string;
  leanVersion: string;
  leanCommit: string;
  containerImage: string;
  containerImageId: string;
  leanNumThreads: string;
  cpuAllowance: string;
  memoryBoundBytes: number;
  swapPolicy: string;
  enforcementBackend: string;
  cacheState: string;
  accountingCaveat: string;
}>;

export type LeanModuleCostRecord = DeepReadonly<{
  provenance: LeanModuleCostProvenance;
  nearCapModules: readonly string[];
  rows: readonly LeanModuleCostRow[];
}>;

/** The subset of a record the ratchet compares against, and all it needs. */
export type LeanModuleCostBaseline = DeepReadonly<{
  measurements: readonly (readonly [string, number, string])[];
}>;

export type LeanModuleMeasurementSourceMismatch = DeepReadonly<{
  module: string;
  measuredAtCommit: string;
  reason: string;
}>;

export const leanModuleCostViolationKinds = {
  incompleteProvenance: "incomplete-provenance",
  duplicateRow: "duplicate-row",
  missingRow: "missing-row",
  unknownRow: "unknown-row",
  changedWithoutRemeasurement: "changed-without-remeasurement",
  measurementSourceMismatch: "measurement-source-mismatch",
  undisclosedNearCap: "undisclosed-near-cap",
  staleNearCapDisclosure: "stale-near-cap-disclosure",
} as const;

export type LeanModuleCostViolation = DeepReadonly<
  | { kind: "incomplete-provenance"; field: string; reason: string }
  | { kind: "duplicate-row"; module: string }
  | { kind: "missing-row"; module: string }
  | { kind: "unknown-row"; module: string }
  | {
      kind: "changed-without-remeasurement";
      module: string;
      baselineKib: number;
      recordedKib: number;
      measuredAtCommit: string;
    }
  | {
      kind: "measurement-source-mismatch";
      module: string;
      measuredAtCommit: string;
      reason: string;
    }
  | { kind: "undisclosed-near-cap"; module: string; recordedKib: number; thresholdKib: number }
  | { kind: "stale-near-cap-disclosure"; module: string; thresholdKib: number }
>;

/**
 * Fraction of the measured memory bound above which a module must be disclosed.
 *
 * There is deliberately no absolute ceiling that rows must stay under. Three
 * recorded rows already exceed the enforced bound without having been killed,
 * for the accounting reason stated in `accountingCaveat`, so a ceiling
 * assertion would be either unpassable or an invitation to raise the bound to
 * go green. The ratchet plus this disclosure is the whole enforcement design.
 */
export const nearCapFraction = 0.9;

export function nearCapThresholdKib(provenance: LeanModuleCostProvenance): number {
  return (provenance.memoryBoundBytes * nearCapFraction) / 1024;
}

export const leanModuleCostRecord = {
  provenance: {
    measuredAtCommit: "d878f38e",
    leanVersion: "4.31.0",
    leanCommit: "68218e876d2a38b1985b8590fff244a83c321783",
    containerImage: "bpmn-lean-audit:v4.31.0-arm64",
    containerImageId: "sha256:4df22c7a1ec8",
    leanNumThreads: "1",
    cpuAllowance: "--cpus=1",
    memoryBoundBytes: 3221225472,
    swapPolicy: "--memory-swap=3g, no additional swap",
    enforcementBackend: "Linux container on macOS (Docker Desktop VM)",
    cacheState:
      "warm dependency closure; only the measured target's own .olean/.ilean/hash/trace/C/setup artifacts removed",
    accountingCaveat:
      "Three modules report ru_maxrss above the cgroup ceiling without being OOM-killed, because Docker Desktop on macOS runs a Linux VM and GNU time's resident-set accounting does not align exactly with cgroup charging, so these figures are comparable with each other but only approximately comparable to the ledger's exit-137 row.",
  },
  nearCapModules: [
    "BpmnSemantics.MessageStartConformance",
    "BpmnSemantics.SequentialMultiInstanceConformance",
    "BpmnSemantics.FlowNodeOccurrenceLifecycleConformance",
    "BpmnSemantics.RuntimeStateWellFormedConformance",
    "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance",
    "BpmnSemantics.CallActivityConformance",
    "BpmnSemantics.TerminateEndEventConformance",
  ],
  rows: [
    {
      module: "BpmnSemantics.MessageStartConformance",
      peakResidentKib: 3116780,
      elapsedSeconds: 33.77,
      measuredAtCommit: "826231ab",
    },
    {
      module: "BpmnSemantics.SequentialMultiInstanceConformance",
      peakResidentKib: 2909240,
      elapsedSeconds: 30.35,
      measuredAtCommit: "42f152de",
    },
    {
      module: "BpmnSemantics.FlowNodeOccurrenceLifecycleConformance",
      peakResidentKib: 3089764,
      elapsedSeconds: 60.95,
      measuredAtCommit: "b9c1c586",
    },
    { module: "BpmnSemantics.RuntimeStateWellFormedConformance", peakResidentKib: 3063008, elapsedSeconds: 31.0 },
    { module: "BpmnSemantics.CallActivityConformance", peakResidentKib: 2898756, elapsedSeconds: 21.5 },
    {
      module: "BpmnSemantics.SequentialMultiInstanceProgramBindingConformance",
      peakResidentKib: 2854664,
      elapsedSeconds: 27.38,
      measuredAtCommit: "42f152de",
    },
    {
      module: "BpmnSemantics.TimerStartConformance",
      peakResidentKib: 2785532,
      elapsedSeconds: 25.5,
      measuredAtCommit: "826231ab",
    },
    {
      module: "BpmnSemantics.ServiceTaskIncidentCancellationConformance",
      peakResidentKib: 2825860,
      elapsedSeconds: 27.55,
      measuredAtCommit: "b9c1c586",
    },
    { module: "BpmnSemantics.RuntimeStateActivityConformance", peakResidentKib: 2792548, elapsedSeconds: 30.5 },
    { module: "BpmnSemantics.ParallelUserTaskMetadataCompositionConformance", peakResidentKib: 2718336, elapsedSeconds: 24.6 },
    {
      module: "BpmnSemantics.SemanticProcessAdmissionConformance",
      peakResidentKib: 2713164,
      elapsedSeconds: 17.08,
      measuredAtCommit: "a52f0c39",
    },
    { module: "BpmnSemantics.EventBasedGatewayConformance", peakResidentKib: 2602076, elapsedSeconds: 15.3 },
    { module: "BpmnSemantics.SubProcessErrorPropagationConformance", peakResidentKib: 2494312, elapsedSeconds: 24.0 },
    { module: "BpmnSemantics.SubProcessBoundaryTimerConformance", peakResidentKib: 2388920, elapsedSeconds: 16.9 },
    {
      module: "BpmnSemantics.CommittedExecutionPublicationConformance",
      peakResidentKib: 2344512,
      elapsedSeconds: 18.42,
      measuredAtCommit: "826231ab",
    },
    { module: "BpmnSemantics.IntermediateCatchMessageConformance", peakResidentKib: 2225108, elapsedSeconds: 11.7 },
    {
      module: "BpmnSemantics.TerminateEndEventConformance",
      peakResidentKib: 2994020,
      elapsedSeconds: 31.03,
      measuredAtCommit: "b9c1c586",
    },
    { module: "BpmnSemantics.SemanticProcessConformance", peakResidentKib: 2203824, elapsedSeconds: 8.9 },
    { module: "BpmnSemantics.ServiceTaskIncidentRetryConformance", peakResidentKib: 2179620, elapsedSeconds: 13.8 },
    { module: "BpmnSemantics.NonInterruptingBoundaryTimerConformance", peakResidentKib: 2176108, elapsedSeconds: 13.9 },
    {
      module: "BpmnSemantics.ActivityDataInputConformance",
      peakResidentKib: 2168720,
      elapsedSeconds: 8.63,
      measuredAtCommit: "f92b61d4",
    },
    { module: "BpmnSemantics.ActivityBoundaryTimerConformance", peakResidentKib: 2146500, elapsedSeconds: 13.5 },
    {
      module: "BpmnSemantics.MappedSuccessConformance",
      peakResidentKib: 2139596,
      elapsedSeconds: 13.73,
      measuredAtCommit: "b9c1c586",
    },
    { module: "BpmnSemantics.InclusiveGatewayConformance", peakResidentKib: 2120328, elapsedSeconds: 13.1 },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowClosureConformance", peakResidentKib: 1981884, elapsedSeconds: 24.5 },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowConformance", peakResidentKib: 1954580, elapsedSeconds: 9.9 },
    { module: "BpmnSemantics.EmbeddedSubProcessCompletionConformance", peakResidentKib: 1926344, elapsedSeconds: 11.0 },
    {
      module: "BpmnSemantics.InternalCommutationConformance",
      peakResidentKib: 1884012,
      elapsedSeconds: 14.77,
      measuredAtCommit: "b9c1c586",
    },
    {
      module: "BpmnSemantics.UserTaskMetadataConformance",
      peakResidentKib: 1648308,
      elapsedSeconds: 8.16,
      measuredAtCommit: "f92b61d4",
    },
    { module: "BpmnSemantics.ReceiveTaskConformance", peakResidentKib: 1679876, elapsedSeconds: 19.3 },
    { module: "BpmnSemantics.RuntimeStateIdentityBoundConformance", peakResidentKib: 1676016, elapsedSeconds: 10.7 },
    { module: "BpmnSemantics.UserTaskInteractionConformance", peakResidentKib: 1592552, elapsedSeconds: 7.3 },
    { module: "BpmnSemantics.ConfiguredTaskConformance", peakResidentKib: 1501936, elapsedSeconds: 7.7 },
    { module: "BpmnSemantics.MappedBoundaryErrorConformance", peakResidentKib: 1463248, elapsedSeconds: 7.2 },
    { module: "BpmnSemantics.BooleanProcessDataConformance", peakResidentKib: 1405164, elapsedSeconds: 3.8 },
    { module: "BpmnSemantics.ActivityBodyTurnoverConformance", peakResidentKib: 1382440, elapsedSeconds: 3.8 },
    {
      module: "BpmnSemantics.ActivityBodyClaimUniquenessConformance",
      peakResidentKib: 1662532,
      elapsedSeconds: 7.64,
      measuredAtCommit: "95b011b1",
    },
    { module: "BpmnSemantics.ServiceTaskEffectConformance", peakResidentKib: 1349428, elapsedSeconds: 5.6 },
    { module: "BpmnSemantics.IntermediateCatchTimerConformance", peakResidentKib: 1296244, elapsedSeconds: 5.3 },
    { module: "BpmnSemantics.ParallelBalancedTopologyConformance", peakResidentKib: 1201352, elapsedSeconds: 2.9 },
    {
      module: "BpmnSemantics.StructuredHumanWorkConformance",
      peakResidentKib: 1054660,
      elapsedSeconds: 3.46,
      measuredAtCommit: "826231ab",
    },
    { module: "BpmnSemantics.UserTaskCompletionDataConformance", peakResidentKib: 934608, elapsedSeconds: 2.0 },
    { module: "BpmnSemantics.ProcessStartDataConformance", peakResidentKib: 892876, elapsedSeconds: 4.1 },
    {
      module: "BpmnSemantics.ParallelMultiInstanceConformance",
      peakResidentKib: 1433212,
      elapsedSeconds: 3.32,
      measuredAtCommit: "42f152de",
    },
    { module: "BpmnSemantics.Experiments.CheckedSourceFrontierConformance", peakResidentKib: 839556, elapsedSeconds: 3.9 },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowReachabilityConformance", peakResidentKib: 831764, elapsedSeconds: 3.6 },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowStepCompletenessConformance", peakResidentKib: 808416, elapsedSeconds: 3.3 },
    { module: "BpmnSemantics.SemanticProcess.CyclicControlFlowExecutionConformance", peakResidentKib: 772200, elapsedSeconds: 1.4 },
    {
      module: "BpmnSemantics.SemanticProcessJsonConformance",
      peakResidentKib: 662580,
      elapsedSeconds: 0.55,
      measuredAtCommit: "ffbf7b24",
    },
    { module: "BpmnSemantics.ExclusiveGatewaySimpleBooleanConformance", peakResidentKib: 646452, elapsedSeconds: 0.7 },
    { module: "BpmnSemantics.ActivityIssuingDisciplineConformance", peakResidentKib: 614068, elapsedSeconds: 0.8 },
    { module: "BpmnSemantics.Conformance", peakResidentKib: 508576, elapsedSeconds: 0.3 },
    { module: "BpmnSemantics.ParallelForkJoinConformance", peakResidentKib: 500536, elapsedSeconds: 0.3 },
  ],
} as const satisfies LeanModuleCostRecord;

export function measurementCommitFor(
  record: LeanModuleCostRecord,
  row: LeanModuleCostRow,
): string {
  return row.measuredAtCommit ?? record.provenance.measuredAtCommit;
}

export function leanModuleCostBaseline(record: LeanModuleCostRecord): LeanModuleCostBaseline {
  return {
    measurements: record.rows.map(
      (row) =>
        [row.module, row.peakResidentKib, measurementCommitFor(record, row)] as const,
    ),
  };
}

export function derivedNearCapModules(record: LeanModuleCostRecord): string[] {
  const thresholdKib = nearCapThresholdKib(record.provenance);
  return record.rows
    .filter((row) => row.peakResidentKib >= thresholdKib)
    .map((row) => row.module)
    .sort();
}

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
 * measurement commit.
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
    baseline.measurements.map(([module, kib, measuredAtCommit]) => [
      module,
      { kib, measuredAtCommit },
    ]),
  );
  const violations: LeanModuleCostViolation[] = [];
  for (const row of record.rows) {
    const previous = baselineMeasurements.get(row.module);
    const measuredAtCommit = measurementCommitFor(record, row);
    if (
      previous !== undefined &&
      previous.measuredAtCommit === measuredAtCommit &&
      row.peakResidentKib !== previous.kib
    ) {
      violations.push({
        kind: "changed-without-remeasurement",
        module: row.module,
        baselineKib: previous.kib,
        recordedKib: row.peakResidentKib,
        measuredAtCommit,
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

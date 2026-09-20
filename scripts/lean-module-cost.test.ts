import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import {
  derivedNearCapModules,
  leanModuleCostBaseline,
  leanModuleCostRecord,
  measurementIdentityFor,
  nearCapThresholdKib,
  type LeanModuleCostBaseline,
  type LeanModuleCostRecord,
  type LeanModuleCostViolation,
  type LeanModuleMeasurementSourceMismatch,
} from "./lean-module-cost.ts";
import {
  formatLeanModuleCostViolation,
  leanModuleCostViolations,
} from "./lean-module-cost-comparison.ts";
import {
  formatLeanMemoryAcceptanceViolation,
  leanMemoryAcceptanceRecord,
  leanMemoryAcceptanceViolations,
  type LeanMemoryAcceptanceRecord,
} from "./lean-memory-acceptance.ts";

const recordPath = "scripts/lean-module-cost.ts";
const acceptanceRecordPath = "scripts/lean-memory-acceptance.ts";

/**
 * Conformance modules the repository currently carries, derived rather than written.
 *
 * The completeness comparison would be worthless against a hand-written module
 * list, because that list could drift in exactly the way the recorded rows can.
 * `--others --exclude-standard` includes a pending module, so adding one fails
 * the guard before it is committed; the `BpmnSemantics/` pathspec is anchored at
 * the repository root, so the two `adoption/` conformance files never match.
 * `BpmnSemantics/Experiments/` is included: its provisional status governs
 * semantic authority, not host memory, and an experiment module that drifted
 * toward the bound unrecorded would be graduated already over-cap.
 */
function trackedConformanceModules(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "BpmnSemantics/"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((sourcePath) => sourcePath.endsWith("Conformance.lean"))
    .filter((sourcePath) => existsSync(sourcePath))
    .map((sourcePath) => sourcePath.replaceAll("/", ".").replace(/\.lean$/u, ""))
    .sort();
}

function narrowBaseline(loaded: unknown): LeanModuleCostBaseline {
  if (loaded === null || typeof loaded !== "object" || !("leanModuleCostRecord" in loaded)) {
    throw new TypeError(`${recordPath} at HEAD exports no leanModuleCostRecord`);
  }
  const previous: unknown = loaded.leanModuleCostRecord;
  if (
    previous === null ||
    typeof previous !== "object" ||
    !("provenance" in previous) ||
    previous.provenance === null ||
    typeof previous.provenance !== "object" ||
    !("measuredAtCommit" in previous.provenance) ||
    typeof previous.provenance.measuredAtCommit !== "string" ||
    !("rows" in previous) ||
    !Array.isArray(previous.rows)
  ) {
    throw new TypeError(`${recordPath} at HEAD carries no readable cost baseline`);
  }
  const defaultMeasuredAtCommit = previous.provenance.measuredAtCommit;
  const measurements = previous.rows.map((row: unknown): readonly [string, number, string, string] => {
    if (
      row === null ||
      typeof row !== "object" ||
      !("module" in row) ||
      typeof row.module !== "string" ||
      !("peakResidentKib" in row) ||
      typeof row.peakResidentKib !== "number"
    ) {
      throw new TypeError(`${recordPath} at HEAD carries an unreadable row`);
    }
    const measuredAtCommit =
      "measuredAtCommit" in row && typeof row.measuredAtCommit === "string"
        ? row.measuredAtCommit
        : defaultMeasuredAtCommit;
    const identity = "measurementReceiptSha256" in row && typeof row.measurementReceiptSha256 === "string"
      ? row.measurementReceiptSha256 : measuredAtCommit;
    const sourceSha256 = "sourceSha256" in row && typeof row.sourceSha256 === "string"
      ? row.sourceSha256
      : createHash("sha256").update(execFileSync("git", ["show",
        `${measuredAtCommit}:${moduleSourcePath(row.module)}`], { maxBuffer: 8 * 1024 * 1024 })).digest("hex");
    return [row.module, row.peakResidentKib, identity, sourceSha256];
  });
  return { measurements };
}

function moduleSourcePath(module: string): string {
  return `${module.replaceAll(".", "/")}.lean`;
}

function measurementSourceMismatches(
  record: LeanModuleCostRecord,
  readSource: (sourcePath: string) => Uint8Array = (sourcePath) => readFileSync(sourcePath),
): LeanModuleMeasurementSourceMismatch[] {
  return record.rows.flatMap((row) => {
    const sourcePath = moduleSourcePath(row.module);
    const measuredAtCommit = measurementIdentityFor(record, row);
    if (!/^[0-9a-f]{64}$/u.test(row.sourceSha256)) {
      return [{ module: row.module, measuredAtCommit, reason: "invalid source digest" }];
    }
    if (row.measurementReceiptSha256 !== undefined && !/^[0-9a-f]{64}$/u.test(row.measurementReceiptSha256)) {
      return [{ module: row.module, measuredAtCommit, reason: "invalid measurement receipt digest" }];
    }
    try {
      const actual = createHash("sha256").update(readSource(sourcePath)).digest("hex");
      return actual === row.sourceSha256 ? []
        : [{ module: row.module, measuredAtCommit, reason: "source bytes changed" }];
    } catch {
      return [{ module: row.module, measuredAtCommit, reason: "source is unavailable" }];
    }
  });
}

/**
 * The recorded cost surface as of the committed `HEAD`, or `null` before it exists.
 *
 * A ratchet needs history, and Git is the only history available, so the
 * previous revision is loaded as data rather than lexed out of source text: a
 * reformat of the record must not be able to defeat or falsely trip the check.
 * The `.mts` extension makes Node treat the extracted revision as ESM without a
 * package manifest beside it. This is why the record module must stay free of
 * import-time side effects and of runtime imports needing the workspace paths.
 *
 * `null` means the record has no committed predecessor, so the commit that
 * introduces it establishes the baseline and constrains every later change.
 */
async function committedBaseline(): Promise<LeanModuleCostBaseline | null> {
  const listed = execFileSync("git", ["ls-tree", "--name-only", "HEAD", "--", recordPath], {
    encoding: "utf8",
  }).trim();
  if (listed.length === 0) {
    return null;
  }
  const source = execFileSync("git", ["show", `HEAD:${recordPath}`], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const directory = mkdtempSync(join(tmpdir(), "lean-module-cost-baseline-"));
  try {
    const file = join(directory, "baseline.mts");
    writeFileSync(file, source, "utf8");
    return narrowBaseline(await import(pathToFileURL(file).href));
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function acceptanceBaselineRef(): string {
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--", acceptanceRecordPath],
    { encoding: "utf8" },
  ).trim();
  return status.length === 0 ? "HEAD^" : "HEAD";
}

/**
 * Loads the receipt record from the revision immediately before the candidate.
 *
 * A dirty receipt file is a candidate against `HEAD`; a clean committed file is
 * a candidate against `HEAD^`. This keeps local pre-commit and hosted clean-tree
 * execution on the same comparison instead of letting either use itself.
 */
async function committedAcceptanceBaseline(): Promise<LeanMemoryAcceptanceRecord> {
  const ref = acceptanceBaselineRef();
  const source = execFileSync("git", ["show", `${ref}:${acceptanceRecordPath}`], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const directory = mkdtempSync(join(tmpdir(), "lean-memory-acceptance-baseline-"));
  try {
    const file = join(directory, "baseline.mts");
    writeFileSync(file, source, "utf8");
    const loaded: unknown = await import(pathToFileURL(file).href);
    if (
      loaded === null ||
      typeof loaded !== "object" ||
      !("leanMemoryAcceptanceRecord" in loaded)
    ) {
      throw new TypeError(
        `${acceptanceRecordPath} at ${ref} exports no leanMemoryAcceptanceRecord`,
      );
    }
    return loaded.leanMemoryAcceptanceRecord as LeanMemoryAcceptanceRecord;
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function messages(violations: readonly LeanModuleCostViolation[]): string[] {
  return violations.map((violation) => formatLeanModuleCostViolation(violation));
}

function acceptanceMessages(
  record: LeanMemoryAcceptanceRecord,
  baseline: LeanMemoryAcceptanceRecord = leanMemoryAcceptanceRecord,
): string[] {
  return leanMemoryAcceptanceViolations(record, baseline).map(
    formatLeanMemoryAcceptanceViolation,
  );
}

async function mutatedCanonicalAcceptanceModule(): Promise<{
  leanMemoryAcceptanceRecord: LeanMemoryAcceptanceRecord;
  leanMemoryAcceptanceViolations: typeof leanMemoryAcceptanceViolations;
  formatLeanMemoryAcceptanceViolation: typeof formatLeanMemoryAcceptanceViolation;
}> {
  const source = readFileSync(acceptanceRecordPath, "utf8");
  const [receipt] = leanMemoryAcceptanceRecord.receipts;
  const mutated = source.replace(/cgroupPeakBytes: ([\d_]+),/u, (_field, value: string) => {
    assert.equal(Number(value.replaceAll("_", "")), receipt.cgroupPeakBytes);
    return `cgroupPeakBytes: ${receipt.cgroupPeakBytes - 1},`;
  });
  assert.notEqual(mutated, source, "canonical receipt mutation did not match its source tuple");
  const directory = mkdtempSync(join(tmpdir(), "lean-memory-acceptance-mutation-"));
  try {
    const file = join(directory, "mutated.mts");
    writeFileSync(file, mutated, "utf8");
    const loaded: unknown = await import(pathToFileURL(file).href);
    if (
      loaded === null ||
      typeof loaded !== "object" ||
      !("leanMemoryAcceptanceRecord" in loaded) ||
      !("leanMemoryAcceptanceViolations" in loaded) ||
      !("formatLeanMemoryAcceptanceViolation" in loaded) ||
      typeof loaded.leanMemoryAcceptanceViolations !== "function" ||
      typeof loaded.formatLeanMemoryAcceptanceViolation !== "function"
    ) {
      throw new TypeError(`${acceptanceRecordPath} mutation exports no readable acceptance module`);
    }
    return loaded as {
      leanMemoryAcceptanceRecord: LeanMemoryAcceptanceRecord;
      leanMemoryAcceptanceViolations: typeof leanMemoryAcceptanceViolations;
      formatLeanMemoryAcceptanceViolation: typeof formatLeanMemoryAcceptanceViolation;
    };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function withRows(
  rewrite: (row: LeanModuleCostRecord["rows"][number]) => LeanModuleCostRecord["rows"][number],
): LeanModuleCostRecord {
  return { ...leanModuleCostRecord, rows: leanModuleCostRecord.rows.map(rewrite) };
}

const recordedModules = leanModuleCostRecord.rows.map((row) => row.module);
const selfBaseline = leanModuleCostBaseline(leanModuleCostRecord);
const messageStartMeasurement = selfBaseline.measurements.find(
  ([module]) => module === "BpmnSemantics.MessageStartConformance",
);
if (messageStartMeasurement === undefined) {
  throw new Error("the Message Start measurement row is missing");
}

test("every tracked conformance module has exactly one recorded, ratcheted, disclosed row", async () => {
  assert.deepEqual(
    messages(
      leanModuleCostViolations({
        record: leanModuleCostRecord,
        baseline: await committedBaseline(),
        trackedModules: trackedConformanceModules(),
        measurementSourceMismatches: measurementSourceMismatches(leanModuleCostRecord),
      }),
    ),
    [],
  );
});

test("the declared near-cap disclosure equals the set derived from the recorded rows", () => {
  assert.deepEqual(
    [...leanModuleCostRecord.nearCapModules].sort(),
    derivedNearCapModules(leanModuleCostRecord),
  );
});

test("new module measurements bind to archived bytes before the introducing commit exists", () => {
  const source = Buffer.from("theorem measured : True := True.intro\n");
  const digest = createHash("sha256").update(source).digest("hex");
  for (const module of ["BpmnSemantics.NewOneConformance", "BpmnSemantics.NewTwoConformance"]) {
    const record: LeanModuleCostRecord = {
      ...leanModuleCostRecord,
      rows: [{ module, peakResidentKib: 100, elapsedSeconds: 1,
        sourceSha256: digest, measurementReceiptSha256: "a".repeat(64) }],
    };
    assert.deepEqual(measurementSourceMismatches(record, () => source), []);
    assert.equal(measurementSourceMismatches(record, () => Buffer.from("changed\n")).length, 1);
    assert.equal(measurementSourceMismatches(record, () => { throw new Error("missing"); }).length, 1);
    assert.equal(measurementSourceMismatches({ ...record,
      rows: [{ ...record.rows[0]!, sourceSha256: "" }] }, () => source).length, 1);
    assert.equal(measurementSourceMismatches({ ...record,
      rows: [{ ...record.rows[0]!, measurementReceiptSha256: "not-a-receipt" }] }, () => source).length, 1);
  }
});

test("receipt identity permits a fresh measurement but provenance alone cannot bypass its ratchet", () => {
  const row = leanModuleCostRecord.rows[0]!;
  const measured: LeanModuleCostRecord = { ...leanModuleCostRecord,
    rows: [{ ...row, measurementReceiptSha256: "a".repeat(64) }] };
  const compare = (receipt: string, measuredAtCommit: string) => leanModuleCostViolations({
    record: { ...measured, rows: [{ ...measured.rows[0]!, peakResidentKib: row.peakResidentKib + 1,
      measurementReceiptSha256: receipt, measuredAtCommit }] },
    baseline: leanModuleCostBaseline(measured), trackedModules: [row.module], measurementSourceMismatches: [],
  });
  assert.equal(compare("a".repeat(64), "different-provenance").some(
    ({ kind }) => kind === "changed-without-remeasurement"), true);
  assert.deepEqual(compare("b".repeat(64), "same-provenance"), []);
  const changedSource = { ...measured, rows: [{ ...measured.rows[0]!, sourceSha256: "c".repeat(64) }] };
  assert.equal(leanModuleCostViolations({ record: changedSource,
    baseline: leanModuleCostBaseline(measured), trackedModules: [row.module], measurementSourceMismatches: [],
  }).length, 1, "an unchanged peak does not excuse changed source under the same measurement identity");
});

test("new and replacement measurements cannot borrow historical provenance without a receipt", () => {
  const row = { module: "BpmnSemantics.HistoricalConformance", peakResidentKib: 100,
    elapsedSeconds: 1, sourceSha256: "b".repeat(64), measuredAtCommit: "historical-provenance" };
  const historical: LeanModuleCostRecord = { ...leanModuleCostRecord, rows: [row] };
  for (const replacement of [
    { ...row, module: "BpmnSemantics.UnmeasuredConformance" },
    { ...row, measuredAtCommit: "different-provenance" },
  ]) {
    const violations = (measurementReceiptSha256?: string) => leanModuleCostViolations({
      record: { ...historical, rows: [measurementReceiptSha256 === undefined
        ? replacement : { ...replacement, measurementReceiptSha256 }] },
      baseline: leanModuleCostBaseline(historical), trackedModules: [replacement.module], measurementSourceMismatches: [],
    });
    assert.equal(violations().some(({ kind }) => kind === "measurement-source-mismatch"), true);
    assert.deepEqual(violations("a".repeat(64)), []);
  }
});

test("a conformance module with no recorded row fails completeness", () => {
  assert.deepEqual(
    messages(
      leanModuleCostViolations({
        record: leanModuleCostRecord,
        baseline: selfBaseline,
        trackedModules: [...recordedModules, "BpmnSemantics.NewlyAddedConformance"],
        measurementSourceMismatches: [],
      }),
    ),
    ["BpmnSemantics.NewlyAddedConformance is a tracked conformance module with no recorded row"],
  );
});

test("a recorded row for a module that no longer exists fails completeness", () => {
  assert.deepEqual(
    messages(
      leanModuleCostViolations({
        record: leanModuleCostRecord,
        baseline: selfBaseline,
        trackedModules: recordedModules.filter(
          (module) => module !== "BpmnSemantics.ReceiveTaskConformance",
        ),
        measurementSourceMismatches: [],
      }),
    ),
    [
      "BpmnSemantics.ReceiveTaskConformance has a recorded row but is not a tracked conformance module",
    ],
  );
});

test("a recorded peak changed under an unchanged measurement commit fails the ratchet", () => {
  const raised = withRows((row) =>
    row.module === "BpmnSemantics.MessageStartConformance"
      ? { ...row, peakResidentKib: row.peakResidentKib + 1 }
      : row,
  );
  assert.deepEqual(
    messages(
      leanModuleCostViolations({
        record: raised,
        baseline: selfBaseline,
        trackedModules: recordedModules,
        measurementSourceMismatches: [],
      }),
    ),
    [
      `BpmnSemantics.MessageStartConformance changed from ${messageStartMeasurement[1]} to ${messageStartMeasurement[1] + 1} KiB while its measurement target remains ${messageStartMeasurement[2]}`,
    ],
  );
  assert.deepEqual(
    leanModuleCostViolations({
      record: { ...raised, rows: raised.rows.map((row) =>
        row.module === "BpmnSemantics.MessageStartConformance"
          ? { ...row, measurementReceiptSha256: "a".repeat(64) } : row) },
      baseline: selfBaseline,
      trackedModules: recordedModules,
      measurementSourceMismatches: [],
    }),
    [],
  );
});

test("lowering a recorded peak without a new measurement target also fails the ratchet", () => {
  const lowered = withRows((row) =>
    row.module === "BpmnSemantics.MessageStartConformance"
      ? { ...row, peakResidentKib: row.peakResidentKib - 1 }
      : row,
  );
  assert.deepEqual(
    messages(
      leanModuleCostViolations({
        record: lowered,
        baseline: selfBaseline,
        trackedModules: recordedModules,
        measurementSourceMismatches: [],
      }),
    ),
    [
      `BpmnSemantics.MessageStartConformance changed from ${messageStartMeasurement[1]} to ${messageStartMeasurement[1] - 1} KiB while its measurement target remains ${messageStartMeasurement[2]}`,
    ],
  );
});

test("a source changed after its measurement target fails source binding", () => {
  assert.deepEqual(
    messages(
      leanModuleCostViolations({
        record: leanModuleCostRecord,
        baseline: selfBaseline,
        trackedModules: recordedModules,
        measurementSourceMismatches: [
          {
            module: "BpmnSemantics.SemanticProcessJsonConformance",
            measuredAtCommit: "d878f38e",
            reason: "source bytes changed",
          },
        ],
      }),
    ),
    [
      "BpmnSemantics.SemanticProcessJsonConformance does not match measurement target d878f38e: source bytes changed",
    ],
  );
});

test("a module crossing the near-cap threshold fails an unchanged disclosure", () => {
  const remeasured = withRows((row) =>
    row.module === "BpmnSemantics.SemanticProcessAdmissionConformance"
      ? { ...row, peakResidentKib: 2_900_000, measurementReceiptSha256: "a".repeat(64) }
      : row,
  );
  assert.deepEqual(
    messages(
      leanModuleCostViolations({
        record: remeasured,
        baseline: selfBaseline,
        trackedModules: recordedModules,
        measurementSourceMismatches: [],
      }),
    ),
    [
      `BpmnSemantics.SemanticProcessAdmissionConformance at 2900000 KiB is at or above the ${nearCapThresholdKib(leanModuleCostRecord.provenance)} KiB near-cap threshold and is absent from nearCapModules`,
    ],
  );
});

test("an empty provenance field fails completeness of the measurement account", () => {
  assert.deepEqual(
    messages(
      leanModuleCostViolations({
        record: {
          ...leanModuleCostRecord,
          provenance: { ...leanModuleCostRecord.provenance, containerImageId: "  " },
        },
        baseline: selfBaseline,
        trackedModules: recordedModules,
        measurementSourceMismatches: [],
      }),
    ),
    ["provenance field containerImageId is empty"],
  );
});

test("the repaired complete Lean receipts satisfy cgroup acceptance", async () => {
  assert.deepEqual(
    acceptanceMessages(leanMemoryAcceptanceRecord, await committedAcceptanceBaseline()),
    [],
  );
});

test("an exit-zero receipt at the exact cgroup bound fails acceptance", () => {
  const receipt = leanMemoryAcceptanceRecord.receipts[0];
  assert.ok(receipt !== undefined);
  assert.deepEqual(
    acceptanceMessages({
      ...leanMemoryAcceptanceRecord,
      receipts: leanMemoryAcceptanceRecord.receipts.map((candidate) =>
        candidate.command === receipt.command
          ? { ...candidate, cgroupPeakBytes: leanMemoryAcceptanceRecord.memoryBoundBytes }
          : candidate,
      ),
    }),
    [
      `${receipt.command} reached cgroup peak ${leanMemoryAcceptanceRecord.memoryBoundBytes} at or above bound ${leanMemoryAcceptanceRecord.memoryBoundBytes}`,
      `${receipt.command} measurement tuple changed without a new commit and output digest`,
    ],
  );
});

test("every nonzero cgroup pressure event and command failure fails acceptance", () => {
  const receipt = leanMemoryAcceptanceRecord.receipts[0];
  assert.ok(receipt !== undefined);
  assert.deepEqual(
    acceptanceMessages({
      ...leanMemoryAcceptanceRecord,
      receipts: leanMemoryAcceptanceRecord.receipts.map((candidate) =>
        candidate.command === receipt.command
          ? {
              ...candidate,
              exitStatus: 137,
              memoryEvents: { high: 1, max: 2, oom: 3, oom_kill: 4, oom_group_kill: 5 },
            }
          : candidate,
      ),
    }),
    [
      `${receipt.command} exited 137`,
      `${receipt.command} recorded memory.events high=1`,
      `${receipt.command} recorded memory.events max=2`,
      `${receipt.command} recorded memory.events oom=3`,
      `${receipt.command} recorded memory.events oom_kill=4`,
      `${receipt.command} recorded memory.events oom_group_kill=5`,
      `${receipt.command} measurement tuple changed without a new commit and output digest`,
    ],
  );
});

test("complete Lean acceptance rejects an empty or incomplete receipt set", () => {
  const [testReceipt] = leanMemoryAcceptanceRecord.receipts;
  assert.ok(testReceipt !== undefined);
  assert.deepEqual(
    acceptanceMessages({ ...leanMemoryAcceptanceRecord, receipts: [] }),
    [
      "missing required Lean memory receipt for ./scripts/lake.sh test",
      "missing required Lean memory receipt for ./scripts/lake.sh build",
    ],
  );
  assert.deepEqual(
    acceptanceMessages({ ...leanMemoryAcceptanceRecord, receipts: [testReceipt] }),
    ["missing required Lean memory receipt for ./scripts/lake.sh build"],
  );
});

test("complete Lean acceptance rejects an incomplete prior committed record", () => {
  const [testReceipt] = leanMemoryAcceptanceRecord.receipts;
  assert.ok(testReceipt !== undefined);
  assert.deepEqual(
    acceptanceMessages(leanMemoryAcceptanceRecord, {
      ...leanMemoryAcceptanceRecord,
      receipts: [testReceipt],
    }),
    ["prior committed Lean memory record is missing ./scripts/lake.sh build"],
  );
});

test("complete Lean acceptance rejects duplicate and unknown commands", () => {
  const [testReceipt] = leanMemoryAcceptanceRecord.receipts;
  assert.ok(testReceipt !== undefined);
  assert.deepEqual(
    acceptanceMessages({
      ...leanMemoryAcceptanceRecord,
      receipts: [...leanMemoryAcceptanceRecord.receipts, testReceipt],
    }),
    [`duplicate Lean memory receipt for ${testReceipt.command}`],
  );
  assert.deepEqual(
    acceptanceMessages({
      ...leanMemoryAcceptanceRecord,
      receipts: [
        ...leanMemoryAcceptanceRecord.receipts,
        { ...testReceipt, command: "./scripts/lake.sh unknown" },
      ],
    }),
    ["unknown Lean memory receipt command ./scripts/lake.sh unknown"],
  );
});

test("complete Lean acceptance fixes the ceiling and ratchets values by identity", () => {
  const [testReceipt] = leanMemoryAcceptanceRecord.receipts;
  assert.ok(testReceipt !== undefined);
  assert.deepEqual(
    acceptanceMessages({ ...leanMemoryAcceptanceRecord, memoryBoundBytes: 4_294_967_296 }),
    ["Lean memory bound 4294967296 differs from fixed bound 3221225472"],
  );
  assert.deepEqual(
    acceptanceMessages({
      ...leanMemoryAcceptanceRecord,
      receipts: leanMemoryAcceptanceRecord.receipts.map((candidate) =>
        candidate.command === testReceipt.command
          ? { ...candidate, cgroupPeakBytes: candidate.cgroupPeakBytes - 1 }
          : candidate,
      ),
    }),
    [`${testReceipt.command} measurement tuple changed without a new commit and output digest`],
  );
});

test("a canonical receipt tuple changed under an unchanged identity fails the ratchet", async () => {
  const mutated = await mutatedCanonicalAcceptanceModule();
  assert.deepEqual(
    mutated
      .leanMemoryAcceptanceViolations(
        mutated.leanMemoryAcceptanceRecord,
        leanMemoryAcceptanceRecord,
      )
      .map(mutated.formatLeanMemoryAcceptanceViolation),
    ["./scripts/lake.sh test measurement tuple changed without a new commit and output digest"],
  );
});

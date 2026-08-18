import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import {
  DOCUMENT_MIGRATION_MATRIX_FORMAT,
  DOCUMENT_MIGRATION_SOURCE_PATHS,
  deriveDocumentUnits,
  extractDocumentUnits,
  loadDocumentMigrationMatrix,
} from "./document-migration-matrix.ts";

function git(repository: string, arguments_: ReadonlyArray<string>): string {
  const result = spawnSync("git", arguments_, { cwd: repository, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function commitAll(repository: string, message: string): string {
  git(repository, ["add", "--all"]);
  git(repository, [
    "-c", "user.name=Migration Matrix Test",
    "-c", "user.email=migration-matrix@example.invalid",
    "commit", "--quiet", "-m", message,
  ]);
  return git(repository, ["rev-parse", "HEAD"]);
}

function identity(unit: Readonly<{ path: string; owningHeading: string; ordinal: number; sha256: string }>) {
  return { path: unit.path, owningHeading: unit.owningHeading, ordinal: unit.ordinal, sha256: unit.sha256 };
}

async function writeMatrix(matrixPath: string, matrix: unknown, suffix: string = ""): Promise<void> {
  await writeFile(matrixPath, `${JSON.stringify(matrix)}${suffix}`, "utf8");
}

test("claim extraction is deterministic across paragraphs, complete list items, and table rows", () => {
  const units = extractDocumentUnits(
    "docs/PLAN.md",
    [
      "# Plan",
      "",
      "Intro claim",
      "continues here.",
      "",
      "## Active",
      "",
      "- First item",
      "  continuation",
      "  - Nested item",
      "- Second item",
      "",
      "| Field | State |",
      "|---|---|",
      "| Work | Active |",
      "",
      "```text",
      "not a claim unit",
      "```",
      "",
    ].join("\n"),
  );

  assert.deepEqual(units.map(({ owningHeading, ordinal, text }) => ({ owningHeading, ordinal, text })), [
    { owningHeading: "Plan", ordinal: 1, text: "Intro claim\ncontinues here." },
    { owningHeading: "Plan > Active", ordinal: 2, text: "- First item\n  continuation" },
    { owningHeading: "Plan > Active", ordinal: 3, text: "  - Nested item" },
    { owningHeading: "Plan > Active", ordinal: 4, text: "- Second item" },
    { owningHeading: "Plan > Active", ordinal: 5, text: "| Field | State |" },
    { owningHeading: "Plan > Active", ordinal: 6, text: "| Work | Active |" },
  ]);
  assert.deepEqual(extractDocumentUnits("docs/PLAN.md", "# Only heading\n\n---\n"), []);
});

test("a complete migration matrix is independently derived and validated", async () => {
  const repository = await mkdtemp(path.join(os.tmpdir(), "document-migration-matrix-"));
  try {
    await mkdir(path.join(repository, "docs"), { recursive: true });
    git(repository, ["init", "--quiet"]);
    await writeFile(path.join(repository, "docs/PLAN.md"), "# Plan\n\n## Active\n\nOne claim containing two allocations.\n", "utf8");
    await writeFile(path.join(repository, "docs/IMPLEMENTATION-MAP.md"), "# Map\n\n## State\n\n- One fact.\n", "utf8");
    const baseline = commitAll(repository, "baseline");
    await writeFile(path.join(repository, "docs/PLAN.md"), "# Plan\n\n## Active\n\nFirst allocated claim.\n\nSecond allocated claim.\n", "utf8");
    const target = commitAll(repository, "target");
    const baselineUnits = deriveDocumentUnits(repository, baseline, DOCUMENT_MIGRATION_SOURCE_PATHS);
    const targetUnits = deriveDocumentUnits(repository, target, DOCUMENT_MIGRATION_SOURCE_PATHS);
    const matrix = {
      format: DOCUMENT_MIGRATION_MATRIX_FORMAT,
      baseline,
      target,
      sourcePaths: DOCUMENT_MIGRATION_SOURCE_PATHS,
      rows: baselineUnits.map((source) => ({
        source: identity(source),
        disposition: {
          kind: "destination",
          targets: targetUnits
            .filter((unit) => unit.path === source.path && (source.path === "docs/PLAN.md" || unit.ordinal === source.ordinal))
            .map((destination, index) => ({
              target: identity(destination),
              allocation: source.path === "docs/PLAN.md" ? `Source claim allocation ${index + 1}.` : "Complete source claim.",
            })),
        },
      })),
    };
    const matrixPath = path.join(repository, "matrix.json");
    await writeMatrix(matrixPath, matrix);

    const validated = loadDocumentMigrationMatrix({ repositoryRoot: repository, matrixPath, baseline, target });
    assert.equal(validated.normalized.rows.length, baselineUnits.length);
    assert.equal(validated.diagnostics.changed.length, 2);
    assert.equal(validated.diagnostics.deleted.length, 0);
    const splitSource = baselineUnits[0];
    assert.ok(splitSource);
    assert.deepEqual(
      validated.diagnostics.changed.map(({ source, target: changedTarget, allocation }) => ({
        source: source.sha256,
        target: changedTarget.sha256,
        allocation,
      })),
      targetUnits.slice(0, 2).map(({ sha256: targetSha256 }, index) => ({
        source: splitSource.sha256,
        target: targetSha256,
        allocation: `Source claim allocation ${index + 1}.`,
      })),
    );
    const firstNormalizedRow = validated.normalized.rows[0];
    assert.ok(firstNormalizedRow);
    assert.equal(firstNormalizedRow.source.text.length > 0, true);
    assert.deepEqual(
      validated.normalized.rows.map(({ disposition }) =>
        disposition.kind === "destination" ? disposition.targets.map(({ changed }) => changed) : undefined),
      [[true, true], [false]],
    );
    assert.deepEqual(
      firstNormalizedRow.disposition.kind === "destination"
        ? firstNormalizedRow.disposition.targets.map(({ target, allocation }) => ({ text: target.text, allocation }))
        : [],
      [
        { text: "First allocated claim.", allocation: "Source claim allocation 1." },
        { text: "Second allocated claim.", allocation: "Source claim allocation 2." },
      ],
    );

    await writeMatrix(matrixPath, matrix, "\n");
    const byteMutated = loadDocumentMigrationMatrix({ repositoryRoot: repository, matrixPath, baseline, target });
    assert.deepEqual(byteMutated.normalized, validated.normalized);
    assert.notEqual(byteMutated.exactBytesSha256, validated.exactBytesSha256);

    const firstRow = matrix.rows[0];
    const secondRow = matrix.rows[1];
    assert.ok(firstRow);
    assert.ok(secondRow);
    const deletedMatrix = {
      ...matrix,
      rows: [
        { source: firstRow.source, disposition: { kind: "duplicate", ownerPath: "docs/PLAN.md", rationale: "The target owner already states this claim." } },
        { source: secondRow.source, disposition: { kind: "history", rationale: "Closed narration is preserved by Git." } },
      ],
    };
    await writeMatrix(matrixPath, deletedMatrix);
    const deleted = loadDocumentMigrationMatrix({ repositoryRoot: repository, matrixPath, baseline, target });
    assert.deepEqual(deleted.diagnostics.deleted.map(({ disposition }) => disposition), ["duplicate", "history"]);

    const invalidMatrices: ReadonlyArray<Readonly<{ value: unknown; message: RegExp }>> = [
      { value: { ...matrix, format: "document-migration-matrix/v1" }, message: /unknown format/u },
      { value: { ...matrix, rows: matrix.rows.slice(1) }, message: /omits 1 baseline source unit/u },
      { value: { ...matrix, rows: [...matrix.rows, firstRow] }, message: /repeats a baseline source unit/u },
      { value: { ...matrix, baseline: target }, message: /equal the requested commits/u },
      { value: { ...matrix, sourcePaths: [...DOCUMENT_MIGRATION_SOURCE_PATHS, "docs/OTHER.md"] }, message: /exact registered source paths/u },
      { value: { ...matrix, extra: true }, message: /needs exactly/u },
      {
        value: {
          ...matrix,
          rows: [{ ...firstRow, source: { ...firstRow.source, path: "docs/OTHER.md" } }, ...matrix.rows.slice(1)],
        },
        message: /unknown path/u,
      },
      {
        value: {
          ...matrix,
          rows: [{ ...firstRow, disposition: { kind: "destination", targets: [{ ...firstRow.disposition.targets[0], target: { ...firstRow.disposition.targets[0]?.target, sha256: "0".repeat(64) } }] } }, ...matrix.rows.slice(1)],
        },
        message: /destination unit does not resolve/u,
      },
      {
        value: {
          ...matrix,
          rows: [{ ...firstRow, disposition: { kind: "destination", targets: [] } }, ...matrix.rows.slice(1)],
        },
        message: /nonempty targets array/u,
      },
      {
        value: {
          ...matrix,
          rows: [{ ...firstRow, disposition: { kind: "destination", targets: [firstRow.disposition.targets[0], firstRow.disposition.targets[0]] } }, ...matrix.rows.slice(1)],
        },
        message: /repeats a target identity/u,
      },
      {
        value: {
          ...matrix,
          rows: [{ ...firstRow, disposition: { kind: "destination", targets: [firstRow.disposition.targets[0], { ...firstRow.disposition.targets[1], allocation: firstRow.disposition.targets[0]?.allocation }] } }, ...matrix.rows.slice(1)],
        },
        message: /repeats an allocation/u,
      },
      {
        value: {
          ...matrix,
          rows: [{ ...firstRow, disposition: { kind: "destination", targets: [{ ...firstRow.disposition.targets[0], allocation: " " }] } }, ...matrix.rows.slice(1)],
        },
        message: /allocation must be a nonempty string/u,
      },
      {
        value: {
          ...matrix,
          rows: [{ ...firstRow, disposition: { kind: "destination", targets: [{ ...firstRow.disposition.targets[0], surplus: true }] } }, ...matrix.rows.slice(1)],
        },
        message: /needs exactly allocation, target/u,
      },
      {
        value: {
          ...matrix,
          rows: [{ ...firstRow, disposition: { kind: "destination", target: firstRow.disposition.targets[0]?.target } }, ...matrix.rows.slice(1)],
        },
        message: /needs exactly kind, targets/u,
      },
      {
        value: {
          ...matrix,
          rows: [{ ...firstRow, disposition: { kind: "unknown" } }, ...matrix.rows.slice(1)],
        },
        message: /unknown disposition kind/u,
      },
    ];
    for (const invalid of invalidMatrices) {
      await writeMatrix(matrixPath, invalid.value);
      assert.throws(
        () => loadDocumentMigrationMatrix({ repositoryRoot: repository, matrixPath, baseline, target }),
        invalid.message,
      );
    }
    assert.throws(
      () => loadDocumentMigrationMatrix({ repositoryRoot: repository, matrixPath, baseline: "HEAD", target }),
      /full lowercase commit hash/u,
    );
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

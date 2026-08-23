/**
 * Verifies that every cost-ledger row's four figures reproduce from the commit range it records.
 *
 * The measurement command is real and cheap, so the way a row goes wrong is not arithmetic: it is
 * measured from a working tree instead of a commit pair, or from a baseline that includes the previous
 * capsule's tail. Both produce a plausible pair of numbers that no command reproduces, and neither is
 * visible to a reader or to the rank guard beside this one, which compares rows against each other
 * rather than against history. Two consecutive rows had already been recorded that way before this
 * existed, and the ledger's own reflection rule reads those figures to decide which process weight to
 * remove, so a row nobody can reproduce silently selects the wrong one.
 *
 * The check is exact rather than tolerant. `measureCapsuleDiff` is deterministic given a commit pair,
 * so an off-by-anything means the recorded range is not the range that was measured.
 *
 * Requires full history: every recorded endpoint must resolve. CI checks out with `fetch-depth: 0`,
 * and a shallow clone fails here loudly rather than passing vacuously.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { measureCapsuleDiff } from "./capsule-cost.ts";

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const ledgerPath = path.join(projectRoot, "docs/CAPSULE-COST-LEDGER.md");

type Row = Readonly<{
  increment: string;
  baseline: string;
  closure: string;
  code: Readonly<{ added: number; removed: number }>;
  documentation: Readonly<{ added: number; removed: number }>;
}>;

const churnCell = /^`\+(\d+)\/-(\d+)`$/u;
const rangeCell = /^`([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})`$/u;

/** `| [Name](path) | `a..b` | `+N/-M` | `+N/-M` | Elapsed | consequence |` */
export function reproducibleRows(markdown: string): ReadonlyArray<Row> {
  const rows: Row[] = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("| [")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    const increment = /^\[([^\]]+)\]/u.exec(cells[1] ?? "");
    const range = rangeCell.exec(cells[2] ?? "");
    const code = churnCell.exec(cells[3] ?? "");
    const documentation = churnCell.exec(cells[4] ?? "");
    if (
      increment === null || range === null || code === null ||
      documentation === null
    ) {
      continue;
    }
    rows.push({
      increment: increment[1] ?? "",
      baseline: range[1] ?? "",
      closure: range[2] ?? "",
      code: { added: Number(code[1]), removed: Number(code[2]) },
      documentation: {
        added: Number(documentation[1]),
        removed: Number(documentation[2]),
      },
    });
  }
  return rows;
}

async function measure(row: Row): Promise<string | undefined> {
  let diff: string;
  try {
    const { stdout } = await execFileAsync("git", [
      "diff",
      "--no-ext-diff",
      "--unified=0",
      row.baseline,
      row.closure,
      "--",
    ], { cwd: projectRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    diff = stdout;
  } catch {
    return `${row.increment}: ${row.baseline}..${row.closure} does not resolve`;
  }
  const measured = measureCapsuleDiff(diff);
  const recorded = { code: row.code, documentation: row.documentation };
  return JSON.stringify(measured) === JSON.stringify(recorded)
    ? undefined
    : `${row.increment}: ${row.baseline}..${row.closure} measures ` +
      `code +${measured.code.added}/-${measured.code.removed} ` +
      `documentation +${measured.documentation.added}/-${measured.documentation.removed}, ` +
      `recorded code +${row.code.added}/-${row.code.removed} ` +
      `documentation +${row.documentation.added}/-${row.documentation.removed}`;
}

test("every cost-ledger row reproduces from its recorded range", async () => {
  const markdown = await readFile(ledgerPath, "utf8");
  const rows = reproducibleRows(markdown);

  // Anti-vacuity: a changed table shape would otherwise report success over an empty set.
  assert.ok(rows.length > 40, `only ${rows.length} rows parsed`);

  const findings = (await Promise.all(rows.map(measure))).filter(
    (finding) => finding !== undefined,
  );
  assert.deepEqual(findings, []);
});

/** Locks the parser against a row shape it must skip and a figure it must not. */
test("parses exactly the rows carrying a range and both churn figures", () => {
  const table = [
    "| Increment | Boundary | Code | Documentation | Elapsed | Comparison consequence |",
    "|---|---|---:|---:|---|---|",
    "| [Alpha](a.md) | `1234567..89abcde` | `+3000/-1` | `+500/-2` | Unknown | row |",
    "| [Beta](b.md) | multi-commit span | `+1/-1` | `+1/-1` | Unknown | unmeasured row |",
    "| [Gamma](c.md) | `1234567..89abcde` | `+2/-3` | `+4/-5` | Unknown | row |",
  ].join("\n");

  assert.deepEqual(reproducibleRows(table).map((row) => row.increment), [
    "Alpha",
    "Gamma",
  ]);
  assert.deepEqual(reproducibleRows(table)[0]?.code, { added: 3000, removed: 1 });
  assert.deepEqual(reproducibleRows(table)[1]?.documentation, {
    added: 4,
    removed: 5,
  });
});

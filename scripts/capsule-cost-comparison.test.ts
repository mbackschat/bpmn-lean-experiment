/**
 * Verifies every explicit rank claim a cost-ledger row makes about its own measurement.
 *
 * A row's consequence cell places its measurement against the rest of the table, which is a claim
 * about the whole column rather than about the row being written. Three such claims have been wrong:
 * one called a documentation figure the largest in the ledger while a larger row sat four lines
 * above it, and one placed a code figure between "the two nearest comparators" while a third row lay
 * between them. Both were written without reading the column, and prose review does not catch it —
 * a plausible pair of numbers reads as correct.
 *
 * Free-form comparative prose is deliberately **not** checked, and that limit is the design rather
 * than a shortcut. An adjacency check over quoted pairs was tried first and rejected: it flagged five
 * historical rows whose "nearest recorded" wording plausibly means most-recently-recorded rather than
 * nearest-in-value, so enforcing it would either rewrite those rows on a contested reading or churn
 * every comparison whenever a new row lands between an old one and its comparator.
 *
 * Instead this checks the one claim form that cannot be misread: `rank N of M by code` or
 * `rank N of M by documentation`, which a row may state and which is then verified against the
 * column. Rows that make no rank claim are untouched. Whether the surrounding sentence characterises
 * the rank fairly remains a review obligation.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const ledgerPath = path.join(projectRoot, "docs/CAPSULE-COST-LEDGER.md");

type Measurement = Readonly<{
  increment: string;
  code: number;
  documentation: number;
  consequence: string;
}>;

/** `| [Name](path) | `a..b` | `+N/-M` | `+N/-M` | Elapsed | consequence |` */
function measurements(markdown: string): ReadonlyArray<Measurement> {
  const rows: Measurement[] = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("| [")) {
      continue;
    }
    const cells = line.split("|").map((cell) => cell.trim());
    const code = /^`\+(\d+)\/-\d+`$/u.exec(cells[3] ?? "");
    const documentation = /^`\+(\d+)\/-\d+`$/u.exec(cells[4] ?? "");
    const increment = /^\[([^\]]+)\]/u.exec(cells[1] ?? "");
    if (code === null || documentation === null || increment === null) {
      continue;
    }
    rows.push({
      increment: increment[1] ?? "",
      code: Number(code[1]),
      documentation: Number(documentation[1]),
      consequence: cells[6] ?? "",
    });
  }
  return rows;
}

/** Rank by descending addition count, where rank 1 is the largest. */
function rankOf(values: ReadonlyArray<number>, own: number): number {
  return [...values].sort((left, right) => right - left).indexOf(own) + 1;
}

export function inaccurateRankClaims(
  markdown: string,
): ReadonlyArray<string> {
  const rows = measurements(markdown);
  const found: string[] = [];
  for (const row of rows) {
    for (
      const [, position, total, column] of row.consequence.matchAll(
        /rank (\d+) of (\d+) by (code|documentation)/gu,
      )
    ) {
      const values = rows.map((other) =>
        column === "code" ? other.code : other.documentation
      );
      const own = column === "code" ? row.code : row.documentation;
      const actual = rankOf(values, own);
      if (Number(position) !== actual) {
        found.push(
          `${row.increment}: claims ${column} rank ${position}, actual ${actual}`,
        );
      }
      if (Number(total) !== values.length) {
        found.push(
          `${row.increment}: claims ${total} measured rows, actual ${values.length}`,
        );
      }
    }
  }
  return found;
}

test("every cost-ledger rank claim matches its column", async () => {
  const markdown = await readFile(ledgerPath, "utf8");

  // Anti-vacuity: a changed table shape would otherwise report success over an empty set, and a
  // ledger with no rank claim at all would make this guard silently inert.
  const rows = measurements(markdown);
  assert.ok(rows.length > 10, `only ${rows.length} measurements parsed`);
  assert.ok(
    /rank \d+ of \d+ by (code|documentation)/u.test(markdown),
    "no row states a checkable rank claim",
  );

  assert.deepEqual(inaccurateRankClaims(markdown), []);
});

/** Locks the detector against a wrong position and a stale denominator. */
test("rejects a wrong rank and a stale row count", () => {
  const table = [
    "| Increment | Boundary | Code | Documentation | Elapsed | Comparison consequence |",
    "|---|---|---:|---:|---|---|",
    "| [Alpha](a.md) | `a..b` | `+3000/-0` | `+500/-0` | Unknown | plain row |",
    "| [Beta](b.md) | `a..b` | `+5266/-0` | `+283/-0` | Unknown | plain row |",
    "| [Gamma](c.md) | `a..b` | `+5521/-0` | `+363/-0` | Unknown | ",
  ].join("\n");

  assert.deepEqual(
    inaccurateRankClaims(`${table}rank 1 of 3 by code, rank 2 of 3 by documentation |`),
    [],
  );
  // Gamma's documentation figure is second behind Alpha's 500, so a claim of first must fail.
  assert.equal(
    inaccurateRankClaims(`${table}rank 1 of 3 by documentation |`).length,
    1,
  );
  // A denominator that outlived a landed row is the other half of the same defect.
  assert.equal(
    inaccurateRankClaims(`${table}rank 1 of 2 by code |`).length,
    1,
  );
});

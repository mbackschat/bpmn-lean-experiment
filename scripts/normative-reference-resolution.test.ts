/**
 * Requires every declared BPMN normative reference to resolve in the pinned corpus.
 *
 * A profile artifact is the compatibility authority for its declared target, so a reference that
 * points at the wrong clause sends an auditor to the wrong text. Prose review does not catch this:
 * a plausible clause number reads as correct, and one capsule has already shipped three references
 * that did not describe what they claimed — including a workflow-pattern row absent from the
 * standard entirely. This resolves each reference against the corpus instead of trusting its shape.
 *
 * Its limit is deliberate and must not be overstated: it rejects a reference the corpus does not
 * declare, but not an existing clause cited for the wrong subject. Two of the three wrong
 * references that motivated it — `Clause 10.4.3` and `Table 10.87` — do exist, as XPath data usage
 * and Start Event attributes. Agreement between a reference and what an artifact claims of it
 * remains a review obligation.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const externalRoot = process.env["BPMN_EXTERNAL_ROOT"] ??
  path.resolve(projectRoot, "../oss");
const corpusPath = path.join(externalRoot, "omg-bpmn-2.0.2/BPMN-2.0.2.md");

/** `Clause 13.5.3`, `Table 10.91`, and the `§`/`BPMN 2.0.2` prefixes all reduce to one kind plus a number. */
const referencePattern =
  /^(?:BPMN 2\.0\.2 )?(?:(Clause|Table) |§)([0-9]+(?:\.[0-9]+)*)(?: (.+))?$/u;

type Reference = Readonly<{ source: string; text: string }>;

/**
 * Resolves a reference where the corpus *declares* it, never at an arbitrary mention: a body
 * heading, a bold table caption, or a contents row. Matching anywhere in the body would accept a
 * cross-reference to something that does not exist, which is the failure mode this guard exists for.
 *
 * The contents row is load-bearing rather than a convenience. The tracked corpus is a Markdown
 * conversion of the OMG PDF, and the conversion lost some body headings — `10.5.4 Intermediate
 * Event` and `13.3.3 Task` both exist in BPMN 2.0.2 and appear only in the contents. Resolving on
 * headings alone rejected four correct pre-existing artifacts, so this guard would have been a
 * reason to corrupt them.
 */
function resolves(corpus: string, kind: string, numeral: string): boolean {
  const escaped = numeral.replace(/\./gu, "\\.");
  const label = kind === "Table" ? `Table ${escaped}` : escaped;
  return [
    new RegExp(`^#+ *${label}[ .\u2013-]`, "mu"),
    new RegExp(`^\\*\\*${label}[ \u2013-]`, "mu"),
    new RegExp(`^\\|${label} `, "mu"),
  ].some((pattern) => pattern.test(corpus));
}

async function declaredReferences(): Promise<ReadonlyArray<Reference>> {
  const references: Reference[] = [];
  for await (const entry of glob("profiles/*/profile.json", { cwd: projectRoot })) {
    const profile = JSON.parse(
      await readFile(path.join(projectRoot, entry), "utf8"),
    ) as Readonly<{
      normativeAuthority?: Readonly<{ references: ReadonlyArray<string> }>;
    }>;
    // An executable-oracle profile declares an engine revision instead of clause references; its
    // scenarios still carry normative refs and are collected below.
    for (const text of profile.normativeAuthority?.references ?? []) {
      references.push({ source: entry, text });
    }
  }
  for await (const entry of glob("scenarios/*/*.scenario.json", { cwd: projectRoot })) {
    const scenario = JSON.parse(
      await readFile(path.join(projectRoot, entry), "utf8"),
    ) as Readonly<{
      provenance: Readonly<{ normativeRefs: ReadonlyArray<string> }>;
    }>;
    for (const text of scenario.provenance.normativeRefs) {
      references.push({ source: entry, text });
    }
  }
  return references;
}

test("resolves every declared normative reference in the pinned BPMN corpus", async () => {
  const corpus = await readFile(corpusPath, "utf8");
  const references = await declaredReferences();

  // Anti-vacuity: a glob that matched nothing, or a pattern that parsed nothing, would otherwise
  // report success over an empty set.
  assert.ok(references.length > 100, `only ${references.length} references collected`);

  const unresolved: string[] = [];
  let checked = 0;
  for (const { source, text } of references) {
    const parsed = referencePattern.exec(text);
    if (parsed === null) {
      unresolved.push(`${source}: unparsable reference ${text}`);
      continue;
    }
    const [, kind, numeral] = parsed;
    if (numeral === undefined) {
      unresolved.push(`${source}: reference without a number ${text}`);
      continue;
    }
    checked += 1;
    if (!resolves(corpus, kind ?? "Clause", numeral)) {
      unresolved.push(`${source}: ${text} does not resolve in the corpus`);
      continue;
    }
    // A qualifier names a row inside the declared table, and an existing table must not vouch for a
    // row that does not exist: `Table 13.4 WCP-19` resolved on its table number alone while naming
    // a workflow pattern absent from BPMN 2.0.2.
    const qualifier = parsed[3];
    if (qualifier !== undefined && !corpus.includes(qualifier)) {
      unresolved.push(`${source}: ${text} names ${qualifier}, absent from the corpus`);
    }
  }
  assert.ok(checked > 100, `only ${checked} references were resolvable in shape`);
  assert.deepEqual(unresolved, []);
});

/** Locks the detector against the exact references one capsule shipped wrongly. */
test("rejects a clause and a table the corpus does not declare", async () => {
  const corpus = await readFile(corpusPath, "utf8");

  assert.equal(resolves(corpus, "Clause", "10.5.6"), true);
  assert.equal(resolves(corpus, "Table", "10.91"), true);
  assert.equal(resolves(corpus, "Clause", "99.99.99"), false);
  assert.equal(resolves(corpus, "Table", "13.4"), true);
  // A table number that exists must not vouch for a row that does not; `Table 13.4 WCP-19` named a
  // pattern absent from BPMN 2.0.2, so the trailing qualifier has to be checked as text.
  assert.equal(corpus.includes("WCP-19"), false);
  assert.equal(corpus.includes("WCP-16"), true);
});

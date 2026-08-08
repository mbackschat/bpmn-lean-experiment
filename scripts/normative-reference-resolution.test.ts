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
 *
 * The oracle is [the tracked label digest](../docs/reference/bpmn-2.0.2/NORMATIVE-LABELS.digest),
 * not the Markdown conversion it was extracted from. The conversion is registered as an optional
 * disposable cache in [the cache lock](workspace-cache.lock), so reading it here made this gate pass
 * only on a machine that happened to hold it and fail every hosted run of the default `verify`
 * scope, which is otherwise complete without it. The digest keeps the claim while removing the
 * dependency; the drift check below is what keeps the two in agreement where both exist.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  extractNormativeLabels,
  parseDigest,
  resolvesLabel,
  resolvesQualifier,
} from "./bpmn-normative-labels.ts";
import type { NormativeLabelDigest } from "./bpmn-normative-labels.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const externalRoot = process.env["BPMN_EXTERNAL_ROOT"] ??
  path.resolve(projectRoot, "../oss");
const conversionPath = process.env["BPMN_CORPUS_MARKDOWN_PATH"] ??
  path.join(externalRoot, "omg-bpmn-2.0.2/BPMN-2.0.2.md");
const digestPath = path.join(
  projectRoot,
  "docs/reference/bpmn-2.0.2/NORMATIVE-LABELS.digest",
);

/** `Clause 13.5.3`, `Table 10.91`, and the `§`/`BPMN 2.0.2` prefixes all reduce to one kind plus a number. */
const referencePattern =
  /^(?:BPMN 2\.0\.2 )?(?:(Clause|Table) |§)([0-9]+(?:\.[0-9]+)*)(?: (.+))?$/u;

type Reference = Readonly<{ source: string; text: string }>;

/**
 * Whether `declared` covers `identity`, exactly or as the whole of which it names a part.
 *
 * An unqualified declaration names a whole clause or table and therefore covers a qualified citation
 * of one of its rows. A qualified declaration names one row and covers nothing else.
 */
function authorizes(
  declared: ReadonlyArray<string>,
  identity: string,
): boolean {
  if (declared.includes(identity)) {
    return true;
  }
  const parts = identity.split(" ");
  return parts.length === 3 && declared.includes(`${parts[0]} ${parts[1]}`);
}

/**
 * One reference's complete comparable identity: kind, numeral, and any qualifier.
 *
 * `§` canonicalizes to `Clause` because that is notation rather than a different authority, while a
 * `Table` sharing a numeral with a `Clause` stays distinct because those are different subjects. An
 * unparsable reference keeps its exact text, so it can never compare equal to a parsed one.
 */
function referenceIdentities(
  references: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return [...new Set(references.map((text) => {
    const parsed = referencePattern.exec(text);
    const numeral = parsed?.[2];
    if (parsed === null || numeral === undefined) {
      return text;
    }
    const kind = parsed[1] ?? "Clause";
    const qualifier = parsed[3];
    return qualifier === undefined
      ? `${kind} ${numeral}`
      : `${kind} ${numeral} ${qualifier}`;
  }))].sort();
}

async function trackedDigest(): Promise<NormativeLabelDigest> {
  return parseDigest(await readFile(digestPath, "utf8"));
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
  // Both shapes, because `*.scenario.json` never matches a primary `scenario.json`. Eleven of them
  // went unchecked under the narrower pattern, which is how one profile shipped two clause numbers
  // that name event definitions while claiming to cover start and end events.
  for await (const entry of glob(
    ["scenarios/*/*.scenario.json", "scenarios/*/scenario.json"],
    { cwd: projectRoot },
  )) {
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
  const digest = await trackedDigest();
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
    if (!resolvesLabel(digest, kind ?? "Clause", numeral)) {
      unresolved.push(`${source}: ${text} does not resolve in the corpus`);
      continue;
    }
    // A qualifier names a row inside the declared table, and an existing table must not vouch for a
    // row that does not exist: `Table 13.4 WCP-19` resolved on its table number alone while naming
    // a workflow pattern absent from BPMN 2.0.2.
    const qualifier = parsed[3];
    if (qualifier === undefined) {
      continue;
    }
    switch (resolvesQualifier(digest, qualifier)) {
      case "declared":
        break;
      case "absent":
        unresolved.push(`${source}: ${text} names ${qualifier}, absent from the corpus`);
        break;
      case "uncovered":
        unresolved.push(
          `${source}: ${text} names ${qualifier}, a qualifier shape the digest does not cover`,
        );
        break;
    }
  }
  assert.ok(checked > 100, `only ${checked} references were resolvable in shape`);
  assert.deepEqual(unresolved, []);
});

/**
 * A scenario must not claim normative authority its own profile does not declare.
 *
 * The containment direction is the one the repository actually holds, and it is the direction that
 * matters: the profile is the compatibility authority, so a scenario citing a clause beyond it
 * asserts coverage nothing approved. The reverse is ordinary and deliberate — a profile cites the
 * tables and clauses for its whole feature set while each scenario names the subset it exercises,
 * and requiring equality reported 14 pre-existing scenarios across 7 capsules whose profiles simply
 * cite more.
 *
 * Comparison is on the complete parsed identity — kind, numeral, and qualifier — not on the numeral
 * alone. A first formulation kept only the numeral, so a profile declaring `Table 13.2` authorized a
 * scenario citing `Clause 13.2`: different subjects that both resolve, which is precisely the pair a
 * containment check exists to separate. `§` canonicalizes to `Clause`, because scenarios spell in
 * `§` and profiles in `Clause` and that difference is notation rather than authority.
 *
 * A qualifier narrows rather than departs, so an unqualified declaration authorizes its own rows: a
 * profile declaring `Table 13.3` covers a scenario citing `Table 13.3 WCP-7`, which is how the four
 * Inclusive Gateway scenarios read and is the ordinary relationship between a profile's feature-wide
 * table and the row one scenario exercises. A *qualified* declaration authorizes only itself, so
 * `Table 13.4 WCP-16` still refuses `Table 13.4 WCP-19`.
 *
 * Two limits, neither of which this closes. *Completeness* — whether the cited set covers every
 * declared feature — needs a feature-to-clause map the artifact schema does not carry and stays a
 * review obligation. And a clause cited for the wrong subject still resolves; only its existence is
 * mechanical.
 *
 * Executable-oracle profiles declare an engine revision rather than clauses, so a profile with no
 * `normativeAuthority` is skipped rather than required to match.
 */
test("keeps a scenario's normative citations inside its profile's", async () => {
  const profileClauses = new Map<string, ReadonlyArray<string>>();
  for await (const entry of glob("profiles/*/profile.json", { cwd: projectRoot })) {
    const profile = JSON.parse(
      await readFile(path.join(projectRoot, entry), "utf8"),
    ) as Readonly<{
      id: string;
      normativeAuthority?: Readonly<{ references: ReadonlyArray<string> }>;
    }>;
    if (profile.normativeAuthority !== undefined) {
      profileClauses.set(profile.id, referenceIdentities(profile.normativeAuthority.references));
    }
  }
  assert.ok(profileClauses.size > 5, `only ${profileClauses.size} standards profiles collected`);

  const disagreements: string[] = [];
  let compared = 0;
  for await (const entry of glob(
    ["scenarios/*/*.scenario.json", "scenarios/*/scenario.json"],
    { cwd: projectRoot },
  )) {
    const scenario = JSON.parse(
      await readFile(path.join(projectRoot, entry), "utf8"),
    ) as Readonly<{
      profile: string;
      provenance: Readonly<{ normativeRefs: ReadonlyArray<string> }>;
    }>;
    const declared = profileClauses.get(scenario.profile);
    if (declared === undefined) {
      continue;
    }
    compared += 1;
    const beyond = referenceIdentities(scenario.provenance.normativeRefs)
      .filter((identity) => !authorizes(declared, identity));
    if (beyond.length > 0) {
      disagreements.push(
        `${entry}: cites [${beyond.join(", ")}] beyond profile ${scenario.profile}`,
      );
    }
  }
  assert.ok(compared > 5, `only ${compared} scenarios were compared against a standards profile`);
  assert.deepEqual(disagreements, []);

});

/** Locks the containment check against the exact conflations its first formulation admitted. */
test("separates a Table from a Clause and a table row from its siblings", () => {
  // `§` and `Clause` are the same authority written two ways, and must compare equal.
  assert.deepEqual(referenceIdentities(["BPMN 2.0.2 §13.2"]), referenceIdentities(["Clause 13.2"]));

  // A Table and a Clause sharing a number are different subjects, and both resolve in the corpus.
  const tableDeclared = referenceIdentities(["Table 13.2"]);
  assert.equal(authorizes(tableDeclared, "Clause 13.2"), false);
  assert.equal(authorizes(tableDeclared, "Table 13.2"), true);

  // A declared row must not vouch for a sibling row of the same table.
  const rowDeclared = referenceIdentities(["Table 13.4 WCP-16"]);
  assert.equal(authorizes(rowDeclared, "Table 13.4 WCP-19"), false);
  assert.equal(authorizes(rowDeclared, "Table 13.4 WCP-16"), true);
  // ...but a declared whole table does vouch for its rows, which is how every existing profile reads.
  const tableWide = referenceIdentities(["Table 13.4"]);
  assert.equal(authorizes(tableWide, "Table 13.4 WCP-19"), true);
  assert.equal(authorizes(tableWide, "Clause 13.4 WCP-19"), false);
  // A whole-table declaration still does not reach a different table.
  assert.equal(authorizes(tableWide, "Table 13.5 WCP-19"), false);

  // An unparsable reference keeps its own text rather than collapsing into any other.
  assert.deepEqual(referenceIdentities(["not a reference"]), ["not a reference"]);
});

/** Locks the detector against the exact references one capsule shipped wrongly. */
test("rejects a clause and a table the corpus does not declare", async () => {
  const digest = await trackedDigest();

  assert.equal(resolvesLabel(digest, "Clause", "10.5.6"), true);
  assert.equal(resolvesLabel(digest, "Table", "10.91"), true);
  assert.equal(resolvesLabel(digest, "Clause", "99.99.99"), false);
  assert.equal(resolvesLabel(digest, "Table", "13.4"), true);
  // A table number that exists must not vouch for a row that does not; `Table 13.4 WCP-19` named a
  // pattern absent from BPMN 2.0.2, so the trailing qualifier has to be checked as text.
  assert.equal(resolvesQualifier(digest, "WCP-19"), "absent");
  assert.equal(resolvesQualifier(digest, "WCP-16"), "declared");
  // A shape outside the extraction rule fails closed rather than resolving by accident.
  assert.equal(resolvesQualifier(digest, "step two"), "uncovered");
});

/**
 * Locks declaration-position semantics, which is where the digest could silently diverge.
 *
 * A heading terminates its numeral on a period as well as a space, so it declares every dot-prefix;
 * a bold caption and a contents row do not. Extraction has to reproduce that or a reference the
 * corpus does declare would start failing.
 */
test("a heading declares its dot-prefixes and other positions do not", () => {
  const { labels, qualifiers } = extractNormativeLabels(
    [
      "### 10.5.6.1 Deep heading",
      "**Table 10.91 – Boundary Event attributes**",
      "|13.4 Gateways|page|",
      "Body prose mentioning 11.2.3 and WCP-16 and Table 12.7.",
    ].join("\n"),
  );

  assert.equal(labels.has("10.5.6.1"), true);
  assert.equal(labels.has("10.5.6"), true);
  assert.equal(labels.has("10"), true);
  assert.equal(labels.has("Table 10.91"), true);
  assert.equal(labels.has("Table 10"), false);
  assert.equal(labels.has("13.4"), true);
  assert.equal(labels.has("13"), false);
  // A number that only appears in body prose is a mention, not a declaration.
  assert.equal(labels.has("11.2.3"), false);
  assert.equal(labels.has("Table 12.7"), false);
  // Qualifier tokens are collected from anywhere, because a table row is body text.
  assert.equal(qualifiers.has("WCP-16"), true);
});

/**
 * Keeps the digest and its source in agreement wherever both exist.
 *
 * The conversion is optional, so its absence cannot fail this gate — that absence is exactly what
 * this change removed from the default lane. Where it is present, a byte difference means the digest
 * was not regenerated and the tracked oracle has drifted from the standard it claims to describe.
 */
test("the tracked digest matches the local conversion when it is present", async (t) => {
  const digest = await trackedDigest();
  assert.match(digest.sourceSha256, /^[0-9a-f]{64}$/u);
  assert.equal(digest.source, "BPMN-2.0.2.md");

  let conversion: string;
  try {
    conversion = await readFile(conversionPath, "utf8");
  } catch {
    t.diagnostic(
      `optional BPMN Markdown conversion absent at ${conversionPath}; digest drift not compared`,
    );
    return;
  }

  assert.equal(
    createHash("sha256").update(conversion).digest("hex"),
    digest.sourceSha256,
    "regenerate with node scripts/update-bpmn-normative-labels.ts",
  );
  const extracted = extractNormativeLabels(conversion);
  assert.deepEqual([...extracted.labels].sort(), [...digest.labels].sort());
  assert.deepEqual([...extracted.qualifiers].sort(), [...digest.qualifiers].sort());
});

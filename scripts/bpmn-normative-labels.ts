/**
 * Extraction, serialization, and resolution for the labels BPMN 2.0.2 declares.
 *
 * The normative corpus is external and non-redistributable, and its Markdown conversion is an
 * optional disposable cache rather than a provisioned input. A gate that reads that conversion
 * directly therefore passes on the maintainer's machine and fails everywhere else. This module owns
 * the project-authored digest that replaces it: bare clause and table labels plus the qualifier
 * tokens a reference may name, which are facts about what the standard declares rather than any of
 * its expression.
 *
 * Resolution reproduces declaration-position semantics exactly, including one consequence that is
 * easy to miss. A body heading terminates its numeral with a space, a period, a hyphen, or an en
 * dash, so a heading numbered `10.5.6.1` also declares `10.5.6`, `10.5`, and `10`. Bold captions and
 * contents rows terminate on a space alone and declare no prefix.
 */

/** One declared label: a bare clause numeral, or a table numeral behind its `Table ` prefix. */
export type NormativeLabel = string;

export type NormativeLabelDigest = Readonly<{
  source: string;
  sourceSha256: string;
  labels: ReadonlySet<NormativeLabel>;
  qualifiers: ReadonlySet<string>;
}>;

/** Whether a reference's trailing qualifier names something the corpus declares. */
export type QualifierResolution = "declared" | "absent" | "uncovered";

const headingDeclaration = /^#+ *(Table )?([0-9]+(?:\.[0-9]+)*)[ .–-]/gmu;
const boldDeclaration = /^\*\*(Table )?([0-9]+(?:\.[0-9]+)*)[ –-]/gmu;
const rowDeclaration = /^\|(Table )?([0-9]+(?:\.[0-9]+)*) /gmu;

/**
 * Tokens such as `WCP-16` that a reference may name as a row inside a declared table.
 *
 * The shape is deliberately narrow. A qualifier outside it resolves as `uncovered` rather than as
 * present, so a new qualifier shape forces this rule to be widened on purpose instead of passing
 * unchecked.
 */
const qualifierToken = /\b[A-Z]{2,}-[0-9]+\b/gu;
const labelShape = /^(?:Table )?[0-9]+(?:\.[0-9]+)*$/u;
const qualifierTokenShape = /^[A-Z]{2,}-[0-9]+$/u;

/** Every dot-prefix of a numeral, longest last, because a heading declares all of them. */
function dotPrefixes(numeral: string): ReadonlyArray<string> {
  const parts = numeral.split(".");
  return parts.map((_, index) => parts.slice(0, index + 1).join("."));
}

export function extractNormativeLabels(
  markdown: string,
): Readonly<{
  labels: ReadonlySet<NormativeLabel>;
  qualifiers: ReadonlySet<string>;
}> {
  const labels = new Set<NormativeLabel>();
  for (const [, table, numeral] of markdown.matchAll(headingDeclaration)) {
    if (numeral !== undefined) {
      for (const prefix of dotPrefixes(numeral)) {
        labels.add(`${table ?? ""}${prefix}`);
      }
    }
  }
  for (const declaration of [boldDeclaration, rowDeclaration]) {
    for (const [, table, numeral] of markdown.matchAll(declaration)) {
      if (numeral !== undefined) {
        labels.add(`${table ?? ""}${numeral}`);
      }
    }
  }
  const qualifiers = new Set(
    [...markdown.matchAll(qualifierToken)].map(([token]) => token),
  );
  return { labels, qualifiers };
}

/** True when the corpus declares the referenced clause or table. */
export function resolvesLabel(
  digest: NormativeLabelDigest,
  kind: string,
  numeral: string,
): boolean {
  return digest.labels.has(kind === "Table" ? `Table ${numeral}` : numeral);
}

export function resolvesQualifier(
  digest: NormativeLabelDigest,
  qualifier: string,
): QualifierResolution {
  if (labelShape.test(qualifier)) {
    return digest.labels.has(qualifier) ? "declared" : "absent";
  }
  if (qualifierTokenShape.test(qualifier)) {
    return digest.qualifiers.has(qualifier) ? "declared" : "absent";
  }
  return "uncovered";
}

const digestHeader = [
  "# Project-authored digest of the reference labels BPMN 2.0.2 declares.",
  "# Neither the corpus nor its conversion is redistributed; only these labels are tracked.",
  "# Regenerate with: node scripts/update-bpmn-normative-labels.ts",
];

export function serializeDigest(
  digest: NormativeLabelDigest,
): string {
  const sorted = (values: ReadonlySet<string>): ReadonlyArray<string> =>
    [...values].sort();
  return [
    ...digestHeader,
    `source\t${digest.source}`,
    `sourceSha256\t${digest.sourceSha256}`,
    ...sorted(digest.labels).map((label) => `label\t${label}`),
    ...sorted(digest.qualifiers).map((qualifier) => `qualifier\t${qualifier}`),
    "",
  ].join("\n");
}

export function parseDigest(text: string): NormativeLabelDigest {
  const labels = new Set<string>();
  const qualifiers = new Set<string>();
  let source: string | undefined;
  let sourceSha256: string | undefined;
  for (const line of text.split("\n")) {
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("\t");
    const field = line.slice(0, separator);
    const value = line.slice(separator + 1);
    switch (field) {
      case "source":
        source = value;
        break;
      case "sourceSha256":
        sourceSha256 = value;
        break;
      case "label":
        labels.add(value);
        break;
      case "qualifier":
        qualifiers.add(value);
        break;
      default:
        throw new Error(`Unknown normative-label digest field ${JSON.stringify(field)}`);
    }
  }
  if (source === undefined || sourceSha256 === undefined) {
    throw new Error("Normative-label digest is missing its source provenance");
  }
  return { source, sourceSha256, labels, qualifiers };
}

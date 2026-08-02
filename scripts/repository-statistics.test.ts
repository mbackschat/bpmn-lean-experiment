import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  analyzeLeanDeclarations,
  parseTokeiReport,
  renderRepositoryStatistics,
  replaceRepositoryStatistics,
} from "./repository-statistics.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("classifies public theorems, supporting lemmas, and declaration commands", () => {
  const source = `
/- theorem hiddenInComment : True := by trivial -/
def quoted := "private theorem hiddenInString : True := by trivial"

theorem publicResult : True := by trivial
private theorem helperResult : True := by trivial
lemma explicitHelper : True := by trivial
private lemma privateExplicitHelper : True := by trivial
noncomputable def computedValue : Nat := 1
structure Example where
  value : Nat
instance : Inhabited Example := ⟨⟨0⟩⟩
`;

  assert.deepEqual(analyzeLeanDeclarations(source), {
    publicTheorems: 1,
    supportingLemmas: 3,
    declarationCommands: 8,
  });
});

test("normalizes the selected Tokei languages and fills an absent language with zeroes", () => {
  assert.deepEqual(
    parseTokeiReport({
      Java: {
        blanks: 4,
        code: 20,
        comments: 3,
        reports: [{ name: "Example.java", stats: {} }],
      },
      Lean: {
        blanks: 6,
        code: 40,
        comments: 5,
        reports: [
          { name: "A.lean", stats: {} },
          { name: "B.lean", stats: {} },
        ],
      },
      TypeScript: {
        blanks: 8,
        code: 60,
        comments: 7,
        reports: [{ name: "example.ts", stats: {} }],
      },
      Total: {},
    }),
    [
      { language: "Java", files: 1, code: 20, comments: 3, blanks: 4 },
      { language: "Kotlin", files: 0, code: 0, comments: 0, blanks: 0 },
      {
        language: "TypeScript",
        files: 1,
        code: 60,
        comments: 7,
        blanks: 8,
      },
      { language: "Lean", files: 2, code: 40, comments: 5, blanks: 6 },
    ],
  );
});

test("renders deterministic Lean and Tokei statistics without a timestamp", () => {
  const rendered = renderRepositoryStatistics(
    {
      publicTheorems: 327,
      supportingLemmas: 26,
      declarationCommands: 1_440,
    },
    [
      { language: "Java", files: 49, code: 6_079, comments: 178, blanks: 657 },
      { language: "Kotlin", files: 0, code: 0, comments: 0, blanks: 0 },
      {
        language: "TypeScript",
        files: 252,
        code: 50_146,
        comments: 787,
        blanks: 3_060,
      },
      { language: "Lean", files: 75, code: 13_972, comments: 571, blanks: 1_702 },
    ],
    "14.0.0",
  );

  assert.match(rendered, /\| Public theorem declarations \| 327 \|/u);
  assert.match(rendered, /\| Supporting lemma declarations \| 26 \|/u);
  assert.match(rendered, /\| Proof declarations \/ all declaration commands \| 24\.5% \|/u);
  assert.match(rendered, /\| TypeScript \| 252 \| 50,146 \| 787 \| 3,060 \|/u);
  assert.match(rendered, /Language footprint \(`tokei 14\.0\.0`\)/u);
  assert.doesNotMatch(rendered, /20\d\d-/u);
});

test("replaces only the marked README statistics block", () => {
  const original = [
    "# Header",
    "",
    "Before.",
    "",
    "<!-- repository-statistics:start -->",
    "old",
    "<!-- repository-statistics:end -->",
    "",
    "After.",
    "",
  ].join("\n");

  assert.equal(
    replaceRepositoryStatistics(original, "generated"),
    [
      "# Header",
      "",
      "Before.",
      "",
      "<!-- repository-statistics:start -->",
      "generated",
      "<!-- repository-statistics:end -->",
      "",
      "After.",
      "",
    ].join("\n"),
  );
  assert.throws(
    () => replaceRepositoryStatistics("# No markers\n", "generated"),
    /statistics markers/u,
  );
});

test("keeps the tracked pre-push hook and installer on the statistics owner", async () => {
  const [hook, installer] = await Promise.all([
    readFile(path.join(projectRoot, ".githooks/pre-push"), "utf8"),
    readFile(path.join(projectRoot, "scripts/install-git-hooks.sh"), "utf8"),
  ]);

  assert.match(hook, /repository-statistics\.ts --pre-push/u);
  assert.match(installer, /core\.hooksPath \.githooks/u);
  assert.doesNotMatch(installer, /--global/u);
});

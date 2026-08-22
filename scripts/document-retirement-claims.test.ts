import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

/**
 * A document that says a named construct is retired must not leave it declared.
 *
 * The mechanism this closes is a same-change obligation a capsule wrote for itself and did not
 * perform. The obligation's original form was a promise about the future, "the amendment lands with
 * this implementation", which no repository fact can check: nothing distinguishes a promise that was
 * kept from one that was forgotten. A retirement claim is the same obligation in the present tense,
 * and that form is checkable, so the convention is to write the claim rather than the promise.
 *
 * The residual limit is worth stating: this binds the claim, not the obligation. A capsule that
 * silently drops its amendment and never writes the claim still passes, and the reusable review
 * question in [the process-assessment ledger](../docs/PROCESS-ASSESSMENT-LEDGER.md) stands in for
 * that half.
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/** Claim forms that assert a named construct no longer exists. */
const claimPatterns = [
  /`([A-Za-z_][A-Za-z0-9_]*)`[^.`]{0,80}?\bis (?:now )?retired\b/g,
  /\bretires? `([A-Za-z_][A-Za-z0-9_]*)`/g,
] as const;

/**
 * Declaration forms across the languages a retired construct could survive in.
 *
 * Documented `type` blocks count as declarations: a contract a specification still shows is a contract
 * a reader will implement, whether or not any source file carries it yet.
 */
const declarationPatterns = (identifier: string): ReadonlyArray<RegExp> => [
  new RegExp(`\\b(?:type|interface|enum|class)\\s+${identifier}\\b`),
  new RegExp(`\\b(?:const|let|function)\\s+${identifier}\\s*[:=(]`),
  new RegExp(`\\b(?:def|structure|inductive|abbrev)\\s+${identifier}\\b`),
];

function trackedFiles(): ReadonlyArray<string> {
  return execFileSync("git", ["ls-files", "-z"], { cwd: projectRoot, encoding: "utf8" })
    .split("\0")
    .filter((entry) => entry.length > 0);
}

const searchableExtensions = new Set([".ts", ".tsx", ".lean", ".md", ".java"]);

function searchable(relativePath: string): boolean {
  return searchableExtensions.has(path.extname(relativePath)) &&
    !relativePath.startsWith("docs/archive/") &&
    !relativePath.startsWith("adoption/");
}

function read(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

/** Every construct a maintained document claims is retired, with the document that claims it. */
function retirementClaims(files: ReadonlyArray<string>): ReadonlyMap<string, string> {
  const claims = new Map<string, string>();
  for (const relativePath of files.filter((entry) => path.extname(entry) === ".md")) {
    if (!searchable(relativePath)) continue;
    const text = read(relativePath);
    for (const pattern of claimPatterns) {
      for (const match of text.matchAll(pattern)) {
        const identifier = match[1];
        if (identifier !== undefined) claims.set(identifier, relativePath);
      }
    }
  }
  return claims;
}

/** The files that still declare `identifier`, ignoring the sentence that retires it. */
function survivingDeclarations(
  identifier: string,
  files: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const patterns = declarationPatterns(identifier);
  return files.filter((relativePath) =>
    searchable(relativePath) &&
    read(relativePath).split("\n").some((line) =>
      patterns.some((pattern) => pattern.test(line))
    )
  );
}

test("no maintained document retires a construct that is still declared", () => {
  const files = trackedFiles();
  const claims = retirementClaims(files);
  // A vacuous pass is the failure mode here: the guard is only worth its cost while at least one
  // claim exists to check, so an empty claim set is itself reported.
  assert.ok(claims.size > 0, "no retirement claim was parsed, so this guard checked nothing");
  const violations = [...claims].flatMap(([identifier, claimedIn]) => {
    const surviving = survivingDeclarations(identifier, files);
    return surviving.length === 0 ? [] : [{ identifier, claimedIn, surviving }];
  });
  assert.deepEqual(violations, []);
});

test("the claim and declaration patterns each reject their seeded counterexample", () => {
  const retired = "MultiInstanceActivityInstanceId";
  assert.ok(retirementClaims(trackedFiles()).has(retired), "the live claim is not parsed");

  for (const declaration of [
    `type ${retired} = {`,
    `structure ${retired} where`,
    `const ${retired}: string = "x"`,
    `interface ${retired} {`,
  ]) {
    assert.ok(
      declarationPatterns(retired).some((pattern) => pattern.test(declaration)),
      declaration,
    );
  }
  // A mention is not a declaration, or every retirement claim would report itself.
  for (const mention of [
    `\`${retired}\` is retired rather than kept as an alias`,
    `the retired ${retired} carried three fields`,
  ]) {
    assert.ok(
      !declarationPatterns(retired).some((pattern) => pattern.test(mention)),
      mention,
    );
  }
});

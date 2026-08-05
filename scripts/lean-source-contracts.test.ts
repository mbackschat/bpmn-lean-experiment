import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  analyzeLeanSource,
  worktreeLeanSourceFiles,
} from "./lean-source-analysis.ts";

export type SourceViolation = Readonly<{
  path: string;
  line: number;
  message: string;
}>;

function lineStartOffsets(source: string): number[] {
  const offsets = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function moduleContractViolation(
  sourcePath: string,
  source: string,
): SourceViolation | null {
  const analysis = analyzeLeanSource(source);
  const lines = analysis.code.split(/\r?\n/u);
  const offsets = lineStartOffsets(source);
  let importPreludeEnd = 0;
  let firstDeclarationOffset = source.length;

  for (const [lineIndex, line] of lines.entries()) {
    const lineOffset = offsets[lineIndex];
    if (lineOffset === undefined) {
      throw new RangeError("Lean source line offset is missing");
    }
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (/^import\s+[A-Za-z0-9_.]+\s*$/u.test(trimmed)) {
      importPreludeEnd = lineOffset + line.length;
      continue;
    }
    firstDeclarationOffset = lineOffset;
    break;
  }

  const moduleDocument = analysis.moduleDocuments[0];
  if (moduleDocument === undefined) {
    return {
      path: sourcePath,
      line: 1,
      message: "missing module document after imports and before the first declaration",
    };
  }
  if (
    moduleDocument.offset < importPreludeEnd ||
    moduleDocument.offset > firstDeclarationOffset
  ) {
    return {
      path: sourcePath,
      line: moduleDocument.line,
      message: "module document must follow imports and precede the first declaration",
    };
  }
  return null;
}

function isMaintainedConformancePath(sourcePath: string): boolean {
  const normalized = sourcePath.replaceAll(path.sep, "/");
  return (
    path.posix.basename(normalized).endsWith("Conformance.lean") &&
    !normalized.startsWith("BpmnSemantics/Experiments/")
  );
}

function anonymousExampleViolations(
  sourcePath: string,
  source: string,
): SourceViolation[] {
  if (!isMaintainedConformancePath(sourcePath)) {
    return [];
  }
  return analyzeLeanSource(source).code
    .split(/\r?\n/u)
    .flatMap((line, lineIndex) =>
      /^\s*(?:@\[[^\]\r\n]*\]\s*)*example(?=\s|:|\{|\(|$)/u.test(line)
        ? [
            {
              path: sourcePath,
              line: lineIndex + 1,
              message: "anonymous maintained conformance fact; use a descriptive public theorem",
            },
          ]
        : [],
    );
}

export function leanSourceViolations(
  sourcePath: string,
  source: string,
): SourceViolation[] {
  const moduleViolation = moduleContractViolation(sourcePath, source);
  return [
    ...(moduleViolation === null ? [] : [moduleViolation]),
    ...anonymousExampleViolations(sourcePath, source),
  ];
}

function formatViolation(violation: SourceViolation): string {
  return `${violation.path}:${violation.line}: ${violation.message}`;
}

test("module contracts reject absence and late placement", () => {
  assert.equal(
    formatViolation(
      moduleContractViolation("Missing.lean", "def value := 1\n")!,
    ),
    "Missing.lean:1: missing module document after imports and before the first declaration",
  );
  assert.equal(
    formatViolation(
      moduleContractViolation(
        "Late.lean",
        "import Example.Core\n\ndef value := 1\n\n/-! Too late. -/\n",
      )!,
    ),
    "Late.lean:5: module document must follow imports and precede the first declaration",
  );
});

test("module contracts accept declarations and import-only umbrellas", () => {
  assert.equal(
    moduleContractViolation(
      "Declared.lean",
      "import Example.Core\n\n/-! Contract. -/\n\ndef value := 1\n",
    ),
    null,
  );
  assert.equal(
    moduleContractViolation(
      "Umbrella.lean",
      "import Example.Core\nimport Example.Laws\n\n/-! Public imports. -/\n",
    ),
    null,
  );
});

test("anonymous conformance examples report exact paths and lines", () => {
  assert.deepEqual(
    leanSourceViolations(
      "BpmnSemantics/Conformance.lean",
      [
        "/-! Contract. -/",
        "",
        "namespace BpmnSemantics",
        "",
        "example : True := by trivial",
        "  example : True := by trivial",
        "@[simp] example : True := by trivial",
        "example(h : True) : True := by exact h",
        "",
      ].join("\n"),
    ).map(formatViolation),
    [
      "BpmnSemantics/Conformance.lean:5: anonymous maintained conformance fact; use a descriptive public theorem",
      "BpmnSemantics/Conformance.lean:6: anonymous maintained conformance fact; use a descriptive public theorem",
      "BpmnSemantics/Conformance.lean:7: anonymous maintained conformance fact; use a descriptive public theorem",
      "BpmnSemantics/Conformance.lean:8: anonymous maintained conformance fact; use a descriptive public theorem",
    ],
  );
});

test("comments, literals, named theorems, and experiments do not create findings", () => {
  const source = String.raw`/-! Contract with the Worker's \"quoted\" boundary. -/

-- an author's "example : False" note
/- outer
   /- example : False := by contradiction -/
-/
@[simp]
theorem named_fact : True := by trivial
def literal := "-- /- -/ example : False escaped \\\" quote"
`;
  assert.deepEqual(
    anonymousExampleViolations(
      "BpmnSemantics/NamedConformance.lean",
      source,
    ),
    [],
  );
  assert.deepEqual(
    anonymousExampleViolations(
      "BpmnSemantics/Experiments/FrozenConformance.lean",
      "/-! Frozen. -/\n\nexample : True := by trivial\n",
    ),
    [],
  );
});

test("Lean literals preserve delimiters, primes, and exact character tokens", () => {
  const source = String.raw`/-! An author's "literal" contract. -/
def delimiters := "-- /- -/ escaped \\\" quote and \\\\ slash"
def Bool.not_eq_true' := true
def quote : Char := '"'
def apostrophe : Char := '\''
def backspace : Char := '\x08'
-- the token's "quoted" target is data
theorem after_literals : True := by trivial
`;
  const analysis = analyzeLeanSource(source);
  assert.match(analysis.code, /def Bool\.not_eq_true' := true/u);
  assert.match(analysis.code, /theorem after_literals : True := by trivial/u);
  assert.equal(analysis.moduleDocuments.length, 1);
});

test("maintained Lean discovery includes a non-ignored pending source", () => {
  const pendingSource = ".lean-source-contract-pending-probe.lean";
  assert.equal(existsSync(pendingSource), false);
  writeFileSync(pendingSource, "/-! Pending contract. -/\n", "utf8");
  try {
    assert.equal(worktreeLeanSourceFiles().includes(pendingSource), true);
  } finally {
    unlinkSync(pendingSource);
  }
});

test("a ratio-discriminating sparse module remains valid", () => {
  const declarations = Array.from(
    { length: 30 },
    (_, index) => `def value${index + 1} := ${index + 1}`,
  );
  const source = ["/-! Sparse contract. -/", ...declarations, ""].join("\n");
  assert.deepEqual(
    leanSourceViolations("BpmnSemantics/SparseConformance.lean", source),
    [],
  );
  assert.equal((source.match(/\/-!/gu) ?? []).length, 1);
  assert.equal((source.match(/\/--/gu) ?? []).length, 0);
  assert.equal(source.split("\n").filter((line) => line.length > 0).length, 31);
});

test("maintained Lean sources satisfy structural comment contracts", () => {
  const violations = worktreeLeanSourceFiles().flatMap((sourcePath) => {
    const source = readFileSync(sourcePath, "utf8");
    return leanSourceViolations(sourcePath, source);
  });
  assert.deepEqual(
    violations.map(formatViolation),
    [],
    "Lean module contracts and maintained conformance facts must remain locally identifiable",
  );
});

/**
 * `native_decide` sites, recorded exactly because they widen the trusted path.
 *
 * A `native_decide` proof compiles the decision procedure and trusts the result, so it adds a
 * `native_decide` axiom to its theorem's footprint; `#print axioms` on
 * `string_equals_expression_parses_exactly` reports one beside `propext`, `Classical.choice`, and
 * `Quot.sound`. The kernel-decide policy in [CLAUDE.md](../CLAUDE.md) prefers `decide +kernel`,
 * which adds no axiom.
 *
 * This inventory is a ratchet rather than a permission: a new site, or any new module, fails here
 * instead of silently enlarging what the project trusts. Removing sites is always admissible and
 * only requires lowering a figure; raising one is an owner decision about the trusted path. The
 * guard exists because prose alone did not hold — a repository-wide "`native_decide` remains
 * excluded" sentence was written while 56 sites in six modules were live.
 *
 * Forty of those 56 are now converted, and every module was measured before its conversion because
 * kernel cost follows a proposition's reduction depth rather than a module's site count. The
 * remaining two rows are **not** a cost decision and cannot be lowered by spending more CPU: both
 * decide a fact about parsing a `String` literal, and the kernel does not reduce `String`
 * operations, so `decide +kernel` fails to elaborate rather than running slowly. `parseRejected
 * "{\"id\":1,\"id\":1}" = true` and `parseSimpleBooleanExpression "stringEquals(route,\"review\")"`
 * both report that their `Decidable` instance "did not reduce to `isTrue` or `isFalse`".
 * `native_decide` decides them because compiled code walks the string. Removing these two requires
 * restating the propositions over a non-`String` representation, which is a semantic change to what
 * the fixtures lock, not a tactic swap.
 */
const recordedNativeDecideSites = Object.freeze([
  Object.freeze({ path: "BpmnSemantics/SemanticProcessJsonConformance.lean", sites: 15 }),
  Object.freeze({
    path: "BpmnSemantics/ExclusiveGatewaySimpleBooleanConformance.lean",
    sites: 1,
  }),
]);

/**
 * Counts tactic-position sites only, so a comment explaining why a module avoids `native_decide`
 * cannot inflate a recorded figure and turn this ratchet into a false alarm.
 */
export function nativeDecideSites(source: string): number {
  const tacticPosition =
    /(?:^|\bby|<;>|·|;|\btry|\brepeat|\ball_goals|\bfirst|[|⟨,])\s*$/u;
  const tacticTerminator = /^\s*(?:[,⟩)\]]|--|$)/u;

  return source.split(/\r?\n/u).reduce((total, line) => {
    let sites = 0;
    for (const match of line.matchAll(/(?<![\w.])native_decide(?![\w])/gu)) {
      const before = line.slice(0, match.index);
      const after = line.slice(match.index + "native_decide".length);
      if (tacticPosition.test(before) && tacticTerminator.test(after)) {
        sites += 1;
      }
    }
    return total + sites;
  }, 0);
}

test("native_decide stays inside its exactly recorded exception set", () => {
  const recorded = new Map(
    recordedNativeDecideSites.map(({ path: p, sites }) => [p, sites]),
  );
  const measured = worktreeLeanSourceFiles()
    .map((sourcePath) => ({
      path: sourcePath,
      sites: nativeDecideSites(readFileSync(sourcePath, "utf8")),
    }))
    .filter(({ sites }) => sites > 0)
    .sort((left, right) => right.sites - left.sites || left.path.localeCompare(right.path));

  assert.deepEqual(
    measured,
    [...recorded]
      .map(([p, sites]) => ({ path: p, sites }))
      .sort((left, right) => right.sites - left.sites || left.path.localeCompare(right.path)),
    "a new native_decide site trusts the compiler for a proposition the kernel could decide; use `decide +kernel` or move the recorded figure deliberately",
  );
});

test("the native_decide inventory counts tactic sites and not prose", () => {
  assert.equal(nativeDecideSites("  native_decide\n  exact ⟨by native_decide, rfl⟩"), 2);
  assert.equal(nativeDecideSites("/-- Why this avoids native_decide entirely. -/"), 0);
  assert.equal(nativeDecideSites("  decide +kernel\n  Decidable.decide (a = b)"), 0);
});

/**
 * Declarations whose result is a *collection contribution* over a semantic variant, where a
 * wildcard arm silently returns "contributes nothing" for a variant nobody considered.
 *
 * Every entry here decides either a public observation or a graph edge set, so an unnoticed
 * absence is wrong rather than conservative. Three separate families were made invisible this
 * way before these matches were required to be exhaustive: a boundary Event unreachable because
 * its Activity edge was keyed on trigger kind, and a composite family's task and timer waits
 * missing from every projection. The compiler is the guard; this test keeps the wildcard from
 * coming back.
 */
const exhaustiveVariantInventories = Object.freeze([
  Object.freeze({
    path: "BpmnSemantics/SemanticProcess/Scenario.lean",
    declaration: "ownedWaitDefinitions",
  }),
  Object.freeze({
    path: "BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean",
    declaration: "attachedBoundaryHost?",
  }),
]);

function declarationBody(source: string, declaration: string): string {
  const lines = source.split(/\r?\n/u);
  const start = lines.findIndex((line) =>
    new RegExp(
      `^(?:private\\s+)?def\\s+${declaration.replace(/[?]/gu, "\\?")}(?=\\s|:|$)`,
      "u",
    ).test(line)
  );
  if (start < 0) {
    throw new Error(`${declaration} is absent; the guard must be retargeted`);
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) =>
    /^(?:@\[|\/-|private\s+)?(?:def|theorem|structure|inductive|abbrev|end)\b/u
      .test(line)
  );
  return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join("\n");
}

test("public-projection and graph-edge inventories match every variant explicitly", () => {
  for (const { path: relativePath, declaration } of exhaustiveVariantInventories) {
    const source = readFileSync(
      fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
      "utf8",
    );
    const body = declarationBody(source, declaration);
    assert.equal(
      /^\s*\|\s*_\s*(?:,\s*_\s*)*=>/mu.test(body),
      false,
      `${relativePath}:${declaration} must not use a wildcard arm: a new semantic variant would silently contribute nothing to a public observation or a reachability edge`,
    );
  }
});

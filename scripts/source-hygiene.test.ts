import assert from "node:assert/strict";
import {
  execFileSync,
  spawnSync,
} from "node:child_process";
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import test from "node:test";

import { analyzeLeanSource } from "./lean-source-analysis.ts";
import {
  hardCeiling,
  headroomReportLines,
  nonblankLines,
  reviewTarget,
} from "./source-measure.ts";
import {
  assessSourceHygiene,
  baselineReviewedLargeFileApprovals,
  reviewedLargeFiles,
  sourceHygieneApprovalFindings,
} from "./source-hygiene-policy.ts";
const leanUmbrellaModules = [
  "BpmnSemantics.lean",
  "BpmnSemantics/SemanticProcess.lean",
  "BpmnSemantics/SemanticProcessJson.lean",
] as const;

function worktreeSourceFiles(): string[] {
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  ).split("\n");
  return presentSourceFiles(paths);
}

function presentSourceFiles(paths: ReadonlyArray<string>): string[] {
  return paths
    .filter((path) => /\.(?:c?js|java|lean|mjs|ts)$/u.test(path))
    .filter((path) => !path.includes("/dist/"))
    .filter((path) => existsSync(path));
}

/**
 * Project-authored JavaScript modules, in enumeration order.
 *
 * There is no allowlist: every hand-written module in this repository is strict
 * TypeScript checked by a no-emit gate, so any `.js`, `.cjs`, or `.mjs` file is
 * an unchecked execution path regardless of its size or role.
 */
function javaScriptModules(files: ReadonlyArray<string>): string[] {
  return files.filter((path) => /\.(?:c?js|mjs)$/u.test(path));
}

function assessLeanUmbrella(path: string, source: string): string | null {
  const executableLines = analyzeLeanSource(source).code
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const invalidLine = executableLines.find(
    (line) => !/^import [A-Za-z0-9_.]+$/u.test(line),
  );
  return invalidLine === undefined
    ? null
    : `${path}: import-only umbrella contains ${JSON.stringify(invalidLine)}`;
}

function directTypeScriptHarnessFiles(): string[] {
  const shownConfig: unknown = JSON.parse(
    execFileSync(
      "./node_modules/.bin/tsc",
      ["--showConfig", "-p", "tsconfig.harness.json"],
      { encoding: "utf8" },
    ),
  );
  if (
    shownConfig === null ||
    typeof shownConfig !== "object" ||
    !("files" in shownConfig) ||
    !Array.isArray(shownConfig.files) ||
    !shownConfig.files.every((path) => typeof path === "string")
  ) {
    throw new TypeError(
      "TypeScript --showConfig did not return a string file list",
    );
  }
  return shownConfig.files.filter((path) => !path.endsWith(".d.ts"));
}

/**
 * Shipped TypeScript: package, runner, and platform-package `src` trees, excluding build output.
 *
 * Narrower than the size measurement, which covers every hand-written file. Tests and scripts build
 * report text and fixture lines by joining on separators, which is not an identity claim, so the
 * composite-key rule applies only where a value can become a durable key.
 */
function shippedTypeScriptFiles(): string[] {
  return worktreeSourceFiles().filter((path) =>
    path.endsWith(".ts") &&
    /^(?:(?:packages|runners)\/[^/]+|platform\/(?:apps|foundation|modules|workers)\/[^/]+|platform\/(?:contracts|ui-kit))\/src\//u.test(path)
  );
}

/**
 * Specifiers TypeScript resolves: `from` clauses, side-effect imports, and
 * literal dynamic imports.
 *
 * `new URL("../dist/workflows.js", import.meta.url)` is deliberately outside
 * this pattern. A runtime bundler path is not a resolved module specifier, so
 * it places no requirement on the type gate.
 */
const resolvedSpecifierPattern =
  /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/gu;

/**
 * Lines that can carry an import statement.
 *
 * A line whose first nonblank character opens a string literal is quoted
 * fixture text — policy tests and generators contain import syntax as data, and
 * a text scanner cannot otherwise separate the two. Real statements begin with
 * `import`, `export`, or the closing brace of a multi-line clause.
 */
function importBearingLines(source: string): string[] {
  return source
    .split(/\r?\n/u)
    .filter((line) => !/^\s*["'`]/u.test(line));
}

/**
 * `Array.prototype.join` with a separator, which no composite identity may use.
 *
 * `path.join` is a different API and stays admissible, as does an empty separator: that is pure
 * concatenation and claims nothing about delimiting. A non-empty separator does make such a claim,
 * and in this project it is always false — the shared wire domain admits every Unicode scalar value,
 * so no character is reserved and one part can absorb the separator to forge another part's key.
 */
const separatorJoinPattern =
  /(?<!\bpath)\.join\(\s*(?!(?:""|''|``)\s*\))/u;

/**
 * Reports composite values built by joining parts on a separator.
 *
 * Two host schedulers shipped a durable timer key joined on `U+0000` under a comment asserting that
 * the separator made forgery impossible. It did not: `isWellFormedWireString` admits that scalar, so
 * moving the separator into an identifier produced a byte-identical key for two different committed
 * timers. `canonicalTypedTupleEncoding` owns composite identity and delimits structurally instead.
 */
function separatorJoins(path: string, source: string): string[] {
  return source
    .split(/\r?\n/u)
    .flatMap((line, index) =>
      separatorJoinPattern.test(line) ? [`${path}:${index + 1}`] : []
    );
}

function isProjectBuildOutput(specifier: string): boolean {
  const projectOwned =
    specifier.startsWith(".") || specifier.startsWith("@bpmn-lean/");
  return projectOwned && /(?:^|\/)dist\//u.test(specifier);
}

/**
 * Reports resolved specifiers that reach into project build output.
 *
 * The harness type gate maps `@bpmn-lean/*` to package sources so it needs no
 * prior build. A `dist/` specifier reintroduces an undeclared generated input:
 * it type-checks against whatever declarations an earlier build happened to
 * leave behind, and a clean checkout cannot resolve it at all. A published
 * dependency's own `dist` directory stays admissible.
 */
function generatedOutputImports(path: string, source: string): string[] {
  return importBearingLines(source)
    .flatMap((line) => [...line.matchAll(resolvedSpecifierPattern)])
    .flatMap(([, specifier]) => (specifier === undefined ? [] : [specifier]))
    .filter(isProjectBuildOutput)
    .map((specifier) => `${path}: ${specifier}`);
}

function erasableSyntaxDiagnostics(
  paths: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const result = spawnSync(
    "./node_modules/.bin/tsc",
    [
      "--noEmit",
      "--noResolve",
      "--erasableSyntaxOnly",
      "--pretty",
      "false",
      "--skipLibCheck",
      "--target",
      "ESNext",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      ...paths,
    ],
    {
      encoding: "utf8",
      env: environment,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  return `${result.stdout}${result.stderr}`
    .split(/\r?\n/u)
    .filter((line) => line.includes("error TS1294:"));
}

test("the source-hygiene policy rejects every regression class", () => {
  const measurements = [
    { path: "clean.ts", lines: reviewTarget },
    { path: "review.ts", lines: reviewTarget + 1 },
    { path: "ceiling.java", lines: hardCeiling },
    { path: "over.lean", lines: hardCeiling + 1 },
  ];
  const assessment = assessSourceHygiene(
    measurements,
    new Map([
      ["review.ts", "one cohesive boundary"],
      ["ceiling.java", "one cohesive boundary"],
      ["stale.ts", "obsolete"],
      ["clean.ts", "obsolete"],
      ["over.lean", "not permitted"],
    ]),
  );

  assert.deepEqual(assessment.hardViolations, [
    { path: "over.lean", lines: hardCeiling + 1 },
  ]);
  assert.deepEqual(assessment.unreviewed, []);
  assert.deepEqual(assessment.invalidReviews, [
    "stale.ts: stale or untracked path",
    "clean.ts: no longer exceeds the review target",
    "over.lean: cannot exempt the hard ceiling",
  ]);
});

test("rejects a large-source exception absent from owner approval", () => {
  assert.deepEqual(
    sourceHygieneApprovalFindings(
      new Map([["large.ts", "one cohesive boundary"]]),
      new Map(),
    ),
    ["large.ts: exception lacks owner approval"],
  );
});

test("binds large-source exceptions to the owner-approved baseline", () => {
  assert.deepEqual(
    sourceHygieneApprovalFindings(
      reviewedLargeFiles,
      baselineReviewedLargeFileApprovals(),
    ),
    [],
    "agents may not add or change reviewed-large-file exceptions without owner approval",
  );
});

test("source enumeration includes non-ignored files before commit", () => {
  const pendingSource = ".source-hygiene-pending-probe.ts";
  assert.equal(
    existsSync(pendingSource),
    false,
    `${pendingSource} is reserved for the source-hygiene self-test`,
  );
  writeFileSync(pendingSource, "export {};\n", "utf8");
  try {
    assert.equal(worktreeSourceFiles().includes(pendingSource), true);
  } finally {
    unlinkSync(pendingSource);
  }
});

test("source enumeration excludes files deleted from the worktree", () => {
  const deletedSource = ".source-hygiene-deleted-probe.ts";
  assert.equal(existsSync(deletedSource), false);
  assert.deepEqual(
    presentSourceFiles([
      "scripts/source-hygiene.test.ts",
      deletedSource,
    ]),
    ["scripts/source-hygiene.test.ts"],
  );
});

test("the JavaScript-module policy admits no extension and no location", () => {
  assert.deepEqual(
    javaScriptModules([
      "packages/semantic-core/test/fixture.mjs",
      "packages/semantic-core/test/fixture.ts",
      "scripts/harness.cjs",
      "scripts/harness.js",
      "scripts/harness.ts",
      "BpmnSemantics/Core.lean",
      "runners/cibseven/src/main/java/Runner.java",
    ]),
    [
      "packages/semantic-core/test/fixture.mjs",
      "scripts/harness.cjs",
      "scripts/harness.js",
    ],
  );
});

test("no project-authored JavaScript module remains", () => {
  assert.deepEqual(
    javaScriptModules(worktreeSourceFiles()).sort(),
    [],
    "hand-written modules must be strict TypeScript covered by a no-emit gate; JavaScript has no reviewed exception",
  );
});

test("Lean umbrellas reject executable declarations", () => {
  assert.equal(
    assessLeanUmbrella(
      "Umbrella.lean",
      "import Example.Core\n\n/-! Public imports. -/\n",
    ),
    null,
  );
  assert.equal(
    assessLeanUmbrella(
      "Umbrella.lean",
      "import Example.Core\n\ndef hiddenDefinition := 1\n",
    ),
    'Umbrella.lean: import-only umbrella contains "def hiddenDefinition := 1"',
  );
});

test("direct TypeScript rejects syntax that Node cannot erase", () => {
  const pendingSource = ".erasable-syntax-pending-probe.ts";
  assert.equal(existsSync(pendingSource), false);
  writeFileSync(
    pendingSource,
    "enum InvalidDirectSyntax { Value = 'value' }\n",
    "utf8",
  );
  try {
    assert.deepEqual(
      erasableSyntaxDiagnostics([pendingSource]),
      [
        `${pendingSource}(1,6): error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.`,
      ],
    );
  } finally {
    unlinkSync(pendingSource);
  }
});

test("direct TypeScript syntax rejection is color-independent", () => {
  const pendingSource = ".erasable-syntax-color-pending-probe.ts";
  const colorEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    FORCE_COLOR: "3",
  };
  delete colorEnvironment.NO_COLOR;
  assert.equal(existsSync(pendingSource), false);
  writeFileSync(
    pendingSource,
    "enum InvalidDirectSyntax { Value = 'value' }\n",
    "utf8",
  );
  try {
    assert.deepEqual(
      erasableSyntaxDiagnostics([pendingSource], colorEnvironment),
      [
        `${pendingSource}(1,6): error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.`,
      ],
    );
  } finally {
    unlinkSync(pendingSource);
  }
});

test("the build-output policy separates static specifiers from runtime paths", () => {
  assert.deepEqual(
    generatedOutputImports(
      "probe.test.ts",
      [
        'import { helper } from "../dist/helper.js";',
        "import {",
        "  sequencing,",
        '} from "../dist/sequencing.js";',
        'export { law } from "./dist/law.js";',
        'import "@bpmn-lean/temporal-adapter/dist/side-effect.js";',
        'const late = await import("./dist/late.js");',
        'import { Ajv2020 } from "ajv/dist/2020.js";',
        'const bundle = new URL("../dist/workflows.js", import.meta.url);',
        'import { contract } from "@bpmn-lean/semantic-core";',
      ].join("\n"),
    ),
    [
      "probe.test.ts: ../dist/helper.js",
      "probe.test.ts: ../dist/sequencing.js",
      "probe.test.ts: ./dist/law.js",
      "probe.test.ts: @bpmn-lean/temporal-adapter/dist/side-effect.js",
      "probe.test.ts: ./dist/late.js",
    ],
  );
});

test("the harness type gate resolves no project build output", () => {
  assert.deepEqual(
    directTypeScriptHarnessFiles().flatMap((path) =>
      generatedOutputImports(path, readFileSync(path, "utf8")),
    ),
    [],
    "the harness gate must type-check from package sources alone; import the package entry point instead of its build output",
  );
});

test("direct TypeScript harnesses use only erasable syntax", () => {
  assert.deepEqual(
    erasableSyntaxDiagnostics(directTypeScriptHarnessFiles()),
    [],
    "Node executes harness TypeScript without a transform step",
  );
});

test("the composite-key policy separates delimiting claims from concatenation", () => {
  assert.deepEqual(
    separatorJoins(
      "probe.ts",
      [
        // The exact shipped defect, and the same shape with the other quotings.
        '  ].join("\\u0000");',
        "  ].join('-');",
        "  ].join(`:`);",
        "  return parts.join(separator);",
        // Admissible: concatenation claims no delimiter, and `path.join` is another API.
        '  ].join("");',
        "  ].join('');",
        "  ].join(``);",
        '  const absolute = path.join(projectRoot, relativePath);',
      ].join("\n"),
    ),
    ["probe.ts:1", "probe.ts:2", "probe.ts:3", "probe.ts:4"],
  );
});

test("no shipped composite value is built by joining on a separator", () => {
  assert.deepEqual(
    shippedTypeScriptFiles().flatMap((path) =>
      separatorJoins(path, readFileSync(path, "utf8")),
    ),
    [],
    "build a composite identity with canonicalTypedTupleEncoding; no separator character is reserved in the shared wire domain",
  );
});

test("hand-written source respects reviewed module-size boundaries", () => {
  const sourceFiles = worktreeSourceFiles();
  const measurements = sourceFiles.map((path) => ({
    path,
    lines: nonblankLines(readFileSync(path, "utf8")),
  }));
  const assessment = assessSourceHygiene(
    measurements,
    reviewedLargeFiles,
  );

  assert.deepEqual(
    assessment.hardViolations,
    [],
    `hand-written source exceeds the ${hardCeiling}-nonblank-line hard ceiling`,
  );
  assert.deepEqual(
    assessment.unreviewed,
    [],
    `source above the ${reviewTarget}-line review target needs a cohesive split or a narrow reviewed justification`,
  );
  assert.deepEqual(
    assessment.invalidReviews,
    [],
    "reviewed-large-file entries must be current, necessary, and below the hard ceiling",
  );
  for (const line of headroomReportLines(measurements)) {
    process.stdout.write(`${line}\n`);
  }
  const umbrellaViolations = leanUmbrellaModules.flatMap((path) => {
    assert.equal(
      sourceFiles.includes(path),
      true,
      `${path} must remain a tracked or pending source file`,
    );
    const violation = assessLeanUmbrella(path, readFileSync(path, "utf8"));
    return violation === null ? [] : [violation];
  });
  assert.deepEqual(
    umbrellaViolations,
    [],
    "Lean umbrella modules must contain only imports, comments, and whitespace",
  );
});

/**
 * Tactic-position `decide` sites that pay for their reduction twice.
 *
 * Plain `decide` reduces the `Decidable` instance in the elaborator, confirms `isTrue`, then discards
 * that result and lets the kernel redo the whole reduction — the toolchain's own implementation says
 * so. `decide +kernel` reduces once, in the kernel, proving the same proposition from the same
 * instance with no new axiom and with the elaborator's `whnf` removed from the trusted path.
 *
 * Measured on this repository's clean Lean gate: 475s of CPU became 249s. Without a guard the saving
 * erodes one capsule at a time, because plain `decide` is what a contributor writes by default.
 *
 * Deliberately narrow. It matches only tactic position, so the Bool-valued `decide (…)` application
 * and `Decidable.decide` are untouched, and it says nothing about whether a finite decided fixture is
 * the right evidence for a claim — [the capsule rules](../CLAUDE.md) own that question.
 */
function unkernelledDecideSites(path: string, source: string): string[] {
  // Both bounds are load-bearing and each was refuted by a live site rather than reasoned about.
  // The prefix must include the tactic combinators, because an alternation of only line-start, `by`,
  // and the bracket forms was blind to `cases outcome <;> decide`. The suffix must stay, because
  // without it the word "decide" in an English docstring matches, and `decide (x = y)` is the
  // Bool-valued application this guard deliberately leaves alone.
  const tacticPosition =
    /(?:^|\bby|<;>|·|;|\btry|\brepeat|\ball_goals|\bfirst|[|⟨,])\s*$/u;
  // A following combinator terminates the tactic too, so `first | decide | simp` counts. `\|(?!\|)`
  // keeps a Bool-valued `decide h || decide g` out, where `||` is disjunction rather than an
  // alternative branch.
  const tacticTerminator = /^\s*(?:[,⟩)\]]|\|(?!\|)|<;>|--|$)/u;
  // Own token only: `native_decide`, `Decidable.decide`, and `decide_eq_true` are other declarations.
  const ownToken = /(?<![\w.])decide(?![\w])/gu;

  return source.split("\n").flatMap((line, index) => {
    const sites: string[] = [];
    for (const match of line.matchAll(ownToken)) {
      const before = line.slice(0, match.index);
      const after = line.slice(match.index + "decide".length);
      // Per occurrence, not per line: a line-wide `includes("decide +kernel")` exempted the plain
      // half of `⟨by decide +kernel, by decide⟩`.
      if (!tacticPosition.test(before) || /^\s*\+\s*kernel\b/u.test(after)) {
        continue;
      }
      if (tacticTerminator.test(after)) {
        sites.push(`${path}:${index + 1}`);
      }
    }
    return sites;
  });
}

test("every Lean tactic-position decide reduces once, in the kernel", () => {
  const leanSources = worktreeSourceFiles().filter((path) => path.endsWith(".lean"));
  assert.ok(leanSources.length > 50, `Lean enumeration returned ${leanSources.length} files`);

  assert.deepEqual(
    leanSources.flatMap((path) => unkernelledDecideSites(path, readFileSync(path, "utf8"))),
    [],
    "replace `decide` with `decide +kernel` so the reduction is not performed twice",
  );
});

test("the kernel-decide policy detects a plain tactic site and ignores applications", () => {
  assert.deepEqual(
    unkernelledDecideSites("Probe.lean", [
      "theorem a : 1 = 1 := by decide",
      "  decide",
      "  exact ⟨by decide, rfl⟩",
      "theorem b : 2 = 2 := by decide +kernel",
      "  decide +kernel",
      "  hosts.filter (fun h => decide (h = target))",
      "  Decidable.decide (a = b)",
    ].join("\n")),
    ["Probe.lean:1", "Probe.lean:2", "Probe.lean:3"],
  );
});

/**
 * The combinator forms a live `cases outcome <;> decide` survived, plus the two exemptions that
 * make the predicate narrow. Each flagged line here was invisible to the predicate this replaced.
 */
test("the kernel-decide policy reaches combinator positions and per-occurrence exemptions", () => {
  assert.deepEqual(
    unkernelledDecideSites("Probe.lean", [
      "  cases outcome <;> decide",
      "  · decide",
      "  all_goals decide",
      "  try decide",
      "  repeat decide",
      "  exact ⟨by decide +kernel, by decide⟩",
      "  first | decide | simp",
      "  cases outcome <;> decide <;> simp",
      "  cases outcome <;> decide +kernel",
      "/-- A new variant must decide here which waits it exposes. -/",
      "  -- plain decide would be wrong here",
      "  hosts.all (fun h => decide h || decide g)",
    ].join("\n")),
    [
      "Probe.lean:1",
      "Probe.lean:2",
      "Probe.lean:3",
      "Probe.lean:4",
      "Probe.lean:5",
      "Probe.lean:6",
      "Probe.lean:7",
      "Probe.lean:8",
    ],
  );
});

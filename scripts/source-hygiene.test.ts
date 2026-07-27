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

const reviewTarget = 600;
const hardCeiling = 1_000;

const reviewedLargeFiles = new Map<string, string>();
const leanUmbrellaModules = [
  "BpmnSemantics.lean",
  "BpmnSemantics/SemanticProcess.lean",
] as const;

type SourceMeasurement = Readonly<{
  path: string;
  lines: number;
}>;

type SourceHygieneAssessment = Readonly<{
  hardViolations: ReadonlyArray<SourceMeasurement>;
  unreviewed: ReadonlyArray<SourceMeasurement>;
  invalidReviews: ReadonlyArray<string>;
}>;

function worktreeSourceFiles(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((path) => /\.(?:java|lean|mjs|ts)$/u.test(path))
    .filter((path) => !path.includes("/dist/"));
}

function nonblankLines(path: string): number {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0).length;
}

function uncommentedLeanSource(source: string): string {
  let result = "";
  let blockDepth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const pair = source.slice(index, index + 2);
    if (blockDepth > 0) {
      if (pair === "/-") {
        blockDepth += 1;
        index += 1;
      } else if (pair === "-/") {
        blockDepth -= 1;
        index += 1;
      } else if (source[index] === "\n") {
        result += "\n";
      }
      continue;
    }
    if (pair === "/-") {
      blockDepth = 1;
      index += 1;
    } else if (pair === "--") {
      const newline = source.indexOf("\n", index + 2);
      if (newline === -1) {
        break;
      }
      result += "\n";
      index = newline;
    } else {
      result += source[index];
    }
  }
  if (blockDepth !== 0) {
    throw new SyntaxError("unterminated Lean block comment");
  }
  return result;
}

function assessLeanUmbrella(path: string, source: string): string | null {
  const executableLines = uncommentedLeanSource(source)
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

function erasableSyntaxDiagnostics(
  paths: ReadonlyArray<string>,
): string[] {
  const result = spawnSync(
    "./node_modules/.bin/tsc",
    [
      "--noEmit",
      "--noResolve",
      "--erasableSyntaxOnly",
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

function assessSourceHygiene(
  measurements: ReadonlyArray<SourceMeasurement>,
  reviews: ReadonlyMap<string, string>,
): SourceHygieneAssessment {
  const hardViolations = measurements.filter(({ lines }) => lines > hardCeiling);
  const unreviewed = measurements.filter(
    ({ path, lines }) => lines > reviewTarget && !reviews.has(path),
  );
  const invalidReviews: string[] = [];
  for (const [path, rationale] of reviews) {
    const measurement = measurements.find((candidate) => candidate.path === path);
    if (rationale.trim().length === 0) {
      invalidReviews.push(`${path}: empty rationale`);
    } else if (measurement === undefined) {
      invalidReviews.push(`${path}: stale or untracked path`);
    } else if (measurement.lines <= reviewTarget) {
      invalidReviews.push(`${path}: no longer exceeds the review target`);
    } else if (measurement.lines > hardCeiling) {
      invalidReviews.push(`${path}: cannot exempt the hard ceiling`);
    }
  }
  return { hardViolations, unreviewed, invalidReviews };
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

test("direct TypeScript harnesses use only erasable syntax", () => {
  assert.deepEqual(
    erasableSyntaxDiagnostics(directTypeScriptHarnessFiles()),
    [],
    "Node executes harness TypeScript without a transform step",
  );
});

test("hand-written source respects reviewed module-size boundaries", () => {
  const sourceFiles = worktreeSourceFiles();
  const measurements = sourceFiles.map((path) => ({
    path,
    lines: nonblankLines(path),
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

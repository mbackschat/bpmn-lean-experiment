import assert from "node:assert/strict";
import {
  execFileSync,
  spawnSync,
} from "node:child_process";
import { createHash } from "node:crypto";
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
const lockedLegacyJavaScriptScripts = new Map<
  string,
  Readonly<{ sha256: string; rationale: string }>
>([
  [
    "scripts/check-bpmn-semantic-process-metamodel.mjs",
    {
      sha256: "91df8e953b8ca13f86cdacaf5059c67324e8c44b954cfa7707c1266a69cc2c58",
      rationale: "small metamodel calibration utility",
    },
  ],
  [
    "scripts/markdown-code-fragments.mjs",
    {
      sha256: "328575d9c8f97976b2bcca6f9f2a9ca1857d0d10c72e0d9e28c9dbd42021d8cc",
      rationale: "existing documentation synchronization utility",
    },
  ],
  [
    "scripts/markdown-code-fragments.test.mjs",
    {
      sha256: "145d4395812a9d55d4e3d6bedbe89666544965388afe44ebf0d20d2812b1541c",
      rationale: "small documentation synchronization test",
    },
  ],
  [
    "scripts/markdown-links.test.mjs",
    {
      sha256: "0f031382c9d9080d1da1872fe783314378ddca7fe9e0c300be9158e72c22773d",
      rationale: "small documentation-link test",
    },
  ],
  [
    "scripts/pnpm-project-config.test.mjs",
    {
      sha256: "c72633f670663072de7b5d42d624115a755294f93d65bf075efb01adf7e41915",
      rationale: "small pnpm configuration test",
    },
  ],
  [
    "scripts/pre-release-architecture.test.mjs",
    {
      sha256: "091b04692686cdf4762092afbdb1e97c2fc26742eb04cec69a4cc4128db5faf9",
      rationale: "small pre-release architecture test",
    },
  ],
  [
    "scripts/test-bpmn-source-miwg.mjs",
    {
      sha256: "c3eaf21f6d98f3169a041625f8780e2b00ade54739c057f701904a0558953861",
      rationale: "small optional MIWG calibration utility",
    },
  ],
]);
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

type LegacyJavaScriptAssessment = Readonly<{
  unregistered: ReadonlyArray<string>;
  staleLocks: ReadonlyArray<string>;
  changed: ReadonlyArray<string>;
  invalidRationales: ReadonlyArray<string>;
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

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assessLegacyJavaScript(
  files: ReadonlyArray<string>,
  locks: ReadonlyMap<
    string,
    Readonly<{ sha256: string; rationale: string }>
  >,
  digest: (path: string) => string,
): LegacyJavaScriptAssessment {
  const fileSet = new Set(files);
  const unregistered = files.filter((path) => !locks.has(path));
  const staleLocks: string[] = [];
  const changed: string[] = [];
  const invalidRationales: string[] = [];
  for (const [path, lock] of locks) {
    if (!fileSet.has(path)) {
      staleLocks.push(path);
    } else if (lock.rationale.trim().length === 0) {
      invalidRationales.push(path);
    } else if (digest(path) !== lock.sha256) {
      changed.push(path);
    }
  }
  return { unregistered, staleLocks, changed, invalidRationales };
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

test("the legacy JavaScript lock rejects every migration regression class", () => {
  const assessment = assessLegacyJavaScript(
    [
      "scripts/locked.mjs",
      "scripts/changed.mjs",
      "scripts/new.mjs",
      "scripts/empty-rationale.mjs",
    ],
    new Map([
      [
        "scripts/locked.mjs",
        { sha256: "locked", rationale: "small retained caller" },
      ],
      [
        "scripts/changed.mjs",
        { sha256: "before", rationale: "small retained caller" },
      ],
      [
        "scripts/stale.mjs",
        { sha256: "stale", rationale: "small retained caller" },
      ],
      [
        "scripts/empty-rationale.mjs",
        { sha256: "empty", rationale: "" },
      ],
    ]),
    (path) => {
      switch (path) {
        case "scripts/locked.mjs":
          return "locked";
        case "scripts/changed.mjs":
          return "after";
        default:
          return path;
      }
    },
  );

  assert.deepEqual(assessment, {
    unregistered: ["scripts/new.mjs"],
    staleLocks: ["scripts/stale.mjs"],
    changed: ["scripts/changed.mjs"],
    invalidRationales: ["scripts/empty-rationale.mjs"],
  });
});

test("retained script-level JavaScript stays exact-byte locked", () => {
  const files = worktreeSourceFiles()
    .filter((path) => path.startsWith("scripts/") && path.endsWith(".mjs"))
    .sort();
  const assessment = assessLegacyJavaScript(
    files,
    lockedLegacyJavaScriptScripts,
    sha256,
  );

  assert.deepEqual(
    assessment,
    {
      unregistered: [],
      staleLocks: [],
      changed: [],
      invalidRationales: [],
    },
    "new or modified script-level JavaScript must migrate to the strict direct TypeScript gate; changing this owner-reviewed exact-byte lock requires explicit approval",
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

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { defaultCibSevenMavenTimeoutMs } from "./cibseven-maven-budget.ts";
import { defaultWarmBudgetMs } from "./pipeline-budget.ts";

const verifyScriptPath = fileURLToPath(
  new URL("./verify.sh", import.meta.url),
);
const lakeWrapperPath = fileURLToPath(
  new URL("./lake.sh", import.meta.url),
);
const pipelineRunnerPath = fileURLToPath(
  new URL("./test-pipeline.ts", import.meta.url),
);
const pipelineTestPath = fileURLToPath(
  new URL(
    "../packages/differential/test/pipeline.test.ts",
    import.meta.url,
  ),
);
const verificationWorkflowPath = fileURLToPath(
  new URL("../.github/workflows/verify.yml", import.meta.url),
);
const cibOracleScriptPath = fileURLToPath(
  new URL("./test-cibseven-oracle.sh", import.meta.url),
);
const contributorGuidePath = fileURLToPath(
  new URL("../CLAUDE.md", import.meta.url),
);
const testingSpecPath = fileURLToPath(
  new URL("../docs/TESTING-SPEC.md", import.meta.url),
);
const checkedSourceRelationMainPath = fileURLToPath(
  new URL(
    "../BpmnSemantics/Experiments/CheckedSourceRelationMain.lean",
    import.meta.url,
  ),
);
const checkedSourceFrontierConformancePath = fileURLToPath(
  new URL(
    "../BpmnSemantics/Experiments/CheckedSourceFrontierConformance.lean",
    import.meta.url,
  ),
);
const documentedInstructionSurfaces = [
  "CLAUDE.md",
  "README.md",
  "docs/TESTING-SPEC.md",
  "docs/experiments/README.md",
  "docs/experiments/SEMANTIC-REPRESENTATION-EXPERIMENT.md",
  "docs/experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md",
] as const;
const bareLeanCommand = /(?<![\w./-])lake\s+(?:build|test|exe|env|update|clean)\b/u;

type CommandSurface = Readonly<{
  relativePath: string;
  source: string;
}>;

function worktreePaths(): ReadonlyArray<string> {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  ).split("\n").filter((relativePath) =>
    relativePath.length > 0 && existsSync(relativePath)
  );
}

function executableSurfacePaths(
  paths: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return paths.filter((relativePath) =>
    (relativePath.startsWith("scripts/") && !relativePath.endsWith(".test.ts")) ||
    relativePath.startsWith(".github/workflows/") ||
    relativePath === "package.json" ||
    relativePath.endsWith("/package.json") ||
    /(?:^|\/)(?:Dockerfile|Makefile|mvnw)$/u.test(relativePath) ||
    /\.(?:bash|sh|zsh)$/u.test(relativePath)
  );
}

function bareLeanCommandFindings(
  surfaces: ReadonlyArray<CommandSurface>,
): ReadonlyArray<string> {
  return surfaces.flatMap(({ relativePath, source }) =>
    source
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => bareLeanCommand.test(line))
      .map(({ line, number }) => `${relativePath}:${number}: ${line.trim()}`)
  );
}

const projectBuildOutputPath =
  /(?:packages\/[\w-]+\/dist\/|@bpmn-lean\/[\w-]+\/dist\/|(?:\.\.?\/)+dist\/)/u;

/**
 * Finds generated-output references that make a script test depend on a prior package build.
 *
 * The source-hygiene gate owns static module specifiers. Dynamic imports can hide the same dependency
 * behind a cached `pathToFileURL` or `new URL`, so this scan begins at each code-bearing import or URL
 * construction and keeps enough following lines to include its wrapped argument.
 */
function generatedOutputRuntimeImportFindings(
  surfaces: ReadonlyArray<CommandSurface>,
): ReadonlyArray<string> {
  return surfaces.flatMap(({ relativePath, source }) => {
    const lines = source.split("\n");
    return lines.flatMap((line, index) => {
      const trimmed = line.trimStart();
      if (
        /^(?:["'`]|\/\/|\*)/u.test(trimmed) ||
        !/(?:\bimport\s*\(|\bnew\s+URL\s*\(|\bpathToFileURL\s*\()/u.test(line)
      ) {
        return [];
      }
      const importWindow = lines.slice(index, index + 12).join("\n");
      return projectBuildOutputPath.test(importWindow)
        ? [`${relativePath}:${index + 1}: ${line.trim()}`]
        : [];
    });
  });
}

async function readNonemptyLines(path: string): Promise<readonly string[]> {
  const source = await readFile(path, "utf8");
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function assertLineOccursOnce(
  path: string,
  expected: string,
): Promise<void> {
  const lines = await readNonemptyLines(path);
  assert.equal(
    lines.filter((candidate) => candidate === expected).length,
    1,
  );
}

test("default verification includes the focused Temporal history gate", async () => {
  await assertLineOccursOnce(
    verifyScriptPath,
    "./scripts/pnpm.sh run test:temporal:built",
  );
});

test("hosted warm-pipeline budget has real headroom and the runner derives its deadline", async () => {
  const [pipelineTest, pipelineRunner, workflow] = await Promise.all([
    readFile(pipelineTestPath, "utf8"),
    readFile(pipelineRunnerPath, "utf8"),
    readFile(verificationWorkflowPath, "utf8"),
  ]);
  const hostedBudgetMatch = workflow.match(
    /BPMN_PIPELINE_WARM_BUDGET_MS: "(\d+)"/u,
  );
  assert.notEqual(hostedBudgetMatch, null);
  if (hostedBudgetMatch === null) {
    throw new Error("warm-pipeline budget owners are absent");
  }
  const hostedBudget = Number(hostedBudgetMatch[1]);

  assert.ok(
    hostedBudget >= defaultWarmBudgetMs * 1.5,
    `hosted warm-pipeline budget ${hostedBudget}ms must retain at least 50% headroom above the portable default ${defaultWarmBudgetMs}ms`,
  );
  assert.ok(
    hostedBudget >= defaultCibSevenMavenTimeoutMs + 10_000,
    `hosted warm-pipeline budget ${hostedBudget}ms must exceed the longest nested CIB deadline ${defaultCibSevenMavenTimeoutMs}ms plus reporting headroom`,
  );
  assert.match(
    pipelineRunner,
    /timeoutMs: warmPipelineCommandTimeoutMs\(process\.env\)/u,
    "the process deadline must be derived from the selected warm budget instead of becoming a second lower ceiling",
  );
  assert.match(
    pipelineTest,
    /timeout: warmPipelineTestTimeoutMs\(process\.env\)/u,
    "the Node test deadline must be derived from the selected warm budget instead of becoming a second lower ceiling",
  );
});

test("script tests dynamically load no project package build output", async () => {
  const relativePaths = worktreePaths().filter((relativePath) =>
    /^scripts\/.*\.test\.ts$/u.test(relativePath)
  );
  const surfaces = await Promise.all(relativePaths.map(async (relativePath) => ({
    relativePath,
    source: await readFile(relativePath, "utf8"),
  })));

  assert.deepEqual(
    generatedOutputRuntimeImportFindings(surfaces),
    [],
    "script test gates run before package builds on a clean checkout; move compiler-derived witnesses into the package gate that owns the build",
  );
});

test("the runtime-import guard reaches helper and URL wrapped build paths", () => {
  assert.deepEqual(
    generatedOutputRuntimeImportFindings([{
      relativePath: "scripts/probe.test.ts",
      source: [
        "const first = await import(pathToFileURL(`${root}/packages/bpmn-source/dist/index.js`).href);",
        "const second = await import(new URL('../dist/index.js', import.meta.url).href);",
        "const external = await import('ajv/dist/2020.js');",
      ].join("\n"),
    }]),
    [
      "scripts/probe.test.ts:1: const first = await import(pathToFileURL(`${root}/packages/bpmn-source/dist/index.js`).href);",
      "scripts/probe.test.ts:2: const second = await import(new URL('../dist/index.js', import.meta.url).href);",
    ],
  );

  assert.deepEqual(
    generatedOutputRuntimeImportFindings([{
      relativePath: "scripts/probe.test.ts",
      source: [
        "const builtEntry = new URL(",
        "  '../packages/semantic-core/dist/index.js',",
        "  import.meta.url,",
        ");",
        "await import(builtEntry.href);",
      ].join("\n"),
    }]),
    ["scripts/probe.test.ts:1: const builtEntry = new URL("],
  );
});

test("managed-sandbox guidance preauthorizes every loopback-listener gate", async () => {
  const contributorGuide = await readFile(contributorGuidePath, "utf8");
  const testingSpec = await readFile(testingSpecPath, "utf8");
  for (const source of [contributorGuide, testingSpec]) {
    assert.match(source, /managed sandbox/i);
    assert.match(source, /before (?:the )?first attempt/i);
    assert.match(source, /`\.\/scripts\/verify\.sh`/);
    assert.match(source, /`\.\/scripts\/pnpm\.sh run test:infrastructure`/);
    assert.match(source, /`\.\/scripts\/pnpm\.sh run test:temporal`/);
    assert.match(source, /`\.\/scripts\/pnpm\.sh run test:pipeline`/);
  }
});

test("verification scripts validate BPMN XML through one preflighting owner", async () => {
  for (const path of [verifyScriptPath, cibOracleScriptPath]) {
    const source = await readFile(path, "utf8");
    assert.equal(
      source.includes("xmllint"),
      false,
      `${path} must not invoke xmllint directly: only the shared validator preflights that host tool and declares whether it established schema conformance`,
    );
    assert.match(source, /scripts\/validate-bpmn-xml\.sh/u);
  }
});

test("default verification XSD-validates the Timer Start fixture", async () => {
  const source = await readFile(verifyScriptPath, "utf8");

  assert.match(
    source,
    /packages\/bpmn-source\/test\/fixtures\/timer-start-event\.bpmn/u,
  );
});

test("default verification XSD-validates the Configured Task fixture", async () => {
  const source = await readFile(verifyScriptPath, "utf8");

  assert.match(
    source,
    /packages\/bpmn-source\/test\/fixtures\/configured-task\.bpmn/u,
  );
});

test("default verification executes the self-building checked-source proof experiment once", async () => {
  const source = await readFile(verifyScriptPath, "utf8");
  await assertLineOccursOnce(
    verifyScriptPath,
    "./scripts/lake.sh exe checkCheckedSourceRelationExperiment",
  );
  assert.doesNotMatch(source, /lake\.sh build checkCheckedSourceRelationExperiment/u);
});

test("the checked-source proof target imports both Stage 3a frontier modules", async () => {
  await assertLineOccursOnce(
    checkedSourceRelationMainPath,
    "import BpmnSemantics.Experiments.CheckedSourceFrontier",
  );
  await assertLineOccursOnce(
    checkedSourceRelationMainPath,
    "import BpmnSemantics.Experiments.CheckedSourceFrontierConformance",
  );
});

test("frontier conformance imports the Stage 3b parallel-frontier module", async () => {
  await assertLineOccursOnce(
    checkedSourceFrontierConformancePath,
    "import BpmnSemantics.Experiments.CheckedSourceParallelFrontier",
  );
});

/**
 * Every Lean invocation must bound its build parallelism, so exactly one wrapper owns the pin.
 *
 * This repository decides finite fixtures in the kernel, and kernel reduction holds its terms in
 * resident memory. Lake sizes its build pool from `LEAN_NUM_THREADS` or the logical processor count
 * and exposes no `--jobs` option, so an unpinned build scales with core count: measured on an 8-core
 * host, four concurrent `lean` processes each exceeded 2 GB and the group peaked at 7978 MB, against
 * 2411 MB with the pin. An unpinned build therefore exhausts a smaller CI runner for a reason no
 * test would explain.
 *
 * The pin lived on the two gate entry points before this guard, which left every command outside
 * them — the documented experiment gates, and any Lean build a contributor or agent types directly —
 * running at the host's core count behind nothing but a prose caveat asking them to remember.
 */
test("one wrapper owns the Lean thread pin", async () => {
  const wrapper = await readFile(
    fileURLToPath(new URL("../scripts/lake.sh", import.meta.url)),
    "utf8",
  );
  // Derived, never restated or overridden: a literal or ambient value could drift from the manifest.
  assert.match(
    wrapper,
    /LEAN_NUM_THREADS="\$required_lean_build_threads"/u,
    "scripts/lake.sh must clamp the Lean thread pin to the manifest value",
  );
  assert.match(
    wrapper,
    /^export LEAN_NUM_THREADS$/mu,
    "scripts/lake.sh must export the pin so lake inherits it",
  );
  assert.match(
    wrapper,
    /^lake "\$@"$/mu,
    "scripts/lake.sh must forward every argument to lake so it can replace bare invocations",
  );
});

test("the Lean wrapper clamps concurrency, rejects umbrella mixing, and refuses a second build tree", async () => {
  const fakeBin = await mkdtemp(path.join(tmpdir(), "bpmn-lean-fake-lake-"));
  const fakeLake = path.join(fakeBin, "lake");
  const lockPath = `/tmp/bpmn-lean-experiment-${process.getuid?.() ?? 0}.lake-build.lock`;
  await writeFile(
    fakeLake,
    "#!/bin/sh\nprintf '%s\\n' \"$LEAN_NUM_THREADS\"\n",
    { mode: 0o755 },
  );
  const environment = {
    ...process.env,
    LEAN_NUM_THREADS: "8",
    PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
  };

  try {
    const ordinary = spawnSync(lakeWrapperPath, ["--version"], {
      encoding: "utf8",
      env: environment,
    });
    assert.equal(ordinary.status, 0, ordinary.stderr);
    assert.equal(ordinary.stdout.trim(), "1");

    const broadFocused = spawnSync(
      lakeWrapperPath,
      ["build", "BpmnSemantics.SemanticProcess.ProfileAdmission", "BpmnSemantics"],
      { encoding: "utf8", env: environment },
    );
    assert.notEqual(broadFocused.status, 0);
    assert.match(broadFocused.stderr, /umbrella/u);

    await mkdir(lockPath);
    const concurrent = spawnSync(lakeWrapperPath, ["--version"], {
      encoding: "utf8",
      env: environment,
    });
    assert.notEqual(concurrent.status, 0);
    assert.match(concurrent.stderr, /another Lean build/u);
  } finally {
    await rm(lockPath, { recursive: true, force: true });
    await rm(fakeBin, { recursive: true, force: true });
  }
});

/**
 * No runnable Lean command may bypass that wrapper.
 *
 * A pin on the entry points is not a pin on the toolchain: the memory peak is reached by whichever
 * `lake` actually runs. Scanning the executable scripts alone would leave the exposure that produced
 * this guard, because the commands that stayed unpinned longest were the *documented* ones, copied
 * from a gate table and run verbatim.
 *
 * Executable command surfaces are discovered from the complete tracked-and-pending worktree rather
 * than kept in an allowlist. The maintained instruction documents stay explicit because a command
 * in historical prose is not mechanically distinguishable from one meant to be copied. Subcommands
 * are required, so `lake --version` probes and prose naming the tool itself do not match.
 */
test("no documented or scripted Lean command bypasses the wrapper", async () => {
  const relativePaths = [
    ...new Set([
      ...executableSurfacePaths(worktreePaths()),
      ...documentedInstructionSurfaces,
    ]),
  ].sort();
  const surfaces = await Promise.all(relativePaths.map(async (relativePath) => ({
    relativePath,
    source: await readFile(
      fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
      "utf8",
    ),
  })));

  assert.deepEqual(
    bareLeanCommandFindings(surfaces),
    [],
    "every executable and documented command surface must invoke Lean through ./scripts/lake.sh, which pins build parallelism",
  );
});

test("rejects a bare Lean command in a newly added executable surface", () => {
  const command = ["lake", "build"].join(" ");
  assert.deepEqual(
    executableSurfacePaths(["scripts/new-gate.sh", "docs/historical-note.md"]),
    ["scripts/new-gate.sh"],
  );
  assert.deepEqual(
    bareLeanCommandFindings([
      { relativePath: "scripts/new-gate.sh", source: `#!/bin/sh\n${command}\n` },
    ]),
    ["scripts/new-gate.sh:2: lake build"],
  );
});

/**
 * The contributor guide carries its own copy of the gate list because agents hold that file in
 * context and choose a proportionate gate from what it shows them. A gate the guide omits is a gate
 * they do not run: `test:infrastructure` was absent while being the only complete gate that needs no
 * host port, so a restricted sandbox had the choice between an unrunnable `verify.sh` and nothing.
 *
 * Equality, not containment, is the assertion that catches that. Containment would only reject a
 * guide naming a gate the owner never defined, which is the harmless direction.
 *
 * Scope is the `./scripts/pnpm.sh run` gates in both documents. Shell entry points and the Lean
 * experiment command pairs are deliberately outside it: they carry arguments and multi-line forms
 * that this comparison would have to model, and the claim here is exactly what it checks.
 *
 * The specification side reads its gate tables rather than its prose, because a pnpm script named in
 * prose need not be a gate at all. `replace:cib-evidence` is the discriminating case: it is the
 * evidence-replacement operation the guide places deliberately outside ordinary verification, and a
 * prose-wide scan would demand the guide advertise it as something to run.
 */
test("the contributor guide names every pnpm gate the testing specification defines", async () => {
  const pnpmGate = /\.\/scripts\/pnpm\.sh run ([\w:-]+)/gu;
  const gateNames = async (
    path: string,
    lineFilter: (line: string) => boolean = () => true,
  ): Promise<readonly string[]> => {
    const source = await readFile(path, "utf8");
    return source
      .split("\n")
      .filter(lineFilter)
      .flatMap((line) => [...line.matchAll(pnpmGate)].map(([, name]) => name as string))
      .sort();
  };

  const guideGates = new Set(await gateNames(contributorGuidePath));
  const specGates = new Set(
    await gateNames(testingSpecPath, (line) => line.trimStart().startsWith("|")),
  );

  const missingFromGuide = [...specGates].filter((name) => !guideGates.has(name)).sort();
  const unknownToSpec = [...guideGates].filter((name) => !specGates.has(name)).sort();

  assert.deepEqual(
    missingFromGuide,
    [],
    `CLAUDE.md omits gates that docs/TESTING-SPEC.md defines, so an agent choosing from the guide cannot reach them: ${missingFromGuide.join(", ")}`,
  );
  assert.deepEqual(
    unknownToSpec,
    [],
    `CLAUDE.md names gates docs/TESTING-SPEC.md does not define as focused gates: ${unknownToSpec.join(", ")}`,
  );
});

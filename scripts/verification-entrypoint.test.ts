import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const verifyScriptPath = fileURLToPath(
  new URL("./verify.sh", import.meta.url),
);
const lakeWrapperPath = fileURLToPath(
  new URL("./lake.sh", import.meta.url),
);
const verificationWorkflowPath = fileURLToPath(
  new URL("../.github/workflows/verify.yml", import.meta.url),
);
const cibOracleScriptPath = fileURLToPath(
  new URL("./test-cibseven-oracle.sh", import.meta.url),
);
const rootPackageManifestPath = fileURLToPath(
  new URL("../package.json", import.meta.url),
);
const documentedInstructionSurfaces = [
  "CLAUDE.md",
  "README.md",
] as const;
const bareLeanCommand = /(?<![\w./-])lake\s+(?:build|test|exe|env|update|clean)\b/u;

test("publication schema gates run without workspace build output", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { registerHooks } from "node:module";
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier.startsWith("@bpmn-lean/")) {
          throw new Error("Build-free schema gate loaded workspace runtime: " + specifier);
        }
        const resolved = nextResolve(specifier, context);
        if (/\\/(?:packages|platform)\\/.*\\/dist\\//u.test(resolved.url)) {
          throw new Error("Build-free schema gate loaded workspace output: " + resolved.url);
        }
        return resolved;
      },
    });
    await import("./scripts/execution-publication-contract-coverage.test.ts");
  `], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

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

function ordinaryPackageTestLeanInvocationFindings(
  surfaces: ReadonlyArray<CommandSurface>,
): ReadonlyArray<string> {
  return surfaces
    .filter(({ relativePath }) =>
      /^packages\/[^/]+\/test\/.*\.test\.ts$/u.test(relativePath)
    )
    .filter(({ source }) => source.includes("./scripts/lake.sh"))
    .map(({ relativePath }) => relativePath);
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

test("default verification runs every hosted Temporal gate exactly once, on prepared output, and fails after all of them", async () => {
  const manifest = JSON.parse(
    await readFile(rootPackageManifestPath, "utf8"),
  ) as { scripts?: Record<string, string> };
  // Each gate records its failure instead of exiting, and the stage returns what they recorded.
  await assertLineOccursOnce(verifyScriptPath, 'return "$temporal_status"');
  for (const gate of ["test:temporal-host:hosted:built", "test:differential:hosted:built", "test:engine-api:hosted:built"]) {
    await assertLineOccursOnce(verifyScriptPath, `./scripts/pnpm.sh run ${gate} || temporal_status=1`);
    assert.match(manifest.scripts?.[gate] ?? "", /^node --test --test-concurrency=1 packages\/[\w-]+\/test\/\*\.temporal-test\.ts$/u, gate);
  }
});

test("the Temporal host gate typechecks its tests before running them", async () => {
  const manifest = JSON.parse(
    await readFile(rootPackageManifestPath, "utf8"),
  ) as { scripts?: Record<string, string> };
  assert.equal(
    manifest.scripts?.["test:temporal-host"],
    "pnpm build:temporal-host && tsc -p packages/temporal-host/tsconfig.test.json && node --test --test-concurrency=1 packages/temporal-host/test/*.test.ts",
  );
});

function synchronousPackageElaboration(lakefile: string): boolean {
  const packageFields = lakefile.split(/^\s*\[/mu, 1)[0] ?? "";
  return /^leanOptions = \{ (?:[^}]*, )?Elab\.async = false(?:, [^}]*)? \}$/mu.test(packageFields);
}

test("the Lake package defaults every module target to synchronous theorem elaboration", async () => {
  const lakefile = await readFile(
    fileURLToPath(new URL("../lakefile.toml", import.meta.url)), "utf8",
  );
  assert.equal(synchronousPackageElaboration(lakefile), true,
    "set synchronous elaboration at package scope so all libraries and executables inherit it");
});

test("the Lake package bounds every Lean process at 2 GiB on Lean's command line", async () => {
  const lakefile = await readFile(
    fileURLToPath(new URL("../lakefile.toml", import.meta.url)), "utf8",
  );
  const packageFields = lakefile.split(/^\s*\[/mu, 1)[0] ?? "";
  // `leanOptions = { max_memory = ... }` would compile and silently not apply: Lake passes it through
  // `--setup`, and the Lean shell reads `max_memory` only from its own arguments (census, 2026-10-25).
  assert.match(packageFields, /^moreLeanArgs = \["-M2048"\]$/mu);
  assert.doesNotMatch(lakefile.replace(/^#.*$/gmu, ""), /max_memory/u);
});

test("the elaboration guard rejects an absent, enabled, or library-only setting", () => {
  const option = "leanOptions = { Elab.async = false }";
  assert.equal(synchronousPackageElaboration(`${option}\n[[lean_lib]]\nname = \"Example\"`), true);
  assert.equal(synchronousPackageElaboration("[[lean_lib]]\nname = \"Example\""), false);
  assert.equal(synchronousPackageElaboration(option.replace("false", "true")), false);
  assert.equal(synchronousPackageElaboration(`[[lean_lib]]\nname = \"Example\"\n${option}`), false);
});

test("hosted cold Lean builds have recovery headroom instead of a 30-minute cutoff", async () => {
  const workflow = await readFile(verificationWorkflowPath, "utf8");
  const library = workflow.split("  verify_lean:\n")[1]?.split("  verify_lean_checks:")[0] ?? "";
  const jobMinutes = Number(library.match(/timeout-minutes: (\d+)/u)?.[1]);
  const buildMinutes = Number(library.match(/id: lean-build\n\s+timeout-minutes: (\d+)/u)?.[1]);
  assert.ok(buildMinutes >= 120, "cold proof elaboration must not inherit the failed 30-minute budget");
  assert.ok(jobMinutes >= buildMinutes + 15, "reserve setup and cache-save time outside compilation");
  assert.match(library, /uses: actions\/cache\/restore@/u);
  assert.match(library, /id: lean-cache/u);
  assert.match(library, /steps\.lean-cache\.outputs\.cache-primary-key/u);
  const partial = library.split("- name: Preserve partial Lean build output")[1]?.split("- name:")[0] ?? "";
  assert.match(partial, /always\(\)/u);
  assert.match(partial, /steps\.lean-build\.outcome == 'failure'/u);
  assert.match(partial, /steps\.lean-build\.outcome == 'cancelled'/u);
  assert.match(partial, /uses: actions\/cache\/save@/u);
  assert.match(partial, /timeout-minutes: 5/u);
  assert.match(partial, /cache-primary-key \}\}-partial-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u);
  assert.match(library, /restore-keys:[\s\S]*?-partial-/u);
  const completed = library.split("- name: Save completed Lean build output")[1]?.split("- name:")[0] ?? "";
  assert.match(completed, /steps\.lean-build\.outcome == 'success'/u);
  assert.match(completed, /cache-hit != 'true'/u);
});

test("the hosted Lean cache identity includes every library root and nested sources", async () => {
  const workflow = await readFile(verificationWorkflowPath, "utf8");
  // Derived from the lakefile, so a new library cannot be built under a cache key that ignores its sources.
  const libraries = [...(await readFile("lakefile.toml", "utf8")).matchAll(/^\[\[lean_lib\]\]\nname = "([^"]+)"$/gmu)]
    .map((match) => match[1]!);
  assert.ok(libraries.length > 0, "the lakefile declares no Lean library");
  const identities = [...workflow.matchAll(/hashFiles\(([^)]*'lakefile\.toml'[^)]*)\)/gu)].map((match) => match[1]!);
  assert.ok(identities.length > 0, "no hosted Lean cache identity was found");
  for (const identity of identities) {
    for (const input of ["lean-toolchain", "lakefile.toml", "lake-manifest.json"]) {
      assert.ok(identity.includes(`'${input}'`), `${input} in ${identity}`);
    }
    for (const library of libraries) {
      assert.ok(identity.includes(`'${library}.lean'`), `${library}.lean in ${identity}`);
      assert.ok(identity.includes(`'${library}/**/*.lean'`), `${library}/**/*.lean in ${identity}`);
    }
  }
});

test("hosted Lean checks consume the completed library output in a separate bounded job", async () => {
  const workflow = await readFile(verificationWorkflowPath, "utf8");
  assert.match(
    workflow,
    /verify_lean_checks:[\s\S]*?needs:\n      - changes\n      - verify_lean[\s\S]*?timeout-minutes: 10/u,
  );
  assert.match(
    workflow,
    /verify_lean_checks:[\s\S]*?key: verify-lean-library-\$\{\{ runner\.os \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}[\s\S]*?run: \.\/scripts\/verify\.sh lean-checks/u,
  );
  assert.match(
    workflow,
    /verify_pipeline:[\s\S]*?needs:\n      - changes\n      - verify_lean_checks\n      - verify_runtime/u,
  );
});

// Re-running a failed job raises github.run_attempt while the producing job keeps
// its earlier key, so an exact-attempt restore misses on every partial rerun. A
// run builds one commit, so any attempt's staged output is valid input.
test("staged job handoffs restore an earlier attempt of the same run", async () => {
  const workflow = await readFile(verificationWorkflowPath, "utf8");
  const consumers = workflow.split(/\n      - name: /u).filter((step) => /fail-on-cache-miss: true/u.test(step));
  // Every staged handoff a job saves is restored somewhere, so this set equality also proves the scan saw them all.
  const consumed = new Set(consumers.map((step) => step.match(/key: (verify-[a-z-]+)-/u)?.[1]));
  assert.deepEqual([...consumed].sort(), stagedHandoffs(workflow));
  for (const step of consumers) {
    const stage = step.match(/key: (verify-[a-z-]+)-\$\{\{ runner\.os \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u)?.[1];
    assert.ok(stage !== undefined, step);
    assert.match(step, /uses: actions\/cache\/restore@/u, `${stage} consumers never save the handoff again`);
    assert.ok(step.includes(`restore-keys: ${stage}-\${{ runner.os }}-\${{ github.run_id }}-\n`), stage);
  }
});

// Staged handoffs are per-run caches that no later run restores, yet they count against the
// repository's 10 GB Actions cache budget (measured 2026-10-27: 9.3 of 10.1 GiB), where LRU
// eviction then removes the incremental `lake-` caches every run does restore. Deleting them only
// after `verify-complete` succeeds keeps them for a partial rerun of a failed run.
/** The staged handoff keys the workflow's jobs save, sorted. */
function stagedHandoffs(workflow: string): string[] {
  return [...new Set([...workflow.matchAll(/uses: actions\/cache@\S+[^\n]*\n(?: {8}[^\n]*\n)*? {10}key: (verify-[a-z-]+)-\$\{\{ runner\.os \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/gu)]
    .map((match) => match[1]!))].sort();
}

test("a verified run releases exactly its own staged handoffs", async () => {
  const workflow = await readFile(verificationWorkflowPath, "utf8");
  const staged = stagedHandoffs(workflow);
  assert.deepEqual(staged, ["verify-lean-checks", "verify-lean-library", "verify-runtime"]);
  const release = workflow.match(/\n  release_staged_outputs:\n[\s\S]*$/u)?.[0];
  assert.ok(release !== undefined, "the workflow releases its staged handoffs");
  assert.match(release, /needs:\n      - verify-complete\n/u);
  assert.match(release, /if: always\(\) && needs\.verify-complete\.result == 'success'\n/u);
  assert.match(release, /permissions:\n      actions: write\n/u);
  const prefixes = release.match(/for stage in ([a-z -]+); do/u)?.[1]?.split(" ");
  assert.deepEqual(prefixes?.sort(), staged);
  assert.match(release, /--key "\$stage-\$RUNNER_OS-\$\{\{ github\.run_id \}\}-"/u);
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

test("ordinary package tests do not self-build Lean", async () => {
  const relativePaths = worktreePaths().filter((relativePath) =>
    /^packages\/[^/]+\/test\/.*\.test\.ts$/u.test(relativePath)
  );
  const surfaces = await Promise.all(relativePaths.map(async (relativePath) => ({
    relativePath,
    source: await readFile(relativePath, "utf8"),
  })));

  assert.deepEqual(
    ordinaryPackageTestLeanInvocationFindings(surfaces),
    [],
    "cross-target Lean oracles belong in the post-restore integration lane, not a cold runtime package gate",
  );
});

test("the ordinary-package Lean guard reaches a second package", () => {
  assert.deepEqual(
    ordinaryPackageTestLeanInvocationFindings([
      {
        relativePath: "packages/example/test/another-parity.test.ts",
        source: "execFile('./scripts/lake.sh', ['exe', 'anotherEmitter']);",
      },
      {
        relativePath: "packages/example/test/another-parity.integration-test.ts",
        source: "execFile('./scripts/lake.sh', ['exe', 'anotherEmitter']);",
      },
    ]),
    ["packages/example/test/another-parity.test.ts"],
  );
});

test("the kernel behavior oracle runs in the restored-output integration lane", async () => {
  const [manifest, verifyScript] = await Promise.all([
    readFile(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    readFile(verifyScriptPath, "utf8"),
  ]);
  assert.match(
    manifest,
    /"test:kernel-behavior-oracle:built": "node --test --test-concurrency=1 packages\/differential\/test\/kernel-behavior-oracle\.integration-test\.ts packages\/differential\/test\/row-fixtures\.integration-test\.ts packages\/differential\/test\/closure-reach\.integration-test\.ts packages\/differential\/test\/kernel-unit-pairing\.integration-test\.ts"/u,
  );
  assert.equal(
    verifyScript.split("\n").filter((line) =>
      line.trim() === "./scripts/pnpm.sh run test:kernel-behavior-oracle:built"
    ).length,
    1,
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

test("default verification XSD-validates every registered scenario model and exempts open-row witnesses", async () => {
  // Deployment of an XSD-invalid model fails in CIB while the kernel reader may accept it, so an unchecked registered
  // model silently loses its CIB answer (47 such models found on 2026-11-09).
  const source = await readFile(verifyScriptPath, "utf8");

  assert.match(source, /find scenarios -name '\*\.bpmn' -not -path 'scenarios\/open-rows\/\*'/u);
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

test("default verification XSD-validates the Activity boundary Message source", async () => {
  const source = await readFile(verifyScriptPath, "utf8");

  assert.match(
    source,
    /scenarios\/activity-boundary-message\/process\.bpmn/u,
  );
});

test("Lean checks build the kernel runner natively, outside test deadlines", async () => {
  const source = await readFile(verifyScriptPath, "utf8");
  const checks = source.match(/^verify_lean_checks\(\) \{\n([\s\S]*?)^\}/mu)?.[1] ?? "";
  assert.match(checks, /^ {2}\.\/scripts\/lake\.sh build kernelRun$/mu);
  assert.doesNotMatch(source, /lake\.sh exe/u);
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
    /^if lake "\$@"; then$/mu,
    "scripts/lake.sh must forward every argument to lake so it can replace bare invocations",
  );
});

test("the Lean wrapper witness preserves another build's lock", async (context) => {
  for (const populated of [false, true]) {
    await context.test(populated ? "lock with owner evidence" : "empty lock", async () => {
      const fixture = await mkdtemp(path.join(tmpdir(), "bpmn-lean-foreign-lock-"));
      const owner = path.basename(fixture);
      const lockPath = `/tmp/bpmn-lean-experiment-${owner}.lake-build.lock`;
      const preload = path.join(fixture, "identity.mjs");
      await writeFile(preload, `process.getuid = () => ${JSON.stringify(owner)};\n`);
      await writeFile(path.join(fixture, "id"), `#!/bin/sh\nprintf '%s\\n' '${owner}'\n`, { mode: 0o755 });
      await mkdir(lockPath);
      try {
        if (populated) await writeFile(path.join(lockPath, "owner"), "another build");
        const { NODE_TEST_CONTEXT: _runnerContext, ...environment } = process.env;
        const witness = spawnSync(process.execPath, [
          "--import", preload, "--test",
          "--test-name-pattern=^the Lean wrapper clamps concurrency",
          fileURLToPath(import.meta.url),
        ], {
          encoding: "utf8",
          timeout: 10_000,
          env: { ...environment, PATH: `${fixture}:${process.env.PATH ?? ""}` },
        });
        assert.match(witness.stdout, /the Lean wrapper clamps concurrency/u);
        assert.equal(existsSync(lockPath), true, "the witness removed a lock it did not acquire");
        if (populated) assert.equal(await readFile(path.join(lockPath, "owner"), "utf8"), "another build");
        assert.equal(witness.status, 0, witness.stdout + witness.stderr);
      } finally {
        await rm(lockPath, { recursive: true, force: true });
        await rm(fixture, { recursive: true, force: true });
      }
    });
  }
});

test("the Lean wrapper clamps concurrency and refuses a second build tree", async () => {
  const fakeBin = await mkdtemp(path.join(tmpdir(), "bpmn-lean-fake-lake-"));
  const fakeLake = path.join(fakeBin, "lake");
  const lockOwner = path.basename(fakeBin);
  const lockPath = `/tmp/bpmn-lean-experiment-${lockOwner}.lake-build.lock`;
  await writeFile(path.join(fakeBin, "id"), `#!/bin/sh\nprintf '%s\\n' '${lockOwner}'\n`, { mode: 0o755 });
  await writeFile(
    fakeLake,
    "#!/bin/sh\nprintf '%s\\n%s\\n' \"$LEAN_NUM_THREADS\" \"$*\"\n",
    { mode: 0o755 },
  );
  const { GITHUB_ACTIONS: _actions, RUNNER_ENVIRONMENT: _runner, ...ambient } = process.env;
  const environment = {
    ...ambient,
    LEAN_NUM_THREADS: "8",
    PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
  };

  const pinnedThreads = (JSON.parse(await readFile(rootPackageManifestPath, "utf8")) as
    { config: Record<string, string> }).config.leanBuildThreads;

  try {
    const ordinary = spawnSync(lakeWrapperPath, ["--version"], {
      encoding: "utf8",
      env: environment,
    });
    assert.equal(ordinary.status, 0, ordinary.stderr);
    assert.equal(ordinary.stdout.trim(), `${pinnedThreads}\n--version`);

    const interpreted = spawnSync(
      lakeWrapperPath,
      ["run", "Kernel/Run.lean", "input.jsonl"],
      { encoding: "utf8", env: environment },
    );
    assert.equal(interpreted.status, 0, interpreted.stderr);
    assert.equal(
      interpreted.stdout.trim(),
      `${pinnedThreads}\nenv lean --run Kernel/Run.lean input.jsonl`,
    );

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

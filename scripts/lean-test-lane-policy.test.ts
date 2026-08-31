import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  invokedPnpmGates,
  leanDependentEntrypoints,
  manifestTestEntrypoints,
  programmaticBareLeanInvocationFindings,
  verificationFunctionBody,
} from "./lean-test-lane-policy.ts";

function worktreePaths(): ReadonlyArray<string> {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  ).split("\n").filter((relativePath) =>
    relativePath.length > 0 && existsSync(relativePath)
  );
}

async function codeSurfaces(worktree: ReadonlyArray<string>) {
  const relativePaths = worktree.filter((relativePath) =>
    /^(?:packages|scripts)\/.*\.[cm]?[jt]s$/u.test(relativePath)
  );
  return Promise.all(relativePaths.map(async (relativePath) => ({
    relativePath,
    source: await readFile(relativePath, "utf8"),
  })));
}

test("programmatic Lean invocations cannot bypass the repository wrapper", async () => {
  const surfaces = (await codeSurfaces(worktreePaths()))
    .filter(({ relativePath }) => !relativePath.endsWith(".test.ts"));
  assert.deepEqual(
    programmaticBareLeanInvocationFindings(surfaces),
    [],
    "programmatic Lean commands must inherit the wrapper's thread pin and repository-wide lock",
  );
});

test("the programmatic Lean guard reaches a helper outside the scripts directory", () => {
  const command = ["la", "ke"].join("");
  assert.deepEqual(
    programmaticBareLeanInvocationFindings([
      {
        relativePath: "packages/example/test/direct-lean-targets.ts",
        source: `runProcess("${command}", ["exe", "emitter"], 10_000);`,
      },
      {
        relativePath: "packages/example/test/declared-lean-targets.ts",
        source: `const leanCli = "${command}";\nrunProcess(leanCli, ["exe", "emitter"], 10_000);`,
      },
    ]),
    [
      "packages/example/test/direct-lean-targets.ts",
      "packages/example/test/declared-lean-targets.ts",
    ],
  );
});

test("every Lean-dependent package test runs only after restored Lean output", async () => {
  const worktree = worktreePaths();
  const [manifestSource, verifyScript, surfaces] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("scripts/verify.sh", "utf8"),
    codeSurfaces(worktree),
  ]);
  const manifest = JSON.parse(manifestSource) as {
    scripts?: Record<string, string>;
  };
  const leanDependentGates = Object.entries(manifest.scripts ?? {})
    .filter(([, command]) =>
      leanDependentEntrypoints(
        surfaces,
        manifestTestEntrypoints(command, worktree),
      ).length > 0
    )
    .map(([name]) => name)
    .sort();
  const runtimeGates = invokedPnpmGates(
    verificationFunctionBody(verifyScript, "verify_runtime"),
  );
  const pipelineGates = invokedPnpmGates(
    verificationFunctionBody(verifyScript, "verify_pipeline"),
  );

  assert.ok(leanDependentGates.length > 0, "no Lean-dependent package test was discovered");
  assert.deepEqual(
    runtimeGates.filter((name) => leanDependentGates.includes(name)),
    [],
    "the runtime lane has no restored .lake output and must never start a Lean-dependent package test",
  );
  assert.deepEqual(
    leanDependentGates.filter((name) => !pipelineGates.includes(name)),
    [],
    "every Lean-dependent package test must run in the post-restore integration lane",
  );
});

test("the restored-output guard follows a package test's direct helper import", () => {
  const surfaces = [
    {
      relativePath: "packages/example/test/parity.integration-test.ts",
      source: 'import { runLean } from "./lean-targets.ts";\nrunLean();',
    },
    {
      relativePath: "packages/example/test/lean-targets.ts",
      source: 'const leanCommand = "./scripts/lake.sh";\nrunProcess(leanCommand, ["exe", "emitter"], 10_000);',
    },
  ];
  assert.deepEqual(
    leanDependentEntrypoints(
      surfaces,
      ["packages/example/test/parity.integration-test.ts"],
    ),
    ["packages/example/test/parity.integration-test.ts"],
  );
  assert.deepEqual(
    manifestTestEntrypoints(
      "node --test packages/example/test/*.test.ts packages/example/test/parity.integration-test.ts",
      surfaces.map(({ relativePath }) => relativePath),
    ),
    ["packages/example/test/parity.integration-test.ts"],
  );
});

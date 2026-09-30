import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runCommand } from "./run-command.ts";

import {
  discoverProduct2PrePushWorkflowGates,
  isGitHubWorkflowFileName,
  parsePushPathFilters,
  prePushWorkflowGates,
  selectedPrePushGates,
} from "./pre-push-selection.ts";

function pathFilteredWorkflow(gate: string): string {
  return `on:\n  push:\n    branches:\n      - main\n    paths:\n      - "package.json"\njobs:\n  quality:\n    steps:\n      - run: ./scripts/pnpm.sh run ${gate}\n`;
}

test("complete pre-push always audits before path selection and propagates security failures", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-pre-push-security-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const log = path.join(directory, "commands.log");
  await writeFile(path.join(directory, "pnpm"), `#!/bin/sh
printf 'pnpm %s\\n' "$*" >> "$PRE_PUSH_TEST_LOG"
case "$*" in
  check:clean-head) exit "$PRE_PUSH_TEST_CLEAN_EXIT" ;;
  test:dependency-security) exit "$PRE_PUSH_TEST_SECURITY_EXIT" ;;
  *) exit 99 ;;
esac
`, { mode: 0o755 });
  await writeFile(path.join(directory, "node"), `#!/bin/sh
printf 'node %s\\n' "$*" >> "$PRE_PUSH_TEST_LOG"
`, { mode: 0o755 });
  const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const command = manifest.scripts["test:pre-push"];
  assert.ok(command);
  for (const [cleanExit, securityExit] of [[0, 0], [0, 1], [0, 17], [1, 0]]) {
    await writeFile(log, "");
    const result = runCommand("/bin/sh", ["-c", command], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ""}`,
        PRE_PUSH_TEST_LOG: log,
        PRE_PUSH_TEST_CLEAN_EXIT: String(cleanExit),
        PRE_PUSH_TEST_SECURITY_EXIT: String(securityExit),
      },
      timeoutMs: 5_000,
    });
    const exit = cleanExit || securityExit;
    if (exit === 0) await result;
    else await assert.rejects(result, new RegExp(`exited with ${exit}\\b`, "u"));
    assert.deepEqual((await readFile(log, "utf8")).trim().split("\n"), [
      "pnpm check:clean-head",
      ...(cleanExit === 0 ? ["pnpm test:dependency-security"] : []),
      ...(exit === 0 ? ["node scripts/pre-push-selection.ts"] : []),
    ]);
  }
});

test("discovers both GitHub workflow filename extensions", () => {
  assert.equal(isGitHubWorkflowFileName("platform-quality.yml"), true);
  assert.equal(isGitHubWorkflowFileName("fifth-quality.yaml"), true);
  assert.equal(isGitHubWorkflowFileName("workflow.yml.disabled"), false);
});

const workflowSources = new Map(
  await Promise.all(
    prePushWorkflowGates.map(async ({ gate, workflow }) => [
      workflow,
      {
        gate,
        pushPaths: parsePushPathFilters(await readFile(workflow, "utf8")),
      },
    ] as const),
  ),
);

function selected(paths: readonly string[]): readonly string[] {
  return selectedPrePushGates(paths, workflowSources).map(({ gate }) => gate);
}

test("derives every Product 2 pre-push boundary from its real push path filters", () => {
  assert.deepEqual(
    selected(["packages/engine-api/src/index.ts"]),
    [
      "test:pre-push:verify",
      "test:pre-push:platform",
      "test:pre-push:platform-postgresql",
      "test:pre-push:showcase",
    ],
  );
  assert.deepEqual(
    selected(["showcase/mue-preview-alpha/src/showcase-runtime.ts"]),
    ["test:pre-push:showcase"],
  );
  assert.deepEqual(
    selected(["platform/apps/web/src/app.tsx"]),
    ["test:pre-push:ui"],
  );
  assert.deepEqual(
    selected(["docs/TESTING-SPEC.md"]),
    ["test:pre-push:verify"],
  );
});

test("a shared manifest selects the complete workflow set without hand-maintained duplication", () => {
  assert.deepEqual(
    selected(["package.json"]),
    [
      "test:pre-push:verify",
      "test:pre-push:platform",
      "test:pre-push:platform-postgresql",
      "test:pre-push:showcase",
      "test:pre-push:ui",
    ],
  );
});

test("discovers a fifth Product 2 workflow without changing a selector registry", () => {
  const discovered = discoverProduct2PrePushWorkflowGates(
    new Map([
      [
        ".github/workflows/alpha-quality.yml",
        pathFilteredWorkflow("test:pre-push:alpha"),
      ],
      [
        ".github/workflows/fifth-quality.yml",
        pathFilteredWorkflow("test:pre-push:fifth"),
      ],
      [
        ".github/workflows/verify.yml",
        "on:\n  push:\n    branches:\n      - main\n",
      ],
    ]),
    {
      "test:pre-push": "node scripts/pre-push-selection.ts",
      "test:pre-push:alpha": "echo alpha",
      "test:pre-push:fifth": "echo fifth",
      "test:pre-push:verify": "echo verify",
    },
  );

  assert.deepEqual(discovered, [
    {
      workflow: ".github/workflows/alpha-quality.yml",
      gate: "test:pre-push:alpha",
    },
    {
      workflow: ".github/workflows/fifth-quality.yml",
      gate: "test:pre-push:fifth",
    },
  ]);
});

test("fails closed when a path-filtered workflow lacks one exact local gate", () => {
  assert.throws(
    () => discoverProduct2PrePushWorkflowGates(
      new Map([
        [
          ".github/workflows/fifth-quality.yml",
          "on:\n  push:\n    paths:\n      - \"fifth/**\"\njobs:\n  quality:\n    steps:\n      - run: ./scripts/pnpm.sh run test:platform\n",
        ],
      ]),
      {},
    ),
    /exactly one Product 2 pre-push gate/u,
  );
});

test("fails closed when a path-filtered workflow has no push boundary", () => {
  assert.throws(
    () => discoverProduct2PrePushWorkflowGates(
      new Map([
        [
          ".github/workflows/fifth-quality.yml",
          "on:\n  pull_request:\n    paths:\n      - \"fifth/**\"\njobs:\n  quality:\n    steps:\n      - run: ./scripts/pnpm.sh run test:pre-push:fifth\n",
        ],
      ]),
      { "test:pre-push:fifth": "echo fifth" },
    ),
    /no push path filters/u,
  );
});

test("fails closed when two workflows claim the same local gate", () => {
  assert.throws(
    () => discoverProduct2PrePushWorkflowGates(
      new Map([
        [
          ".github/workflows/alpha-quality.yml",
          pathFilteredWorkflow("test:pre-push:shared"),
        ],
        [
          ".github/workflows/beta-quality.yml",
          pathFilteredWorkflow("test:pre-push:shared"),
        ],
      ]),
      { "test:pre-push:shared": "echo shared" },
    ),
    /distinct pre-push gate/u,
  );
});

test("fails closed when workflow and package-script gate inventories differ", () => {
  assert.throws(
    () => discoverProduct2PrePushWorkflowGates(
      new Map([
        [
          ".github/workflows/alpha-quality.yml",
          pathFilteredWorkflow("test:pre-push:alpha"),
        ],
      ]),
      {
        "test:pre-push": "node scripts/pre-push-selection.ts",
        "test:pre-push:alpha": "echo alpha",
        "test:pre-push:fifth": "echo fifth",
        "test:pre-push:verify": "echo verify",
      },
    ),
    /workflow and package-script gate inventories differ/u,
  );
});

test("each Product 2 workflow selects its own local equivalent", () => {
  for (const { gate, workflow } of prePushWorkflowGates) {
    assert.ok(
      selected([workflow]).includes(gate),
      `${workflow} must select ${gate}`,
    );
  }
});

test("rejects an absent or malformed push path boundary instead of under-selecting", () => {
  assert.throws(
    () => parsePushPathFilters("on:\n  pull_request:\n    paths:\n      - \"src/**\"\n"),
    /push path filters/u,
  );
  assert.throws(
    () => parsePushPathFilters("on:\n  push:\n    paths:\n      - src/**\n"),
    /quoted path filter/u,
  );
});

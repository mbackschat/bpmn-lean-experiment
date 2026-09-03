import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { requiresProduct1Verification } from "./ci-change-selection.ts";
import { assertCleanCommittedHead } from "./clean-committed-head.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export const prePushWorkflowGates = Object.freeze([
  {
    workflow: ".github/workflows/platform-quality.yml",
    gate: "test:pre-push:platform",
  },
  {
    workflow: ".github/workflows/platform-postgresql-quality.yml",
    gate: "test:pre-push:platform-postgresql",
  },
  {
    workflow: ".github/workflows/showcase-quality.yml",
    gate: "test:pre-push:showcase",
  },
  {
    workflow: ".github/workflows/ui-quality.yml",
    gate: "test:pre-push:ui",
  },
] as const);

type PrePushGate = typeof prePushWorkflowGates[number]["gate"] |
  "test:pre-push:verify";

type WorkflowSelection = Readonly<{
  gate: PrePushGate;
  pushPaths: readonly string[];
}>;

export function parsePushPathFilters(source: string): readonly string[] {
  const lines = source.split(/\r?\n/u);
  const pushIndex = lines.findIndex((line) => /^  push:\s*$/u.test(line));
  if (pushIndex < 0) {
    throw new TypeError("workflow has no push path filters");
  }
  const pushEndOffset = lines.slice(pushIndex + 1)
    .findIndex((line) => /^  [A-Za-z_][\w-]*:\s*/u.test(line));
  const pushEnd = pushEndOffset < 0 ? lines.length : pushIndex + 1 + pushEndOffset;
  const pathsIndex = lines.findIndex(
    (line, index) => index > pushIndex && index < pushEnd && /^    paths:\s*$/u.test(line),
  );
  if (pathsIndex < 0) {
    throw new TypeError("workflow push path filters are absent");
  }

  const filters: string[] = [];
  for (const line of lines.slice(pathsIndex + 1, pushEnd)) {
    const quoted = /^      - "([^"]+)"\s*$/u.exec(line);
    if (quoted?.[1] !== undefined) {
      filters.push(quoted[1]);
      continue;
    }
    if (/^    [A-Za-z_][\w-]*:\s*/u.test(line)) {
      break;
    }
    if (/^      - /u.test(line)) {
      throw new TypeError("workflow push paths require a quoted path filter");
    }
    if (line.trim().length > 0) {
      throw new TypeError("workflow push path filters are malformed");
    }
  }
  if (filters.length === 0) {
    throw new TypeError("workflow push path filters are empty");
  }
  return filters;
}

export function selectedPrePushGates(
  changedPaths: readonly string[],
  workflows: ReadonlyMap<string, WorkflowSelection>,
): readonly Readonly<{ gate: PrePushGate }>[] {
  const selected: Array<Readonly<{ gate: PrePushGate }>> = [];
  if (requiresProduct1Verification(changedPaths)) {
    selected.push({ gate: "test:pre-push:verify" });
  }
  for (const { workflow, gate } of prePushWorkflowGates) {
    const selection = workflows.get(workflow);
    if (selection === undefined || selection.gate !== gate) {
      throw new TypeError(`pre-push workflow selection is absent or mismatched for ${workflow}`);
    }
    if (changedPaths.some((changedPath) =>
      selection.pushPaths.some((filter) => path.matchesGlob(changedPath, filter))
    )) {
      selected.push({ gate });
    }
  }
  return selected;
}

function git(arguments_: readonly string[]): string {
  const result = spawnSync("git", arguments_, {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${arguments_.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function changedCommittedPaths(): readonly string[] {
  const upstream = git([
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ]);
  const base = git(["merge-base", upstream, "HEAD"]);
  const output = git([
    "diff",
    "--name-only",
    "--diff-filter=ACMRD",
    base,
    "HEAD",
  ]);
  return output.length === 0 ? [] : output.split("\n");
}

function runGate(gate: PrePushGate): void {
  const command = gate === "test:pre-push:platform-postgresql" &&
      process.env.BPMN_TEST_POSTGRES_URL === undefined
    ? "test:platform-postgresql:local"
    : gate;
  process.stdout.write(`PRE_PUSH_GATE selected=${gate} command=${command}\n`);
  const result = spawnSync("./scripts/pnpm.sh", ["run", command], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit ${String(result.status)}`);
  }
}

function main(): void {
  assertCleanCommittedHead(projectRoot);
  const changedPaths = changedCommittedPaths();
  const workflows = new Map(
    prePushWorkflowGates.map(({ workflow, gate }) => [
      workflow,
      {
        gate,
        pushPaths: parsePushPathFilters(
          readFileSync(path.join(projectRoot, workflow), "utf8"),
        ),
      },
    ] as const),
  );
  const selected = selectedPrePushGates(changedPaths, workflows);
  process.stdout.write(
    `PRE_PUSH_PATHS count=${String(changedPaths.length)} paths=${changedPaths.join(",")}\n`,
  );
  if (selected.length === 0) {
    throw new Error("committed diff selected no local pre-push gate");
  }
  for (const { gate } of selected) {
    runGate(gate);
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`PRE_PUSH_SELECTION_ERROR ${message}\n`);
    process.exitCode = 1;
  }
}

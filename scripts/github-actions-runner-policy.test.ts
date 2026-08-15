import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

/** Guards macOS runners as explicit, manually dispatched compatibility evidence only. */

const projectRoot = path.resolve(import.meta.dirname, "..");
const workflowRoot = path.join(projectRoot, ".github", "workflows");

type WorkflowSource = Readonly<{
  relativePath: string;
  source: string;
}>;

function githubMacOsRunnerFindings(
  workflows: ReadonlyArray<WorkflowSource>,
): ReadonlyArray<string> {
  return workflows.flatMap(({ relativePath, source }) => {
    const lines = source.split("\n");
    const hasManualTrigger = lines.some((line) => /^\s{2}workflow_dispatch\s*:/u.test(line));
    return lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) =>
        line.toLowerCase().includes("macos-") &&
        !/^\s*[\w-]+:\s*(?:#.*)?$/u.test(line)
      )
      .filter(({ index }) =>
        !hasManualTrigger || !manualDispatchOnlyJob(lines, index)
      )
      .map(({ line, index }) =>
        `${relativePath}:${index + 1}: ${line.trim()}`
      );
  });
}

function manualDispatchOnlyJob(
  lines: ReadonlyArray<string>,
  runnerLineIndex: number,
): boolean {
  let jobStart = runnerLineIndex;
  while (jobStart >= 0 && !/^\s{2}[\w-]+:\s*(?:#.*)?$/u.test(lines[jobStart] ?? "")) {
    jobStart -= 1;
  }
  if (jobStart < 0) {
    return false;
  }
  let jobEnd = jobStart + 1;
  while (jobEnd < lines.length && !/^\s{2}[\w-]+:\s*(?:#.*)?$/u.test(lines[jobEnd] ?? "")) {
    jobEnd += 1;
  }
  return lines.slice(jobStart, jobEnd).some((line) =>
    /^\s{4}if:\s*(?:\$\{\{\s*)?github\.event_name\s*==\s*['"]workflow_dispatch['"](?:\s*\}\})?\s*(?:#.*)?$/u.test(line)
  );
}

async function workflowSources(): Promise<ReadonlyArray<WorkflowSource>> {
  const entries = await readdir(workflowRoot, { withFileTypes: true });
  return Promise.all(entries
    .filter((entry) =>
      entry.isFile() && /\.ya?ml$/u.test(entry.name)
    )
    .map(async (entry) => ({
      relativePath: path.join(".github", "workflows", entry.name),
      source: await readFile(path.join(workflowRoot, entry.name), "utf8"),
    })));
}

test("GitHub Actions allocates no routine macOS runners", async () => {
  assert.deepEqual(
    githubMacOsRunnerFindings(await workflowSources()),
    [],
    "GitHub-hosted macOS is allowed only for a manually dispatched compatibility job",
  );
});

test("the runner policy rejects automatic macOS jobs and permits manual compatibility jobs", () => {
  assert.deepEqual(
    githubMacOsRunnerFindings([
      {
        relativePath: ".github/workflows/automatic.yml",
        source: [
          "jobs:",
          "  direct:",
          "    runs-on: macos-15",
          "  matrix:",
          "    strategy:",
          "      matrix:",
          "        os: [ubuntu-latest, macos-latest]",
        ].join("\n"),
      },
      {
        relativePath: ".github/workflows/manual.yml",
        source: [
          "on:",
          "  workflow_dispatch:",
          "jobs:",
          "  macos-compatibility:",
          "    if: github.event_name == 'workflow_dispatch'",
          "    runs-on: macos-latest",
        ].join("\n"),
      },
      {
        relativePath: ".github/workflows/mixed.yml",
        source: [
          "on:",
          "  workflow_dispatch:",
          "  push:",
          "jobs:",
          "  mixed:",
          "    if: github.event_name == 'workflow_dispatch' || github.event_name == 'push'",
          "    runs-on: macos-15",
        ].join("\n"),
      },
    ]),
    [
      ".github/workflows/automatic.yml:3: runs-on: macos-15",
      ".github/workflows/automatic.yml:7: os: [ubuntu-latest, macos-latest]",
      ".github/workflows/mixed.yml:7: runs-on: macos-15",
    ],
  );
});

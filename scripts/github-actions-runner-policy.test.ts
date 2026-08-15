import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

/** Guards the owner rule that GitHub Actions must never allocate a macOS runner. */

const projectRoot = path.resolve(import.meta.dirname, "..");
const workflowRoot = path.join(projectRoot, ".github", "workflows");

type WorkflowSource = Readonly<{
  relativePath: string;
  source: string;
}>;

function githubMacOsRunnerFindings(
  workflows: ReadonlyArray<WorkflowSource>,
): ReadonlyArray<string> {
  return workflows.flatMap(({ relativePath, source }) =>
    source
      .split("\n")
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => line.toLowerCase().includes("macos-"))
      .map(({ line, lineNumber }) =>
        `${relativePath}:${lineNumber}: ${line.trim()}`
      )
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

test("GitHub Actions allocates no macOS runners", async () => {
  assert.deepEqual(
    githubMacOsRunnerFindings(await workflowSources()),
    [],
    "GitHub-hosted macOS is prohibited; use Ubuntu in GitHub Actions and the local Mac for macOS checks",
  );
});

test("the runner policy rejects direct and matrix macOS labels", () => {
  assert.deepEqual(
    githubMacOsRunnerFindings([{
      relativePath: ".github/workflows/probe.yml",
      source: [
        "jobs:",
        "  direct:",
        "    runs-on: macos-15",
        "  matrix:",
        "    strategy:",
        "      matrix:",
        "        os: [ubuntu-latest, macos-latest]",
      ].join("\n"),
    }]),
    [
      ".github/workflows/probe.yml:3: runs-on: macos-15",
      ".github/workflows/probe.yml:7: os: [ubuntu-latest, macos-latest]",
    ],
  );
});

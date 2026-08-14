import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const execFileAsync = promisify(execFile);

test("maintained documentation does not retain the retired lowest-operation selector", async () => {
  const paths = await maintainedMarkdownPaths();
  const findings: string[] = [];
  for (const documentPath of paths) {
    const source = await readFile(documentPath, "utf8");
    for (const claim of staleSemanticClosureClaims(source)) {
      findings.push(`${path.relative(repositoryRoot, documentPath)}: ${claim}`);
    }
  }
  assert.deepEqual(findings, []);
});

test("the documentation guard reaches every maintained repository region", async () => {
  const relativePaths = (await maintainedMarkdownPaths()).map((documentPath) =>
    path.relative(repositoryRoot, documentPath)
  );
  const representatives = [
    "README.md",
    "contracts/README.md",
    "docs/README.md",
    "packages/semantic-core/README.md",
    "platform/README.md",
    "profiles/README.md",
    "runners/README.md",
    "scenarios/README.md",
    "showcase/README.md",
  ];
  assert.deepEqual(
    representatives.filter((representative) =>
      !relativePaths.includes(representative)
    ),
    [],
  );
  assert.equal(
    relativePaths.some((relativePath) =>
      relativePath.includes("/archived/") ||
      relativePath.startsWith("docs/archived/") ||
      relativePath.includes("/reference/") ||
      relativePath.startsWith("docs/reference/") ||
      relativePath.startsWith("adoption/a12/legacy/source-tree/")
    ),
    false,
  );
});

test("the semantic-closure documentation guard covers both stale claim classes", () => {
  assert.deepEqual(
    staleSemanticClosureClaims([
      "Internal closure selects the lowest semantic operation ID.",
      "The shipped TypeScript core has no ambiguity outcome and advances the lowest canonical operation ID.",
      "The residual is the Lean/TypeScript selector divergence.",
    ].join("\n")),
    [
      "Internal closure selects the lowest semantic operation ID",
      "TypeScript core has no ambiguity outcome and advances the lowest canonical operation ID",
      "residual is the Lean/TypeScript selector divergence",
    ],
  );
  assert.deepEqual(
    staleSemanticClosureClaims(
      "TypeScript must reject unsupported multiple-enabledness instead of selecting the lowest operation ID.",
    ),
    [],
  );
});

function staleSemanticClosureClaims(source: string): string[] {
  const patterns = [
    /\b(?:internal closure|TypeScript core)\b[^.\n]{0,240}\b(?:selects|advances)\b[^.\n]{0,120}\blowest\b[^.\n]{0,80}\boperation(?: ID)?/giu,
    /\b(?:residual|current)\b[^.\n]{0,120}\bLean\/TypeScript selector divergence\b/giu,
  ];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[0])
  );
}

async function maintainedMarkdownPaths(): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  return stdout.split("\n")
    .filter((relativePath) => relativePath.length > 0)
    .filter((relativePath) => {
      const segments = relativePath.split("/");
      return !segments.includes("archived") &&
        !segments.includes("reference") &&
        !relativePath.startsWith("adoption/a12/legacy/source-tree/");
    })
    .map((relativePath) => path.join(repositoryRoot, relativePath))
    .sort();
}

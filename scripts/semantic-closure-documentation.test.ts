import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("maintained documentation does not retain the retired lowest-operation selector", async () => {
  const paths = await markdownPaths(path.join(repositoryRoot, "docs"));
  const findings: string[] = [];
  for (const documentPath of paths) {
    const source = await readFile(documentPath, "utf8");
    for (const claim of staleSemanticClosureClaims(source)) {
      findings.push(`${path.relative(repositoryRoot, documentPath)}: ${claim}`);
    }
  }
  assert.deepEqual(findings, []);
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

async function markdownPaths(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "archived" && entry.name !== "reference") {
        paths.push(...await markdownPaths(entryPath));
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      paths.push(entryPath);
    }
  }
  return paths.sort();
}

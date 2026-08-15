import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  analyzeLeanSource,
  worktreeLeanSourceFiles,
} from "./lean-source-analysis.ts";

const semanticProcessUmbrella = "BpmnSemantics/SemanticProcess.lean";
const externalA12ResearchTree = "adoption/a12/legacy/source-tree/";

export function broadSemanticProcessImports(
  sourcePath: string,
  source: string,
): ReadonlyArray<string> {
  const normalizedPath = sourcePath.replaceAll(path.sep, "/");
  if (
    normalizedPath === semanticProcessUmbrella ||
    normalizedPath.startsWith(externalA12ResearchTree)
  ) {
    return [];
  }
  return analyzeLeanSource(source).code
    .split(/\r?\n/u)
    .flatMap((line, index) =>
      /^\s*import\s+BpmnSemantics\.SemanticProcess\s*$/u.test(line)
        ? [`${normalizedPath}:${index + 1}`]
        : [],
    );
}

test("detects the aggregate import without matching comments or the umbrella owner", () => {
  const source = [
    "import BpmnSemantics.SemanticProcess",
    "-- import BpmnSemantics.SemanticProcess",
    "import BpmnSemantics.SemanticProcess.Execution",
    "",
    "/-! Boundary fixture. -/",
    "",
  ].join("\n");

  assert.deepEqual(
    broadSemanticProcessImports("BpmnSemantics/Leaf.lean", source),
    ["BpmnSemantics/Leaf.lean:1"],
  );
  assert.deepEqual(
    broadSemanticProcessImports(semanticProcessUmbrella, source),
    [],
  );
  assert.deepEqual(
    broadSemanticProcessImports(
      "adoption/a12/legacy/source-tree/BpmnSemantics/Leaf.lean",
      source,
    ),
    [],
  );
});

test("semantic leaf modules import narrow owners rather than the aggregate umbrella", () => {
  const violations = worktreeLeanSourceFiles().flatMap((sourcePath) =>
    broadSemanticProcessImports(sourcePath, readFileSync(sourcePath, "utf8")),
  );
  assert.deepEqual(
    violations,
    [],
    "a broad SemanticProcess import invalidates unrelated proof-heavy modules when a leaf owner changes",
  );
});

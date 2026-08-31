import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readWorktreeSources } from "./worktree-source-read.ts";
import path from "node:path";
import test from "node:test";

import {
  analyzeLeanSource,
  worktreeLeanSourceFiles,
} from "./lean-source-analysis.ts";

const semanticProcessUmbrella = "BpmnSemantics/SemanticProcess.lean";
const externalA12ResearchTree = "adoption/a12/legacy/source-tree/";
const experimentTree = "BpmnSemantics/Experiments/";

/**
 * The project-owned unions an experiment file may decide, and the module that declares them.
 *
 * Both live in the same owner today, but the pair is the point rather than the path: the class this
 * guard reports is a new constructor silently leaving an experiment matcher non-exhaustive, and that
 * class belongs to every union the tree matches on. Restricting it to `CheckedNode` let a new
 * `SemanticOperation` constructor break the tree with the guard green.
 */
const decidedUnions: ReadonlyArray<Readonly<{ name: string; owner: string }>> = [
  { name: "CheckedNode", owner: "BpmnSemantics/SemanticProcessContract.lean" },
  { name: "SemanticOperation", owner: "BpmnSemantics/SemanticProcessContract.lean" },
  { name: "Stimulus", owner: "BpmnSemantics/Scenario.lean" },
];

/** Constructor names of one project-owned union, in declaration order. */
export function leanUnionConstructors(
  source: string,
  union: string,
): ReadonlyArray<string> {
  const body =
    analyzeLeanSource(source).code.split(`inductive ${union} where`)[1] ?? "";
  const names: string[] = [];
  for (const line of body.split(/\r?\n/u)) {
    if (/^\S/u.test(line) && names.length > 0) {
      break;
    }
    const constructor = /^\s*\|\s*([a-z][A-Za-z0-9]*)/u.exec(line);
    if (constructor?.[1] !== undefined) {
      names.push(constructor[1]);
    }
  }
  return names;
}

function patternArmConstructors(
  constructors: ReadonlyArray<string>,
  code: string,
): ReadonlyArray<string> {
  // Pattern position only. A fixture builds nodes as `, .userTask ⟨"Task_A"⟩ …`, which names the
  // same constructor while deciding nothing, so the name must follow a `|`. It need not open the
  // line: a frozen-surface classifier writes several alternatives per arm as `| .a .. | .b ..`, and
  // counting only the line-leading one put such a file below the coverage threshold and made it
  // invisible. `<|` and `||` are excluded because neither introduces a pattern.
  return constructors.filter((name) =>
    new RegExp(
      `(?<![<|>])\\|(?!\\|)\\s*(some\\s*\\(\\s*)?\\.?${name}\\b`,
      "mu",
    ).test(code)
  );
}

/**
 * Constructors of one union that an experiment matcher fails to decide.
 *
 * The compiler already rejects a missing arm, but only in the experiment executables `verify.sh`
 * builds: the default Lake target does not import this tree, so `./scripts/lake.sh build` and
 * `./scripts/lake.sh test` both pass while it is broken, and a focused Lean gate reports green. This
 * reports the same class from source text in the build-free gate, seconds after the edit.
 *
 * A file counts as deciding the union when its pattern arms name more than half of it. That is a
 * coverage heuristic rather than a parse of each match block, chosen because a file-level wildcard
 * test reads one match's `| _ => none` as covering another match in the same file, which is exactly
 * the file that broke. The compiler in `verify.sh` remains the deciding oracle; this moves the
 * feedback earlier.
 */
export function unmatchedUnionConstructors(
  union: string,
  constructors: ReadonlyArray<string>,
  sourcePath: string,
  source: string,
): ReadonlyArray<string> {
  const normalizedPath = sourcePath.replaceAll(path.sep, "/");
  if (!normalizedPath.startsWith(experimentTree)) {
    return [];
  }
  const code = analyzeLeanSource(source).code;
  if (!new RegExp(`\\b${union}\\b`, "u").test(code)) {
    return [];
  }
  const decided = patternArmConstructors(constructors, code);
  if (decided.length * 2 <= constructors.length) {
    return [];
  }
  return constructors
    .filter((name) => !decided.includes(name))
    .map((name) => `${normalizedPath}: ${union}.${name}`);
}

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

test("separates a checked-node matcher from a fixture that only builds nodes", () => {
  const union = [
    "inductive CheckedNode where",
    "  | noneStartEvent (id : NodeId)",
    "  | dataInputUserTask (id : NodeId) (name : Option String)",
    "  | receiveTask (id : NodeId) (channel : MessageChannel)",
    "",
    "def unrelated : Nat := 0",
    "  | notAConstructor",
  ].join("\n");
  const constructors = leanUnionConstructors(union, "CheckedNode");
  assert.deepEqual(constructors, [
    "noneStartEvent",
    "dataInputUserTask",
    "receiveTask",
  ]);

  const fixture = [
    "def sample : List CheckedNode :=",
    "  [ .noneStartEvent ⟨\"Start\"⟩",
    "  , .receiveTask ⟨\"Task\"⟩ channel",
    "  , .dataInputUserTask ⟨\"Review\"⟩ none directInput ]",
  ].join("\n");
  assert.deepEqual(
    unmatchedUnionConstructors(
      "CheckedNode",
      constructors,
      "BpmnSemantics/Experiments/Fixture.lean",
      fixture,
    ),
    [],
    "constructor application names the union without deciding it",
  );

  const matcher = [
    "def arity : CheckedNode → Bool",
    "  | .noneStartEvent _ => true",
    "  | .receiveTask _ _ => false",
    "",
    "def ids : List NodeId := nodes.filterMap fun",
    "  | .noneStartEvent id => some id",
    "  | _ => none",
  ].join("\n");
  assert.deepEqual(
    unmatchedUnionConstructors(
      "CheckedNode",
      constructors,
      "BpmnSemantics/Experiments/Probe.lean",
      matcher,
    ),
    ["BpmnSemantics/Experiments/Probe.lean: CheckedNode.dataInputUserTask"],
    "a wildcard in a second match must not read as covering the first",
  );
  assert.deepEqual(
    unmatchedUnionConstructors(
      "CheckedNode",
      constructors,
      "BpmnSemantics/SemanticProcess/Lowering.lean",
      matcher,
    ),
    [],
    "production owners are compiled by the default target and answer to the compiler",
  );
});

/**
 * The exact shape that hid a broken file: several alternatives on one arm, and `<|` beside them.
 *
 * A frozen-surface classifier writes `| .a .. | .b .. => false`. Counting only the alternative that
 * opens the line put the file under the coverage threshold, so the guard returned nothing while the
 * tree did not compile.
 */
test("counts every alternative of a multi-constructor arm", () => {
  const constructors = ["initiate", "awaitUserTask", "duplicate"];
  const classifier = [
    "def supported : SemanticOperation → Bool",
    "  | .initiate .. | .awaitUserTask .. => true",
    "  | .duplicate .. => false",
  ].join("\n");
  assert.deepEqual(
    unmatchedUnionConstructors(
      "SemanticOperation",
      constructors,
      "BpmnSemantics/Experiments/Classifier.lean",
      classifier,
    ),
    [],
  );

  const missingOne = [
    "def supported : SemanticOperation → Bool",
    "  | .initiate .. | .awaitUserTask .. => true",
    "  | _ => false",
  ].join("\n");
  assert.deepEqual(
    unmatchedUnionConstructors(
      "SemanticOperation",
      constructors,
      "BpmnSemantics/Experiments/Classifier.lean",
      missingOne,
    ),
    ["BpmnSemantics/Experiments/Classifier.lean: SemanticOperation.duplicate"],
  );

  const application = [
    "def sample : List SemanticOperation :=",
    "  [ build <| .initiate id, build <| .awaitUserTask id, build <| .duplicate id ]",
  ].join("\n");
  assert.deepEqual(
    unmatchedUnionConstructors(
      "SemanticOperation",
      constructors,
      "BpmnSemantics/Experiments/Fixture.lean",
      application,
    ),
    [],
    "`<|` applies a constructor and decides nothing",
  );
});

test("every experiment matcher decides each constructor its unions declare", () => {
  const sources = readWorktreeSources(worktreeLeanSourceFiles());
  const violations = decidedUnions.flatMap(({ name, owner }) => {
    const constructors = leanUnionConstructors(readFileSync(owner, "utf8"), name);
    assert.ok(
      constructors.length > 1,
      `the union parser must find real ${name} constructors before the inventory means anything`,
    );
    return sources.flatMap(({ path, source }) =>
      unmatchedUnionConstructors(name, constructors, path, source),
    );
  });

  assert.deepEqual(
    violations,
    [],
    "the experiment tree is outside the default Lake target, so only the full gate compiles it",
  );
});

test("semantic leaf modules import narrow owners rather than the aggregate umbrella", () => {
  const violations = readWorktreeSources(worktreeLeanSourceFiles()).flatMap(
    ({ path, source }) => broadSemanticProcessImports(path, source),
  );
  assert.deepEqual(
    violations,
    [],
    "a broad SemanticProcess import invalidates unrelated proof-heavy modules when a leaf owner changes",
  );
});

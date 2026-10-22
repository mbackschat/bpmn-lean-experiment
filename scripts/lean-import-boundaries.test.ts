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
const semanticLibraryRoot = "BpmnSemantics.lean";
const conformanceLibraryRoot = "BpmnConformance.lean";
const externalA12ResearchTree = "adoption/a12/legacy/source-tree/";
const experimentTree = "BpmnSemantics/Experiments/";

/**
 * The project-owned unions an experiment file may decide, and the module that declares them.
 *
 * Every matched union needs coverage: restricting this guard to `CheckedNode` let a new
 * `SemanticOperation` constructor leave an experiment matcher non-exhaustive while the guard passed.
 */
const decidedUnions: ReadonlyArray<Readonly<{ name: string; owner: string }>> = [
  { name: "CheckedNode", owner: "BpmnSemantics/CheckedProcessContract.lean" },
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

function moduleName(sourcePath: string): string {
  return sourcePath.replace(/\.lean$/u, "").replaceAll("/", ".");
}

function importedModules(code: string): readonly string[] {
  return [...code.matchAll(/^\s*import\s+([A-Za-z0-9_.]+)\s*$/gmu)].map(match => match[1]!);
}

export function maintainedExecutableRoots(lakefile: string): readonly string[] {
  const roots = [...lakefile.matchAll(/\[\[lean_exe\]\]([\s\S]*?)(?=\n\[\[|$)/gu)].flatMap((block) => {
    const root = /^root\s*=\s*"([^"]+)"\s*$/mu.exec(block[1]!)?.[1];
    assert.ok(root, "each executable must declare its import root");
    return root.startsWith(moduleName(experimentTree.slice(0, -1))) ? [] : [root];
  });
  // The differential integration test runs this existing source entry without a Lake executable.
  // Its command owner is packages/differential/test/parallel-scope-admission-lean-core.integration-test.ts.
  return [...roots, "BpmnSemantics.ParallelScopeReservationMain"];
}

export function executableProofImportEdges(
  sources: ReadonlyArray<Readonly<{ path: string; source: string }>>,
  roots: readonly string[],
): readonly string[] {
  const graph = new Map(sources.map(({ path: sourcePath, source }) => {
    const code = analyzeLeanSource(source).code;
    const kinds = [...code.matchAll(/^[\t ]*(?:@\[[^\]]*\]\s*)*(?:(?:private|protected|noncomputable|partial|unsafe|nonrec)\s+)*(theorem|lemma|example|def|abbrev|inductive|structure|class|instance)\b/gmu)]
      .map((match) => match[1]!);
    return [moduleName(sourcePath.replaceAll(path.sep, "/")), {
      imports: importedModules(code),
      definitions: kinds.some((kind) => !["theorem", "lemma", "example"].includes(kind)),
      proofsOnly: kinds.length > 0 && kinds.every((kind) => ["theorem", "lemma", "example"].includes(kind)),
    }] as const;
  }));
  const reachable = new Set<string>();
  const pending = [...roots];
  for (const root of roots) assert.ok(graph.has(root), `missing executable import root: ${root}`);
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    pending.push(...(graph.get(current)?.imports ?? []));
  }
  const edges = new Set<string>();
  for (const current of reachable) {
    const facts = graph.get(current);
    if (!facts?.definitions) continue;
    const imports = [...facts.imports];
    const visited = new Set<string>();
    while (imports.length > 0) {
      const imported = imports.pop()!;
      if (visited.has(imported)) continue;
      visited.add(imported);
      const dependency = graph.get(imported);
      if (dependency?.proofsOnly) edges.add(`${current} -> ${imported}`);
      else if (dependency && !dependency.definitions) imports.push(...dependency.imports);
    }
  }
  return [...edges].sort();
}

function forbiddenImportPaths(
  sources: ReadonlyArray<Readonly<{ path: string; source: string }>>,
  roots: readonly string[],
  forbidden: ReadonlySet<string>,
): readonly string[] {
  const graph = new Map(sources.map(source => [moduleName(source.path.replaceAll(path.sep, "/")),
    importedModules(analyzeLeanSource(source.source).code)] as const));
  return roots.flatMap(root => {
    assert.ok(graph.has(root), `missing executable import root: ${root}`);
    const visited = new Set<string>();
    const pending = [[root]];
    const violations: string[] = [];
    for (let index = 0; index < pending.length; index++) {
      const chain = pending[index]!;
      const current = chain.at(-1)!;
      if (visited.has(current)) continue;
      visited.add(current);
      if (forbidden.has(current)) violations.push(chain.join(" -> "));
      for (const imported of graph.get(current) ?? []) pending.push([...chain, imported]);
    }
    return violations;
  });
}

/**
 * Lean modules the two library roots assign wrongly, as `<module>: <reason>` lines.
 *
 * The semantic root builds after every shared change; the conformance root builds only at family
 * closure and in CI, because its finite journey witnesses dominated full rebuilds (PLAN, example-journey
 * move, 2026-10-21). So each maintained theorem or conformance owner must be reached by one of them, or
 * it can stay broken while both builds are green; no `*Conformance` module may be reached from the
 * semantic root, or it rejoins every routine build; and the conformance root must not import a module the
 * semantic root already builds, which would assign it to both.
 */
export function libraryRootAssignmentFindings(
  sources: ReadonlyArray<Readonly<{ path: string; source: string }>>,
): readonly string[] {
  const normalized = sources.map(({ path: sourcePath, source }) => {
    const code = analyzeLeanSource(source).code;
    const declarationCode = code.replace(/«[^»]*»/gu, "_quotedIdentifier");
    return {
      module: moduleName(sourcePath.replaceAll(path.sep, "/")),
      path: sourcePath.replaceAll(path.sep, "/"),
      hasNamedTheorem: /(?<![\p{L}\p{N}_'.?!])theorem\s+[\p{L}_][\p{L}\p{N}_'.?!]*/u.test(declarationCode),
      imports: importedModules(code),
    };
  });
  const importsByModule = new Map(
    normalized.map(({ module, imports }) => [module, imports] as const),
  );
  // Each reached module maps to the root's direct import it was first reached through.
  const reach = (root: string): ReadonlyMap<string, string> => {
    const via = new Map<string, string>();
    const pending = (importsByModule.get(root) ?? []).map((module) => [module, module] as const);
    while (pending.length > 0) {
      const [module, entry] = pending.pop()!;
      if (via.has(module)) continue;
      via.set(module, entry);
      pending.push(...(importsByModule.get(module) ?? []).map((imported) => [imported, entry] as const));
    }
    return via;
  };
  const semantic = reach(moduleName(semanticLibraryRoot));
  const conformance = reach(moduleName(conformanceLibraryRoot));
  const maintained = normalized.filter(({ path: sourcePath }) =>
    sourcePath.startsWith("BpmnSemantics/") && !sourcePath.startsWith(experimentTree)
  );
  return [
    ...(importsByModule.get(moduleName(conformanceLibraryRoot)) ?? [])
      .filter((module) => semantic.has(module))
      .map((module) => `${module}: imported by the conformance root but already built by the semantic root`),
    ...maintained
      .filter(({ path: sourcePath, hasNamedTheorem }) =>
        path.posix.basename(sourcePath).endsWith("Conformance.lean") || hasNamedTheorem
      )
      .filter(({ module }) => !semantic.has(module) && !conformance.has(module))
      .map(({ module }) => `${module}: reached by neither library root`),
    ...maintained
      .filter(({ path: sourcePath, module }) =>
        path.posix.basename(sourcePath).endsWith("Conformance.lean") && semantic.has(module)
      )
      .map(({ module }) => `${module}: conformance module built by the semantic root via ${semantic.get(module)}`),
  ].sort();
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

test("the two library roots assign every maintained Lean module exactly once", () => {
  assert.deepEqual(
    libraryRootAssignmentFindings(
      readWorktreeSources(worktreeLeanSourceFiles()),
    ),
    [],
    "an unreached owner can stay broken while both builds are green, and a conformance module under the semantic root rejoins every routine build",
  );
});

test("the maintained-conformance import guard derives omissions instead of trusting a registry", () => {
  assert.deepEqual(
    libraryRootAssignmentFindings([
      {
        path: "BpmnConformance.lean",
        source: "import BpmnSemantics.Suite\n-- import BpmnSemantics.MissingConformance\n",
      },
      {
        path: "BpmnSemantics/Suite.lean",
        source: "import BpmnSemantics.AlreadyConformance\n",
      },
      { path: "BpmnSemantics/AlreadyConformance.lean", source: "" },
      { path: "BpmnSemantics/MissingConformance.lean", source: "" },
      { path: "BpmnSemantics/Experiments/ExcludedConformance.lean", source: "" },
      { path: "BpmnSemantics/Ordinary.lean", source: "" },
    ]),
    ["BpmnSemantics.MissingConformance: reached by neither library root"],
  );
});

test("the assurance import guard reaches initialization and differently named theorem owners", () => {
  const sources = [
    { path: "BpmnSemantics.lean", source: "import BpmnSemantics.Suite\n" },
    {
      path: "BpmnSemantics/Suite.lean",
      source: "import BpmnSemantics.AlreadyProved\n/- import BpmnSemantics.Initialization -/\ndef quoted := \"import BpmnSemantics.Preservation\"\n",
    },
    { path: "BpmnSemantics/AlreadyProved.lean", source: "theorem valid : True := by trivial\n" },
    {
      path: "BpmnSemantics/Initialization.lean",
      source: "namespace Example\n  @[simp] private theorem initial_valid : True := by trivial\nend Example\n",
    },
    {
      path: "BpmnSemantics/Preservation.lean",
      source: "@[simp]\nprotected theorem «preserved claim» : True := by trivial\n",
    },
    {
      path: "BpmnSemantics/OnlyProse.lean",
      source: "-- theorem absent : True := by trivial\n/- theorem nested : True := by trivial -/\ndef quoted := \"theorem literal : True := by trivial\"\ndef αtheorem value := value\ndef «theorem named» := true\n",
    },
    { path: "BpmnSemantics/Experiments/OpenProof.lean", source: "theorem provisional : True := by trivial\n" },
  ];
  assert.deepEqual(libraryRootAssignmentFindings(sources), [
    "BpmnSemantics.Initialization: reached by neither library root",
    "BpmnSemantics.Preservation: reached by neither library root",
  ]);
  assert.deepEqual(
    libraryRootAssignmentFindings(sources.map((source) =>
      source.path === "BpmnSemantics/Suite.lean"
        ? { ...source, source: `${source.source}import BpmnSemantics.Initialization\nimport BpmnSemantics.Preservation\n` }
        : source,
    )),
    [],
  );
});

test("each maintained module belongs to exactly one library root", () => {
  const sources = [
    { path: "BpmnSemantics.lean", source: "import BpmnSemantics.Law\nimport BpmnSemantics.Footprint\n" },
    { path: "BpmnConformance.lean", source: "import BpmnSemantics.JourneyConformance\nimport BpmnSemantics.Law\n" },
    { path: "BpmnSemantics/Law.lean", source: "theorem law : True := by trivial\n" },
    { path: "BpmnSemantics/Footprint.lean", source: "import BpmnSemantics.PinnedConformance\n" },
    { path: "BpmnSemantics/PinnedConformance.lean", source: "" },
    { path: "BpmnSemantics/JourneyConformance.lean", source: "import BpmnSemantics.JourneyFixtures\n" },
    { path: "BpmnSemantics/JourneyFixtures.lean", source: "def journey := 0\n" },
    { path: "BpmnSemantics/OrphanConformance.lean", source: "" },
  ];
  assert.deepEqual(libraryRootAssignmentFindings(sources), [
    "BpmnSemantics.Law: imported by the conformance root but already built by the semantic root",
    "BpmnSemantics.OrphanConformance: reached by neither library root",
    "BpmnSemantics.PinnedConformance: conformance module built by the semantic root via BpmnSemantics.Footprint",
  ]);
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

test("maintained executable roots have no declaration-based proof dependencies", () => {
  const sources = readWorktreeSources(worktreeLeanSourceFiles());
  const roots = maintainedExecutableRoots(readFileSync("lakefile.toml", "utf8"));
  assert.ok(roots.includes("BpmnSemantics.CommittedExecutionPublicationJsonMain"));
  assert.deepEqual(executableProofImportEdges(sources, roots), []);
});

test("declaration-based isolation detects real non-PMIS direct and indirect dependencies", () => {
  const runtime = "BpmnSemantics.SemanticProcess.ExecutionRuntime";
  const proof = "BpmnSemantics.SemanticProcess.CallDataStateLaws";
  const sources = ["ExecutionRuntime", "Scenario", "CallDataStateLaws"].map((name) => ({
    path: `BpmnSemantics/SemanticProcess/${name}.lean`,
    source: `${name === "ExecutionRuntime" ? `import ${proof}\n` : name === "Scenario" ? `import ${runtime}\n` : ""}${readFileSync(`BpmnSemantics/SemanticProcess/${name}.lean`, "utf8")}`,
  }));
  const edge = `${runtime} -> ${proof}`;
  assert.deepEqual(executableProofImportEdges(sources, [runtime]), [edge]);
  assert.deepEqual(executableProofImportEdges(sources, ["BpmnSemantics.SemanticProcess.Scenario"]), [edge]);
});

test("declaration-based isolation covers the existing private source runner", () => {
  const runner = "BpmnSemantics.ParallelScopeReservationMain";
  const proof = "BpmnSemantics.SemanticProcess.CallDataStateLaws";
  const roots = maintainedExecutableRoots(readFileSync("lakefile.toml", "utf8"));
  const sources = readWorktreeSources(worktreeLeanSourceFiles()).map((source) =>
    moduleName(source.path) === runner
      ? { ...source, source: `import ${proof}\n${source.source}` }
      : source,
  );
  assert.deepEqual(executableProofImportEdges(sources, roots), [`${runner} -> ${proof}`]);
});

test("import-only facades cannot hide an executable proof dependency", () => {
  const sources = [
    { path: "Runtime.lean", source: "import Facade\ndef run : Nat := 0\n" },
    { path: "Facade.lean", source: "import Loop\nimport Proofs\n" },
    { path: "Loop.lean", source: "import Facade\n" },
    { path: "Proofs.lean", source: "theorem witness : True := by trivial\n" },
  ];
  assert.deepEqual(executableProofImportEdges(sources, ["Runtime"]), ["Runtime -> Proofs"]);
});

test("executable relations and declaration kinds determine isolation rather than module names", () => {
  const sources = [
    { path: "Runtime.lean", source: "import Proofs\ndef run : Nat := 0\n" },
    { path: "Proofs.lean", source: "inductive Step : Nat → Prop where\n  | zero : Step 0\ntheorem sound : Step 0 := .zero\n" },
  ];
  assert.deepEqual(executableProofImportEdges(sources, ["Runtime"]), []);
  assert.deepEqual(executableProofImportEdges(sources.map((source) => source.path === "Proofs.lean"
    ? { ...source, source: "/- def fake : Nat := 0 -/\nprivate theorem sound : True := by trivial\n" } : source),
  ["Runtime"]), ["Runtime -> Proofs"]);
});

test("runtime proof isolation detects indirect imports and ignores prose and cycles", () => {
  const sources = [
    { path: "Runtime.lean", source: "import Adapter\n-- import Proofs\n" },
    { path: "Adapter.lean", source: "import Runtime\nimport Proofs\n" },
    { path: "Proofs.lean", source: "theorem witness : True := by trivial\n" },
  ];
  assert.deepEqual(forbiddenImportPaths(sources, ["Runtime"], new Set(["Proofs"])), ["Runtime -> Adapter -> Proofs"]);
  assert.deepEqual(forbiddenImportPaths(sources.map(source => source.path === "Adapter.lean"
    ? { ...source, source: 'import Runtime\n/- import Proofs -/\ndef prose := "import Proofs"\n' } : source),
  ["Runtime"], new Set(["Proofs"])), []);
});

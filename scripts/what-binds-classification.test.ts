import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyGuard,
  describeEvidence,
  EvidenceKind,
  GuardTier,
  isGuardPath,
  maxImportDepth,
  targetProfile,
  type GuardClassification,
} from "./what-binds-classification.ts";
import {
  type CorpusFile,
  EnumerationKind,
  indexCorpus,
  pathspecCovers,
} from "./what-binds-source-facts.ts";

/**
 * Contract: a guard is a named binding, a scanning binding or an unbound mention of a target, and
 * the tier follows from the guard's own code and imports, never from a directory word alone.
 *
 * Every fixture is synthetic so each tier is locked independently of the live tree; the live
 * acceptance cases for the three AA-14 paths live in `what-binds.test.ts`.
 */

function classify(
  target: string,
  guard: CorpusFile,
  ...others: ReadonlyArray<CorpusFile>
): GuardClassification | null {
  return classifyGuard(targetProfile(target), guard, indexCorpus([guard, ...others]));
}

function guard(text: string, guardPath = "scripts/subject.test.ts"): CorpusFile {
  return { path: guardPath, text };
}

test("every guard suffix this repository runs is recognised", () => {
  for (const suffix of [
    "test",
    "platform-test",
    "temporal-test",
    "temporal-serial-test",
    "integration-test",
    "type-test",
  ]) assert.equal(isGuardPath(`packages/x/test/y.${suffix}.ts`), true, suffix);
  assert.equal(isGuardPath("packages/x/test/support.ts"), false);
  assert.equal(isGuardPath("packages/x/test/y.test.mts"), false);
});

test("pathspecs select a path, its directories and wildcards across separators", () => {
  const target = "BpmnSemantics/SemanticProcess/Execution.lean";
  for (const spec of [
    target,
    "BpmnSemantics",
    "BpmnSemantics/",
    "BpmnSemantics/SemanticProcess/*.lean",
    "*.lean",
    "**/SemanticProcess",
    "./BpmnSemantics",
  ]) assert.equal(pathspecCovers(spec, target), true, spec);
  for (const spec of [
    "Bpmn",
    "BpmnSemantics/Experiments",
    "*.ts",
    "SemanticProcess",
    "",
    "/",
  ]) assert.equal(pathspecCovers(spec, target), false, spec);
});

test("a guard naming the exact path, the basename or the Lean module is a named binding", () => {
  const lean = "BpmnSemantics/SemanticProcess/Execution.lean";
  assert.deepEqual(classify(lean, guard('read("BpmnSemantics/SemanticProcess/Execution.lean")')), {
    tier: GuardTier.Named,
    evidence: { kind: EvidenceKind.Text, term: lean },
  });
  assert.deepEqual(classify(lean, guard('const owner = "Execution.lean";')), {
    tier: GuardTier.Named,
    evidence: { kind: EvidenceKind.Text, term: "Execution.lean" },
  });
  assert.deepEqual(
    classify(lean, guard('const lake = "build BpmnSemantics.SemanticProcess.Execution";')),
    {
      tier: GuardTier.Named,
      evidence: {
        kind: EvidenceKind.Text,
        term: "BpmnSemantics.SemanticProcess.Execution",
      },
    },
  );
});

test("a name that only contains the basename or module as a fragment is not a named binding", () => {
  const lean = "BpmnSemantics/SemanticProcess/Execution.lean";
  for (const text of [
    'const other = "BpmnSemantics/SemanticProcess/ParallelExecution.lean";',
    'const longer = "BpmnSemantics.SemanticProcess.Execution.Sub";',
    'const sibling = "Execution.lean.bak";',
  ]) assert.equal(classify(lean, guard(text))?.tier, GuardTier.Mention, text);
});

test("a top-level Lean module name is not a naming term because every path below it contains it", () => {
  assert.equal(classify("BpmnSemantics.lean", guard('const root = "BpmnSemantics";')), null);
});

// The AA-14 defect: `scripts` appeared in the guard's text and nothing else connected it to the
// target, yet it was reported as a binding.
test("a guard sharing only an ancestor directory word is an unbound mention", () => {
  const result = classify(
    "scripts/strict-json.ts",
    guard('const note = "scripts"; assert.equal(a, b);'),
  );
  assert.deepEqual(result, {
    tier: GuardTier.Mention,
    evidence: { kind: EvidenceKind.Text, term: "scripts" },
  });
});

test("a guard unrelated to the target in every respect has no classification", () => {
  assert.equal(classify("scripts/strict-json.ts", guard("assert.ok(true);")), null);
});

test("the target never classifies as its own guard", () => {
  const self = guard('const self = "scripts/subject.test.ts";', "scripts/subject.test.ts");
  assert.equal(classify("scripts/subject.test.ts", self), null);
});

test("a guard importing the target is a named binding", () => {
  const result = classify(
    "scripts/strict-json.ts",
    guard('import { parseStrictJson } from "./strict-json.ts";'),
  );
  assert.equal(result?.tier, GuardTier.Named);
});

test("an import of the target that the guard text does not spell by basename still binds", () => {
  const helper: CorpusFile = { path: "scripts/helper.ts", text: 'export * from "./contract.ts";' };
  const result = classify(
    "scripts/contract.ts",
    guard('import { x } from "./helper.ts";'),
    helper,
  );
  assert.deepEqual(result, {
    tier: GuardTier.Named,
    evidence: { kind: EvidenceKind.Import, via: "scripts/helper.ts" },
  });
});

// The decisive AA-13 oracle imports `contract-artifacts.ts`, which imports `strict-json.ts`.
test("a guard reaches the target through one intermediate module within the depth bound", () => {
  assert.equal(maxImportDepth, 2);
  const guardFile = guard('import { build } from "./contract-artifacts.ts";', "scripts/contract-artifacts.test.ts");
  const intermediate: CorpusFile = {
    path: "scripts/contract-artifacts.ts",
    text: 'import { parse } from "./strict-json.ts";',
  };
  assert.deepEqual(
    classifyGuard(targetProfile("scripts/strict-json.ts"), guardFile, indexCorpus([guardFile, intermediate])),
    {
      tier: GuardTier.Named,
      evidence: { kind: EvidenceKind.Import, via: "scripts/contract-artifacts.ts" },
    },
  );
});

test("a chain longer than the depth bound is not evidence", () => {
  const guardFile = guard('import { a } from "./one.ts";');
  const corpus: ReadonlyArray<CorpusFile> = [
    guardFile,
    { path: "scripts/one.ts", text: 'import { b } from "./two.ts";' },
    { path: "scripts/two.ts", text: 'import { c } from "./three.ts";' },
    { path: "scripts/three.ts", text: "export const c = 1;" },
  ];
  assert.equal(
    classifyGuard(targetProfile("scripts/three.ts"), guardFile, indexCorpus(corpus)),
    null,
  );
  assert.equal(
    classifyGuard(targetProfile("scripts/two.ts"), guardFile, indexCorpus(corpus))?.tier,
    GuardTier.Named,
  );
});

test("imports resolve relative specifiers, including the compiled .js spelling, and skip aliases", () => {
  const compiled: CorpusFile = {
    path: "packages/core/src/runtime.ts",
    text: 'import { schedule } from "./schedule.js";',
  };
  const viaAlias = guard('import { schedule } from "@bpmn-lean/core/schedule";', "packages/core/test/a.test.ts");
  const viaRelative = guard('import { run } from "../src/runtime.ts";', "packages/core/test/b.test.ts");
  const target = targetProfile("packages/core/src/schedule.ts");
  const index = indexCorpus([compiled, viaAlias, viaRelative]);
  assert.equal(classifyGuard(target, viaAlias, index), null);
  assert.deepEqual(classifyGuard(target, viaRelative, index)?.evidence, {
    kind: EvidenceKind.Import,
    via: "packages/core/src/runtime.ts",
  });
});

test("a typeof import and a dynamic import are import edges, a URL string is not", () => {
  const leaf = targetProfile("packages/core/src/leaf.ts");
  const middle: CorpusFile = { path: "packages/core/src/mid.ts", text: 'export * from "./leaf.ts";' };
  const typeOnly = guard('type T = typeof import("../src/mid.ts");', "packages/core/test/a.test.ts");
  const dynamic = guard('const m = await import("../src/mid.ts");', "packages/core/test/b.test.ts");
  const urlOnly = guard(
    'new URL("../src/mid.ts", import.meta.url);',
    "packages/core/test/c.test.ts",
  );
  const index = indexCorpus([middle, typeOnly, dynamic, urlOnly]);
  for (const importer of [typeOnly, dynamic]) {
    assert.deepEqual(classifyGuard(leaf, importer, index)?.evidence, {
      kind: EvidenceKind.Import,
      via: "packages/core/src/mid.ts",
    }, importer.path);
  }
  assert.equal(classifyGuard(leaf, urlOnly, index), null);
});

test("an import mentioned only in a comment is not an edge", () => {
  const middle: CorpusFile = { path: "scripts/mid.ts", text: 'export * from "./leaf.ts";' };
  const commented = guard('// import { x } from "./mid.ts";\nassert.ok(true);');
  const real = guard('import { x } from "./mid.ts";', "scripts/real.test.ts");
  const leaf = targetProfile("scripts/leaf.ts");
  const index = indexCorpus([middle, commented, real]);
  assert.equal(classifyGuard(leaf, commented, index), null);
  assert.equal(classifyGuard(leaf, real, index)?.tier, GuardTier.Named);
});

test("git ls-files with a covering pathspec is a scanning binding", () => {
  const scanner = guard(
    'execFileSync("git", ["ls-files", "--cached", "--others", "--", "BpmnSemantics/"]);',
  );
  assert.deepEqual(classify("BpmnSemantics/SemanticProcess/Execution.lean", scanner), {
    tier: GuardTier.Scanning,
    evidence: {
      kind: EvidenceKind.Scan,
      enumeration: EnumerationKind.GitListing,
      scope: 'pathspec "BpmnSemantics/"',
      via: null,
    },
  });
});

test("git ls-files options before the pathspec separator are not pathspecs", () => {
  const scanner = guard('run("git", ["ls-files", "-z", "--exclude-standard", "--", "*.md"]);');
  assert.equal(classify("docs/PLAN.md", scanner)?.tier, GuardTier.Scanning);
  assert.equal(classify("scripts/strict-json.ts", scanner), null);
});

test("a pathspec that excludes the target keeps an unrelated mention a mention", () => {
  const scanner = guard(
    'git(["ls-files", "--", "docs/*.md"]); const where = "scripts";',
  );
  assert.equal(classify("scripts/strict-json.ts", scanner)?.tier, GuardTier.Mention);
});

test("a pathspec-free listing covers the extensions the guard filters on", () => {
  const scanner = guard(
    'git(["ls-files", "--cached"]).split("\\n").filter((file) => file.endsWith(".lean"));',
  );
  const result = classify("BpmnSemantics/SemanticProcess/Execution.lean", scanner);
  assert.equal(result?.tier, GuardTier.Scanning);
  assert.equal(result?.evidence.kind, EvidenceKind.Scan);
  assert.equal(
    result?.evidence.kind === EvidenceKind.Scan ? result.evidence.scope : "",
    'whole repository filtered by ".lean"',
  );
  assert.equal(classify("scripts/strict-json.ts", scanner), null);
});

test("a pathspec-free listing takes its extension filter from an imported helper", () => {
  const scanner = guard(
    'import { isHandWrittenSourcePath } from "./source-measure.ts";\n' +
      'git(["ls-files"]).filter(isHandWrittenSourcePath);',
  );
  const measure: CorpusFile = {
    path: "scripts/source-measure.ts",
    text: 'const extensions = new Set([".lean", ".ts"]);',
  };
  assert.equal(
    classifyGuard(
      targetProfile("BpmnSemantics/Execution.lean"),
      scanner,
      indexCorpus([scanner, measure]),
    )?.tier,
    GuardTier.Scanning,
  );
});

test("a directory read scans the tree its path literal names", () => {
  const scanner = guard(
    'const root = "examples/temporal-mvp";\nconst names = await readdir(root);',
  );
  assert.deepEqual(classify("examples/temporal-mvp/new.json", scanner), {
    tier: GuardTier.Scanning,
    evidence: {
      kind: EvidenceKind.Scan,
      enumeration: EnumerationKind.DirectoryRead,
      scope: 'root "examples/temporal-mvp"',
      via: null,
    },
  });
  assert.equal(classify("scenarios/a/b.json", scanner)?.tier, undefined);
});

test("a glob scans the tree its pattern covers", () => {
  const scanner = guard('const files = globSync(["showcase/*/src/**/*.ts"]);');
  assert.equal(classify("showcase/m1/src/run.ts", scanner)?.tier, GuardTier.Scanning);
  assert.equal(classify("platform/apps/web/src/main.ts", scanner), null);
});

test("a tree word without any enumeration is only a mention however prominent", () => {
  const prose = guard(
    'const registries = ["profiles", "scenarios"] as const;\nassert.deepEqual(registries, expected);',
  );
  assert.equal(classify("scenarios/a/b.json", prose)?.tier, GuardTier.Mention);
});

test("enumeration syntax inside a string or a comment is not an enumeration", () => {
  const quoted = guard(
    'const snippet = "await readdir(root)";\n// readdir(scenarios) is how the loader works\nconst root = "scenarios";',
  );
  assert.equal(classify("scenarios/a/b.json", quoted)?.tier, GuardTier.Mention);
});

test("an enumeration only in an imported helper counts when its enumerating name is imported", () => {
  const helper: CorpusFile = {
    path: "scripts/lister.ts",
    text: [
      'import { readdir } from "node:fs/promises";',
      'export function listScenarios(): Promise<string[]> {',
      '  return readdir("scenarios");',
      "}",
      "export function pureHelper(value: string): string {",
      "  return value;",
      "}",
    ].join("\n"),
  };
  const importsEnumerator = guard(
    'import { listScenarios } from "./lister.ts";',
    "scripts/enumerating.test.ts",
  );
  const importsPureOnly = guard(
    'import { pureHelper } from "./lister.ts";',
    "scripts/pure.test.ts",
  );
  const target = targetProfile("scenarios/a/b.json");
  const index = indexCorpus([helper, importsEnumerator, importsPureOnly]);
  assert.deepEqual(classifyGuard(target, importsEnumerator, index)?.evidence, {
    kind: EvidenceKind.Scan,
    enumeration: EnumerationKind.DirectoryRead,
    scope: 'root "scenarios"',
    via: "scripts/lister.ts",
  });
  assert.equal(classifyGuard(target, importsPureOnly, index), null);
});

test("a same-file callee carries its enumeration to the exported caller", () => {
  const helper: CorpusFile = {
    path: "scripts/lister.ts",
    text: [
      "async function walk(root: string): Promise<string[]> {",
      "  return readdir(root);",
      "}",
      "export async function listTree(): Promise<string[]> {",
      '  return walk("scenarios");',
      "}",
    ].join("\n"),
  };
  const consumer = guard('import { listTree } from "./lister.ts";');
  assert.equal(
    classifyGuard(targetProfile("scenarios/a/b.json"), consumer, indexCorpus([helper, consumer]))?.tier,
    GuardTier.Scanning,
  );
});

test("a namespace import reaches every enumeration of the helper", () => {
  const helper: CorpusFile = {
    path: "scripts/lister.ts",
    text: 'export function a(): unknown { return readdir("scenarios"); }',
  };
  const consumer = guard('import * as lister from "./lister.ts";');
  assert.equal(
    classifyGuard(targetProfile("scenarios/a/b.json"), consumer, indexCorpus([helper, consumer]))?.tier,
    GuardTier.Scanning,
  );
});

test("a named binding outranks a scanning one for the same guard", () => {
  const both = guard(
    'import { x } from "../src/runtime.ts";\nconst names = readdir("packages/core/src");',
    "packages/core/test/runtime.test.ts",
  );
  assert.equal(classify("packages/core/src/runtime.ts", both)?.tier, GuardTier.Named);
});

test("evidence reads back as the reason a reader can check", () => {
  assert.equal(
    describeEvidence({ kind: EvidenceKind.Text, term: "runtime.ts" }),
    'matched "runtime.ts"',
  );
  assert.equal(
    describeEvidence({ kind: EvidenceKind.Import, via: null }),
    "imports the target",
  );
  assert.equal(
    describeEvidence({ kind: EvidenceKind.Import, via: "scripts/a.ts" }),
    'imports via "scripts/a.ts"',
  );
  assert.equal(
    describeEvidence({
      kind: EvidenceKind.Scan,
      enumeration: EnumerationKind.GitListing,
      scope: 'pathspec "*.lean"',
      via: null,
    }),
    'git ls-files, pathspec "*.lean"',
  );
  assert.equal(
    describeEvidence({
      kind: EvidenceKind.Scan,
      enumeration: EnumerationKind.DirectoryRead,
      scope: 'root "scenarios"',
      via: "scripts/lister.ts",
    }),
    'directory read, root "scenarios", enumerated in "scripts/lister.ts"',
  );
});

test("source containing astral characters keeps literals and comments aligned", () => {
  const scanner = guard(
    '// 🔥 comment with an astral character\nconst label = "🔥🔥";\nconst names = await readdir("scenarios");',
  );
  assert.deepEqual(classify("scenarios/a/b.json", scanner)?.evidence, {
    kind: EvidenceKind.Scan,
    enumeration: EnumerationKind.DirectoryRead,
    scope: 'root "scenarios"',
    via: null,
  });
});

test("a template root with a leading dynamic part still scopes the tree it joins", () => {
  const scanner = guard(
    "const names = await readdir(`${projectRoot}/scenarios`);\n" +
      "const nested = globSync(`${tree}/src/**/*.ts`);",
  );
  assert.equal(classify("scenarios/a/b.json", scanner)?.tier, GuardTier.Scanning);
  assert.equal(classify("packages/core/src/run.ts", scanner)?.tier, GuardTier.Scanning);
});

test("an imported name that merely starts with a keyword does not widen the import", () => {
  const helper: CorpusFile = {
    path: "scripts/lister.ts",
    text: [
      "export function exportedPure(): string {",
      '  return "pure";',
      "}",
      "export function listScenarios(): unknown {",
      '  return readdir("scenarios");',
      "}",
    ].join("\n"),
  };
  const consumer = guard('import { exportedPure } from "./lister.ts";');
  assert.equal(
    classifyGuard(targetProfile("scenarios/a/b.json"), consumer, indexCorpus([helper, consumer])),
    null,
  );
});

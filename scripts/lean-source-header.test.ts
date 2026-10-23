/**
 * The Lean header parser every import-reading guard shares.
 *
 * The oracle is the pinned toolchain's header grammar (Lean v4.34.1,
 * `src/lean/Lean/Parser/Module/Syntax.lean`): an optional `module`, an optional `prelude`, then imports of
 * the form `[public] [meta] import [all] <ident>`. A form outside it must fail closed, so a guard never
 * reads a module-system file as having fewer imports than Lean builds.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { leanDeclarationPrefix, leanHeader } from "./lean-source-analysis.ts";

test("reads every module-system import form with its visibility, and where the header ends", () => {
  const source = [
    "module",
    "",
    "prelude",
    "public import Init.Core",
    "-- import Commented.Out",
    "meta import Lean.Parser.Extra",
    "import all BpmnSemantics.Hidden",
    "public meta import all BpmnSemantics.Both",
    "import BpmnSemantics.Private",
    "",
    "/-! Module document. -/",
    "public section",
    "def value := 1",
  ].join("\n");
  const header = leanHeader(source);
  assert.equal(header.isModule, true);
  assert.deepEqual(header.imports, [
    { module: "Init.Core", line: 4, isPublic: true, isMeta: false, importsAll: false },
    { module: "Lean.Parser.Extra", line: 6, isPublic: false, isMeta: true, importsAll: false },
    { module: "BpmnSemantics.Hidden", line: 7, isPublic: false, isMeta: false, importsAll: true },
    { module: "BpmnSemantics.Both", line: 8, isPublic: true, isMeta: true, importsAll: true },
    { module: "BpmnSemantics.Private", line: 9, isPublic: false, isMeta: false, importsAll: false },
  ]);
  assert.equal(source.slice(0, header.endOffset).endsWith("import BpmnSemantics.Private"), true);
});

test("reads a plain header and ends it at the first command", () => {
  const header = leanHeader("import BpmnSemantics.A\nimport BpmnSemantics.B\n\nnamespace Example\n");
  assert.equal(header.isModule, false);
  assert.deepEqual(header.imports.map(({ module }) => module), ["BpmnSemantics.A", "BpmnSemantics.B"]);
  assert.deepEqual(leanHeader("/-! Only a document. -/\ndef value := 1\n").imports, []);
});

test("fails closed on an import form outside the header grammar", () => {
  for (const [label, source] of [
    ["import after a command", "import BpmnSemantics.A\ndef value := 1\nimport BpmnSemantics.B\n"],
    ["quoted identifier", "import «BpmnSemantics».A\n"],
    ["missing module name", "public import\n"],
    ["modifier after import", "import public BpmnSemantics.A\n"],
    ["prelude after an import", "import BpmnSemantics.A\nprelude\n"],
  ] as const) {
    assert.throws(() => leanHeader(source), SyntaxError, label);
  }
});

test("declaration prefixes accept every pinned modifier in grammar order and honour exclusions", () => {
  const declaration = new RegExp(`^${leanDeclarationPrefix()}(def|theorem)\\s+(\\S+)`, "u");
  for (const line of [
    "@[expose] public def exposed := 1",
    "public meta def compileTime := 1",
    "private protected noncomputable unsafe partial def everything := 1",
    "@[simp] @[inline]\npublic nonrec theorem stated : True := trivial",
  ]) {
    assert.match(line, declaration, line);
  }
  assert.doesNotMatch("open def := 1", declaration);
  const citable = new RegExp(`^${leanDeclarationPrefix(["private"])}(def|theorem)\\s+(\\S+)`, "u");
  assert.match("public def cited := 1", citable);
  assert.doesNotMatch("private def hidden := 1", citable);
});

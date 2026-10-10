import assert from "node:assert/strict";
import { test } from "node:test";

import { leanDeclarations } from "./lean-declarations.ts";

test("lists each declaration keyword with the name as written", () => {
  const source = [
    "namespace Demo",
    "theorem proved_law : True := trivial",
    "lemma helper_law : True := trivial",
    "def fixture : Nat := 1",
    "abbrev Alias := Nat",
    "inductive Step where | go",
    "structure Record where x : Nat",
    "class Witness (α : Type) where w : α",
    "instance namedInstance : Inhabited Nat := ⟨0⟩",
    "end Demo",
  ].join("\n");

  assert.deepEqual(leanDeclarations(source), [
    { kind: "theorem", name: "proved_law" },
    { kind: "lemma", name: "helper_law" },
    { kind: "def", name: "fixture" },
    { kind: "abbrev", name: "Alias" },
    { kind: "inductive", name: "Step" },
    { kind: "structure", name: "Record" },
    { kind: "class", name: "Witness" },
    { kind: "instance", name: "namedInstance" },
  ]);
});

test("reads declarations behind attributes and visibility modifiers but never private ones", () => {
  const source = [
    "@[simp] theorem simp_law : True := trivial",
    "protected theorem scoped_law : True := trivial",
    "noncomputable def chosen : Nat := 0",
    "@[simp]",
    "theorem split_attribute_law : True := trivial",
    "private theorem supporting_lemma : True := trivial",
    "@[simp] private theorem private_simp_lemma : True := trivial",
  ].join("\n");

  assert.deepEqual(
    leanDeclarations(source).map(({ name }) => name),
    ["simp_law", "scoped_law", "chosen", "split_attribute_law"],
  );
});

test("ignores keywords inside comments and strings and anonymous instances", () => {
  const source = [
    "/-- theorem doc_comment_law : True -/",
    "-- theorem line_comment_law : True",
    "/-! theorem module_doc_law : True -/",
    "def message : String := \"first line",
    "theorem string_law : True",
    "last line\"",
    "instance : Inhabited Nat := ⟨0⟩",
    "theorem real_law : True := trivial",
  ].join("\n");

  assert.deepEqual(leanDeclarations(source), [
    { kind: "def", name: "message" },
    { kind: "theorem", name: "real_law" },
  ]);
});

test("an aggregation module that only imports and re-exports declares nothing", () => {
  const source = [
    "import BpmnSemantics.Alpha",
    "import BpmnSemantics.Beta",
    "",
    "/-! # Aggregate",
    "",
    "Collects the family. -/",
  ].join("\n");

  assert.deepEqual(leanDeclarations(source), []);
});

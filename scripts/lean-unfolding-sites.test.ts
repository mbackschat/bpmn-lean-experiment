import assert from "node:assert/strict";
import test from "node:test";

import { leanUnfoldingSites } from "./lean-unfolding-sites.ts";

test("lists every tactic and equation-lemma site that unfolds a definition", () => {
  const source = [
    "theorem a : True := by",
    "  unfold applyStep? at h",
    "  simp only [Execution.applyStep?, List.map] at h",
    "  rw [",
    "    applyStep?]",
    "  exact (applyStep?.eq_def _).symm ▸ trivial",
    "  simp [applyStep?.eq_1]",
    "theorem b : True := by",
    "  have := applyStep? state op",
    "  simp [applyStepTwice?]",
    "  -- unfold applyStep?",
    "  exact trivial",
  ].join("\n");
  assert.deepEqual(leanUnfoldingSites([{ path: "BpmnSemantics/A.lean", source }], "applyStep?"), [
    "BpmnSemantics/A.lean:2 unfold",
    "BpmnSemantics/A.lean:3 simp",
    "BpmnSemantics/A.lean:5 rw",
    "BpmnSemantics/A.lean:6 equation lemma",
    "BpmnSemantics/A.lean:7 equation lemma",
  ]);
});

test("a qualified query matches the declaration's own name", () => {
  const source = "theorem c : True := by\n  dsimp [SemanticProcess.applyStep?]\n";
  assert.deepEqual(
    leanUnfoldingSites([{ path: "BpmnSemantics/C.lean", source }], "BpmnSemantics.SemanticProcess.applyStep?"),
    ["BpmnSemantics/C.lean:2 dsimp"],
  );
});

test("a proof that unfolds a caller unfolds the changed definition through it", () => {
  const definitions = [
    "def applyStep? (state : Nat) : Option Nat := some state",
    "",
    "private def frontier (state : Nat) : List Nat :=",
    "  (applyStep? state).toList",
    "",
    "def unrelated : Nat := 0",
    "",
    "def outer (state : Nat) : List Nat := frontier state",
  ].join("\n");
  const proof = "theorem d : True := by\n  simp [frontier, unrelated]\n  unfold applyStep?\n  simp [outer]\n";
  assert.deepEqual(
    leanUnfoldingSites([
      { path: "BpmnSemantics/Definitions.lean", source: definitions },
      { path: "BpmnSemantics/Proof.lean", source: proof },
    ], "applyStep?"),
    ["BpmnSemantics/Proof.lean:2 simp via frontier", "BpmnSemantics/Proof.lean:3 unfold"],
  );
});

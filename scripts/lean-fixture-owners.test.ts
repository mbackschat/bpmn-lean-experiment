import assert from "node:assert/strict";
import test from "node:test";

import { importAllLines, namePrefixes, ownerReport, plainProbeVariant, unfoldedNames } from "./lean-fixture-owners.ts";

// A plain file loads the private part of its whole import closure (Lean v4.34.1 `src/lean/Lean/Elab/Import.lean:150-156`),
// so the probe sees every body; a `set_option` lasts to the end of its section or namespace, so it goes before both.
test("the probe variant is the module as a plain file with diagnostics for every declaration", () => {
  const text = [
    "module", "", "public import Pkg.A", "import all Pkg.B", "meta import Pkg.C", "", "/-! Doc. -/", "",
    "@[expose] public section", "namespace N", "def x := 1", "end N", "public section", "end",
  ].join("\n");
  assert.equal(plainProbeVariant(text), [
    "", "import Pkg.A", "import Pkg.B", "import Pkg.C",
    "set_option diagnostics true", "set_option diagnostics.threshold 0", "", "/-! Doc. -/", "",
    "section", "namespace N", "def x := 1", "end N", "section", "end",
  ].join("\n"));
});

// The `privateEquations` helpers refuse a definition whose body is exposed (BpmnSemantics/PrivateEquationLemmas.lean), and
// a plain file exposes every body, so the probe of any module calling them failed (scratch kernel repair, 2026-10-31).
// They only keep generated lemmas out of the interface and never change what a proof reduces, so the probe blanks them,
// continuation lines included.
test("the probe variant blanks the private-equation helper calls a plain file would refuse", () => {
  const text = [
    "module", "", "public import Pkg.A", "meta import BpmnSemantics.PrivateEquationLemmas", "",
    "run_meta privateEquations `Pkg #[`a,", "  `b]", "", "run_meta privateMatchEquations `Pkg #[`c] (congruence := true)",
    "public section", "theorem t : True := trivial", "end",
  ].join("\n");
  assert.equal(plainProbeVariant(text), [
    "", "import Pkg.A", "import BpmnSemantics.PrivateEquationLemmas",
    "set_option diagnostics true", "set_option diagnostics.threshold 0", "",
    "", "", "", "", "section", "theorem t : True := trivial", "end",
  ].join("\n"));
});

test("the unfolded names are every kernel and reduction count, without the inaccessible-name mark", () => {
  const output = [
    "info: F.lean:3:0: [reduction] unfolded declarations (max: 3, num: 2):",
    "  [reduction] Nat.add ↦ 3",
    "  [reduction] helper ↦ 1",
    "[kernel] unfolded declarations (max: 9, num: 2):",
    "  [kernel] List.rec ↦ 9",
    "  [kernel] Pkg.matcher.match_1✝ ↦ 2",
    "  use `set_option diagnostics.threshold <num>` to control threshold for reporting counters",
  ].join("\n");
  assert.deepEqual(unfoldedNames(output), ["List.rec", "Nat.add", "Pkg.matcher.match_1", "helper"]);
});

// Lean prints a name relative to the namespaces enclosing the declaration and the namespaces it opens.
test("names resolve against every enclosing and opened namespace", () => {
  const text = ["namespace A.B", "open C", "open D.E F", "namespace G", "end G", "end A.B"].join("\n");
  assert.deepEqual(namePrefixes(text), ["A.", "A.B.", "A.B.C.", "A.B.D.E.", "A.B.F.", "A.B.G.", "A.C.", "A.D.E.", "A.F.", "C.", "D.E.", "F."]);
});

test("the owner report keeps owners other than the module itself, sorted, and the names it could not place", () => {
  const output = ["MATCHED 3 of 5", "UNMATCHED pure", "OWNER Pkg.Z 2", "OWNER Pkg.A 1", "OWNER Self 4", "UNMATCHED local"].join("\n");
  assert.deepEqual(ownerReport(output, "Self"), { owners: ["Pkg.A", "Pkg.Z"], unmatched: ["local", "pure"] });
  assert.throws(() => ownerReport("error: unknown module", "Self"), /owner query/u);
  assert.equal(importAllLines(["Pkg.A", "Pkg.Z"]), "import all Pkg.A\nimport all Pkg.Z");
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  leanBodyEditBounds, leanBodyEditDefaultBound, leanExposedDefinitionAllowance, leanFanoutBounds, leanFanoutDefaultBound, leanFanoutKernel,
  leanHiddenEditBounds, leanHiddenEditDefaultBound, leanHiddenRewriteBounds, leanOpeningImportBound, leanOwnerDecidedRises,
} from "./lean-fanout-bounds.ts";
import {
  leanBodyEditFanouts, leanExposedDefinitions, leanFanouts, leanFanoutViolations, leanHiddenEditFanouts,
  leanHiddenRewrites, leanLibraryModules, leanOpeningImportLines, brokenDebtRecords, needlessRaises, parseRealizedLeaks, settledOwnerDecisions,
  unexplainedAllowanceRises, unexplainedBoundRises, undecidedSettingRises, type LeanFanoutBound,
} from "./lean-fanout.ts";
import { worktreeLeanSourceFiles } from "./lean-source-analysis.ts";
import { readWorktreeSources } from "./worktree-source-read.ts";

const source = (path: string, header: string) => ({ path, source: `${header}\n\ndef value : Nat := 0\n` });
const realizedLeaks = parseRealizedLeaks(readFileSync(new URL("./lean-realized-leaks.tsv", import.meta.url), "utf8"));

test("a direct import of any form depends on the imported module", () => {
  const fanouts = leanFanouts([
    source("Pkg/Kernel.lean", "module"),
    source("Pkg/Public.lean", "module\n\npublic import Pkg.Kernel"),
    source("Pkg/Private.lean", "module\n\nimport Pkg.Kernel"),
    source("Pkg/All.lean", "module\n\nimport all Pkg.Kernel"),
  ]);
  assert.deepEqual(fanouts.get("Pkg.Kernel"), ["Pkg.All", "Pkg.Private", "Pkg.Public"]);
});

test("propagation continues through public imports and stops at a private one", () => {
  const fanouts = leanFanouts([
    source("Pkg/Kernel.lean", "module"),
    source("Pkg/Reexport.lean", "module\n\npublic import Pkg.Kernel"),
    source("Pkg/Hide.lean", "module\n\nimport Pkg.Kernel"),
    source("Pkg/ViaReexport.lean", "module\n\nimport Pkg.Reexport"),
    source("Pkg/ViaHide.lean", "module\n\npublic import Pkg.Hide"),
  ]);
  assert.deepEqual(fanouts.get("Pkg.Kernel"), ["Pkg.Hide", "Pkg.Reexport", "Pkg.ViaReexport"]);
});

// Locks the leak the modularity closure review found: `ProfileShapeCatalog` imports the family's admission module
// privately, and its `import all` importers rebuilt on an interface edit the private import was assumed to stop.
test("an `import all` importer loads the private imports of what it opens, along `import all` chains", () => {
  const fanouts = leanFanouts([
    source("Pkg/Kernel.lean", "module"),
    source("Pkg/Hide.lean", "module\n\nimport Pkg.Kernel"),
    source("Pkg/Opens.lean", "module\n\nimport all Pkg.Hide"),
    source("Pkg/OpensOpener.lean", "module\n\nimport all Pkg.Opens"),
    source("Pkg/AboveOpener.lean", "module\n\npublic import Pkg.Opens"),
    source("Pkg/Plainly.lean", "module\n\nimport Pkg.Hide"),
    source("Pkg/HideTwice.lean", "module\n\nimport Pkg.Hide"),
    source("Pkg/OpensTwice.lean", "module\n\nimport all Pkg.HideTwice"),
  ]);
  assert.deepEqual(fanouts.get("Pkg.Kernel"), ["Pkg.Hide", "Pkg.Opens", "Pkg.OpensOpener"]);
});

// The same probe's two remaining rebuilds carried only `public meta import`s: compile-time code loads the compiled
// form of the whole import closure, private links included.
test("a `meta import` importer loads the whole import closure of what it imports", () => {
  const fanouts = leanFanouts([
    source("Pkg/Kernel.lean", "module"),
    source("Pkg/Hide.lean", "module\n\nimport Pkg.Kernel"),
    source("Pkg/HideTwice.lean", "module\n\nimport Pkg.Hide"),
    source("Pkg/Meta.lean", "module\n\npublic meta import Pkg.HideTwice"),
  ]);
  assert.deepEqual(fanouts.get("Pkg.Kernel"), ["Pkg.Hide", "Pkg.Meta"]);
});

// Lake mixes an exported meta import's whole closure into the importing module's public import trace (Lake v4.34.1
// Build/Module.lean:366-374), so the modules loading a `public meta import` re-exporter load that closure too.
test("an exported `meta import` re-exports the whole import closure of what it imports", () => {
  const fanouts = leanFanouts([
    source("Pkg/Kernel.lean", "module"),
    source("Pkg/Hide.lean", "module\n\nimport Pkg.Kernel"),
    source("Pkg/Meta.lean", "module\n\npublic meta import Pkg.Hide"),
    source("Pkg/AboveMeta.lean", "module\n\nimport Pkg.Meta"),
    source("Pkg/PrivateMeta.lean", "module\n\nmeta import Pkg.Hide"),
    source("Pkg/AbovePrivateMeta.lean", "module\n\nimport Pkg.PrivateMeta"),
  ]);
  assert.deepEqual(fanouts.get("Pkg.Kernel"), ["Pkg.AboveMeta", "Pkg.Hide", "Pkg.Meta", "Pkg.PrivateMeta"]);
});

// Locks the leak the first family-shape measurement found (pinned container, 2026-10-26): `simp only
// [operationWellFormed]` in nine `import all` importers exported the hidden body's equation lemmas, so a body edit
// changed each importer's public `.olean` and rebuilt everything loading it, while `unfold` left it unchanged.
test("a hidden edit also reaches the loaders of an `import all` importer that rewrites with a hidden definition", () => {
  const module = (path: string, text: string) => ({ path, source: `module\n\n${text}\n` });
  const fanouts = leanHiddenEditFanouts([
    module("Pkg/Hub.lean", "public section\n\nnamespace Hub\n\ndef hidden : Nat := 0\n\n@[expose] def shown : Nat := 0\n\nend Hub\n\nend"),
    module("Pkg/Simp.lean", "import all Pkg.Hub\n\nopen Hub\n\ntheorem t : hidden = 0 := by simp only [hidden]"),
    module("Pkg/AboveSimp.lean", "import Pkg.Simp"),
    module("Pkg/Rw.lean", "import all Pkg.Hub\n\ntheorem t : Hub.hidden = 0 := by\n  rw [Hub.hidden]"),
    module("Pkg/AboveRw.lean", "import Pkg.Rw"),
    module("Pkg/Unfolds.lean", "import all Pkg.Hub\n\nopen Hub\n\ntheorem t : hidden = 0 := by unfold hidden; rfl"),
    module("Pkg/AboveUnfolds.lean", "import Pkg.Unfolds"),
    module("Pkg/Shown.lean", "import all Pkg.Hub\n\nopen Hub\n\ntheorem t : shown = 0 := by simp [shown]"),
    module("Pkg/AboveShown.lean", "import Pkg.Shown"),
  ]);
  assert.deepEqual(fanouts.get("Pkg.Hub"), ["Pkg.AboveRw", "Pkg.AboveSimp", "Pkg.Rw", "Pkg.Shown", "Pkg.Simp", "Pkg.Unfolds"]);
});

test("each rewrite with a hidden definition of an `import all` import is one recorded site", () => {
  const module = (path: string, text: string) => ({ path, source: `module\n\n${text}\n` });
  const rewrites = leanHiddenRewrites([
    module("Pkg/Hub.lean", "public section\n\ndef hidden : Nat := 0\n\n@[expose] def shown : Nat := 0\n\nend"),
    module("Pkg/Simp.lean", "import all Pkg.Hub\n\ntheorem t : hidden = 0 := by simp only [hidden]\ntheorem u : hidden = 0 := by rw [hidden]"),
    module("Pkg/Unfolds.lean", "import all Pkg.Hub\n\ntheorem t : hidden = 0 := by unfold hidden; rfl"),
    module("Pkg/Shown.lean", "import all Pkg.Hub\n\ntheorem t : shown = 0 := by simp [shown]"),
    module("Pkg/Plainly.lean", "import Pkg.Hub\n\ntheorem t : shown = 0 := by simp [hidden]"),
  ]);
  assert.deepEqual(rewrites.get("Pkg.Simp"), ["Pkg.Hub.hidden", "Pkg.Hub.hidden"]);
  assert.deepEqual([...rewrites].filter(([, sites]) => sites.length > 0).map(([module]) => module), ["Pkg.Simp"]);
});

// Lean resolves a rewrite argument to a binder of the enclosing declaration before a global constant, so a hypothesis
// or a projection of a local value that shares a hidden definition's name realizes nothing; counting those names made
// the model report 1,787 sites where DumpLeaks found 33 leaking definitions (container build, 2026-10-28).
test("a binder of the enclosing declaration, or a projection of one, is no rewrite site", () => {
  const module = (path: string, text: string) => ({ path, source: `module\n\n${text}\n` });
  const rewrites = leanHiddenRewrites([
    module("Pkg/Hub.lean", "public section\n\ndef admitted : Bool := true\n\ndef completion : Nat := 0\n\nend"),
    module("Pkg/Local.lean", [
      "import all Pkg.Hub",
      "",
      "theorem bound (admitted : 1 = 1) : True := by simp [admitted]",
      "theorem projected (pair : Nat × Nat) : True := by",
      "  obtain ⟨completion, _⟩ := pair",
      "  simp [pair.completion, completion]",
      "theorem continued (pair : Nat × Nat × Nat) : True := by",
      "  rcases pair with ⟨first, second,",
      "    completion⟩",
      "  rename_i other",
      "    admitted",
      "  simp [completion, admitted, congrArg completion rfl]",
      "theorem real : admitted = true := by simp [admitted]",
      "theorem called : True := by",
      "  change (do let result ← admitted; pure result) = _",
      "  simp [admitted]",
    ].join("\n")),
  ]);
  // `let result ← admitted` binds `result`, so the second `simp [admitted]` is a site as well.
  assert.deepEqual(rewrites.get("Pkg.Local"), ["Pkg.Hub.admitted", "Pkg.Hub.admitted"]);
});

// `grind [f]` and `unfold` of a recursive `f` realize equation lemmas as `simp [f]` does: such sites left 49 library
// modules exporting a hidden body (DumpLeaks over the pinned container build, 2026-10-27).
test("a grind argument and an unfold of a recursive hidden definition are rewrite sites", () => {
  const module = (path: string, text: string) => ({ path, source: `module\n\n${text}\n` });
  const hub = "public section\n\ndef flat : Nat := 0\n\ndef count : List Nat → Nat\n  | [] => 0\n  | _ :: rest => count rest + 1\n\nend";
  const rewrites = leanHiddenRewrites([
    module("Pkg/Hub.lean", hub),
    module("Pkg/Grind.lean", "import all Pkg.Hub\n\ntheorem t : flat = 0 := by grind [flat]"),
    module("Pkg/Recursive.lean", "import all Pkg.Hub\n\ntheorem t : count [] = 0 := by unfold count; rfl"),
    module("Pkg/Flat.lean", "import all Pkg.Hub\n\ntheorem t : flat = 0 := by unfold flat; rfl"),
  ]);
  assert.deepEqual([...rewrites].filter(([, sites]) => sites.length > 0), [["Pkg.Grind", ["Pkg.Hub.flat"]], ["Pkg.Recursive", ["Pkg.Hub.count"]]]);
});

// A qualified argument names only the definitions whose full name ends with it; `simp` unfolds a reducible definition
// without equation lemmas (Lean/Meta/Tactic/Simp/SimpTheorems.lean:534), while `rw` and `grind` request them
// regardless (Lean/Elab/Tactic/Rewrite.lean:93, Lean/Meta/Tactic/Grind/Theorems.lean:150).
// Lean resolves a written name against the enclosing namespaces and the opened ones, so a name another module's
// definition only shares the last component with is no site of that definition.
test("an argument names only the definitions it resolves to, and simp realizes nothing for a reducible one", () => {
  const module = (path: string, text: string) => ({ path, source: `module\n\n${text}\n` });
  const hub = "public section\n\nnamespace Pkg.Patch\n\ndef apply : Nat := 0\n\n@[reducible] def shallow : Nat := 0\n\nend Pkg.Patch";
  const rewrites = leanHiddenRewrites([
    module("Pkg/Hub.lean", hub),
    module("Pkg/Other.lean", "import all Pkg.Hub\n\ntheorem t : True := by simp [Prepared.apply]"),
    module("Pkg/Same.lean", "import all Pkg.Hub\n\nnamespace Pkg\n\ntheorem t : True := by simp [Patch.apply]\n\nend Pkg"),
    module("Pkg/Unresolved.lean", "import all Pkg.Hub\n\nopen Other in\ntheorem t : True := by simp [apply]"),
    module("Pkg/Short.lean", "import all Pkg.Hub\n\nopen Pkg.Patch in\ntheorem t : True := by simp [apply]"),
    module("Pkg/SimpReducible.lean", "import all Pkg.Hub\n\ntheorem t : True := by simp only [Pkg.Patch.shallow]"),
    module("Pkg/RwReducible.lean", "import all Pkg.Hub\n\ntheorem t : True := by rw [Pkg.Patch.shallow]; trivial"),
    module("Pkg/GrindReducible.lean", "import all Pkg.Hub\n\ntheorem t : True := by grind [Pkg.Patch.shallow]"),
  ]);
  assert.deepEqual([...rewrites].filter(([, sites]) => sites.length > 0), [
    ["Pkg.Same", ["Pkg.Hub.apply"]],
    ["Pkg.Short", ["Pkg.Hub.apply"]],
    ["Pkg.RwReducible", ["Pkg.Hub.shallow"]],
    ["Pkg.GrindReducible", ["Pkg.Hub.shallow"]],
  ]);
});

// `privateEquations` declares a definition's equation lemmas as ordinary private declarations, which Lean reuses
// instead of realizing exported ones (BpmnSemantics/PrivateEquationLemmas.lean); a functional induction principle it
// does not declare is still realized and exported.
test("a rewrite with a definition whose equation lemmas the module declares privately is no rewrite site", () => {
  const module = (path: string, text: string) => ({ path, source: `module\n\n${text}\n` });
  const hub = "public section\n\nnamespace Pkg\n\ndef hidden : Nat := 0\n\ndef other : Nat := 0\n\nend Pkg";
  const rewrites = leanHiddenRewrites([
    module("Pkg/Hub.lean", hub),
    module("Pkg/Declared.lean", [
      "import all Pkg.Hub",
      "",
      "run_meta privateEquations `Pkg #[`hidden]",
      "theorem t : Pkg.hidden = 0 := by simp only [Pkg.hidden]",
      "theorem u : Pkg.other = 0 := by simp [Pkg.other]",
    ].join("\n")),
    module("Pkg/SplitCall.lean", [
      "import all Pkg.Hub",
      "",
      "run_meta privateEquations `Pkg #[`hidden,",
      "  `other]",
      "theorem t : Pkg.hidden = Pkg.other := by rw [Pkg.hidden, Pkg.other]",
    ].join("\n")),
    module("Pkg/OtherScope.lean", "import all Pkg.Hub\n\nrun_meta privateEquations `Elsewhere #[`hidden]\ntheorem t : Pkg.hidden = 0 := by simp [Pkg.hidden]"),
    module("Pkg/Induction.lean", [
      "import all Pkg.Hub",
      "",
      "run_meta privateEquations `Pkg #[`hidden]",
      "theorem t : True := by induction 0 using Pkg.hidden.induct <;> trivial",
    ].join("\n")),
  ]);
  assert.deepEqual([...rewrites].filter(([, sites]) => sites.length > 0), [
    ["Pkg.Declared", ["Pkg.Hub.other"]],
    ["Pkg.OtherScope", ["Pkg.Hub.hidden"]],
    ["Pkg.Induction", ["Pkg.Hub.hidden"]],
  ]);
});

// `privateEquations` declares the lemmas `getEqnsFor?` and `getUnfoldEqnFor?` return: `eq_1`… always, `eq_def` only for a
// recursive definition (Lean v4.34.1 Meta/Eqns.lean:307-312) and never `eq_unfold`, so a named lemma it leaves out is
// still realized and exported.
test("a named equation lemma that `privateEquations` does not declare stays a rewrite site", () => {
  const module = (path: string, text: string) => ({ path, source: `module\n\n${text}\n` });
  const hub = "public section\n\nnamespace Pkg\n\ndef hidden : Nat := 0\n\ndef rec : Nat → Nat\n  | 0 => 0\n  | n + 1 => rec n\n\nend Pkg";
  const declaring = (path: string, name: string, lemma: string) => module(path, [
    "import all Pkg.Hub",
    "",
    `run_meta privateEquations \`Pkg #[\`${name}]`,
    `theorem t := @Pkg.${name}.${lemma}`,
  ].join("\n"));
  const rewrites = leanHiddenRewrites([
    module("Pkg/Hub.lean", hub),
    declaring("Pkg/EqN.lean", "hidden", "eq_1"),
    declaring("Pkg/EqDef.lean", "hidden", "eq_def"),
    declaring("Pkg/EqUnfold.lean", "hidden", "eq_unfold"),
    declaring("Pkg/RecEqDef.lean", "rec", "eq_def"),
    declaring("Pkg/RecEqUnfold.lean", "rec", "eq_unfold"),
  ]);
  assert.deepEqual([...rewrites].filter(([, sites]) => sites.length > 0), [
    ["Pkg.EqDef", ["Pkg.Hub.hidden"]],
    ["Pkg.EqUnfold", ["Pkg.Hub.hidden"]],
    ["Pkg.RecEqUnfold", ["Pkg.Hub.rec"]],
  ]);
});

// A module that rewrites with its own hidden definition realizes the definition's equation lemmas in itself, and Lean
// v4.34.1 exports every realized constant (Environment.lean:723-724), so its body edit changes its public interface.
test("a module that rewrites with its own hidden definition rebuilds its interface fanout unless it declares the equations privately", () => {
  const module = (path: string, text: string) => ({ path, source: `module\n\n${text}\n` });
  const sources = [
    module("Pkg/Leaks.lean", "public section\n\nnamespace Pkg\n\ndef hidden : Nat := 0\n\ntheorem t : hidden = 0 := by simp [hidden]\n\nend Pkg"),
    module("Pkg/AboveLeaks.lean", "import Pkg.Leaks"),
    module("Pkg/Declares.lean", [
      "public section",
      "",
      "namespace Pkg",
      "",
      "def kept : Nat := 0",
      "",
      "run_meta privateEquations `Pkg #[`kept]",
      "",
      "theorem t : kept = 0 := by simp [kept]",
      "",
      "end Pkg",
    ].join("\n")),
    module("Pkg/AboveDeclares.lean", "import Pkg.Declares"),
  ];
  const fanouts = leanHiddenEditFanouts(sources);
  assert.deepEqual(fanouts.get("Pkg.Leaks"), ["Pkg.AboveLeaks"]);
  assert.deepEqual(fanouts.get("Pkg.Declares"), []);
  assert.deepEqual([...leanHiddenRewrites(sources)].filter(([, sites]) => sites.length > 0), [["Pkg.Leaks", ["Pkg.Leaks.hidden"]]]);
});

test("a hidden edit also reaches each `meta import` importer whose import closure holds the edited module", () => {
  const fanouts = leanHiddenEditFanouts([
    source("Pkg/Hub.lean", "module"),
    source("Pkg/Mid.lean", "module\n\nimport Pkg.Hub"),
    source("Pkg/Meta.lean", "module\n\npublic meta import Pkg.Mid"),
    source("Pkg/AllOfMeta.lean", "module\n\nimport all Pkg.Meta"),
  ]);
  assert.deepEqual(fanouts.get("Pkg.Hub"), ["Pkg.AllOfMeta", "Pkg.Meta"]);
});

// Locks the under-prediction of the depth probe's row 5 (pinned container, 2026-10-30): a private edit changed
// `CompensationTriggerHandlerDeclaration`'s `.ir`, and `ConformanceChecksMain` rebuilt because it imports a module
// that re-exports a `meta import` of the edited module's importers (Lake v4.34.1 Build/Module.lean:366-374).
test("a hidden edit also reaches every module loading a re-exporter of a `public meta import` that reaches it", () => {
  const fanouts = leanHiddenEditFanouts([
    source("Pkg/Hub.lean", "module"),
    source("Pkg/Mid.lean", "module\n\nimport Pkg.Hub"),
    source("Pkg/Meta.lean", "module\n\npublic meta import Pkg.Mid"),
    source("Pkg/AboveMeta.lean", "module\n\nimport Pkg.Meta"),
    source("Pkg/AboveAboveMeta.lean", "module\n\nimport Pkg.AboveMeta"),
    source("Pkg/AllOfAboveMeta.lean", "module\n\nimport all Pkg.AboveMeta"),
    source("Pkg/Reexport.lean", "module\n\npublic import Pkg.Meta"),
    source("Pkg/AboveReexport.lean", "module\n\nimport Pkg.Reexport"),
    source("Pkg/PrivateMeta.lean", "module\n\nmeta import Pkg.Mid"),
    source("Pkg/AbovePrivateMeta.lean", "module\n\nimport Pkg.PrivateMeta"),
  ]);
  assert.deepEqual(fanouts.get("Pkg.Hub"), [
    "Pkg.AboveMeta", "Pkg.AboveReexport", "Pkg.AllOfAboveMeta", "Pkg.Meta", "Pkg.PrivateMeta", "Pkg.Reexport",
  ]);
});

// Lean exports the lemmas it generates for a hidden body, private ones included (Lean v4.34.1 Environment.lean:723),
// so a recorded leak makes the leaking module's public interface follow the owner module's hidden edits (#55).
test("a hidden edit also reaches the public cone of a rebuilt module recorded as leaking the edited module's lemmas", () => {
  const sources = [
    source("Pkg/Hub.lean", "module"),
    source("Pkg/User.lean", "module\n\nimport Pkg.Hub"),
    source("Pkg/Other.lean", "module"),
    source("Pkg/All.lean", "module\n\nimport all Pkg.Hub"),
    source("Pkg/AboveAll.lean", "module\n\nimport Pkg.All"),
    source("Pkg/AllBoth.lean", "module\n\nimport all Pkg.Hub\nimport all Pkg.Other"),
    source("Pkg/AboveAllBoth.lean", "module\n\nimport Pkg.AllBoth"),
  ];
  const leaks = [{ module: "Pkg.All", ownerModule: "Pkg.Hub" }, { module: "Pkg.AllBoth", ownerModule: "Pkg.Other" }];
  assert.deepEqual(leanHiddenEditFanouts(sources, leaks).get("Pkg.Hub"), ["Pkg.AboveAll", "Pkg.All", "Pkg.AllBoth"]);
  assert.deepEqual(leanHiddenEditFanouts(sources, leaks).get("Pkg.Other"), ["Pkg.AboveAllBoth", "Pkg.AllBoth"]);
  assert.deepEqual(leanHiddenEditFanouts(sources, [{ module: "Pkg.Hub", ownerModule: "Pkg.Hub" }]).get("Pkg.Hub"),
    ["Pkg.All", "Pkg.AllBoth", "Pkg.User"]);
});

test("a plain file sees its whole import closure, and its own imports re-export", () => {
  const fanouts = leanFanouts([
    source("Pkg/Kernel.lean", "module"),
    source("Pkg/Hide.lean", "module\n\nimport Pkg.Kernel"),
    source("Pkg/Plain.lean", "import Pkg.Hide"),
    source("Pkg/AbovePlain.lean", "import Pkg.Plain"),
  ]);
  assert.deepEqual(fanouts.get("Pkg.Kernel"), ["Pkg.AbovePlain", "Pkg.Hide", "Pkg.Plain"]);
});

test("a hidden edit follows `import all` chains and reaches plain files, but no other importer", () => {
  const fanouts = leanHiddenEditFanouts([
    source("Pkg/Hub.lean", "module"),
    source("Pkg/Public.lean", "module\n\npublic import Pkg.Hub"),
    source("Pkg/All.lean", "module\n\nimport all Pkg.Hub"),
    source("Pkg/AboveAll.lean", "module\n\npublic import Pkg.All"),
    source("Pkg/AllOfAll.lean", "module\n\nimport all Pkg.All"),
    source("Pkg/Plain.lean", "import Pkg.Public"),
  ]);
  assert.deepEqual(fanouts.get("Pkg.Hub"), ["Pkg.All", "Pkg.AllOfAll", "Pkg.Plain"]);
  assert.deepEqual(fanouts.get("Pkg.All"), ["Pkg.AllOfAll"]);
  assert.deepEqual(fanouts.get("Pkg.Public"), ["Pkg.Plain"]);
});

test("imports outside the scanned sources and import cycles are tolerated", () => {
  const fanouts = leanFanouts([
    source("Pkg/A.lean", "module\n\npublic import Pkg.B\npublic import Lean.Data.Json"),
    source("Pkg/B.lean", "module\n\npublic import Pkg.A"),
  ]);
  assert.deepEqual(fanouts.get("Pkg.A"), ["Pkg.B"]);
  assert.deepEqual(fanouts.get("Pkg.B"), ["Pkg.A"]);
});

test("the library modules are what its root reaches through imports of any form", () => {
  const sources = [
    source("Lib.lean", "import Pkg.Owner"),
    source("Pkg/Owner.lean", "module\n\nimport Pkg.Helper"),
    source("Pkg/Helper.lean", "module"),
    source("Pkg/Witness.lean", "module\n\npublic import Pkg.Owner"),
  ];
  assert.deepEqual([...leanLibraryModules(sources, "Lib")].sort(), ["Pkg.Helper", "Pkg.Owner"]);
});

test("a kernel module is exempt from every bound but must be a scanned module without a recorded bound", () => {
  const fanouts = new Map([["Kernel", ["a", "b", "c"]], ["Wide", ["a", "b", "c"]]]);
  assert.deepEqual(leanFanoutViolations(fanouts, [], 2, ["Kernel"]), [
    "Wide: 3 importers exceed the default bound 2 without a recorded bound",
  ]);
  assert.deepEqual(leanFanoutViolations(fanouts, [{ module: "Kernel", bound: 3 }, { module: "Wide", bound: 3 }], 2, ["Kernel", "Gone"]), [
    "Kernel: a kernel module needs no recorded bound",
    "Gone: declared kernel but not a scanned module",
  ]);
});

test("the ratchet reports growth, an unlisted wide module, a stale entry and an unknown entry", () => {
  const fanouts = new Map([["Wide", ["a", "b", "c"]], ["Grown", ["a", "b", "c"]], ["Narrow", ["a"]], ["Shrunk", ["a"]]]);
  const bounds = [{ module: "Grown", bound: 2 }, { module: "Shrunk", bound: 3 }, { module: "Gone", bound: 3 }];
  assert.deepEqual(leanFanoutViolations(fanouts, bounds, 2), [
    "Grown: 3 importers exceed its recorded bound 2",
    "Shrunk: 1 importers fit the default bound 2, so its entry must go",
    "Gone: recorded but not a scanned module",
    "Wide: 3 importers exceed the default bound 2 without a recorded bound",
  ]);
});

// The ratchet itself: required item 6 of docs/LEAN-BUILD-MODULARITY-PROPOSAL.md. The oracle is the graph scan
// above; it bounds graph shape, so a family-start kernel change needs no exemption.
const librarySources = () =>
  readWorktreeSources(worktreeLeanSourceFiles().filter((path) => path.startsWith("BpmnSemantics/") || !path.includes("/")));

/** Fanouts counting only importers the semantic root builds. */
function semanticLibraryFanouts(sources: ReturnType<typeof librarySources>): Map<string, readonly string[]> {
  const library = leanLibraryModules(sources, "BpmnSemantics");
  return new Map([...leanFanouts(sources)].map(([module, importers]) =>
    [module, importers.filter((importer) => library.has(importer))] as const));
}

// Counts only importers the semantic root builds: witnesses that only the conformance root or a driver imports
// rebuild with a closed-world change by design (the proposal's acceptance), and the hidden-edit ratchet and the
// cost ledger bound them instead.
test("every library module stays within its recorded fanout bound", () => {
  const sources = librarySources();
  const fanouts = semanticLibraryFanouts(sources);
  assert.deepEqual(leanFanoutViolations(fanouts, leanFanoutBounds, leanFanoutDefaultBound, leanFanoutKernel), []);
});

// Anti-vacuity for the headroom: one re-export added to a module nearly every library module imports must still
// fail, because it widens the re-exported module far beyond a tenth.
test("a widely imported module that starts re-exporting another module fails the ratchet", () => {
  const sources = librarySources().map(({ path, source }) => path === "BpmnSemantics/SemanticProcess/JsonSupport.lean"
    ? { path, source: source.replace(/^module\n/u, "module\n\npublic import BpmnSemantics.SemanticProcess.TransitionTrace\n") }
    : { path, source });
  const fanouts = semanticLibraryFanouts(sources);
  const findings = leanFanoutViolations(fanouts, leanFanoutBounds, leanFanoutDefaultBound, leanFanoutKernel);
  assert.ok(findings.some((finding) => finding.startsWith("BpmnSemantics.SemanticProcess.TransitionTrace: ")), findings.join("\n"));
});

// A one-line proof edit to `ProgramStructuralValidation` rebuilt exactly the 264 importers the model's `import all`
// chains predicted, in 42 minutes on one CPU (container probe, 2026-10-25); the rewrite term added since makes the
// bound an over-approximation for proof edits, which export no equation lemmas. These bounds only shrink: by
// replacing an `import all` with a bridge lemma the hub exports, or a kernel-decided witness with an executable check.
test("every library module stays within its recorded hidden-edit fanout bound", () => {
  assert.deepEqual(leanFanoutViolations(leanHiddenEditFanouts(librarySources(), realizedLeaks), leanHiddenEditBounds,
    leanHiddenEditDefaultBound), []);
});

// Item 2 of the build modularity specification forbids `simp [f]` over a hidden `f`, but the hidden-edit fanout already
// counts most such importers' loaders, so only a per-importer site count catches a new rewrite.
test("no importer adds a rewrite with a hidden definition", () => {
  assert.deepEqual(leanFanoutViolations(leanHiddenRewrites(librarySources()), leanHiddenRewriteBounds, 0, [], "rewrite sites"), []);
});

test("one added rewrite with a hidden definition fails the rewrite ratchet", () => {
  const path = "BpmnSemantics/SemanticProcess/ParallelScopeCommandReplay.lean";
  const sources = librarySources().map((file) => file.path === path
    ? { path, source: `${file.source}\ntheorem mutationProbe : True := by simp only [parallelScopeBodyBound]\n` }
    : file);
  const findings = leanFanoutViolations(leanHiddenRewrites(sources), leanHiddenRewriteBounds, 0, [], "rewrite sites");
  assert.ok(findings.some((finding) => finding.startsWith("BpmnSemantics.SemanticProcess.ParallelScopeCommandReplay: ")), findings.join("\n"));
});

// The owner direction of the build modularity specification: ordinary edits never rebuild the library. Its first
// closure bounded interface and hidden-edit fanouts but no body edit of an exposed module, so 988 exposed files made
// every such edit an interface edit (Finding 83). The oracle is a container probe: a body edit to `NestedScopeData`
// rebuilt exactly the 61 modules of its public cone one target loads, which this model predicts (2026-10-27).
// A rewrite site is the argument list of a rewriting tactic, however it is spelled: a cold review recreated the
// documented 82-module equation-lemma leak with `simp only` and its list on the next line, and with `rw_mod_cast`,
// while every guard stayed green (2026-10-28). Lean puts the configuration and discharger before `only` (`Init/Tactics.lean:685`), a spelling the HIGH review of the
// conversion found uncounted (2026-10-29). `dsimp [f]` only marks `f` to unfold and realizes no equation lemma
// (`Lean/Elab/Tactic/Simp.lean:281-282`), so its lists are no sites.
test("every spelling of a rewrite argument list, and a local simp attribute, is a rewrite site, and a term's list is not", () => {
  const module = (path: string, text: string) => ({ path, source: `module\n\n${text}\n` });
  const proofs = [
    "by simp only\n    [hidden]",
    "by rw_mod_cast [hidden]",
    "by push_cast [hidden]",
    "by simp [↓ hidden]",
    "by simp [← hidden]",
    "by grind [= hidden]",
    "by simp [foo (bar [1, 2]), hidden]",
    "by simp (config := {}) [hidden]",
    "by nth_rewrite 2 [hidden]",
    "by simp +contextual [hidden]",
    "by simp_all only [hidden]",
    "by simp +contextual only [hidden]",
    "by simp (config := {}) only [hidden]",
    "by simp (disch := omega) only [hidden]",
    "by simp_all +arith only [hidden]",
    // A named equation lemma realizes itself, whichever tactic names it.
    "by dsimp only [hidden.eq_1]",
  ];
  const rewrites = leanHiddenRewrites([
    module("Pkg/Hub.lean", "public section\n\ndef hidden : Nat := 0\n\nend"),
    module("Pkg/Proofs.lean", ["import all Pkg.Hub", "",
      ...proofs.map((proof, at) => `theorem t${at} : hidden = 0 := ${proof}`),
      "attribute [local simp] hidden",
      "theorem ascribed (n : Nat) : (hidden n : Nat) = 0 := by simp [hidden]",
      "theorem inBinder (n : Nat) (h : (hidden n : Nat) = 0) : True := by simp [hidden] at h",
      "theorem aliased : True := by simp [(hidden ·), @hidden]",
      "def listed : List Nat := [hidden]",
      // A list a term applies a function to realizes nothing.
      "theorem applied : True := by have := List.length [hidden]; trivial",
      "theorem handed : withHandlers [hidden] = 0 := rfl",
      "theorem unfoldedOnly : hidden = 0 := by dsimp only [hidden]",
      "theorem unfoldedWithFlags : hidden = 0 := by dsimp +instances only [hidden]"].join("\n")),
  ]);
  assert.equal(rewrites.get("Pkg.Proofs")!.length, proofs.length + 5);
});

test("a body edit rebuilds an exposed module's public cone but only a hidden module's `import all` loaders", () => {
  const sources = [
    { path: "Pkg/Exposed.lean", source: "module\n\n@[expose] public section\n\ndef value : Nat := 0\n\nend\n" },
    { path: "Pkg/Hidden.lean", source: "module\n\npublic section\n\ndef value : Nat := 0\n\nend\n" },
    { path: "Pkg/Shown.lean", source: "module\n\npublic section\n\n@[expose] def value : Nat := 0\n\nend\n" },
    { path: "Pkg/Importer.lean", source: "module\n\npublic import Pkg.Exposed\npublic import Pkg.Hidden\npublic import Pkg.Shown\n" },
    { path: "Pkg/Above.lean", source: "module\n\npublic import Pkg.Importer\n" },
    { path: "Pkg/Opener.lean", source: "module\n\nimport all Pkg.Hidden\n" },
  ];
  const fanouts = leanBodyEditFanouts(sources);
  assert.deepEqual(fanouts.get("Pkg.Exposed"), ["Pkg.Above", "Pkg.Importer"]);
  assert.deepEqual(fanouts.get("Pkg.Hidden"), ["Pkg.Opener"]);
  // A definition exposed on its own leaves the module's other bodies hidden and is named instead.
  assert.deepEqual(fanouts.get("Pkg.Shown"), []);
  assert.deepEqual(leanExposedDefinitions(sources).get("Pkg.Shown"), ["value"]);
  assert.deepEqual(leanExposedDefinitions(sources).get("Pkg.Hidden"), []);
});

// The scanner follows Lean v4.34.1's own rules, so no spelling of an exposure escapes it: `sectionHeader` takes
// `@[expose]? public? noncomputable? meta?` (Lean/Parser/Command.lean:308), every `section`, `namespace` and `mutual`
// scope inherits its parent's attributes and `end Name` closes one scope per name component
// (Lean/Elab/BuiltinCommand.lean:45-70), and a non-Prop `instance` is exposed by default
// (Lean/Elab/MutualDef.lean:1349). A cold review found each of these spellings reported as hidden (2026-10-28).
test("every spelling Lean exposes a body by is an exposure", () => {
  const module = (path: string, text: string) => ({ path, source: `module\n\n${text}\n` });
  const sources = [
    module("Pkg/Noncomputable.lean", "@[expose] public noncomputable section\n\ndef value : Nat := 0\n\nend"),
    module("Pkg/Meta.lean", "@[expose] public noncomputable meta section\n\ndef value : Nat := 0"),
    module("Pkg/Nested.lean", "@[expose] public section\n\nsection Bodies\n\ndef value : Nat := 0"),
    module("Pkg/Namespaced.lean", "@[expose] public section\n\nnamespace A.B\n\nend A.B\n\nnamespace C\n\ndef value : Nat := 0\n\nend C"),
    module("Pkg/AfterMutual.lean", "@[expose] public section\n\nmutual\ndef even : Nat → Bool\n  | _ => true\nend\n\ndef value : Nat := 0"),
    module("Pkg/Hidden.lean", "public section\n\nnamespace A\n\nend A\n\ndef value : Nat := 0\n\nend"),
    module("Pkg/Importer.lean", [
      "Noncomputable", "Meta", "Nested", "Namespaced", "AfterMutual", "Hidden"].map((name) => `public import Pkg.${name}`).join("\n")),
    module("Pkg/Above.lean", "public import Pkg.Importer"),
  ];
  const fanouts = leanBodyEditFanouts(sources);
  for (const name of ["Noncomputable", "Meta", "Nested", "Namespaced", "AfterMutual"]) {
    assert.deepEqual(fanouts.get(`Pkg.${name}`), ["Pkg.Above", "Pkg.Importer"], name);
  }
  assert.deepEqual(fanouts.get("Pkg.Hidden"), []);
});

test("an `@[expose]` on its own line and a non-Prop instance expose one definition each", () => {
  const sources = [{ path: "Pkg/Shown.lean", source: [
    "module", "", "public section", "",
    "/-- documented -/", "@[expose]", "def shown : Nat := 0", "",
    "@[simp]", "def hidden : Nat := 0", "",
    "instance instShown : Inhabited Nat := ⟨0⟩", "",
    "instance : Repr Unit := ⟨fun _ _ => \"()\"⟩", "",
    "private instance : Inhabited Unit := ⟨()⟩", "", "end", ""].join("\n") }];
  assert.deepEqual(leanExposedDefinitions(sources).get("Pkg.Shown"), ["instShown", "instance : Repr Unit", "shown"]);
});

// An anonymous instance is named by its class alone, so the allowance can list it: a name taken from the header's first
// line kept binder text, or nothing when the class followed on a later line (2026-10-29).
test("an anonymous instance is named by its class, without binders, across header lines", () => {
  const sources = [{ path: "Pkg/Shown.lean", source: [
    "module", "", "public section", "",
    "instance (n : Nat) [Inhabited Unit] {α : Type} (h : (n, n) = (n, n)) : Repr (Fin n) := ⟨fun _ _ => \"\"⟩", "",
    "instance (priority := low) (n : Nat) :", "    Decidable (n = n)", "    := isTrue rfl", "",
    "instance (n : Nat) : Inhabited", "    (Fin (n + 1)) where", "  default := 0", "", "end", ""].join("\n") }];
  assert.deepEqual(leanExposedDefinitions(sources).get("Pkg.Shown"),
    ["instance : Decidable (n = n)", "instance : Inhabited (Fin (n + 1))", "instance : Repr (Fin n)"]);
});

// `@[no_expose]` hides a body Lean would expose by default, an abbrev's or a non-Prop instance's as well as a def's in an
// `@[expose]` section (Lean 4.34.1 Elab/MutualDef.lean:1381-1384); counting those as exposed listed hidden instances in
// the allowance (2026-10-29).
test("`@[no_expose]` hides an instance, an abbrev, and a def in an `@[expose]` section", () => {
  const module = (path: string, text: string) => ({ path, source: `module\n\n${text}\n` });
  const sources = [
    module("Pkg/Hub.lean", [
      "public section", "", "@[no_expose] instance : Decidable (1 = 1) := inferInstance", "",
      "@[no_expose]", "abbrev quiet : Nat := 0", "", "abbrev loud : Nat := 0", "", "end", "",
      "@[expose] public section", "", "@[no_expose] def inner : Nat := 0", "", "def outer : Nat := 0", "", "end"].join("\n")),
    module("Pkg/Uses.lean", "import all Pkg.Hub\n\ntheorem t : inner = quiet := by rw [inner, outer, quiet, loud]"),
  ];
  assert.deepEqual(leanExposedDefinitions(sources).get("Pkg.Hub"), ["loud"]);
  assert.deepEqual(leanHiddenRewrites(sources).get("Pkg.Uses"), ["Pkg.Hub.inner", "Pkg.Hub.quiet"]);
});

// An indented command is still a command, and attributes and modifiers may span lines before their keyword; a cold
// review hid exposures behind each (2026-10-28).
test("indented commands and attributes or modifiers split across lines expose as Lean reads them", () => {
  const module = (path: string, text: string) => ({ path, source: `module\n\n${text}\n` });
  const sources = [
    module("Pkg/Indented.lean", "@[expose] public section\n\n  section Inner\n  end Inner\n\ndef value : Nat := 0"),
    module("Pkg/Split.lean", "public section\n\n@[simp,\n  expose]\ndef split : Nat := 0\n\n@[expose] public\ndef modifier : Nat := 0\n\n  @[expose] def indented : Nat := 0\n\nend"),
    module("Pkg/Importer.lean", "public import Pkg.Indented"),
  ];
  assert.deepEqual(leanBodyEditFanouts(sources).get("Pkg.Indented"), ["Pkg.Importer"]);
  assert.deepEqual(leanExposedDefinitions(sources).get("Pkg.Split"), ["indented", "modifier", "split"]);
});

test("a section header Lean's grammar does not admit fails closed", () => {
  assert.throws(() => leanBodyEditFanouts([{ path: "Pkg/Odd.lean", source: "module\n\npublic @[expose] section\n" }]),
    /unrecognized section header/u);
});

// Bounds only shrink, and a module may keep an exposed body only through a recorded entry whose reason the bounds
// file states; kernel type modules are exempt as for the interface ratchet.
test("every module's body edit stays within its recorded body-edit bound", () => {
  assert.deepEqual(leanFanoutViolations(leanBodyEditFanouts(librarySources(), realizedLeaks), leanBodyEditBounds,
    leanBodyEditDefaultBound, leanFanoutKernel, "body-edit importers"), []);
});

// Anti-vacuity: re-exposing one hidden hub must fail in every spelling, as the original conversion's blanket exposure
// would have.
test("re-exposing a hidden hub's bodies fails the body-edit ratchet in every spelling", () => {
  const path = "BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean";
  for (const header of ["@[expose] public section", "@[expose] public noncomputable section",
    "@[expose] public meta section", "@[expose] public section\n\nsection Bodies"]) {
    const sources = librarySources().map((file) => file.path === path
      ? { path, source: file.source.replace(/^public section$/mu, header) }
      : file);
    const findings = leanFanoutViolations(leanBodyEditFanouts(sources, realizedLeaks), leanBodyEditBounds, leanBodyEditDefaultBound,
      leanFanoutKernel, "body-edit importers");
    assert.ok(findings.some((finding) => finding.startsWith("BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle: ")), header);
  }
});

// Each individually exposed body in a module whose interface edit rebuilds more than the body-edit default is an
// interface edit by necessity, so the allowance names it; a name no longer exposed must leave the allowance.
test("every exposed definition of a wide module is named in the reviewed allowance", () => {
  const sources = librarySources();
  const interfaceFanouts = leanFanouts(sources);
  const kernel = new Set(leanFanoutKernel);
  const findings: string[] = [];
  for (const [module, names] of leanExposedDefinitions(sources)) {
    const allowed = new Set(leanExposedDefinitionAllowance[module]?.names ?? []);
    if (!kernel.has(module) && (interfaceFanouts.get(module)?.length ?? 0) > leanBodyEditDefaultBound) {
      for (const name of names) if (!allowed.has(name)) findings.push(`${module}.${name}: exposed without an allowance entry`);
    }
    for (const name of allowed) if (!names.includes(name)) findings.push(`${module}.${name}: allowed but no longer exposed, so its entry must go`);
  }
  for (const module of Object.keys(leanExposedDefinitionAllowance)) {
    if (!interfaceFanouts.has(module)) findings.push(`${module}: allowance names no scanned module`);
  }
  assert.deepEqual(findings, []);
});

// A bound raised to fit the graph instead of root-causing the growth protects nothing: the hidden-edit bounds of an
// uncommitted conversion were regenerated from a graph 10,830 `import all` lines heavier than needed before anyone asked
// why (process ledger, Finding 84). A rise above a base commit therefore states its reason in the entry, which the review
// packet shows the reviewer; the string itself proves nothing.
test("a bound or allowance above a base commit's needs a stated reason", () => {
  const previous = [{ module: "Pkg.Hub", bound: 40 }, { module: "Pkg.Wide", bound: 30 }];
  const current = [
    { module: "Pkg.Hub", bound: 40 },
    { module: "Pkg.Wide", bound: 31 },
    { module: "Pkg.New", bound: 12 },
    { module: "Pkg.Explained", bound: 50, raised: "fixture reduces the body (probe 2026-10-28)", raisedFrom: 40 },
    { module: "Pkg.Shrunk", bound: 9 },
  ];
  assert.deepEqual(unexplainedBoundRises(previous, current, 10), [
    "Pkg.Wide: bound 31 exceeds the base's 30 without a stated reason and the bound it rose from",
    "Pkg.New: bound 12 exceeds the base's 10 without a stated reason and the bound it rose from",
  ]);
  assert.deepEqual(unexplainedBoundRises([{ module: "Pkg.Hub", bound: 40 }], [{ module: "Pkg.Hub", bound: 41, raised: " " }], 10),
    ["Pkg.Hub: bound 41 exceeds the base's 40 without a stated reason and the bound it rose from"], "a blank reason states nothing");
  assert.deepEqual(unexplainedAllowanceRises({ "Pkg.Hub": { names: ["kept"] } }, {
    "Pkg.Hub": { names: ["kept", "added"] },
    "Pkg.New": { names: ["first"] },
    "Pkg.Explained": { names: ["first"], raised: "a Decidable instance reduces it" },
  }), [
    "Pkg.Hub: allows added beyond the base without a stated reason",
    "Pkg.New: allows first beyond the base without a stated reason",
  ]);
});

// A stated reason records why a bound rose and, in `raisedFrom`, the bound it rose from. A regression's reason goes
// once the bound falls back to `raisedFrom`; judging that against base commits instead erased every reason the moment
// its branch merged, while the bounds stayed high (cold review, 2026-10-28).
test("a stated reason needs the bound it rose from, and goes once the bound falls back to it", () => {
  assert.deepEqual(unexplainedBoundRises([], [
    { module: "Pkg.Unanchored", bound: 40, raised: "a reason without its starting bound" },
    { module: "Pkg.Anchored", bound: 40, raised: "a reason", raisedFrom: 30 },
  ], 10), ["Pkg.Unanchored: bound 40 exceeds the base's 10 without a stated reason and the bound it rose from"]);
  assert.deepEqual(needlessRaises([
    { module: "Pkg.Back", bound: 30, raised: "shrunk back by the conversion", raisedFrom: 30 },
    { module: "Pkg.Still", bound: 31, raised: "still above", raisedFrom: 30 },
    { module: "Pkg.Unanchored", bound: 31, raised: "no starting bound" },
  ]), ["Pkg.Back", "Pkg.Unanchored"]);
});

// A debt record must not vanish while its bound stays high, nor start from an invented bound: either would hide a
// regression the base still shows (cold review, 2026-10-28).
test("a debt record stays until its bound falls back, and starts from the base's bound", () => {
  const previous = [{ module: "Pkg.Debt", bound: 40, raised: "known regression", raisedFrom: 30 }, { module: "Pkg.Old", bound: 20 }];
  assert.deepEqual(brokenDebtRecords(previous, [
    { module: "Pkg.Debt", bound: 40 },
    { module: "Pkg.Old", bound: 25, raised: "rose again", raisedFrom: 22 },
  ], 10), [
    "Pkg.Debt: drops the record of its rise from 30 while its bound stays at 40",
    "Pkg.Old: records a rise from 22, but the base's bound is 20",
  ]);
  assert.deepEqual(brokenDebtRecords(previous, [
    { module: "Pkg.Debt", bound: 30 },
    { module: "Pkg.Old", bound: 25, raised: "rose again", raisedFrom: 20 },
  ], 10), []);
});

// A module the base already records as risen may rise further: its debt still starts where the main line's bound was,
// so the base's own `raisedFrom` carries on, but the further rise states its own reason. Requiring the base's current
// bound as `raisedFrom` made a rise that both base commits judge impossible to record (2026-10-29).
test("a further rise keeps the debt record's start and states its own reason", () => {
  const previous = [{ module: "Pkg.Debt", bound: 40, raised: "known regression", raisedFrom: 30 }];
  assert.deepEqual(brokenDebtRecords(previous, [{ module: "Pkg.Debt", bound: 50, raised: "a second cause", raisedFrom: 30 }], 10), []);
  assert.deepEqual(brokenDebtRecords(previous, [{ module: "Pkg.Debt", bound: 50, raised: "known regression", raisedFrom: 30 }], 10), [
    "Pkg.Debt: rises further from 40 to 50 with the reason of its earlier rise",
  ]);
  assert.deepEqual(brokenDebtRecords(previous, [{ module: "Pkg.Debt", bound: 50, raised: "a second cause", raisedFrom: 40 }], 10), [
    "Pkg.Debt: drops the record of its rise from 30 while its bound stays at 50",
  ]);
});

// A default or total rises only by an owner decision, recorded in its own commit before the rise, so that an agent
// cannot approve its own rise in the commit making it (owner decision B, 2026-10-29).
test("a default or total rises only to the extent an owner decision committed before the rise allows", () => {
  const decision = { setting: "leanOpeningImportBound", from: 100, to: 500, decision: "Owner decision X (2026-10-29): why" };
  assert.deepEqual(undecidedSettingRises([
    ["leanOpeningImportBound", 100, 400],
    ["leanFanoutDefaultBound", 100, 110],
  ], [decision], [decision]), [
    "leanFanoutDefaultBound: 110 exceeds the base's 100; a default or total rises only by owner decision",
  ]);
  assert.deepEqual(undecidedSettingRises([["leanOpeningImportBound", 100, 600]], [decision], [decision]), [
    "leanOpeningImportBound: 600 exceeds the base's 100 beyond the owner decision's 500",
  ]);
  assert.deepEqual(undecidedSettingRises([["leanOpeningImportBound", 200, 400]], [decision], [decision]), [
    "leanOpeningImportBound: 400 exceeds the base's 200; a default or total rises only by owner decision",
  ]);
  assert.deepEqual(undecidedSettingRises([["leanOpeningImportBound", 100, 400]], [decision], []), [
    "leanOpeningImportBound: the owner decision for its rise from 100 must be committed before the rise",
  ]);
  assert.deepEqual(undecidedSettingRises([["leanOpeningImportBound", 100, 400]], [{ ...decision, decision: " " }],
    [{ ...decision, decision: " " }]), [
    "leanOpeningImportBound: 400 exceeds the base's 100; a default or total rises only by owner decision",
  ]);
});

test("an owner decision goes once the main line carries its rise", () => {
  const decision = { setting: "leanOpeningImportBound", from: 100, to: 500, decision: "Owner decision X (2026-10-29): why" };
  assert.deepEqual(settledOwnerDecisions([decision], { leanOpeningImportBound: 100 }), []);
  assert.deepEqual(settledOwnerDecisions([decision], {}), []);
  assert.deepEqual(settledOwnerDecisions([decision], { leanOpeningImportBound: 500 }), [
    "leanOpeningImportBound: the main line already carries the owner decision's 500, so its record must go",
  ]);
});

test("every recorded owner decision is still needed", async () => {
  const mainLine = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { encoding: "utf8" }).trim();
  assert.deepEqual(settledOwnerDecisions(leanOwnerDecidedRises, await committedBounds(mainLine)), []);
});

/** The commits a rise is judged against: the last commit, and the merge base with `origin/main`, so the check still holds once the rise is committed. */
function baseCommits(): string[] {
  const mergeBase = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { encoding: "utf8" }).trim();
  return [...new Set(["HEAD", mergeBase])];
}

async function committedBounds(commit: string) {
  const committed = execFileSync("git", ["show", `${commit}:scripts/lean-fanout-bounds.ts`], { encoding: "utf8" });
  const file = path.join(mkdtempSync(path.join(tmpdir(), "lean-fanout-bounds-")), "lean-fanout-bounds.ts");
  writeFileSync(file, committed);
  return import(pathToFileURL(file).href);
}

test("no recorded bound, allowance or kernel entry rises above a base commit's without a stated reason", async () => {
  const committedDecisions = (await committedBounds("HEAD")).leanOwnerDecidedRises ?? [];
  for (const commit of baseCommits()) {
    const previous = await committedBounds(commit);
    const findings = [
      ...unexplainedBoundRises(previous.leanFanoutBounds, leanFanoutBounds, previous.leanFanoutDefaultBound),
      ...unexplainedBoundRises(previous.leanHiddenEditBounds, leanHiddenEditBounds, previous.leanHiddenEditDefaultBound),
      ...unexplainedBoundRises(previous.leanHiddenRewriteBounds, leanHiddenRewriteBounds, 0),
      ...brokenDebtRecords(previous.leanFanoutBounds, leanFanoutBounds, previous.leanFanoutDefaultBound),
      ...brokenDebtRecords(previous.leanHiddenEditBounds, leanHiddenEditBounds, previous.leanHiddenEditDefaultBound),
      ...brokenDebtRecords(previous.leanHiddenRewriteBounds, leanHiddenRewriteBounds, 0),
      // A ratchet's first recording is its baseline, so a ratchet the base lacks has nothing to rise above.
      ...(previous.leanBodyEditBounds === undefined ? []
        : unexplainedBoundRises(previous.leanBodyEditBounds, leanBodyEditBounds, previous.leanBodyEditDefaultBound)),
      ...(previous.leanExposedDefinitionAllowance === undefined ? []
        : unexplainedAllowanceRises(previous.leanExposedDefinitionAllowance, leanExposedDefinitionAllowance)),
      ...leanFanoutKernel.filter((module) => !previous.leanFanoutKernel.includes(module))
        .map((module) => `${module}: joins the kernel, which exempts it from every bound; only an owner decision adds one`),
    ];
    findings.push(...undecidedSettingRises([
      ["leanFanoutDefaultBound", previous.leanFanoutDefaultBound, leanFanoutDefaultBound],
      ["leanHiddenEditDefaultBound", previous.leanHiddenEditDefaultBound, leanHiddenEditDefaultBound],
      ["leanBodyEditDefaultBound", previous.leanBodyEditDefaultBound ?? leanBodyEditDefaultBound, leanBodyEditDefaultBound],
      ["leanOpeningImportBound", previous.leanOpeningImportBound ?? leanOpeningImportBound, leanOpeningImportBound],
    ], leanOwnerDecidedRises, committedDecisions));
    assert.deepEqual(findings, [], commit);
  }
});

test("no stated reason outlives the rise it explains", () => {
  const findings = [leanFanoutBounds, leanHiddenEditBounds, leanHiddenRewriteBounds, leanBodyEditBounds]
    .flatMap((bounds) => needlessRaises(bounds)).map((module) => `${module}: its stated reason outlives the rise, so it must go`);
  assert.deepEqual(findings, []);
});

// `import all` and `meta import` open a module's hidden part, so every such line widens what a body edit of the opened
// module rebuilds. The library held 13,002 `import all` lines on 2026-10-28 where its builds needed far fewer, because a
// repair added the whole import closure and its trimming step was never run; the total may only shrink, without stale
// headroom.
test("the library's opening imports stay within their recorded total, without stale headroom", () => {
  const count = leanOpeningImportLines(librarySources());
  assert.ok(count <= leanOpeningImportBound, `${count} opening imports exceed the recorded ${leanOpeningImportBound}`);
  assert.ok(leanOpeningImportBound - count <= 50,
    `the recorded ${leanOpeningImportBound} leaves more than 50 lines of headroom over ${count}; lower it`);
});

test("an `import all` or `meta import` line counts once per importing module, and a plain or public import not at all", () => {
  assert.equal(leanOpeningImportLines([
    { path: "Pkg/A.lean", source: "module\n\nimport all Pkg.B\npublic import Pkg.C\nimport Pkg.D\nmeta import Pkg.F\n" },
    { path: "Pkg/E.lean", source: "module\n\nimport all Pkg.B\nimport all Pkg.C\n" },
  ]), 4);
});

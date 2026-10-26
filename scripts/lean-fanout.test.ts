import assert from "node:assert/strict";
import test from "node:test";

import {
  leanFanoutBounds, leanFanoutDefaultBound, leanFanoutKernel, leanHiddenEditBounds, leanHiddenEditDefaultBound,
} from "./lean-fanout-bounds.ts";
import { leanFanouts, leanFanoutViolations, leanHiddenEditFanouts, leanLibraryModules } from "./lean-fanout.ts";
import { worktreeLeanSourceFiles } from "./lean-source-analysis.ts";
import { readWorktreeSources } from "./worktree-source-read.ts";

const source = (path: string, header: string) => ({ path, source: `${header}\n\ndef value : Nat := 0\n` });

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

test("a hidden edit also reaches each `meta import` importer whose import closure holds the edited module", () => {
  const fanouts = leanHiddenEditFanouts([
    source("Pkg/Hub.lean", "module"),
    source("Pkg/Mid.lean", "module\n\nimport Pkg.Hub"),
    source("Pkg/Meta.lean", "module\n\npublic meta import Pkg.Mid"),
    source("Pkg/AllOfMeta.lean", "module\n\nimport all Pkg.Meta"),
  ]);
  assert.deepEqual(fanouts.get("Pkg.Hub"), ["Pkg.AllOfMeta", "Pkg.Meta"]);
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

// A one-line proof edit to `ProgramStructuralValidation` rebuilt exactly the 264 importers this model predicted,
// in 42 minutes on one CPU (container probe, 2026-10-25), so these bounds only shrink: by replacing an
// `import all` with a bridge lemma the hub exports, or a kernel-decided witness with an executable check.
test("every library module stays within its recorded hidden-edit fanout bound", () => {
  assert.deepEqual(leanFanoutViolations(leanHiddenEditFanouts(librarySources()), leanHiddenEditBounds, leanHiddenEditDefaultBound), []);
});

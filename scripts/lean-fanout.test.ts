import assert from "node:assert/strict";
import test from "node:test";

import { leanFanoutBounds, leanFanoutDefaultBound, leanHiddenEditBounds, leanHiddenEditDefaultBound } from "./lean-fanout-bounds.ts";
import { leanFanouts, leanFanoutViolations, leanHiddenEditFanouts } from "./lean-fanout.ts";
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

test("every library module stays within its recorded fanout bound", () => {
  assert.deepEqual(leanFanoutViolations(leanFanouts(librarySources()), leanFanoutBounds, leanFanoutDefaultBound), []);
});

// A one-line proof edit to `ProgramStructuralValidation` rebuilt exactly the 264 importers this model predicted,
// in 42 minutes on one CPU (container probe, 2026-10-25), so these bounds only shrink: by replacing an
// `import all` with a bridge lemma the hub exports, or a kernel-decided witness with an executable check.
test("every library module stays within its recorded hidden-edit fanout bound", () => {
  assert.deepEqual(leanFanoutViolations(leanHiddenEditFanouts(librarySources()), leanHiddenEditBounds, leanHiddenEditDefaultBound), []);
});

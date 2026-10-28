import assert from "node:assert/strict";
import test from "node:test";

import { droppedTargets, importAllSearch, importAllTargets, importAllVariant } from "./lean-import-all-minimize.ts";

/** Drives the search against a compile oracle that succeeds exactly when every needed line is kept. */
function minimize(candidates: string[], needed: ReadonlySet<string>): { kept: string[]; compiles: number } {
  const search = importAllSearch(candidates);
  let compiles = 0;
  let step = search.next();
  while (!step.done) {
    compiles += 1;
    step = search.next([...needed].every((name) => step.value!.includes(name)));
  }
  return { kept: [...step.value].sort(), compiles };
}

test("the search keeps exactly the needed lines, in fewer compiles than one per candidate", () => {
  const candidates = Array.from({ length: 64 }, (_, index) => `M${index}`);
  assert.deepEqual(minimize(candidates, new Set()), { kept: [], compiles: 1 });
  const result = minimize(candidates, new Set(["M3", "M40", "M63"]));
  assert.deepEqual(result.kept, ["M3", "M40", "M63"]);
  assert.ok(result.compiles < candidates.length, `${result.compiles} compiles`);
  assert.deepEqual(minimize(["A"], new Set(["A"])).kept, ["A"]);
});

test("a dropped `import all` becomes one plain import unless the module imports its target otherwise", () => {
  const text = ["module", "", "public import Pkg.B", "import all Pkg.A", "import all Pkg.B", "import all Pkg.C", "import all Pkg.C"].join("\n");
  assert.deepEqual(importAllTargets(text), ["Pkg.A", "Pkg.B", "Pkg.C", "Pkg.C"]);
  assert.equal(importAllVariant(text, new Set(["Pkg.A"])),
    ["module", "", "public import Pkg.B", "import all Pkg.A", "import Pkg.C"].join("\n"));
});

// A dropped `import all` kept as a plain import still rebuilds the module on every interface edit of its target, so the
// second phase removes each plain import the module compiles without (cold review, 2026-10-28).
test("the second phase keeps only the plain imports the module compiles without dropping", () => {
  const text = ["module", "", "import all Pkg.A", "import all Pkg.B", "import all Pkg.C"].join("\n");
  assert.equal(importAllVariant(text, new Set(["Pkg.A"]), new Set(["Pkg.C"])),
    ["module", "", "import all Pkg.A", "import Pkg.C"].join("\n"));
  assert.deepEqual(droppedTargets(text, new Set(["Pkg.A"])), ["Pkg.B", "Pkg.C"]);
  assert.deepEqual(droppedTargets(["module", "", "public import Pkg.B", "import all Pkg.B"].join("\n"), new Set()), []);
});

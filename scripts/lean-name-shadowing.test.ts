import assert from "node:assert/strict";
import test from "node:test";

import { leanNameShadowings } from "./lean-name-shadowing.ts";
import { worktreeLeanSourceFiles } from "./lean-source-analysis.ts";
import { readWorktreeSources } from "./worktree-source-read.ts";

const helper = { path: "Pkg/Helper.lean", source: "module\n\nnamespace Pkg\n\ndef step : Nat := 1\n\nend Pkg\n" };
const other = { path: "Pkg/Other.lean", source: "module\n\nnamespace Other\n\ndef step : Nat := 2\n\nend Other\n" };
const user = {
  path: "Pkg/User.lean",
  source: "module\n\nimport Pkg.Helper\nimport Pkg.Other\n\nnamespace Pkg\nopen Other\n\ndef uses : Nat := step\n\nend Pkg\n",
};

test("an imported namespace declaration that hides an opened one is reported", () => {
  assert.deepEqual(leanNameShadowings([helper, other, user]), [
    { path: "Pkg/User.lean", line: 9, name: "step", resolved: ["Pkg.step"], hidden: ["Other.step"] },
  ]);
});

test("private, unimported, protected, same-file and qualified declarations are not reported", () => {
  const privately = { ...helper, source: helper.source.replace("def step", "private def step") };
  const protectedly = { ...helper, source: helper.source.replace("def step", "protected def step") };
  const unimported = { ...user, source: user.source.replace("import Pkg.Helper\n", "") };
  const qualified = { ...user, source: user.source.replace(":= step", ":= Other.step") };
  const sameFile = { ...user, source: user.source.replace("open Other\n", "open Other\n\ndef step : Nat := 3\n") };
  for (const sources of [[privately, other, user], [protectedly, other, user], [helper, other, unimported],
    [helper, other, qualified], [other, sameFile]]) {
    assert.deepEqual(leanNameShadowings(sources), []);
  }
});

test("`import all` makes an imported private declaration hide an opened one", () => {
  const privately = { ...helper, source: helper.source.replace("def step", "private def step") };
  const opening = { ...user, source: user.source.replace("import Pkg.Helper", "import all Pkg.Helper") };
  assert.deepEqual(leanNameShadowings([privately, other, opening]), [
    { path: "Pkg/User.lean", line: 9, name: "step", resolved: ["Pkg.step"], hidden: ["Other.step"] },
  ]);
});

test("an `end` restores the opens in force before its namespace", () => {
  const closed = { ...user, source: user.source.replace("open Other\n", "section\nopen Other\nend\n") };
  assert.deepEqual(leanNameShadowings([helper, other, closed]), []);
});

// Locks the class the module conversion created: a newly public helper must not change what an existing
// unqualified use means. The oracle is Lean's resolution order, cited in `lean-name-shadowing.ts`.
test("no library declaration hides an opened declaration of the same short name", () => {
  const paths = worktreeLeanSourceFiles().filter((path) => path.startsWith("BpmnSemantics/") || !path.includes("/"));
  assert.deepEqual(leanNameShadowings(readWorktreeSources(paths)), []);
});

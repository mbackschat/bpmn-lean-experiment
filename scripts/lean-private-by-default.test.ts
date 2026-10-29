import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { leanPublicAdditions } from "./lean-private-by-default.ts";
import { worktreeLeanSourceFiles } from "./lean-source-analysis.ts";
import { readWorktreeSources } from "./worktree-source-read.ts";

const module = (path: string, text: string) => ({ path, source: `module\n\npublic section\n\nnamespace Pkg\n\n${text}\n\nend Pkg\n` });

test("a new public declaration that no other module names must be private", () => {
  const current = [module("Pkg/Hub.lean", "theorem added : True := trivial\n\nprivate theorem helper : True := trivial")];
  assert.deepEqual(leanPublicAdditions([], current, current), [
    "Pkg/Hub.lean: Pkg.added is new and public, but no other module names it; declare it private until one does",
  ]);
});

test("another module naming a new declaration, or a public statement of its module, keeps it public", () => {
  const hub = module("Pkg/Hub.lean", [
    "def measure : Nat := 0",
    "def limit : Nat := 1",
    "theorem measure_le : measure ≤ limit := by decide",
    "def helper : Nat := 0",
    "theorem kept : True := by have := helper; trivial",
  ].join("\n\n"));
  const user = module("Pkg/User.lean", "private theorem uses : Pkg.measure_le = Pkg.measure_le := rfl");
  const base = [module("Pkg/Hub.lean", "theorem kept : True := trivial")];
  // `measure_le` is named elsewhere, its statement names `measure` and `limit`; `helper` only serves a proof.
  assert.deepEqual(leanPublicAdditions(base, [hub, user], [hub, user]), [
    "Pkg/Hub.lean: Pkg.helper is new and public, but no other module names it; declare it private until one does",
  ]);
});

test("a statement of an existing public declaration keeps a new declaration it names public", () => {
  const hub = module("Pkg/Hub.lean", "def bound : Nat := 2\n\ntheorem existing : bound = 2 := rfl");
  assert.deepEqual(leanPublicAdditions([module("Pkg/Hub.lean", "theorem existing : True := trivial")], [hub], [hub]), []);
});

test("a moved declaration is not new, and a new name in another namespace is", () => {
  const base = [module("Pkg/Old.lean", "theorem moved : True := trivial\n\ntheorem same : True := trivial")];
  const current = [
    module("Pkg/New.lean", "theorem moved : True := trivial\n\nnamespace Inner\n\ntheorem same : True := trivial\n\nend Inner"),
  ];
  assert.deepEqual(leanPublicAdditions(base, current, current), [
    "Pkg/New.lean: Pkg.Inner.same is new and public, but no other module names it; declare it private until one does",
  ]);
});

test("an instance, an automation attribute and a declaration outside a public section are exempt", () => {
  const current = [{
    path: "Pkg/Hub.lean",
    source: [
      "module",
      "",
      "def outside : Nat := 0",
      "",
      "public section",
      "",
      "instance : Inhabited Nat := ⟨0⟩",
      "",
      "@[simp] theorem simplifies : (0 : Nat) + 0 = 0 := rfl",
      "",
      "@[grind =] theorem grinds : (1 : Nat) + 0 = 1 := rfl",
    ].join("\n"),
  }];
  assert.deepEqual(leanPublicAdditions([], current, current), []);
});

test("a plain file's declarations are public, so a new one no other module names must be private", () => {
  const current = [{ path: "Pkg/Plain.lean", source: "import Pkg.Hub\n\ntheorem plain : True := trivial\n" }];
  assert.deepEqual(leanPublicAdditions([], current, current), [
    "Pkg/Plain.lean: plain is new and public, but no other module names it; declare it private until one does",
  ]);
});

/** The commit new declarations are judged against: the merge base with `origin/main`, as the fan-out ratchet judges rises. */
function baseCommit(): string {
  return git(["merge-base", "HEAD", "origin/main"]).trim();
}

// Each public declaration widens a module's interface, so adding one rebuilds every module loading it; private
// declarations change only the hidden part (owner decision, 2026-10-29). The pinned A12 adoption files are exempt.
test("no declaration added since the merge base with `origin/main` is public before another module names it", () => {
  const base = baseCommit();
  const all = readWorktreeSources(worktreeLeanSourceFiles().filter((path) => !path.startsWith("adoption/")));
  const atBase = new Set(git(["ls-tree", "-r", "--name-only", base]).split("\n").filter((path) => path.endsWith(".lean")));
  const changed = new Set(git(["diff", "--name-only", base, "--", "*.lean"]).split("\n").filter((path) => path !== ""));
  const current = all.filter(({ path }) => changed.has(path) || !atBase.has(path));
  const before = [...changed].filter((path) => atBase.has(path)).map((path) => ({ path, source: git(["show", `${base}:${path}`]) }));
  assert.deepEqual(leanPublicAdditions(before, current, all), []);
});

function git(args: ReadonlyArray<string>): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

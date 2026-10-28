import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  droppedTargets, importAllLevels, importAllSearch, importAllTargets, importAllVariant, leanBuildRoots, leanEnvironment, lostOpens,
  minimizeImportAlls, type MinimizeHost, withImports,
} from "./lean-import-all-minimize.ts";
import { leanHeader } from "./lean-source-analysis.ts";

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
  assert.equal(importAllVariant(["module", "import all Pkg.A", "import all Pkg.A"].join("\n"), new Set(["Pkg.A"])),
    ["module", "import all Pkg.A"].join("\n"));
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

const headers = (texts: Readonly<Record<string, ReadonlyArray<string>>>) =>
  new Map(Object.entries(texts).map(([module, lines]) => [module, leanHeader(lines.join("\n"))]));

// The lattice of `importModulesCore` (Lean v4.34.1 `src/lean/Lean/Environment.lean:2125-2182`): only an opened module's
// private imports load, and a file outside the module system opens everything it reaches.
test("the environment follows Lean's import levels", () => {
  const tree = headers({
    A: ["module", "import all B", "import C"], B: ["module", "import all X", "import Y"], C: ["module", "import Z", "public import P"],
    X: ["module"], Y: ["module"], Z: ["module"], P: ["module"], F: ["import C"],
  });
  assert.deepEqual([...leanEnvironment(tree, "A").opened].sort(), ["B", "X"]);
  assert.deepEqual([...leanEnvironment(tree, "A").loaded].sort(), ["B", "C", "P", "X", "Y"]);
  assert.deepEqual([...leanEnvironment(tree, "F").opened].sort(), ["C", "P", "Z"]);
});

test("the run takes every module whose chains open a named one, after what it opens and with what it imports", () => {
  const tree = headers({
    A: ["module", "import all B"], B: ["module", "import all X"], X: ["module"], C: ["module", "import all X"],
    L: ["module", "import all X", "import H"], H: ["module", "import all C"], P: ["module"],
  });
  assert.deepEqual(importAllLevels(tree, ["X"]), [["X"], ["B", "C"], ["A", "H", "L"]]);
  assert.deepEqual(importAllLevels(tree, ["A", "B"]), [["B"], ["A"]]);
  const after = new Map([...tree, ["B", leanHeader(["module", "import Y"].join("\n"))]]);
  assert.deepEqual(lostOpens(tree, after, "A"), ["X"]);
  assert.equal(withImports(["module", "", "import all Pkg.B -- why", "", "def x := 1"].join("\n"), "all ", ["Pkg.X"]),
    ["module", "", "import all Pkg.B -- why", "import all Pkg.X", "", "def x := 1"].join("\n"));
});

/** The fake tree's import lines, read independently of the script: `[module?, imports with their `all` flag]`. */
function fakeHeader(text: string): { isModule: boolean; imports: Array<{ target: string; all: boolean; isPublic: boolean }> } {
  return {
    isModule: text.startsWith("module"),
    imports: text.split("\n").flatMap((line) => {
      const match = /^(public )?import (all )?(\S+)$/u.exec(line);
      return match === null ? [] : [{ target: match[3]!, all: match[2] !== undefined, isPublic: match[1] !== undefined }];
    }),
  };
}

/**
 * A fake build whose compiler reads each import as it was last built, as Lean reads `.olean` files, and whose build
 * also rebuilds the imports of the modules it builds, as Lake does. A module compiles when it opens every module in
 * `bodies` and loads every module in `declarations`; a file outside the module system loads and opens its whole
 * closure. `statuses` overrides a compile's exit status.
 */
function fakeBuild(root: string, needs: ReadonlyMap<string, Readonly<{ bodies?: string[]; declarations?: string[] }>>,
  statuses: ReadonlyMap<string, string> = new Map()) {
  const read = (module: string) => fakeHeader(readFileSync(path.join(root, `${module}.lean`), "utf8"));
  const built = new Map([...needs.keys()].map((module) => [module, read(module)]));
  const environment = (module: string) => {
    const header = (name: string) => (name === module ? read(module) : built.get(name)) ?? { isModule: true, imports: [] };
    const opened = new Set<string>();
    const loaded = new Set<string>();
    const pending = header(module).imports.map(({ target }) => target);
    if (!header(module).isModule) {
      while (pending.length > 0) {
        const target = pending.pop()!;
        if (!loaded.has(target)) { loaded.add(target); opened.add(target); pending.push(...header(target).imports.map((i) => i.target)); }
      }
      return { opened, loaded };
    }
    const openers = [module];
    for (let index = 0; index < openers.length; index += 1) {
      for (const { target, all } of header(openers[index]!).imports) if (all && !opened.has(target)) { opened.add(target); openers.push(target); }
    }
    const reach = openers.flatMap((opener) => header(opener).imports.map(({ target }) => target));
    while (reach.length > 0) {
      const target = reach.pop()!;
      if (!loaded.has(target)) { loaded.add(target); reach.push(...header(target).imports.filter((i) => i.isPublic).map((i) => i.target)); }
    }
    return { opened, loaded };
  };
  const compiles = (module: string) => {
    const { opened, loaded } = environment(module);
    const need = needs.get(module)!;
    return (need.bodies ?? []).every((target) => opened.has(target)) && (need.declarations ?? []).every((target) => loaded.has(target));
  };
  const closure = (module: string, seen = new Set<string>()): Set<string> => {
    for (const { target } of read(module).imports) if (!seen.has(target)) closure(target, seen.add(target));
    return seen;
  };
  const builds: string[][] = [];
  const host: MinimizeHost = {
    directory: path.join(root, ".minimize"),
    jobPath: (file) => path.join(root, file),
    startWorker: (directory) => {
      const exited = new Promise<number>((resolve) => {
        const timer = setInterval(() => {
          for (const job of readdirSync(path.join(directory, "queue")).filter((name) => name.endsWith(".job"))) {
            const id = job.replace(/\.job$/u, "");
            const module = path.relative(root, readFileSync(path.join(directory, "queue", job), "utf8")).replace(/\.lean$/u, "");
            rmSync(path.join(directory, "queue", job));
            writeFileSync(path.join(directory, "done", `${id}.rc`), statuses.get(module) ?? (compiles(module) ? "0" : "1"));
          }
          if (existsSync(path.join(directory, "stop"))) { clearInterval(timer); resolve(0); }
        }, 2);
      });
      return { exited };
    },
    build: async (modules) => {
      builds.push([...modules]);
      const order: string[] = [];
      const visit = (module: string) => {
        if (order.includes(module)) return;
        for (const { target } of read(module).imports) visit(target);
        order.push(module);
      };
      for (const module of modules) visit(module);
      for (const module of order) {
        if (!compiles(module)) return 1;
        built.set(module, read(module));
      }
      return 0;
    },
  };
  return { host, compiles, closure, builds };
}

/** A tree of one-line-header files, each `module` file ending in one declaration. */
function fakeTree(texts: Readonly<Record<string, ReadonlyArray<string>>>): string {
  const root = mkdtempSync(path.join(tmpdir(), "import-all-minimize-"));
  for (const [module, lines] of Object.entries(texts)) writeFileSync(path.join(root, `${module}.lean`), [...lines, "", "def x := 1"].join("\n"));
  return root;
}

const files = (texts: Readonly<Record<string, unknown>>) => Object.keys(texts).map((module) => `${module}.lean`);
const snapshot = (root: string, names: ReadonlyArray<string>) => names.map((file) => readFileSync(path.join(root, file), "utf8"));

test("a module keeps what its upstream dropped, so every module still compiles after the run", async () => {
  const texts = { A: ["module", "import all B"], B: ["module", "import all X"], X: ["module"] };
  const root = fakeTree(texts);
  const { host, compiles } = fakeBuild(root, new Map([["A", { bodies: ["X"] }], ["B", {}], ["X", {}]]));
  await minimizeImportAlls(root, files(texts), files(texts), host, 2, { libraries: Object.keys(texts), executables: [] });
  assert.ok(["A", "B", "X"].every(compiles));
  assert.deepEqual(snapshot(root, ["A.lean", "B.lean"]),
    [["module", "import all X", "", "def x := 1"].join("\n"), ["module", "", "def x := 1"].join("\n")]);
});

// An opened module's private imports load into its `import all` importers, so dropping one can take declarations,
// not only bodies, from them (Rule 2 review, 2026-10-28).
test("a chain importer keeps the declarations its opened module stopped importing", async () => {
  const texts = { A: ["module", "import all B"], B: ["module", "import all Y"], Y: ["module"] };
  const root = fakeTree(texts);
  const { host, compiles } = fakeBuild(root, new Map([["A", { bodies: ["B"], declarations: ["Y"] }], ["B", {}], ["Y", {}]]));
  await minimizeImportAlls(root, files(texts), ["B.lean"], host, 2, { libraries: Object.keys(texts), executables: [] });
  assert.ok(compiles("A"));
});

// Lake builds a level's imports with it, so a module the level imports must already be final (Rule 2 review).
test("a level's build never compiles a run module that is still waiting for its search", async () => {
  const texts = {
    B: ["module", "import all X"], X: ["module"], C: ["module", "import all B"],
    H: ["module", "import all C"], L: ["module", "import all B", "import H"],
  };
  const root = fakeTree(texts);
  const { host, compiles } = fakeBuild(root, new Map([["B", {}], ["X", {}], ["C", {}], ["H", { bodies: ["X"] }], ["L", {}]]));
  await minimizeImportAlls(root, files(texts), ["B.lean"], host, 2, { libraries: Object.keys(texts), executables: [] });
  assert.ok(["B", "C", "H", "L"].every(compiles));
});

// A file outside the module system loads its whole closure, so it gains a plain import of whatever left it.
test("a file outside the module system keeps its whole import closure", async () => {
  const texts = { F: ["import M"], M: ["module", "import all X"], X: ["module"] };
  const root = fakeTree(texts);
  const { host, compiles, closure } = fakeBuild(root, new Map([["F", { declarations: ["X"] }], ["M", {}], ["X", {}]]));
  await minimizeImportAlls(root, files(texts), ["M.lean"], host, 2, { libraries: Object.keys(texts), executables: [] });
  assert.ok(closure("F").has("X") && compiles("F"));
  assert.deepEqual(snapshot(root, ["F.lean"]), [["import M", "import X", "", "def x := 1"].join("\n")]);
});

// Frozen sources outside the build, such as `adoption/a12/legacy`, are pinned by hash (Rule 2 audit, 2026-10-28).
test("only files the build compiles change, and a file outside the module system gets back only what its imports did not", async () => {
  const texts = { F1: ["import M"], F2: ["import F1"], Legacy: ["import M"], M: ["module", "import all X"], X: ["module"] };
  const root = fakeTree(texts);
  const { host, closure } = fakeBuild(root, new Map([["F1", {}], ["F2", {}], ["Legacy", {}], ["M", {}], ["X", {}]]));
  const legacy = snapshot(root, ["Legacy.lean"]);
  await minimizeImportAlls(root, files(texts), ["M.lean"], host, 2, { libraries: [], executables: ["F2", "X"] });
  assert.deepEqual(snapshot(root, ["Legacy.lean", "F1.lean", "F2.lean"]),
    [...legacy, ["import M", "import X", "", "def x := 1"].join("\n"), ["import F1", "", "def x := 1"].join("\n")]);
  assert.ok(closure("F2").has("X"));
  await assert.rejects(minimizeImportAlls(root, files(texts), ["F1.lean"], host, 2, { libraries: [], executables: ["F2", "X"] }),
    /not a module the build compiles/u);
  assert.ok(!existsSync(path.join(root, ".minimize", "originals")));
});

// Lake builds any module a library root prefixes on request, and `verify.sh` builds such an unimported driver
// (`BpmnSemantics.FixtureBindingJsonMain`; Rule 2 audit, 2026-10-28).
test("a driver no root imports still gets back what it no longer reaches", async () => {
  const texts = { Lib: ["module", "import Lib.M"], "Lib.M": ["module", "import all X"], X: ["module"], "Lib.Driver": ["import Lib.M"] };
  const root = fakeTree(texts);
  const { host, closure } = fakeBuild(root, new Map([["Lib", {}], ["Lib.M", {}], ["X", {}], ["Lib.Driver", {}]]));
  await minimizeImportAlls(root, files(texts), ["Lib.M.lean"], host, 2, { libraries: ["Lib"], executables: [] });
  assert.ok(closure("Lib.Driver").has("X"));
});

test("the build starts from each library's name and each executable's root", () => {
  const lakefile = ['[[lean_lib]]', 'name = "Lib"', '', '[[lean_exe]]', 'name = "tool"', 'root = "Lib.ToolMain"'].join("\n");
  assert.deepEqual(leanBuildRoots(lakefile), { libraries: ["Lib"], executables: ["Lib.ToolMain"] });
  assert.throws(() => leanBuildRoots(['[[lean_lib]]', 'name = "Lib"', 'globs = ["Lib.+"]'].join("\n")), /default roots/u);
  assert.throws(() => leanBuildRoots(['[[lean_lib]]', 'name = "Lib"', 'roots=["Lib.Main"]'].join("\n")), /default roots/u);
});

test("a run changes only import lines of its modules and leaves every other file alone", async () => {
  const texts = { A: ["module", "import all B", "import all Q"], B: ["module", "import all X"], X: ["module"], Q: ["module"], O: ["module", "import Q"] };
  const root = fakeTree(texts);
  const { host } = fakeBuild(root, new Map([["A", { bodies: ["X"] }], ["B", {}], ["X", {}], ["Q", {}], ["O", {}]]));
  const untouched = snapshot(root, ["O.lean", "Q.lean", "X.lean"]);
  await minimizeImportAlls(root, files(texts), ["B.lean"], host, 2, { libraries: Object.keys(texts), executables: [] });
  assert.deepEqual(snapshot(root, ["O.lean", "Q.lean", "X.lean"]), untouched);
  for (const file of ["A.lean", "B.lean"]) {
    assert.deepEqual(readFileSync(path.join(root, file), "utf8").split("\n").filter((line) => !line.startsWith("import ")),
      ["module", "", "def x := 1"]);
  }
  assert.ok(!existsSync(path.join(root, ".minimize", "originals")));
});

test("a known failing module and its importers keep their environment without being compiled or built", async () => {
  const texts = { A: ["module", "import all B"], B: ["module", "import all X"], X: ["module"], D: ["module", "import A"] };
  const root = fakeTree(texts);
  const { host, builds } = fakeBuild(root, new Map([["A", { bodies: ["X", "Never"] }], ["B", {}], ["X", {}], ["D", {}]]));
  await minimizeImportAlls(root, files(texts), files(texts), host, 2, { libraries: Object.keys(texts), executables: [] }, new Set(["A"]));
  assert.deepEqual(importAllTargets(readFileSync(path.join(root, "A.lean"), "utf8")), ["B", "X"]);
  assert.ok(builds.every((modules) => !modules.includes("A") && !modules.includes("D")));
});

async function assertRestoredFailure(texts: Readonly<Record<string, ReadonlyArray<string>>>, named: ReadonlyArray<string>,
  needs: ReadonlyMap<string, Readonly<{ bodies?: string[]; declarations?: string[] }>>, message: RegExp,
  statuses?: ReadonlyMap<string, string>) {
  const root = fakeTree(texts);
  const { host } = fakeBuild(root, needs, statuses);
  const before = snapshot(root, files(texts));
  await assert.rejects(minimizeImportAlls(root, files(texts), named, host, 2, { libraries: Object.keys(texts), executables: [] }), message);
  assert.deepEqual(snapshot(root, files(texts)), before);
  assert.ok(!existsSync(path.join(root, ".minimize", "originals")));
}

test("a run whose import lines would grow restores every file and fails", async () => {
  await assertRestoredFailure({ A1: ["module", "import all B"], A2: ["module", "import all B"], B: ["module", "import all X"], X: ["module"] },
    ["B.lean"], new Map([["A1", { bodies: ["B", "X"] }], ["A2", { bodies: ["B", "X"] }], ["B", {}], ["X", {}]]), /grow/u);
});

test("a compile that neither succeeds nor reports an elaboration error stops and restores the run", async () => {
  await assertRestoredFailure({ A: ["module", "import all X"], X: ["module"] }, ["A.lean"],
    new Map([["A", {}], ["X", {}]]), /status 137/u, new Map([["A", "137"]]));
});

test("a module that does not build before the run stops it before any search", async () => {
  const texts = { A: ["module", "import all X"], X: ["module"] };
  const root = fakeTree(texts);
  const { host } = fakeBuild(root, new Map([["A", { bodies: ["Never"] }], ["X", {}]]));
  const searched = { ...host, startWorker: () => assert.fail("the search started") };
  await assert.rejects(minimizeImportAlls(root, files(texts), ["A.lean"], searched, 2, { libraries: ["A", "X"], executables: [] }),
    /must build before the run/u);
  assert.deepEqual(snapshot(root, files(texts)), [["module", "import all X", "", "def x := 1"].join("\n"), ["module", "", "def x := 1"].join("\n")]);
  assert.ok(!existsSync(path.join(root, ".minimize", "originals")));
});

test("a run refuses `import all` lines it cannot edit and the originals of an interrupted run", async () => {
  await assertRestoredFailure({ A: ["module", "public import all X"], X: ["module"] }, ["A.lean"],
    new Map([["A", {}], ["X", {}]]), /cannot edit/u);
  const texts = { A: ["module", "import all X"], X: ["module"] };
  const root = fakeTree(texts);
  mkdirSync(path.join(root, ".minimize", "originals"), { recursive: true });
  await assert.rejects(minimizeImportAlls(root, files(texts), ["A.lean"], fakeBuild(root, new Map([["A", {}], ["X", {}]])).host, 2, { libraries: ["A", "X"], executables: [] }), /interrupted/u);
});

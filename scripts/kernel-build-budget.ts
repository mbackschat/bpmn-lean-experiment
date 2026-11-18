/**
 * The measured half of guard 15 and the growth probe of guard 22
 * (docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation), for the hosted lanes.
 *
 * `lean` builds a fresh clone of HEAD and fails on a clean executable build above 3 minutes, a body or interface edit of
 * the largest feature or admission module above 30 seconds, or any single module above 30 seconds. It also proves
 * `scripts/kernel-dispatch.lean` against a seeded violation (guard 23), which only a built kernel can show.
 * `growth` copies every feature and admission module three times under renamed namespaces and holds the fourfold kernel
 * to the same bounds: build cost that grows with the code fails here, while the code is still small.
 * `typescript` needs `node_modules`, which the hosted Lean lane does not install, so the runtime lane runs it.
 *
 * Scope: reads the repository and writes only inside one temporary clone, removed on exit; never a repository file.
 * Effect: none on the working tree. Bounds change only by owner decision.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { loadTree, repositoryRoot } from "./kernel-guard-scan.ts";
import { branchCommits, reportLines } from "./kernel-guard-report.ts";

export const budgetSeconds = { cleanBuild: 180, edit: 30, singleModule: 30, typeCheck: 10, tests: 60 } as const;

export type ModuleTime = Readonly<{ module: string; seconds: number }>;

/** Per-module durations from Lake's `Built <module> (<time>)` lines. */
export function moduleTimes(output: string): ModuleTime[] {
  return [...output.matchAll(/Built (Kernel[\w.]*)(?::\w+)? \((\d+(?:\.\d+)?)(ms|s)\)/gu)].map((match) => ({
    module: match[1] ?? "",
    seconds: Number(match[2]) / (match[3] === "ms" ? 1000 : 1),
  }));
}

/** Guard 15: the findings of one build's wall clock and module times. A build that printed no timing fails (guard 23). */
export function buildFindings(label: string, seconds: number, limit: number, modules: readonly ModuleTime[]): string[] {
  const findings: string[] = [];
  if (seconds > limit) findings.push(`G15 ${label}: ${seconds.toFixed(1)} s, above the ${limit} s bound`);
  if (modules.length === 0) findings.push(`G23 ${label}: read no module timings from the build output`);
  for (const { module, seconds: moduleSeconds } of modules) {
    if (moduleSeconds > budgetSeconds.singleModule) findings.push(`G15 ${label}: ${module} took ${moduleSeconds.toFixed(1)} s, above ${budgetSeconds.singleModule} s`);
  }
  return findings;
}

type Lean = (args: readonly string[]) => { status: number; output: string; seconds: number };

function leanIn(directory: string): Lean {
  return (args) => {
    const started = performance.now();
    const result = spawnSync("./scripts/lake.sh", [...args], { cwd: directory, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    return { status: result.status ?? 1, output: `${result.stdout}${result.stderr}`, seconds: (performance.now() - started) / 1000 };
  };
}

function clone(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "kernel-build-budget-"));
  const result = spawnSync("git", ["clone", "--quiet", "--no-hardlinks", repositoryRoot, directory], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`clone failed: ${result.stderr}`);
  return directory;
}

function leanFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".lean"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/** The largest feature or admission source, the module whose edits are the slowest to re-elaborate. */
export function worstModule(directory: string): string {
  const candidates = ["Feature", "Admission"].flatMap((layer) => leanFiles(path.join(directory, "Kernel", layer)));
  if (candidates.length === 0) throw new Error("G23: no feature or admission module to edit");
  const size = (file: string): number => readFileSync(file, "utf8").split("\n").filter((line) => line.trim() !== "").length;
  return candidates.reduce((best, file) => (size(file) > size(best) ? file : best));
}

function edited(file: string, addition: string, action: () => void): void {
  const original = readFileSync(file, "utf8");
  writeFileSync(file, `${original}\n${addition}\n`);
  try {
    action();
  } finally {
    writeFileSync(file, original);
  }
}

const kernelTargets = ["build", "Kernel", "kernelRun"] as const;
// A private declaration leaves the module's public interface unchanged, so only that module rebuilds.
const bodyEdit = "private def kernelBudgetProbeBody : Nat := 1";
const interfaceEdit = "def kernelBudgetProbeInterface : Nat := 1";

function measureEdits(lean: Lean, directory: string, label: string): string[] {
  const file = worstModule(directory);
  const findings: string[] = [];
  for (const [kind, addition] of [["body", bodyEdit], ["interface", interfaceEdit]] as const) {
    edited(file, addition, () => {
      const build = lean(kernelTargets);
      if (build.status !== 0) findings.push(`G15 ${label}: ${kind} edit of ${path.basename(file)} failed to build\n${build.output}`);
      console.log(`${label} ${kind} edit of ${path.relative(directory, file)}: ${build.seconds.toFixed(1)} s`);
      findings.push(...buildFindings(`${label} ${kind} edit`, build.seconds, budgetSeconds.edit, moduleTimes(build.output)));
    });
  }
  return findings;
}

function cleanBuild(lean: Lean, label: string): string[] {
  const build = lean(kernelTargets);
  console.log(`${label} clean build: ${build.seconds.toFixed(1)} s, ${moduleTimes(build.output).length} modules`);
  if (build.status !== 0) return [`G15 ${label}: clean build failed\n${build.output}`];
  return buildFindings(`${label} clean build`, build.seconds, budgetSeconds.cleanBuild, moduleTimes(build.output));
}

/** Guard 23: the dispatch scan rejects a match on a guarded type in a module that does not own it, a `Laws` module
 * matching another family's type included, and a hand-written match in the `Laws` module of the type's defining
 * module, whose exemption covers only the lemmas the compiler generates there; it accepts one in a codec submodule.
 * Its guard 9 part rejects a nested and a mutual inductive in an IL module, the OD2 (4) mark on a type other than
 * `Value` with a field nesting outside the admitted arms, and `Value` once its mark is gone, which it reads from the
 * source, so that seed needs no rebuild. */
function proveDispatchScan(lean: Lean, directory: string): string[] {
  const file = path.join(directory, "Kernel", "Feature", "Data.lean");
  // Fully qualified: the seed lands outside the module's namespace, where an unqualified `Element` auto-binds.
  const seeded = "def seededDispatchViolation : Kernel.Element → Nat\n  | .activity .. => 1\n  | _ => 0";
  // A `Laws` module matches only its own family's guarded types: Flow's laws may match `GatewayKind`, never `ScopeKind`.
  const lawsFile = path.join(directory, "Kernel", "Laws", "Flow.lean");
  const seededLaws = "def seededLawsDispatchViolation : Kernel.ScopeKind → Nat\n  | .embedded => 1\n  | .transaction _ => 2\n  | .eventSubProcess _ _ => 3";
  // The IL defines `ScopeKind`, yet its `Laws` module may not match it by hand.
  const ilLawsFile = path.join(directory, "Kernel", "Laws", "IL.lean");
  const seededIlLaws = "def seededIlLawsDispatchViolation : Kernel.ScopeKind → Nat\n  | .embedded => 1\n  | .transaction _ => 2\n  | .eventSubProcess _ _ => 3";
  // Every codec module may match a guarded type, `Kernel.IL.Codec`'s submodules included.
  const codecFile = path.join(directory, "Kernel", "IL", "Codec", "Decision.lean");
  const seededCodec = "def seededCodecSubmoduleMatch : Kernel.ScopeKind → Nat\n  | .embedded => 1\n  | .transaction _ => 2\n  | .eventSubProcess _ _ => 3";
  // Guard 9's nesting rule covers every IL module, a codec's included: a nested, a marked non-`Value` and a mutual type.
  const seededNesting = [
    "inductive SeededNestedTree where\n  | leaf\n  | node (children : List SeededNestedTree)",
    "-- guard-exception(9): OD2 (4) seeded on a type the owner did not admit",
    "inductive SeededMarkedValue where\n  | list (items : List SeededMarkedValue)\n  | wrapped (inner : Option SeededMarkedValue)",
    "mutual\ninductive SeededEven where\n  | zero\n  | next (odd : SeededOdd)\ninductive SeededOdd where\n  | next (even : SeededEven)\nend",
  ].join("\n");
  const valueFile = path.join(directory, "Kernel", "IL", "Types", "Expression.lean");
  let findings: string[] = [];
  edited(file, seeded, () => edited(lawsFile, seededLaws, () => edited(ilLawsFile, seededIlLaws, () => edited(codecFile, `${seededCodec}\n${seededNesting}`, () => {
    const build = lean(kernelTargets);
    if (build.status !== 0) {
      findings = [`G23: the seeded dispatch violation did not compile\n${build.output}`];
      return;
    }
    const scan = lean(["run", "scripts/kernel-dispatch.lean"]);
    if (scan.status === 0 || !scan.output.includes("Kernel.Element")) findings = [`G23: kernel-dispatch.lean did not reject the seeded violation\n${scan.output}`];
    if (!/Kernel\.Laws\.Flow \S+: matches guarded Kernel\.ScopeKind/u.test(scan.output)) {
      findings.push(`G23: kernel-dispatch.lean did not reject the seeded Laws violation\n${scan.output}`);
    }
    if (!/Kernel\.Laws\.IL \S+: matches guarded Kernel\.ScopeKind/u.test(scan.output)) {
      findings.push(`G23: kernel-dispatch.lean did not reject the seeded IL Laws violation\n${scan.output}`);
    }
    if (scan.output.includes("seededCodecSubmoduleMatch")) {
      findings.push(`G23: kernel-dispatch.lean rejected a match in a codec submodule\n${scan.output}`);
    }
    for (const expected of [/SeededNestedTree: is a nested inductive/u, /SeededMarkedValue: carries the guard-exception\(9\): OD2 \(4\) mark/u,
      /SeededMarkedValue: SeededMarkedValue\.wrapped nests it through Option/u, /SeededEven: is a mutual inductive/u]) {
      if (!expected.test(scan.output)) findings.push(`G23: kernel-dispatch.lean did not report ${expected.source}\n${scan.output}`);
    }
    if (scan.output.includes("SeededMarkedValue.list")) {
      findings.push(`G23: kernel-dispatch.lean rejected a marked type's admitted list arm\n${scan.output}`);
    }
    // The mark is read from the source at scan time, so editing it needs no rebuild.
    const valueSource = readFileSync(valueFile, "utf8");
    try {
      writeFileSync(valueFile, valueSource.replace("guard-exception(9): OD2 (4)", "guard-exception(9): seeded removal"));
      const unmarked = lean(["run", "scripts/kernel-dispatch.lean"]);
      if (!/Kernel\.Value: is a nested inductive/u.test(unmarked.output)) {
        findings.push(`G23: kernel-dispatch.lean admitted Value without its OD2 (4) mark\n${unmarked.output}`);
      }
    } finally {
      writeFileSync(valueFile, valueSource);
    }
  }))));
  return findings;
}

function identify(lean: Lean, directory: string): void {
  const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")) as { config?: { leanBuildThreads?: string } };
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).stdout.trim();
  const toolchain = lean(["env", "lean", "--version"]).output.trim();
  console.log(JSON.stringify({ commit, toolchain, leanBuildThreads: manifest.config?.leanBuildThreads ?? null }));
}

function inClone(body: (lean: Lean, directory: string) => string[]): string[] {
  const directory = clone();
  try {
    const lean = leanIn(directory);
    identify(lean, directory);
    return body(lean, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function measureLean(): string[] {
  console.log(reportLines(loadTree(), branchCommits()).join("\n"));
  return inClone((lean, directory) => {
    const findings = [...cleanBuild(lean, "kernel"), ...measureEdits(lean, directory, "kernel")];
    return [...findings, ...proveDispatchScan(lean, directory)];
  });
}

/** Copy every module of a layer `count` times under renamed module and namespace paths; returns the new module names. */
export function inflateLayer(kernelDirectory: string, layer: string, copies: readonly number[]): string[] {
  const base = path.join(kernelDirectory, layer);
  const files = leanFiles(base);
  const prefix = `Kernel.${layer}.`;
  const moduleOf = (file: string): readonly string[] => path.relative(base, file).slice(0, -".lean".length).split(path.sep);
  const created: string[] = [];
  for (const copy of copies) {
    const rename = (segments: readonly string[]): readonly string[] => [`${segments[0] ?? ""}Copy${copy}`, ...segments.slice(1)];
    for (const file of files) {
      let text = readFileSync(file, "utf8");
      for (const other of files) {
        const original = moduleOf(other);
        text = text.replace(new RegExp(`${(prefix + original.join(".")).replace(/\./gu, "\\.")}\\b`, "gu"), prefix + rename(original).join("."));
      }
      const target = path.join(base, `${rename(moduleOf(file)).join(path.sep)}.lean`);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
      created.push(prefix + rename(moduleOf(file)).join("."));
    }
  }
  return created;
}

function growthProbe(): string[] {
  return inClone((lean, directory) => {
    const kernel = path.join(directory, "Kernel");
    const created = ["Feature", "Admission"].flatMap((layer) => inflateLayer(kernel, layer, [2, 3, 4]));
    if (created.length === 0) return ["G23: the growth probe copied no feature or admission module"];
    const rootFile = path.join(directory, "Kernel.lean");
    const root = readFileSync(rootFile, "utf8");
    writeFileSync(rootFile, root.replace("module\n", `module\n\n${created.map((module) => `public import ${module}`).join("\n")}`));
    return [...cleanBuild(lean, "fourfold kernel"), ...measureEdits(lean, directory, "fourfold kernel")];
  });
}

function measureTypeScript(): string[] {
  const run = (command: string, args: readonly string[], label: string, limit: number): string[] => {
    const started = performance.now();
    const result = spawnSync(command, [...args], { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    const seconds = (performance.now() - started) / 1000;
    console.log(`${label}: ${seconds.toFixed(1)} s`);
    if (result.status !== 0) return [`G15 ${label} failed\n${result.stdout}${result.stderr}`];
    return seconds > limit ? [`G15 ${label}: ${seconds.toFixed(1)} s, above the ${limit} s bound`] : [];
  };
  return [
    ...run("./node_modules/.bin/tsc", ["-p", "packages/kernel/tsconfig.json", "--noEmit"], "kernel type check", budgetSeconds.typeCheck),
    // Node expands the glob itself; a file list here would be a census guard 14 forbids.
    ...run("node", ["--test", "--test-concurrency=1", "packages/kernel/test/*.test.ts"], "kernel tests", budgetSeconds.tests),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const modes: Readonly<Record<string, () => string[]>> = { lean: measureLean, growth: growthProbe, typescript: measureTypeScript };
  const mode = modes[process.argv[2] ?? ""];
  if (mode === undefined) {
    console.error("usage: node scripts/kernel-build-budget.ts lean|growth|typescript");
    process.exit(2);
  }
  const findings = mode();
  for (const line of findings) console.error(line);
  process.exitCode = findings.length === 0 ? 0 : 1;
}

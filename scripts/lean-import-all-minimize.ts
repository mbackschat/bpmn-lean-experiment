/**
 * Keeps each named module's `import all` lines to those its own compile fails without, and drops the plain imports
 * that leaves behind wherever the module compiles without them, as the
 * [module rules](../docs/LEAN-BUILD-MODULARITY-SPEC.md#module-rules) require. Every `import all` line widens what a body
 * edit of the opened module rebuilds, and every plain one what an interface edit rebuilds; a repair that added whole
 * import closures left 13,002 `import all` lines where the builds needed far fewer (process ledger, Finding 84).
 *
 * A module's imports reach beyond its own scope. Lean opens the private part of every module a chain of `import all`
 * imports reaches, loads the private imports of every module it opens, and lets a file outside the module system load
 * its whole import closure opened (the import-level lattice of `importModulesCore`, Lean v4.34.1
 * `src/lean/Lean/Environment.lean:2125-2182`, and `processHeaderCore`, `src/lean/Lean/Elab/Import.lean:150-156`).
 * Searching each module alone therefore broke three `import all` importers of a trim (scratch conversion, 2026-10-28).
 * So the run also takes every module whose chains open a named one, and searches in levels: each level comes after
 * every level its chains open and no earlier than any run module it imports, and is built before the next compiles
 * against it. A module starts from its own text plus an `import all` of each module it opened before the run and no
 * longer opens, which gives it back the environment it had; files outside the module system gain a plain import of
 * each at the end. The run stays inside what the build compiles: every module a library's default root prefixes, which
 * Lake builds on request (`isBuildableModule`, Lean v4.34.1 `src/lean/lake/Lake/Config/LeanLibConfig.lean:127-130`),
 * each executable's root, and their import closures. Frozen sources such as `adoption/a12/legacy` stay untouched.
 *
 * Within a module, each phase compiles with none of the candidates, then repeatedly binary-searches the shortest prefix
 * of the remaining candidates that compiles and keeps that prefix's last line: the first phase over the `import all`
 * lines, the second over the plain imports the first leaves.
 *
 * The tree must compile before the run, except the modules `--failing` names and the modules importing them: those
 * keep their environment through inherited lines and are neither compiled nor built. The run builds every other module
 * it covers first and stops when that fails, before any search; a level search that ran for hours on a module the
 * round builds never compiled ended only when it reached that module (scratch conversion, 2026-10-28). A compile
 * failure of any other start, a compile that ends in anything but success or an elaboration error, or a failed level
 * build stops the run as well.
 *
 * Variants are written in place, with the originals saved under `.lake/import-all-minimize/originals`, which a run
 * refuses to start over; one `./scripts/lake.sh env` worker per level compiles them, at most `--parallel` at a time,
 * and exits by itself at its deadline. Run a complete build afterwards.
 *
 * Declaration ([Rule 2](../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change)):
 * - Intention: drop every `import all` line, and every plain import it would leave, that the run's modules compile
 *   without.
 * - Scope: among the files the build compiles, the import lines of the named modules, of every module whose `import all`
 *   chains open one of them, and of every file outside the module system. A searched module's `import all` lines stay,
 *   become plain imports or disappear, and its inherited lines are searched the same way; any other file only gains
 *   the inherited lines that keep its environment. No other line or file changes, as
 *   `lean-import-all-minimize.test.ts` locks.
 * - Target effect: no module opens a module it did not open before, so no body-edit fan-out grows; no compiled file
 *   the run does not search loses any part of its environment; the `import all` lines and the import lines of the
 *   files it touches never grow in total. The run checks the totals after every level and everything at the end, and
 *   restores every file when a check fails.
 *
 * Usage: node scripts/lean-import-all-minimize.ts [--parallel 2] [--deadline-seconds 36000] [--failing <list>]
 *   <Module.lean>...
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { declaredLeanExecutables } from "./lean-native-driver.ts";
import { leanHeader, type LeanHeader, worktreeLeanSourceFiles } from "./lean-source-analysis.ts";

const importAll = /^import all (\S+)\s*$/u;

/**
 * The module's text with only `keep` imported with `all`, once each. Every other `import all` becomes a plain import
 * once, or, when `keepPlain` is given, only if `keepPlain` names its target; a target the module imports another way
 * loses the line.
 */
export function importAllVariant(text: string, keep: ReadonlySet<string>, keepPlain?: ReadonlySet<string>): string {
  const lines = text.split("\n");
  const otherwise = otherImports(lines);
  const added = new Set<string>();
  return lines.flatMap((line) => {
    const target = importAll.exec(line)?.[1];
    if (target === undefined) return [line];
    if (added.has(target)) return [];
    added.add(target);
    if (keep.has(target)) return [line];
    if (otherwise.has(target) || (keepPlain !== undefined && !keepPlain.has(target))) return [];
    return [`import ${target}`];
  }).join("\n");
}

/** The targets whose `import all` the first phase dropped and that the module imports no other way, in source order. */
export function droppedTargets(text: string, keep: ReadonlySet<string>): string[] {
  const otherwise = otherImports(text.split("\n"));
  return [...new Set(importAllTargets(text))].filter((target) => !keep.has(target) && !otherwise.has(target));
}

function otherImports(lines: ReadonlyArray<string>): Set<string> {
  return new Set(lines.filter((line) => /^(?:public |meta )*import /u.test(line) && !importAll.test(line))
    .map((line) => line.replace(/^(?:public |meta )*import (?:all )?/u, "").trim()));
}

/** The `import all` targets of a module's text, in source order. */
export function importAllTargets(text: string): string[] {
  return text.split("\n").flatMap((line) => importAll.exec(line)?.[1] ?? []);
}

/** The text with `import <prefix><target>` for each target appended to its header. */
export function withImports(text: string, prefix: "" | "all ", targets: ReadonlyArray<string>): string {
  if (targets.length === 0) return text;
  const lineEnd = text.indexOf("\n", leanHeader(text).endOffset);
  const end = lineEnd === -1 ? text.length : lineEnd;
  return `${text.slice(0, end)}\n${targets.map((target) => `import ${prefix}${target}`).join("\n")}${text.slice(end)}`;
}

type Headers = ReadonlyMap<string, Pick<LeanHeader, "isModule" | "imports">>;

/**
 * What compiling `module` loads, by Lean's import-level lattice (`importModulesCore`, Lean v4.34.1
 * `src/lean/Lean/Environment.lean:2125-2182`): `opened` holds the modules whose private part it sees, `loaded` every
 * module it loads. The root opens its `import all` targets, an opened module opens its own, the root and every opened
 * module load all their imports, and a loaded module loads its public ones. A file outside the module system opens its
 * whole import closure (`processHeaderCore`, `src/lean/Lean/Elab/Import.lean:150-156`).
 */
export function leanEnvironment(headers: Headers, module: string): { opened: Set<string>; loaded: Set<string> } {
  const imports = (name: string) => headers.get(name)?.imports ?? [];
  const opened = new Set<string>();
  const loaded = new Set<string>();
  if (headers.get(module)?.isModule === false) {
    const pending = imports(module).map(({ module: target }) => target);
    while (pending.length > 0) {
      const target = pending.pop()!;
      if (loaded.has(target)) continue;
      loaded.add(target);
      opened.add(target);
      pending.push(...imports(target).map(({ module: next }) => next));
    }
    return { opened, loaded };
  }
  const openers = [module];
  for (let index = 0; index < openers.length; index += 1) {
    for (const { module: target, importsAll } of imports(openers[index]!)) {
      if (importsAll && !opened.has(target)) {
        opened.add(target);
        openers.push(target);
      }
    }
  }
  const pending = openers.flatMap((opener) => imports(opener).map(({ module: target }) => target));
  while (pending.length > 0) {
    const target = pending.pop()!;
    if (loaded.has(target)) continue;
    loaded.add(target);
    pending.push(...imports(target).filter(({ isPublic }) => isPublic).map(({ module: next }) => next));
  }
  return { opened, loaded };
}

/** Every module `module` imports, directly or through the imports of what it imports. */
export function importClosure(headers: Headers, module: string): Set<string> {
  const reached = new Set<string>();
  const pending = (headers.get(module)?.imports ?? []).map(({ module: target }) => target);
  while (pending.length > 0) {
    const target = pending.pop()!;
    if (reached.has(target)) continue;
    reached.add(target);
    pending.push(...(headers.get(target)?.imports ?? []).map(({ module: next }) => next));
  }
  return reached;
}

/**
 * The run's modules in search order: the named modules and every module whose `import all` chains open one, grouped
 * so that each level comes after every level it opens and no earlier than any run module it imports, because Lake
 * builds a level's imports with it. Each level is sorted by name.
 */
export function importAllLevels(headers: Headers, named: ReadonlyArray<string>): string[][] {
  const modules = [...headers].filter(([, header]) => header.isModule).map(([module]) => module);
  const opened = new Map(modules.map((module) => [module, leanEnvironment(headers, module).opened]));
  const run = new Set(named);
  for (const [module, opens] of opened) if (named.some((target) => opens.has(target))) run.add(module);
  const levels = new Map<string, number>();
  const levelOf = (module: string): number => {
    const known = levels.get(module);
    if (known !== undefined) return known;
    const above = [...opened.get(module) ?? []].filter((target) => run.has(target)).map((target) => levelOf(target) + 1);
    const beside = [...importClosure(headers, module)].filter((target) => run.has(target)).map(levelOf);
    const level = Math.max(0, ...above, ...beside);
    levels.set(module, level);
    return level;
  };
  const grouped: string[][] = [];
  for (const module of [...run].sort()) (grouped[levelOf(module)] ??= []).push(module);
  return grouped.filter((level) => level !== undefined);
}

/**
 * The modules `module` opened under `before` and no longer opens under `after`, sorted by name. Opening them again
 * gives it back its whole environment: the search only removes lines that opened their target, so a module loses a
 * module it merely loaded only by no longer opening the module that imported it.
 */
export function lostOpens(before: Headers, after: Headers, module: string): string[] {
  const still = leanEnvironment(after, module).opened;
  return [...leanEnvironment(before, module).opened].filter((target) => !still.has(target)).sort();
}

/**
 * The search over one candidate list: yields each candidate keep-set and receives whether that variant compiled;
 * returns the kept set. It assumes that compiling with every candidate succeeds and that keeping more lines never
 * breaks a compile.
 */
export function* importAllSearch(candidates: ReadonlyArray<string>): Generator<string[], string[], boolean> {
  const kept: string[] = [];
  let rest = [...candidates];
  if (yield [...kept]) return kept;
  for (;;) {
    let low = 1;
    let high = rest.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (yield [...kept, ...rest.slice(0, middle)]) high = middle;
      else low = middle + 1;
    }
    kept.push(rest[high - 1]!);
    rest = rest.slice(0, high - 1);
    if (rest.length === 0 || (yield [...kept])) return kept;
  }
}

/**
 * The search for one module from its start text: yields each variant and receives whether it compiled; returns the
 * final text, or `undefined` when the start does not compile.
 */
export function* moduleSearch(start: string): Generator<string, string | undefined, boolean> {
  const candidates = [...new Set(importAllTargets(start))];
  if (candidates.length === 0) return start;
  if (!(yield start)) return undefined;
  const drive = function* (search: Generator<string[], string[], boolean>, variant: (keep: Set<string>) => string) {
    let step = search.next();
    while (!step.done) step = search.next(yield variant(new Set(step.value)));
    return new Set(step.value);
  };
  const kept = yield* drive(importAllSearch(candidates), (keep) => importAllVariant(start, keep));
  const keptPlain = yield* drive(importAllSearch(droppedTargets(start, kept)), (keep) => importAllVariant(start, kept, keep));
  return importAllVariant(start, kept, keptPlain);
}

/** The lakefile's per-module Lean arguments and options, so a variant compiles as the build would compile it. */
export function leanArguments(lakefile: string): string[] {
  const more = /^moreLeanArgs\s*=\s*\[([^\]]*)\]/mu.exec(lakefile)?.[1] ?? "";
  const options = /^leanOptions\s*=\s*\{([^}]*)\}/mu.exec(lakefile)?.[1] ?? "";
  return [
    ...[...more.matchAll(/"([^"]+)"/gu)].map(([, argument]) => argument!),
    ...options.split(",").map((option) => option.trim()).filter(Boolean)
      .map((option) => `-D${option.replace(/\s*=\s*/u, "=")}`),
  ];
}

/** What the build compiles from: each library's default root, which is its name, and each executable's root. */
export function leanBuildRoots(lakefile: string): { libraries: string[]; executables: string[] } {
  const libraries = lakefile.split(/^\[\[lean_lib\]\]$/mu).slice(1).map((block) => {
    const table = block.split(/^\[/mu)[0] ?? "";
    const name = /^name = "([^"]+)"$/mu.exec(table)?.[1];
    if (name === undefined || /^(?:roots|globs|srcDir)\s*=/mu.test(table)) {
      throw new TypeError(`[[lean_lib]] block needs a name and the default roots: ${table.trim()}`);
    }
    return name;
  });
  return { libraries, executables: [...declaredLeanExecutables(lakefile).keys()] };
}

/** The compile worker: runs `lean` on each queued path, at most `parallel` at a time, until `stop` appears. */
export const workerScript = (directory: string, parallel: number, deadline: number, leanArgs: string[]) => `
set -u
q=${directory}/queue; r=${directory}/run; d=${directory}/done
end=$((SECONDS + ${deadline}))
pids=()
while [ ! -f ${directory}/stop ] && [ "$SECONDS" -lt "$end" ]; do
  live=(); for p in "\${pids[@]}"; do kill -0 "$p" 2>/dev/null && live+=("$p"); done; pids=("\${live[@]}")
  job=$(ls "$q" 2>/dev/null | grep '\\.job$' | head -1)
  if [ "\${#pids[@]}" -lt ${parallel} ] && [ -n "$job" ]; then
    mv "$q/$job" "$r/$job"; id=\${job%.job}
    ( lean ${leanArgs.join(" ")} "$(cat "$r/$id.job")" > /dev/null 2>&1; echo $? > "$d/$id.tmp"; mv "$d/$id.tmp" "$d/$id.rc"; rm -f "$r/$id.job" ) &
    pids+=("$!")
  else
    sleep 0.2
  fi
done
wait
`;

/** Where a run compiles and builds; the command line runs both through `./scripts/lake.sh`. */
export type MinimizeHost = Readonly<{
  /** The queue, the saved originals and the stop marker. */
  directory: string;
  /** A variant's path as the compile worker reads it. */
  jobPath: (file: string) => string;
  /** Starts a worker that compiles each queued variant and records its exit status until the stop marker appears. */
  startWorker: (directory: string) => Readonly<{ exited: Promise<unknown> }>;
  /** Builds the modules and their imports, resolving to the exit status. */
  build: (modules: ReadonlyArray<string>) => Promise<number>;
}>;

/**
 * Minimizes the named files and every module whose chains open one, level by level, and returns a one-line summary.
 * `sources` lists every Lean file of the tree relative to `root`, `buildRoots` what the build compiles from, and
 * `failing` the modules that do not compile.
 */
export async function minimizeImportAlls(root: string, sources: ReadonlyArray<string>, files: ReadonlyArray<string>,
  host: MinimizeHost, parallel: number, buildRoots: Readonly<{ libraries: ReadonlyArray<string>; executables: ReadonlyArray<string> }>,
  failing: ReadonlySet<string> = new Set()): Promise<string> {
  const moduleOf = (file: string) => file.replace(/\.lean$/u, "").replaceAll("/", ".");
  const fileOf = new Map(sources.map((file) => [moduleOf(file), file]));
  const texts = new Map([...fileOf].map(([module, file]) => [module, readFileSync(path.join(root, file), "utf8")]));
  const tree = new Map([...texts].map(([module, text]) => [module, leanHeader(text)]));
  const starts = [...buildRoots.executables, ...[...tree.keys()].filter((module) =>
    buildRoots.libraries.some((library) => module === library || module.startsWith(`${library}.`)))];
  const compiled = new Set(starts.flatMap((module) => [module, ...importClosure(tree, module)]));
  const before = new Map([...tree].filter(([module]) => compiled.has(module)));
  const named = files.map(moduleOf);
  const outside = named.filter((module) => before.get(module)?.isModule !== true);
  if (outside.length > 0) throw new Error(`not a module the build compiles: ${outside.join(", ")}`);
  for (const [module, header] of before) {
    const opens = header.imports.filter(({ importsAll }) => importsAll);
    if (opens.some(({ isPublic, isMeta }) => isPublic || isMeta) ||
      opens.map(({ module: target }) => target).join() !== importAllTargets(texts.get(module)!).join()) {
      throw new Error(`${module}: an \`import all\` line the search cannot edit`);
    }
  }
  const levels = importAllLevels(before, named);
  const blocked = new Set([...before.keys()].filter((module) =>
    failing.has(module) || [...importClosure(before, module)].some((target) => failing.has(target))));
  const plainFiles: string[] = [];
  const visitPlain = (module: string) => {
    if (plainFiles.includes(module) || before.get(module)?.isModule !== false) return;
    for (const { module: target } of before.get(module)!.imports) visitPlain(target);
    plainFiles.push(module);
  };
  for (const module of before.keys()) visitPlain(module);
  const touched = [...levels.flat(), ...plainFiles];
  const originals = new Map(touched.map((module) => [module, texts.get(module)!]));
  const { directory } = host;
  if (existsSync(path.join(directory, "originals"))) {
    throw new Error(`${directory}/originals is left from an interrupted run: restore the tree from it, then delete it`);
  }
  // The headers of the compiled files as the run leaves them, kept current with every write.
  const current = new Map(before);
  const write = (module: string, text: string) => {
    if (texts.get(module) === text) return;
    texts.set(module, text);
    current.set(module, leanHeader(text));
    writeFileSync(path.join(root, fileOf.get(module)!), text);
  };
  const restore = () => {
    writeFileSync(path.join(directory, "stop"), "");
    for (const [module, text] of originals) write(module, text);
    rmSync(path.join(directory, "originals"), { recursive: true, force: true });
  };
  const signals = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 } as const;
  const interrupted = (signal: NodeJS.Signals) => { restore(); process.exit(signals[signal as keyof typeof signals]); };
  rmSync(directory, { recursive: true, force: true });
  for (const part of ["queue", "run", "done", "originals"]) mkdirSync(path.join(directory, part), { recursive: true });
  for (const signal of Object.keys(signals)) process.on(signal, interrupted);
  for (const [module, text] of originals) writeFileSync(path.join(directory, "originals", module), text);
  const totals = (modules: ReadonlyArray<string>) => modules.reduce<[number, number]>(([all, any], module) => [
    all + importAllTargets(texts.get(module)!).length,
    any + current.get(module)!.imports.length,
  ], [0, 0]);
  const limits = totals(touched);
  const checkTotals = (where: string) => {
    const [all, any] = totals(touched);
    if (all > limits[0] || any > limits[1]) throw new Error(`the import lines would grow ${where}`);
  };
  const searched = new Set<string>();
  let jobs = 0;
  try {
    const ready = levels.flat().filter((module) => !blocked.has(module));
    if (ready.length > 0 && await host.build(ready) !== 0) {
      throw new Error("the run's modules must build before the run: name those that do not with --failing");
    }
    for (const [index, level] of levels.entries()) {
      const after = new Map(current);
      rmSync(path.join(directory, "stop"), { force: true });
      let workerExited = false;
      const worker = host.startWorker(directory);
      void worker.exited.then(() => { workerExited = true; });
      const active = new Map<string, { search: Generator<string, string | undefined, boolean>; job: string }>();
      const settle = (module: string, search: Generator<string, string | undefined, boolean>,
        step: IteratorResult<string, string | undefined>) => {
        if (step.done) {
          active.delete(module);
          if (step.value === undefined) throw new Error(`${module} does not compile from its start`);
          write(module, step.value);
          searched.add(module);
          return;
        }
        const job = `j${jobs++}`;
        write(module, step.value);
        writeFileSync(path.join(directory, "queue", `${job}.tmp`), host.jobPath(fileOf.get(module)!));
        renameSync(path.join(directory, "queue", `${job}.tmp`), path.join(directory, "queue", `${job}.job`));
        active.set(module, { search, job });
      };
      const pending = [...level];
      while (pending.length > 0 || active.size > 0) {
        if (workerExited) throw new Error("the compile worker exited before the level's search finished");
        while (pending.length > 0 && active.size < parallel) {
          const module = pending.shift()!;
          const start = withImports(originals.get(module)!, "all ", lostOpens(before, after, module));
          if (blocked.has(module)) {
            write(module, start);
            continue;
          }
          const search = moduleSearch(start);
          settle(module, search, search.next());
        }
        const done = new Set(readdirSync(path.join(directory, "done")));
        let progressed = false;
        for (const [module, { search, job }] of [...active]) {
          if (!done.has(`${job}.rc`)) continue;
          const status = readFileSync(path.join(directory, "done", `${job}.rc`), "utf8").trim();
          if (status !== "0" && status !== "1") throw new Error(`compiling ${module} ended with status ${status}`);
          settle(module, search, search.next(status === "0"));
          progressed = true;
        }
        if (!progressed) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      writeFileSync(path.join(directory, "stop"), "");
      await worker.exited;
      checkTotals(`at level ${index}`);
      const built = level.filter((module) => searched.has(module));
      if (built.length > 0 && await host.build(built) !== 0) throw new Error(`building level ${index} failed`);
    }
    // Such a file opens all it loads, so a plain import gives back what it no longer opens; importees go first, so an
    // importer gets back only what its importees did not.
    for (const module of plainFiles) write(module, withImports(originals.get(module)!, "", lostOpens(before, current, module)));
    checkTotals("at the end");
    const final = current;
    for (const module of before.keys()) {
      const was = leanEnvironment(before, module);
      const is = leanEnvironment(final, module);
      if ([...is.opened].some((target) => !was.opened.has(target))) throw new Error(`${module} would open new modules`);
      if (!searched.has(module) && ([...was.opened].some((target) => !is.opened.has(target)) ||
        [...was.loaded].some((target) => !is.loaded.has(target)))) {
        throw new Error(`${module} would lose part of its environment`);
      }
    }
  } catch (error) {
    restore();
    throw error;
  } finally {
    for (const signal of Object.keys(signals)) process.off(signal, interrupted);
  }
  rmSync(path.join(directory, "originals"), { recursive: true, force: true });
  const [all, any] = totals(touched);
  return `${levels.flat().length} modules in ${levels.length} levels, ${searched.size} searched: ` +
    `\`import all\` lines ${limits[0]} → ${all}, import lines ${limits[1]} → ${any}, ${jobs} compiles`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args.splice(at, 2)[1];
  };
  const parallel = Number(option("--parallel") ?? 2);
  const deadline = Number(option("--deadline-seconds") ?? 36000);
  const failingList = option("--failing");
  const files = args;
  if (files.length === 0 || !Number.isInteger(parallel) || parallel < 1) {
    throw new Error("usage: node scripts/lean-import-all-minimize.ts [--parallel 2] [--deadline-seconds 36000] [--failing <list>] <Module.lean>...");
  }
  const failing = new Set(failingList === undefined ? [] : readFileSync(failingList, "utf8").split("\n").filter(Boolean));
  const leanArgs = leanArguments(readFileSync("lakefile.toml", "utf8"));
  const exit = (child: ReturnType<typeof spawn>) => new Promise<number>((resolve) => {
    child.on("error", () => resolve(127));
    child.on("exit", (code) => resolve(code ?? 1));
  });
  const host: MinimizeHost = {
    directory: path.resolve(".lake/import-all-minimize"),
    jobPath: (file) => path.resolve(file),
    startWorker: (directory) => ({
      exited: exit(spawn("./scripts/lake.sh", ["env", "bash", "-c", workerScript(directory, parallel, deadline, leanArgs)], { stdio: "inherit" })),
    }),
    build: (modules) => exit(spawn("./scripts/lake.sh", ["build", ...modules], { stdio: "inherit" })),
  };
  process.stdout.write(`${await minimizeImportAlls(".", worktreeLeanSourceFiles(), files, host, parallel,
    leanBuildRoots(readFileSync("lakefile.toml", "utf8")), failing)}\n`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) await main();

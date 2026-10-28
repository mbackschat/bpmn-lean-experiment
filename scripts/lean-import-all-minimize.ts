/**
 * Keeps each named module's `import all` lines to those its own compile fails without, and drops the plain imports
 * that leaves behind wherever the module compiles without them, as the
 * [module rules](../docs/LEAN-BUILD-MODULARITY-SPEC.md#module-rules) require. Every `import all` line widens what a body
 * edit of the opened module rebuilds, and every plain one what an interface edit rebuilds; a repair that added whole
 * import closures left 13,002 `import all` lines where the builds needed far fewer (process ledger, Finding 84).
 *
 * Modules are minimized independently against the current build, because the imports of a module change only its own
 * private scope. Each module runs one search per phase, over its `import all` lines and then over the plain imports
 * the first phase leaves: compile with none of the candidates, then repeatedly binary-search the shortest prefix of
 * the remaining candidates that compiles and keep that prefix's last line.
 *
 * Variants are written in place, with the originals saved under `.lake/import-all-minimize` and restored if the run
 * stops early; one `./scripts/lake.sh env` worker compiles them, at most `--parallel` at a time, and exits by itself
 * at its deadline. Run a complete build afterwards: a module's minimized imports are verified only against the build
 * its dependencies had when it was compiled.
 *
 * Declaration ([Rule 2](../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change)):
 * - Intention: drop every `import all` line, and every plain import it would leave, that a module compiles without.
 * - Scope: only the `import all` lines of the named files; each stays, becomes a plain import or disappears. No other
 *   line or file changes, as `lean-import-all-minimize.test.ts` locks.
 * - Target effect: the library's opening-import total, its import lines and the named files' lines never grow, by
 *   construction; each opened module's body-edit fan-out shrinks by the loaders that no longer open it.
 *
 * Usage: node scripts/lean-import-all-minimize.ts [--parallel 2] [--deadline-seconds 36000] <Module.lean>...
 */

import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const importAll = /^import all (\S+)\s*$/u;

/**
 * The module's text with only `keep` imported with `all`. Every other `import all` becomes a plain import once, or, when
 * `keepPlain` is given, only if `keepPlain` names its target; a target the module imports another way loses the line.
 */
export function importAllVariant(text: string, keep: ReadonlySet<string>, keepPlain?: ReadonlySet<string>): string {
  const lines = text.split("\n");
  const otherwise = otherImports(lines);
  const added = new Set<string>();
  return lines.flatMap((line) => {
    const target = importAll.exec(line)?.[1];
    if (target === undefined || keep.has(target)) return [line];
    if (otherwise.has(target) || added.has(target) || (keepPlain !== undefined && !keepPlain.has(target))) return [];
    added.add(target);
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

/**
 * The search for one module: yields each candidate keep-set and receives whether that variant compiled; returns the
 * kept set. It assumes that compiling with every candidate succeeds and that keeping more lines never breaks a compile.
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

/** The lakefile's per-module Lean arguments and options, so a variant compiles as the build would compile it. */
function leanArguments(lakefile: string): string[] {
  const more = /^moreLeanArgs\s*=\s*\[([^\]]*)\]/mu.exec(lakefile)?.[1] ?? "";
  const options = /^leanOptions\s*=\s*\{([^}]*)\}/mu.exec(lakefile)?.[1] ?? "";
  return [
    ...[...more.matchAll(/"([^"]+)"/gu)].map(([, argument]) => argument!),
    ...options.split(",").map((option) => option.trim()).filter(Boolean)
      .map((option) => `-D${option.replace(/\s*=\s*/u, "=")}`),
  ];
}

const workerScript = (directory: string, parallel: number, deadline: number, leanArgs: string[]) => `
set -u
q=${directory}/queue; r=${directory}/run; d=${directory}/done
end=$((SECONDS + ${deadline}))
pids=()
while [ ! -f ${directory}/stop ] && [ "$SECONDS" -lt "$end" ]; do
  live=(); for p in "\${pids[@]}"; do kill -0 "$p" 2>/dev/null && live+=("$p"); done; pids=("\${live[@]}")
  job=$(ls "$q" 2>/dev/null | head -1)
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: number) => {
    const at = args.indexOf(name);
    if (at === -1) return fallback;
    const [value] = args.splice(at, 2).slice(1);
    return Number(value);
  };
  const parallel = option("--parallel", 2);
  const deadline = option("--deadline-seconds", 36000);
  const files = args;
  if (files.length === 0 || !Number.isInteger(parallel) || parallel < 1) {
    throw new Error("usage: node scripts/lean-import-all-minimize.ts [--parallel 2] [--deadline-seconds 36000] <Module.lean>...");
  }
  const directory = path.resolve(".lake/import-all-minimize");
  rmSync(directory, { recursive: true, force: true });
  for (const part of ["queue", "run", "done", "originals"]) mkdirSync(path.join(directory, part), { recursive: true });
  const originals = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
  for (const [file, text] of originals) writeFileSync(path.join(directory, "originals", file.replaceAll("/", "__")), text);
  const restore = () => { for (const [file, text] of originals) if (!finished.has(file)) writeFileSync(file, text); };
  const finished = new Map<string, string[]>();
  process.on("SIGINT", () => { restore(); process.exit(130); });

  const worker = spawn("./scripts/lake.sh", ["env", "bash", "-c",
    workerScript(directory, parallel, deadline, leanArguments(readFileSync("lakefile.toml", "utf8")))], { stdio: "inherit" });
  let workerExited = false;
  worker.on("exit", () => { workerExited = true; });

  // Each file runs the search twice: first over its `import all` lines, then over the plain imports those leave behind.
  const keptAll = new Map<string, ReadonlySet<string>>();
  const active = new Map<string, { search: Generator<string[], string[], boolean>; job: string }>();
  const pending = [...files];
  let jobs = 0;
  const variant = (file: string, keep: string[]) => {
    const all = keptAll.get(file);
    return all === undefined ? importAllVariant(originals.get(file)!, new Set(keep))
      : importAllVariant(originals.get(file)!, all, new Set(keep));
  };
  const submit = (file: string, keep: string[]) => {
    const job = `j${jobs++}`;
    writeFileSync(file, variant(file, keep));
    writeFileSync(path.join(directory, "queue", `${job}.tmp`), path.resolve(file));
    renameSync(path.join(directory, "queue", `${job}.tmp`), path.join(directory, "queue", `${job}.job`));
    return job;
  };
  const settle = (file: string, step: IteratorResult<string[], string[]>, search: Generator<string[], string[], boolean>) => {
    if (!step.done) {
      active.set(file, { search, job: submit(file, step.value) });
      return;
    }
    if (!keptAll.has(file)) {
      keptAll.set(file, new Set(step.value));
      const dropped = droppedTargets(originals.get(file)!, keptAll.get(file)!);
      if (dropped.length > 0) {
        const plainSearch = importAllSearch(dropped);
        settle(file, plainSearch.next(), plainSearch);
        return;
      }
      step = { done: true, value: [] };
    }
    finished.set(file, [...keptAll.get(file)!]);
    writeFileSync(file, variant(file, step.value));
    active.delete(file);
  };
  try {
    while (pending.length > 0 || active.size > 0) {
      if (workerExited) throw new Error("the compile worker exited before the search finished");
      while (pending.length > 0 && active.size < parallel) {
        const file = pending.shift()!;
        const candidates = importAllTargets(originals.get(file)!);
        if (candidates.length === 0) { finished.set(file, []); continue; }
        const search = importAllSearch(candidates);
        settle(file, search.next(), search);
      }
      const done = new Set(readdirSync(path.join(directory, "done")).filter((name) => name.endsWith(".rc")));
      let progressed = false;
      for (const [file, { search, job }] of [...active]) {
        if (!done.has(`${job}.rc`)) continue;
        const compiled = readFileSync(path.join(directory, "done", `${job}.rc`), "utf8").trim() === "0";
        settle(file, search.next(compiled), search);
        progressed = true;
      }
      if (!progressed) await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } catch (error) {
    restore();
    throw error;
  } finally {
    writeFileSync(path.join(directory, "stop"), "");
  }
  const before = [...originals.values()].reduce((total, text) => total + importAllTargets(text).length, 0);
  const after = [...finished.values()].reduce((total, kept) => total + kept.length, 0);
  process.stdout.write(`${files.length} modules: ${before} \`import all\` lines kept ${after}, ${jobs} compiles\n`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) await main();

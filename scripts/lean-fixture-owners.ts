/**
 * Prints the exact `import all` lines a module needs so that its kernel decisions and definitional reductions see
 * the hidden bodies they unfold, as the [module rules](../docs/LEAN-BUILD-MODULARITY-PROPOSAL.md#module-rules) require
 * ("Kernel decision through hidden bodies needs `import all` of every module on the reduction path").
 *
 * A stuck decision names only the outermost definition it could not reduce, never the hidden callee below it, and a
 * static call graph over-approximates: a fixture that decides `applyStimulus` unfolded bodies from 72 modules, while
 * the function's static closure spans about 200 (scratch conversion, 2026-10-28). So the script asks Lean. It compiles
 * the module once as a plain file, which loads the private part of its whole import closure (Lean v4.34.1
 * `src/lean/Lean/Elab/Import.lean:150-156`), with `diagnostics` at threshold 0, whose kernel and reduction counters
 * list every definition unfolded. A generated query then maps each name to its module and keeps the modules whose
 * public `.olean` carries no body for it. Each owner is needed, because the module cannot reduce that body without
 * opening it; together they suffice for the reductions the diagnostics saw, which a compile of the module confirms.
 *
 * Its files go under `.lake/fixture-owners/`; it never writes a source file. A plain probe that fails, for instance
 * by exceeding the per-module memory ceiling, stops it.
 *
 * Usage: node scripts/lean-fixture-owners.ts [--deadline-seconds 1800] <Module.lean>
 */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { leanArguments } from "./lean-import-all-minimize.ts";
import { leanHeader } from "./lean-source-analysis.ts";

const importLine = /^(?:public |meta )*import (?:all )?(\S+)\s*$/u;

/** The module as a plain file whose every declaration reports what it unfolded. */
export function plainProbeVariant(text: string): string {
  const lines = text.split("\n");
  const lastImport = lines.findLastIndex((line) => importLine.test(line));
  return lines.flatMap((line, index) => {
    if (line === "module") return [];
    const imported = importLine.exec(line);
    const plain = imported === null
      ? line.replace(/^(?:@\[expose\] )?public ((?:noncomputable )?(?:meta )?section(?: \S+)?\s*)$/u, "$1")
      : `import ${imported[1]}`;
    return index === lastImport ? [plain, "set_option diagnostics true", "set_option diagnostics.threshold 0"] : [plain];
  }).join("\n");
}

/** Every name the diagnostics counted as unfolded, without Lean's inaccessible-name mark, sorted. */
export function unfoldedNames(output: string): string[] {
  return [...new Set([...output.matchAll(/\[(?:kernel|reduction)\] (\S+) ↦ \d+/gu)].map(([, name]) => name!.replace(/✝$/u, "")))].sort();
}

/** The namespace prefixes, with a trailing dot, that Lean may have dropped when it printed a name in this text. */
export function namePrefixes(text: string): string[] {
  const prefixes = new Set<string>();
  const scopes: string[] = [];
  const current = () => scopes.filter(Boolean).join(".");
  const ancestors = () => {
    const parts = current().split(".").filter(Boolean);
    return parts.map((_, index) => parts.slice(0, index + 1).join("."));
  };
  for (const line of text.split("\n")) {
    const opened = /^\s*namespace (\S+)/u.exec(line)?.[1];
    if (opened !== undefined) {
      scopes.push(opened);
      for (const prefix of ancestors()) prefixes.add(`${prefix}.`);
      continue;
    }
    if (/^\s*section\b/u.test(line)) scopes.push("");
    else if (/^\s*end\b/u.test(line)) scopes.pop();
    const open = /^\s*open (.+)$/u.exec(line)?.[1];
    if (open === undefined) continue;
    for (const token of open.split(/\s+/u)) {
      if (["scoped", "in", "hiding", "renaming"].includes(token) || token.startsWith("(")) break;
      prefixes.add(`${token}.`);
      for (const prefix of ancestors()) prefixes.add(`${prefix}.${token}.`);
    }
  }
  return [...prefixes].sort();
}

/** The owners and unplaced names of a query's output; the module itself is no owner. */
export function ownerReport(output: string, self: string): { owners: string[]; unmatched: string[] } {
  if (!/^MATCHED \d+ of \d+$/mu.test(output)) throw new Error(`the owner query failed:\n${output.slice(0, 2000)}`);
  const field = (tag: string) => [...output.matchAll(new RegExp(`^${tag} (\\S+)`, "gmu"))].map(([, value]) => value!);
  return { owners: field("OWNER").filter((owner) => owner !== self).sort(), unmatched: field("UNMATCHED").sort() };
}

export const importAllLines = (owners: ReadonlyArray<string>) => owners.map((owner) => `import all ${owner}`).join("\n");

/** The query: loads the module's imports as a plain file and reports, per unfolded name, a module hiding its body. */
function ownerQuerySource(imports: ReadonlyArray<string>, namesFile: string, prefixesFile: string): string {
  return `import Lean
${imports.map((target) => `import ${target}`).join("\n")}
open Lean

def modOf (env : Environment) (n : Name) : Option Name :=
  (env.getModuleIdxFor? n).map fun i => env.header.moduleNames[i.toNat]!

/-- The definitions whose bodies the module's public \`.olean\` carries. -/
def exposedIn (m : Name) : IO NameSet := do
  let (data, _) ← readModuleData (← findOLean m)
  return data.constants.foldl (init := {}) fun s ci => match ci with
    | .defnInfo _ => s.insert ci.name
    | _ => s

/-- The spellings Lean may print for \`n\`: without a private prefix, and without any of \`prefixes\`. -/
def printed (prefixes : List String) (n : Name) : List String :=
  let s := n.toString
  let s := match s.splitOn ".0." with
    | p :: rest => if p.startsWith "_private." && !rest.isEmpty then ".0.".intercalate rest else s
    | [] => s
  s :: prefixes.filterMap fun p => if s.startsWith p then some (s.drop p.length).toString else none

#eval show CoreM Unit from do
  let env ← getEnv
  let wanted : Std.HashSet String := Std.HashSet.ofList (← IO.FS.lines ${JSON.stringify(namesFile)}).toList
  let prefixes := (← IO.FS.lines ${JSON.stringify(prefixesFile)}).toList
  let mut cache : Std.HashMap Name NameSet := {}
  let mut owners : Std.HashMap Name Nat := {}
  let mut matched : Std.HashSet String := {}
  for (n, ci) in env.constants.map₁.toList do
    let hits := (printed prefixes n).filter wanted.contains
    if hits.isEmpty then continue
    let some m := modOf env n | continue
    matched := matched.insertMany hits
    match ci with
    | .defnInfo _ =>
      let exposed ← match cache[m]? with
        | some e => pure e
        | none => do let e ← exposedIn m; cache := cache.insert m e; pure e
      unless exposed.contains n do owners := owners.insert m (owners.getD m 0 + 1)
    | _ => pure ()
  IO.println s!"MATCHED {matched.size} of {wanted.size}"
  for w in wanted.toList do
    unless matched.contains w do IO.println s!"UNMATCHED {w}"
  for (m, k) in owners.toList do IO.println s!"OWNER {m} {k}"
`;
}

/** Runs `lean` on a path relative to the repository root, resolving to its exit status and combined output. */
export type LeanRunner = (file: string) => Promise<{ status: number; output: string }>;

/**
 * The exact owners of `file` (relative to `root`), computed through `lean`, which reads the generated files as
 * `.lake/fixture-owners/…`; `hostDirectory` is where they are written, for a runner whose `.lake` lives elsewhere.
 */
export async function fixtureOwners(root: string, file: string, lean: LeanRunner,
  hostDirectory = path.join(root, ".lake/fixture-owners")): Promise<{ owners: string[]; unmatched: string[] }> {
  const text = readFileSync(path.join(root, file), "utf8");
  const header = leanHeader(text);
  if (!header.isModule) throw new Error(`${file} is not a module: a plain file already sees every body`);
  const module = file.replace(/\.lean$/u, "").replaceAll("/", ".");
  const directory = ".lake/fixture-owners";
  mkdirSync(hostDirectory, { recursive: true });
  const probe = `${directory}/${module}.lean`;
  writeFileSync(path.join(hostDirectory, `${module}.lean`), plainProbeVariant(text));
  const probed = await lean(probe);
  if (probed.status !== 0) throw new Error(`the plain probe of ${file} failed (status ${probed.status}):\n${probed.output.slice(0, 4000)}`);
  writeFileSync(path.join(hostDirectory, `${module}.names`), unfoldedNames(probed.output).join("\n"));
  writeFileSync(path.join(hostDirectory, `${module}.prefixes`), namePrefixes(text).join("\n"));
  const query = `${directory}/${module}.Owners.lean`;
  writeFileSync(path.join(hostDirectory, `${module}.Owners.lean`), ownerQuerySource(header.imports.map(({ module: target }) => target),
    `${directory}/${module}.names`, `${directory}/${module}.prefixes`));
  const queried = await lean(query);
  if (queried.status !== 0) throw new Error(`the owner query of ${file} failed (status ${queried.status}):\n${queried.output.slice(0, 4000)}`);
  return ownerReport(queried.output, module);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const at = args.indexOf("--deadline-seconds");
  const deadline = at === -1 ? 1800 : Number(args.splice(at, 2)[1]);
  const [file] = args;
  if (file === undefined || args.length !== 1 || !Number.isInteger(deadline) || deadline < 1) {
    throw new Error("usage: node scripts/lean-fixture-owners.ts [--deadline-seconds 1800] <Module.lean>");
  }
  const leanArgs = leanArguments(readFileSync("lakefile.toml", "utf8"));
  const lean: LeanRunner = (target) => new Promise((resolve) => {
    const child = spawn("./scripts/lake.sh", ["env", "lean", ...leanArgs, target], { timeout: deadline * 1000 });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", () => resolve({ status: 127, output }));
    child.on("close", (code) => resolve({ status: code ?? 1, output }));
  });
  const { owners, unmatched } = await fixtureOwners(".", file, lean);
  process.stdout.write(`${importAllLines(owners)}\n`);
  if (unmatched.length > 0) process.stderr.write(`names placed in no module (local, generated or core): ${unmatched.join(" ")}\n`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) await main();

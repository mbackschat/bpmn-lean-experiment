import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Every workspace package must be compiled by a gate that needs no database.
 *
 * A package compiled only by a database-backed lane is never type-checked during ordinary work: the
 * local loop is deliberately database-free, so on a machine between pushes that lane simply does not
 * run. The recovery worker sat broken for four days in exactly that gap — a reviewed change removed
 * a constructor option and left its caller passing it, while the package's only compile lane was
 * the PostgreSQL one. Its tests stayed green throughout, because Node strips types without checking
 * them, so nothing anywhere reported a package that would not build.
 *
 * The oracle is the workspace dependency graph, not a list of package names: a `--filter name...`
 * builds that package and its transitive workspace dependencies, so coverage is derived and a newly
 * added package needs no edit here.
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

type Manifest = Readonly<{
  name: string;
  scripts: ReadonlyMap<string, string>;
  workspaceDependencies: ReadonlySet<string>;
}>;

const frozenLegacyPrefix = "adoption/a12/legacy/source-tree/";

function readJson(relativePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path.join(projectRoot, relativePath), "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new TypeError(`${relativePath} is not an object`);
  }
  return parsed as Record<string, unknown>;
}

function stringMap(value: unknown): ReadonlyMap<string, string> {
  if (typeof value !== "object" || value === null) return new Map();
  return new Map(
    Object.entries(value as Record<string, unknown>).flatMap(
      ([key, entry]) => typeof entry === "string" ? [[key, entry] as const] : [],
    ),
  );
}

function manifests(): ReadonlyMap<string, Manifest> {
  const tracked = execFileSync("git", ["ls-files", "*package.json"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).split("\n").filter((line) => line.length > 0 && !line.startsWith(frozenLegacyPrefix));
  const byName = new Map<string, Manifest>();
  for (const file of tracked) {
    const parsed = readJson(file);
    const name = typeof parsed["name"] === "string" ? parsed["name"] : "";
    const key = path.dirname(file) === "." ? "" : name;
    const workspaceDependencies = new Set(
      ["dependencies", "devDependencies"].flatMap((field) =>
        [...stringMap(parsed[field])].flatMap(([dependency, range]) =>
          range.startsWith("workspace:") ? [dependency] : []
        )
      ),
    );
    byName.set(key, { name, scripts: stringMap(parsed["scripts"]), workspaceDependencies });
  }
  return byName;
}

/** A package plus every workspace dependency `--filter name...` also builds. */
function dependencyClosure(name: string, byName: ReadonlyMap<string, Manifest>): ReadonlySet<string> {
  const reached = new Set<string>();
  const pending = [name];
  while (pending.length > 0) {
    const next = pending.pop();
    if (next === undefined || reached.has(next)) continue;
    reached.add(next);
    pending.push(...(byName.get(next)?.workspaceDependencies ?? []));
  }
  return reached;
}

/**
 * Packages a root script builds, following `pnpm <script>` edges and the shell scripts a gate runs.
 *
 * Reading the shell scripts is load-bearing: `verify.sh` is where the differential build is invoked,
 * so a walker that only follows manifest text concludes that package is built by nothing.
 */
function packagesBuiltBy(root: string, byName: ReadonlyMap<string, Manifest>): ReadonlySet<string> {
  const rootScripts = byName.get("")?.scripts ?? new Map<string, string>();
  const built = new Set<string>();
  const visited = new Set<string>();
  const pending = [root];
  while (pending.length > 0) {
    const script = pending.pop();
    if (script === undefined || visited.has(script)) continue;
    visited.add(script);
    const command = rootScripts.get(script);
    const body = command ?? readShellScript(script);
    if (body === undefined) continue;
    for (const [, next] of body.matchAll(/pnpm(?:\.sh)? (?:run )?([a-z0-9:_-]+)/gu)) {
      if (next !== undefined) pending.push(next);
    }
    for (const [, shell] of body.matchAll(/\.\/(scripts\/[\w.-]+\.sh)/gu)) {
      if (shell !== undefined) pending.push(shell);
    }
    // Every `--filter` in one command shares that command's trailing script, so the trailing token
    // decides whether these filters build. Requiring adjacency instead misses every chained filter,
    // which is how the real build commands are written.
    const trailing = /(?:run\s+)?([a-z0-9:_-]+)\s*$/u.exec(body.trim());
    if (trailing?.[1] !== "build") continue;
    for (const [, name, ellipsis] of body.matchAll(/--filter ([@\w/.-]+?)(\.\.\.)?(?=\s|$)/gu)) {
      if (name === undefined) continue;
      for (const reached of ellipsis === undefined ? [name] : dependencyClosure(name, byName)) {
        built.add(reached);
      }
    }
  }
  return built;
}

function readShellScript(candidate: string): string | undefined {
  if (!candidate.endsWith(".sh")) return undefined;
  try {
    return readFileSync(path.join(projectRoot, candidate), "utf8");
  } catch {
    return undefined;
  }
}

const databaseFreeGates = [
  "test:pre-push:verify",
  "test:pre-push:platform",
  "test:pre-push:ui",
  "test:pre-push:showcase",
];

test("every buildable package is compiled by a gate that needs no database", () => {
  const byName = manifests();
  const buildable = [...byName]
    .flatMap(([key, manifest]) => key !== "" && manifest.scripts.has("build") ? [key] : [])
    .toSorted();
  const compiled = new Set(
    databaseFreeGates.flatMap((gate) => [...packagesBuiltBy(gate, byName)]),
  );

  assert.deepEqual(buildable.filter((name) => !compiled.has(name)), []);
  // Anti-vacuity: an empty or tiny buildable set, or a closure that silently reached nothing, would
  // make the assertion above pass while measuring no package at all.
  assert.ok(buildable.length > 20, `expected the workspace, found ${buildable.length} packages`);
  assert.ok(
    compiled.has("@bpmn-lean/platform-recovery-worker"),
    "the package this guard exists for must be covered",
  );
});

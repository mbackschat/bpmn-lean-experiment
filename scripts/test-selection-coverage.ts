import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Which tracked test files a gate command actually selects.
 *
 * A test file that no command names is not a weak test, it is zero evidence: it costs review and
 * maintenance, reports nothing, and looks identical to a covered file in every listing. This module
 * exists because that state is invisible by construction — a green gate cannot report the files it
 * never ran.
 *
 * Selection is decided by reachability from a gate root, not by whether some command names the file.
 * The weaker name-matching form shipped first and missed a real case: two recovery packages declared
 * `test:built` scripts naming their own tests, so the files looked selected, while nothing invoked
 * those scripts. Nine tests ran nowhere, and one of the packages had stopped compiling entirely
 * because a reviewed change removed a constructor option and no lane ever built the caller.
 *
 * A gate root is a root-manifest script named by a tracked shell script or CI workflow. Reachability
 * follows both `pnpm <script>` edges within the root manifest and `pnpm --filter <package> [run]
 * <script>` edges into workspace manifests. Omitting the filter edges is not a small error: it
 * reported two hundred and twenty-eight false orphans, nearly every platform test in the repository.
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const testFilePattern = /\.(?:test|platform-test|temporal-test|temporal-serial-test)\.ts$/u;

/**
 * TypeScript path tokens inside a command string, glob metacharacters included.
 *
 * Deliberately loose: a token that is not a real path simply matches no test file, whereas a
 * pattern tight enough to reject those would also reject the shell quoting and `--filter` syntax
 * the commands actually use.
 */
const typeScriptPathToken = /[A-Za-z0-9_@./*-]*\.ts\b/gu;

const legacyManifestPath = "adoption/a12/legacy/manifest.json";

function trackedFiles(): ReadonlyArray<string> {
  return execFileSync("git", ["ls-files"], { cwd: projectRoot, encoding: "utf8" })
    .split("\n")
    .filter((line) => line.length > 0);
}

/**
 * The frozen A12 legacy source tree, read from its own manifest rather than matched by path prefix.
 *
 * These files are immutable evidence under the no-discard owner decision, so they must never run.
 * The manifest is their existing owner; a second hardcoded prefix here would be a copy that nothing
 * compares, and it would silently stop excluding them if the tree ever moved.
 */
function frozenPaths(): ReadonlySet<string> {
  const manifest: unknown = JSON.parse(
    readFileSync(path.join(projectRoot, legacyManifestPath), "utf8"),
  );
  if (typeof manifest !== "object" || manifest === null || !("entries" in manifest)) {
    throw new TypeError(`${legacyManifestPath} is missing its entries`);
  }
  const { entries } = manifest as { entries: unknown };
  if (!Array.isArray(entries)) {
    throw new TypeError(`${legacyManifestPath} entries must be a list`);
  }
  return new Set(
    entries.flatMap((entry: unknown) =>
      typeof entry === "object" && entry !== null && "frozenPath" in entry &&
        typeof (entry as { frozenPath: unknown }).frozenPath === "string"
        ? [(entry as { frozenPath: string }).frozenPath]
        : []
    ),
  );
}

/** Every tracked test file a gate is expected to reach. */
export function runnableTestFiles(): ReadonlyArray<string> {
  const frozen = frozenPaths();
  return trackedFiles().filter((file) => testFilePattern.test(file) && !frozen.has(file));
}

type Manifest = Readonly<{ directory: string; scripts: ReadonlyMap<string, string> }>;

function readScripts(file: string): ReadonlyMap<string, string> {
  const manifest: unknown = JSON.parse(readFileSync(path.join(projectRoot, file), "utf8"));
  const scripts = typeof manifest === "object" && manifest !== null && "scripts" in manifest
    ? (manifest as { scripts: unknown }).scripts
    : undefined;
  if (typeof scripts !== "object" || scripts === null) {
    return new Map();
  }
  return new Map(
    Object.entries(scripts as Record<string, unknown>).flatMap(
      ([name, command]) => typeof command === "string" ? [[name, command] as const] : [],
    ),
  );
}

/** Every workspace manifest by package name, plus the root manifest under the empty name. */
function manifests(): ReadonlyMap<string, Manifest> {
  const byName = new Map<string, Manifest>();
  for (const file of trackedFiles()) {
    if (path.basename(file) !== "package.json") continue;
    const parsed: unknown = JSON.parse(readFileSync(path.join(projectRoot, file), "utf8"));
    const name = typeof parsed === "object" && parsed !== null && "name" in parsed &&
        typeof (parsed as { name: unknown }).name === "string"
      ? (parsed as { name: string }).name
      : "";
    const directory = path.dirname(file);
    byName.set(directory === "." ? "" : name, { directory, scripts: readScripts(file) });
  }
  return byName;
}

/**
 * Root-manifest scripts a tracked shell script or CI workflow invokes.
 *
 * These are the only entry points that run without a contributor choosing to type them, so a test
 * reachable from none of them has no automatic coverage regardless of how many manifests name it.
 */
function gateRoots(root: Manifest): ReadonlySet<string> {
  const roots = new Set<string>();
  for (const file of trackedFiles()) {
    if (!/\.(?:sh|ya?ml)$/u.test(file)) continue;
    const body = readFileSync(path.join(projectRoot, file), "utf8");
    for (const [, name] of body.matchAll(/pnpm(?:\.sh)? run ([a-z0-9:_-]+)/gu)) {
      if (name !== undefined && root.scripts.has(name)) roots.add(name);
    }
  }
  return roots;
}

/** Tracked non-test TypeScript sources, so a command naming a runner can be followed into it. */
function runnerSourceBodies(): ReadonlyMap<string, string> {
  return new Map(
    trackedFiles()
      .filter((file) => file.endsWith(".ts") && !testFilePattern.test(file))
      .map((file) => [file, readFileSync(path.join(projectRoot, file), "utf8")] as const),
  );
}

/**
 * The tracked source a command's runner token refers to.
 *
 * `pnpm --filter <package> exec node test/run-suites.ts` runs with the filtered package as the
 * working directory, so the token does not resolve against the manifest that named it. A unique
 * suffix match recovers that case; an ambiguous one is refused rather than guessed, because picking
 * the wrong file would silently mark tests covered that nothing runs.
 */
function resolveRunner(
  base: string,
  token: string,
  sources: ReadonlyMap<string, string>,
): string | undefined {
  const direct = path.normalize(path.join(base, token));
  if (sources.has(direct)) return direct;
  const suffix = `/${token}`;
  const matches = [...sources.keys()].filter((file) => file.endsWith(suffix));
  return matches.length === 1 ? matches[0] : undefined;
}

/** Test-file path tokens reachable from the given root-manifest scripts. */
function reachableTokens(
  selectRoots: (root: Manifest) => Iterable<string>,
): ReadonlyArray<Readonly<{ base: string; token: string }>> {
  const byName = manifests();
  const runnerSources = runnerSourceBodies();
  const root = byName.get("") ?? { directory: "", scripts: new Map<string, string>() };
  const tokens: Array<{ base: string; token: string }> = [];
  const visited = new Set<string>();
  const pending = [...selectRoots(root)].map((script) => ({ packageName: "", script }));

  while (pending.length > 0) {
    const next = pending.pop();
    if (next === undefined) continue;
    const key = `${next.packageName}\u0000${next.script}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const manifest = byName.get(next.packageName);
    const command = manifest?.scripts.get(next.script);
    if (manifest === undefined || command === undefined) continue;
    for (const [token] of command.matchAll(typeScriptPathToken)) {
      tokens.push({ base: manifest.directory, token });
      // A command naming a non-test module is invoking a runner, and the runner names the tests it
      // spawns. `scripts/test-pipeline.ts` is the case that matters: without this edge its whole
      // differential lane reads as unreachable.
      if (!testFilePattern.test(token)) {
        const runner = resolveRunner(manifest.directory, token, runnerSources);
        const body = runner === undefined ? undefined : runnerSources.get(runner);
        if (runner !== undefined && body !== undefined && !visited.has(runner)) {
          visited.add(runner);
          for (const [nested] of body.matchAll(typeScriptPathToken)) {
            tokens.push({ base: path.dirname(runner), token: nested });
          }
          // A runner may carry its fan-out as data rather than as a command string: the PostgreSQL
          // suite runner holds ten package names in a frozen array and spawns `--filter <name> run
          // test:postgresql:built` for each. Pairing the string literals that name a workspace
          // package with those that name one of its scripts recovers those edges. It can admit a
          // pair the runner never actually spawns, which widens coverage rather than narrowing it;
          // without it, twenty database tests read as unreachable when they are not.
          const literals = new Set(
            [...body.matchAll(/"([^"\n]+)"/gu)].flatMap(([, value]) =>
              value === undefined ? [] : [value]
            ),
          );
          // Only for a runner that demonstrably spawns workspace filters. Without this the pairing
          // matches any file that happens to mention a package and a script name, which marked the
          // database tests automatically covered when no ordinary gate runs them at all.
          const spawnsFilters = literals.has("--filter");
          for (const candidate of spawnsFilters ? literals : []) {
            const target = byName.get(candidate);
            if (target === undefined) continue;
            for (const script of literals) {
              if (target.scripts.has(script)) pending.push({ packageName: candidate, script });
            }
          }
        }
      }
    }
    for (const [, script] of command.matchAll(/pnpm (?:run )?([a-z0-9:_-]+)/gu)) {
      if (script !== undefined) pending.push({ packageName: "", script });
    }
    // `--filter <package>[...] [--if-present] [run] <script>` crosses into a workspace manifest.
    // Dropping this edge understates coverage catastrophically rather than subtly.
    for (
      const [, packageName, script] of command.matchAll(
        /--filter ([@\w/.-]+?)(?:\.\.\.)?(?:\s+--if-present)?\s+(?:run\s+)?([a-z0-9:_-]+)/gu,
      )
    ) {
      if (packageName !== undefined && script !== undefined) pending.push({ packageName, script });
    }
  }
  return tokens;
}

function globToPattern(candidate: string): RegExp {
  const escaped = candidate.replaceAll(/[.+^${}()|[\]\\]/gu, String.raw`\$&`);
  return new RegExp(`^${escaped.replaceAll("*", "[^/]*")}$`, "u");
}

/**
 * Test files no tracked command names.
 *
 * The result is the finding itself, not a boolean, so the guard can require an exact set: a file
 * that leaves the list forces the recorded set to change in the same commit, and a newly orphaned
 * file cannot hide behind an unchanged count.
 */
function unreachable(
  selectRoots: (root: Manifest) => Iterable<string>,
): ReadonlyArray<string> {
  const runnable = runnableTestFiles();
  const selected = new Set<string>();
  for (const { base, token } of reachableTokens(selectRoots)) {
    const candidates = new Set([token, path.normalize(path.join(base, token))]);
    for (const candidate of candidates) {
      const pattern = globToPattern(candidate);
      for (const file of runnable) {
        if (pattern.test(file)) {
          selected.add(file);
        }
      }
    }
  }
  return runnable.filter((file) => !selected.has(file)).toSorted();
}

/**
 * Test files no automatically invoked gate reaches.
 *
 * Every lane counts, including the PostgreSQL suites, which a workflow runs against a real database
 * even though the ordinary local loop stays database-free. The result is the finding itself, not a
 * boolean, so the guard can require an exact empty set rather than a bound that decays.
 */
export function unselectedTestFiles(): ReadonlyArray<string> {
  return unreachable(gateRoots);
}

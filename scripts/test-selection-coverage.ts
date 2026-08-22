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
 * Selection is decided by whether some tracked command *names* the file, directly or through a
 * glob. That deliberately over-approximates real reachability: a file named only by a command no
 * other command calls counts as selected here. The under-approximation would need a shell and pnpm
 * evaluator, and the defect this guards is a file named by nothing at all.
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const testFilePattern = /\.(?:test|platform-test|temporal-test)\.ts$/u;

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

/**
 * Command strings a contributor or CI can invoke.
 *
 * Manifest scripts resolve against their own package directory, while a shell script or workflow
 * names repository-relative paths, so each token is tried both ways rather than assuming one root.
 */
function commandTokens(): ReadonlyArray<Readonly<{ base: string; token: string }>> {
  const tokens: Array<{ base: string; token: string }> = [];
  for (const file of trackedFiles()) {
    const base = path.dirname(file);
    let commands: ReadonlyArray<string>;
    if (path.basename(file) === "package.json") {
      const manifest: unknown = JSON.parse(readFileSync(path.join(projectRoot, file), "utf8"));
      const scripts = typeof manifest === "object" && manifest !== null && "scripts" in manifest
        ? (manifest as { scripts: unknown }).scripts
        : undefined;
      commands = typeof scripts === "object" && scripts !== null
        ? Object.values(scripts as Record<string, unknown>).filter(
          (value): value is string => typeof value === "string",
        )
        : [];
    } else if (
      // A test file is not a command surface. Scanning one lets this guard read its own recorded
      // pending list as proof that those files are selected, which made it report zero orphans
      // while thirty-six were unwired.
      !testFilePattern.test(file) &&
      (/\.(?:sh|ya?ml)$/u.test(file) || file.startsWith("scripts/"))
    ) {
      commands = [readFileSync(path.join(projectRoot, file), "utf8")];
    } else {
      continue;
    }
    for (const command of commands) {
      for (const [token] of command.matchAll(typeScriptPathToken)) {
        tokens.push({ base, token });
      }
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
export function unselectedTestFiles(): ReadonlyArray<string> {
  const runnable = runnableTestFiles();
  const selected = new Set<string>();
  for (const { base, token } of commandTokens()) {
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

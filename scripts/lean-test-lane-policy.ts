import path from "node:path";

export type CommandSurface = Readonly<{
  relativePath: string;
  source: string;
}>;

const directProgrammaticLeanInvocation = /\b(?:execFile(?:Async|Sync)?|spawn(?:Sync)?|runCommand|runProcess)\s*\(\s*["'](?:lake|(?:\.\.\/)*scripts\/lake\.sh|\.\/scripts\/lake\.sh)["']/u;
const indirectProgrammaticLeanInvocation = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*["'](?:lake|(?:\.\.\/)*scripts\/lake\.sh|\.\/scripts\/lake\.sh)["'];[\s\S]*?\b(?:execFile(?:Async|Sync)?|spawn(?:Sync)?|runCommand|runProcess)\s*\(\s*\1\b/u;
const relativeTypescriptImport = /(?:\bfrom\s+|\bimport\s*\()\s*["'](\.\.?\/[^"']+)["']/gu;

function hasProgrammaticLeanInvocation(source: string): boolean {
  return directProgrammaticLeanInvocation.test(source) ||
    indirectProgrammaticLeanInvocation.test(source);
}

export function programmaticBareLeanInvocationFindings(
  surfaces: ReadonlyArray<CommandSurface>,
): ReadonlyArray<string> {
  return surfaces
    .filter(({ source }) => hasProgrammaticLeanInvocation(source))
    .filter(({ source }) =>
      /(?:\(\s*["']lake["']|\bconst\s+[A-Za-z_$][\w$]*\s*=\s*["']lake["'])/u.test(source)
    )
    .map(({ relativePath }) => relativePath);
}

function importedTypescriptPaths(
  relativePath: string,
  source: string,
  knownPaths: ReadonlySet<string>,
): ReadonlyArray<string> {
  return [...source.matchAll(relativeTypescriptImport)].flatMap((match) => {
    const specifier = match[1];
    if (specifier === undefined) {
      return [];
    }
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(relativePath), specifier),
    );
    for (const candidate of [
      resolved,
      `${resolved}.ts`,
      resolved.replace(/\.js$/u, ".ts"),
      path.posix.join(resolved, "index.ts"),
    ]) {
      if (knownPaths.has(candidate)) {
        return [candidate];
      }
    }
    return [];
  });
}

/**
 * Finds entrypoints that invoke Lean themselves or through their direct command helper.
 *
 * The CI partition is about executable package-test commands, not every symbol reachable through an
 * aggregate module. Following arbitrary transitive imports would classify catalog-only tests as Lean
 * executions merely because their shared target module also exports a Lean runner.
 */
export function leanDependentEntrypoints(
  surfaces: ReadonlyArray<CommandSurface>,
  entrypoints: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const sources = new Map(
    surfaces.map(({ relativePath, source }) => [relativePath, source]),
  );
  const knownPaths = new Set(sources.keys());

  return entrypoints.filter((entrypoint) => {
    const source = sources.get(entrypoint);
    if (source === undefined) {
      return false;
    }
    return hasProgrammaticLeanInvocation(source) ||
      importedTypescriptPaths(entrypoint, source, knownPaths)
        .some((relativePath) => {
          const importedSource = sources.get(relativePath);
          return importedSource !== undefined &&
            hasProgrammaticLeanInvocation(importedSource);
        });
  });
}

export function verificationFunctionBody(source: string, name: string): string {
  const match = source.match(new RegExp(`${name}\\(\\) \\{([\\s\\S]*?)\\n\\}`, "u"));
  if (match === null) {
    throw new TypeError(`${name} is absent from scripts/verify.sh`);
  }
  return match[1] ?? "";
}

export function invokedPnpmGates(source: string): ReadonlyArray<string> {
  return [...source.matchAll(/\.\/scripts\/pnpm\.sh run ([\w:-]+)/gu)]
    .flatMap((match) => match[1] === undefined ? [] : [match[1]]);
}

export function manifestTestEntrypoints(
  command: string,
  worktree: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const candidates = [...command.matchAll(/packages\/[\w./*-]+test\.ts/gu)]
    .flatMap((match) => match[0] === undefined ? [] : [match[0]]);
  return [...new Set(candidates.flatMap((candidate) => {
    if (!candidate.includes("*")) {
      return [candidate];
    }
    const [directory, suffix] = candidate.split("*");
    return worktree.filter((relativePath) =>
      directory !== undefined && suffix !== undefined &&
      relativePath.startsWith(directory) &&
      !relativePath.slice(directory.length).includes("/") &&
      relativePath.endsWith(suffix)
    );
  }))].sort();
}

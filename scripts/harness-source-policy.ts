import { spawnSync } from "node:child_process";

/**
 * Enforces source-only resolution and erasable syntax in directly executed TypeScript.
 *
 * Direct harnesses must resolve package source entry points so a clean checkout has exactly the same
 * inputs as a developed worktree. Runtime bundler URLs and external-package `dist` paths are outside
 * this policy because neither asks TypeScript or Node to resolve project-generated declarations.
 */

const resolvedSpecifierPattern =
  /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/gu;

function importBearingLines(source: string): string[] {
  return source
    .split(/\r?\n/u)
    .filter((line) => !/^\s*["'`]/u.test(line));
}

function isProjectBuildOutput(specifier: string): boolean {
  const projectOwned =
    specifier.startsWith(".") || specifier.startsWith("@bpmn-lean/");
  return projectOwned && /(?:^|\/)dist\//u.test(specifier);
}

export function generatedOutputImports(path: string, source: string): string[] {
  return importBearingLines(source)
    .flatMap((line) => [...line.matchAll(resolvedSpecifierPattern)])
    .flatMap(([, specifier]) => (specifier === undefined ? [] : [specifier]))
    .filter(isProjectBuildOutput)
    .map((specifier) => `${path}: ${specifier}`);
}

export function erasableSyntaxDiagnostics(
  paths: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const result = spawnSync(
    "./node_modules/.bin/tsc",
    [
      "--noEmit",
      "--noResolve",
      "--erasableSyntaxOnly",
      "--pretty",
      "false",
      "--skipLibCheck",
      "--target",
      "ESNext",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      ...paths,
    ],
    {
      encoding: "utf8",
      env: environment,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  return `${result.stdout}${result.stderr}`
    .split(/\r?\n/u)
    .filter((line) => line.includes("error TS1294:"));
}

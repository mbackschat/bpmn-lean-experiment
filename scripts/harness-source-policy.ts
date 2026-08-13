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

type JsonObject = Record<string, unknown>;

function asJsonObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as JsonObject;
}

function exportImportPath(value: unknown, specifier: string): string {
  if (typeof value === "string") {
    return value;
  }
  const conditions = asJsonObject(value, `Export ${specifier}`);
  if (typeof conditions.import !== "string") {
    throw new TypeError(`Export ${specifier} must define one import path`);
  }
  return conditions.import;
}

/** Reports public package exports that a source-only TypeScript harness would resolve through build output. */
export function missingWorkspaceSourceMappings(
  packageName: string,
  packageManifest: unknown,
  typeScriptConfig: unknown,
  sourceRoot: string,
): string[] {
  const manifest = asJsonObject(packageManifest, `Package ${packageName}`);
  const exports = asJsonObject(manifest.exports, `Package ${packageName} exports`);
  const config = asJsonObject(typeScriptConfig, "TypeScript config");
  const compilerOptions = asJsonObject(
    config.compilerOptions,
    "TypeScript compilerOptions",
  );
  const paths = asJsonObject(compilerOptions.paths, "TypeScript paths");

  return Object.entries(exports).flatMap(([exportKey, exportValue]) => {
    if (exportKey !== "." && !/^\.\/[a-z0-9-]+$/u.test(exportKey)) {
      throw new TypeError(`Unsupported package export key: ${exportKey}`);
    }
    const specifier = exportKey === "."
      ? packageName
      : `${packageName}/${exportKey.slice(2)}`;
    const importPath = exportImportPath(exportValue, specifier);
    const relativeSource = /^\.\/dist\/([a-z0-9-]+)\.js$/u.exec(importPath)?.[1];
    if (relativeSource === undefined) {
      throw new TypeError(
        `Export ${specifier} must map one top-level dist JavaScript module`,
      );
    }
    const expected = `${sourceRoot}/${relativeSource}.ts`;
    const actual = paths[specifier];
    return Array.isArray(actual) &&
        actual.length === 1 &&
        actual[0] === expected
      ? []
      : [`${specifier}: expected source mapping ${expected}`];
  });
}

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

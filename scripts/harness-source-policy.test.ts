import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { test } from "node:test";

import { missingWorkspaceSourceMappings } from "./harness-source-policy.ts";

type WorkspacePackage = {
  manifest: unknown;
  name: string;
  sourceRoot: string;
};

function workspacePackages(): WorkspacePackage[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((path) => path === "package.json" || path.endsWith("/package.json"))
    .map((path) => {
      const manifest: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (
        manifest === null ||
        typeof manifest !== "object" ||
        !("name" in manifest) ||
        typeof manifest.name !== "string"
      ) {
        throw new TypeError(`${path} must declare one package name`);
      }
      return {
        manifest,
        name: manifest.name,
        sourceRoot: `./${dirname(path)}/src`,
      };
    });
}

function mappedPackageNames(typeScriptConfig: unknown): ReadonlySet<string> {
  if (
    typeScriptConfig === null ||
    typeof typeScriptConfig !== "object" ||
    !("compilerOptions" in typeScriptConfig) ||
    typeScriptConfig.compilerOptions === null ||
    typeof typeScriptConfig.compilerOptions !== "object" ||
    !("paths" in typeScriptConfig.compilerOptions) ||
    typeScriptConfig.compilerOptions.paths === null ||
    typeof typeScriptConfig.compilerOptions.paths !== "object"
  ) {
    throw new TypeError("TypeScript config must declare compilerOptions.paths");
  }
  return new Set(Object.keys(typeScriptConfig.compilerOptions.paths));
}

test("the source-mapping policy reports every omitted public subpath", () => {
  assert.deepEqual(
    missingWorkspaceSourceMappings(
      "@example/client",
      {
        exports: {
          ".": "./dist/index.js",
          "./alpha": {
            types: "./dist/alpha-client.d.ts",
            import: "./dist/alpha-client.js",
          },
          "./beta": {
            types: "./dist/beta-client.d.ts",
            import: "./dist/beta-client.js",
          },
        },
      },
      {
        compilerOptions: {
          paths: {
            "@example/client": ["./packages/client/src/index.ts"],
          },
        },
      },
      "./packages/client/src",
    ),
    [
      "@example/client/alpha: expected source mapping ./packages/client/src/alpha-client.ts",
      "@example/client/beta: expected source mapping ./packages/client/src/beta-client.ts",
    ],
  );
});

test("source-only harnesses map every export of each mapped workspace package", () => {
  const packages = workspacePackages();
  for (const configPath of [
    "tsconfig.harness.json",
    "tsconfig.platform-harness.json",
  ]) {
    const typeScriptConfig: unknown = JSON.parse(readFileSync(configPath, "utf8"));
    const mappedNames = mappedPackageNames(typeScriptConfig);
    assert.deepEqual(
      packages
        .filter(({ name }) => mappedNames.has(name))
        .flatMap(({ manifest, name, sourceRoot }) =>
          missingWorkspaceSourceMappings(
            name,
            manifest,
            typeScriptConfig,
            sourceRoot,
          )
        ),
      [],
      `${configPath} must map every public export of each source-mapped workspace package`,
    );
  }
});

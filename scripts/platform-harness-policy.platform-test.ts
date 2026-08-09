import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  erasableSyntaxDiagnostics,
  generatedOutputImports,
} from "./harness-source-policy.ts";

function configuredFiles(configPath: string): string[] {
  const shownConfig: unknown = JSON.parse(
    execFileSync(
      "./node_modules/.bin/tsc",
      ["--showConfig", "-p", configPath],
      { encoding: "utf8" },
    ),
  );
  if (
    shownConfig === null ||
    typeof shownConfig !== "object" ||
    !("files" in shownConfig) ||
    !Array.isArray(shownConfig.files) ||
    !shownConfig.files.every((path) => typeof path === "string")
  ) {
    throw new TypeError("TypeScript --showConfig did not return a string file list");
  }
  return shownConfig.files.filter((path) => !path.endsWith(".d.ts"));
}

test("the engine harness excludes every platform source and platform-only test", () => {
  assert.deepEqual(
    configuredFiles("tsconfig.harness.json")
      .filter((path) => path.includes("/platform/") || path.endsWith(".platform-test.ts")),
    [],
  );
  assert.doesNotMatch(readFileSync("scripts/verify.sh", "utf8"), /test:platform|tsconfig\.platform/u);
});

test("the generated-output policy rejects the clean-checkout failure class", () => {
  assert.deepEqual(
    generatedOutputImports(
      "platform/probe.test.ts",
      [
        'import { first } from "../dist/index.js";',
        'const second = await import("@bpmn-lean/platform-definitions/dist/internal.js");',
        'import { Ajv2020 } from "ajv/dist/2020.js";',
        'const bundle = new URL("../dist/server.js", import.meta.url);',
      ].join("\n"),
    ),
    [
      "platform/probe.test.ts: ../dist/index.js",
      "platform/probe.test.ts: @bpmn-lean/platform-definitions/dist/internal.js",
    ],
  );
});

test("the platform harness resolves no project build output", () => {
  const paths = configuredFiles("tsconfig.platform-harness.json");
  assert.ok(paths.some((path) => path.includes("/platform/modules/definitions/test/")));
  assert.ok(paths.some((path) => path.endsWith(".platform-test.ts")));
  assert.deepEqual(
    paths.flatMap((path) => generatedOutputImports(path, readFileSync(path, "utf8"))),
    [],
    "platform harnesses must import package entry points so their type gate is clean-checkout hermetic",
  );
});

test("direct platform harnesses use only erasable syntax", () => {
  assert.deepEqual(
    erasableSyntaxDiagnostics(
      configuredFiles("tsconfig.platform-harness.json")
        .filter((path) => path.includes("/test/") || path.endsWith(".platform-test.ts")),
    ),
    [],
    "Node executes platform harness TypeScript without a transform step",
  );
});

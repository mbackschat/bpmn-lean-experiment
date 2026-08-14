import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

type SourceFile = Readonly<{
  path: string;
  source: string;
}>;

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const modulesRoot = join(projectRoot, "platform/modules");
const webSourceRoot = join(projectRoot, "platform/apps/web/src");
const directJsonParse = /\bJSON\s*\.\s*parse\s*\(/u;
const nativeResponseJson = /\.\s*json\s*\(/u;

export function directJsonParseAtPublicHttpOwners(
  sources: readonly SourceFile[],
): string[] {
  return sources
    .filter(({ path, source }) => isPublicHttpOwner(path) && directJsonParse.test(source))
    .map(({ path }) => `${path}: public HTTP JSON must use parseStrictJson before closed decoding`)
    .sort();
}

export function nativeJsonAtPublicWebApiConsumers(
  sources: readonly SourceFile[],
): string[] {
  return sources
    .filter(({ path, source }) =>
      isPublicWebApiConsumer(path) &&
      (directJsonParse.test(source) || nativeResponseJson.test(source))
    )
    .map(({ path }) => `${path}: public API responses must use parseStrictJson before closed decoding`)
    .sort();
}

test("rejects direct JSON.parse in current and adjacent public HTTP request owners", () => {
  assert.deepEqual(
    directJsonParseAtPublicHttpOwners([
      {
        path: "platform/modules/operate/src/incident-http-routes.ts",
        source: "const value = JSON.parse(source);",
      },
      {
        path: "platform/modules/work/src/claim-http-boundary.ts",
        source: "return JSON . parse (source);",
      },
      {
        path: "platform/modules/work/src/stored-json.ts",
        source: "return JSON.parse(source);",
      },
      {
        path: "platform/apps/server/src/public-http.ts",
        source: "return JSON.parse(source);",
      },
    ]),
    [
      "platform/modules/operate/src/incident-http-routes.ts: public HTTP JSON must use parseStrictJson before closed decoding",
      "platform/modules/work/src/claim-http-boundary.ts: public HTTP JSON must use parseStrictJson before closed decoding",
    ],
  );
});

test("every Product 2 module HTTP request owner uses the shared strict parser", () => {
  assert.deepEqual(
    directJsonParseAtPublicHttpOwners(moduleHttpSources()),
    [],
  );
});

test("rejects native JSON collapse in current and adjacent public web API consumers", () => {
  assert.deepEqual(
    nativeJsonAtPublicWebApiConsumers([
      {
        path: "platform/apps/web/src/definitions-api.ts",
        source: "return response.json();",
      },
      {
        path: "platform/apps/web/src/audit-api.ts",
        source: "return JSON.parse(source);",
      },
      {
        path: "platform/apps/web/src/panel.tsx",
        source: "return response.json();",
      },
    ]),
    [
      "platform/apps/web/src/audit-api.ts: public API responses must use parseStrictJson before closed decoding",
      "platform/apps/web/src/definitions-api.ts: public API responses must use parseStrictJson before closed decoding",
    ],
  );
});

test("every Product 2 public web API response uses the shared strict parser", () => {
  assert.deepEqual(
    nativeJsonAtPublicWebApiConsumers(webApiSources()),
    [],
  );
});

function moduleHttpSources(): SourceFile[] {
  return filesUnder(modulesRoot)
    .filter((path) => isPublicHttpOwner(relative(projectRoot, path)))
    .map((path) => ({
      path: relative(projectRoot, path),
      source: readFileSync(path, "utf8"),
    }));
}

function isPublicHttpOwner(path: string): boolean {
  return /^platform\/modules\/.+\/src\/[^/]*http[^/]*\.ts$/u.test(path);
}

function webApiSources(): SourceFile[] {
  return readdirSync(webSourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(webSourceRoot, entry.name))
    .filter((path) => isPublicWebApiConsumer(relative(projectRoot, path)))
    .map((path) => ({
      path: relative(projectRoot, path),
      source: readFileSync(path, "utf8"),
    }));
}

function isPublicWebApiConsumer(path: string): boolean {
  return path.startsWith("platform/apps/web/src/") &&
    basename(path).endsWith("api.ts");
}

function filesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return entry.isFile() ? [path] : [];
  });
}

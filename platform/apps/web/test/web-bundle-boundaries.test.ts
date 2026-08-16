import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = path.join(webRoot, "dist");
const assetRoot = path.join(distRoot, "assets");
const entryJavaScriptCeilingBytes = 500_000;

type ViteManifestEntry = Readonly<{
  file: string;
  imports?: readonly string[];
  isEntry?: boolean;
}>;

test("keeps Work eager and optional workspaces plus detail-only code deferred", async () => {
  const manifest = JSON.parse(await readFile(
    path.join(distRoot, ".vite/manifest.json"),
    "utf8",
  )) as Readonly<Record<string, ViteManifestEntry>>;
  const entryKey = Object.keys(manifest).find((key) => manifest[key]?.isEntry === true);
  if (entryKey === undefined) throw new Error("production manifest must name one module entry");
  const initialKeys = collectStaticImports(manifest, entryKey);
  const initialPaths = initialKeys.map((key) => path.join(distRoot, manifest[key]!.file));
  const initialBytes = (await Promise.all(initialPaths.map(async (file) => stat(file))))
    .reduce((total, file) => total + file.size, 0);
  const initialSource = (await Promise.all(
    initialPaths.map(async (file) => readFile(file, "utf8")),
  )).join("\n");

  assert.ok(
    initialBytes < entryJavaScriptCeilingBytes,
    `default Work JavaScript graph must stay below ${entryJavaScriptCeilingBytes} bytes`,
  );
  assert.match(initialSource, /Candidate group/u);
  assert.doesNotMatch(initialSource, /bjs-powered-by|http:\/\/bpmn\.io/u);

  const scripts = (await readdir(assetRoot)).filter((name) => name.endsWith(".js"));
  for (const stem of [
    "deferred-definition-workspace",
    "deferred-operations-workspace",
    "capabilities-panel",
    "definition-diagram",
    "structured-work-form",
    "bpmn-js-factory",
    "bpmn-viewer",
  ]) {
    assert.ok(
      scripts.some((name) => name.startsWith(`${stem}-`)),
      `${stem} must own a deferred production chunk`,
    );
  }
  assert.equal(
    scripts.some((name) => name.startsWith("deferred-work-workspace-")),
    false,
  );

  const deferredSource = (await Promise.all(
    scripts
      .filter((name) => !initialPaths.includes(path.join(assetRoot, name)))
      .map(async (name) => readFile(path.join(assetRoot, name), "utf8")),
  )).join("\n");
  assert.match(deferredSource, /bjs-powered-by/u);
  assert.match(deferredSource, /http:\/\/bpmn\.io/u);
});

function collectStaticImports(
  manifest: Readonly<Record<string, ViteManifestEntry>>,
  entryKey: string,
): readonly string[] {
  const collected = new Set<string>();
  const pending = [entryKey];
  while (pending.length > 0) {
    const key = pending.pop()!;
    if (collected.has(key)) continue;
    const entry = manifest[key];
    if (entry === undefined) throw new Error(`manifest import ${key} is absent`);
    collected.add(key);
    pending.push(...(entry.imports ?? []));
  }
  return [...collected];
}

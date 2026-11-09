/**
 * Locks that the `host` and `memory-host` entries declare nothing from the Temporal SDK: the SDK 1.21.0 declarations
 * fail a consumer's lib check under `exactOptionalPropertyTypes` and lack the `ms` types, so a leak would force every
 * engine and platform package to skip lib checks. The oracle is the emitted declaration graph.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const dist = new URL("../dist/", import.meta.url);

async function declarationImports(file: string, seen: Set<string>): Promise<string[]> {
  if (seen.has(file)) return [];
  seen.add(file);
  const text = await readFile(new URL(file, dist), "utf8");
  const specifiers = [...text.matchAll(/from "([^"]+)"/g)].map((match) => match[1] ?? "");
  const external = specifiers.filter((specifier) => !specifier.startsWith("./"));
  const local = specifiers.filter((specifier) => specifier.startsWith("./"));
  const nested = await Promise.all(local.map((specifier) =>
    declarationImports(specifier.slice(2).replace(/\.js$/, ".d.ts"), seen)));
  return [...external, ...nested.flat()];
}

for (const entry of ["host.d.ts", "memory-host.d.ts"]) {
  test(`the ${entry} declaration graph imports nothing from the Temporal SDK`, async () => {
    const external = await declarationImports(entry, new Set());
    assert.deepEqual(external.filter((specifier) => specifier.startsWith("@temporalio/")), []);
  });
}

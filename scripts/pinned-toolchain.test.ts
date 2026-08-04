import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCommand } from "./run-command.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * Files that must derive both pins from the single owner rather than restate them.
 *
 * Each is asserted to reference `pinned-toolchain.sh`, because a consumer that stops
 * deriving is the regression this list exists to catch.
 */
const derivedConsumers = [
  "scripts/pnpm.sh",
  "scripts/doctor.sh",
  ".github/workflows/verify.yml",
] as const;

/** Prose that states the pins for contributors and therefore must state the current ones. */
const documentedPins = [
  "README.md",
  "docs/CONTRIBUTOR-SETUP-GUIDE.md",
  "docs/IMPLEMENTATION-MAP.md",
  "docs/SOURCES.md",
] as const;

/**
 * Matches only pin phrasing — the version directly after the tool name, separated by
 * spaces, backticks, or `@`. Two exclusions are deliberate: a declared range such as
 * Node `>=20.3.0` is not a pin statement, and the lookbehind keeps a package whose
 * name merely ends in the tool name, such as `@types/node`, from being read as one.
 */
function pinnedVersions(text: string, tool: RegExp): readonly string[] {
  const pattern = new RegExp(
    `(?<![\\w/@-])${tool.source}[ \`@]+\`?(\\d+\\.\\d+\\.\\d+)`,
    "gu",
  );
  return [...text.matchAll(pattern)].map(([, version]) => version ?? "");
}

async function readProjectFile(relativePath: string): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

type ManifestPins = Readonly<{ node: string; pnpm: string }>;

async function ownerPins(): Promise<ManifestPins> {
  const manifest = JSON.parse(await readProjectFile("package.json")) as Readonly<{
    packageManager: string;
    engines: Readonly<Record<string, string>>;
  }>;
  const [manager, pnpmVersion] = manifest.packageManager.split("@");
  assert.equal(manager, "pnpm");
  assert.match(pnpmVersion ?? "", /^\d+\.\d+\.\d+$/u);
  assert.match(manifest.engines.node ?? "", /^\d+\.\d+\.\d+$/u);
  return { node: manifest.engines.node ?? "", pnpm: pnpmVersion ?? "" };
}

test("resolves the manifest pins for shell consumers", async () => {
  const pins = await ownerPins();
  const resolved = await runCommand("./scripts/pinned-toolchain.sh", [], {
    cwd: projectRoot,
    env: process.env,
    timeoutMs: 10_000,
  });

  // Locks the script's own manifest reader against a `package.json` shape change:
  // a second `"node"` key or a reordered `packageManager` would drift here first.
  assert.equal(
    resolved.stdout,
    `required_node_version=${pins.node}\nrequired_pnpm_version=${pins.pnpm}\n`,
  );
});

test("keeps every machine-readable pin copy on the owner's versions", async () => {
  const pins = await ownerPins();
  const manifest = JSON.parse(await readProjectFile("package.json")) as Readonly<{
    engines: Readonly<Record<string, string>>;
  }>;

  assert.equal(manifest.engines.pnpm, pins.pnpm);
  for (const nodeSelector of [".nvmrc", ".node-version"]) {
    assert.equal((await readProjectFile(nodeSelector)).trim(), pins.node);
  }
});

test("derives the pins in every wrapper, doctor, and CI consumer", async () => {
  const pins = await ownerPins();

  for (const consumer of derivedConsumers) {
    const text = await readProjectFile(consumer);
    assert.match(text, /pinned-toolchain\.sh/u, consumer);
    assert.deepEqual(pinnedVersions(text, /pnpm/u), [], consumer);
    assert.deepEqual(pinnedVersions(text, /[Nn]ode/u), [], consumer);
  }

  // Anti-vacuity: the regex must actually find the pins it is asked to compare, or
  // this guard would pass on prose that never mentions a version at all.
  for (const document of documentedPins) {
    const text = await readProjectFile(document);
    const statedPnpm = pinnedVersions(text, /pnpm/u);
    const statedNode = pinnedVersions(text, /[Nn]ode/u);
    assert.ok(statedPnpm.length > 0, `${document} states no pnpm pin`);
    assert.ok(statedNode.length > 0, `${document} states no Node pin`);
    assert.deepEqual(new Set(statedPnpm), new Set([pins.pnpm]), document);
    assert.deepEqual(new Set(statedNode), new Set([pins.node]), document);
  }
});

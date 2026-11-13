import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

type Scripts = Readonly<Record<string, string>>;
type Leaf = Readonly<{ packageDir: string; command: string }>;

const readJson = async <T>(relativePath: string): Promise<T> =>
  JSON.parse(await readFile(path.join(projectRoot, relativePath), "utf8")) as T;

/** Workspace package directories by package name, for `pnpm --filter <name>`. */
async function packageDirs(): Promise<Map<string, string>> {
  const dirs = new Map<string, string>();
  for (const entry of await readdir(path.join(projectRoot, "showcase"))) {
    const manifest = await readJson<{ name: string }>(`showcase/${entry}/package.json`).catch(() => null);
    if (manifest !== null) dirs.set(manifest.name, `showcase/${entry}`);
  }
  return dirs;
}

/**
 * The commands a script finally runs, following `pnpm <script>`, `pnpm run <script>` and
 * `pnpm --filter <package> <script>` through the root and showcase package manifests.
 */
async function leaves(packageDir: string, script: string, dirs: ReadonlyMap<string, string>): Promise<Leaf[]> {
  const scripts = (await readJson<{ scripts?: Scripts }>(`${packageDir === "" ? "" : `${packageDir}/`}package.json`)).scripts ?? {};
  const body = scripts[script];
  assert.ok(body !== undefined, `${packageDir || "root"} has no script ${script}`);
  const found: Leaf[] = [];
  for (const part of body.split("&&").map((command) => command.trim().replace(/^(?:env\s+)?(?:[A-Z_]+=\S+\s+)+/u, ""))) {
    const own = /^pnpm (?:run )?([\w:.-]+)$/u.exec(part);
    const filtered = /^pnpm --filter (\S+) (?:exec )?(.+)$/u.exec(part);
    if (own !== null && scripts[own[1]!] !== undefined) found.push(...await leaves(packageDir, own[1]!, dirs));
    else if (filtered !== null && dirs.has(filtered[1]!)) {
      const target = dirs.get(filtered[1]!)!;
      const targetScripts = (await readJson<{ scripts?: Scripts }>(`${target}/package.json`)).scripts ?? {};
      if (targetScripts[filtered[2]!] !== undefined) found.push(...await leaves(target, filtered[2]!, dirs));
      else found.push({ packageDir: target, command: filtered[2]! });
    } else found.push({ packageDir, command: part });
  }
  return found;
}

/** Whether a Playwright leaf runs `spec` (a file under the package's `e2e/`) under its default configuration. */
async function runs(leaf: Leaf, spec: string): Promise<boolean> {
  if (!leaf.command.startsWith("playwright test")) return false;
  const files = leaf.command.split(/\s+/u).filter((word) => word.endsWith(".spec.ts"));
  if (leaf.command.includes("--config")) return files.includes(spec);
  if (files.length > 0) return files.includes(spec);
  const config = await readFile(path.join(projectRoot, leaf.packageDir, "playwright.config.ts"), "utf8");
  const ignore = /testIgnore: "\*\*\/([^"]+)"/u.exec(config)?.[1];
  return ignore === undefined || !new RegExp(`^${ignore.replace(/[.]/gu, "\\.").replace(/\*/gu, ".*")}$`, "u").test(spec);
}

/**
 * The root scripts the UI quality workflow runs for release acceptance: every `./scripts/pnpm.sh run` of a job gated on
 * `inputs.release_acceptance == true`, or of a step so gated.
 */
async function releaseScripts(): Promise<string[]> {
  const workflow = await readFile(path.join(projectRoot, ".github/workflows/ui-quality.yml"), "utf8");
  const gate = "inputs.release_acceptance == true";
  const scripts: string[] = [];
  for (const job of workflow.split(/^jobs:$/mu)[1]!.split(/^ {2}(?=[\w-]+:$)/mu).slice(1)) {
    const [header = "", steps = ""] = job.split(/^ {4}steps:$/mu);
    const gated = header.includes(gate) ? [steps] : steps.split(/^ {6}- name:/mu).filter((step) => step.includes(gate));
    for (const step of gated) scripts.push(...[...step.matchAll(/run: \.\/scripts\/pnpm\.sh run (\S+)/gu)].map((match) => match[1]!));
  }
  return scripts;
}

// A catalog journey the release lane never runs would let the corpus borrow a result no lane produces (PC-QUALIFY-01,
// PC-QUALIFY-05); the RC journeys went unrun until 2026-11-13.
test("release acceptance runs every browser journey the model corpus binds", async () => {
  const manifest = await readFile(path.join(projectRoot, "model-corpus/manifest.json"), "utf8");
  const specs = [...new Set([...manifest.matchAll(/"journeyTestRelativePath": "(showcase\/[^"]+)"/gu)].map((match) => match[1]!))];
  assert.ok(specs.length > 0, "the manifest binds browser journeys");
  const scripts = await releaseScripts();
  assert.ok(scripts.includes("test:release:product2"), "release acceptance runs the Product 2 release lane");
  const dirs = await packageDirs();
  const release = (await Promise.all(scripts.map((script) => leaves("", script, dirs)))).flat();
  const unrun: string[] = [];
  for (const spec of specs) {
    const [, packageName, , file] = spec.split("/");
    const candidates = release.filter((leaf) => leaf.packageDir === `showcase/${packageName!}`);
    if (!(await Promise.all(candidates.map((leaf) => runs(leaf, file!)))).some(Boolean)) unrun.push(spec);
  }
  assert.deepEqual(unrun, []);
});

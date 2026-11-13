/**
 * The Temporal boundary of the kernel rewrite: one host package owns every Temporal SDK dependency, each of its
 * execution environments reaches only the SDK that environment may load, and Product 2 reaches Temporal only through
 * `@bpmn-lean/engine-api`.
 *
 * The environments are module closures, not packages: `@bpmn-lean/temporal-host` is one package with one entry per
 * environment, so a closure that crosses environments (a Workflow module importing a Node built-in, the production
 * client reaching the test server) is visible only by following the relative imports from each entry.
 */
import { readdir, readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";

import { typeScriptModuleSpecifiersFromSource } from "./platform-product-boundary.ts";

const hostPackageName = "@bpmn-lean/temporal-host";
const hostRoot = "packages/temporal-host";

/** The workspace packages the host may depend on; the kernel is the only lower layer it executes. */
const hostWorkspaceDependencies: ReadonlySet<string> = new Set(["@bpmn-lean/kernel"]);

/** Every SDK package the host may declare; anything else would widen the deployed closure unreviewed. */
const hostSdkDependencies: ReadonlySet<string> = new Set([
  "@temporalio/activity",
  "@temporalio/client",
  "@temporalio/testing",
  "@temporalio/worker",
  "@temporalio/workflow",
]);

const Environment = {
  Workflow: "workflow",
  Client: "client",
  Host: "host",
  Worker: "worker",
} as const;

type Environment = typeof Environment[keyof typeof Environment];

type EnvironmentPolicy = Readonly<{
  entry: string;
  /** Workflow code runs in the SDK's deterministic sandbox, which has no Node built-ins. */
  nodeBuiltins: boolean;
  allowedSdk: ReadonlySet<string>;
}>;

const environmentPolicies: Readonly<Record<Environment, EnvironmentPolicy>> = {
  [Environment.Workflow]: {
    entry: "src/workflows.ts",
    nodeBuiltins: false,
    allowedSdk: new Set(["@temporalio/workflow"]),
  },
  // The production client and the engine host it serves never reach the Worker, Activity or test-server SDKs.
  [Environment.Client]: {
    entry: "src/client.ts",
    nodeBuiltins: true,
    allowedSdk: new Set(["@temporalio/client", "@temporalio/workflow"]),
  },
  [Environment.Host]: {
    entry: "src/host.ts",
    nodeBuiltins: true,
    allowedSdk: new Set(["@temporalio/client", "@temporalio/workflow"]),
  },
  [Environment.Worker]: {
    entry: "src/worker.ts",
    nodeBuiltins: true,
    allowedSdk: new Set(["@temporalio/activity", "@temporalio/client", "@temporalio/worker", "@temporalio/workflow"]),
  },
};

export async function assessTemporalPackageBoundary(
  repositoryRoot: string,
): Promise<ReadonlyArray<string>> {
  const findings: string[] = [];
  await assessHostManifest(repositoryRoot, findings);
  for (const environment of Object.values(Environment)) {
    await assessEnvironment(repositoryRoot, environment, findings);
  }
  await assessProduct2TemporalReach(repositoryRoot, findings);
  await assessHostQueryReaders(repositoryRoot, findings);
  return findings.sort(compareCodeUnits);
}

/**
 * Only the host package names its Queries: their answers travel as canonical-JSON pages (`textPage`), which its client
 * joins, so a caller that queries a paged host Query by its name reads one page envelope instead of the answer
 * (UI release acceptance run 43385867889, after the paging of 6571514d3).
 */
async function assessHostQueryReaders(repositoryRoot: string, findings: string[]): Promise<void> {
  const hostSource = path.join(repositoryRoot, "packages/temporal-host/src") + path.sep;
  const pagedNames = new Set<string>();
  for (const sourcePath of await filesNamed(hostSource, (name) => name.endsWith(".ts"))) {
    for (const [, name] of (await readFile(sourcePath, "utf8")).matchAll(/defineQuery<TextPage\b[^(]*\(\s*"([^"]+)"/gu)) {
      pagedNames.add(name!);
    }
  }
  for (const directory of ["showcase", "platform", "packages", "scripts"]) {
    for (const sourcePath of await filesNamed(path.join(repositoryRoot, directory), (name) => /\.(?:cts|mts|tsx?)$/u.test(name))) {
      if (sourcePath.startsWith(hostSource)) continue;
      const source = await readFile(sourcePath, "utf8");
      if (!typeScriptModuleSpecifiersFromSource(source).some(isTemporalSpecifier) || !/\.query\s*[<(]/u.test(source)) continue;
      const named = [...source.matchAll(/["'`]([A-Za-z]+)["'`]/gu)].map(([, literal]) => literal!).filter((literal) => pagedNames.has(literal));
      if (named.length > 0) {
        findings.push(`${relative(repositoryRoot, sourcePath)}: queries the paged host Query ${[...new Set(named)].sort(compareCodeUnits).join(", ")} by name; read through ${hostPackageName}/client`);
      }
    }
  }
}

async function assessHostManifest(repositoryRoot: string, findings: string[]): Promise<void> {
  const manifestPath = path.join(repositoryRoot, hostRoot, "package.json");
  const manifest = await readManifest(repositoryRoot, manifestPath, findings);
  if (manifest === undefined) return;
  const label = relative(repositoryRoot, manifestPath);
  if (manifest.name !== hostPackageName) findings.push(`${label}: expected package name ${hostPackageName}`);
  if (manifest.private !== true) {
    findings.push(`${label}: package must remain private before release packaging exists`);
  }
  const dependencies = isRecord(manifest.dependencies) ? manifest.dependencies : {};
  for (const [name, range] of Object.entries(dependencies)) {
    if (name.startsWith("@temporalio/")) {
      if (!hostSdkDependencies.has(name)) findings.push(`${label}: forbidden Temporal SDK dependency ${name}`);
      continue;
    }
    if (name.startsWith("@bpmn-lean/")) {
      if (!hostWorkspaceDependencies.has(name)) findings.push(`${label}: forbidden workspace dependency ${name}`);
      else if (range !== "workspace:*") findings.push(`${label}: ${name} must be an exact workspace dependency`);
    }
  }
  for (const name of hostWorkspaceDependencies) {
    if (!(name in dependencies)) findings.push(`${label}: missing workspace dependency ${name}`);
  }
}

async function assessEnvironment(
  repositoryRoot: string,
  environment: Environment,
  findings: string[],
): Promise<void> {
  const policy = environmentPolicies[environment];
  const entry = path.join(repositoryRoot, hostRoot, policy.entry);
  const pending = [entry];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const modulePath = pending.pop();
    if (modulePath === undefined || seen.has(modulePath)) continue;
    seen.add(modulePath);
    let source: string;
    try {
      source = await readFile(modulePath, "utf8");
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") {
        findings.push(`${relative(repositoryRoot, modulePath)}: ${environment} entry or module is missing`);
        continue;
      }
      throw error;
    }
    const label = relative(repositoryRoot, modulePath);
    for (const specifier of typeScriptModuleSpecifiersFromSource(source)) {
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        pending.push(path.resolve(path.dirname(modulePath), specifier.replace(/\.js$/u, ".ts")));
        continue;
      }
      if (!policy.nodeBuiltins && isBuiltin(specifier)) {
        findings.push(`${label}: ${environment}-reachable Node built-in ${specifier}`);
      }
      if (specifier.startsWith("@temporalio/") && !policy.allowedSdk.has(sdkPackage(specifier))) {
        findings.push(`${label}: ${environment}-reachable Temporal SDK ${specifier}`);
      }
    }
  }
}

/** Product 2 consumes the engine's published contract only, so no platform package names Temporal at all. */
async function assessProduct2TemporalReach(repositoryRoot: string, findings: string[]): Promise<void> {
  const platformRoot = path.join(repositoryRoot, "platform");
  for (const manifestPath of await filesNamed(platformRoot, (name) => name === "package.json")) {
    const manifest = await readManifest(repositoryRoot, manifestPath, findings);
    if (manifest === undefined) continue;
    const label = relative(repositoryRoot, manifestPath);
    for (const field of ["dependencies", "devDependencies"]) {
      const dependencies = isRecord(manifest[field]) ? manifest[field] : {};
      for (const name of Object.keys(dependencies)) {
        if (isTemporalSpecifier(name)) findings.push(`${label}: forbidden Product 2 Temporal dependency ${name}`);
      }
    }
  }
  for (const sourcePath of await filesNamed(platformRoot, (name) => /\.(?:cts|mts|tsx?)$/u.test(name))) {
    const source = await readFile(sourcePath, "utf8");
    for (const specifier of typeScriptModuleSpecifiersFromSource(source)) {
      if (isTemporalSpecifier(specifier)) {
        findings.push(`${relative(repositoryRoot, sourcePath)}: forbidden Product 2 Temporal import ${specifier}`);
      }
    }
  }
}

function isTemporalSpecifier(specifier: string): boolean {
  return specifier.startsWith("@temporalio/") || specifier === hostPackageName ||
    specifier.startsWith(`${hostPackageName}/`);
}

/** `@temporalio/workflow/lib/x` belongs to `@temporalio/workflow`. */
function sdkPackage(specifier: string): string {
  return specifier.split("/").slice(0, 2).join("/");
}

async function filesNamed(directory: string, accepts: (name: string) => boolean): Promise<ReadonlyArray<string>> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(entries.map(async (entry) => {
    if (entry.name === "dist" || entry.name === "node_modules") return [];
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesNamed(entryPath, accepts);
    return entry.isFile() && accepts(entry.name) ? [entryPath] : [];
  }));
  return nested.flat().sort(compareCodeUnits);
}

async function readManifest(
  repositoryRoot: string,
  manifestPath: string,
  findings: string[],
): Promise<Record<string, unknown> | undefined> {
  const label = relative(repositoryRoot, manifestPath);
  let source: string;
  try {
    source = await readFile(manifestPath, "utf8");
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      findings.push(`${label}: required package manifest is missing`);
      return undefined;
    }
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    findings.push(`${label}: package manifest is not valid JSON`);
    return undefined;
  }
  if (!isRecord(value)) {
    findings.push(`${label}: package manifest must be an object`);
    return undefined;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}

function relative(repositoryRoot: string, filePath: string): string {
  return path.relative(repositoryRoot, filePath);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

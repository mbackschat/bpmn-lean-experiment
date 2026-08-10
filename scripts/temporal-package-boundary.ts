import { readdir, readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";

import { typeScriptModuleSpecifiersFromSource } from "./platform-product-boundary.ts";

const PackageRole = {
  Protocol: "protocol",
  Client: "client",
  Workflow: "workflow",
  Worker: "worker",
  Runner: "runner",
  Testkit: "testkit",
} as const;

type PackageRole = typeof PackageRole[keyof typeof PackageRole];

type PackagePolicy = Readonly<{
  name: string;
  internalDependencies: ReadonlyArray<PackageRole>;
  requiredSdkDependencies: ReadonlyArray<string>;
  allowedSdkDependencies: ReadonlyArray<string>;
}>;

const packagePolicies: Readonly<Record<PackageRole, PackagePolicy>> = {
  [PackageRole.Protocol]: {
    name: "@bpmn-lean/temporal-protocol",
    internalDependencies: [],
    requiredSdkDependencies: [],
    allowedSdkDependencies: [],
  },
  [PackageRole.Client]: {
    name: "@bpmn-lean/temporal-client",
    internalDependencies: [PackageRole.Protocol],
    requiredSdkDependencies: ["@temporalio/client"],
    allowedSdkDependencies: ["@temporalio/client"],
  },
  [PackageRole.Workflow]: {
    name: "@bpmn-lean/temporal-workflow",
    internalDependencies: [PackageRole.Protocol],
    requiredSdkDependencies: ["@temporalio/workflow"],
    allowedSdkDependencies: ["@temporalio/workflow"],
  },
  [PackageRole.Worker]: {
    name: "@bpmn-lean/temporal-worker",
    internalDependencies: [
      PackageRole.Protocol,
      PackageRole.Client,
      PackageRole.Workflow,
    ],
    requiredSdkDependencies: ["@temporalio/worker"],
    allowedSdkDependencies: ["@temporalio/worker"],
  },
  [PackageRole.Runner]: {
    name: "@bpmn-lean/temporal-runner",
    internalDependencies: [
      PackageRole.Protocol,
      PackageRole.Client,
      PackageRole.Worker,
    ],
    requiredSdkDependencies: [],
    allowedSdkDependencies: [],
  },
  [PackageRole.Testkit]: {
    name: "@bpmn-lean/temporal-testkit",
    internalDependencies: [
      PackageRole.Protocol,
      PackageRole.Client,
      PackageRole.Workflow,
      PackageRole.Worker,
      PackageRole.Runner,
    ],
    requiredSdkDependencies: ["@temporalio/testing"],
    allowedSdkDependencies: [
      "@temporalio/client",
      "@temporalio/testing",
      "@temporalio/worker",
      "@temporalio/workflow",
    ],
  },
};

export async function assessTemporalPackageBoundary(
  repositoryRoot: string,
): Promise<ReadonlyArray<string>> {
  const findings: string[] = [];
  const subsystemRoot = path.join(
    repositoryRoot,
    "packages",
    "temporal-adapter",
  );
  if (await fileExists(path.join(subsystemRoot, "package.json"))) {
    findings.push(
      "packages/temporal-adapter/package.json: production umbrella package is forbidden",
    );
  }

  for (const role of Object.values(PackageRole)) {
    const policy = packagePolicies[role];
    const manifestPath = path.join(subsystemRoot, role, "package.json");
    const manifest = await readManifest(manifestPath, findings);
    if (manifest === undefined) {
      continue;
    }
    if (manifest.name !== policy.name) {
      findings.push(
        `${relative(repositoryRoot, manifestPath)}: expected package name ${policy.name}`,
      );
    }
    if (manifest.private !== true) {
      findings.push(
        `${relative(repositoryRoot, manifestPath)}: package must remain private before release packaging exists`,
      );
    }
    assessDependencies(
      repositoryRoot,
      manifestPath,
      manifest.dependencies,
      policy,
      findings,
    );
  }
  await assessWorkflowSafeSources(repositoryRoot, subsystemRoot, findings);
  await assessProduct2TemporalDependencies(repositoryRoot, findings);
  return findings.sort(compareCodeUnits);
}

async function assessProduct2TemporalDependencies(
  repositoryRoot: string,
  findings: string[],
): Promise<void> {
  const allowedManifest = "platform/foundation/engine-gateway/package.json";
  const platformRoot = path.join(repositoryRoot, "platform");
  for (const manifestPath of await packageManifestPaths(
    platformRoot,
  )) {
    const manifest = await readManifest(manifestPath, findings);
    if (manifest === undefined) {
      continue;
    }
    const dependencies = isRecord(manifest.dependencies)
      ? manifest.dependencies
      : {};
    const manifestRelativePath = relative(repositoryRoot, manifestPath);
    for (const dependencyName of Object.keys(dependencies)) {
      if (dependencyName.startsWith("@temporalio/")) {
        findings.push(
          `${manifestRelativePath}: forbidden Product 2 Temporal SDK dependency ${dependencyName}`,
        );
        continue;
      }
      if (!dependencyName.startsWith("@bpmn-lean/temporal-")) {
        continue;
      }
      if (
        dependencyName === "@bpmn-lean/temporal-client" &&
        manifestRelativePath === allowedManifest
      ) {
        if (dependencies[dependencyName] !== "workspace:*") {
          findings.push(
            `${manifestRelativePath}: @bpmn-lean/temporal-client must be an exact workspace dependency`,
          );
        }
        continue;
      }
      if (dependencyName === "@bpmn-lean/temporal-client") {
        findings.push(
          `${manifestRelativePath}: Product 2 Temporal dependency ${dependencyName} is allowed only in ${allowedManifest}`,
        );
        continue;
      }
      findings.push(
        `${manifestRelativePath}: forbidden Product 2 Temporal dependency ${dependencyName}`,
      );
    }
  }
  for (const sourcePath of await typeScriptSources(platformRoot)) {
    const sourceRelativePath = relative(repositoryRoot, sourcePath);
    const isEngineGatewaySource = sourceRelativePath.startsWith(
      "platform/foundation/engine-gateway/src/",
    );
    const source = await readFile(sourcePath, "utf8");
    for (const specifier of typeScriptModuleSpecifiersFromSource(source)) {
      if (specifier.startsWith("@temporalio/")) {
        findings.push(
          `${sourceRelativePath}: forbidden Product 2 Temporal SDK import ${specifier}`,
        );
        continue;
      }
      if (!specifier.startsWith("@bpmn-lean/temporal-")) {
        continue;
      }
      if (
        isEngineGatewaySource &&
        specifier === "@bpmn-lean/temporal-client/definition-start"
      ) {
        continue;
      }
      findings.push(
        `${sourceRelativePath}: forbidden Product 2 Temporal import ${specifier}`,
      );
    }
  }
}

async function assessWorkflowSafeSources(
  repositoryRoot: string,
  subsystemRoot: string,
  findings: string[],
): Promise<void> {
  for (const role of [PackageRole.Protocol, PackageRole.Workflow]) {
    const sourceRoot = path.join(subsystemRoot, role, "src");
    for (const sourcePath of await typeScriptSources(sourceRoot)) {
      const source = await readFile(sourcePath, "utf8");
      for (const specifier of typeScriptModuleSpecifiersFromSource(source)) {
        if (isBuiltin(specifier)) {
          findings.push(
            `${relative(repositoryRoot, sourcePath)}: Workflow-reachable Node built-in ${specifier}`,
          );
        }
      }
    }
  }
}

async function typeScriptSources(directory: string): Promise<ReadonlyArray<string>> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.name === "dist" || entry.name === "node_modules") {
      return [];
    }
    if (entry.isDirectory()) {
      return typeScriptSources(entryPath);
    }
    return entry.isFile() && /\.(?:cts|mts|tsx?)$/u.test(entry.name)
      ? [entryPath]
      : [];
  }));
  return nested.flat().sort(compareCodeUnits);
}

async function packageManifestPaths(
  directory: string,
): Promise<ReadonlyArray<string>> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const nested = await Promise.all(entries.map(async (entry) => {
    if (entry.name === "dist" || entry.name === "node_modules") {
      return [];
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return packageManifestPaths(entryPath);
    }
    return entry.isFile() && entry.name === "package.json"
      ? [entryPath]
      : [];
  }));
  return nested.flat().sort(compareCodeUnits);
}

function assessDependencies(
  repositoryRoot: string,
  manifestPath: string,
  value: unknown,
  policy: PackagePolicy,
  findings: string[],
): void {
  const dependencies = isRecord(value) ? value : {};
  const dependencyNames = Object.keys(dependencies);
  const allowedInternalNames = new Set(
    policy.internalDependencies.map((role) => packagePolicies[role].name),
  );
  for (const dependencyName of dependencyNames) {
    if (
      dependencyName.startsWith("@bpmn-lean/temporal-") &&
      !allowedInternalNames.has(dependencyName)
    ) {
      findings.push(
        `${relative(repositoryRoot, manifestPath)}: forbidden Temporal subsystem dependency ${dependencyName}`,
      );
    }
    if (
      dependencyName.startsWith("@temporalio/") &&
      !policy.allowedSdkDependencies.includes(dependencyName)
    ) {
      findings.push(
        `${relative(repositoryRoot, manifestPath)}: forbidden Temporal SDK dependency ${dependencyName}`,
      );
    }
  }
  for (const role of policy.internalDependencies) {
    const dependencyName = packagePolicies[role].name;
    if (dependencies[dependencyName] !== "workspace:*") {
      findings.push(
        `${relative(repositoryRoot, manifestPath)}: missing workspace dependency ${dependencyName}`,
      );
    }
  }
  for (const dependencyName of policy.requiredSdkDependencies) {
    const declaredVersion = dependencies[dependencyName];
    if (typeof declaredVersion !== "string" || declaredVersion.length === 0) {
      findings.push(
        `${relative(repositoryRoot, manifestPath)}: missing required SDK dependency ${dependencyName}`,
      );
    }
  }
}

async function readManifest(
  manifestPath: string,
  findings: string[],
): Promise<Record<string, unknown> | undefined> {
  let source: string;
  try {
    source = await readFile(manifestPath, "utf8");
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      findings.push(`${manifestPath}: required package manifest is missing`);
      return undefined;
    }
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    findings.push(`${manifestPath}: package manifest is not valid JSON`);
    return undefined;
  }
  if (!isRecord(value)) {
    findings.push(`${manifestPath}: package manifest must be an object`);
    return undefined;
  }
  return value;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
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

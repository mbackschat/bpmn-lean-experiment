import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

export type DependencyLicenseOverride = {
  readonly declaredLicense: string;
  readonly effectiveLicense: string;
  readonly licenseFile: string;
  readonly licenseSha256: string;
};

export type DependencyPolicy = {
  readonly allowedLicenses: ReadonlyArray<string>;
  readonly licenseOverrides: Readonly<Record<string, DependencyLicenseOverride>>;
  readonly maxResolvedExternalPackages: number;
};

export type DependencyPolicyAssessment = {
  readonly externalPackages: ReadonlyArray<string>;
  readonly findings: ReadonlyArray<string>;
};

export type DependencyPolicyAssessmentInput = {
  readonly policy: unknown;
  readonly projectRoot: string;
  readonly platformPackageRoots: ReadonlyArray<string>;
  readonly workspacePackageRoots: ReadonlyArray<string>;
};

type DependencyKind = "optional" | "required" | "required-peer";

type DependencyEdge = {
  readonly kind: DependencyKind;
  readonly name: string;
};

type PackageManifest = {
  readonly dependencies: ReadonlyArray<DependencyEdge>;
  readonly identity: string;
  readonly license: string;
  readonly metadata: string;
  readonly name: string;
};

type PackageQueueEntry = {
  readonly expectedName?: string;
  readonly root: string;
};

type ManifestReadResult =
  | { readonly manifest: PackageManifest; readonly status: "valid" }
  | { readonly finding: string; readonly status: "invalid" };

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function parseDependencyPolicy(value: unknown): DependencyPolicy {
  if (!plainObject(value)) {
    throw new Error("dependency policy must be an object");
  }
  const allowedProperties = new Set(["allowedLicenses", "licenseOverrides", "maxResolvedExternalPackages"]);
  const unknownProperties = Object.keys(value)
    .filter((property) => !allowedProperties.has(property))
    .sort(compareCodeUnits);
  if (unknownProperties[0] !== undefined) {
    throw new Error(`dependency policy has unknown property ${unknownProperties[0]}`);
  }
  const { allowedLicenses, licenseOverrides, maxResolvedExternalPackages } = value;
  if (
    !Array.isArray(allowedLicenses) ||
    allowedLicenses.length === 0 ||
    !allowedLicenses.every(nonEmptyString) ||
    new Set(allowedLicenses).size !== allowedLicenses.length
  ) {
    throw new Error("allowedLicenses must contain unique non-empty strings");
  }
  if (!Number.isSafeInteger(maxResolvedExternalPackages) || Number(maxResolvedExternalPackages) < 0) {
    throw new Error("maxResolvedExternalPackages must be a non-negative integer");
  }
  return {
    allowedLicenses: [...allowedLicenses].sort(compareCodeUnits),
    licenseOverrides: parseLicenseOverrides(licenseOverrides),
    maxResolvedExternalPackages: Number(maxResolvedExternalPackages),
  };
}

function parseLicenseOverrides(value: unknown): Readonly<Record<string, DependencyLicenseOverride>> {
  if (value === undefined) {
    return {};
  }
  if (!plainObject(value)) {
    throw new Error("licenseOverrides must be an object");
  }
  const overrides: Array<readonly [string, DependencyLicenseOverride]> = [];
  for (const [identity, candidate] of Object.entries(value).sort(([left], [right]) => compareCodeUnits(left, right))) {
    if (!nonEmptyString(identity) || !plainObject(candidate)) {
      throw new Error(`licenseOverrides.${identity} must be an object`);
    }
    const allowedProperties = new Set(["declaredLicense", "effectiveLicense", "licenseFile", "licenseSha256"]);
    const unknownProperty = Object.keys(candidate)
      .filter((property) => !allowedProperties.has(property))
      .sort(compareCodeUnits)[0];
    if (unknownProperty !== undefined) {
      throw new Error(`licenseOverrides.${identity} has unknown property ${unknownProperty}`);
    }
    const { declaredLicense, effectiveLicense, licenseFile, licenseSha256 } = candidate;
    if (!nonEmptyString(declaredLicense) || !nonEmptyString(effectiveLicense)) {
      throw new Error(`licenseOverrides.${identity} must name declaredLicense and effectiveLicense`);
    }
    if (
      !nonEmptyString(licenseFile) ||
      path.basename(licenseFile) !== licenseFile ||
      licenseFile === "." ||
      licenseFile === ".."
    ) {
      throw new Error(`licenseOverrides.${identity}.licenseFile must be one safe filename`);
    }
    if (typeof licenseSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(licenseSha256)) {
      throw new Error(`licenseOverrides.${identity}.licenseSha256 must be a lowercase SHA-256`);
    }
    overrides.push([identity, { declaredLicense, effectiveLicense, licenseFile, licenseSha256 }]);
  }
  return Object.fromEntries(overrides);
}

function displayPath(projectRoot: string, targetPath: string): string {
  const relative = path.relative(projectRoot, targetPath);
  return relative.length > 0 && !relative.startsWith("..")
    ? relative.replaceAll(path.sep, "/")
    : targetPath.replaceAll(path.sep, "/");
}

function dependencyRecord(
  manifestPath: string,
  sectionName: string,
  value: unknown,
): Readonly<Record<string, string>> {
  if (value === undefined) {
    return {};
  }
  if (!plainObject(value) || Object.values(value).some((specifier) => !nonEmptyString(specifier))) {
    throw new Error(`${manifestPath}: ${sectionName} must be an object of non-empty string specifiers`);
  }
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareCodeUnits(left, right))) as Record<string, string>;
}

function optionalPeerNames(manifestPath: string, value: unknown): ReadonlySet<string> {
  if (value === undefined) {
    return new Set();
  }
  if (!plainObject(value)) {
    throw new Error(`${manifestPath}: peerDependenciesMeta must be an object`);
  }
  const optionalNames = new Set<string>();
  for (const [name, metadata] of Object.entries(value).sort(([left], [right]) => compareCodeUnits(left, right))) {
    if (!plainObject(metadata) || Object.keys(metadata).some((property) => property !== "optional")) {
      throw new Error(`${manifestPath}: peerDependenciesMeta.${name} must contain only optional`);
    }
    if (metadata.optional !== undefined && typeof metadata.optional !== "boolean") {
      throw new Error(`${manifestPath}: peerDependenciesMeta.${name}.optional must be boolean`);
    }
    if (metadata.optional === true) {
      optionalNames.add(name);
    }
  }
  return optionalNames;
}

function manifestEdges(
  dependencies: Readonly<Record<string, string>>,
  optionalDependencies: Readonly<Record<string, string>>,
  peerDependencies: Readonly<Record<string, string>>,
  optionalPeers: ReadonlySet<string>,
): ReadonlyArray<DependencyEdge> {
  const edges = new Map<string, DependencyKind>();
  for (const name of Object.keys(dependencies)) {
    edges.set(name, "required");
  }
  for (const name of Object.keys(optionalDependencies)) {
    edges.set(name, "optional");
  }
  for (const name of Object.keys(peerDependencies)) {
    if (!optionalPeers.has(name) && !edges.has(name)) {
      edges.set(name, "required-peer");
    }
  }
  return [...edges.entries()]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([name, kind]) => ({ kind, name }));
}

async function readPackageManifest(projectRoot: string, packageRoot: string): Promise<ManifestReadResult> {
  const manifestFile = path.join(packageRoot, "package.json");
  const manifestPath = displayPath(projectRoot, manifestFile);
  let decoded: unknown;
  try {
    decoded = JSON.parse(await readFile(manifestFile, "utf8")) as unknown;
  } catch {
    return { finding: `${manifestPath}: malformed package manifest`, status: "invalid" };
  }
  if (!plainObject(decoded)) {
    return { finding: `${manifestPath}: package manifest must be an object`, status: "invalid" };
  }
  const { license, name, version } = decoded;
  if (!nonEmptyString(name)) {
    return { finding: `${manifestPath}: package name must be a non-empty string`, status: "invalid" };
  }
  if (!nonEmptyString(version)) {
    return { finding: `${manifestPath}: package version must be a non-empty string`, status: "invalid" };
  }
  if (!nonEmptyString(license)) {
    return { finding: `${manifestPath}: package license must be a non-empty string`, status: "invalid" };
  }
  try {
    const dependencies = dependencyRecord(manifestPath, "dependencies", decoded.dependencies);
    const optionalDependencies = dependencyRecord(manifestPath, "optionalDependencies", decoded.optionalDependencies);
    const peerDependencies = dependencyRecord(manifestPath, "peerDependencies", decoded.peerDependencies);
    const optionalPeers = optionalPeerNames(manifestPath, decoded.peerDependenciesMeta);
    const metadata = JSON.stringify({
      dependencies,
      license,
      optionalDependencies,
      peerDependencies,
      peerDependenciesMeta: Object.fromEntries([...optionalPeers].sort(compareCodeUnits).map((name) => [name, { optional: true }])),
    });
    return {
      manifest: {
        dependencies: manifestEdges(dependencies, optionalDependencies, peerDependencies, optionalPeers),
        identity: `${name}@${version}`,
        license,
        metadata,
        name,
      },
      status: "valid",
    };
  } catch (error) {
    return {
      finding: error instanceof Error ? error.message : `${manifestPath}: malformed package manifest`,
      status: "invalid",
    };
  }
}

async function resolvedDependencyRoot(
  packageRoot: string,
  dependencyName: string,
  projectRoot: string,
): Promise<string | null> {
  let ancestor = packageRoot;
  while (ancestor === projectRoot || ancestor.startsWith(`${projectRoot}${path.sep}`)) {
    const candidate = path.join(ancestor, "node_modules", ...dependencyName.split("/"));
    try {
      return await realpath(candidate);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
    if (ancestor === projectRoot) {
      break;
    }
    ancestor = path.dirname(ancestor);
  }
  return null;
}

export async function assessPlatformDependencyPolicy(
  input: DependencyPolicyAssessmentInput,
): Promise<DependencyPolicyAssessment> {
  const policy = parseDependencyPolicy(input.policy);
  const projectRoot = await realpath(input.projectRoot);
  const findings = new Set<string>();
  const workspaceRoots = new Set(await Promise.all(input.workspacePackageRoots.map(async (root) => realpath(root))));
  const queue: PackageQueueEntry[] = input.platformPackageRoots
    .map((root) => ({ root }))
    .sort((left, right) => compareCodeUnits(left.root, right.root));
  const expandedRoots = new Set<string>();
  const manifestResults = new Map<string, ManifestReadResult>();
  const identityMetadata = new Map<string, { readonly metadata: string; readonly root: string }>();
  const externalLicenses = new Map<string, Set<string>>();
  const externalRoots = new Map<string, Set<string>>();

  while (queue.length > 0) {
    const entry = queue.shift();
    if (entry === undefined) {
      break;
    }
    let packageRoot: string;
    try {
      packageRoot = await realpath(entry.root);
    } catch {
      findings.add(`${displayPath(projectRoot, entry.root)}: package root is unresolved`);
      continue;
    }
    const readResult = manifestResults.get(packageRoot) ?? await readPackageManifest(projectRoot, packageRoot);
    manifestResults.set(packageRoot, readResult);
    if (readResult.status === "invalid") {
      findings.add(readResult.finding);
      continue;
    }
    const { manifest } = readResult;
    if (entry.expectedName !== undefined && manifest.name !== entry.expectedName) {
      findings.add(`${manifest.identity}: resolved for dependency ${entry.expectedName} but declares ${manifest.name}`);
    }
    if (expandedRoots.has(packageRoot)) {
      continue;
    }
    expandedRoots.add(packageRoot);
    const priorMetadata = identityMetadata.get(manifest.identity);
    const displayedRoot = displayPath(projectRoot, packageRoot);
    if (priorMetadata !== undefined && priorMetadata.metadata !== manifest.metadata) {
      const roots = [priorMetadata.root, displayedRoot].sort(compareCodeUnits);
      findings.add(`${manifest.identity}: contradictory metadata at ${roots[0]} and ${roots[1]}`);
    } else if (priorMetadata === undefined) {
      identityMetadata.set(manifest.identity, { metadata: manifest.metadata, root: displayedRoot });
    }
    if (!workspaceRoots.has(packageRoot)) {
      const licenses = externalLicenses.get(manifest.identity) ?? new Set<string>();
      licenses.add(manifest.license);
      externalLicenses.set(manifest.identity, licenses);
      const roots = externalRoots.get(manifest.identity) ?? new Set<string>();
      roots.add(packageRoot);
      externalRoots.set(manifest.identity, roots);
    }
    for (const dependency of manifest.dependencies) {
      const dependencyRoot = await resolvedDependencyRoot(packageRoot, dependency.name, projectRoot);
      if (dependencyRoot === null) {
        if (dependency.kind !== "optional") {
          const label = dependency.kind === "required-peer" ? "required peer dependency" : "required dependency";
          findings.add(`${manifest.identity}: ${label} ${dependency.name} is unresolved`);
        }
        continue;
      }
      queue.push({ expectedName: dependency.name, root: dependencyRoot });
    }
    queue.sort((left, right) => compareCodeUnits(left.root, right.root));
  }

  const externalPackages = [...externalLicenses.keys()].sort(compareCodeUnits);
  const allowedLicenses = new Set(policy.allowedLicenses);
  for (const identity of externalPackages) {
    const override = policy.licenseOverrides[identity];
    const declaredLicenses = [...(externalLicenses.get(identity) ?? [])].sort(compareCodeUnits);
    const effectiveLicenses = override === undefined
      ? declaredLicenses
      : [override.effectiveLicense];
    if (override !== undefined) {
      for (const declaredLicense of declaredLicenses) {
        if (declaredLicense !== override.declaredLicense) {
          findings.add(`${identity}: declared licence ${declaredLicense} does not match approved marker ${override.declaredLicense}`);
        }
      }
      for (const root of [...(externalRoots.get(identity) ?? [])].sort(compareCodeUnits)) {
        const licensePath = path.join(root, override.licenseFile);
        let actualSha256: string;
        try {
          actualSha256 = createHash("sha256").update(await readFile(licensePath)).digest("hex");
        } catch {
          findings.add(`${identity}: approved licence file ${override.licenseFile} is unreadable`);
          continue;
        }
        if (actualSha256 !== override.licenseSha256) {
          findings.add(`${identity}: licence file ${override.licenseFile} does not match approved SHA-256`);
        }
      }
    }
    for (const license of effectiveLicenses) {
      if (!allowedLicenses.has(license)) {
        findings.add(`${identity}: licence ${license} is not allowed`);
      }
    }
  }
  for (const identity of Object.keys(policy.licenseOverrides).sort(compareCodeUnits)) {
    if (!externalLicenses.has(identity)) {
      findings.add(`${identity}: licence override does not match a reachable external package`);
    }
  }
  for (const identity of externalPackages.slice(policy.maxResolvedExternalPackages)) {
    findings.add(
      `${identity}: exceeds external package budget ${policy.maxResolvedExternalPackages} (resolved ${externalPackages.length})`,
    );
  }
  return { externalPackages, findings: [...findings].sort(compareCodeUnits) };
}

function repositoryPackageManifestPaths(projectRoot: string): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: projectRoot, encoding: "utf8" },
  );
  return output
    .split("\0")
    .filter((relativePath) => relativePath === "package.json" || relativePath.endsWith("/package.json"))
    .sort(compareCodeUnits);
}

export async function repositoryPlatformDependencyPolicy(projectRoot: string): Promise<DependencyPolicyAssessment> {
  const manifestPaths = repositoryPackageManifestPaths(projectRoot);
  const workspacePackageRoots = manifestPaths.map((manifestPath) => path.join(projectRoot, path.dirname(manifestPath)));
  const platformPackageRoots = manifestPaths
    .filter((manifestPath) => manifestPath.startsWith("platform/"))
    .map((manifestPath) => path.join(projectRoot, path.dirname(manifestPath)));
  const policyFile = path.join(projectRoot, "platform", "dependency-policy.json");
  let policy: unknown;
  try {
    policy = JSON.parse(await readFile(policyFile, "utf8")) as unknown;
  } catch {
    throw new Error("platform/dependency-policy.json: malformed dependency policy");
  }
  return assessPlatformDependencyPolicy({
    platformPackageRoots,
    policy,
    projectRoot,
    workspacePackageRoots,
  });
}

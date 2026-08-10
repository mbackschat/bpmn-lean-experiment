import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type DependencyLicenseOverride = {
  readonly declaredLicense: string;
  readonly effectiveLicense: string;
  readonly licenseFile: string;
  readonly licenseSha256: string;
};

export type LicensePolicy = {
  readonly allowedLicenses: ReadonlyArray<string>;
  readonly licenseOverrides: Readonly<Record<string, DependencyLicenseOverride>>;
};

export type PnpmLicensePackage = {
  readonly license: string;
  readonly name: string;
  readonly paths: ReadonlyArray<string>;
  readonly versions: ReadonlyArray<string>;
};

export type PnpmLicenseReport = Readonly<Record<string, ReadonlyArray<PnpmLicensePackage>>>;

export type LicensePolicyAssessment = {
  readonly findings: ReadonlyArray<string>;
};

export type PnpmLicenseAssessmentInput = {
  readonly policy: unknown;
  readonly projectRoot: string;
  readonly report: unknown;
};

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

export function parseLicensePolicy(value: unknown): LicensePolicy {
  if (!plainObject(value)) {
    throw new Error("licence policy must be an object");
  }
  const allowedProperties = new Set(["allowedLicenses", "licenseOverrides"]);
  const unknownProperties = Object.keys(value)
    .filter((property) => !allowedProperties.has(property))
    .sort(compareCodeUnits);
  if (unknownProperties[0] !== undefined) {
    throw new Error(`licence policy has unknown property ${unknownProperties[0]}`);
  }
  const { allowedLicenses, licenseOverrides } = value;
  if (
    !Array.isArray(allowedLicenses) ||
    allowedLicenses.length === 0 ||
    !allowedLicenses.every(nonEmptyString) ||
    new Set(allowedLicenses).size !== allowedLicenses.length
  ) {
    throw new Error("allowedLicenses must contain unique non-empty strings");
  }
  return {
    allowedLicenses: [...allowedLicenses].sort(compareCodeUnits),
    licenseOverrides: parseLicenseOverrides(licenseOverrides),
  };
}

function parsePnpmLicensePackage(group: string, value: unknown): PnpmLicensePackage {
  if (!plainObject(value)) {
    throw new Error(`pnpm licence group ${group} contains a malformed package`);
  }
  const { license, name, paths, versions } = value;
  if (
    !nonEmptyString(license) ||
    license !== group ||
    !nonEmptyString(name) ||
    !Array.isArray(paths) ||
    paths.length === 0 ||
    !paths.every(nonEmptyString) ||
    !Array.isArray(versions) ||
    versions.length === 0 ||
    !versions.every(nonEmptyString)
  ) {
    const suffix = nonEmptyString(license) && license !== group
      ? ` labelled ${license}`
      : "";
    throw new Error(`pnpm licence group ${group} contains a package${suffix || " with malformed identity"}`);
  }
  return {
    license,
    name,
    paths: [...paths].sort(compareCodeUnits),
    versions: [...versions].sort(compareCodeUnits),
  };
}

export function parsePnpmLicenseReport(value: unknown): PnpmLicenseReport {
  if (!plainObject(value)) {
    throw new Error("pnpm licence report must be an object");
  }
  const groups: Array<readonly [string, ReadonlyArray<PnpmLicensePackage>]> = [];
  for (const [group, packages] of Object.entries(value).sort(([left], [right]) => compareCodeUnits(left, right))) {
    if (!nonEmptyString(group) || !Array.isArray(packages)) {
      throw new Error(`pnpm licence group ${group} must be an array`);
    }
    groups.push([group, packages.map((candidate) => parsePnpmLicensePackage(group, candidate))]);
  }
  return Object.fromEntries(groups);
}

type ReportedIdentity = {
  readonly group: string;
  readonly packageRoots: ReadonlyArray<string>;
};

function reportedIdentities(report: PnpmLicenseReport): ReadonlyMap<string, ReportedIdentity> {
  const identities = new Map<string, ReportedIdentity>();
  for (const [group, packages] of Object.entries(report)) {
    for (const candidate of packages) {
      for (const version of candidate.versions) {
        const identity = `${candidate.name}@${version}`;
        const prior = identities.get(identity);
        if (prior !== undefined && prior.group !== group) {
          throw new Error(`${identity}: pnpm reported contradictory licences ${prior.group} and ${group}`);
        }
        const packageRoots = new Set([...(prior?.packageRoots ?? []), ...candidate.paths]);
        identities.set(identity, { group, packageRoots: [...packageRoots].sort(compareCodeUnits) });
      }
    }
  }
  return identities;
}

async function assessOverride(
  identity: string,
  reported: ReportedIdentity,
  override: DependencyLicenseOverride,
): Promise<ReadonlyArray<string>> {
  const findings: string[] = [];
  const at = identity.lastIndexOf("@");
  const expectedName = identity.slice(0, at);
  const expectedVersion = identity.slice(at + 1);
  let matchedManifest = false;
  for (const packageRoot of reported.packageRoots) {
    let manifest: unknown;
    try {
      manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")) as unknown;
    } catch {
      continue;
    }
    if (!plainObject(manifest) || manifest.name !== expectedName || manifest.version !== expectedVersion) {
      continue;
    }
    matchedManifest = true;
    if (manifest.license !== override.declaredLicense) {
      findings.push(
        `${identity}: declared licence ${String(manifest.license)} does not match approved marker ${override.declaredLicense}`,
      );
    }
    try {
      const digest = createHash("sha256")
        .update(await readFile(path.join(packageRoot, override.licenseFile)))
        .digest("hex");
      if (digest !== override.licenseSha256) {
        findings.push(`${identity}: licence file ${override.licenseFile} does not match approved SHA-256`);
      }
    } catch {
      findings.push(`${identity}: approved licence file ${override.licenseFile} is unreadable`);
    }
  }
  if (!matchedManifest) {
    findings.push(`${identity}: no pnpm-reported path contains the expected installed manifest`);
  }
  return findings;
}

export async function assessPnpmLicenseReport(
  input: PnpmLicenseAssessmentInput,
): Promise<LicensePolicyAssessment> {
  const policy = parseLicensePolicy(input.policy);
  const report = parsePnpmLicenseReport(input.report);
  const identities = reportedIdentities(report);
  const allowedLicenses = new Set(policy.allowedLicenses);
  const findings = new Set<string>();

  for (const [identity, reported] of [...identities.entries()].sort(([left], [right]) => compareCodeUnits(left, right))) {
    const override = policy.licenseOverrides[identity];
    if (override === undefined) {
      if (!allowedLicenses.has(reported.group)) {
        findings.add(`${identity}: licence ${reported.group} is not allowed`);
      }
      continue;
    }
    if (!allowedLicenses.has(override.effectiveLicense)) {
      findings.add(`${identity}: effective licence ${override.effectiveLicense} is not allowed`);
    }
    for (const finding of await assessOverride(identity, reported, override)) {
      findings.add(finding);
    }
  }
  for (const identity of Object.keys(policy.licenseOverrides).sort(compareCodeUnits)) {
    if (!identities.has(identity)) {
      findings.add(`${identity}: licence override does not match a package reported by pnpm`);
    }
  }
  return { findings: [...findings].sort(compareCodeUnits) };
}

function pnpmLicenseReport(projectRoot: string): unknown {
  const wrapper = path.join(projectRoot, "scripts", "pnpm.sh");
  let output: string;
  try {
    output = execFileSync(
      wrapper,
      ["licenses", "list", "--filter", "./platform/**...", "--prod", "--json"],
      { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error
      ? String(error.stderr).trim()
      : "";
    throw new Error(`pnpm production licence report failed${stderr.length > 0 ? `: ${stderr}` : ""}`);
  }
  try {
    return JSON.parse(output) as unknown;
  } catch {
    throw new Error("pnpm production licence report was not valid JSON");
  }
}

export async function repositoryPlatformLicensePolicy(projectRoot: string): Promise<LicensePolicyAssessment> {
  let policy: unknown;
  try {
    policy = JSON.parse(await readFile(path.join(projectRoot, "platform", "license-policy.json"), "utf8")) as unknown;
  } catch {
    throw new Error("platform/license-policy.json: malformed licence policy");
  }
  return assessPnpmLicenseReport({
    policy,
    projectRoot,
    report: pnpmLicenseReport(projectRoot),
  });
}

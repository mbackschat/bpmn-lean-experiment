import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assessPlatformDependencyPolicy,
  parseDependencyPolicy,
  repositoryPlatformDependencyPolicy,
} from "./platform-dependency-policy.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoots: string[] = [];

type TestPackage = {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly license?: unknown;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional?: boolean }>>;
};

async function temporaryProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "platform-dependency-policy-"));
  temporaryRoots.push(root);
  return root;
}

async function packageAt(root: string, relativePath: string, manifest: TestPackage): Promise<string> {
  const packageRoot = path.join(root, relativePath);
  await mkdir(packageRoot, { recursive: true });
  await writeFile(path.join(packageRoot, "package.json"), `${JSON.stringify(manifest)}\n`, "utf8");
  return packageRoot;
}

async function malformedPackageAt(root: string, relativePath: string): Promise<string> {
  const packageRoot = path.join(root, relativePath);
  await mkdir(packageRoot, { recursive: true });
  await writeFile(path.join(packageRoot, "package.json"), "{", "utf8");
  return packageRoot;
}

async function linkDependency(packageRoot: string, dependencyName: string, targetRoot: string): Promise<void> {
  const linkPath = path.join(packageRoot, "node_modules", ...dependencyName.split("/"));
  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(targetRoot, linkPath, "dir");
}

const policy = (maxResolvedExternalPackages: number, allowedLicenses: ReadonlyArray<string> = ["MIT"]) => ({
  allowedLicenses,
  maxResolvedExternalPackages,
});

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async (root) => rm(root, { force: true, recursive: true })));
});

test("rejects a forbidden licence anywhere in the reachable production graph", async () => {
  const root = await temporaryProject();
  const app = await packageAt(root, "platform/apps/server", {
    name: "@example/server",
    version: "1.0.0",
    license: "MIT",
    dependencies: { direct: "1.0.0" },
  });
  const direct = await packageAt(root, "store/direct", {
    name: "direct",
    version: "1.0.0",
    license: "MIT",
    dependencies: { copyleft: "1.0.0" },
  });
  const copyleft = await packageAt(root, "store/copyleft", {
    name: "copyleft",
    version: "1.0.0",
    license: "GPL-3.0-only",
  });
  await linkDependency(app, "direct", direct);
  await linkDependency(direct, "copyleft", copyleft);

  const result = await assessPlatformDependencyPolicy({
    policy: policy(2),
    projectRoot: root,
    platformPackageRoots: [app],
    workspacePackageRoots: [app],
  });

  assert.deepEqual(result.externalPackages, ["copyleft@1.0.0", "direct@1.0.0"]);
  assert.deepEqual(result.findings, ["copyleft@1.0.0: licence GPL-3.0-only is not allowed"]);
});

test("rejects every deterministically selected package above the exact budget", async () => {
  const root = await temporaryProject();
  const app = await packageAt(root, "platform/apps/server", {
    name: "@example/server",
    version: "1.0.0",
    license: "MIT",
    dependencies: { "@scope/punctuated": "1.0.0", Upper: "1.0.0", _underscore: "1.0.0", lower: "1.0.0" },
  });
  const packageNames = ["@scope/punctuated", "Upper", "_underscore", "lower"] as const;
  for (const name of packageNames) {
    const packageRoot = await packageAt(root, `store/${name.replace("/", "-")}`, { name, version: "1.0.0", license: "MIT" });
    await linkDependency(app, name, packageRoot);
  }

  const result = await assessPlatformDependencyPolicy({
    policy: policy(3),
    projectRoot: root,
    platformPackageRoots: [app],
    workspacePackageRoots: [app],
  });

  assert.deepEqual(result.externalPackages, [
    "@scope/punctuated@1.0.0",
    "Upper@1.0.0",
    "_underscore@1.0.0",
    "lower@1.0.0",
  ]);
  assert.deepEqual(result.findings, [
    "lower@1.0.0: exceeds external package budget 3 (resolved 4)",
  ]);
});

test("deduplicates shared transitives, ignores development edges, and applies optional and peer rules", async () => {
  const root = await temporaryProject();
  const app = await packageAt(root, "platform/apps/server", {
    name: "@example/server",
    version: "1.0.0",
    license: "MIT",
    dependencies: { alpha: "1.0.0", beta: "1.0.0" },
    devDependencies: { absentDevelopmentTool: "1.0.0" },
    optionalDependencies: { absent: "1.0.0", optional: "1.0.0" },
  });
  const alpha = await packageAt(root, "store/alpha", {
    name: "alpha",
    version: "1.0.0",
    license: "MIT",
    dependencies: { shared: "1.0.0" },
  });
  const beta = await packageAt(root, "store/beta", {
    name: "beta",
    version: "1.0.0",
    license: "MIT",
    dependencies: { shared: "1.0.0" },
    peerDependencies: { absentOptionalPeer: "1.0.0", peer: "1.0.0" },
    peerDependenciesMeta: { absentOptionalPeer: { optional: true } },
  });
  const shared = await packageAt(root, "store/shared", { name: "shared", version: "1.0.0", license: "MIT" });
  const optional = await packageAt(root, "store/optional", { name: "optional", version: "1.0.0", license: "MIT" });
  const peer = await packageAt(root, "store/peer", { name: "peer", version: "1.0.0", license: "MIT" });
  await linkDependency(app, "alpha", alpha);
  await linkDependency(app, "beta", beta);
  await linkDependency(app, "optional", optional);
  await linkDependency(alpha, "shared", shared);
  await linkDependency(beta, "shared", shared);
  await linkDependency(beta, "peer", peer);

  const result = await assessPlatformDependencyPolicy({
    policy: policy(6),
    projectRoot: root,
    platformPackageRoots: [app],
    workspacePackageRoots: [app],
  });

  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.externalPackages, [
    "alpha@1.0.0",
    "beta@1.0.0",
    "optional@1.0.0",
    "peer@1.0.0",
    "shared@1.0.0",
  ]);
});

test("fails closed when required dependencies or required peers are unresolved", async () => {
  const root = await temporaryProject();
  const app = await packageAt(root, "platform/apps/server", {
    name: "@example/server",
    version: "1.0.0",
    license: "MIT",
    dependencies: { direct: "1.0.0", missing: "1.0.0" },
  });
  const direct = await packageAt(root, "store/direct", {
    name: "direct",
    version: "1.0.0",
    license: "MIT",
    peerDependencies: { peer: "1.0.0" },
  });
  await linkDependency(app, "direct", direct);

  const result = await assessPlatformDependencyPolicy({
    policy: policy(1),
    projectRoot: root,
    platformPackageRoots: [app],
    workspacePackageRoots: [app],
  });

  assert.deepEqual(result.findings, [
    "@example/server@1.0.0: required dependency missing is unresolved",
    "direct@1.0.0: required peer dependency peer is unresolved",
  ]);
});

test("checks every dependency link against the resolved manifest identity", async () => {
  const root = await temporaryProject();
  const app = await packageAt(root, "platform/apps/server", {
    name: "@example/server",
    version: "1.0.0",
    license: "MIT",
    dependencies: { direct: "1.0.0", disguised: "1.0.0" },
  });
  const direct = await packageAt(root, "store/direct", { name: "direct", version: "1.0.0", license: "MIT" });
  await linkDependency(app, "direct", direct);
  await linkDependency(app, "disguised", direct);

  const result = await assessPlatformDependencyPolicy({
    policy: policy(1),
    projectRoot: root,
    platformPackageRoots: [app],
    workspacePackageRoots: [app],
  });

  assert.deepEqual(result.findings, ["direct@1.0.0: resolved for dependency disguised but declares direct"]);
});

test("rejects malformed package identities and contradictory duplicate metadata", async () => {
  const root = await temporaryProject();
  const firstApp = await packageAt(root, "platform/apps/first", {
    name: "@example/first",
    version: "1.0.0",
    license: "MIT",
    dependencies: { duplicate: "1.0.0", malformed: "1.0.0" },
  });
  const secondApp = await packageAt(root, "platform/apps/second", {
    name: "@example/second",
    version: "1.0.0",
    license: "MIT",
    dependencies: { duplicate: "1.0.0" },
  });
  const firstDuplicate = await packageAt(root, "store/duplicate-first", {
    name: "duplicate",
    version: "1.0.0",
    license: "MIT",
  });
  const secondDuplicate = await packageAt(root, "store/duplicate-second", {
    name: "duplicate",
    version: "1.0.0",
    license: "Apache-2.0",
  });
  const malformed = await malformedPackageAt(root, "store/malformed");
  await linkDependency(firstApp, "duplicate", firstDuplicate);
  await linkDependency(firstApp, "malformed", malformed);
  await linkDependency(secondApp, "duplicate", secondDuplicate);

  const result = await assessPlatformDependencyPolicy({
    policy: policy(2, ["Apache-2.0", "MIT"]),
    projectRoot: root,
    platformPackageRoots: [firstApp, secondApp],
    workspacePackageRoots: [firstApp, secondApp],
  });

  assert.deepEqual(result.findings, [
    "duplicate@1.0.0: contradictory metadata at store/duplicate-first and store/duplicate-second",
    "store/malformed/package.json: malformed package manifest",
  ]);
});

test("validates the policy as a closed shape", () => {
  assert.throws(
    () => parseDependencyPolicy({ allowedLicenses: ["MIT"], maxResolvedExternalPackages: 5, surplus: true }),
    /dependency policy has unknown property surplus/u,
  );
  assert.throws(
    () => parseDependencyPolicy({ allowedLicenses: ["MIT", "MIT"], maxResolvedExternalPackages: 5 }),
    /allowedLicenses must contain unique non-empty strings/u,
  );
  assert.throws(
    () => parseDependencyPolicy({ allowedLicenses: ["MIT"], maxResolvedExternalPackages: 1.5 }),
    /maxResolvedExternalPackages must be a non-negative integer/u,
  );
});

test("rejects a missing or non-string package identity field", async () => {
  const root = await temporaryProject();
  const app = await packageAt(root, "platform/apps/server", {
    name: "@example/server",
    version: "1.0.0",
    license: "MIT",
    dependencies: { nameless: "1.0.0", unlicensed: "1.0.0" },
  });
  const nameless = await packageAt(root, "store/nameless", { version: "1.0.0", license: "MIT" });
  const unlicensed = await packageAt(root, "store/unlicensed", { name: "unlicensed", version: "1.0.0" });
  await linkDependency(app, "nameless", nameless);
  await linkDependency(app, "unlicensed", unlicensed);

  const result = await assessPlatformDependencyPolicy({
    policy: policy(2),
    projectRoot: root,
    platformPackageRoots: [app],
    workspacePackageRoots: [app],
  });

  assert.deepEqual(result.findings, [
    "store/nameless/package.json: package name must be a non-empty string",
    "store/unlicensed/package.json: package license must be a non-empty string",
  ]);
});

test("keeps the live reachable platform graph at its exact approved footprint", async () => {
  const result = await repositoryPlatformDependencyPolicy(projectRoot);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.externalPackages, [
    "bpmn-moddle@10.0.0",
    "min-dash@5.1.0",
    "moddle-xml@12.1.0",
    "moddle@8.2.0",
    "saxen@11.1.0",
  ]);
});

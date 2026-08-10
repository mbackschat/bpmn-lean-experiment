import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assessPnpmLicenseReport,
  parseLicensePolicy,
  parsePnpmLicenseReport,
  repositoryPlatformLicensePolicy,
} from "./platform-license-policy.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoots: string[] = [];

async function temporaryProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "platform-license-policy-"));
  temporaryRoots.push(root);
  return root;
}

async function installedPackage(
  root: string,
  name: string,
  version: string,
  license: string,
  licenseText = `${license}\n`,
): Promise<string> {
  const packageRoot = path.join(root, "node_modules", ...name.split("/"));
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify({ license, name, version })}\n`,
    "utf8",
  );
  await writeFile(path.join(packageRoot, "LICENSE"), licenseText, "utf8");
  return packageRoot;
}

function reportEntry(
  name: string,
  version: string,
  packageRoot: string,
  license: string,
): Readonly<Record<string, unknown>> {
  return {
    author: "Fixture author",
    description: "Fixture description",
    homepage: "https://example.invalid/fixture",
    license,
    name,
    paths: [packageRoot],
    versions: [version],
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async (root) => rm(root, { force: true, recursive: true })));
});

test("rejects a licence outside the allowlist reported by pnpm", async () => {
  const root = await temporaryProject();
  const packageRoot = await installedPackage(root, "transitive", "1.0.0", "GPL-3.0-only");

  const result = await assessPnpmLicenseReport({
    policy: { allowedLicenses: ["MIT"] },
    projectRoot: root,
    report: {
      "GPL-3.0-only": [reportEntry("transitive", "1.0.0", packageRoot, "GPL-3.0-only")],
    },
  });

  assert.deepEqual(result.findings, ["transitive@1.0.0: licence GPL-3.0-only is not allowed"]);
});

test("binds one non-standard licence exception to exact installed package evidence", async () => {
  const root = await temporaryProject();
  const licenseText = "Approved non-standard licence\n";
  const packageRoot = await installedPackage(root, "renderer", "1.0.0", "SEE LICENSE IN LICENSE", licenseText);
  const policy = {
    allowedLicenses: ["LicenseRef-approved-renderer", "MIT"],
    licenseOverrides: {
      "renderer@1.0.0": {
        declaredLicense: "SEE LICENSE IN LICENSE",
        effectiveLicense: "LicenseRef-approved-renderer",
        licenseFile: "LICENSE",
        licenseSha256: sha256(licenseText),
      },
    },
  };
  const report = {
    Unknown: [reportEntry("renderer", "1.0.0", packageRoot, "Unknown")],
  };

  assert.deepEqual((await assessPnpmLicenseReport({ policy, projectRoot: root, report })).findings, []);

  await writeFile(path.join(packageRoot, "LICENSE"), "Changed licence\n", "utf8");
  assert.deepEqual(
    (await assessPnpmLicenseReport({ policy, projectRoot: root, report })).findings,
    ["renderer@1.0.0: licence file LICENSE does not match approved SHA-256"],
  );
});

test("rejects unknown and stale non-standard licence exceptions", async () => {
  const root = await temporaryProject();
  const rendererRoot = await installedPackage(root, "renderer", "1.0.0", "SEE LICENSE IN LICENSE");
  const otherRoot = await installedPackage(root, "other", "2.0.0", "Custom");
  const policy = {
    allowedLicenses: ["LicenseRef-approved-renderer", "MIT"],
    licenseOverrides: {
      "renderer@1.0.0": {
        declaredLicense: "SEE LICENSE IN LICENSE",
        effectiveLicense: "LicenseRef-approved-renderer",
        licenseFile: "LICENSE",
        licenseSha256: sha256("SEE LICENSE IN LICENSE\n"),
      },
      "stale@1.0.0": {
        declaredLicense: "Custom",
        effectiveLicense: "MIT",
        licenseFile: "LICENSE",
        licenseSha256: "0".repeat(64),
      },
    },
  };

  const result = await assessPnpmLicenseReport({
    policy,
    projectRoot: root,
    report: {
      Unknown: [
        reportEntry("renderer", "1.0.0", rendererRoot, "Unknown"),
        reportEntry("other", "2.0.0", otherRoot, "Unknown"),
      ],
    },
  });

  assert.deepEqual(result.findings, [
    "other@2.0.0: licence Unknown is not allowed",
    "stale@1.0.0: licence override does not match a package reported by pnpm",
  ]);
});

test("rejects an exception when installed manifest identity or declared licence drifts", async () => {
  const root = await temporaryProject();
  const packageRoot = await installedPackage(root, "renderer", "1.0.0", "MIT");

  const result = await assessPnpmLicenseReport({
    policy: {
      allowedLicenses: ["LicenseRef-approved-renderer", "MIT"],
      licenseOverrides: {
        "renderer@1.0.0": {
          declaredLicense: "SEE LICENSE IN LICENSE",
          effectiveLicense: "LicenseRef-approved-renderer",
          licenseFile: "LICENSE",
          licenseSha256: sha256("MIT\n"),
        },
      },
    },
    projectRoot: root,
    report: { Unknown: [reportEntry("renderer", "1.0.0", packageRoot, "Unknown")] },
  });

  assert.deepEqual(result.findings, [
    "renderer@1.0.0: declared licence MIT does not match approved marker SEE LICENSE IN LICENSE",
  ]);
});

test("does not assume positional pairing between pnpm versions and package paths", async () => {
  const root = await temporaryProject();
  const firstRoot = await installedPackage(root, "renderer-one", "1.0.0", "SEE LICENSE IN LICENSE");
  const secondRoot = await installedPackage(root, "renderer-two", "2.0.0", "SEE LICENSE IN LICENSE");
  const firstIdentityRoot = path.join(root, "node_modules", "renderer-one");
  await writeFile(
    path.join(firstIdentityRoot, "package.json"),
    `${JSON.stringify({ license: "SEE LICENSE IN LICENSE", name: "renderer", version: "1.0.0" })}\n`,
    "utf8",
  );
  await writeFile(
    path.join(secondRoot, "package.json"),
    `${JSON.stringify({ license: "SEE LICENSE IN LICENSE", name: "renderer", version: "2.0.0" })}\n`,
    "utf8",
  );
  const policy = {
    allowedLicenses: ["LicenseRef-approved-renderer"],
    licenseOverrides: {
      "renderer@1.0.0": {
        declaredLicense: "SEE LICENSE IN LICENSE",
        effectiveLicense: "LicenseRef-approved-renderer",
        licenseFile: "LICENSE",
        licenseSha256: sha256("SEE LICENSE IN LICENSE\n"),
      },
      "renderer@2.0.0": {
        declaredLicense: "SEE LICENSE IN LICENSE",
        effectiveLicense: "LicenseRef-approved-renderer",
        licenseFile: "LICENSE",
        licenseSha256: sha256("SEE LICENSE IN LICENSE\n"),
      },
    },
  };

  const result = await assessPnpmLicenseReport({
    policy,
    projectRoot: root,
    report: {
      Unknown: [{
        license: "Unknown",
        name: "renderer",
        paths: [secondRoot, firstRoot],
        versions: ["1.0.0", "2.0.0"],
      }],
    },
  });

  assert.deepEqual(result.findings, []);
});

test("parses pnpm's report shape and fails closed on malformed identities", () => {
  assert.deepEqual(parsePnpmLicenseReport({ MIT: [] }), { MIT: [] });
  assert.throws(() => parsePnpmLicenseReport([]), /pnpm licence report must be an object/u);
  assert.throws(() => parsePnpmLicenseReport({ MIT: {} }), /pnpm licence group MIT must be an array/u);
  assert.throws(
    () => parsePnpmLicenseReport({ MIT: [{ license: "MIT", name: "", paths: [], versions: [] }] }),
    /pnpm licence group MIT contains a package with malformed identity/u,
  );
  assert.throws(
    () => parsePnpmLicenseReport({ MIT: [reportEntry("package", "1.0.0", "/tmp/package", "ISC")] }),
    /pnpm licence group MIT contains a package labelled ISC/u,
  );
});

test("validates the project policy as a closed shape", () => {
  assert.throws(
    () => parseLicensePolicy({ allowedLicenses: ["MIT"], maxResolvedExternalPackages: 5 }),
    /licence policy has unknown property maxResolvedExternalPackages/u,
  );
  assert.throws(
    () => parseLicensePolicy({ allowedLicenses: ["MIT", "MIT"] }),
    /allowedLicenses must contain unique non-empty strings/u,
  );
  assert.throws(
    () => parseLicensePolicy({ allowedLicenses: ["MIT"], licenseOverrides: [] }),
    /licenseOverrides must be an object/u,
  );
});

test("keeps every pnpm-reported platform production licence within policy", async () => {
  const result = await repositoryPlatformLicensePolicy(projectRoot);
  assert.deepEqual(result.findings, []);
});

test("retains the exact approved bpmn-js licence in the web distribution source", async () => {
  const installedLicense = await readFile(
    path.join(projectRoot, "platform/apps/web/node_modules/bpmn-js/LICENSE"),
  );
  const retainedLicense = await readFile(
    path.join(projectRoot, "platform/apps/web/public/third-party/bpmn-js.LICENSE.txt"),
  );

  assert.deepEqual(retainedLicense, installedLicense);
  assert.equal(
    createHash("sha256").update(retainedLicense).digest("hex"),
    "5788cf8bd61481776cee1c943595525499a1355c045e9244f92e6c8092c06770",
  );
  assert.match(retainedLicense.toString("utf8"), /watermark must stay fully visible/u);
});

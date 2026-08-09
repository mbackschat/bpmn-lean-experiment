import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assessA12Boundary,
  deriveLegacyProductDecisions,
  externalCreateDocumentSha256,
  repositoryBoundaryFiles,
  verifyLegacyProductDecisionInventory,
} from "./a12-boundary.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("rejects A12 source and dependency material at the MIT boundary", () => {
  const violations = assessA12Boundary([
    {
      path: "packages/example/src/copied.ts",
      bytes: Buffer.from(
        [
          "/* SPDX-License-Identifier:",
          "EUPL-1.2 OR LicenseRef-commercial */",
        ].join(" "),
      ),
    },
    {
      path: "package.json",
      bytes: Buffer.from(
        '{"dependencies":{"@com.mgmtp.a12.workflows/workflows-core":"1.0.0"}}',
      ),
    },
    {
      path: "external-a12",
      bytes: Buffer.alloc(0),
      symlinkTarget: "../../oss/a12/a12-workflows",
    },
  ]);

  assert.deepEqual(violations, [
    "external-a12: link into an external A12 checkout",
    "package.json: A12 package or build coordinate",
    "packages/example/src/copied.ts: A12/EUPL source header",
  ]);
});

test("rejects downstream A12 bean identities in lower semantic layers", () => {
  assert.deepEqual(
    assessA12Boundary([
      {
        path: "packages/semantic-core/src/effect.ts",
        bytes: Buffer.from('const operation = "createDocumentDelegate";'),
      },
    ]),
    [
      "packages/semantic-core/src/effect.ts: downstream A12 bean identity createDocumentDelegate",
      "packages/semantic-core/src/effect.ts: legacy A12 product decision createDocumentDelegate",
    ],
  );
});

test("rejects legacy A12 profile and business decisions across product roots", () => {
  assert.deepEqual(
    assessA12Boundary([
      {
        path: "BpmnSemantics.lean",
        bytes: Buffer.from('def profile := "A12BoundaryError"'),
      },
      {
        path: "contracts/schemas/semantic-process.schema.json",
        bytes: Buffer.from('{"const":"Error_LinkLimitReached"}'),
      },
      {
        path: "profiles/legacy/profile.json",
        bytes: Buffer.from(
          '{"id":"cibseven-2.0.0-a12-create-document-draft"}',
        ),
      },
      {
        path: "packages/bpmn-source/src/reader.ts",
        bytes: Buffer.from('const task = "CreateDocument";'),
      },
      {
        path: "packages/bpmn-source/src/legacy-locus.ts",
        bytes: Buffer.from('const locus = "a12-create-document-definitions-locus";'),
      },
      {
        path: "adoption/a12/legacy/profile.json",
        bytes: Buffer.from(
          '{"id":"cibseven-2.0.0-a12-create-document-draft"}',
        ),
      },
    ]),
    [
      "BpmnSemantics.lean: legacy A12 product decision A12",
      "BpmnSemantics.lean: legacy A12 product decision A12BoundaryError",
      "contracts/schemas/semantic-process.schema.json: legacy A12 product decision Error_LinkLimitReached",
      "packages/bpmn-source/src/legacy-locus.ts: legacy A12 product decision a12-create-document-definitions-locus",
      "packages/bpmn-source/src/reader.ts: legacy A12 product decision CreateDocument",
      "profiles/legacy/profile.json: legacy A12 product decision cibseven-2.0.0-a12-create-document-draft",
    ],
  );
});

test("rejects retained business values and script-owned catalog decisions", () => {
  assert.deepEqual(
    assessA12Boundary([
      {
        path: "packages/semantic-core/src/hidden.ts",
        bytes: Buffer.from('const result = "Document:42";'),
      },
      {
        path: "scripts/contract-artifacts.ts",
        bytes: Buffer.from('import "./contract-artifact-cases.js";'),
      },
      {
        path: "scripts/contract-artifact-cases.ts",
        bytes: Buffer.from('const subject = "A12BoundaryError";'),
      },
    ]),
    [
      "packages/semantic-core/src/hidden.ts: legacy A12 product decision Document:42",
      "scripts/contract-artifact-cases.ts: legacy A12 product decision A12",
      "scripts/contract-artifact-cases.ts: legacy A12 product decision A12BoundaryError",
    ],
  );
});

test("binds the single legacy decision inventory to the immutable baseline", async () => {
  const inventory = JSON.parse(
    await readFile(
      path.join(
        projectRoot,
        "adoption/a12/legacy/product-decision-inventory.json",
      ),
      "utf8",
    ),
  ) as { readonly sourceTarget: string; readonly decisions: ReadonlyArray<string> };
  const source = await readFile(
    path.join(projectRoot, "scripts/a12-boundary.ts"),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /export const legacyProductDecisions\s*=\s*\[/u,
  );
  assert.deepEqual(
    inventory.decisions,
    await deriveLegacyProductDecisions(projectRoot),
  );
  assert.ok(inventory.decisions.includes("Document:42"));
});

test("keeps tracked and pending repository material inside the A12 boundary", async () => {
  await verifyLegacyProductDecisionInventory(projectRoot);
  assert.deepEqual(
    assessA12Boundary(await repositoryBoundaryFiles(projectRoot)),
    [],
  );
});

test("rejects an add-on reader or adoption-root import in product compilation dispatch", () => {
  assert.deepEqual(
    assessA12Boundary([
      {
        path: "packages/bpmn-source/src/compilation-dispatch.ts",
        bytes: Buffer.from(
          'import { A12BoundaryErrorReader } from "./a12-reader.js";',
        ),
      },
      {
        path: "packages/semantic-core/src/index.ts",
        bytes: Buffer.from(
          'export * from "../../../adoption/a12/current/plugin.js";',
        ),
      },
    ]),
    [
      "packages/bpmn-source/src/compilation-dispatch.ts: legacy A12 product decision A12",
      "packages/bpmn-source/src/compilation-dispatch.ts: legacy A12 product decision A12BoundaryError",
      "packages/semantic-core/src/index.ts: product dependency on the optional A12 adoption root",
    ],
  );
});

test("excludes tracked paths deleted from the worktree", async () => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), "bpmn-a12-boundary-deletion-"),
  );
  try {
    const deletedPath = path.join(fixtureRoot, "deleted.ts");
    execFileSync("git", ["init"], { cwd: fixtureRoot, stdio: "ignore" });
    await writeFile(deletedPath, "export {};\n", "utf8");
    execFileSync("git", ["add", "deleted.ts"], {
      cwd: fixtureRoot,
      stdio: "ignore",
    });
    await unlink(deletedPath);

    assert.deepEqual(await repositoryBoundaryFiles(fixtureRoot), []);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("binds retained CreateDocument evidence to a distinct project-authored fixture", async () => {
  const fixturePath = path.join(
    projectRoot,
    "adoption/a12/current/create-document/process.bpmn",
  );
  const scenarioPath = path.join(
    projectRoot,
    "adoption/a12/current/create-document/scenario.json",
  );
  const readmePath = path.join(
    projectRoot,
    "adoption/a12/current/README.md",
  );
  const fixture = await readFile(fixturePath);
  const scenario = JSON.parse(await readFile(scenarioPath, "utf8")) as {
    readonly bpmn: { readonly sha256: string };
  };
  const provenance = await readFile(readmePath, "utf8");
  const fixtureSha256 = createHash("sha256").update(fixture).digest("hex");

  assert.equal(fixtureSha256, scenario.bpmn.sha256);
  assert.notEqual(fixtureSha256, externalCreateDocumentSha256);
  assert.match(provenance, /project-authored A12-shaped fixtures/u);
  assert.match(provenance, /not copies? of that EUPL-1\.2 source/u);
});

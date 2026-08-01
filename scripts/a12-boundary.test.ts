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
  externalCreateDocumentSha256,
  repositoryBoundaryFiles,
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
    ],
  );
});

test("keeps tracked and pending repository material inside the A12 boundary", async () => {
  assert.deepEqual(
    assessA12Boundary(await repositoryBoundaryFiles(projectRoot)),
    [],
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

test("binds the CreateDocument scenario to a distinct project-authored fixture", async () => {
  const fixturePath = path.join(
    projectRoot,
    "scenarios/create-document-data/process.bpmn",
  );
  const scenarioPath = path.join(
    projectRoot,
    "scenarios/create-document-data/scenario.json",
  );
  const readmePath = path.join(
    projectRoot,
    "scenarios/create-document-data/README.md",
  );
  const fixture = await readFile(fixturePath);
  const scenario = JSON.parse(await readFile(scenarioPath, "utf8")) as {
    readonly bpmn: { readonly sha256: string };
  };
  const provenance = await readFile(readmePath, "utf8");
  const fixtureSha256 = createHash("sha256").update(fixture).digest("hex");

  assert.equal(fixtureSha256, scenario.bpmn.sha256);
  assert.notEqual(fixtureSha256, externalCreateDocumentSha256);
  assert.match(provenance, /project-authored MIT-licensed model/u);
  assert.match(provenance, /not a copy or redistribution/u);
});

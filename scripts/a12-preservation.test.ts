import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  verifyA12LegacyManifest,
  verifyPayloadFreeServiceTaskPreservation,
} from "./a12-preservation.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("freezes every A12-specific dependency of retained evidence", async () => {
  await assert.doesNotReject(verifyA12LegacyManifest(projectRoot));
});

test("freezes the original A12-aware validator and projector roots", async () => {
  const manifest = JSON.parse(
    await readFile(
      path.join(projectRoot, "adoption/a12/legacy/manifest.json"),
      "utf8",
    ),
  ) as { readonly entries: ReadonlyArray<{ readonly originalPath: string }> };

  assert.deepEqual(
    manifest.entries
      .map(({ originalPath }) => originalPath)
      .filter((originalPath) => originalPath.startsWith("scripts/contract-")),
    [
      "scripts/contract-artifact-cases.ts",
      "scripts/contract-artifact-projections.test.ts",
      "scripts/contract-cib-evidence-projection.ts",
      "scripts/contract-effect-projection.ts",
    ],
  );
});

test("permits only the approved payload-free wire-only changes", async () => {
  await assert.doesNotReject(
    verifyPayloadFreeServiceTaskPreservation(projectRoot),
  );
});

import assert from "node:assert/strict";
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

test("permits only the approved payload-free wire-only changes", async () => {
  await assert.doesNotReject(
    verifyPayloadFreeServiceTaskPreservation(projectRoot),
  );
});

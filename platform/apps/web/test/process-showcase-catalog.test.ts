import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";

import { buildProcessShowcaseCatalog } from "../../../../scripts/rc-showcase-catalog.ts";
import { findProcessShowcase } from "../src/process-showcase-catalog.ts";

const entries = await buildProcessShowcaseCatalog(fileURLToPath(new URL("../../../../", import.meta.url)));
const entry = entries.find(({ id }) => id === "confirmed-travel-cancellation")!;
const definition = {
  processId: "Process_TravelCancellation", version: 1,
  semanticProfile: entry.profile,
  source: { kind: "bpmnSource", id: "travel.bpmn", sha256: entry.sha256,
    byteLength: 1, declaredEncoding: "UTF-8", decodedAs: "UTF-8" },
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const satisfies DeployedDefinitionVersion;

test("supplies showcase inputs only to matching source bytes and semantic profile", () => {
  assert.equal(findProcessShowcase(definition, entries), entry);
  assert.equal(findProcessShowcase({ ...definition, source: { ...definition.source, sha256: "f".repeat(64) } }, entries), null);
  assert.equal(findProcessShowcase({ ...definition, semanticProfile: "another-profile" }, entries), null);
});

test("a retained engine model does not acquire a runnable preset from catalog inclusion", () => {
  const retained = entries.find(({ id }) => id === "parallel-work-preparation")!;
  assert.equal(findProcessShowcase({ ...definition, semanticProfile: retained.profile,
    source: { ...definition.source, sha256: retained.sha256 } }, entries), null);
});

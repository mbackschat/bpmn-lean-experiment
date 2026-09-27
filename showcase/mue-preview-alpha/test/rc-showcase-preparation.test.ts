import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DefinitionDeployStatus } from "@bpmn-lean/platform-contracts";
import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";
import { buildProcessShowcaseCatalog } from "../../../scripts/rc-showcase-catalog.ts";
import type { ProcessShowcaseEntry } from "../../../model-corpus/rc-showcases.ts";
import { prepareRcShowcases } from "../src/rc-showcase-preparation.ts";

const entries = await buildProcessShowcaseCatalog(fileURLToPath(new URL("../../../", import.meta.url)));
const curated = entries.filter((entry) => entry.showcase !== null);

function definition(model: ProcessShowcaseEntry): DeployedDefinitionVersion {
  return {
    processId: model.id, version: 1, semanticProfile: model.profile,
    source: { kind: "bpmnSource", id: "process.bpmn", sha256: model.sha256,
      byteLength: Buffer.byteLength(model.xml), declaredEncoding: "UTF-8", decodedAs: "UTF-8" },
    startCapabilities: { messageStarts: [], timerStarts: [] },
  };
}

test("prepares only curated sources, sequentially, through public deployment", async () => {
  const deployed: string[] = [];
  let active = false;
  await prepareRcShowcases("http://localhost:3000", entries, async (input, init) => {
    assert.equal(active, false);
    active = true;
    await Promise.resolve();
    const model = curated[deployed.length]!;
    const url = new URL(String(input));
    assert.equal(url.pathname, "/api/v1/definitions");
    assert.equal(init?.method, "POST");
    assert.deepEqual(init.body, new TextEncoder().encode(model.xml));
    assert.equal(url.searchParams.get("semanticProfile"), model.profile);
    assert.equal(url.searchParams.get("sourceId"), model.sourcePath.split("/").at(-1));
    deployed.push(model.id);
    active = false;
    return Response.json({ status: DefinitionDeployStatus.Deployed, definition: definition(model) }, { status: 201 });
  });
  assert.deepEqual(deployed, curated.map(({ id }) => id));
});

test("refuses rejected preparation instead of advertising a partially ready host", async () => {
  let attempts = 0;
  await assert.rejects(prepareRcShowcases("http://localhost:3000", entries, async () => {
    attempts++;
    const expected = definition(curated[0]!);
    return Response.json({ status: DefinitionDeployStatus.Rejected, source: expected.source,
      semanticProfile: expected.semanticProfile,
      diagnostics: [{ code: "unsupported", evidence: "Unsupported model", element: null }] }, { status: 422 });
  }), /preparation rejected: unsupported/u);
  assert.equal(attempts, 1);
});

for (const mismatch of ["source", "profile"] as const) {
  test(`refuses a preparation receipt with different ${mismatch}`, async () => {
    await assert.rejects(prepareRcShowcases("http://localhost:3000", entries, async () => {
      const expected = definition(curated[0]!);
      return Response.json({ status: DefinitionDeployStatus.Deployed, definition: mismatch === "source"
        ? { ...expected, source: { ...expected.source, sha256: "f".repeat(64) } }
        : { ...expected, semanticProfile: "another-profile" } }, { status: 201 });
    }), /different source or profile/u);
  });
}

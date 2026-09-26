import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildProcessShowcaseCatalog } from "./rc-showcase-catalog.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

test("projects retained business models and twelve configured evaluation paths without promoting engine-only models", async () => {
  const catalog = await buildProcessShowcaseCatalog(root);
  assert.equal(catalog.length, 45);
  assert.equal(catalog.filter((model) => model.showcase !== null).length, 12);
  assert.equal(catalog.filter((model) => model.showcase?.mode === "human").length, 3);
  const transaction = catalog.find((model) => model.id === "reservation-withdrawal")!;
  assert.equal(transaction.showcase?.mode, "guided");
  assert.ok(transaction.capabilityIds.includes("transaction"));
  assert.match(transaction.businessPurpose, /reservation/iu);
  assert.equal(transaction.browserEvidence, "guidedJourneyBacked");
  const ordinary = catalog.find((model) => model.id === "parallel-work-preparation")!;
  assert.equal(ordinary.showcase, null);
  assert.match(ordinary.browserLimit, /metadata-free/u);
});

test("binds runnable data to exact source and profile rather than the business label", async () => {
  const catalog = await buildProcessShowcaseCatalog(root);
  const batch = catalog.find((model) => model.id === "ordered-batch-document-review")!;
  assert.match(batch.sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(batch.showcase?.start.initialVariables[0]?.value, {
    kind: "stringList", value: ["contract", "invoice", "receipt"],
  });
  assert.ok(catalog.every((model) => model.businessPurpose.length > 0));
  assert.ok(catalog.every((model) => model.pipelineCaseId !== null));
});

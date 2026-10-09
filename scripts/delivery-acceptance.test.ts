import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { compareSelectedDeliveryCohorts, deliveryEvidenceReader, readSelectedDeliveryCohort } from "./delivery-acceptance.ts";
import type { DeliveryEvidenceReader, ReviewedDeliveryBinding } from "./delivery-acceptance.ts";
import { requireExecutableModelCorpusManifest } from "./executable-model-corpus-manifest.ts";
import { exactMarkdownSection, sha256 } from "./semantic-review-text.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const manifest = requireExecutableModelCorpusManifest(JSON.parse(await readFile(`${projectRoot}/model-corpus/manifest.json`, "utf8")));
const target = "2ddab36d3d28b3501cda1a30c8d5f5238c79fa5d";
const audit = "6e7261a89b379f124071ed4d9feefe99093f5974";
const crosswalkPath = "docs/PRACTICAL-CIB7-COVERAGE-TARGET.md";
const ownerPath = "docs/DELIVERY-PROPOSAL.md";
const contractPath = "docs/CONTRACT-PROPOSAL.md";
const contract = "# Contract\n\n## Scope\n\nSelected business behavior.\n";
const ownerScope = "# Delivery\n\n## Public contract\n\nComplete usable composition.\n\n";
const variantId = "SERIAL-BUSINESS-TASK-COMPOSITION";
const model = manifest.models.find(entry => entry.id === "invoice-validation-classification")!;
assert.equal(model.source.kind, "retainedScenario");

function receipt(verdict = "approve", correctionAudit = "not-required"): string {
  const reviewTarget = verdict === "pending" ? "not-recorded" : target;
  const isolation = verdict === "pending" ? "not-recorded" : "fork-turns-none-combined";
  const edits = verdict === "pending" ? "not-applicable" : correctionAudit;
  return `## Independent cold-review receipt\n\n| Stage | Review target | Isolation | Verdict | Correction audit |\n|---|---|---|---|---|\n| Proposal | \`4715564a\` | \`fork-turns-none\` | \`approve\` | \`not-required\` |\n| Semantic checkpoint | \`${reviewTarget}\` | \`${isolation}\` | \`${verdict}\` | \`${edits}\` |\n| Closure | \`${reviewTarget}\` | \`${isolation}\` | \`${verdict}\` | \`${edits}\` |\n`;
}
function owner(binding: ReviewedDeliveryBinding | null, verdict = "approve", correctionAudit = "not-required"): string {
  return `${ownerScope}${receipt(verdict, correctionAudit)}\n### Reviewed delivery bindings\n\n| Variant ID | Delivery binding |\n|---|---|\n${binding === null ? "" : `| \`${binding.variantId}\` | \`${JSON.stringify(binding)}\` |\n`}`;
}
function crosswalk(ids = [variantId]): string {
  return `# Target\n\n## Selected behavioral variants\n\n| Variant ID | Obligation families | Contract owner | Representative model ID | Acceptance owner |\n|---|---|---|---|---|\n${ids.map(id => `| \`${id}\` | Control flow; human work | [Contract](CONTRACT-PROPOSAL.md#scope) | \`${model.id}\` | [Closure](DELIVERY-PROPOSAL.md#independent-cold-review-receipt) |`).join("\n")}\n\n## Optional integrations and exclusions\n`;
}

async function fixture(relationship: ReviewedDeliveryBinding["relationship"] = "reviewedComposition") {
  assert.ok(model.source.kind === "retainedScenario");
  const files = new Map<string, Uint8Array>();
  const put = (name: string, contents: string) => { files.set(name, Buffer.from(contents)); return { path: name, sha256: sha256(contents) }; };
  const source = put(relationship === "exactRepresentative" ? model.source.bpmnRelativePath : "scenarios/delivery/process.bpmn",
    relationship === "exactRepresentative" ? await readFile(`${projectRoot}/${model.source.bpmnRelativePath}`, "utf8") : "<definitions>metadata-bearing delivery source</definitions>");
  const profile = put(`profiles/${model.profile}/profile.json`, JSON.stringify({ kind: "semanticProfile", id: model.profile }));
  const overlay = put("scenarios/delivery/source-overlay.json", JSON.stringify({ kind: "bpmnSourceOverlay", id: "invoice-handlers", semanticProfile: model.profile }));
  const scenario = put(relationship === "exactRepresentative" ? model.source.scenarioRelativePath : "scenarios/delivery/scenario.json",
    JSON.stringify({ kind: "scenario", profile: model.profile, bpmn: { relativePath: source.path, sha256: source.sha256, sourceOverlay: { id: "invoice-handlers", sha256: overlay.sha256 } } }));
  const handlers = put("hosts/invoice-handlers.ts", "export function serialHandlers() {}\nexport function recoveryHandlers() {}\n");
  const host = put("hosts/host.ts", "import { serialHandlers } from './invoice-handlers.ts';\n");
  put(contractPath, contract);
  const binding: ReviewedDeliveryBinding = { variantId, modelId: model.id, relationship,
    scope: [
      { path: contractPath, headingPath: "Contract > Scope", sha256: sha256(exactMarkdownSection(contract, "Contract > Scope")) },
      { path: ownerPath, headingPath: "Delivery > Public contract", sha256: sha256(exactMarkdownSection(ownerScope, "Delivery > Public contract")) },
    ], source, profile, scenario, sourceOverlay: { ...overlay, id: "invoice-handlers" },
    configuration: { files: [handlers, host], handlerFactory: { modulePath: handlers.path, exportName: "serialHandlers" } },
  };
  files.set(ownerPath, Buffer.from(owner(binding)));
  files.set(crosswalkPath, Buffer.from(crosswalk()));
  files.set("model-corpus/manifest.json", Buffer.from(JSON.stringify(manifest)));
  const reviewed = new Map([...files].map(([name, bytes]) => [name, bytes.slice()]));
  const reader: DeliveryEvidenceReader = { current: async name => files.get(name) ?? null,
    reviewed: async (_target, name) => reviewed.get(name) ?? null };
  const read = () => readSelectedDeliveryCohort(Buffer.from(files.get(crosswalkPath)!).toString("utf8"), manifest.models, reader);
  return { files, reviewed, reader, binding, read };
}

for (const relationship of ["exactRepresentative", "reviewedComposition"] as const) {
  test(`accepts only a reviewed exact tuple for ${relationship}`, async () => {
    const setup = await fixture(relationship);
    const cohort = await setup.read();
    assert.equal(cohort.acceptedVariants, 1);
    assert.equal(cohort.openVariants, 0);
    assert.equal(cohort.rows[0]?.status, "accepted");
    assert.equal(cohort.rows[0]?.modelId, model.id);
    if (relationship === "reviewedComposition") assert.notEqual(setup.binding.source.sha256, model.source.sha256);
  });
}

test("missing, pending, failed and malformed closure cannot accept a declared binding", async () => {
  for (const verdict of ["pending", "reject", "invented"] as const) {
    const setup = await fixture();
    setup.files.set(ownerPath, Buffer.from(owner(setup.binding, verdict)));
    const result = await setup.read();
    assert.equal(result.acceptedVariants, 0);
    assert.equal(result.rows[0]?.status, "open");
    assert.ok(result.rows[0]!.reasons.length > 0);
  }
  const setup = await fixture();
  setup.files.delete(ownerPath);
  assert.equal((await setup.read()).rows[0]?.status, "open");
});

test("new rows and edited relationships cannot borrow an older approved closure", async () => {
  const setup = await fixture();
  setup.reviewed.set(ownerPath, Buffer.from(owner(null)));
  assert.equal((await setup.read()).acceptedVariants, 0);
  setup.reviewed.set(ownerPath, Buffer.from(owner(setup.binding)));
  setup.files.set(ownerPath, Buffer.from(owner({ ...setup.binding, relationship: "exactRepresentative" })));
  assert.equal((await setup.read()).acceptedVariants, 0);
});

test("the final required-edit audit must own the binding and all qualified bytes", async () => {
  const setup = await fixture();
  setup.files.set(ownerPath, Buffer.from(owner(setup.binding, "approve-with-required-edits", audit)));
  const targets: string[] = [];
  const reader: DeliveryEvidenceReader = { ...setup.reader, reviewed: async (revision, name) => {
    targets.push(revision); return setup.reviewed.get(name) ?? null;
  } };
  const cohort = await readSelectedDeliveryCohort(crosswalk(), manifest.models, reader);
  assert.equal(cohort.acceptedVariants, 1);
  assert.equal(cohort.rows[0]?.closure.target, audit);
  assert.ok(targets.length > 1 && targets.every(revision => revision === audit));
  setup.reviewed.delete(setup.binding.source.path);
  assert.equal((await readSelectedDeliveryCohort(crosswalk(), manifest.models, reader)).acceptedVariants, 0);
});

test("current and approved-target source, scenario, profile, overlay and configuration mismatches fail closed", async () => {
  for (const name of ["source", "scenario", "profile", "sourceOverlay"] as const) {
    for (const location of ["files", "reviewed"] as const) {
      const setup = await fixture();
      const file = setup.binding[name]!;
      setup[location].set(file.path, Buffer.from("changed bytes"));
      assert.equal((await setup.read()).acceptedVariants, 0, `${location}/${name}`);
    }
  }
  for (const fileIndex of [0, 1]) {
    const setup = await fixture();
    setup.files.delete(setup.binding.configuration.files[fileIndex]!.path);
    assert.equal((await setup.read()).acceptedVariants, 0);
  }
});

test("source/profile declarations, selected model relationship and handler factory are independently bound", async () => {
  for (const mutate of [
    (binding: ReviewedDeliveryBinding) => ({ ...binding, modelId: "invoice-validation-rework" }),
    (binding: ReviewedDeliveryBinding) => ({ ...binding, relationship: "exactRepresentative" as const }),
    (binding: ReviewedDeliveryBinding) => ({ ...binding, profile: binding.source }),
    (binding: ReviewedDeliveryBinding) => ({ ...binding, configuration: { ...binding.configuration,
      handlerFactory: { modulePath: "missing.ts", exportName: "serialHandlers" } } }),
  ]) {
    const setup = await fixture();
    const changed = owner(mutate(setup.binding));
    setup.files.set(ownerPath, Buffer.from(changed)); setup.reviewed.set(ownerPath, Buffer.from(changed));
    assert.equal((await setup.read()).acceptedVariants, 0);
  }
  for (const property of ["profile", "bpmn"] as const) {
    const setup = await fixture();
    const bytes = JSON.stringify({ kind: "scenario", profile: property === "profile" ? "wrong-profile" : model.profile,
      bpmn: { relativePath: setup.binding.source.path, sha256: property === "bpmn" ? "0".repeat(64) : setup.binding.source.sha256,
        sourceOverlay: { id: setup.binding.sourceOverlay!.id, sha256: setup.binding.sourceOverlay!.sha256 } } });
    const changed = { ...setup.binding, scenario: { ...setup.binding.scenario, sha256: sha256(bytes) } };
    setup.files.set(changed.scenario.path, Buffer.from(bytes)); setup.reviewed.set(changed.scenario.path, Buffer.from(bytes));
    setup.files.set(ownerPath, Buffer.from(owner(changed))); setup.reviewed.set(ownerPath, Buffer.from(owner(changed)));
    assert.equal((await setup.read()).acceptedVariants, 0);
  }
});

test("duplicate IDs and malformed JSON are open rather than a reduced denominator", async () => {
  const setup = await fixture();
  setup.files.set(crosswalkPath, Buffer.from(crosswalk([variantId, variantId])));
  await assert.rejects(setup.read(), /duplicate/u);
  setup.files.set(crosswalkPath, Buffer.from(crosswalk()));
  setup.files.set(ownerPath, Buffer.from(`${ownerScope}${receipt()}\n### Reviewed delivery bindings\n\n| Variant ID | Delivery binding |\n|---|---|\n| \`${variantId}\` | \`{bad}\` |\n`));
  const cohort = await setup.read();
  assert.equal(cohort.rows.length, 1);
  assert.equal(cohort.rows[0]?.status, "open");
});

test("malformed owner encoding and absent binding tables retain an open selected row", async () => {
  const setup = await fixture();
  setup.files.set(ownerPath, Uint8Array.of(0xff));
  let cohort = await setup.read();
  assert.equal(cohort.rows.length, 1);
  assert.equal(cohort.rows[0]?.status, "open");
  assert.ok(cohort.rows[0]?.reasons.includes("closureMalformed"));
  setup.files.set(ownerPath, Buffer.from(`${ownerScope}${receipt()}`));
  cohort = await setup.read();
  assert.equal(cohort.rows.length, 1);
  assert.ok(cohort.rows[0]?.reasons.includes("bindingMissing"));
});

test("derived closure transitions count only after stable binding, while scope and same-ID overlay digest drift are separate", async () => {
  const setup = await fixture();
  setup.files.set(ownerPath, Buffer.from(owner(setup.binding, "pending")));
  const pending = await setup.read();
  setup.files.set(ownerPath, Buffer.from(owner(setup.binding)));
  const accepted = await setup.read();
  let delta = compareSelectedDeliveryCohorts(pending, accepted, 86_400_000);
  assert.deepEqual(delta.closedVariantIds, [variantId]);
  assert.equal(delta.ratePerDay, 1);
  setup.files.set(contractPath, Buffer.from(contract.replace("Selected business behavior", "Wider business behavior")));
  const drifted = await setup.read();
  assert.equal(drifted.acceptedVariants, 0);
  delta = compareSelectedDeliveryCohorts(accepted, drifted, 86_400_000);
  assert.deepEqual(delta.scopeChangedIds, [variantId]);
  assert.deepEqual(delta.openedVariantIds, []);
  assert.equal(delta.ratePerDay, null);
  setup.files.set(contractPath, Buffer.from(contract));
  setup.files.set(setup.binding.sourceOverlay!.path, Buffer.from(JSON.stringify({
    kind: "bpmnSourceOverlay", id: setup.binding.sourceOverlay!.id, semanticProfile: model.profile, changed: true,
  })));
  const overlayDrifted = await setup.read();
  assert.equal(overlayDrifted.acceptedVariants, 0);
  assert.deepEqual(compareSelectedDeliveryCohorts(accepted, overlayDrifted, 86_400_000).scopeChangedIds, [variantId]);
});

test("a null overlay requires physical scenario omission and a configured factory change cannot borrow review", async () => {
  const setup = await fixture();
  const bytes = JSON.stringify({ kind: "scenario", profile: model.profile,
    bpmn: { relativePath: setup.binding.source.path, sha256: setup.binding.source.sha256 } });
  const noOverlay = { ...setup.binding, sourceOverlay: null, scenario: { ...setup.binding.scenario, sha256: sha256(bytes) } };
  for (const files of [setup.files, setup.reviewed]) {
    files.set(noOverlay.scenario.path, Buffer.from(bytes)); files.set(ownerPath, Buffer.from(owner(noOverlay)));
  }
  assert.equal((await setup.read()).acceptedVariants, 1);
  const changedFactory = { ...noOverlay, configuration: { ...noOverlay.configuration,
    handlerFactory: { ...noOverlay.configuration.handlerFactory, exportName: "recoveryHandlers" } } };
  setup.files.set(ownerPath, Buffer.from(owner(changedFactory)));
  const cohort = await setup.read();
  assert.equal(cohort.acceptedVariants, 0);
  assert.ok(cohort.rows[0]?.reasons.includes("bindingUnreviewed"));
});

test("the production approval reader consumes immutable objects, never a newly written owner", async () => {
  const reader = deliveryEvidenceReader(projectRoot);
  assert.equal(await reader.reviewed(target, ownerPath), null);
  const bytes = await reader.reviewed(target, "docs/BUSINESS-PROCESS-PUBLIC-DELIVERY-PROPOSAL.md");
  assert.ok(bytes !== null);
  assert.match(Buffer.from(bytes).toString("utf8"), /## Public deployment contract/u);
});

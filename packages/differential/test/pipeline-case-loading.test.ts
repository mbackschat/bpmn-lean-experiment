import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { SemanticOperationKind } from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import { profile, source, sourceOverlay } from "../../bpmn-source/test/serial-business-task-fixture.ts";
import { sourceOverlay as multipleBindings } from "../../bpmn-source/test/mixed-task-control-flow-fixture.ts";
import { loadAndCompileCases } from "./pipeline-case-loading.ts";
import { projectRoot, readJson } from "./pipeline-target-support.ts";
import { transactionCancellationPipelineCases } from "./transaction-cancellation-pipeline-cases.ts";
import type { SemanticDifferentialCase } from "./pipeline-types.ts";

const digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

test("pipeline compilation binds each selected overlay's identity and exact bytes", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-pipeline-overlay-"));
  const baseline = transactionCancellationPipelineCases[0]!;
  const original = await readJson<Scenario>(path.join(projectRoot, baseline.scenarioRelativePath));
  try {
    const xml = await readFile(source, "utf8");
    const bpmnPath = path.join(directory, "invoice.bpmn");
    await writeFile(bpmnPath, xml);
    const first = sourceOverlay();
    const second = multipleBindings(["invoiceValidator", "unusedValidator"], profile);
    const prepare = async (id: string, overlay: typeof first, bytes = overlay.bytes) => {
      const overlayPath = path.join(directory, `${id}.overlay.json`);
      const scenarioPath = path.join(directory, `${id}.scenario.json`);
      await writeFile(overlayPath, bytes);
      const scenario: Scenario = { ...original, id, profile, stimuli: [], bpmn: {
        id: "invoice", relativePath: path.relative(projectRoot, bpmnPath), sha256: digest(xml),
        sourceOverlay: { id: overlay.id, sha256: overlay.sha256 },
      } };
      await writeFile(scenarioPath, JSON.stringify(scenario));
      return { ...baseline, id, scenarioRelativePath: path.relative(projectRoot, scenarioPath),
        bpmnRelativePath: path.relative(projectRoot, bpmnPath),
        sourceOverlayRelativePath: path.relative(projectRoot, overlayPath) };
    };
    const selected = [await prepare("first", first), await prepare("second", second)];
    await t.test("same BPMN and profile retain distinct overlay-bound definitions", async () => {
      const loaded = await loadAndCompileCases(selected);
      assert.deepEqual(loaded.map(value => value.semanticProcess.identity.sourceOverlay),
        [first, second].map(({ id, sha256 }) => ({ id, sha256 })));
      assert.deepEqual(loaded.map(value => value.semanticProcess.operations.flatMap(operation =>
        operation.kind === SemanticOperationKind.AwaitEffect ? [operation.effect.descriptor.operation] : [])),
      [["invoiceValidator"], ["invoiceValidator"]]);
    });
    await t.test("a declared overlay cannot be silently omitted", async () => {
      const scenarioPath = path.join(directory, "missing-overlay.scenario.json");
      await writeFile(scenarioPath, JSON.stringify({ ...original, bpmn: { ...original.bpmn,
        sourceOverlay: { id: first.id, sha256: first.sha256 } } }));
      await assert.rejects(loadAndCompileCases([{ ...baseline,
        scenarioRelativePath: path.relative(projectRoot, scenarioPath) }]), /source overlay.*path/i);
    });
    await t.test("an overlay path without scenario identity cannot be ignored", async () => {
      const unexpected = { ...baseline, sourceOverlayRelativePath: selected[0]!.sourceOverlayRelativePath };
      await assert.rejects(loadAndCompileCases([unexpected]), /source overlay.*identity/i);
    });
    await t.test("a cached valid definition cannot excuse different bytes under the same claimed identity", async () => {
      const corrupt = await prepare("corrupt", first, second.bytes);
      await assert.rejects(loadAndCompileCases([selected[0]!, corrupt]), /Source overlay expected SHA-256/);
    });
    await t.test("a different claimed digest for the same path is checked", async () => {
      const corrupt = await prepare("wrong-digest", { ...first, sha256: "0".repeat(64) });
      await assert.rejects(loadAndCompileCases([selected[0]!, { ...corrupt,
        sourceOverlayRelativePath: selected[0]!.sourceOverlayRelativePath }]), /Source overlay expected SHA-256/);
    });
    await t.test("existing overlay-free cases preserve their definition identity", async () => {
      const [loaded] = await loadAndCompileCases<SemanticDifferentialCase>([baseline]);
      assert.equal(loaded?.semanticProcess.identity.sourceOverlay, null);
      assert.equal(loaded?.semanticProcess.identity.sourceSha256, original.bpmn.sha256);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { buildProcessShowcaseCatalog } from "../../../../scripts/rc-showcase-catalog.ts";
import { BpmnAutoLayoutPresentationAdapter } from "../dist/index.js";
import { parsePresentationModel } from "../dist/presentation-model.js";

const catalog = await buildProcessShowcaseCatalog(fileURLToPath(new URL("../../../../", import.meta.url)));
const nestedSource = await readFile(new URL("../../../../scenarios/terminate-end-event/process.bpmn", import.meta.url), "utf8");
for (const seedId of ["Normal_Outer", "LayoutSeedDiagram", "LayoutSeedPlane", "LayoutSeedShape_0"]) {
  test(`preserves expanded scope coverage when source occupies ${seedId} and its suffixes`, async () => {
    const source = nestedSource.replaceAll("UserTask_Outer", seedId)
      .replaceAll("Start_Root", `${seedId}_1`).replaceAll("End_Root", `${seedId}_2`);
    const adapter = new BpmnAutoLayoutPresentationAdapter();
    const generated = await adapter.generate(source, "Process_TerminateEnd");
    const composed = await adapter.validateGeneratedComposition(source, "Process_TerminateEnd", generated.diagramInterchangeXml);
    assert.equal(composed.replace(generated.diagramInterchangeXml, ""), source);
    const parsed = await parsePresentationModel(composed, "seed collision presentation");
    const shapes = parsed.definitions.diagrams![0]!.plane!.planeElement!;
    assert.equal(shapes.find((shape) => shape.bpmnElement?.id === "SubProcess_Work")?.isExpanded, true);
    for (const id of [seedId, `${seedId}_1`, `${seedId}_2`, "UserTask_Trigger", "UserTask_Sibling"]) {
      assert.equal(shapes.filter((shape) => shape.bpmnElement?.id === id).length, 1);
    }
    assert.deepEqual(await adapter.generate(source, "Process_TerminateEnd"), generated);
  });
}
const selected = [
  ["claim-assessment-with-input-and-decision", "Process_ClaimAssessment"],
  ["confirmed-travel-cancellation", "Process_Compensation"],
  ["parallel-risk-review-all", "Process_ParallelMultiInstanceReview"],
  ["ordered-batch-document-review", "Process_SequentialMultiInstanceReview"],
  ["application-subscription-boundary-message", "Process_TerminateEnd"],
  ["reservation-withdrawal", "Process_Withdrawal"],
];
for (const [id, processId] of selected) {
  test(`renders the complete ${id} presentation while preserving exact source`, async () => {
    const entry = catalog.find((model) => model.id === id)!;
    const adapter = new BpmnAutoLayoutPresentationAdapter();
    const generated = await adapter.generate(entry.xml, processId!);
    const composed = await adapter.validateGeneratedComposition(entry.xml, processId!, generated.diagramInterchangeXml);
    assert.equal(composed.replace(generated.diagramInterchangeXml, ""), entry.xml);
    const parsed = await parsePresentationModel(composed, "showcase");
    const shapes = parsed.definitions.diagrams![0]!.plane!.planeElement!;
    const source = await parsePresentationModel(entry.xml, "source");
    for (const element of Object.values(source.elementsById)) {
      if (!element.$instanceOf("bpmn:FlowNode") && !element.$instanceOf("bpmn:SequenceFlow")
        && element.$type !== "bpmn:Association" && element.$type !== "bpmn:DataObjectReference") continue;
      const matching = shapes.filter((shape) => shape.bpmnElement?.id === element.id);
      assert.equal(matching.length, 1, `missing or duplicate ${element.id}`);
      if (element.$instanceOf("bpmn:SubProcess")) assert.equal(matching[0]!.isExpanded, true);
    }
    for (const association of ["DataInputAssociation_Items", "DataOutputAssociation_Results"]) {
      if (source.elementsById[association] === undefined) continue;
      assert.equal(shapes.filter((shape) => shape.bpmnElement?.id === association).length, 1);
    }
    const victims = shapes.filter((shape) => {
      const element = source.elementsById[shape.bpmnElement!.id!];
      return element?.$type === "bpmn:Association" || element?.$type === "bpmn:DataInputAssociation"
        || element?.$type === "bpmn:DataOutputAssociation"
        || element?.$type === "bpmn:DataObjectReference"
        || (element?.$type === "bpmn:SequenceFlow" && element.$parent?.$instanceOf("bpmn:SubProcess"));
    });
    victims.push(shapes.find((shape) => shape.$type === "bpmndi:BPMNEdge")!);
    for (const victim of victims) {
      const tag = victim.$type.replace("bpmndi:", "");
      const incomplete = generated.diagramInterchangeXml.replace(new RegExp(`<bpmndi:${tag}[^>]*id="${victim.id}"[\\s\\S]*?</bpmndi:${tag}>`), "");
      await assert.rejects(adapter.validateGeneratedComposition(entry.xml, processId!, incomplete), /needs exactly one/);
    }
    if (generated.diagramInterchangeXml.includes('isExpanded="true"')) {
      await assert.rejects(adapter.validateGeneratedComposition(entry.xml, processId!,
        generated.diagramInterchangeXml.replace('isExpanded="true"', 'isExpanded="false"')), /must be expanded/);
    }
  });
}

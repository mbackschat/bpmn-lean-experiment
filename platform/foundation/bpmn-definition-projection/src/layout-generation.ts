import { layoutProcess } from "bpmn-auto-layout";
import { createPresentationModdle, parsePresentationModel } from "./presentation-model.js";
import type { ModdleElement } from "./presentation-model.js";
import { layoutInventory, sourceReferences } from "./layout-inventory.js";

/** Normalizes only the private generator input; index.ts extracts DI into the untouched source. */
export async function generateLayout(sourceXml: string): Promise<string> {
  const moddle = createPresentationModdle();
  const source = await parsePresentationModel(sourceXml, "layout input");
  const reservedIds = new Set(Object.keys(source.elementsById));
  const process = source.definitions.rootElements!.find((element) => element.$type === "bpmn:Process")!;
  const inventory = layoutInventory(process);
  const nodes = inventory.shapes.filter((element) => element.$instanceOf("bpmn:FlowNode"));
  const incoming = new Map<ModdleElement, ModdleElement[]>();
  const outgoing = new Map<ModdleElement, ModdleElement[]>();
  for (const flow of inventory.edges.filter((element) => element.$type === "bpmn:SequenceFlow")) {
    const from = sourceReferences(flow)[0];
    const to = flow.targetRef;
    if (!from || !to) throw new Error("Sequence Flow has no source or target");
    const fromFlows = outgoing.get(from) ?? [];
    const toFlows = incoming.get(to) ?? [];
    fromFlows.push(flow);
    toFlows.push(flow);
    outgoing.set(from, fromFlows);
    incoming.set(to, toFlows);
  }
  for (const node of nodes) {
    node.set("incoming", incoming.get(node) ?? []);
    node.set("outgoing", outgoing.get(node) ?? []);
  }
  // bpmn-auto-layout 1.3.0 reads expansion from input DI and then replaces it (Layouter.layoutProcess).
  const plane = moddle.create("bpmndi:BPMNPlane", { id: allocateSeedId("LayoutSeedPlane", reservedIds), bpmnElement: process,
    planeElement: inventory.scopes.slice(1).map((scope, index) => moddle.create("bpmndi:BPMNShape", {
      id: allocateSeedId(`LayoutSeedShape_${index}`, reservedIds), bpmnElement: scope, isExpanded: true,
    })),
  });
  source.definitions.set("diagrams", [moddle.create("bpmndi:BPMNDiagram", { id: allocateSeedId("LayoutSeedDiagram", reservedIds), plane })]);
  const candidate = await parsePresentationModel(await layoutProcess((await moddle.toXML(source.definitions, { format: true })).xml), "layout candidate");
  const outputPlane = candidate.definitions.diagrams![0]!.plane!;
  const candidateProcess = candidate.definitions.rootElements!.find((element) => element.id === process.id)!;
  const selected = layoutInventory(candidateProcess);
  const visibleIds = new Set(selected.shapes.map((shape) => shape.id));
  const geometry = (outputPlane.planeElement ?? []).filter((element) => element.$type !== "bpmndi:BPMNShape" || visibleIds.has(element.bpmnElement?.id));
  const shapes = new Map(geometry.filter((element) => element.$type === "bpmndi:BPMNShape").map((element) => [element.bpmnElement!.id, element]));
  for (const connection of selected.connections) {
    const sourceShape = shapes.get(connection.source.id);
    const targetShape = shapes.get(connection.target.id);
    if (!sourceShape?.bounds || !targetShape?.bounds) throw new Error("Association endpoint has no layout bounds");
    geometry.push(moddle.create("bpmndi:BPMNEdge", {
      id: `${connection.element.id}_di`, bpmnElement: connection.element,
      waypoint: connectBounds(sourceShape, targetShape).map((point) => moddle.create("dc:Point", point)),
    }));
  }
  outputPlane.set("planeElement", geometry);
  return (await moddle.toXML(candidate.definitions, { format: true })).xml;
}

function allocateSeedId(preferred: string, reserved: Set<string>): string {
  let candidate = preferred;
  for (let suffix = 1; reserved.has(candidate); suffix += 1) candidate = `${preferred}_${suffix}`;
  reserved.add(candidate);
  return candidate;
}

function connectBounds(source: ModdleElement, target: ModdleElement): { x: number; y: number }[] {
  const a = source.bounds!;
  const b = target.bounds!;
  const ax = a.x! + a.width! / 2;
  const ay = a.y! + a.height! / 2;
  const bx = b.x! + b.width! / 2;
  const by = b.y! + b.height! / 2;
  if (Math.abs(bx - ax) > Math.abs(by - ay)) {
    const direction = bx >= ax ? 1 : -1;
    return [{ x: ax + direction * a.width! / 2, y: ay }, { x: bx - direction * b.width! / 2, y: by }];
  }
  const direction = by >= ay ? 1 : -1;
  return [{ x: ax, y: ay + direction * a.height! / 2 }, { x: bx, y: by - direction * b.height! / 2 }];
}

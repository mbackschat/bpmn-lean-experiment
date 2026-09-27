import type { ModdleElement } from "./presentation-model.js";

export function sourceReferences(element: ModdleElement): readonly ModdleElement[] {
  const source = element.sourceRef;
  return source === undefined ? [] : Array.isArray(source) ? source : [source as ModdleElement];
}

export function layoutInventory(process: ModdleElement) {
  const scopes: ModdleElement[] = [process];
  for (let index = 0; index < scopes.length; index += 1) {
    scopes.push(...(scopes[index]!.flowElements ?? []).filter((element) => element.$instanceOf("bpmn:SubProcess")));
  }
  const elements = scopes.flatMap((scope) => scope.flowElements ?? []);
  const referencedData = new Set(elements.map((element) => element.dataObjectRef?.id).filter(Boolean));
  const shapes = elements.filter((element) => element.$instanceOf("bpmn:FlowNode")
    || element.$type === "bpmn:DataObjectReference"
    || (element.$type === "bpmn:DataObject" && !referencedData.has(element.id)));
  const shapeIds = new Set(shapes.map((shape) => shape.id));
  const associations = scopes.flatMap((scope) => scope.artifacts ?? []).filter((element) => element.$type === "bpmn:Association");
  const connections: { element: ModdleElement; source: ModdleElement; target: ModdleElement }[] = [];
  for (const element of associations) {
    const source = sourceReferences(element)[0];
    const target = element.targetRef;
    if (!source || !target || !shapeIds.has(source.id) || !shapeIds.has(target.id)) {
      throw new Error("generated layout does not support an Association without two visible endpoints");
    }
    connections.push({ element, source, target });
  }
  for (const activity of elements.filter((element) => element.$instanceOf("bpmn:Activity"))) {
    for (const element of activity.dataInputAssociations ?? []) {
      const sources = sourceReferences(element);
      const visible = sources.filter((source) => shapeIds.has(source.id));
      if (visible.length === 0) continue;
      if (sources.length !== 1) throw new Error("generated layout does not support multi-source Data Associations");
      connections.push({ element, source: visible[0]!, target: activity });
    }
    for (const element of activity.dataOutputAssociations ?? []) {
      if (element.targetRef !== undefined && shapeIds.has(element.targetRef.id)) {
        connections.push({ element, source: activity, target: element.targetRef });
      }
    }
  }
  return {
    scopes, shapes, connections,
    edges: [...elements.filter((element) => element.$type === "bpmn:SequenceFlow"), ...connections.map(({ element }) => element)],
  };
}

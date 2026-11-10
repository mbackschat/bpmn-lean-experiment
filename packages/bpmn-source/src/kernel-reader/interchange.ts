/**
 * Source forms with execution meaning that the reader must not read as something else (PC-BASIC-04). A referenced
 * event definition is a source form pinned CIB never resolves, so it stays a reader refusal; Receive `instantiate`,
 * Multiple and Parallel Multiple Events, Event-Based Gateway instantiation and `isExecutable` are read into the IL and
 * refused by `Kernel.Admission`.
 */
import { FlowElementKind, ReadRefusal, ReadRefusalCode, list, optionalId } from "./model.js";
import type { ModelNode } from "./model.js";

const eventKinds: ReadonlySet<FlowElementKind> = new Set([
  FlowElementKind.StartEvent,
  FlowElementKind.EndEvent,
  FlowElementKind.IntermediateCatchEvent,
  FlowElementKind.IntermediateThrowEvent,
  FlowElementKind.BoundaryEvent,
]);

/**
 * Refuses the first such form in identifier order. A catch or throw Event's `eventDefinitionRef` (BPMN 2.0.2 §10.5.1)
 * names a reusable definition; pinned `BpmnParse` has no reader for it, so a catch carrying one fails to deploy and
 * any other Event runs as a None Event. A `parallelMultiple` mark on an Event without a definition has no subscription
 * to carry it in the IL.
 */
export function requireReadableForms(nodes: ReadonlyArray<ModelNode>): void {
  for (const { element, kind } of nodes) {
    const id = optionalId(element);
    if (eventKinds.has(kind)) {
      const referenced = list(element, "eventDefinitionRef");
      if (referenced.length > 0) {
        throw new ReadRefusal(ReadRefusalCode.EventDefinitionRef, id, JSON.stringify(referenced.map((entry) => entry.id)));
      }
      if (element.parallelMultiple === true && list(element, "eventDefinitions").length === 0) {
        throw new ReadRefusal(ReadRefusalCode.FactNotCarried, id, "parallelMultiple without a definition");
      }
    }
  }
}

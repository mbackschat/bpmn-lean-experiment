/**
 * Source forms with execution meaning that the reader must not read as something else (PC-BASIC-04). A referenced
 * event definition is a source form pinned CIB never resolves, so it stays a reader refusal. Receive `instantiate`,
 * `parallelMultiple` and a non-executable root process have BPMN meaning the IL does not carry yet; they are refused
 * as facts not carried until the IL carries them and `Kernel.Admission` refuses them (`work.receive.instantiate`,
 * `event.parallelMultiple`, `process.notExecutable`).
 */
import type { ElementRecord } from "../moddle-graph.js";
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
 * any other Event runs as a None Event.
 */
export function requireReadableForms(rootProcess: ElementRecord, nodes: ReadonlyArray<ModelNode>): void {
  // Pinned `BpmnParse:560-574` deploys no process whose `isExecutable` is absent or false.
  if (rootProcess.isExecutable !== true) {
    throw new ReadRefusal(ReadRefusalCode.FactNotCarried, optionalId(rootProcess), "isExecutable absent or false");
  }
  for (const { element, kind } of nodes) {
    const id = optionalId(element);
    if (eventKinds.has(kind)) {
      const referenced = list(element, "eventDefinitionRef");
      if (referenced.length > 0) {
        throw new ReadRefusal(ReadRefusalCode.EventDefinitionRef, id, JSON.stringify(referenced.map((entry) => entry.id)));
      }
      if (element.parallelMultiple === true) throw new ReadRefusal(ReadRefusalCode.FactNotCarried, id, "parallelMultiple");
    }
    if (kind === FlowElementKind.ReceiveTask && element.instantiate === true) {
      throw new ReadRefusal(ReadRefusalCode.FactNotCarried, id, "instantiate");
    }
  }
}

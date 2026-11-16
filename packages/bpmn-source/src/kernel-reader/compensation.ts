import { asElement } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { firstDefinition, isCompensationDefinition } from "./events.js";
import { ReadRefusal, ReadRefusalCode, list, optionalId, requireId } from "./model.js";
import type { CompensationSubject, ModelNode } from "./model.js";
import { compareIds } from "./wire.js";

export type CompensationIndex = Readonly<{
  subjects: ReadonlyArray<CompensationSubject>;
  handlers: ReadonlySet<string>;
}>;

const isEventSubProcess = (element: ElementRecord): boolean =>
  element.$type === "bpmn:SubProcess" && element.triggeredByEvent === true;

function startOf(subProcess: ElementRecord): ElementRecord | undefined {
  return list(subProcess, "flowElements").find((element) => element.$type === "bpmn:StartEvent");
}

/** Whether `container` holds the flow node `id` directly or inside a Sub-Process it holds. */
function holds(nodes: ReadonlyMap<string, ModelNode>, container: ElementRecord, id: string): boolean {
  for (let node = nodes.get(id); node !== undefined; node = node.parent === null ? undefined : nodes.get(node.parent)) {
    if (node.container === container) return true;
  }
  return false;
}

/**
 * Compensation handlers are read from the model's Associations (an Activity subject's boundary Event linked to its
 * handler) and from compensation Event Sub-Processes (whose subject is the enclosing Sub-Process). Subjects are
 * ordered by subject id, the order the kernel starts handlers in when nothing else separates them. A handler stays in
 * the container that declares it; where it may sit relative to its subject is admission's
 * (`compensation.handlerPlacement`). CIB links an Association only from a scope that holds both its boundary and its
 * handler, searching nested scopes (`BpmnParse.parseAssociations`, `BpmnParse.java:848-883`, and the recursive
 * `CoreActivity.findActivity`, `CoreActivity.java:42-54`), and deploys any other unlinked; the IL cannot carry where an
 * Association is declared, so such an Association is refused (`compensation.associationScope`, CIB-LIM-0060). A handler
 * that names no flow node is left to admission (`il.reference`).
 */
export function indexCompensation(
  nodes: ReadonlyMap<string, ModelNode>,
  containers: ReadonlyArray<ElementRecord>,
): CompensationIndex {
  const subjects: CompensationSubject[] = [];
  for (const container of containers) {
    for (const artifact of list(container, "artifacts")) {
      if (artifact.$type !== "bpmn:Association") continue;
      const boundary = asElement(artifact.sourceRef);
      const handler = asElement(artifact.targetRef);
      if (boundary?.$type !== "bpmn:BoundaryEvent" || handler === undefined || !isCompensationDefinition(firstDefinition(boundary))) continue;
      const subject = asElement(boundary.attachedToRef);
      if (subject === undefined) continue;
      const handlerNode = nodes.get(requireId(handler));
      if (!holds(nodes, container, requireId(boundary)) ||
          (handlerNode !== undefined && !holds(nodes, container, requireId(handler)))) {
        const declaring = optionalId(container) ?? "a container";
        throw new ReadRefusal(ReadRefusalCode.CompensationAssociationScope, optionalId(artifact),
          `Association from ${requireId(boundary)} to ${requireId(handler)} declared in ${declaring} that does not hold both`);
      }
      subjects.push({
        subject: requireId(subject),
        handler: requireId(handler),
        boundary: requireId(boundary),
        container: handlerNode?.container ?? container,
      });
    }
    for (const element of list(container, "flowElements")) {
      if (!isEventSubProcess(element)) continue;
      const start = startOf(element);
      if (start === undefined || !isCompensationDefinition(firstDefinition(start))) continue;
      const subjectId = optionalId(container);
      if (subjectId === null) continue;
      subjects.push({ subject: subjectId, handler: requireId(element), boundary: null, container });
    }
  }
  subjects.sort((left, right) => compareIds(left.subject, right.subject));
  return { subjects, handlers: new Set(subjects.map((entry) => entry.handler)) };
}

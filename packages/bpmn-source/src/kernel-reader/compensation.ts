import { asElement } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { isCompensationDefinition, singleDefinition } from "./events.js";
import { list, optionalId, requireId } from "./model.js";
import type { CompensationSubject, ModelNode } from "./model.js";
import { compareIds } from "./wire.js";

export type CompensationIndex = Readonly<{
  subjects: ReadonlyArray<CompensationSubject>;
  handlers: ReadonlySet<string>;
  /** The start Event, end Event and flows of a single-effect compensation Event Sub-Process. */
  erased: ReadonlySet<string>;
}>;

const isEventSubProcess = (element: ElementRecord): boolean =>
  element.$type === "bpmn:SubProcess" && element.triggeredByEvent === true;

function startOf(subProcess: ElementRecord): ElementRecord | undefined {
  return list(subProcess, "flowElements").find((element) => element.$type === "bpmn:StartEvent");
}

/**
 * The material of a compensation Event Sub-Process whose body is exactly `start -> one Activity -> end`, which the
 * IL represents as the effect Activity alone (BPMN 2.0.2 §13.3.4: an Activity without incoming flow begins with its
 * Scope); `undefined` for any other body, which is read in full. `Kernel.Feature.Compensation` begins it that way.
 */
function singleEffectMaterial(subProcess: ElementRecord): ReadonlyArray<string> | undefined {
  const elements = list(subProcess, "flowElements");
  const flows = elements.filter((element) => element.$type === "bpmn:SequenceFlow");
  const others = elements.filter((element) => element.$type !== "bpmn:SequenceFlow");
  const starts = others.filter((element) => element.$type === "bpmn:StartEvent");
  const ends = others.filter((element) => element.$type === "bpmn:EndEvent");
  const activities = others.filter((element) => element.$type !== "bpmn:StartEvent" && element.$type !== "bpmn:EndEvent");
  const start = starts[0];
  const end = ends[0];
  const activity = activities[0];
  if (others.length !== 3 || flows.length !== 2 || start === undefined || end === undefined || activity === undefined) return undefined;
  const connects = (from: ElementRecord, to: ElementRecord): boolean =>
    flows.some((flow) => asElement(flow.sourceRef) === from && asElement(flow.targetRef) === to);
  if (!connects(start, activity) || !connects(activity, end)) return undefined;
  return [requireId(start), requireId(end), ...flows.map(requireId)];
}

/**
 * Compensation handlers are read from the model's Associations (an Activity subject's boundary Event linked to its
 * handler) and from compensation Event Sub-Processes (whose subject is the enclosing Sub-Process). Subjects are
 * ordered by subject id, the order the kernel starts handlers in when nothing else separates them.
 */
export function indexCompensation(
  nodes: ReadonlyMap<string, ModelNode>,
  containers: ReadonlyArray<ElementRecord>,
): CompensationIndex {
  const subjects: CompensationSubject[] = [];
  const erased = new Set<string>();
  for (const container of containers) {
    for (const artifact of list(container, "artifacts")) {
      if (artifact.$type !== "bpmn:Association") continue;
      const boundary = asElement(artifact.sourceRef);
      const handler = asElement(artifact.targetRef);
      if (boundary?.$type !== "bpmn:BoundaryEvent" || handler === undefined || !isCompensationDefinition(singleDefinition(boundary))) continue;
      const subject = asElement(boundary.attachedToRef);
      if (subject === undefined) continue;
      const subjectNode = nodes.get(requireId(subject));
      subjects.push({
        subject: requireId(subject),
        handler: requireId(handler),
        boundary: requireId(boundary),
        container: subjectNode?.container ?? container,
      });
    }
    for (const element of list(container, "flowElements")) {
      if (!isEventSubProcess(element)) continue;
      const start = startOf(element);
      if (start === undefined || !isCompensationDefinition(singleDefinition(start))) continue;
      const subjectId = optionalId(container);
      if (subjectId === null) continue;
      subjects.push({ subject: subjectId, handler: requireId(element), boundary: null, container });
      for (const id of singleEffectMaterial(element) ?? []) erased.add(id);
    }
  }
  subjects.sort((left, right) => compareIds(left.subject, right.subject));
  return { subjects, handlers: new Set(subjects.map((entry) => entry.handler)), erased };
}

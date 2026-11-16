import { hasDirectChild, parseXmlElements } from "./minimal-xml-tree.ts";

/**
 * Keeps `isInterrupting` off the start Event of a Compensation Event Sub-Process.
 *
 * BPMN 2.0.2 Table 10.87 says a Start Event's `isInterrupting` "cannot be applied to ... Compensation Events (where it
 * doesn't apply)", and the kernel gives the attribute no meaning there. CIB Seven 2.2.0 reads it anyway: it gives such a
 * start the concurrent in-flow-scope behavior and then fails the compensation (CIB-LIM-0045), where the same model
 * without the attribute runs. A model that declares it therefore cannot be compared with CIB at all.
 *
 * The scan is lexical (`minimal-xml-tree.ts`) and sees only a start that holds its `compensateEventDefinition` as a direct
 * child; no repository model references a shared definition through `eventDefinitionRef`.
 */
const eventSubProcessNames: ReadonlySet<string> = new Set(["subProcess", "transaction", "adHocSubProcess"]);

export type CompensationStart = Readonly<{ id: string; declaresInterruption: boolean }>;

/** Every Compensation start Event of an Event Sub-Process in `xml`, and whether it declares `isInterrupting`. */
export function compensationStarts(xml: string): ReadonlyArray<CompensationStart> {
  const starts: CompensationStart[] = [];
  const pending = [...parseXmlElements(xml).roots];
  while (pending.length > 0) {
    const element = pending.shift();
    if (element === undefined) continue;
    pending.push(...element.children);
    if (!eventSubProcessNames.has(element.name) || element.attributes.triggeredByEvent !== "true") continue;
    for (const child of element.children) {
      if (child.name === "startEvent" && hasDirectChild(child, "compensateEventDefinition")) {
        starts.push({ id: child.attributes.id ?? "<no id>", declaresInterruption: "isInterrupting" in child.attributes });
      }
    }
  }
  return starts;
}

import { asElement, asElementArray } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { createExtensionTracker, list, ReadRefusal, ReadRefusalCode, text } from "./model.js";
import type { ReadContext } from "./model.js";

/** The root identifier of a delegate expression, which CIB resolves against variables before beans. */
const tokenOf = (delegate: string): string | null => /^[$#]\{\s*([A-Za-z_$][\w$]*)/.exec(delegate)?.[1] ?? null;

/** The writable names one Activity declares: form field ids, parameter and Call targets, its result and loop item names. */
function activityNames(peek: ReturnType<typeof createExtensionTracker>, element: ElementRecord): string[] {
  const children = (localName: string): ElementRecord[] =>
    peek.extensions(element, localName).flatMap((block) => asElementArray(block.$children) ?? []);
  const loop = asElement(element.loopCharacteristics);
  const item = asElement(loop?.inputDataItem);
  return [
    ...children("formData").map((field) => text(field, "id")),
    ...children("inputOutput").map((parameter) => text(parameter, "name")),
    ...peek.extensions(element, "in").map((copy) => text(copy, "target")),
    ...peek.extensions(element, "out").map((copy) => text(copy, "target")),
    peek.attribute(element, "resultVariable"),
    loop === undefined ? null : peek.attribute(loop, "elementVariable"),
    item === undefined ? null : text(item, "id"),
    item === undefined ? null : text(item, "name"),
  ].filter((name): name is string => name !== null);
}

/** A Process's items, by the ids the kernel installs them under. */
function processItems(process: ElementRecord): string[] {
  const io = asElement(process.ioSpecification) ?? {};
  const data = list(process, "flowElements")
    .filter((element) => element.$type === "bpmn:DataObject" || element.$type === "bpmn:DataObjectReference");
  return [...list(process, "properties"), ...data, ...list(io, "dataInputs"), ...list(io, "dataOutputs")]
    .map((element) => text(element, "id")).filter((name): name is string => name !== null);
}

/**
 * Refuses a program that declares a writable name equal to the token `delegate` binds (WORK-SEMANTICS-SPEC "Writable
 * handler key"): CIB would resolve that variable instead of the handler (`JuelExpressionManager.java:144-150`), while
 * the IL carries the bound operation and no token. The extent is every Process of these Definitions, because a Call
 * mapping carries a name into a called Process. It reads through its own tracker, so the check consumes nothing that
 * `requireCarried` must still see.
 */
export function requireNoHandlerKeyName(ctx: ReadContext, element: ElementRecord, delegate: string): void {
  const token = tokenOf(delegate);
  if (token === null) return;
  const peek = createExtensionTracker(ctx.definitions);
  const declared = [
    ...ctx.processes.flatMap(processItems),
    ...[...ctx.nodes.values()].flatMap((node) => activityNames(peek, node.element)),
  ];
  if (declared.includes(token)) throw new ReadRefusal(ReadRefusalCode.HandlerKeyName, text(element, "id"), token);
}

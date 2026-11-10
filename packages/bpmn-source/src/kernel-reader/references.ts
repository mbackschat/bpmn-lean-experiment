/**
 * QName closure of the references `bpmn-moddle` leaves unresolved (PC-BASIC-04). The parser resolves a reference by
 * identifier only, so a reference written `p:local` fails even when `p` names the document's own target namespace.
 * One reviewed rule binds exactly that form where pinned CIB binds it; every other unresolved reference is refused
 * as `source.reference`, one code for a dangling identifier, an unbound or rebound prefix, a prefix naming an import
 * and a prefixed reference CIB reads as raw text.
 */
import type { ElementRecord } from "../moddle-graph.js";
import { asElement, readNamespaceUriForPrefix } from "../moddle-graph.js";
import type { UnresolvedReference } from "../moddle-adapter.js";
import { ReadRefusal, ReadRefusalCode, optionalId } from "./model.js";

/**
 * The reference properties pinned CIB qualifies with the Definitions' `targetNamespace` through
 * `BpmnParse#resolveName`, with the type each must reach: `messageRef` (`BpmnParse:1264`) and `signalRef`
 * (`BpmnParse:3542`). CIB looks an `errorRef` or `escalationRef` up by its raw text (`BpmnParse:1217`, `:3146`), so a
 * prefixed one never names the declared Error or Escalation there.
 */
const qualified: ReadonlyMap<string, string> = new Map([
  ["bpmn:messageRef", "bpmn:Message"],
  ["bpmn:signalRef", "bpmn:Signal"],
]);

/**
 * Binds `reference` on its element when it is `p:local` with `p` declared on the root Definitions (the only
 * declarations CIB reads, `BpmnParse:388-397`), bound there to the `targetNamespace`, not rebound below, and `local`
 * the identifier of an element of the expected type; refuses it otherwise.
 */
export function bindReference(reference: UnresolvedReference, definitions: ElementRecord, elements: Iterable<ElementRecord>): void {
  const refuse = (reason: string): never => {
    throw new ReadRefusal(ReadRefusalCode.SourceReference, optionalId(reference.element),
      `${reference.property} <${reference.value}>: ${reason}`);
  };
  const separator = reference.value.indexOf(":");
  if (separator < 0) return refuse("no element carries this identifier");
  const prefix = reference.value.slice(0, separator);
  const local = reference.value.slice(separator + 1);
  const declared = asElement(definitions.$attrs)?.[`xmlns:${prefix}`];
  if (typeof declared !== "string") return refuse(`prefix ${prefix} is not declared on the Definitions`);
  if (readNamespaceUriForPrefix(reference.element, definitions, prefix) !== declared) {
    return refuse(`prefix ${prefix} is declared again below the Definitions`);
  }
  if (declared !== definitions.targetNamespace) return refuse(`prefix ${prefix} names another namespace, an import`);
  const type = qualified.get(reference.property);
  if (type === undefined) return refuse("pinned CIB reads this reference as raw text, never as a QName");
  let target: ElementRecord | undefined;
  for (const element of elements) if (element.id === local) target = element;
  if (target === undefined) return refuse("no element carries this identifier");
  if (target.$type !== type) return refuse(`resolves to ${String(target.$type)}, expected ${type}`);
  reference.element[reference.property.slice(reference.property.indexOf(":") + 1)] = target;
}

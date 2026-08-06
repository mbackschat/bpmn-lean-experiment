/**
 * Decides whether an own key on an imported element carries only its declared metamodel default.
 *
 * `bpmn-moddle` resolves a defaulted attribute through the element descriptor when the source omits
 * it, so the property reads as its default without appearing in `Object.keys`. Writing the same
 * default explicitly moves it into the element's own keys while changing nothing a profile can
 * observe. Admission must therefore treat such a key as carrying no information, or a source would
 * be admitted or refused according to whether it spelled out a value that was already in force.
 *
 * Only the exact declared default qualifies. A written non-default value is real information and
 * stays foreign to every reader that does not list it.
 *
 * The rule covers `Boolean` defaults only. BPMN 2.0.2's own machine-readable artifacts disagree on
 * the capitalization of the single enumerated default: `BPMN20.cmof` declares
 * `Gateway-gatewayDirection` as `unspecified` and `Semantic.xsd` declares it as `Unspecified`, which
 * is also the literal the XSD enumeration admits and the value the parser resolves. This manifest is
 * a CMOF extraction, so its recorded string is not the writable XML lexeme, and no artifact here can
 * settle which one "the default" means. Admitting an enumerated default therefore needs that
 * disagreement resolved first rather than a silent choice between two normative files.
 */
import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};

import type { ElementRecord } from "./moddle-graph.js";

export function carriesDeclaredDefault(
  element: ElementRecord,
  key: string,
): boolean {
  const className = elementClassName(element);
  if (className === undefined) {
    return false;
  }
  const declared = metamodelManifest.properties.find(
    (property) =>
      property.name === key &&
      "default" in property &&
      property.type === lexicallySettledType &&
      ownsProperty(className, property.owner),
  );
  return declared !== undefined && element[key] === declared.default;
}

/**
 * The one declared type whose recorded default is also the lexeme a source writes.
 *
 * A `Boolean` default is `true` or `false` in both artifacts and in XML. The manifest's other
 * defaults are a `String` and an enumeration; neither is covered, the enumeration because the two
 * normative files disagree on its spelling and the `String` because no reader decides admission from
 * its own key, so admitting it here would be unexercised by any scenario.
 */
const lexicallySettledType = "Boolean";

/** The manifest's class name for an element, taken from its parser `$type` such as `bpmn:SubProcess`. */
function elementClassName(element: ElementRecord): string | undefined {
  const type = element.$type;
  if (typeof type !== "string") {
    return undefined;
  }
  const separator = type.indexOf(":");
  return separator === -1 ? type : type.slice(separator + 1);
}

/** Whether `owner` is `className` or one of its transitive superclasses. */
function ownsProperty(
  className: string,
  owner: string,
  seen: ReadonlySet<string> = new Set(),
): boolean {
  if (className === owner) {
    return true;
  }
  if (seen.has(className)) {
    return false;
  }
  const declared = metamodelManifest.classes.find(
    (entry) => entry.name === className,
  );
  const visited = new Set([...seen, className]);
  return (declared?.directSuperClasses ?? []).some((parent) =>
    ownsProperty(parent, owner, visited),
  );
}

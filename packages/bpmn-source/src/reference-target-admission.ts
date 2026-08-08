/**
 * Admission rule that every resolved reference points at an element of its declared type.
 *
 * `bpmn-moddle` resolves an IDREF by identity alone. It reports an unresolvable target as a parser
 * warning, which already blocks admission, but it never checks that the element it found is the kind
 * the referring property declares. So `BPMNShape.bpmnElement` pointing at a `BPMNPlane`,
 * `Participant.processRef` pointing at a `UserTask`, and `Lane.flowNodeRef` pointing at a `Process`
 * all parse without complaint and all compiled before this rule existed.
 *
 * That matters most for preserved material, where nothing downstream inspects the reference again:
 * an executed reference is caught indirectly by checked-graph validation, while a wrong-typed
 * Diagram Interchange reference would simply be retained. The rule is applied uniformly over the
 * whole parsed document anyway, because the defect is in the resolution and not in any one locus.
 *
 * Conformance is decided by the parser's own metamodel through `$instanceOf` against the property's
 * declared `type`, rather than by a hand-written type table here. A hand-written table would be a
 * second, weaker copy of the BPMN and DI hierarchies, and the one time this repository assumed a
 * naming convention of those artifacts instead of reading them — that XSD complex types are named
 * `t<ElementName>` — the assumption was wrong for 53 of 184 elements.
 */
import { asElement } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";

/**
 * Whether every reference in `definitions`' containment tree resolves to its declared target type.
 *
 * Total and side-effect free. An element the parser did not produce, a property with no declared
 * type, and a reference whose value is absent are all admitted here: this rule owns target-type
 * conformance alone, and reference *presence* is owned by each projector's own required shape.
 */
export function referencesResolveToDeclaredType(
  definitions: ElementRecord,
): boolean {
  const walk = (value: unknown): boolean => {
    if (Array.isArray(value)) {
      return value.every(walk);
    }
    const element = asElement(value);
    return (
      element === undefined ||
      (referencesConform(element) &&
        Object.entries(element).every(
          ([key, child]) => key === "$type" || walk(child),
        ))
    );
  };
  return walk(definitions);
}

type ReferenceDescriptor = Readonly<{ name: string; type: string }>;

function referencesConform(element: ElementRecord): boolean {
  return referenceDescriptors(element).every(({ name, type }) =>
    targetsConform(element[name], type)
  );
}

function targetsConform(value: unknown, declaredType: string): boolean {
  if (Array.isArray(value)) {
    return value.every((entry) => targetsConform(entry, declaredType));
  }
  const target = asElement(value);
  if (target === undefined) {
    return true;
  }
  const instanceOf = target.$instanceOf;
  return typeof instanceOf === "function" &&
    (instanceOf as (type: string) => unknown).call(target, declaredType) === true;
}

/**
 * The reference-typed properties the parser declares for this element's type.
 *
 * Read from the moddle descriptor rather than from the project's partial CMOF manifest, because that
 * manifest records only the types this compiler projects and deliberately excludes the BPMNDI, DI,
 * and DC metamodels, which is exactly where the preserved references live.
 */
function referenceDescriptors(
  element: ElementRecord,
): ReadonlyArray<ReferenceDescriptor> {
  const descriptor = asElement(element.$descriptor);
  const properties = descriptor?.properties;
  if (!Array.isArray(properties)) {
    return [];
  }
  return properties.flatMap((property) => {
    const record = asElement(property);
    return record?.isReference === true &&
        typeof record.name === "string" &&
        typeof record.type === "string"
      ? [{ name: record.name, type: record.type }]
      : [];
  });
}

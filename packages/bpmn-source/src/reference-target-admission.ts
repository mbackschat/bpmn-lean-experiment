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
import {
  locateContainedElements,
  rejectElement,
} from "./admission-diagnostics.js";
import type {
  ElementLocus,
  ElementRejection,
} from "./admission-diagnostics.js";
import { BpmnSourceDiagnosticCode } from "./contracts.js";
import { asElement } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";

/**
 * Every reference in the located tree pointing outside the type its property declares.
 *
 * Total and side-effect free. An element the parser did not produce, a property with no declared
 * type, and a reference whose value is absent are all admitted here: this rule owns target-type
 * conformance alone, and reference *presence* is owned by each projector's own required shape.
 *
 * No capability is reported, because none would help: a reference to the wrong kind of element is a
 * malformed source rather than one beyond this profile, and widening the profile would not admit it.
 */
export function referenceTargetRejections(
  located: ReadonlyMap<ElementRecord, ElementLocus>,
): ReadonlyArray<ElementRejection> {
  return [...located].flatMap(([element, locus]) =>
    referenceDescriptors(element)
      .filter(({ name, type }) => !targetsConform(element[name], type))
      .map(({ name }) =>
        rejectElement(
          element,
          locus,
          BpmnSourceDiagnosticCode.ReferenceTargetTypeMismatch,
          name,
          null,
        )
      )
  );
}

/**
 * Whether every reference in `definitions`' containment tree resolves to its declared target type.
 *
 * The profile compilers that admit one hand-selected model shape report a single document-level
 * refusal, so they read the answer rather than the list. It is derived from the same collector so
 * the two can never disagree about the same document.
 */
export function referencesResolveToDeclaredType(
  definitions: ElementRecord,
): boolean {
  return referenceTargetRejections(locateContainedElements(definitions))
    .length === 0;
}

type ReferenceDescriptor = Readonly<{ name: string; type: string }>;

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

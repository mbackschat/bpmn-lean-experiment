/**
 * Locating rejected elements in the parsed tree, and reporting them as one ordered list.
 *
 * Admission rules decide *whether* an element is admitted; this module owns *where it is* and *how
 * the refusal is written down*. Keeping the two apart is what lets several independent rules — key
 * classification, foreign attributes, reference targets, flow-element support — contribute to a
 * single deduplicated list without any of them knowing about the others.
 *
 * A locus is the containment path from the document root: the parser's own property names and array
 * indices, never a resolved reference. Containment is the only relation that locates an element
 * uniquely, and it is the same relation the preserved-set classifier walks, so an element a rule can
 * reject is an element this module can locate.
 *
 * Ordering is by that path rather than by document order or by the order the rules ran, so the list
 * is stable under adding a rule and comparable between two compilations of identical bytes. Segments
 * compare positionally, array indices numerically, so `flowElements[2]` precedes `flowElements[10]`.
 */
import { compareCanonicalStrings } from "@bpmn-lean/semantic-core";

import { BpmnSourceDiagnosticCode } from "./contracts.js";
import type {
  BpmnAdmissionCapability,
  BpmnSourceDiagnostic,
  BpmnSourceElement,
} from "./contracts.js";
import { asElement } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";

/** Position of one parsed element, as property names and array indices from the document root. */
export type ElementLocus = Readonly<{
  segments: ReadonlyArray<string | number>;
}>;

/** The parsed `bpmn:Definitions` itself, from which every other locus descends. */
export const definitionsLocus: ElementLocus = { segments: ["definitions"] };

export function containedLocus(
  parent: ElementLocus,
  segment: string | number,
): ElementLocus {
  return { segments: [...parent.segments, segment] };
}

/** One refusal, kept with its locus so independent rules can be merged and ordered afterwards. */
export type ElementRejection = Readonly<{
  locus: ElementLocus;
  diagnostic: BpmnSourceDiagnostic;
}>;

/**
 * Every element reachable from `root` by containment, keyed by identity, in document-tree order.
 *
 * Rules that apply uniformly to the whole document consume this instead of re-walking the tree, so
 * the containment relation is stated once. `Object.keys` yields modelled properties and contained
 * children only: `bpmn-moddle` stores `$attrs`, `$parent`, and every resolved reference as
 * non-enumerable own properties, which is exactly what keeps a Diagram Interchange shape from
 * appearing at its target's path as well as its own.
 */
export function locateContainedElements(
  root: ElementRecord,
): ReadonlyMap<ElementRecord, ElementLocus> {
  const located = new Map<ElementRecord, ElementLocus>();
  const visit = (value: unknown, locus: ElementLocus): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) =>
        visit(entry, containedLocus(locus, index))
      );
      return;
    }
    const element = asElement(value);
    if (element === undefined || located.has(element)) {
      return;
    }
    located.set(element, locus);
    for (const [key, child] of Object.entries(element)) {
      if (key !== "$type") {
        visit(child, containedLocus(locus, key));
      }
    }
  };
  visit(root, definitionsLocus);
  return located;
}

/**
 * The public record identifying one parsed element.
 *
 * Exported for the parser-warning lane, which reports the parser's own message rather than derived
 * prose and therefore builds its diagnostic directly.
 */
export function locatedElement(
  element: ElementRecord | undefined,
  locus: ElementLocus,
  subject: string | null,
  requiredCapability: BpmnAdmissionCapability | null,
): BpmnSourceElement {
  return {
    id: typeof element?.id === "string" && element.id.length > 0
      ? element.id
      : null,
    type: typeof element?.$type === "string" ? element.$type : null,
    containmentPath: renderContainmentPath(locus),
    subject,
    requiredCapability,
  };
}

/**
 * A refusal naming `element`, with its evidence derived from the reason rather than authored.
 *
 * Deriving the prose is what keeps the list byte-stable for identical source bytes: a message
 * assembled at each call site would drift from its code and would make two rules that reject for the
 * same reason look like two different ones to a consumer comparing stored results.
 */
export function rejectElement(
  element: ElementRecord | undefined,
  locus: ElementLocus,
  code: BpmnSourceDiagnosticCode,
  subject: string | null,
  requiredCapability: BpmnAdmissionCapability | null,
): ElementRejection {
  const located = locatedElement(element, locus, subject, requiredCapability);
  return {
    locus,
    diagnostic: { code, element: located, evidence: describe(code, located) },
  };
}

/**
 * The refusals as a public diagnostic list: ordered by containment path, then deduplicated.
 *
 * Two rules can reach the same conclusion about the same element — an unresolvable reference is
 * reported by the parser and by nothing else, but a rule added later could overlap — and an author
 * reading the same complaint twice learns nothing from the repetition.
 */
export function orderedElementDiagnostics(
  rejections: ReadonlyArray<ElementRejection>,
): ReadonlyArray<BpmnSourceDiagnostic> {
  // Duplicates are adjacent after this sort, because the comparator returns zero exactly for the
  // triple that identifies a record and `sort` is stable. Comparing against the predecessor rather
  // than against a set of joined keys keeps the comparison structural: no character is reserved in a
  // BPMN identifier, so a key built by joining fields could collide across them.
  const ordered = [...rejections].sort(compareRejections);
  return ordered.flatMap(({ diagnostic }, index) => {
    const previous = ordered[index - 1]?.diagnostic;
    return previous !== undefined && sameRejection(previous, diagnostic)
      ? []
      : [diagnostic];
  });
}

function compareRejections(
  left: ElementRejection,
  right: ElementRejection,
): number {
  const byLocus = compareLoci(left.locus, right.locus);
  if (byLocus !== 0) {
    return byLocus;
  }
  const byCode = compareCanonicalStrings(
    left.diagnostic.code,
    right.diagnostic.code,
  );
  return byCode !== 0 ? byCode : compareCanonicalStrings(
    left.diagnostic.element?.subject ?? "",
    right.diagnostic.element?.subject ?? "",
  );
}

function sameRejection(
  left: BpmnSourceDiagnostic,
  right: BpmnSourceDiagnostic,
): boolean {
  return left.code === right.code &&
    left.element?.containmentPath === right.element?.containmentPath &&
    left.element?.subject === right.element?.subject;
}

/**
 * Positional comparison of two containment paths.
 *
 * Numeric segments compare numerically so a tenth child follows a third rather than preceding it,
 * and the mixed case is total rather than assumed impossible: array indices and property names
 * alternate by construction today, but a comparison that returned zero for a shape it did not expect
 * would silently make two distinct elements look like duplicates.
 */
function compareLoci(left: ElementLocus, right: ElementLocus): number {
  const shared = Math.min(left.segments.length, right.segments.length);
  for (let index = 0; index < shared; index += 1) {
    const leftSegment = left.segments[index];
    const rightSegment = right.segments[index];
    if (typeof leftSegment === "number" && typeof rightSegment === "number") {
      if (leftSegment !== rightSegment) {
        return leftSegment - rightSegment;
      }
      continue;
    }
    if (typeof leftSegment === "number") {
      return -1;
    }
    if (typeof rightSegment === "number") {
      return 1;
    }
    const byName = compareCanonicalStrings(
      leftSegment ?? "",
      rightSegment ?? "",
    );
    if (byName !== 0) {
      return byName;
    }
  }
  return left.segments.length - right.segments.length;
}

function renderContainmentPath(locus: ElementLocus): string {
  return locus.segments.reduce<string>(
    (path, segment) =>
      typeof segment === "number"
        ? `${path}[${segment}]`
        : path === ""
        ? segment
        : `${path}/${segment}`,
    "",
  );
}

function describe(
  code: BpmnSourceDiagnosticCode,
  element: BpmnSourceElement,
): string {
  const named = `${element.type ?? "An unmodelled value"} at ${element.containmentPath}`;
  switch (code) {
    case BpmnSourceDiagnosticCode.UnsupportedElementType:
      return `${named} is neither executed nor preserved by the selected profile.`;
    case BpmnSourceDiagnosticCode.UnsupportedProperty:
      return `${named} carries property ${element.subject}, which the selected profile neither executes nor preserves.`;
    case BpmnSourceDiagnosticCode.UnconsumedForeignAttribute:
      return `${named} carries extension attribute ${element.subject}, which no projector reads; discarding it would remove intended behavior.`;
    case BpmnSourceDiagnosticCode.ReferenceTargetTypeMismatch:
      return `${named} resolves reference ${element.subject} to an element outside the type that property declares.`;
    // Every other code states a fact about the document or the checked graph rather than about one
    // element, so no call site reaches this constructor with one.
    default:
      return `${named} was refused with reason ${code}.`;
  }
}

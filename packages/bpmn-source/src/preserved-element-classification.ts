/**
 * Classification of parsed material a profile retains without executing it.
 *
 * The compiler partitions a parsed definition three ways: an **executed** set that becomes the
 * checked graph, a **preserved** set retained in the exact source bytes without token-flow meaning,
 * and a **rejected** set. This module owns the preserved/rejected decision. Nothing it classifies as
 * preserved reaches the checked graph, the Semantic Process IL, or any evaluator, so the whole
 * contract here is *which parsed material may be present without being executed*.
 *
 * Preservation is closed and recursive: a container is preserved only when every descendant it
 * contains is preserved. A flat set would be unsound, because a preserved `bpmn:Collaboration`
 * holding an executable element would admit exactly the silent-omission failure preserve-only
 * admission exists to prevent. The default is rejection, so a type absent from a profile's
 * capability rejects rather than being ignored.
 *
 * The walk follows **containment only**. `bpmn-moddle` stores resolved references as non-enumerable
 * own properties, so `Object.keys` yields attributes and contained children while `bpmnElement`,
 * `processRef`, `flowNodeRef`, `sourceRef`, and `targetRef` stay out of the recursion. That is what
 * lets Diagram Interchange point at executed elements: a preserved shape referring to an executed
 * Start Event is a reference, not containment, and preserving the shape does not require preserving
 * its target. Reference *validity* is the parser's and the executed projection's obligation, not
 * this module's.
 *
 * Foreign attributes are the one place the parser's storage hides content from an allowlist:
 * `bpmn-moddle` puts every unrecognized attribute in the non-enumerable `$attrs`, where `Object.keys`
 * cannot see it. They are therefore checked explicitly rather than left to the key walk.
 */
import { SemanticProfileId } from "@bpmn-lean/semantic-core";

import { carriesDeclaredDefault } from "./metamodel-defaults.js";
import { asElement } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";

/**
 * One profile's declared preservation capability.
 *
 * Every field is an enumeration rather than a rule, because the default is rejection and an inferred
 * preserved set is how unexamined content reaches an admitted definition.
 */
export type PreservationCapability = Readonly<{
  /** `$type`s that may appear anywhere inside a preserved subtree, including at its root. */
  preservedTypes: ReadonlySet<string>;
  /** Own keys of `bpmn:Definitions` this profile preserves beyond its executed shape. */
  definitionsKeys: ReadonlySet<string>;
  /** Own keys of the executable `bpmn:Process` this profile preserves beyond its executed shape. */
  processKeys: ReadonlySet<string>;
  /**
   * Own keys any executed element may carry and no projector may see.
   *
   * BPMN declares `documentation` on `BaseElement`, so a modeler puts it on tasks and events as
   * readily as on the Process. Restricting retention to the Process would narrow the account the
   * profile advertises, so these keys are validated as preserved subtrees and then withheld from
   * projection rather than being taught to every projector individually.
   */
  baseElementKeys: ReadonlySet<string>;
}>;

const diagramInterchangeTypes = [
  "bpmndi:BPMNDiagram",
  "bpmndi:BPMNPlane",
  "bpmndi:BPMNShape",
  "bpmndi:BPMNEdge",
  "bpmndi:BPMNLabel",
  "bpmndi:BPMNLabelStyle",
  "dc:Bounds",
  "dc:Point",
  "dc:Font",
] as const;

const collaborationTypes = [
  "bpmn:Collaboration",
  "bpmn:Participant",
  "bpmn:MessageFlow",
] as const;

const laneTypes = ["bpmn:LaneSet", "bpmn:Lane"] as const;

const artifactTypes = [
  "bpmn:Association",
  "bpmn:TextAnnotation",
  "bpmn:Group",
] as const;

/**
 * The preserve-enabled successor to the runnable User Task profile.
 *
 * `name` on `bpmn:Definitions` is preserved for the same reason `documentation` is: BPMN gives it no
 * execution meaning at all. `exporter` and `exporterVersion` follow the already-admitted A12
 * CreateDocument reader, which retains both.
 */
const userTaskPreservedNotation: PreservationCapability = Object.freeze({
  preservedTypes: new Set([
    ...diagramInterchangeTypes,
    ...collaborationTypes,
    ...laneTypes,
    ...artifactTypes,
    "bpmn:Documentation",
  ]),
  definitionsKeys: new Set([
    "diagrams",
    "documentation",
    "exporter",
    "exporterVersion",
    "name",
  ]),
  processKeys: new Set(["artifacts", "documentation", "laneSets"]),
  baseElementKeys: new Set(["documentation"]),
});

/** The capability of one profile, or `undefined` for a profile that executes or rejects everything. */
export function preservationCapability(
  semanticProfile: string,
): PreservationCapability | undefined {
  switch (semanticProfile) {
    case SemanticProfileId.UserTaskPreservedNotation:
      return userTaskPreservedNotation;
    default:
      return undefined;
  }
}

/**
 * Whether `element` and everything it contains may be retained without being executed.
 *
 * Total and side-effect free. A value that is neither an element nor an array of elements is a
 * modelled attribute of an already-preserved type and carries no execution meaning, so it is
 * admitted; the closed `preservedTypes` set is what bounds the decision.
 */
export function isWhollyPreserved(
  element: ElementRecord,
  capability: PreservationCapability,
): boolean {
  if (
    typeof element.$type !== "string" ||
    !capability.preservedTypes.has(element.$type)
  ) {
    return false;
  }
  return Object.entries(element).every(
    ([key, value]) =>
      key === "$type" || isWhollyPreservedValue(value, capability),
  );
}

/**
 * Whether every own key of `element` is executed, or preserved with a wholly preserved value.
 *
 * With no capability this is exactly the executed-only allowlist, so a profile that preserves
 * nothing keeps its admitted set unchanged.
 */
export function hasOnlyExecutedOrPreservedKeys(
  element: ElementRecord,
  executedKeys: ReadonlyArray<string>,
  preservedKeys: ReadonlySet<string>,
  capability: PreservationCapability | undefined,
): boolean {
  const executed = new Set(executedKeys);
  return Object.keys(element).every(
    (key) =>
      executed.has(key) ||
      carriesDeclaredDefault(element, key) ||
      (capability !== undefined &&
        preservedKeys.has(key) &&
        isWhollyPreservedValue(element[key], capability)),
  );
}

/**
 * Whether no element in `definitions`' containment tree carries an unconsumed foreign attribute.
 *
 * This is the executed partition's counterpart to the preserved subtree's own attribute rule, and it
 * closes a hole the exact-key allowlists could not see: because `$attrs` is non-enumerable, a
 * `camunda:assignee` on an admitted User Task passed every allowlist and then vanished, which is the
 * silent omission preserve-only admission exists to prevent. The check is one uniform walk rather
 * than a rule per element type, because the blindness was in the storage and not in any one locus.
 *
 * `consumingTypes` names the `$type`s whose projector reads foreign attributes and refuses any it
 * does not recognize. Those attributes are evidence the compiler acts on, so they are not discarded
 * content; every other foreign attribute anywhere in the document rejects.
 */
export function carriesNoUnconsumedForeignAttribute(
  definitions: ElementRecord,
  consumingTypes: ReadonlySet<string>,
): boolean {
  const schemaInstance = xmlSchemaInstancePrefixes(definitions);
  const admits = (element: ElementRecord): boolean =>
    (typeof element.$type === "string" && consumingTypes.has(element.$type)) ||
    carriesNoForeignAttribute(element, schemaInstance);
  const walk = (value: unknown): boolean => {
    if (Array.isArray(value)) {
      return value.every(walk);
    }
    const element = asElement(value);
    return (
      element === undefined ||
      (admits(element) &&
        Object.entries(element).every(
          ([key, child]) => key === "$type" || walk(child),
        ))
    );
  };
  return walk(definitions);
}

/**
 * `element` as the executed projectors must see it: without the keys this profile only retains.
 *
 * Returns `undefined` when a retained key holds content the profile does not preserve, which rejects
 * exactly as an unrecognized key does. Returns the element itself when it carries no such key, so
 * the ordinary case allocates nothing and every existing profile is byte-for-byte unaffected.
 *
 * The view copies own property *descriptors* rather than spreading. `bpmn-moddle` stores `$attrs`,
 * `$parent`, and every resolved reference as non-enumerable own properties, and a spread would drop
 * all of them — silently removing the foreign attributes the Service Task projector consumes and the
 * `sourceRef` and `targetRef` the Sequence Flow projector resolves.
 */
export function executedProjectionView(
  element: ElementRecord,
  capability: PreservationCapability | undefined,
): ElementRecord | undefined {
  if (capability === undefined) {
    return element;
  }
  const retained = Object.keys(element).filter((key) =>
    capability.baseElementKeys.has(key)
  );
  if (retained.length === 0) {
    return element;
  }
  if (
    !retained.every((key) =>
      isWhollyPreservedValue(element[key], capability)
    )
  ) {
    return undefined;
  }
  const view = Object.create(
    Object.getPrototypeOf(element) as object | null,
    Object.getOwnPropertyDescriptors(element),
  ) as ElementRecord;
  for (const key of retained) {
    delete view[key];
  }
  return view;
}

function isWhollyPreservedValue(
  value: unknown,
  capability: PreservationCapability,
): boolean {
  if (Array.isArray(value)) {
    return value.every((entry) => isWhollyPreservedValue(entry, capability));
  }
  const element = asElement(value);
  return element === undefined || isWhollyPreserved(element, capability);
}

/**
 * XML Schema instance attributes admitted at any locus, for two distinct reasons.
 *
 * `type` is **parser-consumed and therefore meaning-bearing**, not content-free. It selects the
 * resolved `$type`: a `conditionExpression` carrying `xsi:type="bpmn:tFormalExpression"` parses as a
 * `FormalExpression` and one carrying `tExpression` parses as an `Expression`, and the condition
 * projector then accepts or refuses that on its own terms. It is admitted because the meaning it
 * carries has already been applied and is visible in `$type` for every projector to judge — the same
 * ground as the Service Task's consumed `camunda` attributes — not because it says nothing. An
 * unresolvable value is a parser warning and already blocks admission.
 *
 * `schemaLocation` and `noNamespaceSchemaLocation` are genuinely content-free: they tell a
 * validating parser where to find a schema and change no element's content.
 *
 * `nil` is deliberately absent from both sets. It empties an element's content, which is exactly the
 * kind of meaning that must not pass unexamined.
 *
 * Admitting these three is not a convenience: 37% of the 840 files in the pinned MIWG corpus carry
 * `xsi:schemaLocation` and 30% carry `xsi:type`, so refusing them would refuse most conformant BPMN.
 */
const parserConsumedSchemaInstanceAttributes: ReadonlySet<string> = new Set([
  "type",
]);

const contentFreeSchemaLocationHints: ReadonlySet<string> = new Set([
  "schemaLocation",
  "noNamespaceSchemaLocation",
]);

const xmlSchemaInstanceNamespace = "http://www.w3.org/2001/XMLSchema-instance";

/**
 * Whether `element` carries no foreign attribute beyond XML infrastructure.
 *
 * Namespace declarations are admitted at any locus: `xmlns` and `xmlns:*` bind a prefix and are not
 * content. Every other `$attrs` entry is foreign content and rejects, which is the point — an
 * unrecognized `camunda:assignee` on an admitted element is exactly the kind of intended behavior
 * that must not be silently discarded.
 *
 * No profile can yet declare a *vendor* attribute inert. That would take an expanded
 * `namespace#localName` set per profile, and the empty case needs none, so the machinery lands with
 * the first profile that requires it.
 */
function carriesNoForeignAttribute(
  element: ElementRecord,
  schemaInstancePrefixes: ReadonlySet<string>,
): boolean {
  const attributes = asElement(element.$attrs);
  return (
    attributes === undefined ||
    Object.keys(attributes).every((name) => {
      if (name === "xmlns" || name.startsWith("xmlns:")) {
        return true;
      }
      const separator = name.indexOf(":");
      if (separator <= 0 || !schemaInstancePrefixes.has(name.slice(0, separator))) {
        return false;
      }
      const localName = name.slice(separator + 1);
      return (
        parserConsumedSchemaInstanceAttributes.has(localName) ||
        contentFreeSchemaLocationHints.has(localName)
      );
    })
  );
}

/**
 * Prefixes the document root binds to the XML Schema instance namespace.
 *
 * Resolved from `bpmn:Definitions` alone, so a prefix rebound on an inner element is not honored and
 * its attributes reject. That is the safe direction and matches how every observed modeler writes
 * the declaration; admitting by prefix spelling instead would let a document bind `xsi` to a vendor
 * namespace and have its content silently discarded, which is the defect this rule exists to close.
 */
function xmlSchemaInstancePrefixes(
  definitions: ElementRecord,
): ReadonlySet<string> {
  const declarations = asElement(definitions.$attrs);
  if (declarations === undefined) {
    return new Set();
  }
  return new Set(
    Object.entries(declarations)
      .filter(
        ([name, value]) =>
          name.startsWith("xmlns:") && value === xmlSchemaInstanceNamespace,
      )
      .map(([name]) => name.slice("xmlns:".length)),
  );
}

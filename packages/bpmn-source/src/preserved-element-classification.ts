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

import {
  containedLocus,
  locateContainedElements,
  rejectElement,
} from "./admission-diagnostics.js";
import type {
  ElementLocus,
  ElementRejection,
} from "./admission-diagnostics.js";
import {
  BpmnAdmissionCapability,
  BpmnSourceDiagnosticCode,
} from "./contracts.js";
import { carriesDeclaredDefault } from "./metamodel-defaults.js";
import { asElement } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};

const bpmnTypes = metamodelManifest.compilerProjection;

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
 * The `$type`s whose projector reads foreign attributes, per profile.
 *
 * A projector that requires an exact attribute set and refuses any other treats those attributes as
 * evidence it acts on rather than content it discards, which is what exempts the type. Everything not
 * named here rejects, so this set is the complete inventory of where a foreign attribute may sit.
 *
 * It is keyed by profile because the answer genuinely differs per profile, unlike the reference-target
 * rule that [the compiler entry point](./compile.ts) therefore owns above the reader dispatch. Each
 * caller must ask for its own profile's set: reading a shared constant is what left two readers
 * applying no rule at all while three documents claimed otherwise.
 *
 * The two A12 profiles exempt whole `Definitions` and `Process` types rather than the exact vendor
 * attributes their registered sources carry — `modeler:executionPlatform`, its version sibling, and
 * `camunda:versionTag`, none of which any projector reads. Narrowing that to exact attributes needs
 * expanded `namespace#localName` matching resolved against the document's prefix bindings, which
 * [D2](../../../docs/PRESERVE-ONLY-ADMISSION-PROPOSAL.md) defers to the first profile that declares an
 * inert set; matching the raw prefix instead would admit content by spelling.
 * [IMPLEMENTATION-MAP.md](../../../docs/IMPLEMENTATION-MAP.md) records the residual as absent.
 */
export function foreignAttributeConsumingTypes(
  semanticProfile: string,
): ReadonlySet<string> {
  switch (semanticProfile) {
    case SemanticProfileId.CreateDocument:
      return new Set([
        bpmnTypes.definitionsType,
        bpmnTypes.processType,
        bpmnTypes.serviceTaskType,
      ]);
    case SemanticProfileId.BoundaryError:
      return new Set([bpmnTypes.serviceTaskType]);
    case SemanticProfileId.CalledProcessCallActivity:
      return new Set();
    default:
      return new Set([bpmnTypes.serviceTaskType]);
  }
}

/**
 * Every element in `element`'s subtree that no capability preserves; empty means wholly preserved.
 *
 * A value that is neither an element nor an array of elements is a modelled attribute of an
 * already-preserved type and carries no execution meaning, so it is admitted; the closed
 * `preservedTypes` set is what bounds the decision.
 *
 * An unpreservable element stops the descent and is reported alone. Its descendants are refused
 * along with it, but naming them would bury the one construct its author has to remove under the
 * subtree that construct happens to contain.
 */
export function preservedSubtreeRejections(
  element: ElementRecord,
  locus: ElementLocus,
  capability: PreservationCapability,
): ReadonlyArray<ElementRejection> {
  if (
    typeof element.$type !== "string" ||
    !capability.preservedTypes.has(element.$type)
  ) {
    return [
      rejectElement(
        element,
        locus,
        BpmnSourceDiagnosticCode.UnsupportedElementType,
        null,
        BpmnAdmissionCapability.PreserveElementType,
      ),
    ];
  }
  return Object.entries(element).flatMap(([key, value]) =>
    key === "$type"
      ? []
      : preservedValueRejections(value, containedLocus(locus, key), capability)
  );
}

/**
 * Every own key of `element` that is neither executed nor preserved, and every leak beneath one.
 *
 * With no capability this is exactly the executed-only allowlist, so a profile that preserves
 * nothing keeps its admitted set unchanged.
 *
 * A key the profile does preserve is reported at the *contained* element that fails rather than at
 * the key, because a modeler who wrote a supported container holding one unsupported child needs to
 * be told about the child.
 */
export function unadmittedKeyRejections(
  element: ElementRecord,
  locus: ElementLocus,
  executedKeys: ReadonlyArray<string>,
  preservedKeys: ReadonlySet<string>,
  capability: PreservationCapability | undefined,
): ReadonlyArray<ElementRejection> {
  const executed = new Set(executedKeys);
  return Object.keys(element).flatMap((key) => {
    if (executed.has(key) || carriesDeclaredDefault(element, key)) {
      return [];
    }
    if (capability === undefined || !preservedKeys.has(key)) {
      return [
        rejectElement(
          element,
          locus,
          BpmnSourceDiagnosticCode.UnsupportedProperty,
          key,
          BpmnAdmissionCapability.PreserveProperty,
        ),
      ];
    }
    return preservedValueRejections(
      element[key],
      containedLocus(locus, key),
      capability,
    );
  });
}

/**
 * Every element in the document carrying a foreign attribute no projector consumes.
 *
 * This is the executed partition's counterpart to the preserved subtree's own attribute rule, and it
 * closes a hole the exact-key allowlists could not see: because `$attrs` is non-enumerable, a
 * `camunda:assignee` on an admitted User Task passed every allowlist and then vanished, which is the
 * silent omission preserve-only admission exists to prevent. The rule is stated once over the
 * located containment tree rather than as a rule per element type, because the blindness was in the
 * storage and not in any one locus.
 *
 * `consumingTypes` names the `$type`s whose projector reads foreign attributes and refuses any it
 * does not recognize. Those attributes are evidence the compiler acts on, so they are not discarded
 * content; every other foreign attribute anywhere in the document rejects.
 */
export function foreignAttributeRejections(
  definitions: ElementRecord,
  located: ReadonlyMap<ElementRecord, ElementLocus>,
  consumingTypes: ReadonlySet<string>,
): ReadonlyArray<ElementRejection> {
  const schemaInstance = xmlSchemaInstancePrefixes(definitions);
  return [...located].flatMap(([element, locus]) =>
    typeof element.$type === "string" && consumingTypes.has(element.$type)
      ? []
      : unconsumedForeignAttributeNames(element, schemaInstance).map((name) =>
        rejectElement(
          element,
          locus,
          BpmnSourceDiagnosticCode.UnconsumedForeignAttribute,
          name,
          BpmnAdmissionCapability.ConsumeForeignAttribute,
        )
      )
  );
}

/**
 * Whether no element in `definitions` carries a foreign attribute no projector consumes.
 *
 * The profile compilers that admit one hand-selected model shape report a single document-level
 * refusal, so they read the answer rather than the list. It is derived from the same collector so
 * the two can never disagree about the same document.
 */
export function carriesNoUnconsumedForeignAttribute(
  definitions: ElementRecord,
  consumingTypes: ReadonlySet<string>,
): boolean {
  return foreignAttributeRejections(
    definitions,
    locateContainedElements(definitions),
    consumingTypes,
  ).length === 0;
}

/**
 * Every element whose retained `BaseElement` key holds content the profile does not preserve.
 *
 * BPMN declares `documentation` on `BaseElement`, so a modeler may write it on any element, and it
 * is withheld from projection rather than taught to every projector. Its *content* still has to be
 * classified, and this is the only rule that classifies it: the two allowlist loci see the key only
 * on `bpmn:Definitions` and the executable `bpmn:Process`.
 *
 * It is stated here, over the located tree, rather than inside the projection view, because a
 * refusal has to name where it happened and the projectors hold no locus.
 */
export function baseElementRetentionRejections(
  located: ReadonlyMap<ElementRecord, ElementLocus>,
  capability: PreservationCapability | undefined,
): ReadonlyArray<ElementRejection> {
  if (capability === undefined) {
    return [];
  }
  return [...located].flatMap(([element, locus]) =>
    retainedBaseElementKeys(element, capability).flatMap((key) =>
      preservedValueRejections(
        element[key],
        containedLocus(locus, key),
        capability,
      )
    )
  );
}

/**
 * `element` as the executed projectors must see it: without the keys this profile only retains.
 *
 * A pure projection. Whether the retained content is preservable at all is an admission question,
 * decided by `baseElementRetentionRejections` before any projector runs; deciding it again here
 * would be a second answer to one question. Returns the element itself when it carries no retained
 * key, so the ordinary case allocates nothing and every existing profile is byte-for-byte
 * unaffected.
 *
 * The view copies own property *descriptors* rather than spreading. `bpmn-moddle` stores `$attrs`,
 * `$parent`, and every resolved reference as non-enumerable own properties, and a spread would drop
 * all of them — silently removing the foreign attributes the Service Task projector consumes and the
 * `sourceRef` and `targetRef` the Sequence Flow projector resolves.
 */
export function executedProjectionView(
  element: ElementRecord,
  capability: PreservationCapability | undefined,
): ElementRecord {
  if (capability === undefined) {
    return element;
  }
  const retained = retainedBaseElementKeys(element, capability);
  if (retained.length === 0) {
    return element;
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

function retainedBaseElementKeys(
  element: ElementRecord,
  capability: PreservationCapability,
): ReadonlyArray<string> {
  return Object.keys(element).filter((key) =>
    capability.baseElementKeys.has(key)
  );
}

function preservedValueRejections(
  value: unknown,
  locus: ElementLocus,
  capability: PreservationCapability,
): ReadonlyArray<ElementRejection> {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      preservedValueRejections(entry, containedLocus(locus, index), capability)
    );
  }
  const element = asElement(value);
  return element === undefined
    ? []
    : preservedSubtreeRejections(element, locus, capability);
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
 * The `$attrs` entries of `element` that are foreign content rather than XML infrastructure.
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
function unconsumedForeignAttributeNames(
  element: ElementRecord,
  schemaInstancePrefixes: ReadonlySet<string>,
): ReadonlyArray<string> {
  const attributes = asElement(element.$attrs);
  if (attributes === undefined) {
    return [];
  }
  return Object.keys(attributes).filter((name) => {
    if (name === "xmlns" || name.startsWith("xmlns:")) {
      return false;
    }
    const separator = name.indexOf(":");
    if (
      separator <= 0 ||
      !schemaInstancePrefixes.has(name.slice(0, separator))
    ) {
      return true;
    }
    const localName = name.slice(separator + 1);
    return (
      !parserConsumedSchemaInstanceAttributes.has(localName) &&
      !contentFreeSchemaLocationHints.has(localName)
    );
  });
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

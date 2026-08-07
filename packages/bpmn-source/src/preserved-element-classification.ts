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
    !capability.preservedTypes.has(element.$type) ||
    !carriesNoForeignAttribute(element)
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
 * Whether `element` carries no foreign attribute at all.
 *
 * Namespace declarations are admitted at any locus: `xmlns` and `xmlns:*` bind a prefix and are not
 * content. Every other `$attrs` entry is foreign content and rejects, which is the point — an
 * unrecognized `camunda:assignee` on an admitted element is exactly the kind of intended behavior
 * that must not be silently discarded.
 *
 * No profile can yet declare a foreign attribute inert. That would take an expanded
 * `namespace#localName` set and the `bpmn:Definitions` prefix bindings to resolve one against, since
 * a raw prefix is bindable to any namespace and matching on it would admit content by spelling. The
 * empty case needs neither, so the machinery lands with the first profile that requires it.
 */
function carriesNoForeignAttribute(element: ElementRecord): boolean {
  const attributes = asElement(element.$attrs);
  return (
    attributes === undefined ||
    Object.keys(attributes).every(
      (name) => name === "xmlns" || name.startsWith("xmlns:"),
    )
  );
}

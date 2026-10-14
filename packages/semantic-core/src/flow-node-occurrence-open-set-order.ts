import type { OccurrenceId } from "./contract.js";
import type { ScopeOccurrenceId } from "./semantic-process-state.js";
import type {
  SemanticFlowNodeOccurrenceAnchor,
  UnnumberedFlowNodeOccurrenceStart,
} from "./flow-node-occurrence-lifecycle.js";
import { compareCanonicalStrings } from "./wire.js";

/**
 * Canonical order and identity shape of open flow-node occurrence entries.
 *
 * Split from the open-set projection so that association checks against the Program and the total order that
 * publishes their result have separate owners; an entry with a malformed anchor or a duplicate anchor key makes the
 * whole projection fail rather than being dropped.
 */

export function canonicalOpenSet(
  entries: ReadonlyArray<UnnumberedFlowNodeOccurrenceStart>,
): UnnumberedFlowNodeOccurrenceStart[] | null {
  const sorted = [...entries].sort(compareStarts);
  return sorted.every(validStart) && sorted.every((entry, index) =>
    index === 0 || anchorKey(sorted[index - 1]!.anchor) !== anchorKey(entry.anchor)
  )
    ? sorted
    : null;
}

function validStart(start: UnnumberedFlowNodeOccurrenceStart): boolean {
  return start.processId.length > 0 &&
    start.elementId.length > 0 &&
    validScopeId(start.owner) &&
    validAnchor(start.anchor);
}

function validAnchor(anchor: SemanticFlowNodeOccurrenceAnchor): boolean {
  switch (anchor.kind) {
    case "wait":
    case "callActivity":
    case "compensationTrigger":
    case "compensationHandler":
      return validOccurrence(anchor.id);
    case "scope":
      return validScopeId(anchor.id);
    case "transition":
      return false;
    default:
      return false;
  }
}

export function validOccurrence(id: OccurrenceId): boolean {
  return id.processInstanceId.length > 0 &&
    id.elementId.length > 0 &&
    Number.isSafeInteger(id.activation) &&
    id.activation > 0;
}

export function validScopeId(id: ScopeOccurrenceId): boolean {
  return id.processInstanceId.length > 0 &&
    id.definitionScopeId.length > 0 &&
    Number.isSafeInteger(id.activation) &&
    id.activation > 0;
}

function compareStarts(
  left: UnnumberedFlowNodeOccurrenceStart,
  right: UnnumberedFlowNodeOccurrenceStart,
): number {
  return compareAnchors(left.anchor, right.anchor) ||
    compareCanonicalStrings(left.processId, right.processId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    compareScopeIds(left.owner, right.owner);
}

function compareAnchors(
  left: SemanticFlowNodeOccurrenceAnchor,
  right: SemanticFlowNodeOccurrenceAnchor,
): number {
  const kindOrder = anchorKindOrder(left.kind) - anchorKindOrder(right.kind);
  if (kindOrder !== 0) return kindOrder;
  switch (left.kind) {
    case "wait":
    case "callActivity":
    case "compensationTrigger":
    case "compensationHandler":
      return right.kind === left.kind ? compareOccurrenceIds(left.id, right.id) : 0;
    case "scope":
      return right.kind === left.kind ? compareScopeIds(left.id, right.id) : 0;
    case "transition":
      return right.kind === left.kind
        ? compareCanonicalStrings(left.commandId, right.commandId) ||
          left.transitionIndex - right.transitionIndex ||
          left.localIndex - right.localIndex
        : 0;
    default:
      return 0;
  }
}

function anchorKindOrder(kind: SemanticFlowNodeOccurrenceAnchor["kind"]): number {
  switch (kind) {
    case "wait": return 0;
    case "scope": return 1;
    case "callActivity": return 2;
    case "compensationTrigger": return 3;
    case "compensationHandler": return 4;
    case "transition": return 5;
    default: return 6;
  }
}

function compareOccurrenceIds(left: OccurrenceId, right: OccurrenceId): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    left.activation - right.activation;
}

function compareScopeIds(left: ScopeOccurrenceId, right: ScopeOccurrenceId): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.definitionScopeId, right.definitionScopeId) ||
    left.activation - right.activation;
}

function anchorKey(anchor: SemanticFlowNodeOccurrenceAnchor): string {
  switch (anchor.kind) {
    case "wait":
      return JSON.stringify([0, anchor.id.processInstanceId, anchor.id.elementId, anchor.id.activation]);
    case "scope":
      return JSON.stringify([1, anchor.id.processInstanceId, anchor.id.definitionScopeId, anchor.id.activation]);
    case "callActivity":
      return JSON.stringify([2, anchor.id.processInstanceId, anchor.id.elementId, anchor.id.activation]);
    case "compensationTrigger":
      return JSON.stringify([3, anchor.id.processInstanceId, anchor.id.elementId, anchor.id.activation]);
    case "compensationHandler":
      return JSON.stringify([4, anchor.id.processInstanceId, anchor.id.elementId, anchor.id.activation]);
    case "transition":
      return JSON.stringify([5, anchor.commandId, anchor.transitionIndex, anchor.localIndex]);
    default:
      return "";
  }
}

import type { OccurrenceId } from "./contract.js";
import {
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
} from "./flow-node-occurrence-lifecycle.js";
import type {
  UnnumberedFlowNodeOccurrenceDelta,
  UnnumberedFlowNodeOccurrenceEnd,
  UnnumberedFlowNodeOccurrenceStart,
} from "./flow-node-occurrence-lifecycle.js";
import {
  canonicalUniqueInternalAlternatives,
  compareInternalAlternatives,
} from "./internal-transition-alternative.js";
import type { InternalAlternative } from "./internal-transition-alternative.js";
import type {
  SemanticTransitionKind,
  UnnumberedCommittedTransition,
  UnnumberedCommittedTransitionRecord,
} from "./semantic-transition-trace.js";
import {
  compareScopeOccurrenceIds,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type { ScopeOccurrenceId } from "./semantic-process-state.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";

export enum InternalPublicationTemplateAnchorKind {
  Wait = "wait",
  Scope = "scope",
  CallActivity = "callActivity",
  TransitionTemplate = "transitionTemplate",
}

export type InternalPublicationTemplateAnchor = Readonly<
  | {
      kind: InternalPublicationTemplateAnchorKind.Wait;
      id: OccurrenceId;
    }
  | {
      kind: InternalPublicationTemplateAnchorKind.Scope;
      id: ScopeOccurrenceId;
    }
  | {
      kind: InternalPublicationTemplateAnchorKind.CallActivity;
      id: OccurrenceId;
    }
  | {
      kind: InternalPublicationTemplateAnchorKind.TransitionTemplate;
      processId: string;
      elementId: string;
      owner: ScopeOccurrenceId;
    }
>;

export type InternalPublicationLifecycleStartTemplate = Readonly<{
  anchor: InternalPublicationTemplateAnchor;
  processId: string;
  elementId: string;
  owner: ScopeOccurrenceId;
}>;

export type InternalPublicationLifecycleEndTemplate = Readonly<{
  anchor: InternalPublicationTemplateAnchor;
  terminal: FlowNodeOccurrenceTerminalKind;
}>;

type TransitionTemplateAnchor = Extract<
  InternalPublicationTemplateAnchor,
  { kind: InternalPublicationTemplateAnchorKind.TransitionTemplate }
>;

type TransitionStartTemplate = InternalPublicationLifecycleStartTemplate &
  Readonly<{ anchor: TransitionTemplateAnchor }>;

type TransitionEndTemplate = InternalPublicationLifecycleEndTemplate &
  Readonly<{ anchor: TransitionTemplateAnchor }>;

export type InternalCommittedTransitionTemplate = Readonly<
  Omit<UnnumberedCommittedTransitionRecord, "transition"> & {
    transition: Extract<
      UnnumberedCommittedTransition,
      { kind: SemanticTransitionKind.InternalOperation }
    >;
  }
>;

export type InternalPublicationTemplate = Readonly<{
  alternative: InternalAlternative;
  record: InternalCommittedTransitionTemplate;
  lifecycle: Readonly<{
    started: ReadonlyArray<InternalPublicationLifecycleStartTemplate>;
    ended: ReadonlyArray<InternalPublicationLifecycleEndTemplate>;
  }>;
}>;

export type InstantiatedInternalPublication = Readonly<{
  alternative: InternalAlternative;
  transitionIndex: number;
  record: InternalCommittedTransitionTemplate;
  lifecycle: UnnumberedFlowNodeOccurrenceDelta;
}>;

/** Sorts complete prepared templates before injecting command, transition, and local indices. */
export function instantiateInternalPublicationBatch(
  commandId: string,
  firstTransitionIndex: number,
  templates: ReadonlyArray<InternalPublicationTemplate>,
): ReadonlyArray<InstantiatedInternalPublication> | null {
  const lastTransitionIndex = templates.length === 0
    ? firstTransitionIndex
    : firstTransitionIndex + templates.length - 1;
  if (
    commandId.length === 0 ||
    !isWellFormedWireString(commandId) ||
    !Number.isSafeInteger(firstTransitionIndex) ||
    firstTransitionIndex < 0 ||
    !Number.isSafeInteger(lastTransitionIndex)
  ) {
    return null;
  }
  const alternatives = canonicalUniqueInternalAlternatives(
    templates.map(({ alternative }) => alternative),
  );
  if (alternatives === null) {
    return null;
  }
  const sorted = [...templates].sort((left, right) =>
    compareInternalAlternatives(left.alternative, right.alternative)
  );
  const result: InstantiatedInternalPublication[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const template = sorted[index];
    const transitionIndex = firstTransitionIndex + index;
    if (
      template === undefined ||
      !Number.isSafeInteger(transitionIndex) ||
      template.record.transition.operationId !== template.alternative.operationId ||
      !Number.isSafeInteger(template.record.logicalTimeMs) ||
      template.record.logicalTimeMs < 0
    ) {
      return null;
    }
    const lifecycle = instantiateLifecycle(
      commandId,
      transitionIndex,
      template.lifecycle,
    );
    if (lifecycle === null) {
      return null;
    }
    result.push({
      alternative: template.alternative,
      transitionIndex,
      record: template.record,
      lifecycle,
    });
  }
  return result;
}

function instantiateLifecycle(
  commandId: string,
  transitionIndex: number,
  template: InternalPublicationTemplate["lifecycle"],
): UnnumberedFlowNodeOccurrenceDelta | null {
  const transitionStarts = template.started.filter(isTransitionStart).sort(
    compareTemplateStarts,
  );
  const transitionEnds = template.ended.filter(isTransitionEnd).sort(
    compareTemplateEnds,
  );
  if (
    transitionStarts.length !== transitionEnds.length ||
    transitionStarts.some((start, index) => {
      const ended = transitionEnds[index];
      return ended === undefined ||
        compareTemplateAnchors(start.anchor, ended.anchor) !== 0 ||
        ended.terminal !== FlowNodeOccurrenceTerminalKind.Completed ||
        !transitionStartMatchesAnchor(start);
    })
  ) {
    return null;
  }

  const localIndexByAnchor = new Map<string, number[]>();
  const started: UnnumberedFlowNodeOccurrenceStart[] = [];
  for (const entry of template.started.filter((candidate) =>
    !isTransitionStart(candidate)
  )) {
    const anchor = instantiateDurableAnchor(entry.anchor);
    if (anchor === null) {
      return null;
    }
    started.push({ ...entry, anchor });
  }
  transitionStarts.forEach((entry, localIndex) => {
    const key = templateAnchorKey(entry.anchor);
    const indices = localIndexByAnchor.get(key) ?? [];
    indices.push(localIndex);
    localIndexByAnchor.set(key, indices);
    started.push({
      processId: entry.processId,
      elementId: entry.elementId,
      owner: entry.owner,
      anchor: transitionAnchor(commandId, transitionIndex, localIndex),
    });
  });

  const ended: UnnumberedFlowNodeOccurrenceEnd[] = [];
  const consumedByAnchor = new Map<string, number>();
  for (const entry of template.ended) {
    if (!isTransitionEnd(entry)) {
      const anchor = instantiateDurableAnchor(entry.anchor);
      if (anchor === null) {
        return null;
      }
      ended.push({ anchor, terminal: entry.terminal });
      continue;
    }
    const key = templateAnchorKey(entry.anchor);
    const consumed = consumedByAnchor.get(key) ?? 0;
    const localIndex = localIndexByAnchor.get(key)?.[consumed];
    if (localIndex === undefined) {
      return null;
    }
    consumedByAnchor.set(key, consumed + 1);
    ended.push({
      anchor: transitionAnchor(commandId, transitionIndex, localIndex),
      terminal: entry.terminal,
    });
  }

  started.sort(compareInstantiatedStarts);
  ended.sort(compareInstantiatedEnds);
  return hasUniqueAnchors(started.map(({ anchor }) => anchor)) &&
      hasUniqueAnchors(ended.map(({ anchor }) => anchor))
    ? { started, ended }
    : null;
}

function isTransitionStart(
  entry: InternalPublicationLifecycleStartTemplate,
): entry is TransitionStartTemplate {
  return entry.anchor.kind ===
    InternalPublicationTemplateAnchorKind.TransitionTemplate;
}

function isTransitionEnd(
  entry: InternalPublicationLifecycleEndTemplate,
): entry is TransitionEndTemplate {
  return entry.anchor.kind ===
    InternalPublicationTemplateAnchorKind.TransitionTemplate;
}

function transitionStartMatchesAnchor(
  start: TransitionStartTemplate,
): boolean {
  return start.processId === start.anchor.processId &&
    start.elementId === start.anchor.elementId &&
    sameScopeOccurrence(start.owner, start.anchor.owner);
}

function instantiateDurableAnchor(
  anchor: InternalPublicationTemplateAnchor,
): Exclude<
  UnnumberedFlowNodeOccurrenceStart["anchor"],
  { kind: SemanticFlowNodeOccurrenceAnchorKind.Transition }
> | null {
  switch (anchor.kind) {
    case InternalPublicationTemplateAnchorKind.Wait:
      return { kind: SemanticFlowNodeOccurrenceAnchorKind.Wait, id: anchor.id };
    case InternalPublicationTemplateAnchorKind.Scope:
      return { kind: SemanticFlowNodeOccurrenceAnchorKind.Scope, id: anchor.id };
    case InternalPublicationTemplateAnchorKind.CallActivity:
      return {
        kind: SemanticFlowNodeOccurrenceAnchorKind.CallActivity,
        id: anchor.id,
      };
    case InternalPublicationTemplateAnchorKind.TransitionTemplate:
      return null;
    default:
      return assertNever(anchor);
  }
}

function transitionAnchor(
  commandId: string,
  transitionIndex: number,
  localIndex: number,
) {
  return {
    kind: SemanticFlowNodeOccurrenceAnchorKind.Transition,
    commandId,
    transitionIndex,
    localIndex,
  } as const;
}

function compareTemplateStarts(
  left: InternalPublicationLifecycleStartTemplate,
  right: InternalPublicationLifecycleStartTemplate,
): number {
  return compareTemplateAnchors(left.anchor, right.anchor) ||
    compareCanonicalStrings(left.processId, right.processId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    compareScopeOccurrenceIds(left.owner, right.owner);
}

function compareTemplateEnds(
  left: InternalPublicationLifecycleEndTemplate,
  right: InternalPublicationLifecycleEndTemplate,
): number {
  return compareTemplateAnchors(left.anchor, right.anchor) ||
    terminalRank(left.terminal) - terminalRank(right.terminal);
}

function compareTemplateAnchors(
  left: InternalPublicationTemplateAnchor,
  right: InternalPublicationTemplateAnchor,
): number {
  const kindOrder = templateAnchorRank(left.kind) - templateAnchorRank(right.kind);
  if (kindOrder !== 0) {
    return kindOrder;
  }
  switch (left.kind) {
    case InternalPublicationTemplateAnchorKind.Wait:
    case InternalPublicationTemplateAnchorKind.CallActivity:
      return right.kind === left.kind ? compareOccurrences(left.id, right.id) : 0;
    case InternalPublicationTemplateAnchorKind.Scope:
      return right.kind === left.kind
        ? compareScopeOccurrenceIds(left.id, right.id)
        : 0;
    case InternalPublicationTemplateAnchorKind.TransitionTemplate:
      return right.kind === left.kind
        ? compareCanonicalStrings(left.processId, right.processId) ||
          compareCanonicalStrings(left.elementId, right.elementId) ||
          compareScopeOccurrenceIds(left.owner, right.owner)
        : 0;
    default:
      return assertNever(left);
  }
}

function compareInstantiatedStarts(
  left: UnnumberedFlowNodeOccurrenceStart,
  right: UnnumberedFlowNodeOccurrenceStart,
): number {
  return compareInstantiatedAnchors(left.anchor, right.anchor) ||
    compareCanonicalStrings(left.processId, right.processId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    compareScopeOccurrenceIds(left.owner, right.owner);
}

function compareInstantiatedEnds(
  left: UnnumberedFlowNodeOccurrenceEnd,
  right: UnnumberedFlowNodeOccurrenceEnd,
): number {
  return compareInstantiatedAnchors(left.anchor, right.anchor) ||
    terminalRank(left.terminal) - terminalRank(right.terminal);
}

function compareInstantiatedAnchors(
  left: UnnumberedFlowNodeOccurrenceStart["anchor"],
  right: UnnumberedFlowNodeOccurrenceStart["anchor"],
): number {
  const kindOrder = instantiatedAnchorRank(left.kind) -
    instantiatedAnchorRank(right.kind);
  if (kindOrder !== 0) {
    return kindOrder;
  }
  switch (left.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
      return right.kind === left.kind ? compareOccurrences(left.id, right.id) : 0;
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
      return right.kind === left.kind
        ? compareScopeOccurrenceIds(left.id, right.id)
        : 0;
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return right.kind === left.kind
        ? compareCanonicalStrings(left.commandId, right.commandId) ||
          left.transitionIndex - right.transitionIndex ||
          left.localIndex - right.localIndex
        : 0;
    default:
      return assertNever(left);
  }
}

function templateAnchorKey(anchor: InternalPublicationTemplateAnchor): string {
  switch (anchor.kind) {
    case InternalPublicationTemplateAnchorKind.Wait:
      return JSON.stringify([0, ...occurrenceParts(anchor.id)]);
    case InternalPublicationTemplateAnchorKind.Scope:
      return JSON.stringify([1, ...scopeParts(anchor.id)]);
    case InternalPublicationTemplateAnchorKind.CallActivity:
      return JSON.stringify([2, ...occurrenceParts(anchor.id)]);
    case InternalPublicationTemplateAnchorKind.TransitionTemplate:
      return JSON.stringify([
        3,
        anchor.processId,
        anchor.elementId,
        ...scopeParts(anchor.owner),
      ]);
    default:
      return assertNever(anchor);
  }
}

function instantiatedAnchorKey(
  anchor: UnnumberedFlowNodeOccurrenceStart["anchor"],
): string {
  switch (anchor.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
      return JSON.stringify([0, ...occurrenceParts(anchor.id)]);
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
      return JSON.stringify([1, ...scopeParts(anchor.id)]);
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
      return JSON.stringify([2, ...occurrenceParts(anchor.id)]);
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return JSON.stringify([
        3,
        anchor.commandId,
        anchor.transitionIndex,
        anchor.localIndex,
      ]);
    default:
      return assertNever(anchor);
  }
}

function hasUniqueAnchors(
  anchors: ReadonlyArray<UnnumberedFlowNodeOccurrenceStart["anchor"]>,
): boolean {
  const keys = anchors.map(instantiatedAnchorKey);
  return new Set(keys).size === keys.length;
}

function compareOccurrences(left: OccurrenceId, right: OccurrenceId): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    left.activation - right.activation;
}

function occurrenceParts(id: OccurrenceId): ReadonlyArray<string | number> {
  return [id.processInstanceId, id.elementId, id.activation];
}

function scopeParts(id: ScopeOccurrenceId): ReadonlyArray<string | number> {
  return [id.processInstanceId, id.definitionScopeId, id.activation];
}

function templateAnchorRank(kind: InternalPublicationTemplateAnchorKind): number {
  switch (kind) {
    case InternalPublicationTemplateAnchorKind.Wait:
      return 0;
    case InternalPublicationTemplateAnchorKind.Scope:
      return 1;
    case InternalPublicationTemplateAnchorKind.CallActivity:
      return 2;
    case InternalPublicationTemplateAnchorKind.TransitionTemplate:
      return 3;
    default:
      return assertNever(kind);
  }
}

function instantiatedAnchorRank(kind: SemanticFlowNodeOccurrenceAnchorKind): number {
  switch (kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
      return 0;
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
      return 1;
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
      return 2;
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return 3;
    default:
      return assertNever(kind);
  }
}

function terminalRank(kind: FlowNodeOccurrenceTerminalKind): number {
  switch (kind) {
    case FlowNodeOccurrenceTerminalKind.Completed:
      return 0;
    case FlowNodeOccurrenceTerminalKind.Cancelled:
      return 1;
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled publication template value: ${JSON.stringify(value)}`);
}

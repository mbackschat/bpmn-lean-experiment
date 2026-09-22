import {
  candidateProcessId,
  operationIsSelectedFromProgram,
} from "./flow-node-occurrence-candidates.js";
import type { InternalMergeInputAlternative } from "./internal-transition-alternative.js";
import { InternalAlternativeKind } from "./internal-transition-alternative.js";
import { FlowNodeOccurrenceTerminalKind } from "./flow-node-occurrence-lifecycle.js";
import { InternalPublicationTemplateAnchorKind } from "./internal-publication-template.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import {
  applyInternalLocalControlPatch,
  deriveInternalLocalControlPositionDelta,
  InternalSelectedBranchPatchKind,
} from "./internal-transition-local-control-patch.js";
import type { InternalLocalControlPatch } from "./internal-transition-local-control-patch.js";
import { canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import type { InternalTransitionStateFootprint } from "./internal-transition-footprint.js";
import { tokenOwnerCensusAtoms } from "./internal-transition-token-preparation.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import type {
  MergeExclusiveOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  exclusiveMergeInputIsApplicable,
  exclusiveMergeInputSelections,
} from "./semantic-process-cyclic-control-flow-runtime.js";
import { ControlStateKind, ownedTokenMultiplicity } from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import { SemanticTransitionKind } from "./semantic-transition-trace.js";

export type PreparedInternalExclusiveMergeInput = Readonly<{
  alternative: InternalMergeInputAlternative;
  operation: MergeExclusiveOperation;
  owner: ScopeOccurrenceId;
  footprint: InternalTransitionStateFootprint;
  patch: InternalLocalControlPatch;
  publicationTemplate: InternalPublicationTemplate;
}>;

/**
 * Derives every exact offered merge-input preparation from the pre-state.
 * Empty means disabled; null means the Program or RuntimeState cannot justify an exact preparation.
 */
export function deriveInternalExclusiveMergePreparations(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: MergeExclusiveOperation,
): ReadonlyArray<PreparedInternalExclusiveMergeInput> | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return [];
  }
  const selections = exclusiveMergeInputSelections(operation, state);
  if (selections === null) {
    return null;
  }
  const prepared: PreparedInternalExclusiveMergeInput[] = [];
  for (const { alternative } of selections) {
    const member = deriveInternalExclusiveMergePreparation(program, state, operation, alternative);
    if (member === null) return null;
    prepared.push(member);
  }
  return prepared;
}

/** Exact-alternative preparation reads its selected bucket, not the other offers in the frontier. */
export function deriveInternalExclusiveMergePreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: MergeExclusiveOperation,
  alternative: InternalMergeInputAlternative,
): PreparedInternalExclusiveMergeInput | null {
  const owner = alternative.owner;
  const processId = candidateProcessId(program, state, owner);
  if (state.control.kind !== ControlStateKind.Running ||
      alternative.kind !== InternalAlternativeKind.MergeInput ||
      program.compensationEventSubProcessSnapshots !== undefined ||
      !operationIsSelectedFromProgram(program, operation, owner) || processId === null ||
      operation.origin.elementId.length === 0 || !Number.isSafeInteger(state.logicalTimeMs) ||
      state.logicalTimeMs < 0 || !exclusiveMergeInputIsApplicable(operation, state, alternative)) return null;
  const patch: InternalLocalControlPatch = {
    owner, consumed: [alternative.inputControlPlace], produced: [operation.output],
    selectedBranch: { kind: InternalSelectedBranchPatchKind.Preserve },
  };
  const outputCount = ownedTokenMultiplicity(state.controlTokens, operation.output, owner) +
    (alternative.inputControlPlace === operation.output ? 0 : 1);
  const positionDelta = deriveInternalLocalControlPositionDelta(program, patch);
  if (!Number.isSafeInteger(outputCount) || positionDelta === null) return null;
  const input = {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner,
    placeId: alternative.inputControlPlace,
  } as const;
  const output = {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner,
    placeId: operation.output,
  } as const;
  const reads = canonicalUniqueStateAtoms([
    { kind: InternalTransitionStateAtomKind.RuntimeControl, instanceId: state.control.instanceId },
    { kind: InternalTransitionStateAtomKind.ScopeOccurrence, owner },
    input, output,
    { kind: InternalTransitionStateAtomKind.LogicalTime },
  ]);
  const writes = canonicalUniqueStateAtoms([
    input, output, ...tokenOwnerCensusAtoms([alternative.inputControlPlace, operation.output]),
  ]);
  if (reads === null || writes === null) return null;
  const anchor = { kind: InternalPublicationTemplateAnchorKind.TransitionTemplate,
    processId, elementId: operation.origin.elementId, owner } as const;
  return {
    alternative, operation, owner, footprint: { reads, writes }, patch,
    publicationTemplate: { alternative,
      record: { logicalTimeMs: state.logicalTimeMs, transition: {
        kind: SemanticTransitionKind.InternalOperation, operationId: operation.id,
        operationKind: operation.kind, origin: operation.origin, owner,
      }, positionDelta },
      lifecycle: { started: [{ anchor, processId, elementId: operation.origin.elementId, owner }],
        ended: [{ anchor, terminal: FlowNodeOccurrenceTerminalKind.Completed }] },
    },
  };
}

/** Revalidation binds every retained field before applying the selected token unit. */
export function applyPreparedInternalExclusiveMerge(
  program: SemanticProcessProgram,
  state: RuntimeState,
  prepared: PreparedInternalExclusiveMergeInput,
): RuntimeState | null {
  const current = deriveInternalExclusiveMergePreparation(program, state, prepared.operation, prepared.alternative);
  return current === null || JSON.stringify(current) !== JSON.stringify(prepared)
    ? null : applyInternalLocalControlPatch(state, prepared.patch);
}

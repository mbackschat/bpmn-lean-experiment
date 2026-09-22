import { candidateProcessId, operationIsSelectedFromProgram } from "./flow-node-occurrence-candidates.js";
import { canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import { internalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalOperationAlternative } from "./internal-transition-alternative.js";
import { InternalPublicationTemplateAnchorKind } from "./internal-publication-template.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import { FlowNodeOccurrenceTerminalKind } from "./flow-node-occurrence-lifecycle.js";
import { deriveInternalLocalControlPositionDelta, InternalSelectedBranchPatchKind } from "./internal-transition-local-control-patch.js";
import { onlyTokenOwner } from "./semantic-process-scope-runtime.js";
import { SemanticTransitionKind } from "./semantic-transition-trace.js";
import type {
  InternalTransitionCandidate,
  InternalTransitionStateFootprint,
} from "./internal-transition-footprint.js";
import { tokenOwnerCensusAtoms } from "./internal-transition-token-preparation.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { selectNoneEnd } from "./semantic-process-control-flow-runtime.js";
import {
  ControlStateKind,
  removeToken,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";

type OrdinaryEndOperation = Extract<SemanticOperation, { kind: SemanticOperationKind.ReachNoneEnd }>;

export type PreparedInternalEnd = Readonly<{
  alternative: InternalOperationAlternative;
  operation: OrdinaryEndOperation;
  owner: ScopeOccurrenceId;
  footprint: InternalTransitionStateFootprint;
  patch: Readonly<{ inputControlPlace: string; endIncrement: 1 }>;
  publicationTemplate: InternalPublicationTemplate;
}>;

/** The relative increment in INTERNAL-COMMUTATION permits independent Ends to retain one preparation. */
export function deriveInternalEndPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: OrdinaryEndOperation,
): PreparedInternalEnd | null {
  const owner = onlyTokenOwner(state, operation.input);
  if (owner === undefined || program.compensationEventSubProcessSnapshots !== undefined ||
      operation.origin.elementId.length === 0 || !Number.isSafeInteger(state.logicalTimeMs) ||
      state.logicalTimeMs < 0) return null;
  const footprint = deriveInternalReachNoneEndStateFootprint(program, state, { operation, owner });
  const processId = candidateProcessId(program, state, owner);
  const positionDelta = deriveInternalLocalControlPositionDelta(program, {
    owner, consumed: [operation.input], produced: [],
    selectedBranch: { kind: InternalSelectedBranchPatchKind.Preserve },
  });
  if (footprint === null || processId === null || positionDelta === null) return null;
  const alternative = internalOperationAlternative(operation.id);
  const anchor = { kind: InternalPublicationTemplateAnchorKind.TransitionTemplate,
    processId, elementId: operation.origin.elementId, owner } as const;
  return { alternative, operation, owner, footprint,
    patch: { inputControlPlace: operation.input, endIncrement: 1 },
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

export function applyPreparedInternalEnd(
  program: SemanticProcessProgram,
  state: RuntimeState,
  prepared: PreparedInternalEnd,
): RuntimeState | null {
  const current = deriveInternalEndPreparation(program, state, prepared.operation);
  if (current === null || JSON.stringify(current) !== JSON.stringify(prepared)) return null;
  return { ...state,
    controlTokens: removeToken(state.controlTokens, prepared.patch.inputControlPlace, prepared.owner),
    endOccurrences: state.endOccurrences + prepared.patch.endIncrement,
  };
}

/** Derives the ordinary None End state footprint from the exact pre-state. */
export function deriveInternalReachNoneEndStateFootprint(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidate: InternalTransitionCandidate,
): InternalTransitionStateFootprint | null {
  const operation = candidate.operation;
  const owner = candidate.owner;
  if (
    operation.kind !== SemanticOperationKind.ReachNoneEnd ||
    owner === null ||
    state.control.kind !== ControlStateKind.Running ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    candidateProcessId(program, state, owner) === null
  ) {
    return null;
  }
  const selected = selectNoneEnd(operation, state, owner);
  if (
    selected === null ||
    !sameScopeOccurrence(selected.occurrence.id, owner)
  ) {
    return null;
  }

  const input = {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner,
    placeId: operation.input,
  } as const;
  const endIncrement = {
    kind: InternalTransitionStateAtomKind.EndIncrement,
  } as const;
  const reads = canonicalUniqueStateAtoms([
    ...tokenOwnerCensusAtoms([operation.input]),
    {
      kind: InternalTransitionStateAtomKind.RuntimeControl,
      instanceId: state.control.instanceId,
    },
    { kind: InternalTransitionStateAtomKind.ScopeOccurrence, owner },
    input,
    endIncrement,
    { kind: InternalTransitionStateAtomKind.LogicalTime },
  ]);
  const writes = canonicalUniqueStateAtoms([input, endIncrement, ...tokenOwnerCensusAtoms([operation.input])]);
  return reads === null || writes === null ? null : { reads, writes };
}

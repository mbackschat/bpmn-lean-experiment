import { projectCurrentControlPositions } from "./control-position-projection.js";
import type { PublicControlPositionDelta, PublicControlTokenPosition } from "./control-position-projection.js";
import { candidateElementOccurrence, candidateOperationOccurrence } from "./flow-node-occurrence-candidates.js";
import type { CandidateFlowNodeOccurrence } from "./flow-node-occurrence-candidates.js";
import { projectOpenFlowNodeOccurrences } from "./flow-node-occurrence-open-set.js";
import { FlowNodeOccurrenceTerminalKind, SemanticFlowNodeOccurrenceAnchorKind } from "./flow-node-occurrence-lifecycle.js";
import type { SemanticFlowNodeOccurrenceAnchor } from "./flow-node-occurrence-lifecycle.js";
import { InternalPublicationTemplateAnchorKind } from "./internal-publication-template.js";
import type {
  InternalPublicationTemplate, InternalPublicationTemplateAnchor,
  InternalPublicationLifecycleStartTemplate, InternalPublicationLifecycleEndTemplate,
} from "./internal-publication-template.js";
import { internalOperationAlternative } from "./internal-transition-alternative.js";
import { internalOccurrenceRegionContains } from "./internal-transition-region.js";
import type { InternalOccurrenceRegion } from "./internal-transition-region.js";
import type { InternalRegionalSelection } from "./internal-transition-regional-preparation.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { ScopeCompletionSelectionKind } from "./semantic-process-scope-runtime.js";
import { sameOccurrence, sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import { SemanticTransitionKind } from "./semantic-transition-trace.js";
import { scopeCancellationHandlerWaitIds } from "./flow-node-occurrence-lifecycle.js";

/** Resolves regional publication from predecessor ownership and selected continuation facts. */
export function deriveInternalRegionalPublication(
  program: SemanticProcessProgram,
  state: RuntimeState,
  selection: InternalRegionalSelection,
  region: InternalOccurrenceRegion,
): InternalPublicationTemplate | null {
  const positions = projectCurrentControlPositions(program, state);
  const open = projectOpenFlowNodeOccurrences(program, state);
  if (positions === null || open === null) return null;
  const contains = (owner: ScopeOccurrenceId): boolean => internalOccurrenceRegionContains(region, owner);
  const started: InternalPublicationLifecycleStartTemplate[] = [];
  const ended: InternalPublicationLifecycleEndTemplate[] = [];
  let produced: PublicControlTokenPosition | null = null;
  let positionDelta: PublicControlPositionDelta;
  switch (selection.kind) {
    case SemanticOperationKind.ReturnProcess: {
      const record = selection.selected.record;
      const call = open.filter(({ anchor }) => anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.CallActivity &&
        sameOccurrence(anchor.id, record.id));
      if (call.length !== 1) return null;
      ended.push({ anchor: { kind: InternalPublicationTemplateAnchorKind.CallActivity, id: record.id },
        terminal: FlowNodeOccurrenceTerminalKind.Completed });
      produced = outputPosition(program, selection.operation.callerOutput, record.caller);
      if (produced === null) return null;
      positionDelta = { consumedTokens: positions.controlTokens.filter(({ owner }) => contains(owner)),
        producedTokens: [produced], enteredScopes: [], exitedScopes: positions.scopes.filter(({ id }) => contains(id)) };
      break;
    }
    case SemanticOperationKind.CompleteScope:
      switch (selection.selected.kind) {
        case ScopeCompletionSelectionKind.Root:
          positionDelta = { consumedTokens: [], producedTokens: [], enteredScopes: [], exitedScopes: positions.scopes };
          break;
        case ScopeCompletionSelectionKind.Child: {
          const scope = open.filter(({ anchor }) => anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope &&
            sameScopeOccurrence(anchor.id, selection.owner));
          if (scope.length !== 1) return null;
          ended.push({ anchor: { kind: InternalPublicationTemplateAnchorKind.Scope, id: selection.owner },
            terminal: FlowNodeOccurrenceTerminalKind.Completed });
          produced = outputPosition(program, selection.selected.parentOutput, selection.selected.parent);
          if (produced === null) return null;
          positionDelta = { consumedTokens: [], producedTokens: [produced], enteredScopes: [],
            exitedScopes: positions.scopes.filter(({ id }) => sameScopeOccurrence(id, selection.owner)) };
          break;
        }
      }
      break;
    case SemanticOperationKind.ThrowError:
    case SemanticOperationKind.TerminateScope: {
      const instant = candidateOperationOccurrence(program, state, selection.operation, selection.owner);
      if (instant === null) return null;
      addInstant(instant, started, ended);
      const retainRoot = selection.kind === SemanticOperationKind.TerminateScope;
      const handlers = scopeCancellationHandlerWaitIds(program, state, selection.kind === SemanticOperationKind.ThrowError
        ? selection.selected.attached : selection.selected.occurrence);
      if (selection.kind === SemanticOperationKind.ThrowError) {
        const boundary = candidateElementOccurrence(program, state,
          selection.operation.handler.origin.boundaryEventId, selection.selected.parent);
        if (boundary === null) return null;
        addInstant(boundary, started, ended);
        produced = outputPosition(program, selection.operation.handler.output, selection.selected.parent);
        if (produced === null) return null;
      }
      for (const entry of open) {
        if (entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope && retainRoot &&
            sameScopeOccurrence(entry.anchor.id, selection.owner)) continue;
        const anchorId = entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait ? entry.anchor.id : null;
        if (!contains(entry.owner) && !(entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope &&
            contains(entry.anchor.id)) &&
            !(anchorId !== null && handlers.some((id) => sameOccurrence(id, anchorId)))) continue;
        const anchor = retainedAnchor(entry.anchor);
        if (anchor === null) return null;
        ended.push({ anchor, terminal: FlowNodeOccurrenceTerminalKind.Cancelled });
      }
      positionDelta = { consumedTokens: positions.controlTokens.filter(({ owner }) => contains(owner)),
        producedTokens: produced === null ? [] : [produced], enteredScopes: [],
        exitedScopes: positions.scopes.filter(({ id }) => contains(id) &&
          !(retainRoot && sameScopeOccurrence(id, selection.owner))) };
      break;
    }
  }
  const operation = selection.operation;
  return {
    alternative: internalOperationAlternative(operation.id),
    record: { logicalTimeMs: state.logicalTimeMs,
      transition: { kind: SemanticTransitionKind.InternalOperation, operationId: operation.id,
        operationKind: operation.kind, origin: operation.origin, owner: selection.owner }, positionDelta },
    lifecycle: { started, ended },
  };
}

function addInstant(
  occurrence: CandidateFlowNodeOccurrence,
  started: InternalPublicationLifecycleStartTemplate[],
  ended: InternalPublicationLifecycleEndTemplate[],
): void {
  const anchor = { kind: InternalPublicationTemplateAnchorKind.TransitionTemplate, ...occurrence } as const;
  started.push({ anchor, ...occurrence });
  ended.push({ anchor, terminal: FlowNodeOccurrenceTerminalKind.Completed });
}

function retainedAnchor(anchor: SemanticFlowNodeOccurrenceAnchor): InternalPublicationTemplateAnchor | null {
  switch (anchor.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
      return { kind: InternalPublicationTemplateAnchorKind.Wait, id: anchor.id };
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
      return { kind: InternalPublicationTemplateAnchorKind.Scope, id: anchor.id };
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
      return { kind: InternalPublicationTemplateAnchorKind.CallActivity, id: anchor.id };
    case SemanticFlowNodeOccurrenceAnchorKind.CompensationTrigger:
      return { kind: InternalPublicationTemplateAnchorKind.CompensationTrigger, id: anchor.id };
    case SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler:
      return { kind: InternalPublicationTemplateAnchorKind.CompensationHandler, id: anchor.id };
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return null;
  }
}

function outputPosition(
  program: SemanticProcessProgram,
  placeId: string,
  owner: ScopeOccurrenceId,
): PublicControlTokenPosition | null {
  const places = program.controlPlaces.filter(({ id }) => id === placeId);
  const bindings = program.controlPlaceScopes.filter(({ controlPlaceId }) => controlPlaceId === placeId);
  const place = places[0];
  return places.length === 1 && place !== undefined && place.origin.elementId.length > 0 &&
    bindings.length === 1 && bindings[0]?.scopeId === owner.definitionScopeId
    ? { sequenceFlowId: place.origin.elementId, owner, multiplicity: 1 } : null;
}

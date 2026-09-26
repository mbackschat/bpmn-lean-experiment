import {
  projectOpenCompensationOccurrences,
  type CompensationLifecyclePieces,
} from "./flow-node-occurrence-compensation.js";
import { projectOpenFlowNodeOccurrences } from "./flow-node-occurrence-open-set.js";
import {
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  type UnnumberedFlowNodeOccurrenceEnd,
} from "./flow-node-occurrence-lifecycle.js";
import type { CancelTransactionOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  sameScopeOccurrence,
  type RuntimeScopeOccurrence,
  type RuntimeState,
  type ScopeOccurrenceId,
} from "./semantic-process-state.js";

export function projectTransactionCancellationLifecycle(
  program: SemanticProcessProgram,
  before: RuntimeState,
  after: RuntimeState,
  operation: CancelTransactionOperation,
  root: RuntimeScopeOccurrence,
  cancelled: (retainRoot: boolean) => UnnumberedFlowNodeOccurrenceEnd[],
): CompensationLifecyclePieces | null {
  if (root.parent === null || root.id.definitionScopeId !== operation.definitionScopeId) return null;
  const registers = (before.compensationActivityRetentions ?? []).filter(({ owner }) =>
    sameScopeOccurrence(owner, root.id)
  );
  const register = registers[0];
  if (registers.length !== 1 || register === undefined) return null;
  const retained = register.records.length > 0;
  const active = projectOpenCompensationOccurrences(program, after);
  if (active === null) return null;
  const started = active.filter(({ owner }) => sameScopeOccurrence(owner, root.id));
  if (retained !== (started.length > 0)) return null;
  return {
    started,
    ended: cancelled(retained),
    instantaneous: [
      { processId: program.processId, elementId: operation.origin.elementId, owner: root.id },
      ...(retained ? [] : [{
        processId: program.processId,
        elementId: operation.boundaryEventElementId,
        owner: root.parent,
      }]),
    ],
  };
}

export function projectTransactionJoinLifecycle(
  program: SemanticProcessProgram,
  before: RuntimeState,
  operation: CancelTransactionOperation,
  owner: ScopeOccurrenceId,
  success: boolean,
  handlerEnds: UnnumberedFlowNodeOccurrenceEnd[],
): CompensationLifecyclePieces | null {
  const roots = before.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, owner));
  const root = roots[0];
  if (roots.length !== 1 || root?.parent === null || root === undefined ||
      owner.definitionScopeId !== operation.definitionScopeId) return null;
  if (!success) {
    const open = projectOpenFlowNodeOccurrences(program, before);
    return open === null ? null : {
      started: [],
      ended: open.map(({ anchor }) => ({ anchor, terminal: FlowNodeOccurrenceTerminalKind.Cancelled })),
      instantaneous: [],
    };
  }
  return {
    started: [],
    ended: [
      ...handlerEnds,
      { anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Scope, id: owner }, terminal: FlowNodeOccurrenceTerminalKind.Cancelled },
    ],
    instantaneous: [{
      processId: program.processId,
      elementId: operation.boundaryEventElementId,
      owner: root.parent,
    }],
  };
}

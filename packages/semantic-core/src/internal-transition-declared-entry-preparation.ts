import { canonicalStateAtomSet } from "./internal-transition-footprint-ordering.js";
import { nestedScopeReadAtoms } from "./internal-transition-footprint.js";
import type { InternalTransitionStateFootprint } from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import type { InternalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import { applyInternalScopeCreationPatch } from "./internal-transition-scope-creation-patch.js";
import {
  deriveInternalEnterScopeControl, InternalScopeCreationResultKind,
} from "./internal-transition-scope-creation-preparation.js";
import type { PreparedInternalScopeCreation } from "./internal-transition-scope-creation-preparation.js";
import {
  evaluateNestedScopeFrame, insertNestedScopeFrame, nestedScopeReadSet, nestedScopeRecord,
} from "./nested-scope-data.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { SemanticOperation, SemanticOperationKind, SemanticProcessProgram } from "./semantic-process-contract.js";
import type { RuntimeState, ScopeOccurrenceId, ScopeVariableScope } from "./semantic-process-state.js";

/**
 * CSD-PREPARE-01: the declared entry of an ordinary Sub-Process as a prepared scope creation. It keeps the unchanged
 * scope-creation `control` and adds the frame evaluated against the predecessor, so every law over the control patch
 * stays as it is and the composition adds one frame insertion that changes only `variables.scopes`.
 */
export type PreparedInternalDeclaredScopeEntry = Readonly<{
  alternative: InternalOperationAlternative;
  operation: Extract<SemanticOperation, { kind: SemanticOperationKind.EnterScope }>;
  owner: ScopeOccurrenceId;
  control: PreparedInternalScopeCreation;
  frame: ScopeVariableScope;
  footprint: InternalTransitionStateFootprint;
  publicationTemplate: InternalPublicationTemplate;
}>;

export function deriveInternalDeclaredScopeEntryPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<SemanticOperation, { kind: SemanticOperationKind.EnterScope }>,
): PreparedInternalDeclaredScopeEntry | null {
  const record = nestedScopeRecord(program, operation.childScopeId);
  const control = record === undefined ? null : deriveInternalEnterScopeControl(program, state, operation);
  if (record === undefined || control === null || control.creation.kind !== InternalScopeCreationResultKind.ChildScope) {
    return null;
  }
  const child = control.creation.child;
  const frame = evaluateNestedScopeFrame(program, state, record, child, control.owner);
  const names = record.localInputs.flatMap(({ expression }) =>
    expression.kind === MappingExpressionKind.EnclosingVariable ? [expression.name] : []);
  const reads = nestedScopeReadSet(program, state, control.owner, names);
  if (frame === null || reads === null) return null;
  const written = { kind: InternalTransitionStateAtomKind.ScopeVariableScope, owner: child } as const;
  const processReads = [...new Set(reads.processNames)].map(name =>
    ({ kind: InternalTransitionStateAtomKind.ProcessVariable, name }) as const);
  return {
    alternative: control.alternative, operation, owner: control.owner, control, frame,
    footprint: {
      reads: canonicalStateAtomSet([...control.footprint.reads, ...nestedScopeReadAtoms(reads), ...processReads, written]),
      writes: canonicalStateAtomSet([...control.footprint.writes, written]),
    },
    publicationTemplate: control.publicationTemplate,
  };
}

/** Revalidates the complete preparation, then applies the control patch and inserts the retained frame. */
export function applyPreparedInternalDeclaredScopeEntry(
  program: SemanticProcessProgram,
  state: RuntimeState,
  prepared: PreparedInternalDeclaredScopeEntry,
): RuntimeState | null {
  const current = deriveInternalDeclaredScopeEntryPreparation(program, state, prepared.operation);
  if (current === null || JSON.stringify(current) !== JSON.stringify(prepared)) return null;
  const entered = applyInternalScopeCreationPatch(state, prepared.control.patch);
  return { ...entered, variables: insertNestedScopeFrame(entered.variables, prepared.frame) };
}

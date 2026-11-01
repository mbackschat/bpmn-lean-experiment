import type { VariableMappingCallData } from "./call-data-contract.js";
import { CallDataKind } from "./call-data-contract.js";
import { evaluateCallInputs } from "./call-variable-mapping-runtime.js";
import { enclosingReads } from "./concurrent-scope-data-availability.js";
import { canonicalStateAtomSet } from "./internal-transition-footprint-ordering.js";
import { nestedScopeReadAtoms } from "./internal-transition-footprint.js";
import type { InternalTransitionStateFootprint } from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import type { InternalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import { applyInternalScopeCreationPatch } from "./internal-transition-scope-creation-patch.js";
import {
  deriveInternalInvokeProcessPreparation, InternalScopeCreationResultKind,
} from "./internal-transition-scope-creation-preparation.js";
import type { PreparedInternalScopeCreation } from "./internal-transition-scope-creation-preparation.js";
import { insertNestedScopeFrame, nestedScopeReadSet } from "./nested-scope-data.js";
import { mergeProcessVariableBindings } from "./semantic-process-data.js";
import type { InvokeProcessOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId, ScopeVariableScope } from "./semantic-process-state.js";

/**
 * CMCALL-PREPARE-01: a mapped Call's invocation as a prepared scope creation, beside the declared entry of CSD-PREPARE-01.
 * It keeps the unchanged invocation `control` and adds the called-root frame CVM-IN-01 evaluates against the
 * predecessor along the caller's chain, so every law over the control patch stays as it is and the composition adds one
 * frame insertion that changes only `variables.scopes`. Return stays an unprepared singleton.
 */
export type PreparedInternalMappedInvocation = Readonly<{
  alternative: InternalOperationAlternative;
  operation: InvokeProcessOperation;
  owner: ScopeOccurrenceId;
  control: PreparedInternalScopeCreation;
  frame: ScopeVariableScope;
  footprint: InternalTransitionStateFootprint;
  publicationTemplate: InternalPublicationTemplate;
}>;

export function deriveInternalMappedInvocationPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: InvokeProcessOperation,
): PreparedInternalMappedInvocation | null {
  const data: VariableMappingCallData | undefined =
    operation.data.kind === CallDataKind.VariableMappings ? operation.data : undefined;
  const control = data === undefined ? null : deriveInternalInvokeProcessPreparation(program, state, operation);
  if (data === undefined || control === null || control.creation.kind !== InternalScopeCreationResultKind.CalledProcess) {
    return null;
  }
  const calledRoot = control.creation.record.calledRoot;
  const bindings = evaluateCallInputs(program, state, control.owner, data);
  const reads = nestedScopeReadSet(program, state, control.owner, enclosingReads(data.inputs));
  if (bindings === null || reads === null ||
      state.variables.scopes.some(frame => sameScopeOccurrence(frame.owner, calledRoot))) return null;
  const written = { kind: InternalTransitionStateAtomKind.ScopeVariableScope, owner: calledRoot } as const;
  const processReads = [...new Set(reads.processNames)].map(name =>
    ({ kind: InternalTransitionStateAtomKind.ProcessVariable, name }) as const);
  return {
    alternative: control.alternative, operation, owner: control.owner, control,
    frame: { owner: { ...calledRoot }, bindings: mergeProcessVariableBindings([], bindings) },
    footprint: {
      reads: canonicalStateAtomSet([...control.footprint.reads, ...nestedScopeReadAtoms(reads), ...processReads, written]),
      writes: canonicalStateAtomSet([...control.footprint.writes, written]),
    },
    publicationTemplate: control.publicationTemplate,
  };
}

/** Revalidates the complete preparation, then applies the control patch and inserts the retained called-root frame. */
export function applyPreparedInternalMappedInvocation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  prepared: PreparedInternalMappedInvocation,
): RuntimeState | null {
  const current = deriveInternalMappedInvocationPreparation(program, state, prepared.operation);
  if (current === null || JSON.stringify(current) !== JSON.stringify(prepared)) return null;
  const invoked = applyInternalScopeCreationPatch(state, prepared.control.patch);
  return { ...invoked, variables: insertNestedScopeFrame(invoked.variables, prepared.frame) };
}

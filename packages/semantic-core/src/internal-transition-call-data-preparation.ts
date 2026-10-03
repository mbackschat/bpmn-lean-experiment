import { ActivityDataEndpointKind, readActivityDataInputSource, writeActivityDataOutputTarget } from "./activity-data-endpoint.js";
import { callDataInterfaceValid } from "./call-data-admission.js";
import { CallDataKind } from "./call-data-contract.js";
import type { VariableBinding } from "./contract.js";
import { canonicalStateAtomSet } from "./internal-transition-footprint-ordering.js";
import type { InternalTransitionStateAtom, InternalTransitionStateFootprint } from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import type { InternalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import { applyPreparedInternalRegionalTransition, deriveInternalRegionalPreparation } from "./internal-transition-regional-preparation.js";
import type { PreparedInternalRegionalTransition } from "./internal-transition-regional-preparation.js";
import { applyPreparedInternalScopeCreation, deriveInternalInvokeProcessPreparation, InternalScopeCreationResultKind } from "./internal-transition-scope-creation-preparation.js";
import type { PreparedInternalScopeCreation } from "./internal-transition-scope-creation-preparation.js";
import { addProcessInterface, readProcessInterfaceOutput } from "./process-interface-data.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import { cloneVariableBinding } from "./variable-value.js";

type CallOperation = Extract<SemanticOperation, {
  kind: SemanticOperationKind.InvokeProcess | SemanticOperationKind.ReturnProcess;
}>;

export type PreparedInternalCallData = Readonly<{
  alternative: InternalOperationAlternative;
  owner: ScopeOccurrenceId;
  binding: VariableBinding;
  footprint: InternalTransitionStateFootprint;
  publicationTemplate: InternalPublicationTemplate;
} & (
  | { operation: Extract<CallOperation, { kind: SemanticOperationKind.InvokeProcess }>;
      kind: SemanticOperationKind.InvokeProcess; control: PreparedInternalScopeCreation }
  | { operation: Extract<CallOperation, { kind: SemanticOperationKind.ReturnProcess }>;
      kind: SemanticOperationKind.ReturnProcess; control: PreparedInternalRegionalTransition }
)>;

/** CDATA-RESUME-01 binds scalar data to the same retained control selection and publication. */
export function deriveInternalCallDataPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: CallOperation,
): PreparedInternalCallData | null {
  const data = operation.data;
  if (data.kind !== CallDataKind.Scalar ||
      !callDataInterfaceValid(data, operation.origin.elementId, operation.calledProcessId)) return null;
  switch (operation.kind) {
    case SemanticOperationKind.InvokeProcess: {
      const control = deriveInternalInvokeProcessPreparation(program, state, operation);
      if (control === null || control.creation.kind !== InternalScopeCreationResultKind.CalledProcess ||
          data.directInput.source.kind !== ActivityDataEndpointKind.Property) return null;
      const input = readActivityDataInputSource(state, control.owner, data.directInput.source);
      if (input === undefined) return null;
      const binding = { name: data.called.input.id, value: input.value };
      if (addProcessInterface(state.variables, control.creation.record.calledRoot, binding) === null) return null;
      const scope = { kind: InternalTransitionStateAtomKind.ProcessInterfaceScope,
        owner: control.creation.record.calledRoot } as const;
      const source = { kind: InternalTransitionStateAtomKind.ProcessVariable, name: data.directInput.source.propertyId } as const;
      return { kind: operation.kind, operation, control, owner: control.owner,
        alternative: control.alternative, publicationTemplate: control.publicationTemplate,
        binding: cloneVariableBinding(binding), footprint: withData(control.footprint, [source, scope], [scope]) };
    }
    case SemanticOperationKind.ReturnProcess: {
      const control = deriveInternalRegionalPreparation(program, state, operation);
      if (control === null || control.selection.kind !== SemanticOperationKind.ReturnProcess ||
          data.directOutput.target.kind !== ActivityDataEndpointKind.Property) return null;
      const selected = control.selection.selected;
      const output = readProcessInterfaceOutput(state.variables, selected.record.calledRoot, data.called.output.id);
      if (output === undefined || writeActivityDataOutputTarget(state, selected.record.caller, data.directOutput.target, output) === null) return null;
      const scope = { kind: InternalTransitionStateAtomKind.ProcessInterfaceScope, owner: selected.record.calledRoot } as const;
      const target = { kind: InternalTransitionStateAtomKind.ProcessVariable, name: data.directOutput.target.propertyId } as const;
      return { kind: operation.kind, operation, control, owner: control.selection.owner,
        alternative: control.alternative, publicationTemplate: control.publicationTemplate,
        binding: cloneVariableBinding(output), footprint: withData(control.footprint, [scope], [scope, target]) };
    }
  }
}

/** Revalidation rejects stale data while retaining unrelated frames (CDATA-INPUT-01/OUTPUT-01). */
export function applyPreparedInternalCallData(
  program: SemanticProcessProgram,
  state: RuntimeState,
  prepared: PreparedInternalCallData,
): RuntimeState | null {
  const current = deriveInternalCallDataPreparation(program, state, prepared.operation);
  if (current === null || JSON.stringify(current) !== JSON.stringify(prepared)) return null;
  switch (prepared.kind) {
    case SemanticOperationKind.InvokeProcess: {
      if (prepared.control.creation.kind !== InternalScopeCreationResultKind.CalledProcess) return null;
      const invoked = applyPreparedInternalScopeCreation(program, state, prepared.control);
      if (invoked === null) return null;
      const variables = addProcessInterface(invoked.variables, prepared.control.creation.record.calledRoot, prepared.binding);
      return variables === null ? null : { ...invoked, variables };
    }
    case SemanticOperationKind.ReturnProcess: {
      if (prepared.control.selection.kind !== SemanticOperationKind.ReturnProcess ||
          prepared.operation.data.kind !== CallDataKind.Scalar) return null;
      const returned = applyPreparedInternalRegionalTransition(program, state, prepared.control);
      if (returned === null) return null;
      const variables = writeActivityDataOutputTarget(returned, prepared.control.selection.selected.record.caller,
        prepared.operation.data.directOutput.target, prepared.binding);
      return variables === null ? null : { ...returned, variables };
    }
  }
}

function withData(
  control: InternalTransitionStateFootprint,
  reads: readonly InternalTransitionStateAtom[],
  writes: readonly InternalTransitionStateAtom[],
): InternalTransitionStateFootprint {
  return { reads: canonicalStateAtomSet([...control.reads, ...reads]),
    writes: canonicalStateAtomSet([...control.writes, ...writes]) };
}

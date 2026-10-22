import { readActivityDataInputSource, writeActivityDataOutputTarget } from "./activity-data-endpoint.js";
import { callDataInterfaceValid } from "./call-data-admission.js";
import { CallDataKind } from "./call-data-contract.js";
import { addProcessInterface, readProcessInterfaceOutput } from "./process-interface-data.js";
import {
  invokeCalledProcess, returnCalledProcess,
  selectCalledProcessInvocation, selectReturnCalledProcess,
} from "./semantic-process-call-runtime.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { invokeCalledProcessWithMappings, returnCalledProcessWithMappings } from "./call-variable-mapping-runtime.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";

/** CDATA-INPUT-01 commits the fresh called root and its isolated input snapshot together. */
export function invokeCalledProcessWithData(
  program: SemanticProcessProgram,
  operation: Extract<SemanticOperation, { kind: SemanticOperationKind.InvokeProcess }>,
  state: RuntimeState,
  caller: ScopeOccurrenceId,
): RuntimeState | null {
  const data = operation.data;
  switch (data.kind) {
    case CallDataKind.Empty:
      return invokeCalledProcess(operation, state, caller);
    case CallDataKind.Scalar: {
      if (!callDataInterfaceValid(data, operation.origin.elementId, operation.calledProcessId)) return null;
      const selected = selectCalledProcessInvocation(operation, state, caller);
      if (selected === null) return null;
      const input = readActivityDataInputSource(state, caller, data.directInput.source);
      if (input === undefined) return null;
      const variables = addProcessInterface(state.variables, selected.record.calledRoot,
        { name: data.called.input.id, value: input.value });
      if (variables === null) return null;
      const invoked = invokeCalledProcess(operation, state, caller);
      return invoked === null ? null : { ...invoked, variables };
    }
    case CallDataKind.VariableMappings:
      return callDataInterfaceValid(data, operation.origin.elementId, operation.calledProcessId)
        ? invokeCalledProcessWithMappings(program, operation, data, state, caller) : null;
  }
}

/** CDATA-OUTPUT-01/RETURN-01 captures the required output before disposing its called owner. */
export function returnCalledProcessWithData(
  program: SemanticProcessProgram,
  operation: Extract<SemanticOperation, { kind: SemanticOperationKind.ReturnProcess }>,
  state: RuntimeState,
): RuntimeState | null {
  const data = operation.data;
  switch (data.kind) {
    case CallDataKind.Empty:
      return returnCalledProcess(operation, state);
    case CallDataKind.Scalar: {
      if (!callDataInterfaceValid(data, operation.origin.elementId, operation.calledProcessId)) return null;
      const selected = selectReturnCalledProcess(operation, state);
      if (selected === null) return null;
      const output = readProcessInterfaceOutput(state.variables, selected.record.calledRoot, data.called.output.id);
      if (output === undefined) return null;
      const returned = returnCalledProcess(operation, state);
      if (returned === null) return null;
      const variables = writeActivityDataOutputTarget(returned, selected.record.caller, data.directOutput.target, output);
      return variables === null ? null : { ...returned, variables };
    }
    case CallDataKind.VariableMappings:
      return callDataInterfaceValid(data, operation.origin.elementId, operation.calledProcessId)
        ? returnCalledProcessWithMappings(program, operation, data, state) : null;
  }
}

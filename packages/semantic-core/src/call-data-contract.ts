import type { DirectActivityDataInput } from "./activity-data-input-contract.js";
import type { DirectActivityDataOutput } from "./activity-data-output-contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import type { VariableMapping } from "./semantic-value-contract.js";

/** The required singleton interface admitted by CDATA-MATCH-01.
 *
 * Scalar ports have no ItemDefinition or DataState, and sets have no optional,
 * while-executing, or paired-set references. Source admission must establish
 * those restrictions before constructing this value. Names never match ports.
 */
export type ScalarIoSpecification = DeepReadonly<{
  ownerId: string;
  id: string;
  input: { id: string; name: string | null };
  output: { id: string; name: string | null };
  inputSet: { id: string; name: string | null; dataInputRefs: string[] };
  outputSet: { id: string; name: string | null; dataOutputRefs: string[] };
}>;

export enum CallDataKind {
  Empty = "empty",
  Scalar = "scalar",
  VariableMappings = "variableMappings",
}

/** Correspondence joins separately owned declarations, never shared XML IDs (BPMN 10.3.6). */
export type ScalarCallData = DeepReadonly<{
  kind: CallDataKind.Scalar;
  callerProperties: string[];
  call: ScalarIoSpecification;
  called: ScalarIoSpecification;
  directInput: DirectActivityDataInput;
  directOutput: DirectActivityDataOutput;
}>;

/**
 * CIB `camunda:in`/`camunda:out` copies, in document order because CIB evaluates them in that order
 * (CVM-IN-01, CVM-OUT-01). Inputs read the Call's enclosing chain, outputs the called-root frame.
 */
export type VariableMappingCallData = DeepReadonly<{
  kind: CallDataKind.VariableMappings;
  inputs: VariableMapping[];
  outputs: VariableMapping[];
}>;

export type CallDataInterface = Readonly<{ kind: CallDataKind.Empty }> | ScalarCallData | VariableMappingCallData;

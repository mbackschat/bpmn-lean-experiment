module

public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.Lowering
public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation

/-! # Cross-artifact definition binding

This module owns the proof-facing predicate used by conformance facts to combine independent checked-process and Semantic Process validation with profile capability and exact canonical-lowering equality. Runtime JSON input admission remains in `SemanticProcessJson.DefinitionInput`, and neither representation-specific validator depends on the other representation.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

/-- Artifact admission requires both independent validators and exact canonical lowering equality. -/
def definitionBindingValid (source : CheckedProcess) (program : Program) : Bool :=
  checkedWellFormed source &&
    programWellFormed program &&
    programProfileCapabilitiesValid program &&
    decide (lowerCheckedProcess source = program)

end BpmnSemantics.SemanticProcess

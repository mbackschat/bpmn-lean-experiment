import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.ProfileAdmission

/-! # Cross-artifact definition binding

This module owns the proof-facing predicate used by conformance facts to combine independent checked-process and Semantic Process validation with profile capability and exact canonical-lowering equality. Runtime JSON input admission remains in `SemanticProcessJson.DefinitionInput`, and neither representation-specific validator depends on the other representation.
-/

namespace BpmnSemantics.SemanticProcess

/-- Artifact admission requires both independent validators and exact canonical lowering equality. -/
def definitionBindingValid (source : CheckedProcess) (program : Program) : Bool :=
  checkedWellFormed source &&
    programWellFormed program &&
    programProfileCapabilitiesValid program &&
    decide (lowerCheckedProcess source = program)

end BpmnSemantics.SemanticProcess

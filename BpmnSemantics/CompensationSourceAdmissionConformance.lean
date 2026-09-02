import BpmnSemantics.CompensationSourceLoweringFixtures

/-! # Compensation source admission and lowering conformance

The exact checked graph, independently authored Program, profile admission, lowering equality, and
cross-artifact definition binding remain separate kernel decisions so no compound fixture term can
consume the complete memory allowance.
-/

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

theorem exact_checked_source_is_admitted :
    checkedWellFormed checkedProcess = true := by
  decide +kernel

theorem exact_source_lowers_to_independent_program :
    lowerCheckedProcess checkedProcess = expectedProgram := by
  rfl

theorem exact_program_is_admitted :
    programWellFormed expectedProgram = true := by
  decide +kernel

theorem exact_program_profile_is_admitted :
    programProfileCapabilitiesValid expectedProgram = true := by
  decide +kernel

theorem exact_checked_source_and_program_are_bound :
    definitionBindingValid checkedProcess expectedProgram = true := by
  decide +kernel

end BpmnSemantics.CompensationSourceLoweringConformance

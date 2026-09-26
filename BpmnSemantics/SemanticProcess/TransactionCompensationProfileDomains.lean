import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime
import BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import BpmnSemantics.SemanticProcess.ParallelMultiInstancePreservation

/-! Existing profile capability counts discharge the root-only Compensation proof domain
without adding a premise to their public preservation guarantees. -/

namespace BpmnSemantics.SemanticProcess

private def isCompensationOperation : SemanticOperation → Bool
  | .triggerCompensation .. | .cancelTransaction .. => true
  | _ => false

private theorem compensationCardinality (operations : List SemanticOperation) :
    (operationCardinalities operations).compensationTriggers =
      (operations.filter isCompensationOperation).length := by
  unfold operationCardinalities
  have count : ∀ counts : ShapeCardinalities,
      (operations.foldl addOperationCardinality counts).compensationTriggers =
        counts.compensationTriggers + (operations.filter isCompensationOperation).length := by
    intro counts
    induction operations generalizing counts with
    | nil => simp
    | cons operation rest ih =>
        rw [List.foldl_cons, ih]
        cases operation <;> simp [addOperationCardinality, isCompensationOperation] <;> omega
  simpa using count {}

/-- The existing exact profile census excludes Cancel operations when it admits no compensation trigger. -/
theorem RootCompensationExecutionDomain.of_zero_profile (program : Program)
    (legacy : program.identity.semanticProfile ≠ repeatableSubscriptionCheckpointProfileId)
    (zero : (programShape? program.identity.semanticProfile.value).map
      (fun entry => entry.2.compensationTriggers) = some 0)
    (capabilities : programProfileCapabilitiesValid program = true) :
    RootCompensationExecutionDomain program := by
  simp only [programProfileCapabilitiesValid, legacy, ↓reduceIte, Bool.and_eq_true] at capabilities
  cases shape : programShape? program.identity.semanticProfile.value with
  | none => simp [shape] at zero
  | some entry =>
      obtain ⟨scopes, expected⟩ := entry
      simp only [shape, Option.map_some, Option.some.injEq] at zero
      simp only [shape, Bool.and_eq_true, decide_eq_true_eq] at capabilities
      have same : operationCardinalities program.operations = expected := by grind
      have empty : program.operations.filter isCompensationOperation = [] := by
        apply List.length_eq_zero_iff.mp
        rw [← compensationCardinality, same, zero]
      intro operation member
      cases operation <;> try trivial
      rename_i id origin scope input output boundary
      have present : .cancelTransaction id origin scope input output boundary ∈
          program.operations.filter isCompensationOperation :=
        List.mem_filter.mpr ⟨member, rfl⟩
      simp [empty] at present

theorem SharedParallelProgramAccount.rootCompensationDomain (program : Program)
    (arm : ParallelMultiInstanceArm) (ownerScope : DefinitionScopeId)
    (account : SharedParallelProgramAccount program arm ownerScope) :
    RootCompensationExecutionDomain program :=
  RootCompensationExecutionDomain.of_zero_profile program
    (by rw [account.profile]; decide +kernel) (by rw [account.profile]; rfl) account.capabilities

end BpmnSemantics.SemanticProcess

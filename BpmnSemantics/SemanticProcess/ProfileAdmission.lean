import BpmnSemantics.SemanticProcess.ProfileShapeCatalog

/-! # Semantic profile admission consequences

The cardinality representation, folds, and catalogs live in `ProfileShapeCatalog`; this module
retains the stable theorem surface consumed by runtime-preservation proofs.
-/

namespace BpmnSemantics.SemanticProcess

/-- The Parallel Multi-Instance profile's exact Program shape contains one definition scope. -/
theorem parallelMultiInstanceProfile_has_one_definition_scope (program : Program)
    (profile : program.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId)
    (capabilities : programProfileCapabilitiesValid program = true) :
    program.definitionScopes.length = 1 := by
  simp only [programProfileCapabilitiesValid, Bool.and_eq_true] at capabilities
  rw [profile] at capabilities
  simp [programShape?, parallelMultiInstanceUserTaskProfileId,
    sequentialMultiInstanceUserTaskProfileId] at capabilities
  grind

/-- The Parallel Multi-Instance profile admits no Event-Based Gateway race operation. -/
theorem parallelMultiInstanceProfile_has_no_event_race_operation (program : Program)
    (profile : program.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId)
    (capabilities : programProfileCapabilitiesValid program = true) :
    ∀ operation ∈ program.operations,
      match operation with
      | .awaitEventRace .. => False
      | _ => True := by
  simp only [programProfileCapabilitiesValid, Bool.and_eq_true] at capabilities
  rw [profile] at capabilities
  simp [programShape?, parallelMultiInstanceUserTaskProfileId,
    sequentialMultiInstanceUserTaskProfileId] at capabilities
  have shape : operationCardinalities program.operations =
      withScopeCompletions 1 { initiates := 1, userTasks := 1, ends := 2 } := by
    grind
  have zero : (program.operations.filter isEventRaceOperation).length = 0 := by
    have count := congrArg ShapeCardinalities.eventRaces shape
    simpa [operationCardinalities_eventRaces, withScopeCompletions] using count
  have empty : program.operations.filter isEventRaceOperation = [] :=
    List.eq_nil_of_length_eq_zero zero
  intro operation member
  have excluded : isEventRaceOperation operation = false := by
    apply Bool.eq_false_iff.mpr
    intro selected
    have present : operation ∈ program.operations.filter isEventRaceOperation :=
      List.mem_filter.mpr ⟨member, selected⟩
    rw [empty] at present
    simp at present
  cases operation <;> simp_all [isEventRaceOperation]

end BpmnSemantics.SemanticProcess

import BpmnSemantics.SemanticProcess.ProfileShapeCatalog

/-! # Semantic profile admission consequences

Counts live in `ProfileCardinalities` and selection in `ProfileShapeCatalog`; this module
retains the stable theorem surface consumed by runtime-preservation proofs.
-/

namespace BpmnSemantics.SemanticProcess

/-- A profile without its own dispatch branch reaches the shared undispatched checks. -/
theorem programProfileCapabilitiesValid_of_undispatched (program : Program)
    (undispatched : programCapabilityDispatched program.identity.semanticProfile = false) :
    programProfileCapabilitiesValid program =
      ((program.scopeLocalData.isEmpty || program.identity.semanticProfile == nestedScopeDataProfileId) &&
        (program.interruptingMessageEventSubProcesses.isEmpty && programUndispatchedCapabilities program)) := by
  simp only [programCapabilityDispatched, Bool.or_eq_false_iff, decide_eq_false_iff_not] at undispatched
  obtain ⟨⟨⟨⟨⟨repeatedScope, messageHandler⟩, callData⟩, transaction⟩, subscription⟩, embedded⟩ := undispatched
  simp only [programProfileCapabilitiesValid, repeatedScope, messageHandler, callData, transaction, subscription,
    embedded, Bool.false_eq_true, ↓reduceIte]

/-- The Parallel Multi-Instance profile's exact Program shape contains one definition scope. -/
theorem parallelMultiInstanceProfile_has_one_definition_scope (program : Program)
    (profile : program.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId)
    (capabilities : programProfileCapabilitiesValid program = true) :
    program.definitionScopes.length = 1 := by
  rw [programProfileCapabilitiesValid_of_undispatched program (by rw [profile]; decide +kernel)] at capabilities
  simp [programUndispatchedCapabilities, profile, programShape?, parallelMultiInstanceUserTaskProfileId,
    sequentialMultiInstanceUserTaskProfileId, programExactShape] at capabilities
  grind

/-- The Parallel Multi-Instance profile admits no Event-Based Gateway race operation. -/
theorem parallelMultiInstanceProfile_has_no_event_race_operation (program : Program)
    (profile : program.identity.semanticProfile = parallelMultiInstanceUserTaskProfileId)
    (capabilities : programProfileCapabilitiesValid program = true) :
    ∀ operation ∈ program.operations,
      match operation with
      | .awaitEventRace .. => False
      | _ => True := by
  rw [programProfileCapabilitiesValid_of_undispatched program (by rw [profile]; decide +kernel)] at capabilities
  simp [programUndispatchedCapabilities, profile, programShape?, parallelMultiInstanceUserTaskProfileId,
    sequentialMultiInstanceUserTaskProfileId, programExactShape] at capabilities
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

/-- The retained composed data profile admits Property endpoints only; Process ports require their
own approved profile rather than changing this profile's completion guarantee. -/
theorem activityDataInputOutputProfile_property_endpoints (program : Program)
    (profile : program.identity.semanticProfile = activityDataInputOutputUserTaskProfileId)
    (capabilities : programProfileCapabilitiesValid program = true)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (taskId : TaskDefinitionId) (taskName : Option String)
    (directInput : DirectActivityDataInput) (directOutput : DirectActivityDataOutput)
    (member : SemanticOperation.awaitDataInputOutputUserTask id origin input output taskId
      taskName directInput directOutput ∈ program.operations) :
    (∃ propertyId, directInput.source = .property propertyId) ∧
      ∃ propertyId, directOutput.target = .property propertyId := by
  rw [programProfileCapabilitiesValid_of_undispatched program (by rw [profile]; decide +kernel)] at capabilities
  simp [programUndispatchedCapabilities, profile, programShape?, activityDataInputOutputUserTaskProfileId,
    sequentialMultiInstanceUserTaskProfileId, parallelMultiInstanceUserTaskProfileId, programExactShape] at capabilities
  obtain ⟨_, _, capabilities⟩ := capabilities
  have selected := capabilities.2.1.1.1.1.1.1.1.2
  have endpoint := selected _ member
  change ((match directInput.source with | .property _ => true | .processDataInput _ => false) &&
    (match directOutput.target with | .property _ => true | .processDataOutput _ => false)) = true at endpoint
  cases source : directInput.source <;> cases target : directOutput.target <;> simp_all

end BpmnSemantics.SemanticProcess

import BpmnSemantics.SemanticProcess.InternalRegionalCompletionPositionValidity
import BpmnSemantics.SemanticProcess.InternalRegionalContinuationAdmission

/-! # Completion admission and runtime position

Checked graph ownership binds a child continuation to its static parent. The lifecycle account
and declared Call census distinguish the hosting root from a parentless called root before
ordinary or bounded completion changes runtime control.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem programWellFormed_definition_lookup_of_member (program : Program) (definition : DefinitionScope)
    (valid : programWellFormed program = true) (member : definition ∈ program.definitionScopes) :
    (program.definitionScopes.find? fun candidate => decide (candidate.id = definition.id)) = some definition := by
  have unique : (program.definitionScopes.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) DefinitionScopeId.value
      (fun _ _ different same => different (congrArg DefinitionScopeId.value same))
    rw [List.map_map]
    simp only [programWellFormed, Bool.and_eq_true] at valid
    have sorted : strictlySortedStrings (program.definitionScopes.map fun scope => scope.id.value) = true := by grind
    simpa only [List.nodup_iff_pairwise_ne, Function.comp_def] using strictlySortedStrings_nodup _ sorted
  rw [← List.head?_filter, filter_key_eq_singleton_of_nodup program.definitionScopes (·.id) definition unique member]
  rfl

/-- The lifecycle validator rejects a parentless Complete declaration outside the hosting
entry scope, even when the operation identifier and scope declaration are otherwise present. -/
theorem scopeLifecycle_rejects_nonhosting_root_completion (program : Program)
    (entryRoot : DefinitionScopeId) (scope : DefinitionScope)
    (id : OperationId) (origin : BpmnElementOrigin) (output : Option ControlPlaceId)
    (member : scope ∈ program.definitionScopes) (parentless : scope.parentScopeId = none)
    (different : scope.id ≠ entryRoot)
    (completion : .completeScope id origin scope.id output ∈ program.operations) :
    compensationEventSubProcessSnapshotScopeLifecycleWellFormed program entryRoot = false := by
  apply Bool.eq_false_iff.mpr
  intro valid
  exact different (scopeLifecycle_parentless_completion_is_entryRoot program entryRoot scope id origin output
    valid member parentless completion)

/-- Complete's checked static scope and its live runtime parent determine the output's exact
declaration and owner, without a continuation-binding premise. -/
theorem declaredComplete_child_binding (program : Program) (before : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (scopeId : DefinitionScopeId) (output : ControlPlaceId) (root : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (running : before.control = .running instanceId)
    (operation : .completeScope id origin scopeId (some output) ∈ program.operations)
    (member : root ∈ before.scopeOccurrences) (scopeEq : root.id.definitionScopeId = scopeId)
    (parentEq : root.parent = some parent) :
    (∃ declared, program.controlPlaces.filter (fun candidate => decide (candidate.id = output)) = [declared]) ∧
      program.controlPlaceScopes.filter (fun binding => decide (binding.controlPlaceId = output)) =
        [{ controlPlaceId := output, scopeId := parent.definitionScopeId }] := by
  have programValid : programWellFormed program = true := by
    simp only [runtimePositionValid, Bool.and_eq_true] at valid; exact valid.1.1
  obtain ⟨_, declared, _, _, found, outputBinding⟩ := programGraphWellFormed_completion_binding program id origin scopeId
    (some output) (programWellFormed_graph program programValid) operation
  obtain ⟨_, definition, definitionMember, definitionId, parentBinding⟩ :=
    runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId before valid running root member
  have lookup := programWellFormed_definition_lookup_of_member program definition programValid definitionMember
  rw [definitionId, scopeEq] at lookup
  have same := Option.some.inj (lookup.symm.trans found)
  subst declared
  rcases parentBinding with ⟨_, parentless⟩ | ⟨owner, ownerEq, definitionParent, _, _⟩
  · simp [parentless] at parentEq
  · have equal := Option.some.inj (ownerEq.symm.trans parentEq)
    simp only [definitionParent, equal] at outputBinding
    have unique : (program.controlPlaces.map (·.id)).Nodup := by
      apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
        (fun _ _ different same => different (congrArg ControlPlaceId.value same))
      rw [List.map_map]
      exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted program programValid)
    exact programGraphWellFormed_exactPlaceBinding program output parent.definitionScopeId
      (programWellFormed_graph program programValid) unique outputBinding

/-- A declared root Complete names the hosting instance: lifecycle excludes called definitions,
and structural Call validity prevents a called occurrence from borrowing the hosting definition. -/
theorem declaredComplete_hosting_instance (program : Program) (before : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (scopeId : DefinitionScopeId) (root : RuntimeScopeOccurrence)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (running : before.control = .running instanceId)
    (operation : .completeScope id origin scopeId none ∈ program.operations)
    (member : root ∈ before.scopeOccurrences) (scopeEq : root.id.definitionScopeId = scopeId)
    (parentless : root.parent = none) : root.id.processInstanceId = instanceId := by
  have programValid : programWellFormed program = true := by
    simp only [runtimePositionValid, Bool.and_eq_true] at valid; exact valid.1.1
  obtain ⟨entryRoot, declared, hosting, lifecycle, found, _⟩ := programGraphWellFormed_completion_binding program id origin scopeId
    none (programWellFormed_graph program programValid) operation
  obtain ⟨live, definition, definitionMember, definitionId, parentBinding⟩ :=
    runtimePositionValid_scope_parent_binding program expectedInstanceId instanceId before valid running root member
  have definitionParent : definition.parentScopeId = none := by
    rcases parentBinding with ⟨noneParent, _⟩ | ⟨_, someParent, _⟩
    · exact noneParent
    · simp [parentless] at someParent
  have entry : root.id.definitionScopeId = entryRoot := by
    rw [← definitionId]
    exact scopeLifecycle_parentless_completion_is_entryRoot program entryRoot definition id origin none lifecycle
      definitionMember definitionParent (by simpa only [definitionId, scopeEq] using operation)
  rcases flowNodeOccurrenceStructuralProgramValidity_live_owner_binding program before root.id instanceId structural running live
      with nested | hostingInstance | called
  · obtain ⟨occurrence, parent, present, identity, parentEq, _, _⟩ := nested
    have only := filter_key_eq_singleton_of_nodup before.scopeOccurrences (·.id) root
      (runtimePositionValid_scope_ids_nodup program expectedInstanceId instanceId before valid running) member
    have occurrenceIn : occurrence ∈ before.scopeOccurrences.filter (fun candidate => decide (candidate.id = root.id)) :=
      List.mem_filter.mpr ⟨present, decide_eq_true identity⟩
    rw [only] at occurrenceIn
    have same := List.mem_singleton.mp occurrenceIn
    simp [same, parentless] at parentEq
  · exact hostingInstance
  · obtain ⟨record, recordMember, calledRoot⟩ := called
    obtain ⟨invokeId, invokeOrigin, input, process, calledScope, calledEntry, returned,
      invocation, _, _, _, calledScopeEq, _⟩ :=
        flowNodeOccurrenceStructuralProgramValidity_call_declarer program before record structural recordMember
    have paired : callOperationsPaired program = true := by
      simp only [programWellFormed, Bool.and_eq_true] at programValid; grind
    have excluded := callOperationsPaired_calledRoot_ne_entryRoot program entryRoot invokeId invokeOrigin input process
      calledScope calledEntry returned paired hosting invocation
    exact False.elim (excluded (by rw [calledScopeEq, calledRoot, entry]))

/-- Declared ordinary completion preserves position using only checked predecessor facts and
actual success; neither parent continuation ownership nor hosting identity is assumed. -/
theorem declaredComplete_preserves_position (program : Program) (before after : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (running : before.control = .running instanceId)
    (operation : .completeScope id origin scopeId output ∈ program.operations)
    (result : completeScopeState? before scopeId output = some after) :
    runtimePositionValid program expectedInstanceId after = true := by
  cases selected : before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) with
  | nil => simp [completeScopeState?, selected] at result
  | cons root rest =>
      cases rest with
      | cons other tail => simp [completeScopeState?, selected] at result
      | nil =>
          have rootIn : root ∈ before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id.definitionScopeId = scopeId)) := by
            rw [selected]; simp
          obtain ⟨member, scopeEq⟩ := List.mem_filter.mp rootIn
          have scopeEq := of_decide_eq_true scopeEq
          obtain ⟨_, update⟩ := completeScopeState_selected_update before after scopeId output root selected result
          cases parent : root.parent <;> cases output
          · exact completeScopeState_hosting_preserves_position program before after expectedInstanceId instanceId scopeId root
              valid running selected parent
              (declaredComplete_hosting_instance program before expectedInstanceId instanceId id origin scopeId root
                valid structural running operation member scopeEq parent) result
          · simp [parent, running] at update
          · simp [parent, running] at update
          · rename_i owner output
            obtain ⟨declared, binding⟩ := declaredComplete_child_binding program before expectedInstanceId instanceId id origin
              scopeId output root owner valid running operation member scopeEq parent
            exact completeScopeState_child_preserves_position program before after expectedInstanceId instanceId scopeId root owner output
              valid running selected parent declared binding result

/-- Bounded completion preserves the declared completion's position through its actual mandatory
withdrawal, without changing the evaluator's refusal domain. -/
theorem declaredBoundedComplete_preserves_position (program : Program) (before after : RuntimeState)
    (expectedInstanceId instanceId : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (scopeId : DefinitionScopeId) (output : Option ControlPlaceId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program before = true)
    (running : before.control = .running instanceId)
    (operation : .completeScope id origin scopeId output ∈ program.operations)
    (result : completeBoundedScope? program before scopeId output = some after) :
    runtimePositionValid program expectedInstanceId after = true := by
  obtain ⟨ordinary, completed, control, scopes, calls, tokens⟩ := completeBoundedScope_position_fields program before after scopeId output result
  apply runtimePositionValid_tokens_sublist_frame program expectedInstanceId ordinary after
    (declaredComplete_preserves_position program before ordinary expectedInstanceId instanceId id origin scopeId output
      valid structural running operation completed) control scopes calls
  rw [tokens]
  exact List.Sublist.refl _

end BpmnSemantics.SemanticProcess

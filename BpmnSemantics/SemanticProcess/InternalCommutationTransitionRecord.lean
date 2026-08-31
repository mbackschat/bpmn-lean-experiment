import BpmnSemantics.SemanticProcess.TransitionTrace

/-! # Internal commutation transition-record bridge

Proves that one admitted prepared ordinary arm has the exact committed transition record selected by its immutable Program and runtime owner.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace InternalCommutation

/-- A prepared admitted ordinary arm has one actual transition record, stable under prepared frames. -/
theorem internalTransitionRecord_prepared (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (programAdmitted : programWellFormed program = true)
    (prepared : prepareInternalArm? program state operation = some patch) :
    internalTransitionRecord? program state operation = some
      { operationId := patch.operation.id
        operationKind := patch.operation.kind
        origin := patch.operation.origin
        owner := patch.owner } := by
  have operationAndOwner : patch.operation = operation ∧
      selectedOperationOwner? state operation = some patch.owner := by
    cases operation
    case awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
        correlationPropertyId payloadSelector processPropertySelector =>
      simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?,
        selectedOperationOwner?, flowNodeSelectedOperationOwner?]
      obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
      split at prepared
      · simp at prepared
      · obtain ⟨inputOrigin, inputOriginEq, prepared⟩ :=
          Option.bind_eq_some_iff.mp prepared
        cases controlEq : state.control <;> simp_all
        rename_i instanceId selection
        cases filteredEq : state.variables.process.bindings.filter fun candidate =>
            candidate.name = processPropertySelector.propertyId with
        | nil => simp_all
        | cons binding rest =>
          cases rest with
          | cons _ _ => simp_all
          | nil =>
            cases valueEq : binding.value with
            | string value =>
              by_cases empty : value.isEmpty = true
              · simp_all
              · simp_all
                obtain ⟨_, _, _, _, patchEq⟩ := prepared
                exact ⟨rfl, rfl⟩
            | boolean _ => simp_all
            | integer _ => simp_all
            | stringList _ => simp_all
            | null => simp_all
    all_goals
      simp_all [prepareInternalArm?, internalArmInput?, internalArmOrigin?,
        selectedOperationOwner?, flowNodeSelectedOperationOwner?]
    all_goals
      obtain ⟨owner, ownerEq, prepared⟩ := Option.bind_eq_some_iff.mp prepared
      split at prepared <;> try simp at prepared
    all_goals
      obtain ⟨inputOrigin, inputOriginEq, prepared⟩ :=
        Option.bind_eq_some_iff.mp prepared
      cases controlEq : state.control <;> simp_all
    all_goals
      obtain ⟨_, _, _, patchEq⟩ := prepared
      exact ⟨rfl, rfl⟩
  have selectedOwner := operationAndOwner.2
  have operationEq := operationAndOwner.1
  subst operation
  have selection := (prepared_arm_selection_unique program state patch.operation patch prepared).1
  simp only [exactProgramSelection, Bool.and_eq_true] at selection
  have member : patch.operation ∈ program.operations := by
    generalize filteredEq : program.operations.filter
      (fun candidate => decide (candidate = patch.operation)) = filtered at selection
    cases filtered with
    | nil => simp at selection
    | cons candidate rest =>
        cases rest with
        | nil =>
            have candidateMember : candidate ∈ program.operations.filter
                (fun value => decide (value = patch.operation)) := by simp [filteredEq]
            have candidateEq : candidate = patch.operation :=
              of_decide_eq_true (List.mem_filter.mp candidateMember).2
            simpa [candidateEq] using (List.mem_filter.mp candidateMember).1
        | cons other tail => simp at selection
  have idsSorted : strictlySortedStrings
      (program.operations.map fun candidate => candidate.id.value) = true := by
    exact programWellFormed_operationIdsSorted program programAdmitted
  have idsNodup := strictlySortedStrings_nodup _ idsSorted
  have selectedById : program.operations.filter
      (fun candidate => decide (candidate.id = patch.operation.id)) = [patch.operation] :=
    filter_eq_singleton_of_key_nodup program.operations (fun candidate => candidate.id.value)
      (fun candidate => decide (candidate.id = patch.operation.id)) patch.operation idsNodup
      member (by simp) (by
        intro candidate _ accepted
        exact congrArg OperationId.value (of_decide_eq_true accepted))
  exact internalTransitionRecord_of_selection program state patch.operation patch.owner
    selectedById selectedOwner

end InternalCommutation

end BpmnSemantics.SemanticProcess

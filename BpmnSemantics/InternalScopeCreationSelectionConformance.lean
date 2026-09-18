import BpmnSemantics.SemanticProcess.InternalScopeCreationSelection

/-! # Scope-creation selection witnesses

These constructed predecessor states distinguish retained issuance and exact evaluator refinement.
They establish neither source admission nor aggregate validity, preparation frames, or commutation.
-/

namespace BpmnSemantics.InternalScopeCreationSelectionConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

private def root : ScopeOccurrenceId :=
  { processInstanceId := ⟨"instance"⟩, definitionScopeId := ⟨"process"⟩, activation := 1 }

private def before : RuntimeState :=
  { initialState with
    control := .running root.processInstanceId
    scopeOccurrences := [{ id := root, parent := none }]
    tokens := [{ placeId := ⟨"input"⟩, owner := root },
      { placeId := ⟨"untouched"⟩, owner := root }]
    scopeActivations := [{ scopeId := ⟨"child"⟩, count := 9 },
      { scopeId := ⟨"process"⟩, count := 1 }]
    callActivations := [{ elementId := ⟨"call"⟩, count := 9 },
      { elementId := ⟨"other-call"⟩, count := 4 }]
    eventRaceActivations := [{ elementId := ⟨"race"⟩, count := 7 }]
    logicalTimeMs := 42
    endOccurrences := 3 }

private def childOperation : SemanticOperation :=
  .enterScope ⟨"enter"⟩ ⟨⟨"subprocess"⟩⟩ ⟨"input"⟩ ⟨"child-entry"⟩ ⟨"child"⟩

private def callOperation : SemanticOperation :=
  .invokeProcess ⟨"invoke"⟩ ⟨⟨"call"⟩⟩ ⟨"input"⟩ ⟨"callee"⟩
    ⟨"called-root"⟩ ⟨"called-entry"⟩ ⟨"return"⟩

private def selectedChild := selectInternalScopeCreation? before childOperation
private def selectedCall := selectInternalScopeCreation? before callOperation

private def applySelected (state : RuntimeState) (operation : SemanticOperation) :=
  (selectInternalScopeCreation? state operation).map (fun selected => selected.apply state)

theorem child_selection_retains_parent_and_next_high_water_identity :
    selectedChild.isSome = true ∧
      selectedChild.map (·.operation) = some childOperation ∧
      selectedChild.map (·.owner) = some root ∧
      selectedChild.map (·.created) = some
        { id := { root with definitionScopeId := ⟨"child"⟩, activation := 10 },
          parent := some root } := by
  decide +kernel

theorem child_patch_matches_complete_raw_successor :
    applySelected before childOperation =
      enterScopeState? before ⟨"input"⟩ ⟨"child-entry"⟩ ⟨"child"⟩ ∧
      (applySelected before childOperation).map (·.scopeActivations) =
        some [{ scopeId := ⟨"child"⟩, count := 10 }, { scopeId := ⟨"process"⟩, count := 1 }] ∧
      (applySelected before childOperation).map (·.callActivations) = some before.callActivations := by
  decide +kernel

private def calledRoot : ScopeOccurrenceId :=
  { processInstanceId := deriveCalledProcessInstanceId root.processInstanceId ⟨"call"⟩ 10,
    definitionScopeId := ⟨"called-root"⟩, activation := 1 }

private def calledRecord : CalledProcessOccurrence :=
  { id := { processInstanceId := root.processInstanceId, elementId := ⟨"call"⟩, activation := 10 },
    caller := root, calledProcessId := ⟨"callee"⟩, calledRoot, returnOperationId := ⟨"return"⟩ }

theorem call_selection_retains_complete_association_and_next_high_water_identity :
    selectedCall.isSome = true ∧
      selectedCall.map (·.operation) = some callOperation ∧
      selectedCall.map (·.owner) = some root ∧
      selectedCall.map (·.created) = some { id := calledRoot, parent := none } ∧
      selectedCall.map (·.kind) = some (.called calledRecord) := by
  decide +kernel

theorem call_patch_matches_complete_raw_successor :
    applySelected before callOperation =
      invokeProcessState? before ⟨⟨"call"⟩⟩ ⟨"input"⟩ ⟨"callee"⟩
        ⟨"called-root"⟩ ⟨"called-entry"⟩ ⟨"return"⟩ ∧
      (applySelected before callOperation).map (·.callActivations) =
        some [{ elementId := ⟨"call"⟩, count := 10 }, { elementId := ⟨"other-call"⟩, count := 4 }] ∧
      (applySelected before callOperation).map (·.scopeActivations) = some before.scopeActivations := by
  decide +kernel

private def repeatedInput : RuntimeState :=
  { before with tokens := { placeId := ⟨"input"⟩, owner := root } :: before.tokens }

theorem call_refuses_repeated_input_even_with_one_unambiguous_owner :
    onlyTokenOwner? repeatedInput ⟨"input"⟩ = some root ∧
      selectInternalScopeCreation? repeatedInput callOperation = none := by
  decide +kernel

theorem child_entry_consumes_one_unit_without_strengthening_the_raw_selector :
    (selectInternalScopeCreation? repeatedInput childOperation).isSome = true ∧
      applySelected repeatedInput childOperation =
        enterScopeState? repeatedInput ⟨"input"⟩ ⟨"child-entry"⟩ ⟨"child"⟩ ∧
      (applySelected repeatedInput childOperation).map (fun state => tokenMultiplicity state ⟨"input"⟩) =
        some 1 := by
  decide +kernel

private def foreignOwner : ScopeOccurrenceId :=
  { root with processInstanceId := ⟨"foreign"⟩ }

private def mixedOwners : RuntimeState :=
  { before with tokens := { placeId := ⟨"input"⟩, owner := foreignOwner } :: before.tokens }

private def foreignInput : RuntimeState :=
  { before with tokens := [{ placeId := ⟨"input"⟩, owner := foreignOwner }] }

theorem creation_refuses_ambiguous_or_nonhosting_input_ownership :
    selectInternalScopeCreation? mixedOwners childOperation = none ∧
      selectInternalScopeCreation? mixedOwners callOperation = none ∧
      selectInternalScopeCreation? foreignInput childOperation = none ∧
      selectInternalScopeCreation? foreignInput callOperation = none := by
  decide +kernel

theorem child_entry_refuses_an_existing_definition_scope :
    selectInternalScopeCreation?
      { before with scopeOccurrences :=
          { id := { foreignOwner with definitionScopeId := ⟨"child"⟩ }, parent := none } ::
            before.scopeOccurrences } childOperation = none := by
  decide +kernel

theorem call_refuses_aliased_caller_roots_before_matching_parent_metadata :
    selectInternalScopeCreation?
      { before with scopeOccurrences :=
          { id := root, parent := some foreignOwner } :: before.scopeOccurrences } callOperation = none := by
  decide +kernel

theorem creation_requires_running_control :
    selectInternalScopeCreation? { before with control := .completed root.processInstanceId }
      childOperation = none ∧
      selectInternalScopeCreation? { before with control := .completed root.processInstanceId }
        callOperation = none := by
  decide +kernel

end BpmnSemantics.InternalScopeCreationSelectionConformance

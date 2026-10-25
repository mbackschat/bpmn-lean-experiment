import BpmnSemantics.SemanticProcess.InternalScopeCreationSelection

/-! # Scope-creation selection witnesses

These constructed predecessor states distinguish retained issuance and exact evaluator refinement.
They establish neither source admission nor aggregate validity, preparation frames, or commutation.
-/

namespace BpmnSemantics.InternalScopeCreationSelectionConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

def root : ScopeOccurrenceId :=
  { processInstanceId := ⟨"instance"⟩, definitionScopeId := ⟨"process"⟩, activation := 1 }

def before : RuntimeState :=
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

def childOperation : SemanticOperation :=
  .enterScope ⟨"enter"⟩ ⟨⟨"subprocess"⟩⟩ ⟨"input"⟩ ⟨"child-entry"⟩ ⟨"child"⟩

def callOperation : SemanticOperation :=
  .invokeProcess ⟨"invoke"⟩ ⟨⟨"call"⟩⟩ ⟨"input"⟩ ⟨"callee"⟩
    ⟨"called-root"⟩ ⟨"called-entry"⟩ ⟨"return"⟩

def selectedChild := selectInternalScopeCreation? before childOperation
def selectedCall := selectInternalScopeCreation? before callOperation

def applySelected (state : RuntimeState) (operation : SemanticOperation) :=
  (selectInternalScopeCreation? state operation).map (fun selected => selected.apply state)

def child_selection_retains_parent_and_next_high_water_identity : Bool := decide <|
    selectedChild.isSome = true ∧
      selectedChild.map (·.operation) = some childOperation ∧
      selectedChild.map (·.owner) = some root ∧
      selectedChild.map (·.created) = some
        { id := { root with definitionScopeId := ⟨"child"⟩, activation := 10 },
          parent := some root }

def child_patch_matches_complete_raw_successor : Bool := decide <|
    applySelected before childOperation =
      enterScopeState? before ⟨"input"⟩ ⟨"child-entry"⟩ ⟨"child"⟩ ∧
      (applySelected before childOperation).map (·.scopeActivations) =
        some [{ scopeId := ⟨"child"⟩, count := 10 }, { scopeId := ⟨"process"⟩, count := 1 }] ∧
      (applySelected before childOperation).map (·.callActivations) = some before.callActivations

def calledRoot : ScopeOccurrenceId :=
  { processInstanceId := deriveCalledProcessInstanceId root.processInstanceId ⟨"call"⟩ 10,
    definitionScopeId := ⟨"called-root"⟩, activation := 1 }

def calledRecord : CalledProcessOccurrence :=
  { id := { processInstanceId := root.processInstanceId, elementId := ⟨"call"⟩, activation := 10 },
    caller := root, calledProcessId := ⟨"callee"⟩, calledRoot, returnOperationId := ⟨"return"⟩ }

def call_selection_retains_complete_association_and_next_high_water_identity : Bool := decide <|
    selectedCall.isSome = true ∧
      selectedCall.map (·.operation) = some callOperation ∧
      selectedCall.map (·.owner) = some root ∧
      selectedCall.map (·.created) = some { id := calledRoot, parent := none } ∧
      selectedCall.map (·.kind) = some (.called calledRecord)

def call_patch_matches_complete_raw_successor : Bool := decide <|
    applySelected before callOperation =
      invokeProcessState? before ⟨⟨"call"⟩⟩ ⟨"input"⟩ ⟨"callee"⟩
        ⟨"called-root"⟩ ⟨"called-entry"⟩ ⟨"return"⟩ ∧
      (applySelected before callOperation).map (·.callActivations) =
        some [{ elementId := ⟨"call"⟩, count := 10 }, { elementId := ⟨"other-call"⟩, count := 4 }] ∧
      (applySelected before callOperation).map (·.scopeActivations) = some before.scopeActivations

def repeatedInput : RuntimeState :=
  { before with tokens := { placeId := ⟨"input"⟩, owner := root } :: before.tokens }

def call_refuses_repeated_input_even_with_one_unambiguous_owner : Bool := decide <|
    onlyTokenOwner? repeatedInput ⟨"input"⟩ = some root ∧
      selectInternalScopeCreation? repeatedInput callOperation = none

def child_entry_consumes_one_unit_without_strengthening_the_raw_selector : Bool := decide <|
    (selectInternalScopeCreation? repeatedInput childOperation).isSome = true ∧
      applySelected repeatedInput childOperation =
        enterScopeState? repeatedInput ⟨"input"⟩ ⟨"child-entry"⟩ ⟨"child"⟩ ∧
      (applySelected repeatedInput childOperation).map (fun state => tokenMultiplicity state ⟨"input"⟩) =
        some 1

def foreignOwner : ScopeOccurrenceId :=
  { root with processInstanceId := ⟨"foreign"⟩ }

def mixedOwners : RuntimeState :=
  { before with tokens := { placeId := ⟨"input"⟩, owner := foreignOwner } :: before.tokens }

def foreignInput : RuntimeState :=
  { before with tokens := [{ placeId := ⟨"input"⟩, owner := foreignOwner }] }

/-- "Nonhosting" names an owner in an instance that is neither the hosting instance nor a live called one: no call
record reaches `foreign`. A caller in a live called instance is admitted since repeated, nested and concurrent Calls,
so this refusal witnesses unreachability, not a hosting-only caller. -/
def creation_refuses_ambiguous_or_nonhosting_input_ownership : Bool := decide <|
    selectInternalScopeCreation? mixedOwners childOperation = none ∧
      selectInternalScopeCreation? mixedOwners callOperation = none ∧
      selectInternalScopeCreation? foreignInput childOperation = none ∧
      selectInternalScopeCreation? foreignInput callOperation = none

def child_entry_refuses_an_existing_definition_scope : Bool := decide <|
    selectInternalScopeCreation?
      { before with scopeOccurrences :=
          { id := { foreignOwner with definitionScopeId := ⟨"child"⟩ }, parent := none } ::
            before.scopeOccurrences } childOperation = none

def call_refuses_aliased_caller_roots_before_matching_parent_metadata : Bool := decide <|
    selectInternalScopeCreation?
      { before with scopeOccurrences :=
          { id := root, parent := some foreignOwner } :: before.scopeOccurrences } callOperation = none

def creation_requires_running_control : Bool := decide <|
    selectInternalScopeCreation? { before with control := .completed root.processInstanceId }
      childOperation = none ∧
      selectInternalScopeCreation? { before with control := .completed root.processInstanceId }
        callOperation = none

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("child_selection_retains_parent_and_next_high_water_identity", child_selection_retains_parent_and_next_high_water_identity),
  ("child_patch_matches_complete_raw_successor", child_patch_matches_complete_raw_successor),
  ("call_selection_retains_complete_association_and_next_high_water_identity", call_selection_retains_complete_association_and_next_high_water_identity),
  ("call_patch_matches_complete_raw_successor", call_patch_matches_complete_raw_successor),
  ("call_refuses_repeated_input_even_with_one_unambiguous_owner", call_refuses_repeated_input_even_with_one_unambiguous_owner),
  ("child_entry_consumes_one_unit_without_strengthening_the_raw_selector", child_entry_consumes_one_unit_without_strengthening_the_raw_selector),
  ("creation_refuses_ambiguous_or_nonhosting_input_ownership", creation_refuses_ambiguous_or_nonhosting_input_ownership),
  ("child_entry_refuses_an_existing_definition_scope", child_entry_refuses_an_existing_definition_scope),
  ("call_refuses_aliased_caller_roots_before_matching_parent_metadata", call_refuses_aliased_caller_roots_before_matching_parent_metadata),
  ("creation_requires_running_control", creation_requires_running_control)
]

end BpmnSemantics.InternalScopeCreationSelectionConformance

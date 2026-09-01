import BpmnSemantics.CompensationEventSubProcessSnapshotAdmissionConformance
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshot
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Compensation Event Sub-Process snapshot runtime checkpoint

Kernel-decided fixtures for the approved hidden parent-context snapshot lifecycle. Transition integration, source admission, handler execution, Temporal hosting, and public projection remain outside this pure runtime checkpoint.
-/

namespace BpmnSemantics.CompensationEventSubProcessSnapshotConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def instanceId : SemanticId :=
  ⟨"snapshot-instance"⟩

def rootOccurrence : RuntimeScopeOccurrence :=
  { id :=
      { processInstanceId := instanceId
        definitionScopeId := SubProcessBoundaryTimerConformance.rootScopeId
        activation := 1 }
    parent := none }

def childOccurrence : RuntimeScopeOccurrence :=
  { id :=
      { processInstanceId := instanceId
        definitionScopeId := SubProcessBoundaryTimerConformance.childScopeId
        activation := 1 }
    parent := some rootOccurrence.id }

def childEntryState : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [rootOccurrence]
    scopeActivations :=
      [{ scopeId := rootOccurrence.id.definitionScopeId, count := 1 }] }

def reservedChildState : RuntimeState :=
  { childEntryState with
    compensationParentContextRetentions :=
      [.provisional childOccurrence
        CompensationEventSubProcessSnapshotAdmissionConformance.handlerScopeId] }

/-- Reservation happens before child entry and changes only the hidden collection. -/
theorem child_reservation_is_atomic :
    reserveCompensationParentContext
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        childEntryState childOccurrence = .applied reservedChildState := by
  decide +kernel

def contextBindings : List VariableBinding :=
  [{ name := "context", value := .string "Aé\"\n" }]

def childRunningState : RuntimeState :=
  { reservedChildState with
    scopeOccurrences := [rootOccurrence, childOccurrence]
    scopeActivations :=
      [ { scopeId := rootOccurrence.id.definitionScopeId, count := 1 }
      , { scopeId := childOccurrence.id.definitionScopeId, count := 1 } ]
    variables :=
      { emptyScopedVariables with
        process := { bindings := contextBindings } } }

def childSnapshot : CompensationParentContextSnapshot :=
  { frames :=
      [ { owner := rootOccurrence.id, bindings := contextBindings }
      , { owner := childOccurrence.id, bindings := [] } ] }

def promotedChildState : RuntimeState :=
  { childRunningState with
    compensationParentContextRetentions :=
      [.promoted childOccurrence
        CompensationEventSubProcessSnapshotAdmissionConformance.handlerScopeId
        childSnapshot] }

def settledChildState : RuntimeState :=
  { promotedChildState with
    scopeOccurrences := [rootOccurrence]
    scopeActivations :=
      [{ scopeId := rootOccurrence.id.definitionScopeId, count := 1 }] }

theorem running_lifecycle_requires_one_provisional_per_live_selected_parent :
    compensationEventSubProcessSnapshotStateValid
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        childEntryState = true ∧
      compensationEventSubProcessSnapshotStateValid
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        childRunningState = true ∧
      compensationEventSubProcessSnapshotStateValid
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        { childRunningState with compensationParentContextRetentions := [] } = false := by
  decide +kernel

theorem successful_promotion_captures_exact_root_to_parent_frames :
    promoteCompensationParentContext
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        childRunningState childOccurrence = .applied promotedChildState := by
  decide +kernel

theorem promotion_and_scope_removal_form_one_valid_lifecycle_step :
    compensationEventSubProcessSnapshotStateValid
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        promotedChildState = false ∧
      compensationEventSubProcessSnapshotStateValid
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        settledChildState = true := by
  decide +kernel

theorem unsuccessful_parent_purge_removes_only_provisional_records :
    purgeCompensationParentContextForParent reservedChildState childOccurrence =
        childEntryState ∧
      purgeCompensationParentContextForParent promotedChildState childOccurrence =
        promotedChildState := by
  decide +kernel

def secondChildOccurrence : RuntimeScopeOccurrence :=
  { childOccurrence with id := { childOccurrence.id with activation := 2 } }

def secondChildRunningState : RuntimeState :=
  { childRunningState with
    scopeOccurrences := [rootOccurrence, secondChildOccurrence]
    compensationParentContextRetentions :=
      [.provisional secondChildOccurrence
        CompensationEventSubProcessSnapshotAdmissionConformance.handlerScopeId] }

def twoReservedState : RuntimeState :=
  { secondChildRunningState with
    compensationParentContextRetentions :=
      [ .provisional childOccurrence
          CompensationEventSubProcessSnapshotAdmissionConformance.handlerScopeId
      , .provisional secondChildOccurrence
          CompensationEventSubProcessSnapshotAdmissionConformance.handlerScopeId ] }

theorem reservations_sort_by_complete_occurrence_identity :
    reserveCompensationParentContext
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        secondChildRunningState childOccurrence = .applied twoReservedState := by
  decide +kernel

def twoLiveReservedState : RuntimeState :=
  { twoReservedState with
    scopeOccurrences := [rootOccurrence, childOccurrence, secondChildOccurrence] }

def reversedRetentionState : RuntimeState :=
  { twoLiveReservedState with
    compensationParentContextRetentions :=
      twoLiveReservedState.compensationParentContextRetentions.reverse }

theorem validation_rejects_noncanonical_order_and_duplicate_keys :
    compensationEventSubProcessSnapshotStateValid
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        twoLiveReservedState = true ∧
      compensationEventSubProcessSnapshotStateValid
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        reversedRetentionState = false ∧
      compensationEventSubProcessSnapshotStateValid
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        { childRunningState with
          compensationParentContextRetentions :=
            childRunningState.compensationParentContextRetentions ++
              childRunningState.compensationParentContextRetentions } = false := by
  decide +kernel

def programWithLimits (maxRecords maxCanonicalBytes : Nat) : Program :=
  { CompensationEventSubProcessSnapshotAdmissionConformance.program with
    compensationEventSubProcessSnapshots := some
      { CompensationEventSubProcessSnapshotAdmissionConformance.declaration with
        maxRecords
        maxCanonicalBytes } }

def reservedCanonicalBytes : Nat :=
  canonicalCompensationParentContextRetentionsUtf8Bytes
    reservedChildState.compensationParentContextRetentions

def promotedCanonicalBytes : Nat :=
  canonicalCompensationParentContextRetentionsUtf8Bytes
    promotedChildState.compensationParentContextRetentions

theorem canonical_measure_matches_the_independent_cross_target_bytes :
    reservedCanonicalBytes = 298 ∧ promotedCanonicalBytes = 637 := by
  decide +kernel

theorem reservation_capacity_accepts_exact_fit_and_refuses_one_over_atomically :
    reserveCompensationParentContext (programWithLimits 1 reservedCanonicalBytes)
        childEntryState childOccurrence = .applied reservedChildState ∧
      reserveCompensationParentContext (programWithLimits 1 (reservedCanonicalBytes - 1))
        childEntryState childOccurrence =
          .refused (.capacity .canonicalBytes (reservedCanonicalBytes - 1)
            reservedCanonicalBytes) childEntryState ∧
      reserveCompensationParentContext (programWithLimits 1 4096)
        secondChildRunningState childOccurrence =
          .refused (.capacity .records 1 2) secondChildRunningState := by
  decide +kernel

theorem promotion_capacity_measures_the_complete_escaped_snapshot :
    promoteCompensationParentContext (programWithLimits 2 promotedCanonicalBytes)
        childRunningState childOccurrence = .applied promotedChildState ∧
      promoteCompensationParentContext (programWithLimits 2 (promotedCanonicalBytes - 1))
        childRunningState childOccurrence =
          .refused (.capacity .canonicalBytes (promotedCanonicalBytes - 1)
            promotedCanonicalBytes) childRunningState := by
  decide +kernel

def malformedContextState : RuntimeState :=
  { childRunningState with
    variables :=
      { emptyScopedVariables with
        process :=
          { bindings :=
              [{ name := "duplicate", value := .string "first" },
               { name := "duplicate", value := .string "second" }] } } }

theorem every_refusal_preserves_the_exact_submitted_state :
    promoteCompensationParentContext
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        malformedContextState childOccurrence =
          .refused .incompleteContext malformedContextState ∧
      promoteCompensationParentContext
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        { childRunningState with compensationParentContextRetentions := [] }
        childOccurrence =
          .refused .invalidState
            { childRunningState with compensationParentContextRetentions := [] } := by
  decide +kernel

def undeclaredParent : RuntimeScopeOccurrence :=
  { childOccurrence with
    id := { childOccurrence.id with definitionScopeId := ⟨"scope:Undeclared"⟩ } }

theorem an_undeclared_parent_is_disabled_without_mutation :
    reserveCompensationParentContext
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        initialState undeclaredParent = .disabled initialState := by
  decide +kernel

def rootHandlerScopeId : DefinitionScopeId :=
  ⟨"scope:RootSnapshotHandler"⟩

def rootProgram : Program :=
  { SubProcessBoundaryTimerConformance.program with
    definitionScopes :=
      SubProcessBoundaryTimerConformance.program.definitionScopes ++
        [{ id := rootHandlerScopeId
           parentScopeId := some SubProcessBoundaryTimerConformance.rootScopeId
           originElementId := ⟨"RootSnapshotHandler"⟩ }]
    compensationEventSubProcessSnapshots := some
      { targets :=
          [{ parentScopeId := SubProcessBoundaryTimerConformance.rootScopeId
             handlerScopeId := rootHandlerScopeId }]
        maxRecords := 2
        maxCanonicalBytes := 4096 } }

def rootProvisionalState : RuntimeState :=
  { childEntryState with
    compensationParentContextRetentions :=
      [.provisional rootOccurrence rootHandlerScopeId]
    variables :=
      { emptyScopedVariables with
        process := { bindings := [{ name := "root", value := .string "done" }] } } }

def rootSnapshot : CompensationParentContextSnapshot :=
  { frames :=
      [{ owner := rootOccurrence.id
         bindings := [{ name := "root", value := .string "done" }] }] }

def rootPromotedState : RuntimeState :=
  { rootProvisionalState with
    compensationParentContextRetentions :=
      [.promoted rootOccurrence rootHandlerScopeId rootSnapshot] }

def terminalRootState : RuntimeState :=
  { rootPromotedState with
    control := .completed instanceId
    scopeOccurrences := []
    scopeActivations := [] }

theorem selected_root_completion_retains_exactly_one_promoted_root :
    compensationEventSubProcessSnapshotDeclarationValid rootProgram = true ∧
      compensationEventSubProcessSnapshotStateValid rootProgram rootProvisionalState = true ∧
      promoteCompensationParentContext rootProgram rootProvisionalState rootOccurrence =
        .applied rootPromotedState ∧
      compensationEventSubProcessSnapshotStateValid rootProgram terminalRootState = true ∧
      compensationEventSubProcessSnapshotStateValid rootProgram
        { terminalRootState with compensationParentContextRetentions := [] } = false := by
  decide +kernel

theorem root_purge_disposition_is_closed_and_exact :
    purgeCompensationParentContextForRoot terminalRootState rootOccurrence
        .retainPromoted = terminalRootState ∧
      (purgeCompensationParentContextForRoot terminalRootState rootOccurrence
        .discard).compensationParentContextRetentions = [] ∧
      (purgeCompensationParentContextForRoot rootProvisionalState rootOccurrence
        .retainPromoted).compensationParentContextRetentions = [] := by
  decide +kernel

def terminalChildOrphan : RuntimeState :=
  { settledChildState with
    control := .completed instanceId
    scopeOccurrences := []
    scopeActivations := [] }

theorem terminal_child_snapshots_require_their_promoted_root_owner :
    compensationEventSubProcessSnapshotStateValid
      CompensationEventSubProcessSnapshotAdmissionConformance.program
      terminalChildOrphan = false := by
  decide +kernel

def missingLiveReservationState : RuntimeState :=
  { childRunningState with compensationParentContextRetentions := [] }

/-- Aggregate runtime admission consumes the snapshot lifecycle instead of leaving it advisory. -/
theorem aggregate_runtime_admission_rejects_a_missing_live_reservation :
    runtimeStateWellFormed
      CompensationEventSubProcessSnapshotAdmissionConformance.program
      instanceId missingLiveReservationState = false := by
  decide +kernel

end BpmnSemantics.CompensationEventSubProcessSnapshotConformance

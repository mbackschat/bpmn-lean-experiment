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
def child_reservation_is_atomic : Bool := decide <|
    reserveCompensationParentContext
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        childEntryState childOccurrence = .applied reservedChildState

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

def running_lifecycle_requires_one_provisional_per_live_selected_parent : Bool := decide <|
    compensationEventSubProcessSnapshotStateValid
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        childEntryState = true ∧
      compensationEventSubProcessSnapshotStateValid
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        childRunningState = true ∧
      compensationEventSubProcessSnapshotStateValid
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        { childRunningState with compensationParentContextRetentions := [] } = false

def successful_promotion_captures_exact_root_to_parent_frames : Bool := decide <|
    promoteCompensationParentContext
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        childRunningState childOccurrence = .applied promotedChildState

def promotion_and_scope_removal_form_one_valid_lifecycle_step : Bool := decide <|
    compensationEventSubProcessSnapshotStateValid
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        promotedChildState = false ∧
      compensationEventSubProcessSnapshotStateValid
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        settledChildState = true

def unsuccessful_parent_purge_removes_only_provisional_records : Bool := decide <|
    purgeCompensationParentContextForParent reservedChildState childOccurrence =
        childEntryState ∧
      purgeCompensationParentContextForParent promotedChildState childOccurrence =
        promotedChildState

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

def reservations_sort_by_complete_occurrence_identity : Bool := decide <|
    reserveCompensationParentContext
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        secondChildRunningState childOccurrence = .applied twoReservedState

def twoLiveReservedState : RuntimeState :=
  { twoReservedState with
    scopeOccurrences := [rootOccurrence, childOccurrence, secondChildOccurrence] }

def reversedRetentionState : RuntimeState :=
  { twoLiveReservedState with
    compensationParentContextRetentions :=
      twoLiveReservedState.compensationParentContextRetentions.reverse }

def validation_rejects_noncanonical_order_and_duplicate_keys : Bool := decide <|
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
              childRunningState.compensationParentContextRetentions } = false

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

def canonical_measure_matches_the_independent_cross_target_bytes : Bool := decide <|
    reservedCanonicalBytes = 298 ∧ promotedCanonicalBytes = 637

def reservation_capacity_accepts_exact_fit_and_refuses_one_over_atomically : Bool := decide <|
    reserveCompensationParentContext (programWithLimits 1 reservedCanonicalBytes)
        childEntryState childOccurrence = .applied reservedChildState ∧
      reserveCompensationParentContext (programWithLimits 1 (reservedCanonicalBytes - 1))
        childEntryState childOccurrence =
          .refused (.capacity .canonicalBytes (reservedCanonicalBytes - 1)
            reservedCanonicalBytes) childEntryState ∧
      reserveCompensationParentContext (programWithLimits 1 4096)
        secondChildRunningState childOccurrence =
          .refused (.capacity .records 1 2) secondChildRunningState

def promotion_capacity_measures_the_complete_escaped_snapshot : Bool := decide <|
    promoteCompensationParentContext (programWithLimits 2 promotedCanonicalBytes)
        childRunningState childOccurrence = .applied promotedChildState ∧
      promoteCompensationParentContext (programWithLimits 2 (promotedCanonicalBytes - 1))
        childRunningState childOccurrence =
          .refused (.capacity .canonicalBytes (promotedCanonicalBytes - 1)
            promotedCanonicalBytes) childRunningState

def malformedContextState : RuntimeState :=
  { childRunningState with
    variables :=
      { emptyScopedVariables with
        process :=
          { bindings :=
              [{ name := "duplicate", value := .string "first" },
               { name := "duplicate", value := .string "second" }] } } }

def every_refusal_preserves_the_exact_submitted_state : Bool := decide <|
    promoteCompensationParentContext
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        malformedContextState childOccurrence =
          .refused .incompleteContext malformedContextState ∧
      promoteCompensationParentContext
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        { childRunningState with compensationParentContextRetentions := [] }
        childOccurrence =
          .refused .invalidState
            { childRunningState with compensationParentContextRetentions := [] }

def undeclaredParent : RuntimeScopeOccurrence :=
  { childOccurrence with
    id := { childOccurrence.id with definitionScopeId := ⟨"scope:Undeclared"⟩ } }

def an_undeclared_parent_is_disabled_without_mutation : Bool := decide <|
    reserveCompensationParentContext
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        initialState undeclaredParent = .disabled initialState

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

def selected_root_completion_retains_exactly_one_promoted_root : Bool := decide <|
    compensationEventSubProcessSnapshotDeclarationValid rootProgram = true ∧
      compensationEventSubProcessSnapshotStateValid rootProgram rootProvisionalState = true ∧
      promoteCompensationParentContext rootProgram rootProvisionalState rootOccurrence =
        .applied rootPromotedState ∧
      compensationEventSubProcessSnapshotStateValid rootProgram terminalRootState = true ∧
      compensationEventSubProcessSnapshotStateValid rootProgram
        { terminalRootState with compensationParentContextRetentions := [] } = false

def root_purge_disposition_is_closed_and_exact : Bool := decide <|
    purgeCompensationParentContextForRoot terminalRootState rootOccurrence
        .retainPromoted = terminalRootState ∧
      (purgeCompensationParentContextForRoot terminalRootState rootOccurrence
        .discard).compensationParentContextRetentions = [] ∧
      (purgeCompensationParentContextForRoot rootProvisionalState rootOccurrence
        .retainPromoted).compensationParentContextRetentions = []

def terminalChildOrphan : RuntimeState :=
  { settledChildState with
    control := .completed instanceId
    scopeOccurrences := []
    scopeActivations := [] }

def terminal_child_snapshots_require_their_promoted_root_owner : Bool := decide <|
    compensationEventSubProcessSnapshotStateValid
      CompensationEventSubProcessSnapshotAdmissionConformance.program
      terminalChildOrphan = false

def missingLiveReservationState : RuntimeState :=
  { childRunningState with compensationParentContextRetentions := [] }

/-- Aggregate runtime admission consumes the snapshot lifecycle instead of leaving it advisory. -/
def aggregate_runtime_admission_rejects_a_missing_live_reservation : Bool := decide <|
    runtimeStateWellFormed
      CompensationEventSubProcessSnapshotAdmissionConformance.program
      instanceId missingLiveReservationState = false

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("child_reservation_is_atomic", child_reservation_is_atomic),
  ("running_lifecycle_requires_one_provisional_per_live_selected_parent", running_lifecycle_requires_one_provisional_per_live_selected_parent),
  ("successful_promotion_captures_exact_root_to_parent_frames", successful_promotion_captures_exact_root_to_parent_frames),
  ("promotion_and_scope_removal_form_one_valid_lifecycle_step", promotion_and_scope_removal_form_one_valid_lifecycle_step),
  ("unsuccessful_parent_purge_removes_only_provisional_records", unsuccessful_parent_purge_removes_only_provisional_records),
  ("reservations_sort_by_complete_occurrence_identity", reservations_sort_by_complete_occurrence_identity),
  ("validation_rejects_noncanonical_order_and_duplicate_keys", validation_rejects_noncanonical_order_and_duplicate_keys),
  ("canonical_measure_matches_the_independent_cross_target_bytes", canonical_measure_matches_the_independent_cross_target_bytes),
  ("reservation_capacity_accepts_exact_fit_and_refuses_one_over_atomically", reservation_capacity_accepts_exact_fit_and_refuses_one_over_atomically),
  ("promotion_capacity_measures_the_complete_escaped_snapshot", promotion_capacity_measures_the_complete_escaped_snapshot),
  ("every_refusal_preserves_the_exact_submitted_state", every_refusal_preserves_the_exact_submitted_state),
  ("an_undeclared_parent_is_disabled_without_mutation", an_undeclared_parent_is_disabled_without_mutation),
  ("selected_root_completion_retains_exactly_one_promoted_root", selected_root_completion_retains_exactly_one_promoted_root),
  ("root_purge_disposition_is_closed_and_exact", root_purge_disposition_is_closed_and_exact),
  ("terminal_child_snapshots_require_their_promoted_root_owner", terminal_child_snapshots_require_their_promoted_root_owner),
  ("aggregate_runtime_admission_rejects_a_missing_live_reservation", aggregate_runtime_admission_rejects_a_missing_live_reservation)
]

end BpmnSemantics.CompensationEventSubProcessSnapshotConformance

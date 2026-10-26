module

import BpmnSemantics.ActivityBoundaryTimerConformance
import BpmnSemantics.SemanticProcess.InternalTransitionCanonicalBatchPublication
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
public import BpmnSemantics.SemanticProcess.InternalRegionalLocalControlPairPublication
public import BpmnSemantics.SemanticProcess.Scenario
public import BpmnSemantics.ActivityBoundaryTimerFixtures
public import BpmnSemantics.SemanticProcess.ParallelMultiInstancePreservation
import BpmnSemantics.SemanticProcess.InternalRegionalArmingFrames

/-! A deadline-bound review runs beside an independent review and a standalone Timer.
These constructed Program frontiers bind both Timer-task variants to finite batching;
they establish no additional checked-source or registered-profile reachability. -/

@[expose] public section

namespace BpmnSemantics.InternalTimerTaskBatchConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

def instanceId : SemanticId := ⟨"deadline-review-1"⟩
def processId : ProcessId := ActivityBoundaryTimerConformance.program.processId
def owner : ScopeOccurrenceId := rootScopeOccurrenceId instanceId processId

def task (kind : InternalTimerTaskKind) : InternalTimerTaskContract :=
  { kind, operationId := ⟨"operation:BoundedTask"⟩, origin := { elementId := ⟨"BoundedTask"⟩ },
    input := ⟨"place:Flow_Start"⟩,
    task := { id := ⟨"BoundedTask"⟩, name := some "Bounded work", output := ⟨"place:Flow_Normal"⟩ },
    timer := {
      elementId := ⟨"Deadline"⟩, durationMs := 1000,
      output := ⟨"place:Flow_Boundary"⟩,
      origin := { elementId := ⟨"Flow_Boundary"⟩ } } }

def ordinary : SemanticOperation :=
  .awaitUserTask ⟨"operation:IndependentReview"⟩ { elementId := ⟨"IndependentReview"⟩ }
    ⟨"place:Flow_Independent"⟩ ⟨"place:Flow_Independent_End"⟩
    { id := ⟨"IndependentReview"⟩, name := some "Independent review" }

def timer : SemanticOperation :=
  .awaitTimer ⟨"operation:Reminder"⟩ { elementId := ⟨"Reminder"⟩ }
    ⟨"place:Flow_Reminder"⟩ ⟨"place:Flow_Reminder_End"⟩
    { elementId := ⟨"Reminder"⟩, durationMs := 1000 }

def frontier (kind : InternalTimerTaskKind) : List SemanticOperation :=
  [(task kind).operation, ordinary, timer]

def program (kind : InternalTimerTaskKind) : Program :=
  let base := ActivityBoundaryTimerConformance.program
  let places := BpmnSemantics.SemanticProcess.sortBy (fun left right : ControlPlace => decide (left.id.value < right.id.value))
    (base.controlPlaces ++ ["Flow_Entry", "Flow_Independent", "Flow_Independent_End",
      "Flow_Reminder", "Flow_Reminder_End"].map fun name =>
        { id := ⟨"place:" ++ name⟩, origin := { elementId := ⟨name⟩ } })
  let operations := BpmnSemantics.SemanticProcess.sortBy (fun left right : SemanticOperation => decide (left.id.value < right.id.value))
    ((base.operations.map fun operation => match operation with
      | .awaitBoundedUserTask .. => (task kind).operation
      | .initiate id origin _ => .initiate id origin ⟨"place:Flow_Entry"⟩
      | other => other) ++
      [ .duplicate ⟨"operation:ForkReview"⟩ { elementId := ⟨"ForkReview"⟩ } ⟨"place:Flow_Entry"⟩
          [⟨"place:Flow_Independent"⟩, ⟨"place:Flow_Reminder"⟩, ⟨"place:Flow_Start"⟩]
      , .reachNoneEnd ⟨"operation:IndependentEnd"⟩ { elementId := ⟨"IndependentEnd"⟩ }
          ⟨"place:Flow_Independent_End"⟩
      , .reachNoneEnd ⟨"operation:ReminderEnd"⟩ { elementId := ⟨"ReminderEnd"⟩ }
          ⟨"place:Flow_Reminder_End"⟩
      , ordinary, timer ])
  { base with
    identity := { base.identity with semanticProfile := match kind with
      | .interrupting => ⟨"bpmn-2.0.2-activity-boundary-timer-draft"⟩
      | .nonInterrupting => ⟨"bpmn-2.0.2-non-interrupting-boundary-timer-draft"⟩ }
    controlPlaces := places
    controlPlaceScopes := places.map fun place =>
      { controlPlaceId := place.id, scopeId := rootDefinitionScopeId processId }
    operations
    operationScopes := operations.map fun operation =>
      { operationId := operation.id, scopeId := rootDefinitionScopeId processId } }

instance (kind : InternalTimerTaskKind) : InterruptionInvocationsRooted (program kind) :=
  .of_check (program kind) (by cases kind <;> decide +kernel)

def ready : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := owner, parent := none }]
    scopeActivations := [{ scopeId := rootDefinitionScopeId processId, count := 1 }]
    tokens := ["place:Flow_Independent", "place:Flow_Reminder", "place:Flow_Start"].map fun place =>
      { placeId := ⟨place⟩, owner }
    activations := [{ taskId := ⟨"BoundedTask"⟩, count := 2 }]
    timerActivations := [{ elementId := ⟨"Deadline"⟩, count := 5 }]
    activityActivations := [{ taskId := ⟨"BoundedTask"⟩, count := 7 }]
    logicalTimeMs := 321 }

def prepared (kind : InternalTimerTaskKind) : List PreparedInternalTransition :=
  (prepareInternalTransitionBatch? (program kind) ready (frontier kind)).getD []

theorem complete_predecessor_frontier (kind : InternalTimerTaskKind) :
    programWellFormed (program kind) = true ∧
      runtimeStateWellFormed (program kind) instanceId ready = true ∧
      (projectOpenFlowNodeOccurrences? (program kind) ready).isSome = true ∧
      prepareInternalTransitionBatch? (program kind) ready (frontier kind) = some (prepared kind) ∧
      (prepared kind).length = 3 := by
  cases kind <;> decide +kernel

theorem every_permutation_has_one_accepted_publication (kind : InternalTimerTaskKind)
    (reordered : List PreparedInternalTransition) (permutation : (prepared kind).Perm reordered) :
    ∃ final publications,
      acceptedPreparedTransitionBatch? (program kind) instanceId ⟨"review"⟩ 19 ready (prepared kind) =
        some (final, publications) ∧
      acceptedPreparedTransitionBatch? (program kind) instanceId ⟨"review"⟩ 19 ready reordered =
        some (final, publications) ∧
      runtimeStateWellFormed (program kind) instanceId final = true ∧
      (projectOpenFlowNodeOccurrences? (program kind) final).isSome = true := by
  have facts := complete_predecessor_frontier kind
  have selected := prepareInternalTransitionBatch_sound (program kind) ready (frontier kind) (prepared kind)
    facts.2.2.2.1
  obtain ⟨final, publications, first, second, _, _, _, _, _, _, valid, _, opened⟩ :=
    prepared_transition_canonical_batch_publication_perm (program kind) ready (prepared kind) reordered
      instanceId ⟨"review"⟩ 19 facts.1 facts.2.1 rfl facts.2.2.1 rfl
      selected.2.1 selected.2.2.2.1 selected.2.2.1 selected.1 permutation
  exact ⟨final, publications, first, second, valid, opened⟩

theorem independent_issuers_and_private_deadline (kind : InternalTimerTaskKind) :
    let final := applyInternalTransitionBatch (program kind) ready (prepared kind)
    final.waits.map (fun wait => (wait.task.id.value, wait.activation)) =
        [("BoundedTask", 3), ("IndependentReview", 1)] ∧
      final.timerWaits.map (fun wait => (wait.elementId.value, wait.activation, wait.deadlineMs)) =
        [("Deadline", 6, 1321), ("Reminder", 1, 1321)] ∧
      final.activityOccurrences.map (·.activation) = [8] ∧
      final.variables = ready.variables ∧
      ((projectOpenFlowNodeOccurrences? (program kind) final).map (fun opened =>
        opened.map (·.elementId.value))) = some ["BoundedTask", "IndependentReview", "Reminder"] := by
  cases kind <;> decide +kernel

def staleStates : List RuntimeState :=
  [ { ready with logicalTimeMs := 322 }
  , { ready with activations := [{ taskId := ⟨"BoundedTask"⟩, count := 3 }] }
  , { ready with timerActivations := [{ elementId := ⟨"Deadline"⟩, count := 6 }] }
  , { ready with activityActivations := [{ taskId := ⟨"BoundedTask"⟩, count := 8 }] } ]

theorem stale_preparations_refuse_execution (kind : InternalTimerTaskKind) :
    staleStates.all (fun state =>
      (prepareInternalTransition? (program kind) state (task kind).operation).isSome &&
        ((prepareInternalTransition? (program kind) ready (task kind).operation).bind
          (applyPreparedInternalTransition? (program kind) state)).isNone) = true := by
  cases kind <;> decide +kernel

def start : Stimulus := .startProcess ⟨"start-review"⟩ ⟨processId.value⟩ instanceId []

theorem complete_command_publishes_only_the_task_and_standalone_timer (kind : InternalTimerTaskKind) :
    let result := applyStimulusTraced 5 (program kind) initialState start
    result.result.outcome = .committed ∧ result.committedTransitions.length = 6 ∧
      ((result.flowNodeOccurrenceLifecycles.drop 3).flatMap fun delta =>
        delta.started.map (·.elementId.value)) = ["BoundedTask", "IndependentReview", "Reminder"] ∧
      runtimeStateWellFormed (program kind) instanceId result.result.state = true := by
  cases kind <;> decide +kernel

theorem short_fuel_rolls_back_the_whole_command (kind : InternalTimerTaskKind) :
    let result := applyStimulusTraced 4 (program kind) initialState start
    result.result = {
      outcome := .rolledBack,
      state := initialState,
      internalStepBoundExceeded := true, ambiguousInternalChoice := false } ∧
      result.committedTransitions = [] ∧ result.flowNodeOccurrenceLifecycles = [] := by
  cases kind <;> decide +kernel

end BpmnSemantics.InternalTimerTaskBatchConformance

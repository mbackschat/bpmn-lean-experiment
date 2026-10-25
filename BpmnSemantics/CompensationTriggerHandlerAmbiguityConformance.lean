module

public import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
public import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerTransition

/-! # Compensation ownership and dependency ambiguity conformance

COMPH-TRIGGER-01 requires exact live-root ownership and refuses ambiguous occurrence lifting. These kernel witnesses preserve partial selection and terminal tombstones without broadening the root-scoped checkpoint.
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.CompensationTriggerHandlerAmbiguityConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures

def pendingB : CompensationHandlerExecution :=
  { compensatingHandlerB with lifecycle := .pending (some restoredContext) }

def secondA : CompensationHandlerExecution :=
  { pendingHandlerA with identity :=
      { id := occurrence "HA" 2
        subject := .boundaryActivity { activityOccurrence "A" with activation := 2 }
        handlerElementId := ⟨"HA"⟩ } }

def secondB : CompensationHandlerExecution :=
  { identity :=
      { id := occurrence "HB" 2
        subject := .eventSubProcess { parentB with activation := 2 }
        handlerElementId := ⟨"HB"⟩ }
    lifecycle := .pending (some { frames :=
      [{ owner := rootOwner, bindings := [{ name := "frozen", value := .string "old" }] },
       { owner := { parentB with activation := 2 }, bindings := [] }] }) }

def pendingState : RuntimeState :=
  { activeState with
    compensationTriggers := [{ activeTrigger with handlers := [pendingHandlerA, pendingB] }]
    compensationHandlerEffectWaits := [] }

def withHandlers (handlers : List CompensationHandlerExecution)
    (dependencies : List CompensationOccurrenceDependency := activeTrigger.dependencies) : RuntimeState :=
  { pendingState with compensationTriggers := [{ activeTrigger with handlers, dependencies }] }

def missingOwner : ScopeOccurrenceId := { rootOwner with activation := 2 }

def missingOwnerState : RuntimeState :=
  { pendingState with compensationTriggers :=
      [{ activeTrigger with owner := missingOwner, handlers :=
        [pendingHandlerA,
         { pendingB with lifecycle := .pending (some { frames :=
           [{ owner := missingOwner, bindings := [{ name := "frozen", value := .string "old" }] },
            { owner := parentB, bindings := [] }] }) }] }] }

def exact_live_root_owner_is_required : Bool := decide <|
    compensationExecutionStateValid program pendingState = true ∧
      compensationExecutionStateValid program missingOwnerState = false ∧
      compensationExecutionStateValid program
        { pendingState with scopeOccurrences := [] } = false ∧
      compensationExecutionStateValid program { pendingState with scopeOccurrences :=
        [{ id := rootOwner, parent := none }, { id := rootOwner, parent := none }] } = false ∧
      compensationExecutionStateValid program { pendingState with scopeOccurrences :=
        [{ id := rootOwner, parent := some parentB }] } = false

def repeated_predecessor_is_not_resolved_to_the_first_occurrence : Bool := decide <|
    compensationExecutionStateValid program
      (withHandlers [pendingHandlerA, secondA, pendingB]) = false

def repeated_successor_is_not_resolved_to_the_first_occurrence : Bool := decide <|
    compensationExecutionStateValid program
      (withHandlers [pendingHandlerA, pendingB, secondB]) = false

def missing_opposite_endpoint_does_not_hide_ambiguity : Bool := decide <|
    compensationExecutionStateValid program (withHandlers [pendingHandlerA, secondA] []) = false ∧
      compensationExecutionStateValid program (withHandlers [pendingB, secondB] []) = false

def unique_partial_selection_omits_only_the_missing_edge : Bool := decide <|
    compensationExecutionStateValid program (withHandlers [pendingHandlerA] []) = true ∧
      compensationExecutionStateValid program (withHandlers [pendingB] []) = true ∧
      occurrenceDependencies program executionDeclaration [pendingHandlerA, pendingB] =
        activeTrigger.dependencies ∧
      occurrenceDependencies program executionDeclaration [] = []

def selectedA : SelectedCompensationSubject :=
  { definition := .boundaryActivity ⟨"A"⟩ (boundaryBody "HA")
    occurrence := subjectA
    restoredContext := none }

def selectedA2 : SelectedCompensationSubject :=
  { selectedA with occurrence := secondA.identity.subject }

def selectedB : SelectedCompensationSubject :=
  { definition := .eventSubProcess ⟨"scope:B"⟩ ⟨"scope:HB"⟩ eventBody
    occurrence := subjectB
    restoredContext := some restoredContext }

def constructor_refuses_ambiguous_lifting_before_frontier_activation : Bool := decide <|
    constructCompensationTriggerFrontier program preTriggerState triggerOperation rootOwner
      [selectedA, selectedA2, selectedB] = none ∧
      constructCompensationTriggerFrontier program preTriggerState triggerOperation rootOwner
        [selectedA, selectedA2] = none

def constructor_keeps_empty_and_partial_selection : Bool := decide <|
    (constructCompensationTriggerFrontier program preTriggerState triggerOperation rootOwner
      []).isSome = true ∧
      (constructCompensationTriggerFrontier program preTriggerState triggerOperation rootOwner
        [selectedA]).map (·.trigger.dependencies) = some [] ∧
      (constructCompensationTriggerFrontier program preTriggerState triggerOperation rootOwner
        [selectedB]).map (·.trigger.dependencies) = some []

def terminal_tombstones_outlive_their_live_owner : Bool := decide <|
    compensationExecutionStateValid program
      { allSucceededState with control := .completed instanceId, scopeOccurrences := [], tokens := [] } = true ∧
      compensationExecutionStateValid program failedState = true

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("exact_live_root_owner_is_required", exact_live_root_owner_is_required),
  ("repeated_predecessor_is_not_resolved_to_the_first_occurrence", repeated_predecessor_is_not_resolved_to_the_first_occurrence),
  ("repeated_successor_is_not_resolved_to_the_first_occurrence", repeated_successor_is_not_resolved_to_the_first_occurrence),
  ("missing_opposite_endpoint_does_not_hide_ambiguity", missing_opposite_endpoint_does_not_hide_ambiguity),
  ("unique_partial_selection_omits_only_the_missing_edge", unique_partial_selection_omits_only_the_missing_edge),
  ("constructor_refuses_ambiguous_lifting_before_frontier_activation", constructor_refuses_ambiguous_lifting_before_frontier_activation),
  ("constructor_keeps_empty_and_partial_selection", constructor_keeps_empty_and_partial_selection),
  ("terminal_tombstones_outlive_their_live_owner", terminal_tombstones_outlive_their_live_owner)
]

end BpmnSemantics.CompensationTriggerHandlerAmbiguityConformance

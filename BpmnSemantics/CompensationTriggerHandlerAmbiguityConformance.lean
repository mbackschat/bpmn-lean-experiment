import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerTransition

/-! # Compensation ownership and dependency ambiguity conformance

COMPH-TRIGGER-01 requires exact live-root ownership and refuses ambiguous occurrence lifting. These kernel witnesses preserve partial selection and terminal tombstones without broadening the root-scoped checkpoint.
-/

set_option Elab.async false

namespace BpmnSemantics.CompensationTriggerHandlerAmbiguityConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures

private def pendingB : CompensationHandlerExecution :=
  { compensatingHandlerB with lifecycle := .pending (some restoredContext) }

private def secondA : CompensationHandlerExecution :=
  { pendingHandlerA with identity :=
      { id := occurrence "HA" 2
        subject := .boundaryActivity { activityOccurrence "A" with activation := 2 }
        handlerElementId := ⟨"HA"⟩ } }

private def secondB : CompensationHandlerExecution :=
  { identity :=
      { id := occurrence "HB" 2
        subject := .eventSubProcess { parentB with activation := 2 }
        handlerElementId := ⟨"HB"⟩ }
    lifecycle := .pending (some { frames :=
      [{ owner := rootOwner, bindings := [{ name := "frozen", value := .string "old" }] },
       { owner := { parentB with activation := 2 }, bindings := [] }] }) }

private def pendingState : RuntimeState :=
  { activeState with
    compensationTriggers := [{ activeTrigger with handlers := [pendingHandlerA, pendingB] }]
    compensationHandlerEffectWaits := [] }

private def withHandlers (handlers : List CompensationHandlerExecution)
    (dependencies : List CompensationOccurrenceDependency := activeTrigger.dependencies) : RuntimeState :=
  { pendingState with compensationTriggers := [{ activeTrigger with handlers, dependencies }] }

private def missingOwner : ScopeOccurrenceId := { rootOwner with activation := 2 }

private def missingOwnerState : RuntimeState :=
  { pendingState with compensationTriggers :=
      [{ activeTrigger with owner := missingOwner, handlers :=
        [pendingHandlerA,
         { pendingB with lifecycle := .pending (some { frames :=
           [{ owner := missingOwner, bindings := [{ name := "frozen", value := .string "old" }] },
            { owner := parentB, bindings := [] }] }) }] }] }

theorem exact_live_root_owner_is_required :
    compensationExecutionStateValid program pendingState = true ∧
      compensationExecutionStateValid program missingOwnerState = false ∧
      compensationExecutionStateValid program
        { pendingState with scopeOccurrences := [] } = false ∧
      compensationExecutionStateValid program { pendingState with scopeOccurrences :=
        [{ id := rootOwner, parent := none }, { id := rootOwner, parent := none }] } = false ∧
      compensationExecutionStateValid program { pendingState with scopeOccurrences :=
        [{ id := rootOwner, parent := some parentB }] } = false := by
  decide +kernel

theorem repeated_predecessor_is_not_resolved_to_the_first_occurrence :
    compensationExecutionStateValid program
      (withHandlers [pendingHandlerA, secondA, pendingB]) = false := by
  decide +kernel

theorem repeated_successor_is_not_resolved_to_the_first_occurrence :
    compensationExecutionStateValid program
      (withHandlers [pendingHandlerA, pendingB, secondB]) = false := by
  decide +kernel

theorem missing_opposite_endpoint_does_not_hide_ambiguity :
    compensationExecutionStateValid program (withHandlers [pendingHandlerA, secondA] []) = false ∧
      compensationExecutionStateValid program (withHandlers [pendingB, secondB] []) = false := by
  decide +kernel

theorem unique_partial_selection_omits_only_the_missing_edge :
    compensationExecutionStateValid program (withHandlers [pendingHandlerA] []) = true ∧
      compensationExecutionStateValid program (withHandlers [pendingB] []) = true ∧
      occurrenceDependencies program executionDeclaration [pendingHandlerA, pendingB] =
        activeTrigger.dependencies ∧
      occurrenceDependencies program executionDeclaration [] = [] := by
  decide +kernel

private def selectedA : SelectedCompensationSubject :=
  { definition := .boundaryActivity ⟨"A"⟩ (boundaryBody "HA")
    occurrence := subjectA
    restoredContext := none }

private def selectedA2 : SelectedCompensationSubject :=
  { selectedA with occurrence := secondA.identity.subject }

private def selectedB : SelectedCompensationSubject :=
  { definition := .eventSubProcess ⟨"scope:B"⟩ ⟨"scope:HB"⟩ eventBody
    occurrence := subjectB
    restoredContext := some restoredContext }

theorem constructor_refuses_ambiguous_lifting_before_frontier_activation :
    constructCompensationTriggerFrontier program preTriggerState triggerOperation rootOwner
      [selectedA, selectedA2, selectedB] = none ∧
      constructCompensationTriggerFrontier program preTriggerState triggerOperation rootOwner
        [selectedA, selectedA2] = none := by
  decide +kernel

theorem constructor_keeps_empty_and_partial_selection :
    (constructCompensationTriggerFrontier program preTriggerState triggerOperation rootOwner
      []).isSome = true ∧
      (constructCompensationTriggerFrontier program preTriggerState triggerOperation rootOwner
        [selectedA]).map (·.trigger.dependencies) = some [] ∧
      (constructCompensationTriggerFrontier program preTriggerState triggerOperation rootOwner
        [selectedB]).map (·.trigger.dependencies) = some [] := by
  decide +kernel

theorem terminal_tombstones_outlive_their_live_owner :
    compensationExecutionStateValid program
      { allSucceededState with control := .completed instanceId, scopeOccurrences := [], tokens := [] } = true ∧
      compensationExecutionStateValid program failedState = true := by
  decide +kernel

end BpmnSemantics.CompensationTriggerHandlerAmbiguityConformance

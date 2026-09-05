import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
import BpmnSemantics.SemanticProcess.ScopeCompletion

/-! # Compensation ownership at the scope-completion boundary

An active trigger blocks its exact owner even before a frontier owns an effect wait. Ordinary
tokens are absent from these witnesses so they cannot mask an omitted Compensation conjunct.
-/

set_option Elab.async false

namespace BpmnSemantics.ScopeCompletionConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures

private def pendingOnlyState : RuntimeState :=
  { activeState with
    compensationTriggers :=
      [{ activeTrigger with handlers := [pendingHandlerA], dependencies := [] }]
    compensationHandlerEffectWaits := [] }

theorem pending_trigger_is_not_quiescent_without_ordinary_work :
    scopeQuiescent pendingOnlyState rootOwner = false := by decide +kernel

theorem in_flight_trigger_is_not_quiescent_without_ordinary_work :
    scopeQuiescent activeState rootOwner = false := by decide +kernel

theorem pending_trigger_prevents_normal_root_completion :
    completeScopeState? pendingOnlyState rootOwner.definitionScopeId none = none := by
  decide +kernel

theorem in_flight_trigger_prevents_normal_root_completion :
    completeScopeState? activeState rootOwner.definitionScopeId none = none := by
  decide +kernel

theorem another_owner_activation_is_not_blocked_by_this_trigger :
    scopeQuiescent pendingOnlyState { rootOwner with activation := 2 } = true := by
  decide +kernel

theorem terminal_trigger_tombstones_do_not_block_quiescence :
    scopeQuiescent
        { pendingOnlyState with
          compensationTriggers := [{ activeTrigger with lifecycle := .succeeded }] }
        rootOwner = true ∧
      scopeQuiescent
        { pendingOnlyState with
          compensationTriggers := [{ activeTrigger with lifecycle := .failed }] }
        rootOwner = true := by decide +kernel

end BpmnSemantics.ScopeCompletionConformance

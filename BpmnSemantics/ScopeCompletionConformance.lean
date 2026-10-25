module

public import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
public import BpmnSemantics.SemanticProcess.ScopeCompletion

/-! # Compensation ownership at the scope-completion boundary

An active trigger blocks its exact owner even before a frontier owns an effect wait. Ordinary
tokens are absent from these witnesses so they cannot mask an omitted Compensation conjunct.
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.ScopeCompletionConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures

def pendingOnlyState : RuntimeState :=
  { activeState with
    compensationTriggers :=
      [{ activeTrigger with handlers := [pendingHandlerA], dependencies := [] }]
    compensationHandlerEffectWaits := [] }

def pending_trigger_is_not_quiescent_without_ordinary_work : Bool := decide <|
    scopeQuiescent pendingOnlyState rootOwner = false

def in_flight_trigger_is_not_quiescent_without_ordinary_work : Bool := decide <|
    scopeQuiescent activeState rootOwner = false

def pending_trigger_prevents_normal_root_completion : Bool := decide <|
    completeScopeState? pendingOnlyState rootOwner.definitionScopeId none = none

def in_flight_trigger_prevents_normal_root_completion : Bool := decide <|
    completeScopeState? activeState rootOwner.definitionScopeId none = none

def another_owner_activation_is_not_blocked_by_this_trigger : Bool := decide <|
    scopeQuiescent pendingOnlyState { rootOwner with activation := 2 } = true

def terminal_trigger_tombstones_do_not_block_quiescence : Bool := decide <|
    scopeQuiescent
        { pendingOnlyState with
          compensationTriggers := [{ activeTrigger with lifecycle := .succeeded }] }
        rootOwner = true ∧
      scopeQuiescent
        { pendingOnlyState with
          compensationTriggers := [{ activeTrigger with lifecycle := .failed }] }
        rootOwner = true

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("pending_trigger_is_not_quiescent_without_ordinary_work", pending_trigger_is_not_quiescent_without_ordinary_work),
  ("in_flight_trigger_is_not_quiescent_without_ordinary_work", in_flight_trigger_is_not_quiescent_without_ordinary_work),
  ("pending_trigger_prevents_normal_root_completion", pending_trigger_prevents_normal_root_completion),
  ("in_flight_trigger_prevents_normal_root_completion", in_flight_trigger_prevents_normal_root_completion),
  ("another_owner_activation_is_not_blocked_by_this_trigger", another_owner_activation_is_not_blocked_by_this_trigger),
  ("terminal_trigger_tombstones_do_not_block_quiescence", terminal_trigger_tombstones_do_not_block_quiescence)
]

end BpmnSemantics.ScopeCompletionConformance

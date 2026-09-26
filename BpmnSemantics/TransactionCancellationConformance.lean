import BpmnSemantics.TransactionRetentionConformance
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerCompletion

/-! # Bounded Transaction cancellation witnesses

TXC-EMPTY-01, TXC-JOIN-01 and TXC-FAIL-01 distinguish cancellation from ordinary scope completion.
These transition witnesses extend the child-retention fixture; source admission and committed command
publication have separate end-to-end witnesses.
-/

namespace BpmnSemantics.TransactionCancellationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

namespace Fixture

open TransactionRetentionConformance

def cancellation : SemanticOperation :=
  .cancelTransaction ⟨"cancel"⟩ ⟨⟨"CE"⟩⟩ ⟨"c"⟩ ⟨"in"⟩ ⟨"out"⟩ ⟨"CB"⟩

def beforeCancel : RuntimeState :=
  { liveChild with
    tokens := [{ placeId := ⟨"in"⟩, owner := childOwner }]
    waits := [liveWait]
    scopeActivations := [{ scopeId := ⟨"c"⟩, count := 1 }]
    activations := [{ taskId := ⟨"A"⟩, count := 1 }] }

def afterEligibleCompletion : RuntimeState :=
  { beforeCancel with
    waits := []
    compensationActivityRetentions := [completedRegister] }

def cancelled? : Option RuntimeState :=
  match attemptTransactionCancellation program cancellation afterEligibleCompletion with
  | .applied state => some state
  | _ => none

def completed? (result : EffectExecutionResult) : Option RuntimeState := do
  let state ← cancelled?
  let wait ← state.compensationHandlerEffectWaits.head?
  match attemptCompensationHandlerEffectCompletion program state wait.id result with
  | .applied after => some after
  | _ => none

end Fixture

open TransactionRetentionConformance Fixture

theorem empty_cancellation_disposes_child_and_routes_only_to_parent :
    (match attemptTransactionCancellation program cancellation beforeCancel with
      | .applied state =>
          state.control == .running instanceId &&
          state.scopeOccurrences == [{ id := rootOwner, parent := none }] &&
          state.tokens == [{ placeId := ⟨"out"⟩, owner := rootOwner }] &&
          state.waits.isEmpty && state.compensationActivityRetentions.isEmpty &&
          state.compensationTriggers.isEmpty && state.compensationHandlerEffectWaits.isEmpty
      | _ => false) = true := by
  decide +kernel

theorem eligible_cancellation_pins_child_and_consumes_register_before_handler :
    (match cancelled? with
      | some state =>
          state.scopeOccurrences == liveChild.scopeOccurrences &&
          state.tokens.isEmpty && state.waits.isEmpty &&
          state.compensationActivityRetentions == [{ completedRegister with records := [] }] &&
          state.compensationTriggers.length == 1 &&
          state.compensationTriggers.all (fun trigger =>
            trigger.owner == childOwner && trigger.lifecycle == .active &&
            trigger.handlers.length == 1) &&
          state.compensationHandlerEffectWaits.length == 1 &&
          compensationTriggerHandlerStateValid program state
      | none => false) = true := by
  decide +kernel

theorem successful_handler_disposes_child_retains_tombstone_and_routes_once :
    (match completed? (.success []) with
      | some state =>
          state.control == .running instanceId &&
          state.scopeOccurrences == [{ id := rootOwner, parent := none }] &&
          state.tokens == [{ placeId := ⟨"out"⟩, owner := rootOwner }] &&
          state.compensationActivityRetentions.isEmpty &&
          state.compensationHandlerEffectWaits.isEmpty &&
          state.compensationTriggers.length == 1 &&
          state.compensationTriggers.all (fun trigger =>
            trigger.owner == childOwner && trigger.lifecycle == .succeeded &&
            trigger.handlers.all (fun handler => handler.lifecycle == .compensated)) &&
          compensationTriggerHandlerStateValid program state
      | none => false) = true := by
  decide +kernel

theorem typed_handler_failure_disposes_whole_process_without_either_route :
    (match completed? (.bpmnError "release-refused" none []) with
      | some state =>
          (match state.control with | .failed .. => true | _ => false) &&
          state.scopeOccurrences.isEmpty && state.tokens.isEmpty && state.waits.isEmpty &&
          state.compensationActivityRetentions.isEmpty &&
          state.compensationHandlerEffectWaits.isEmpty &&
          state.compensationTriggers.length == 1 &&
          state.compensationTriggers.all (fun trigger => trigger.lifecycle == .failed) &&
          compensationTriggerHandlerStateValid program state
      | none => false) = true := by
  decide +kernel

theorem stale_handler_cannot_release_the_continuation_twice :
    (do
      let before ← cancelled?
      let wait ← before.compensationHandlerEffectWaits.head?
      let after ← completed? (.success [])
      pure (attemptCompensationHandlerEffectCompletion program after wait.id (.success []) ==
        .refused .staleEffect)) = some true := by
  decide +kernel

def cancelOperation : SemanticOperation :=
  .cancelTransaction ⟨"operation:Cancel"⟩ { elementId := ⟨"Cancel"⟩ }
    ⟨"scope:Transaction_Reservation"⟩ ⟨"place:Withdraw_Cancel"⟩
    ⟨"place:Cancel_Acknowledge"⟩ ⟨"Boundary_Cancel"⟩

theorem cancelOperation_identity : cancelOperation.id = ⟨"operation:Cancel"⟩ := by
  decide +kernel

end BpmnSemantics.TransactionCancellationConformance

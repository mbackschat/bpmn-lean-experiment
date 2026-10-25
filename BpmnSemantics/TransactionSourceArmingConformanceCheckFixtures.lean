module

public import BpmnSemantics.TransactionSourceConformance
public import BpmnSemantics.SemanticProcess.InternalSnapshotArming
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries

/-! Fixture definitions and executable checks of [`TransactionSourceArmingConformance`](TransactionSourceArmingConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.TransactionSourceArmingConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation
open BpmnSemantics.TransactionSourceConformance

def program : Program := lowerCheckedProcess (transactionCheckedSource "" false)
def instanceId : SemanticId := ⟨"tx-arming"⟩
def commandId : SemanticId := ⟨"start-transaction-arming"⟩
def childOwner : ScopeOccurrenceId :=
  { processInstanceId := instanceId, definitionScopeId := ⟨"scope:Transaction"⟩, activation := 1 }

def start : Stimulus :=
  .startProcess commandId ⟨program.processId.value⟩ instanceId []

def admitted : ExternalAdmission :=
  admitStimulusWithCompensationSnapshots program initialState start

def selectedSuccessor? (before : RuntimeState) (element : String) : Option RuntimeState := do
  let operation ← program.operations.find? (fun operation => operation.id.value == "operation:" ++ element)
  match attemptInternalOperation program operation before with
  | .applied step => some step.successor
  | .disabled _ | .refused _ _ => none

def initiated : RuntimeState :=
  (selectedSuccessor? admitted.state "RootStart").getD initialState
def entered : RuntimeState :=
  (selectedSuccessor? initiated "Transaction").getD initialState
def ready : RuntimeState :=
  (selectedSuccessor? entered "Split").getD initialState

def frontier : List SemanticOperation :=
  (snapshotInternalTransitionFrontier program ready).transitions.map (·.1)
def prepared : List PreparedInternalArming :=
  (prepareInternalArmingBatch? program ready frontier).getD []

def childRegister : List CompensationActivityRetention :=
  [{ owner := childOwner, nextCompletionOrdinal := 1, records := [] }]

def erasedRegister : RuntimeState :=
  { ready with compensationActivityRetentions := [] }

def selected_start_commits_without_a_premature_child_register : Bool := decide <|
    admitted.outcome = .committed ∧ admitted.state.compensationActivityRetentions = []

def selected_start_reaches_initiated_root : Bool := decide <|
    selectedSuccessor? admitted.state "RootStart" = some initiated

def selected_entry_reaches_a_registered_child : Bool := decide <|
    selectedSuccessor? initiated "Transaction" = some entered ∧
      entered.compensationActivityRetentions = childRegister ∧
      entered.scopeOccurrences.any (fun scope => scope.id == childOwner) = true

def selected_split_reaches_exact_child_tokens : Bool := decide <|
    selectedSuccessor? entered "Split" = some ready ∧
      ready.tokens = [{ placeId := ⟨"place:f5"⟩, owner := childOwner },
        { placeId := ⟨"place:f6"⟩, owner := childOwner }] ∧
      ready.waits = [] ∧ ready.compensationActivityRetentions = childRegister

def complete_reached_frontier_contains_only_the_two_child_tasks : Bool := decide <|
    (snapshotInternalTransitionFrontier program ready).refusal = none ∧
      frontier.map (·.id) = [⟨"operation:Reserve"⟩, ⟨"operation:Withdraw"⟩] ∧
      frontier.all (fun operation => match operation with
        | .awaitUserTask .. => true
        | _ => false) = true

def reversed_order_exercises_withdraw_before_reserve : Bool := decide <|
    prepared.reverse.map (fun member => member.operation.id) =
      [⟨"operation:Withdraw"⟩, ⟨"operation:Reserve"⟩]

def erased_child_register_invalidates_the_same_two_task_offers : Bool := decide <|
    runtimeStateWellFormed program instanceId erasedRegister = false ∧
      (snapshotInternalTransitionFrontier program erasedRegister).transitions.map (fun step => step.1.id) =
        [⟨"operation:Reserve"⟩, ⟨"operation:Withdraw"⟩]

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("selected_start_commits_without_a_premature_child_register", selected_start_commits_without_a_premature_child_register),
  ("selected_start_reaches_initiated_root", selected_start_reaches_initiated_root),
  ("selected_entry_reaches_a_registered_child", selected_entry_reaches_a_registered_child),
  ("selected_split_reaches_exact_child_tokens", selected_split_reaches_exact_child_tokens),
  ("complete_reached_frontier_contains_only_the_two_child_tasks", complete_reached_frontier_contains_only_the_two_child_tasks),
  ("reversed_order_exercises_withdraw_before_reserve", reversed_order_exercises_withdraw_before_reserve),
  ("erased_child_register_invalidates_the_same_two_task_offers", erased_child_register_invalidates_the_same_two_task_offers)
]

end BpmnSemantics.TransactionSourceArmingConformance

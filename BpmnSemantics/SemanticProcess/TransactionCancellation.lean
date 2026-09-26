import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerTransition
import BpmnSemantics.SemanticProcess.ScopeCancellation
import BpmnSemantics.SemanticProcess.TokenStorage

/-! # Transaction cancellation and the compensation join

TXC-CANCEL-01 selects retained completed work before regional cleanup. The selected child stays live
while compensation runs; TXC-JOIN-01 releases the direct-parent Cancel route only after quiescence.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Entry initializes only the declaration's exact newly entered child occurrence. -/
def initializeTransactionRetention (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) : RuntimeState :=
  match program.compensationActivityRetention with
  | some declaration =>
      if declaration.definitionScopeId == owner.definitionScopeId then
        { state with compensationActivityRetentions :=
            [{ owner, nextCompletionOrdinal := 1, records := [] }] }
      else state
  | none => state

/-- TXC-RETAIN-01 binds initialization to the child produced by the actual scope-entry transition. -/
def enterScopeWithCompensationRetention? (program : Program) (state : RuntimeState)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId) : Option RuntimeState := do
  let successor ← enterScopeState? state input childEntry childScopeId
  if (program.compensationActivityRetention.map (·.definitionScopeId)) = some childScopeId then
    match successor.scopeOccurrences.filter (fun occurrence => occurrence.id.definitionScopeId == childScopeId) with
    | [occurrence] => pure (initializeTransactionRetention program successor occurrence.id)
    | _ => none
  else pure successor

/-- Ordinary retained scope patches remain exact only when entry creates no Compensation register. -/
theorem enterScopeWithCompensationRetention_unselected
    (program : Program) (state : RuntimeState) (input childEntry : ControlPlaceId)
    (childScopeId : DefinitionScopeId)
    (unselected : program.compensationActivityRetention.map (·.definitionScopeId) ≠ some childScopeId) :
    enterScopeWithCompensationRetention? program state input childEntry childScopeId =
      enterScopeState? state input childEntry childScopeId := by
  unfold enterScopeWithCompensationRetention?
  cases entered : enterScopeState? state input childEntry childScopeId <;> simp [unselected]

/-- The empty path and successful handler join share the same child disposal and parent routing. -/
def finishTransactionCancellation? (state : RuntimeState) (owner : ScopeOccurrenceId)
    (output : ControlPlaceId) : Option RuntimeState :=
  match state.scopeOccurrences.filter (fun occurrence => occurrence.id == owner) with
  | [occurrence] =>
      match occurrence.parent with
      | some parent =>
          if scopeQuiescent state owner then
            some { state with
              scopeOccurrences := state.scopeOccurrences.filter (fun candidate => candidate.id != owner)
              compensationActivityRetentions := state.compensationActivityRetentions.filter
                (fun retention => retention.owner != owner)
              tokens := addToken state.tokens output parent }
          else none
      | none => none
  | _ => none

/-- TXC-JOIN-01 describes disposal and routing independently of the executable selector. -/
inductive TransactionCancellationJoin (before : RuntimeState) (owner : ScopeOccurrenceId)
    (output : ControlPlaceId) : RuntimeState → Prop where
  | joined (occurrence : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId)
      (selected : before.scopeOccurrences.filter (fun candidate => candidate.id == owner) = [occurrence])
      (parentSelected : occurrence.parent = some parent)
      (quiescent : scopeQuiescent before owner = true) :
      TransactionCancellationJoin before owner output
        { before with
          scopeOccurrences := before.scopeOccurrences.filter (fun candidate => candidate.id != owner)
          compensationActivityRetentions := before.compensationActivityRetentions.filter
            (fun retention => retention.owner != owner)
          tokens := addToken before.tokens output parent }

theorem finishTransactionCancellation_sound (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (finished : finishTransactionCancellation? before owner output = some after) :
    TransactionCancellationJoin before owner output after := by
  unfold finishTransactionCancellation? at finished
  split at finished
  · rename_i occurrence selected
    cases parentSelected : occurrence.parent with
    | none => simp [parentSelected] at finished
    | some parent =>
        simp only [parentSelected] at finished
        split at finished
        · rename_i quiescent
          cases finished
          exact .joined occurrence parent selected parentSelected quiescent
        · contradiction
  · contradiction

theorem finishTransactionCancellation_complete (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (joined : TransactionCancellationJoin before owner output after) :
    finishTransactionCancellation? before owner output = some after := by
  cases joined with
  | joined occurrence parent selected parentSelected quiescent =>
      simp [finishTransactionCancellation?, selected, parentSelected, quiescent]

theorem transaction_join_disposes_selected_scope (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (joined : TransactionCancellationJoin before owner output after) :
    ∀ occurrence ∈ after.scopeOccurrences, occurrence.id ≠ owner := by
  cases joined
  intro occurrence member
  simpa using (List.mem_filter.mp member).2

theorem transaction_join_preserves_other_scopes (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (joined : TransactionCancellationJoin before owner output after)
    (occurrence : RuntimeScopeOccurrence) (different : occurrence.id ≠ owner) :
    occurrence ∈ after.scopeOccurrences ↔ occurrence ∈ before.scopeOccurrences := by
  cases joined
  simp [different]

theorem transaction_join_preserves_retained_trigger (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (joined : TransactionCancellationJoin before owner output after) :
    after.compensationTriggers = before.compensationTriggers := by
  cases joined
  rfl

theorem transaction_join_adds_one_parent_token (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (output : ControlPlaceId)
    (joined : TransactionCancellationJoin before owner output after) :
    ∃ parent,
      (after.tokens.filter (fun token => token.placeId == output && token.owner == parent)).length =
        (before.tokens.filter (fun token => token.placeId == output && token.owner == parent)).length + 1 := by
  cases joined with
  | joined occurrence parent selected parentSelected quiescent =>
      refine ⟨parent, ?_⟩
      simpa using addToken_filter_length before.tokens output parent
        (fun token => token.placeId == output && token.owner == parent)

theorem transaction_join_does_not_emit_normal_output (before after : RuntimeState)
    (owner : ScopeOccurrenceId) (output normalOutput : ControlPlaceId)
    (different : normalOutput ≠ output)
    (joined : TransactionCancellationJoin before owner output after) :
    (after.tokens.filter (fun token => token.placeId == normalOutput)).length =
      (before.tokens.filter (fun token => token.placeId == normalOutput)).length := by
  cases joined with
  | joined occurrence parent selected parentSelected quiescent =>
      simpa [Ne.symm different] using addToken_filter_length before.tokens output parent
        (fun token => token.placeId == normalOutput)

/-- Completed root throws continue locally; completed Transactions join their direct parent. -/
def compensationCompletionRoute? (program : Program) (state : RuntimeState)
    (trigger : CompensationTriggerExecution) : Option RuntimeState :=
  match program.operations.filter (fun operation => operation.id.value == trigger.id.elementId.value) with
  | [.triggerCompensation ..] =>
      some { state with tokens := addToken state.tokens trigger.output trigger.owner }
  | [.cancelTransaction ..] => finishTransactionCancellation? state trigger.owner trigger.output
  | _ => none

/-- Operation kind determines the completion's scope contract, independently of its evaluator. -/
inductive CompensationCompletionRouting (program : Program) (before : RuntimeState)
    (trigger : CompensationTriggerExecution) : RuntimeState → Prop where
  | root (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
      (input output : ControlPlaceId)
      (selected : program.operations.filter (fun operation => operation.id.value == trigger.id.elementId.value) =
        [.triggerCompensation id origin scope input output]) :
      CompensationCompletionRouting program before trigger
        { before with tokens := addToken before.tokens trigger.output trigger.owner }
  | transaction (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
      (input output : ControlPlaceId) (boundary : NodeId) (after : RuntimeState)
      (selected : program.operations.filter (fun operation => operation.id.value == trigger.id.elementId.value) =
        [.cancelTransaction id origin scope input output boundary])
      (joined : TransactionCancellationJoin before trigger.owner trigger.output after) :
      CompensationCompletionRouting program before trigger after

theorem compensationCompletionRoute_sound (program : Program) (before after : RuntimeState)
    (trigger : CompensationTriggerExecution)
    (routed : compensationCompletionRoute? program before trigger = some after) :
    CompensationCompletionRouting program before trigger after := by
  unfold compensationCompletionRoute? at routed
  split at routed
  · rename_i id origin scope input output selected
    cases routed
    exact .root id origin scope input output selected
  · rename_i id origin scope input output boundary selected
    exact .transaction id origin scope input output boundary after selected
      (finishTransactionCancellation_sound before after trigger.owner trigger.output routed)
  · contradiction

theorem compensationCompletionRoute_complete (program : Program) (before after : RuntimeState)
    (trigger : CompensationTriggerExecution)
    (routing : CompensationCompletionRouting program before trigger after) :
    compensationCompletionRoute? program before trigger = some after := by
  cases routing with
  | root id origin scope input output selected =>
      simp [compensationCompletionRoute?, selected]
  | transaction id origin scope input output boundary after selected joined =>
      simpa [compensationCompletionRoute?, selected] using
        finishTransactionCancellation_complete before after trigger.owner trigger.output joined

theorem compensationCompletionRoute_none_refuses (program : Program) (before : RuntimeState)
    (trigger : CompensationTriggerExecution)
    (absent : compensationCompletionRoute? program before trigger = none) :
    ∀ after, ¬ CompensationCompletionRouting program before trigger after := by
  intro after routing
  have selected := compensationCompletionRoute_complete program before after trigger routing
  rw [absent] at selected
  contradiction

private def checkedCancellation (program : Program) (state : RuntimeState) :
    CompensationTriggerAttempt :=
  if compensationTriggerHandlerStateValid program state then .applied state
  else .refused .invalidState

/-- An atomic Cancel End consumes the selected child region only after preparing its full frontier. -/
def attemptTransactionCancellation (program : Program) (operation : SemanticOperation)
    (state : RuntimeState) : CompensationTriggerAttempt :=
  match operation, program.compensationExecution with
  | .cancelTransaction operationId _ definitionScopeId input output _, some declaration =>
      match state.control, onlyTokenOwner? state input with
      | .running instanceId, some owner =>
          if compensationTriggerProgramRejected program declaration operationId then
            .refused .invalidProgram
          else if owner.processInstanceId != instanceId || owner.definitionScopeId != definitionScopeId ||
              !compensationTriggerHandlerStateValid program state then .refused .invalidState
          else
            match state.scopeOccurrences.filter (fun occurrence => occurrence.id == owner) with
            | [{ parent := some _, .. }] =>
                if state.compensationTriggers.any (fun trigger =>
                    trigger.owner == owner && trigger.lifecycle == .active) then
                  .refused .activeTriggerExists
                else
                  match selectedCompensationSubjects? program owner state with
                  | none => .refused .invalidSources
                  | some [] =>
                      match finishTransactionCancellation?
                          (cancelScopeSubtree state owner .retain) owner output with
                      | none => .refused .invalidState
                      | some successor => checkedCancellation program successor
                  | some selected =>
                      match constructCompensationTriggerFrontier program state operation owner selected with
                      | none => .refused .invalidSources
                      | some activated =>
                          let triggers := insertTrigger activated.trigger state.compensationTriggers
                          let waits := activated.waits.foldl (fun current wait =>
                            insertCompensationHandlerEffectWait wait current) state.compensationHandlerEffectWaits
                          match compensationExecutionCapacityRefusal? declaration triggers waits with
                          | some reason => .refused reason
                          | none =>
                              let cleared := cancelScopeSubtree state owner .retain
                              checkedCancellation program { cleared with
                                compensationActivityRetentions :=
                                  clearClaimedActivityRecords owner state.compensationActivityRetentions
                                compensationTriggers := triggers
                                compensationHandlerEffectWaits := waits
                                effectActivations := activated.effectActivations }
            | _ => .refused .invalidState
      | _, _ => .disabled state
  | _, _ => .refused .invalidProgram

end BpmnSemantics.SemanticProcess

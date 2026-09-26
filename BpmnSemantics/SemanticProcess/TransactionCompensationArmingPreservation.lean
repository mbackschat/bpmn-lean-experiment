import BpmnSemantics.SemanticProcess.TransactionCompensationProvenance
import BpmnSemantics.SemanticProcess.TransactionCompensationTokenPreservation
import BpmnSemantics.SemanticProcess.InternalCommutationCore

/-! Transaction arming preserves active Compensation ownership from the selected input token.
The two-Task composition carries the same child-retention state through both actual arming steps. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open InternalCommutation

/-- TXC-JOIN-01 rejects a forged wait owner even when token consumption is elsewhere. -/
theorem compensationExecutionStateValid_active_cancel_forged_arm_invalid
    (program : Program) (state : RuntimeState) (patch : InternalArmingPatch)
    (declaration : CompensationExecutionDeclaration)
    (present : program.compensationExecution = some declaration)
    (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
    (input output : ControlPlaceId) (boundary : NodeId)
    (selected : program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) =
      [.cancelTransaction id origin scope input output boundary])
    (trigger : CompensationTriggerExecution) (member : trigger ∈ state.compensationTriggers)
    (active : trigger.lifecycle = .active)
    (forged : patch.write.owner = trigger.owner) :
    compensationExecutionStateValid program (applyInternalArmingPatch state patch) = false := by
  apply Bool.eq_false_iff.mpr
  intro valid
  have triggers : (applyInternalArmingPatch state patch).compensationTriggers =
      state.compensationTriggers := by cases h : patch.write <;> simp [applyInternalArmingPatch, h]
  have quiet := compensationExecutionStateValid_active_cancel_quiescent program _ declaration
    present valid id origin scope input output boundary selected trigger (by simpa [triggers]) active
  cases write : patch.write with
  | userTask wait | message wait | timer wait | effect wait bindings =>
      have owned : wait.owner = trigger.owner := by simpa [write, InternalArmingWrite.owner] using forged
      simp only [applyInternalArmingPatch, write] at quiet
      simp [scopeQuiescent, insertUserTaskWait_eq_canonicalInsertBy, insertMessageWait, insertTimerWait,
        insertEffectWait, mem_canonicalInsertBy, owned] at quiet

private theorem any_insert_rejected (before : α → α → Bool) (predicate : α → Bool)
    (value : α) (values : List α) (rejected : predicate value = false) :
    (canonicalInsertBy before value values).any predicate = values.any predicate := by
  induction values with
  | nil => simp [canonicalInsertBy, rejected]
  | cons current rest ih =>
      simp only [canonicalInsertBy]
      split <;> simp [rejected, ih]

private theorem arming_preserves_quiescence (state : RuntimeState) (patch : InternalArmingPatch)
    (owner : ScopeOccurrenceId) (quiet : scopeQuiescent state owner = true)
    (separated : patch.write.owner ≠ owner) :
    scopeQuiescent (applyInternalArmingPatch state patch) owner = true := by
  have absent : (state.tokens.any fun token => token.owner == owner) = false := by
    simp only [scopeQuiescent, Bool.and_eq_true, Bool.not_eq_true'] at quiet
    exact quiet.1.1.1.1.1.1.1.1.1.1
  have removed : ((removeToken state.tokens patch.input patch.owner).any
      fun token => token.owner == owner) = false := by
    apply List.any_eq_false.mpr
    intro token member
    exact List.any_eq_false.mp absent token
      ((removeToken_sublist state.tokens patch.input patch.owner).subset member)
  cases write : patch.write with
  | userTask wait | message wait | timer wait | effect wait bindings =>
      have different : wait.owner ≠ owner := by
        simpa [write, InternalArmingWrite.owner] using separated
      simp only [applyInternalArmingPatch, write, scopeQuiescent,
        insertUserTaskWait_eq_canonicalInsertBy, insertMessageWait, insertTimerWait, insertEffectWait]
      rw [any_insert_rejected _ (fun candidate => candidate.owner == owner) wait _
        (by simp [different])]
      simpa only [scopeQuiescent, removed, absent] using quiet

private theorem arming_preserves_provenance (state : RuntimeState) (patch : InternalArmingPatch)
    (trigger : CompensationTriggerExecution)
    (next : ∀ wait, patch.write = .userTask wait → activationCount state wait.task.id ≤ wait.activation)
    (valid : transactionTriggerProvenanceValid state trigger = true) :
    transactionTriggerProvenanceValid (applyInternalArmingPatch state patch) trigger = true := by
  cases write : patch.write with
  | message wait | timer wait | effect wait bindings =>
      simpa only [applyInternalArmingPatch, write, transactionTriggerProvenanceValid] using valid
  | userTask wait =>
      simpa only [applyInternalArmingPatch, write, transactionTriggerProvenanceValid] using
        transactionTriggerProvenanceValid_setActivationCount state wait.task.id wait.activation
          (next wait write) trigger valid

private theorem arming_preserves_owner_live (state : RuntimeState) (patch : InternalArmingPatch)
    (trigger : CompensationTriggerExecution)
    (live : transactionTriggerOwnerLive state trigger = true)
    (separated : patch.write.owner ≠ trigger.owner) :
    transactionTriggerOwnerLive (applyInternalArmingPatch state patch) trigger = true := by
  have scopes : (applyInternalArmingPatch state patch).scopeOccurrences = state.scopeOccurrences := by
    cases write : patch.write <;> simp [applyInternalArmingPatch, write]
  unfold transactionTriggerOwnerLive at live ⊢
  rw [scopes]
  split at live
  · rename_i occurrence parent selected
    have facts := Bool.and_eq_true_iff.mp live
    apply Bool.and_eq_true_iff.mpr
    refine ⟨facts.1, ?_⟩
    have quiet := arming_preserves_quiescence
      { state with compensationTriggers := (state.compensationTriggers.filter (fun candidate => candidate.id != trigger.id)) }
      patch trigger.owner facts.2 separated
    cases write : patch.write <;> simpa only [applyInternalArmingPatch, write] using quiet
  · contradiction

private theorem arming_preserves_lifecycle (state : RuntimeState) (patch : InternalArmingPatch)
    (transaction : Bool) (trigger : CompensationTriggerExecution)
    (input : ({ placeId := patch.input, owner := patch.owner } : ControlToken) ∈ state.tokens)
    (owned : patch.write.owner = patch.owner)
    (next : ∀ wait, patch.write = .userTask wait → activationCount state wait.task.id ≤ wait.activation)
    (valid : triggerLifecycleValid transaction state trigger = true) :
    triggerLifecycleValid transaction (applyInternalArmingPatch state patch) trigger = true := by
  have control : (applyInternalArmingPatch state patch).control = state.control := by
    cases write : patch.write <;> simp [applyInternalArmingPatch, write]
  have scopes : (applyInternalArmingPatch state patch).scopeOccurrences = state.scopeOccurrences := by
    cases write : patch.write <;> simp [applyInternalArmingPatch, write]
  cases transaction with
  | false => simpa [triggerLifecycleValid, control, scopes] using valid
  | true =>
      have provenance : transactionTriggerProvenanceValid state trigger = true := by
        exact (Bool.and_eq_true_iff.mp valid).1
      have preserved := arming_preserves_provenance state patch trigger next provenance
      cases lifecycle : trigger.lifecycle with
      | succeeded | failed =>
          simpa only [triggerLifecycleValid, lifecycle, control, scopes, provenance, preserved] using valid
      | active =>
          have live : transactionTriggerOwnerLive state trigger = true := by
            simp only [triggerLifecycleValid, lifecycle, Bool.not_true, Bool.false_or,
              Bool.and_eq_true, ite_true] at valid
            exact valid.2.1.1.2
          have separated : patch.write.owner ≠ trigger.owner := by
            intro same
            have refused := transactionTriggerOwnerLive_refuses_owned_token state trigger
              { placeId := patch.input, owner := patch.owner } input (owned.symm.trans same)
            simp [live] at refused
          have liveAfter := arming_preserves_owner_live state patch trigger live separated
          simpa only [triggerLifecycleValid, lifecycle, control, scopes, provenance, preserved,
            live, liveAfter] using valid

/-- Actual arming consumes a real token and inserts its wait at exactly that owner.

TXC-JOIN-01 supplies active-owner separation; issued counters retain terminal provenance.
The predecessor validator supplies every unchanged ordering, capacity, join and identity check. -/
theorem compensationExecutionStateValid_arming_preserved
    (program : Program) (state : RuntimeState) (patch : InternalArmingPatch)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (valid : compensationExecutionStateValid program state = true)
    (input : ({ placeId := patch.input, owner := patch.owner } : ControlToken) ∈ state.tokens)
    (owned : patch.write.owner = patch.owner)
    (next : ∀ wait, patch.write = .userTask wait → activationCount state wait.task.id ≤ wait.activation)
    (effects : ∀ wait bindings, patch.write = .effect wait bindings →
      ∀ handlerWait ∈ state.compensationHandlerEffectWaits,
        wait.elementId.value ≠ handlerWait.id.elementId.value) :
    compensationExecutionStateValid program (applyInternalArmingPatch state patch) = true := by
  have matching : ∀ declaration, program.compensationExecution = some declaration →
      ∀ trigger ∈ state.compensationTriggers,
        triggerMatchesDeclaration program (applyInternalArmingPatch state patch) declaration trigger = true := by
    intro declaration present trigger member
    have prior := compensationExecutionStateValid_trigger program state declaration present valid trigger member
    unfold triggerMatchesDeclaration at prior ⊢
    split at prior
    · simp only
      have lifecycle := (Bool.and_eq_true_iff.mp prior).2
      have preserved := arming_preserves_lifecycle state patch false trigger input owned next lifecycle
      simpa only [Bool.and_eq_true, lifecycle, preserved, and_true] using prior
    · simp only
      have lifecycle := (Bool.and_eq_true_iff.mp prior).2
      have preserved := arming_preserves_lifecycle state patch true trigger input owned next lifecycle
      simpa only [Bool.and_eq_true, lifecycle, preserved, and_true] using prior
    · contradiction
  cases write : patch.write with
  | userTask wait | message wait | timer wait =>
      exact compensationExecutionStateValid_running_of_matches program state _ instanceId running
        (by simp [applyInternalArmingPatch, write])
        (by simp [applyInternalArmingPatch, write])
        (by simp [applyInternalArmingPatch, write])
        (by simp [applyInternalArmingPatch, write])
        (by simp [applyInternalArmingPatch, write]) valid matching
  | effect wait bindings =>
      exact compensationExecutionStateValid_running_insertEffect_of_matches program state _ instanceId
        wait running (by simp [applyInternalArmingPatch, write])
        (by simp [applyInternalArmingPatch, write])
        (by simp [applyInternalArmingPatch, write])
        (by simp [applyInternalArmingPatch, write])
        (by simp [applyInternalArmingPatch, write]) (effects wait bindings write) valid matching

/-- The selected independent two-Task frontier composes without assuming intermediate validity. -/
theorem compensationExecutionStateValid_two_userTask_arms_preserved
    (program : Program) (state : RuntimeState) (left right : InternalArmingPatch)
    (leftWait rightWait : UserTaskWait)
    (leftWrite : left.write = .userTask leftWait) (rightWrite : right.write = .userTask rightWait)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (valid : compensationExecutionStateValid program state = true)
    (leftInput : ({ placeId := left.input, owner := left.owner } : ControlToken) ∈ state.tokens)
    (rightInput : ({ placeId := right.input, owner := right.owner } : ControlToken) ∈ state.tokens)
    (leftOwned : leftWait.owner = left.owner) (rightOwned : rightWait.owner = right.owner)
    (leftNext : activationCount state leftWait.task.id ≤ leftWait.activation)
    (rightNext : activationCount state rightWait.task.id ≤ rightWait.activation)
    (inputsDifferent : left.input ≠ right.input)
    (tasksDifferent : leftWait.task.id ≠ rightWait.task.id) :
    compensationExecutionStateValid program
      (applyInternalArmingPatch (applyInternalArmingPatch state left) right) = true := by
  have first := compensationExecutionStateValid_arming_preserved program state left instanceId running valid
    leftInput (by simpa [leftWrite, InternalArmingWrite.owner] using leftOwned)
    (by intro wait eq; simp only [leftWrite, InternalArmingWrite.userTask.injEq] at eq
        subst wait; exact leftNext)
    (by intro wait bindings eq; simp [leftWrite] at eq)
  have remaining : ({ placeId := right.input, owner := right.owner } : ControlToken) ∈
      (applyInternalArmingPatch state left).tokens := by
    simp only [applyInternalArmingPatch, leftWrite, removeToken_eq_erase]
    rw [List.mem_erase_of_ne]
    · exact rightInput
    · intro same
      exact inputsDifferent (congrArg ControlToken.placeId same).symm
  have countFrame : activationCount (applyInternalArmingPatch state left) rightWait.task.id =
      activationCount state rightWait.task.id := by
    simp only [applyInternalArmingPatch, leftWrite]
    exact activationCount_setActivationCount_other state leftWait.task.id rightWait.task.id
      leftWait.activation (Ne.symm tasksDifferent)
  apply compensationExecutionStateValid_arming_preserved program _ right instanceId
    (by simpa [applyInternalArmingPatch, leftWrite] using running) first remaining
    (by simpa [rightWrite, InternalArmingWrite.owner] using rightOwned)
  · intro wait eq
    simp only [rightWrite, InternalArmingWrite.userTask.injEq] at eq
    subst wait
    simpa only [countFrame] using rightNext
  · intro wait bindings eq
    simp [rightWrite] at eq

end BpmnSemantics.SemanticProcess

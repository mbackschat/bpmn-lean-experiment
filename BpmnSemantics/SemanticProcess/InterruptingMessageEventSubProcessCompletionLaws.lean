module

public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessCompletion
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation

/-! IMES-CLOSE-01 and IMES-EXPIRE-01 relations, soundness and lifetime laws. These distinguish handler
disposal from ordinary-child continuation and passive listening from work that prevents completion. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- IMES-CLOSE-01 permits a declared, quiescent handler to retire without a parent continuation. -/
theorem completeEventSubProcessState_accepts_quiescent_handler
    (program : Program) (before : RuntimeState) (scopeId : DefinitionScopeId) (elementId : NodeId)
    (declaration : InterruptingMessageEventSubProcessDeclaration)
    (child : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId)
    (declared : program.interruptingMessageEventSubProcesses.filter
      (fun candidate => candidate.handlerScopeId == scopeId) = [declaration])
    (selected : before.scopeOccurrences.filter
      (fun candidate => candidate.id.definitionScopeId == scopeId) = [child])
    (parented : child.parent = some parent)
    (origin : declaration.elementId = elementId)
    (running : before.control = .running child.id.processInstanceId)
    (sameInstance : parent.processInstanceId = child.id.processInstanceId)
    (parentDefinition : parent.definitionScopeId = declaration.parentScopeId)
    (definition : program.definitionScopes.filter (fun candidate => candidate.id == scopeId) =
      [{ id := scopeId, parentScopeId := some declaration.parentScopeId,
         originElementId := declaration.elementId }])
    (parentDeclared : (program.definitionScopes.filter
      (fun candidate => candidate.id == declaration.parentScopeId)).length = 1)
    (parentLive : (before.scopeOccurrences.filter (fun candidate => candidate.id == parent)).length = 1)
    (quiet : scopeQuiescent before child.id = true) :
    completeEventSubProcessState? program before scopeId elementId = some
      { before with
        scopeOccurrences := before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id ≠ child.id)) } := by
  simp [completeEventSubProcessState?, declared, selected, parented, origin, running,
    sameInstance, parentDefinition, definition, parentDeclared, parentLive, quiet]

/-- No continuation token, Process completion, context rewrite or history reset accompanies child disposal. -/
theorem eventSubProcessCompletion_frames_all_other_state
    (program : Program) (before after : RuntimeState) (scopeId : DefinitionScopeId) (elementId : NodeId)
    (step : EventSubProcessCompletionStep program before scopeId elementId after) :
    after = { before with scopeOccurrences := after.scopeOccurrences } := by
  cases step
  rfl

theorem eventSubProcessCompletion_has_no_parent_token
    (program : Program) (before after : RuntimeState) (scopeId : DefinitionScopeId) (elementId : NodeId)
    (step : EventSubProcessCompletionStep program before scopeId elementId after) :
    after.tokens = before.tokens ∧ after.control = before.control := by
  cases step
  exact ⟨rfl, rfl⟩

/-- The exact selected child is removed; every other occurrence is preserved with its multiplicity. -/
theorem eventSubProcessCompletion_exact_disposal
    (program : Program) (before after : RuntimeState) (scopeId : DefinitionScopeId) (elementId : NodeId)
    (step : EventSubProcessCompletionStep program before scopeId elementId after) :
    ∃ child, child ∈ before.scopeOccurrences ∧
      scopeQuiescent before child.id = true ∧
      after.scopeOccurrences = before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id ≠ child.id)) := by
  cases step with
  | close declaration child parent _ selected _ bound =>
    refine ⟨child, ?_, bound.2.2.2.2.2.2.2, rfl⟩
    have member : child ∈ before.scopeOccurrences.filter
        (fun candidate => candidate.id.definitionScopeId == scopeId) := by simp [selected]
    exact (List.mem_filter.mp member).1

/-- An absent child cannot be completed again, independently of its retained declaration. -/
theorem completeEventSubProcessState_refuses_absent_child
    (program : Program) (before : RuntimeState) (scopeId : DefinitionScopeId) (elementId : NodeId)
    (absent : before.scopeOccurrences.filter
      (fun candidate => candidate.id.definitionScopeId == scopeId) = []) :
    completeEventSubProcessState? program before scopeId elementId = none := by
  simp [completeEventSubProcessState?, absent]

/-- A remaining token, wait or nested child prevents IMES-CLOSE-01 even with valid declaration binding. -/
theorem completeEventSubProcessState_refuses_unfinished_child
    (program : Program) (before : RuntimeState) (scopeId : DefinitionScopeId) (elementId : NodeId)
    (declaration : InterruptingMessageEventSubProcessDeclaration) (child : RuntimeScopeOccurrence)
    (declared : program.interruptingMessageEventSubProcesses.filter
      (fun candidate => candidate.handlerScopeId == scopeId) = [declaration])
    (selected : before.scopeOccurrences.filter
      (fun candidate => candidate.id.definitionScopeId == scopeId) = [child])
    (unfinished : scopeQuiescent before child.id = false) :
    completeEventSubProcessState? program before scopeId elementId = none := by
  simp only [completeEventSubProcessState?, declared, selected]
  cases child.parent <;> simp [unfinished]

/-- IMES-EXPIRE-01 treats listeners as passive registrations, so changing only them cannot prevent quiescence. -/
theorem eventSubProcessListeners_do_not_block_quiescence (state : RuntimeState)
    (listeners : List EventSubProcessMessageSubscription) (owner : ScopeOccurrenceId) :
    scopeQuiescent { state with eventSubProcessMessageSubscriptions := listeners } owner =
      scopeQuiescent state owner := rfl

/-- IMES-EXPIRE-01 withdraws exactly the completing owner's passive listeners on either ordinary completion path. -/
theorem normalScopeCompletion_expires_owned_listeners
    (before after : RuntimeState) (occurrence : RuntimeScopeOccurrence)
    (output : Option ControlPlaceId)
    (completed : completeQuiescentScope? before occurrence output = some after) :
    after.eventSubProcessMessageSubscriptions = before.eventSubProcessMessageSubscriptions.filter
      (fun listener => decide (listener.owner ≠ occurrence.id)) := by
  unfold completeQuiescentScope? at completed
  repeat' split at completed
  all_goals
    first
      | (simp at completed; done)
      | (simp only [Option.some.injEq] at completed
         subst after
         rfl)

/-- IMES-CLOSE-01 keeps the parent live until the triggered child has retired. -/
theorem eventSubProcessChild_blocks_parent_quiescence (state : RuntimeState)
    (child : RuntimeScopeOccurrence) (parent : ScopeOccurrenceId)
    (member : child ∈ state.scopeOccurrences) (parented : child.parent = some parent) :
    scopeQuiescent state parent = false := by
  have present : (state.scopeOccurrences.any fun occurrence => occurrence.parent == some parent) = true := by
    exact List.any_eq_true.mpr ⟨child, member, by simp [parented]⟩
  simp [scopeQuiescent, present]

private theorem any_insert_token (tokens : List ControlToken) (place : ControlPlaceId)
    (owner root : ScopeOccurrenceId) :
    (addToken tokens place owner).any (·.owner == root) =
      ((owner == root) || tokens.any (·.owner == root)) := by
  unfold addToken
  induction tokens with
  | nil => simp [canonicalInsertBy]
  | cons token rest ih =>
      simp only [canonicalInsertBy]
      split <;> simp_all [Bool.or_left_comm]

/-- Raw Task completion exchanges a wait for a token at the same owner, preserving the
IMES phase guard before the command boundary performs Activity cleanup. -/
theorem message_handler_phase_wait_token_exchange (program : Program)
    (before : RuntimeState) (instanceId : SemanticId) (wait : UserTaskWait)
    (running : before.control = .running instanceId)
    (member : wait ∈ before.waits) :
    interruptingMessageEventSubProcessStateValid program
      { before with
        waits := before.waits.erase wait
        tokens := addToken before.tokens wait.output wait.owner } =
      interruptingMessageEventSubProcessStateValid program before := by
    have work (root : ScopeOccurrenceId) :
        (before.initiationPending || (addToken before.tokens wait.output wait.owner).any (·.owner == root) ||
          (before.waits.erase wait).any (·.owner == root) || before.activityOccurrences.any (·.owner == root)) =
        (before.initiationPending || before.tokens.any (·.owner == root) ||
          before.waits.any (·.owner == root) || before.activityOccurrences.any (·.owner == root)) := by
      have waits := (List.perm_cons_erase member).any_eq (f := fun candidate => candidate.owner == root)
      rw [any_insert_token, waits]
      simp [Bool.or_assoc, Bool.or_left_comm, Bool.or_comm]
    unfold interruptingMessageEventSubProcessStateValid
    split
    · rfl
    · split
      · rfl
      · simp only [running]
        split
        · simp only [messageEventSubProcessRunningPhaseValid]
          rw [work]
          rfl
        · rfl

end BpmnSemantics.SemanticProcess

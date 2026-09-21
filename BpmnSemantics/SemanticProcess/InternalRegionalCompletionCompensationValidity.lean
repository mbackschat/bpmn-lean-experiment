import BpmnSemantics.SemanticProcess.InternalRegionalCancellationCompensationValidity

/-! Normal root completion retains successful Compensation history. Quiescence rules out
active triggers at the sole live root, while predecessor validity rules out failed triggers
in a running state. These facts justify terminal validity without erasing that history. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem quiescent_singleton_compensation_succeeded (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (root : RuntimeScopeOccurrence)
    (running : state.control = .running hosting) (scopes : state.scopeOccurrences = [root])
    (quiet : scopeQuiescent state root.id = true)
    (valid : compensationExecutionStateValid program state = true) :
    (∀ trigger ∈ state.compensationTriggers, trigger.lifecycle = .succeeded) ∧
      state.compensationHandlerEffectWaits = [] := by
  cases declared : program.compensationExecution with
  | none =>
      simp only [compensationExecutionStateValid, declared, Bool.and_eq_true, List.isEmpty_iff] at valid
      simp [valid.2.1, valid.2.2]
  | some declaration =>
      simp only [compensationExecutionStateValid, declared, Bool.and_eq_true, and_assoc] at valid
      have bindings := valid.2.2.2.2.1
      have succeeded (trigger : CompensationTriggerExecution) (member : trigger ∈ state.compensationTriggers) :
          trigger.lifecycle = .succeeded := by
        have fact := List.all_eq_true.mp bindings trigger member
        change (match program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) with
          | [.triggerCompensation _ _ _ _ _] => _ && _
          | _ => false) = true at fact
        split at fact
        · have lifecycle := (Bool.and_eq_true_iff.mp fact).2
          change (match trigger.lifecycle with | .active => _ | .succeeded => _ | .failed => _) = true at lifecycle
          cases status : trigger.lifecycle with
          | succeeded => rfl
          | failed => simp [status, running] at lifecycle
          | active =>
              simp only [status, Bool.and_eq_true] at lifecycle
              have census := lifecycle.1.1.2
              change decide ((state.scopeOccurrences.filter fun occurrence =>
                occurrence.id == trigger.owner && occurrence.parent.isNone).length = 1) = true at census
              have owned : root.id = trigger.owner := by
                by_cases same : root.id = trigger.owner
                · exact same
                · simp [scopes, same] at census
              have refuses := scopeQuiescent_refuses_active_compensation_trigger state root.id trigger member status owned.symm
              simp [quiet] at refuses
        · contradiction
      refine ⟨succeeded, ?_⟩
      apply List.eq_nil_iff_forall_not_mem.mpr
      intro wait member
      have fact := List.all_eq_true.mp valid.2.2.2.2.2.2.2.1 wait member
      change (match state.compensationTriggers.filter (fun trigger => trigger.id == wait.triggerId) with
        | [trigger] => _ | _ => false) = true at fact
      split at fact
      · rename_i trigger census
        have present : trigger ∈ state.compensationTriggers.filter (fun candidate => candidate.id == wait.triggerId) := by
          rw [census]; simp
        have status := succeeded trigger (List.mem_filter.mp present).1
        change (match trigger.handlers.filter (fun handler => handler.identity.id == wait.handlerId) with
          | [handler] => _ | _ => false) = true at fact
        split at fact
        · change (match (_ : CompensationHandlerLifecycle), (_ : Option CompensationSubjectDefinition) with
            | .compensating _ _, some _ => _ | _, _ => false) = true at fact
          split at fact
          · change (_ && _ && _ && (trigger.lifecycle == .active) && _ && _ && _ && _) = true at fact
            simp [status] at fact
          · contradiction
        · contradiction
      · contradiction

theorem compensation_execution_completed_retained_frame (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (completed : after.control = .completed hosting)
    (triggers : after.compensationTriggers = before.compensationTriggers)
    (waitsBefore : before.compensationHandlerEffectWaits = [])
    (waitsAfter : after.compensationHandlerEffectWaits = [])
    (succeeded : ∀ trigger ∈ before.compensationTriggers, trigger.lifecycle = .succeeded)
    (valid : compensationExecutionStateValid program before = true) :
    compensationExecutionStateValid program after = true := by
  unfold compensationExecutionStateValid at valid ⊢
  simp only [Bool.and_eq_true] at valid ⊢
  refine ⟨valid.1, ?_⟩
  cases declared : program.compensationExecution with
  | none => simpa only [declared, triggers, waitsBefore, waitsAfter] using valid.2
  | some declaration =>
      simp only [declared, Bool.and_eq_true, and_assoc] at valid ⊢
      obtain ⟨order, unique, owners, bindings, waitOrder, waitUnique, matching, oneWait,
        _, triggerBound, handlerBound, byteBound, _⟩ := valid.2
      refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
      · simpa only [triggers] using order
      · simpa only [triggers] using unique
      · simpa only [activeCompensationTriggerOwnersUnique, triggers] using owners
      · rw [triggers]
        apply List.all_eq_true.mpr
        intro trigger member
        have prior := List.all_eq_true.mp bindings trigger member
        change (match program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) with
          | [.triggerCompensation _ _ _ _ _] => _ && _ | _ => false) = true at prior ⊢
        split at prior
        · simp only [Bool.and_eq_true] at prior ⊢
          refine ⟨prior.1, ?_⟩
          have lifecycle := prior.2
          change (match trigger.lifecycle with | .active => _ | .succeeded => _ | .failed => _) = true at lifecycle ⊢
          simpa only [succeeded trigger member] using lifecycle
        · contradiction
      · simpa only [waitsBefore, waitsAfter] using waitOrder
      · simpa only [waitsBefore, waitsAfter] using waitUnique
      · simpa only [waitsBefore, waitsAfter, triggers] using matching
      · simpa only [waitsBefore, waitsAfter, triggers] using oneWait
      · simp only [waitsAfter, List.all_nil]
      · simpa only [triggers] using triggerBound
      · simpa only [triggers] using handlerBound
      · simpa only [triggers, waitsBefore, waitsAfter] using byteBound
      · change (match after.control with
          | .notStarted => _ | .running _ => _ | .completed _ | .cancelled _ => _ | .failed .. => _) = true
        rw [completed]
        simp only [waitsAfter, List.isEmpty_nil, Bool.true_and, triggers, List.all_eq_true]
        intro trigger member
        simp [succeeded trigger member]

theorem completion_root_compensation_retention (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (root : RuntimeScopeOccurrence)
    (running : before.control = .running hosting) (completed : after.control = .completed hosting)
    (scopes : before.scopeOccurrences = [root])
    (retained : after.compensationActivityRetentions = before.compensationActivityRetentions.filter
      (fun retention => decide (retention.owner ≠ root.id)))
    (valid : compensationActivityRetentionStateValid program before = true) :
    compensationActivityRetentionStateValid program after = true := by
  simp only [compensationActivityRetentionStateValid, Bool.and_eq_true] at valid ⊢
  refine ⟨valid.1, ?_⟩
  cases declared : program.compensationActivityRetention with
  | none =>
      have empty : before.compensationActivityRetentions = [] := by
        simpa only [declared, List.isEmpty_iff] using valid.2
      simp [retained, empty]
  | some declaration =>
      simp only [declared, running] at valid
      cases records : before.compensationActivityRetentions with
      | nil => simp [records] at valid
      | cons retention rest =>
          cases rest with
          | cons other rest => simp [records] at valid
          | nil =>
              have fact := valid.2
              simp only [records] at fact
              change (_ && _ && _ && decide ((before.scopeOccurrences.filter fun occurrence =>
                occurrence.id == retention.owner) = [{ id := retention.owner, parent := none }]) &&
                _ && _ && _ && _ && _ && _) = true at fact
              have owner : root.id = retention.owner := by
                by_cases same : root.id = retention.owner
                · exact same
                · simp [scopes, same] at fact
              simp [completed, retained, records, owner]

theorem completion_child_compensation_retention (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (root : RuntimeScopeOccurrence)
    (running : before.control = .running hosting) (control : after.control = before.control)
    (member : root ∈ before.scopeOccurrences) (child : root.parent ≠ none)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun occurrence => decide (occurrence.id ≠ root.id)))
    (retained : after.compensationActivityRetentions = before.compensationActivityRetentions)
    (valid : compensationActivityRetentionStateValid program before = true) :
    compensationActivityRetentionStateValid program after = true := by
  simp only [compensationActivityRetentionStateValid, Bool.and_eq_true] at valid ⊢
  refine ⟨valid.1, ?_⟩
  cases declared : program.compensationActivityRetention with
  | none => simpa only [declared, retained] using valid.2
  | some declaration =>
      simp only [declared, control, running, retained] at valid ⊢
      cases records : before.compensationActivityRetentions with
      | nil => simp [records] at valid
      | cons retention rest =>
          cases rest with
          | cons other rest => simp [records] at valid
          | nil =>
              simp only [records] at valid ⊢
              have previous := valid.2
              change (_ && _ && _ && decide ((before.scopeOccurrences.filter fun occurrence =>
                occurrence.id == retention.owner) = [{ id := retention.owner, parent := none }]) &&
                _ && _ && _ && _ && _ && _) = true at previous
              have different : retention.owner ≠ root.id := by
                intro same
                have census := previous
                simp only [Bool.and_eq_true, and_assoc] at census
                have singleton := of_decide_eq_true census.2.2.2.1
                have present : root ∈ before.scopeOccurrences.filter (fun occurrence => occurrence.id == retention.owner) :=
                  List.mem_filter.mpr ⟨member, by simp [same]⟩
                rw [singleton] at present
                exact child (congrArg RuntimeScopeOccurrence.parent (List.mem_singleton.mp present))
              have census : (after.scopeOccurrences.filter fun occurrence => occurrence.id == retention.owner) =
                  before.scopeOccurrences.filter (fun occurrence => occurrence.id == retention.owner) := by
                rw [scopes, List.filter_filter]
                apply List.filter_congr
                intro occurrence _
                by_cases same : occurrence.id = retention.owner <;> simp [same, different]
              change (_ && _ && _ && decide ((after.scopeOccurrences.filter fun occurrence =>
                occurrence.id == retention.owner) = [{ id := retention.owner, parent := none }]) &&
                _ && _ && _ && _ && _ && _) = true
              rw [census]
              exact previous

theorem completion_child_compensation_execution (program : Program) (before after : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence)
    (position : runtimePositionValid program expected before = true)
    (running : before.control = .running hosting) (control : after.control = before.control)
    (member : root ∈ before.scopeOccurrences) (child : root.parent ≠ none)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun occurrence => decide (occurrence.id ≠ root.id)))
    (triggers : after.compensationTriggers = before.compensationTriggers)
    (waits : after.compensationHandlerEffectWaits = before.compensationHandlerEffectWaits)
    (effects : after.effectWaits ⊆ before.effectWaits)
    (incidents : after.effectIncidents ⊆ before.effectIncidents)
    (valid : compensationExecutionStateValid program before = true) :
    compensationExecutionStateValid program after = true := by
  apply compensation_execution_running_retained_frame program before after hosting running control
    triggers waits _ effects incidents valid
  intro owner
  have unique := runtimePositionValid_scope_ids_nodup program expected hosting before position running
  have different (occurrence : RuntimeScopeOccurrence) (present : occurrence ∈ before.scopeOccurrences)
      (parentless : occurrence.parent = none) : occurrence.id ≠ root.id := by
    intro same
    have equal : occurrence = root := by
      have selected := occurrence_find_exact before.scopeOccurrences unique occurrence present
      rw [same, occurrence_find_exact before.scopeOccurrences unique root member] at selected
      exact (Option.some.inj selected).symm
    exact child (equal ▸ parentless)
  rw [scopes, List.filter_filter]
  congr 1
  apply List.filter_congr
  intro occurrence present
  cases parent : occurrence.parent with
  | some value => simp
  | none => simp [different occurrence present parent]

end BpmnSemantics.SemanticProcess

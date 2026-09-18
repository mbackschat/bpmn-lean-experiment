import BpmnSemantics.SemanticProcess.ScopeInsertionValidity
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime

/-! Fresh scope insertion preserves the exact Compensation ownership checks required by the
[scope-creation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem scopeFilter_insertScopeOccurrence_fresh (state : RuntimeState)
    (inserted : RuntimeScopeOccurrence) (owner : ScopeOccurrenceId)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ inserted.id)
    (present : ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = owner) :
    (insertScopeOccurrence inserted state.scopeOccurrences).filter
      (fun occurrence => occurrence.id == owner) =
      state.scopeOccurrences.filter (fun occurrence => occurrence.id == owner) := by
  obtain ⟨occurrence, member, identity⟩ := present
  have different : inserted.id ≠ owner := by
    intro same
    exact fresh occurrence member (identity.trans same.symm)
  exact filter_canonicalInsertBy_rejected scopeOccurrenceBefore
    (fun occurrence => occurrence.id == owner) inserted
    state.scopeOccurrences (by simpa using different)

/-- A parent-bearing alias keeps the parentless census unchanged but breaks retention's complete
singleton filter, as required by the unchanged retention validator. -/
theorem scopeFilter_sameIdentity_differentParent (state : RuntimeState)
    (owner parent : ScopeOccurrenceId)
    (singleton : state.scopeOccurrences.filter (fun occurrence => occurrence.id == owner) =
      [{ id := owner, parent := none }]) :
    ((insertScopeOccurrence { id := owner, parent := some parent } state.scopeOccurrences).filter
      (fun occurrence => occurrence.id == owner && occurrence.parent.isNone)).length =
        (state.scopeOccurrences.filter
          (fun occurrence => occurrence.id == owner && occurrence.parent.isNone)).length ∧
    (insertScopeOccurrence { id := owner, parent := some parent } state.scopeOccurrences).filter
      (fun occurrence => occurrence.id == owner) ≠ [{ id := owner, parent := none }] := by
  constructor
  · rw [insertScopeOccurrence, filter_canonicalInsertBy_rejected scopeOccurrenceBefore
      (fun occurrence => occurrence.id == owner && occurrence.parent.isNone) _ _ (by simp)]
  · intro equal
    have count := congrArg List.length equal
    simp only [insertScopeOccurrence, length_filter_canonicalInsertBy, singleton] at count
    simp at count

/-- An equal-identity parentless insertion breaks the unique-root count used by active triggers. -/
theorem scopeFilter_sameIdentity_parentless_duplicate (state : RuntimeState)
    (owner : ScopeOccurrenceId)
    (singleton : (state.scopeOccurrences.filter fun occurrence =>
      occurrence.id == owner && occurrence.parent.isNone).length = 1) :
    ((insertScopeOccurrence { id := owner, parent := none } state.scopeOccurrences).filter
      (fun occurrence => occurrence.id == owner && occurrence.parent.isNone)).length = 2 := by
  simp [insertScopeOccurrence, length_filter_canonicalInsertBy, singleton]

theorem compensationActivityRetentionStateValid_insertScopeOccurrence
    (program : Program) (state : RuntimeState) (inserted : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ inserted.id)
    (valid : compensationActivityRetentionStateValid program state = true) :
    compensationActivityRetentionStateValid program
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences } =
      true := by
  unfold compensationActivityRetentionStateValid at valid ⊢
  simp only [Bool.and_eq_true] at valid ⊢
  refine ⟨valid.1, ?_⟩
  cases declaration : program.compensationActivityRetention with
  | none => simpa only [declaration] using valid.2
  | some declaration =>
      cases control : state.control <;> simp only [declaration, control] at valid ⊢
      all_goals try exact valid.2
      rename_i instanceId
      cases records : state.compensationActivityRetentions with
      | nil => simp [records] at valid
      | cons retention rest =>
          cases rest with
          | cons other rest => simp [records] at valid
          | nil =>
              simp only [records] at valid ⊢
              have valid := valid.2
              change (_ && _ && _ && decide ((state.scopeOccurrences.filter fun occurrence =>
                occurrence.id == retention.owner) = [{ id := retention.owner, parent := none }]) &&
                _ && _ && _ && _ && _ && _) = true at valid
              have exactRoot : (state.scopeOccurrences.filter fun occurrence =>
                  occurrence.id == retention.owner) = [{ id := retention.owner, parent := none }] := by
                simp only [Bool.and_eq_true, decide_eq_true_eq] at valid
                exact valid.1.1.1.1.1.1.2
              have rootMember : ({ id := retention.owner, parent := none } : RuntimeScopeOccurrence)
                  ∈ state.scopeOccurrences := by
                apply ((List.mem_filter (p := fun occurrence =>
                  occurrence.id == retention.owner)).mp ?_).1
                rw [exactRoot]
                simp
              have lookup := scopeFilter_insertScopeOccurrence_fresh state inserted retention.owner
                fresh ⟨_, rootMember, rfl⟩
              change (_ && _ && _ && decide (((insertScopeOccurrence inserted
                state.scopeOccurrences).filter fun occurrence => occurrence.id == retention.owner) =
                  [{ id := retention.owner, parent := none }]) && _ && _ && _ && _ && _ && _) = true
              rw [lookup]
              exact valid

theorem compensationExecutionStateValid_insertScopeOccurrence
    (program : Program) (state : RuntimeState) (inserted : RuntimeScopeOccurrence)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ inserted.id)
    (valid : compensationExecutionStateValid program state = true) :
    compensationExecutionStateValid program
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences } =
      true := by
  let lifecycle (state : RuntimeState) (trigger : CompensationTriggerExecution) : Bool :=
    match trigger.lifecycle with
    | .active =>
        (match state.control with
          | .running id => trigger.owner.processInstanceId == id
          | _ => false) &&
        (state.scopeOccurrences.filter fun occurrence =>
          occurrence.id == trigger.owner && occurrence.parent.isNone).length = 1 &&
        (trigger.handlers.any fun handler =>
          match handler.lifecycle with | .pending _ | .compensating _ _ => true | _ => false) &&
        (trigger.handlers.all fun handler =>
          match handler.lifecycle with | .failed | .terminated => false | _ => true)
    | .succeeded => trigger.handlers.all fun handler => handler.lifecycle == .compensated
    | .failed =>
        (match state.control with | .failed .. => true | _ => false) &&
        (trigger.handlers.filter fun handler => handler.lifecycle == .failed).length = 1 &&
        (trigger.handlers.all fun handler =>
          handler.lifecycle == .compensated || handler.lifecycle == .failed ||
            handler.lifecycle == .terminated)
  have preservesLifecycle (trigger : CompensationTriggerExecution)
      (valid : lifecycle state trigger = true) :
      lifecycle { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences }
        trigger = true := by
    cases status : trigger.lifecycle with
    | succeeded => simpa only [lifecycle, status] using valid
    | failed => simpa only [lifecycle, status] using valid
    | active =>
        simp only [lifecycle, status, Bool.and_eq_true, decide_eq_true_eq] at valid ⊢
        have present : ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = trigger.owner := by
          have nonempty : (state.scopeOccurrences.filter fun occurrence =>
              occurrence.id == trigger.owner && occurrence.parent.isNone) ≠ [] := by
            intro empty
            simp [empty] at valid
          obtain ⟨occurrence, member⟩ := List.exists_mem_of_ne_nil _ nonempty
          have facts := List.mem_filter.mp member
          have predicate := facts.2
          simp only [Bool.and_eq_true, beq_iff_eq] at predicate
          exact ⟨occurrence, facts.1, predicate.1⟩
        obtain ⟨occurrence, member, same⟩ := present
        have different : inserted.id ≠ trigger.owner := by
          intro identity
          exact fresh occurrence member (same.trans identity.symm)
        have lookup := filter_canonicalInsertBy_rejected scopeOccurrenceBefore
          (fun occurrence => occurrence.id == trigger.owner && occurrence.parent.isNone)
          inserted state.scopeOccurrences (by simp [different])
        simpa only [insertScopeOccurrence, lookup] using valid
  unfold compensationExecutionStateValid at valid ⊢
  simp only [Bool.and_eq_true] at valid ⊢
  refine ⟨valid.1, ?_⟩
  cases declared : program.compensationExecution with
  | none => simpa only [declared] using valid.2
  | some declaration =>
      simp only [declared, Bool.and_eq_true] at valid ⊢
      have previous := valid.2
      obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨order, unique⟩, owners⟩, triggers⟩, waitOrder⟩,
        waitUnique⟩, matching⟩, oneWait⟩, collision⟩, triggerBound⟩, handlerBound⟩,
        byteBound⟩, control⟩ := previous
      refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨order, unique⟩, owners⟩, ?_⟩, waitOrder⟩,
        waitUnique⟩, matching⟩, oneWait⟩, collision⟩, triggerBound⟩, handlerBound⟩,
        byteBound⟩, ?_⟩
      · simp only [List.all_eq_true] at triggers ⊢
        intro trigger member
        have previous := triggers trigger member
        change (match program.operations.filter (fun operation =>
            operation.id == declaration.triggerOperationId) with
          | [.triggerCompensation _ _ _ _ _] => _ && lifecycle state trigger
          | _ => false) = true at previous
        change (match program.operations.filter (fun operation =>
            operation.id == declaration.triggerOperationId) with
          | [.triggerCompensation _ _ _ _ _] => _ && lifecycle
              { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences }
              trigger
          | _ => false) = true
        split at previous
        ·
            simp only [Bool.and_eq_true] at previous ⊢
            exact ⟨previous.1, preservesLifecycle trigger previous.2⟩
        · contradiction
      · change (match state.control with
          | .notStarted => _
          | .running _ => _
          | .completed _ | .cancelled _ => _
          | .failed .. => _) = true at control ⊢
        simpa only [running] using control

end BpmnSemantics.SemanticProcess

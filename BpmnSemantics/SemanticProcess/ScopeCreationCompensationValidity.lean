import BpmnSemantics.SemanticProcess.ScopeInsertionValidity
import BpmnSemantics.SemanticProcess.TransactionScopeCreationDomain

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
    (program : Program) (domain : RootCompensationExecutionDomain program)
    (state : RuntimeState) (inserted : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ inserted.id)
    (valid : compensationActivityRetentionStateValid program state = true) :
    compensationActivityRetentionStateValid program
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences } =
      true := by
  unfold compensationActivityRetentionStateValid at valid ⊢
  simp only [Bool.and_eq_true] at valid ⊢
  refine ⟨valid.1, ?_⟩
  cases declared : program.compensationActivityRetention with
  | none => simpa only [declared] using valid.2
  | some declaration =>
      have parentAbsent := compensationActivityRetention_root_parent_absent program declaration
        declared domain valid.1
      cases control : state.control <;> simp only [declared, control, parentAbsent] at valid ⊢
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
    (program : Program) (domain : RootCompensationExecutionDomain program)
    (state : RuntimeState) (inserted : RuntimeScopeOccurrence)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ inserted.id)
    (valid : compensationExecutionStateValid program state = true) :
    compensationExecutionStateValid program
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences } = true := by
  have preservesLifecycle (trigger : CompensationTriggerExecution)
      (prior : triggerLifecycleValid false state trigger = true) :
      triggerLifecycleValid false
        { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences }
        trigger = true := by
    cases lifecycle : trigger.lifecycle with
    | succeeded | failed => simpa [triggerLifecycleValid, lifecycle] using prior
    | active =>
        simp only [triggerLifecycleValid, lifecycle, Bool.not_false, Bool.true_or, Bool.true_and,
          Bool.and_eq_true, decide_eq_true_eq, Bool.false_eq_true, ↓reduceIte] at prior ⊢
        have present : ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = trigger.owner := by
          have nonempty : (state.scopeOccurrences.filter fun occurrence =>
              occurrence.id == trigger.owner && occurrence.parent.isNone) ≠ [] := by
            intro empty
            simp [empty] at prior
          obtain ⟨occurrence, member⟩ := List.exists_mem_of_ne_nil _ nonempty
          obtain ⟨member, matched⟩ := List.mem_filter.mp member
          simp only [Bool.and_eq_true, beq_iff_eq] at matched
          exact ⟨occurrence, member, matched.1⟩
        obtain ⟨occurrence, member, identity⟩ := present
        have different : inserted.id ≠ trigger.owner := by
          intro same
          exact fresh occurrence member (identity.trans same.symm)
        have lookup := filter_canonicalInsertBy_rejected scopeOccurrenceBefore
          (fun occurrence => occurrence.id == trigger.owner && occurrence.parent.isNone)
          inserted state.scopeOccurrences (by simp [different])
        simpa only [insertScopeOccurrence, lookup] using prior
  apply compensationExecutionStateValid_running_of_matches program state
    { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences }
    instanceId running rfl rfl rfl rfl rfl valid
  intro declaration declared trigger member
  have matching := compensationExecutionStateValid_trigger program state declaration declared valid trigger member
  unfold triggerMatchesDeclaration at matching ⊢
  split at matching
  · have lifecycle := (Bool.and_eq_true_iff.mp matching).2
    have preserved := preservesLifecycle trigger lifecycle
    simpa only [Bool.and_eq_true, lifecycle, preserved, and_true] using matching
  · rename_i id origin scope input output boundary selected
    have member : .cancelTransaction id origin scope input output boundary ∈ program.operations := by
      have filtered : .cancelTransaction id origin scope input output boundary ∈
          program.operations.filter (fun operation => operation.id == declaration.triggerOperationId) := by
        rw [selected]
        exact List.mem_singleton_self _
      exact (List.mem_filter.mp filtered).1
    exact False.elim (domain _ member)
  · contradiction

end BpmnSemantics.SemanticProcess

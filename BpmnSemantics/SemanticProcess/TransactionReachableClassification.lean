import BpmnSemantics.SemanticProcess.TransactionExecutionPhases

/-! # Complete Transaction reachable-frontier classification

The actual admission and command/prefix induction derive the only multi-operation state. Every
other reached prefix has at most one offered transition, with transition multiplicity preserved.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics TransactionProgramRoles InternalCommutation

private def appliedOperation : InternalOperationAttempt → Option SemanticOperation
  | .applied step => some step.operation
  | _ => none

private theorem attempt_operation_filter (p : Program) (state : RuntimeState)
    (operations : List SemanticOperation) :
    (operations.map (fun operation => attemptInternalOperation p operation state)).filterMap appliedOperation =
      operations.filter (fun operation => (appliedOperation (attemptInternalOperation p operation state)).isSome) := by
  induction operations with
  | nil => rfl
  | cons operation rest ih =>
    have identity := attemptInternalOperation_operation_identity p operation state
    cases attempted : attemptInternalOperation p operation state
    all_goals rw [attempted] at identity
    all_goals simp only [InternalOperationAttempt.operation] at identity
    all_goals simp [attempted, appliedOperation, ih, identity]

/-- The admitted operation inventory prevents duplicate offers even after canonical sorting. -/
theorem transaction_frontier_operations_nodup (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) :
    ((snapshotInternalTransitionFrontier p state).transitions.map (·.1)).Nodup := by
  have inventory := roles.operationsExact
  simp only [exactInventory_eq, Bool.and_eq_true, decide_eq_true_eq] at inventory
  have operations : p.operations.Nodup := inventory.1.1.1
  let attempts := p.operations.map (fun operation => attemptInternalOperation p operation state)
  let select : InternalOperationAttempt → Option (SemanticOperation × RuntimeState) := fun
    | .applied step => some (step.operation, step.successor)
    | .disabled _ | .refused _ _ => none
  have mapped : ((attempts.filterMap select).map Prod.fst) = attempts.filterMap appliedOperation := by
    rw [List.map_filterMap]
    congr 1
    funext value
    cases value <;> rfl
  have perm : ((snapshotInternalTransitionFrontier p state).transitions.map (·.1)).Perm
      (p.operations.filter (fun operation => (appliedOperation (attemptInternalOperation p operation state)).isSome)) := by
    simp only [snapshotInternalTransitionFrontier, canonicalEnabledInternalTransitions, snapshot_sort_eq]
    apply List.Perm.trans ((sortBy_permutation _ _).map Prod.fst)
    apply List.Perm.trans (((sortBy_permutation _ _).filterMap select).map Prod.fst)
    exact List.Perm.of_eq (mapped.trans (attempt_operation_filter p state p.operations))
  exact perm.nodup_iff.mpr (operations.filter _)

private theorem only_one_operation_bound (p : Program) (roles : TransactionAdmittedRoles p)
    (state : RuntimeState) (selected : SemanticOperation)
    (onlySelected : ∀ operation after, (operation, after) ∈
      (snapshotInternalTransitionFrontier p state).transitions → operation = selected) :
    (snapshotInternalTransitionFrontier p state).transitions.length ≤ 1 := by
  have unique := transaction_frontier_operations_nodup p roles state
  cases values : (snapshotInternalTransitionFrontier p state).transitions with
  | nil => simp
  | cons first rest =>
    cases rest with
    | nil => simp
    | cons second tail =>
      have one := onlySelected first.1 first.2 (by simp [values])
      have two := onlySelected second.1 second.2 (by simp [values])
      simp [values, one, two] at unique

/-- The complete selected grammar has one possible multiple-offer state: the exact initial split. -/
theorem transaction_reachable_frontier_classification (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (graph : transactionCancellationProgramGraph p = true)
    (wellFormed : programWellFormed p = true) (state : RuntimeState)
    (reachable : TransactionInternalPrefixReachable p state) :
    (snapshotInternalTransitionFrontier p state).transitions.length ≤ 1 ∨
      ∃ instanceId, nonempty instanceId.value = true ∧ state = transactionSplitState roles instanceId [] := by
  have phase := transaction_reachable_prefix_phase p roles heads graph wellFormed state reachable
  cases phase with
  | initial => exact Or.inl (by simp [transaction_initial_frontier_empty p roles graph])
  | start instanceId nonemptyId =>
      exact Or.inl (only_one_operation_bound p roles _ roles.start
        (fun operation after offered => (transaction_pending_only_start p roles graph instanceId operation after offered).1))
  | initiated instanceId nonemptyId =>
      exact Or.inl (only_one_operation_bound p roles _ roles.entry
        (fun operation after offered => (transaction_initiated_only_entry p roles graph wellFormed instanceId operation after offered).1))
  | entered instanceId nonemptyId =>
      exact Or.inl (only_one_operation_bound p roles _ roles.split
        (fun operation after offered => (transaction_entered_only_split p roles graph instanceId operation after offered).1))
  | split instanceId nonemptyId => exact Or.inr ⟨instanceId, nonemptyId, rfl⟩
  | one instanceId nonemptyId reverse =>
      exact Or.inl (transaction_one_arm_frontier_cardinality p roles heads graph instanceId [] reverse)
  | continuation state invariant =>
      obtain ⟨leaf, shape, owned, _⟩ := invariant.scopes
      exact Or.inl (transaction_leaf_owned_scope_frontier_bound p roles _ leaf shape graph
        invariant.continuation.consumed invariant.continuation.tokenBound owned
        (fun token member => (invariant.continuation.tokenPlaces token member).2.2))

private theorem two_values_orders {α : Type} (values : List α) (left right : α)
    (different : left ≠ right) (unique : values.Nodup)
    (members : ∀ value, value ∈ values ↔ value = left ∨ value = right) :
    values = [left, right] ∨ values = [right, left] := by
  have singleton (entries : List α) (selected : α) (nodup : entries.Nodup)
      (present : selected ∈ entries) (onlySelected : ∀ value ∈ entries, value = selected) : entries = [selected] := by
    cases entries with
    | nil => contradiction
    | cons first rest =>
      have same := onlySelected first List.mem_cons_self
      subst first
      cases rest with
      | nil => rfl
      | cons second tail =>
        have same := onlySelected second (by simp)
        simp [same] at nodup
  cases values with
  | nil => have present := (members left).mpr (Or.inl rfl); contradiction
  | cons first rest =>
    have choice := (members first).mp List.mem_cons_self
    have noFirst := (List.nodup_cons.mp unique).1
    have tailUnique := (List.nodup_cons.mp unique).2
    rcases choice with same | same
    · subst first
      have other : right ∈ rest := by
        have present := (members right).mpr (Or.inr rfl)
        simpa [Ne.symm different] using present
      have exactTail := singleton rest right tailUnique other (by
        intro value present
        rcases (members value).mp (List.mem_cons_of_mem left present) with same | same
        · subst value; exact False.elim (noFirst present)
        · exact same)
      exact Or.inl (by rw [exactTail])
    · subst first
      have other : left ∈ rest := by
        have present := (members left).mpr (Or.inl rfl)
        simpa [different] using present
      have exactTail := singleton rest left tailUnique other (by
        intro value present
        rcases (members value).mp (List.mem_cons_of_mem right present) with same | same
        · exact same
        · subst value; exact False.elim (noFirst present))
      exact Or.inr (by rw [exactTail])

/-- The complete canonical frontier contains both initial Tasks exactly once, in one of the two orders. -/
theorem transaction_split_frontier_orders (p : Program) (roles : TransactionAdmittedRoles p)
    (heads : TransactionInitialTasks roles) (graph : transactionCancellationProgramGraph p = true)
    (instanceId : SemanticId) :
    let operations := (snapshotInternalTransitionFrontier p (transactionSplitState roles instanceId [])).transitions.map (·.1)
    operations = [heads.left.operation, heads.right.operation] ∨
      operations = [heads.right.operation, heads.left.operation] := by
  have consumers := transaction_initial_heads_consumers p roles heads
  have different : heads.left.operation ≠ heads.right.operation := by
    intro same
    have left := (soleConsumer_facts p roles.left heads.left.operation consumers.1).2
    have right := (soleConsumer_facts p roles.right heads.right.operation consumers.2).2
    rw [same, right] at left
    exact transaction_admitted_split_places_distinct p roles (Option.some.inj left).symm
  apply two_values_orders _ heads.left.operation heads.right.operation different
    (transaction_frontier_operations_nodup p roles _) _
  intro operation
  constructor
  · intro member
    obtain ⟨⟨selected, after⟩, offered, same⟩ := List.mem_map.mp member
    change selected = operation at same
    subst selected
    exact transaction_initial_frontier_only_heads p roles heads graph instanceId [] operation after offered
  · intro selected
    have offered := transaction_initial_frontier_contains_heads p roles heads instanceId []
    rcases selected with same | same
    · subst operation; exact List.mem_map.mpr ⟨_, offered.1, rfl⟩
    · subst operation; exact List.mem_map.mpr ⟨_, offered.2, rfl⟩

end BpmnSemantics.SemanticProcess

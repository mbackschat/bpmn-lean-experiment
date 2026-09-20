import BpmnSemantics.SemanticProcess.InternalRegionalOpenOwnership
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycleOrder

/-! Regional projection removal preserves ordered multiplicity through successful optional
projection and the lifecycle's canonical ordering. Source retention stays independent of projected
ownership because a scope occurrence is owned by its surviving parent.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

theorem mapM_filter_preserves_success (values : List α) (before after : α → Option β)
    (sourceKeep : α → Bool) (entryKeep : β → Bool) (outputs : List β)
    (prior : values.mapM before = some outputs)
    (correspondence : ∀ value ∈ values, ∀ entry, before value = some entry →
      sourceKeep value = entryKeep entry)
    (preserved : ∀ value ∈ values, ∀ entry, before value = some entry →
      sourceKeep value = true → after value = some entry) :
    (values.filter sourceKeep).mapM after = some (outputs.filter entryKeep) := by
  induction values generalizing outputs with
  | nil =>
      have empty : outputs = [] := by simpa using prior
      simp [empty]
  | cons head tail ih =>
      simp only [List.mapM_cons, bind, Option.bind] at prior
      cases first : before head with
      | none => simp [first] at prior
      | some entry =>
          cases rest : tail.mapM before with
          | none => simp [first, rest] at prior
          | some entries =>
              simp only [first, rest, pure, Pure.pure, Option.some.injEq] at prior
              subst outputs
              have tailResult := ih entries rest
                (fun value member => correspondence value (List.mem_cons_of_mem head member))
                (fun value member => preserved value (List.mem_cons_of_mem head member))
              have agrees := correspondence head (List.mem_cons_self) entry first
              cases kept : sourceKeep head with
              | false => simp [kept, ← agrees, tailResult]
              | true =>
                  have retained := preserved head (List.mem_cons_self) entry first kept
                  simp [kept, ← agrees, List.mapM_cons, retained, tailResult]

theorem mapM_filter_repeated_retained (value : α) (entry : β)
    (before after : α → Option β) (sourceKeep : α → Bool) (entryKeep : β → Bool)
    (projected : before value = some entry) (retained : after value = some entry)
    (sourceKept : sourceKeep value = true) (entryKept : entryKeep entry = true) :
    ([value, value].filter sourceKeep).mapM after = some [entry, entry] ∧
      ([value, value].filter sourceKeep).mapM after ≠ some [entry] := by
  have exactProjection := mapM_filter_preserves_success [value, value] before after
    sourceKeep entryKeep [entry, entry]
    (by simp [List.mapM_cons, projected])
    (by
      intro actual member result found
      simp only [List.mem_cons, List.not_mem_nil, or_false, or_self] at member
      subst actual
      have same : entry = result := Option.some.inj (projected.symm.trans found)
      subst result
      simp [sourceKept, entryKept])
    (by intro actual member result found _; simp only [List.mem_cons, List.not_mem_nil,
          or_false, or_self] at member; subst actual; simpa [projected, retained] using found)
  have twice : ([value, value].filter sourceKeep).mapM after = some [entry, entry] := by
    simpa [entryKept] using exactProjection
  exact ⟨twice, by rw [twice]; simp⟩

private theorem filter_insertBy_dropped (before : α → α → Bool) (keep : α → Bool)
    (value : α) (dropped : keep value = false) (values : List α) :
    (BpmnSemantics.SemanticProcess.insertBy before value values).filter keep = values.filter keep := by
  induction values with
  | nil => simp [BpmnSemantics.SemanticProcess.insertBy, dropped]
  | cons head tail ih =>
      simp only [BpmnSemantics.SemanticProcess.insertBy]
      split <;> simp_all [List.filter_cons]

private theorem filter_sortBy_dropped_prefix (before : α → α → Bool) (keep : α → Bool)
    (dropped values : List α) (allDropped : ∀ value ∈ dropped, keep value = false) :
    (BpmnSemantics.SemanticProcess.sortBy before (dropped ++ values)).filter keep =
      (BpmnSemantics.SemanticProcess.sortBy before values).filter keep := by
  induction dropped with
  | nil => rfl
  | cons head tail ih =>
      simp only [List.cons_append, BpmnSemantics.SemanticProcess.sortBy]
      rw [filter_insertBy_dropped before keep head (allDropped head List.mem_cons_self)]
      exact ih (fun value member => allDropped value (List.mem_cons_of_mem head member))

theorem sortFlowNodeOccurrenceStarts_filter (values : List UnnumberedFlowNodeOccurrenceStart)
    (keep : UnnumberedFlowNodeOccurrenceStart → Bool) :
    sortFlowNodeOccurrenceStarts (values.filter keep) =
      (sortFlowNodeOccurrenceStarts values).filter keep := by
  -- FlowNodeOccurrenceLifecycleOrder proves permutation invariance from startBefore's strict
  -- total order; partitioning then moves every discarded insertion before the retained suffix.
  have partition := List.filter_append_perm (fun value => !keep value) values
  have sorted := sortFlowNodeOccurrenceStarts_perm_eq partition
  simp only [Bool.not_not] at sorted
  rw [← sorted]
  rw [show sortFlowNodeOccurrenceStarts = BpmnSemantics.SemanticProcess.sortBy startBefore from rfl]
  rw [filter_sortBy_dropped_prefix startBefore keep _ _ (by
    intro value member
    simpa using (List.mem_filter.mp member).2)]
  apply Eq.symm
  apply List.filter_eq_self.mpr
  intro value member
  have original := (mem_sortFlowNodeOccurrenceStarts value (values.filter keep)).mp member
  exact (List.mem_filter.mp original).2

theorem canonical_projection_components_remove
    (waits scopes calls nextWaits nextScopes nextCalls : List OpenSemanticFlowNodeOccurrence)
    (ended : List UnnumberedFlowNodeOccurrenceEnd)
    (waitsEq : nextWaits = removeEndedFlowNodeOccurrences waits ended)
    (scopesEq : nextScopes = removeEndedFlowNodeOccurrences scopes ended)
    (callsEq : nextCalls = removeEndedFlowNodeOccurrences calls ended) :
    sortFlowNodeOccurrenceStarts (nextWaits ++ nextScopes ++ nextCalls) =
      removeEndedFlowNodeOccurrences (sortFlowNodeOccurrenceStarts (waits ++ scopes ++ calls)) ended := by
  rw [waitsEq, scopesEq, callsEq]
  simp only [removeEndedFlowNodeOccurrences]
  rw [← List.filter_append, ← List.filter_append]
  exact sortFlowNodeOccurrenceStarts_filter _ _

end BpmnSemantics.SemanticProcess.InternalCommutation

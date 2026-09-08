import BpmnSemantics.SemanticProcess.InternalLocalControlOriginFacts

/-! The template's sort retains each resolved place once, with strict public flow order under
the alias refusal rule in the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem flow_eq_of_value (left right : SequenceFlowId)
    (same : left.value = right.value) : left = right := by
  cases left
  cases right
  exact congrArg SequenceFlowId.mk same

theorem localControl_eraseDups_nodup [BEq α] [LawfulBEq α] (values : List α) :
    values.eraseDups.Nodup := by
  cases values with
  | nil => simp
  | cons head tail =>
      rw [List.eraseDups_cons, List.nodup_cons]
      refine ⟨?_, localControl_eraseDups_nodup _⟩
      simp
termination_by values.length
decreasing_by have := List.length_filter_le (fun b => !b == head) tail; simp_all; omega

theorem localControl_resolved_origins (program : Program) (owner : ScopeOccurrenceId)
    (places : List ControlPlaceId) (origins : List (ControlPlaceId × BpmnSequenceFlowOrigin))
    (mapped : places.mapM (fun place => do
      let origin ← internalLocalControlPlaceOrigin? program place owner
      pure (place, origin)) = some origins) :
    origins.map Prod.fst = places ∧
      ∀ pair ∈ origins, internalLocalControlPlaceOrigin? program pair.1 owner = some pair.2 := by
  induction places generalizing origins with
  | nil => simp at mapped; subst origins; simp
  | cons place rest ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
      obtain ⟨pair, pairFound, tailFound⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨origin, originFound, pairEq⟩ := Option.bind_eq_some_iff.mp pairFound
      cases pairEq
      obtain ⟨tail, mappedTail, resultEq⟩ := Option.bind_eq_some_iff.mp tailFound
      cases resultEq
      obtain ⟨placesEq, resolved⟩ := ih tail mappedTail
      refine ⟨by simp [placesEq], ?_⟩
      intro candidate member
      rcases List.mem_cons.mp member with rfl | member
      · exact originFound
      · exact resolved candidate member

private theorem sortInsert_flow_strict (key : α → String) (value : α) (values : List α)
    (ordered : values.Pairwise (fun left right => key left < key right))
    (fresh : ∀ other ∈ values, key value ≠ key other) :
    (sortInsertBy (fun left right => decide (key left < key right)) value values).Pairwise
      (fun left right => key left < key right) := by
  induction values with
  | nil => simp [sortInsertBy]
  | cons head tail ih =>
      obtain ⟨before, tailOrder⟩ := List.pairwise_cons.mp ordered
      by_cases lt : key value < key head
      · simp only [sortInsertBy, lt, decide_true, if_true, List.pairwise_cons]
        refine ⟨?_, before, tailOrder⟩
        intro other member
        rcases List.mem_cons.mp member with rfl | member
        · exact lt
        · exact String.lt_trans lt (before other member)
      · simp only [sortInsertBy, lt, decide_false, Bool.false_eq_true, if_false, List.pairwise_cons]
        refine ⟨?_, ih tailOrder (fun other member => fresh other (by simp [member]))⟩
        intro other member
        rcases (mem_sortInsertBy _ _ _ _).mp member with rfl | member
        · apply String.not_le.mp
          intro reverse
          exact fresh head (by simp) (String.le_antisymm reverse (String.not_lt.mp lt))
        · exact before other member

theorem localControl_sort_flow_strict (key : α → String) (values : List α)
    (unique : (values.map key).Nodup) :
    (sortBy (fun left right => decide (key left < key right)) values).Pairwise
      (fun left right => key left < key right) := by
  induction values with
  | nil => simp [sortBy]
  | cons head tail ih =>
      simp only [List.map_cons, List.nodup_cons] at unique
      apply sortInsert_flow_strict key head _ (ih unique.2)
      intro other member same
      apply unique.1
      rw [same]
      exact List.mem_map.mpr ⟨other, (mem_sortBy _ _ _).mp member, rfl⟩

theorem localControl_resolved_flow_nodup (program : Program) (owner : ScopeOccurrenceId)
    (origins : List (ControlPlaceId × BpmnSequenceFlowOrigin))
    (unique : (origins.map Prod.fst).Nodup)
    (resolved : ∀ pair ∈ origins,
      internalLocalControlPlaceOrigin? program pair.1 owner = some pair.2) :
    (origins.map fun pair => pair.2.elementId.value).Nodup := by
  induction origins with
  | nil => simp
  | cons head tail ih =>
      simp only [List.map_cons, List.nodup_cons] at unique ⊢
      refine ⟨?_, ih unique.2 (fun pair member => resolved pair (by simp [member]))⟩
      intro member
      obtain ⟨other, member, same⟩ := List.mem_map.mp member
      have flowEq := flow_eq_of_value head.2.elementId other.2.elementId same.symm
      have placeEq := internalLocalControlPlaceOrigin?_injective program head.1 other.1 owner
        head.2 other.2 (resolved head (by simp)) (resolved other (by simp [member])) flowEq
      apply unique.1
      exact List.mem_map.mpr ⟨other, member, placeEq.symm⟩

end BpmnSemantics.SemanticProcess.InternalCommutation

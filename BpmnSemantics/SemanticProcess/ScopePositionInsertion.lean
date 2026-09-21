import BpmnSemantics.SemanticProcess.ControlPositionProjection

/-! Fresh scope insertion retains the complete public payload. The proof uses permutations and
identity freshness, not comparator equality for potentially different same-id payloads, under the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md). -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def scopePosition (program : Program) (occurrence : RuntimeScopeOccurrence) :
    PublicScopePosition :=
  { id := occurrence.id, parent := occurrence.parent
    bpmnElementId := match uniqueDefinitionScope? program occurrence.id.definitionScopeId with
      | some scope => scope.originElementId
      | none => ⟨""⟩ }

private theorem insertion_perm (before : α → α → Bool) (value : α) (values : List α) :
    (canonicalInsertBy before value values).Perm (value :: values) := by
  induction values with
  | nil => exact List.Perm.refl _
  | cons current rest ih =>
      simp only [canonicalInsertBy]
      split
      · exact List.Perm.refl _
      · exact (List.Perm.cons current ih).trans (List.Perm.swap _ _ _)

theorem projected_cons (program : Program) (occurrence : RuntimeScopeOccurrence)
    (occurrences : List RuntimeScopeOccurrence) :
    projectScopes program (occurrence :: occurrences) =
      canonicalInsertBy (fun left right : PublicScopePosition => scopeOwnerBefore left.id right.id)
        (scopePosition program occurrence) (projectScopes program occurrences) := by
  conv => lhs; unfold projectScopes
  generalize projectScopes program occurrences = positions
  induction positions with
  | nil => rfl
  | cons current rest ih =>
      change (if scopeOwnerBefore occurrence.id current.id then _ else current :: _) =
        (if scopeOwnerBefore occurrence.id current.id then _ else current :: _)
      split
      · rfl
      · exact congrArg (List.cons current) ih

private theorem projection_perm (program : Program) (occurrences : List RuntimeScopeOccurrence) :
    (projectScopes program occurrences).Perm (occurrences.map (scopePosition program)) := by
  induction occurrences with
  | nil => exact List.Perm.refl _
  | cons occurrence rest ih =>
      rw [projected_cons]
      exact (insertion_perm _ _ _).trans (List.Perm.cons _ ih)

private theorem difference_of_fresh_perm (before after : List PublicScopePosition)
    (inserted : PublicScopePosition) (permutation : after.Perm (inserted :: before))
    (fresh : inserted ∉ before) :
    scopeDifference after before = [inserted] ∧ scopeDifference before after = [] := by
  have oldRemoved : scopeDifference before before = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro position member
    have present : (before.any fun candidate => candidate == position) = true :=
      List.any_eq_true.mpr ⟨position, member, by simp⟩
    simp [present]
  have insertedMissing : (before.any fun candidate => candidate == inserted) = false := by
    apply Bool.eq_false_iff.mpr
    intro present
    obtain ⟨candidate, member, same⟩ := List.any_eq_true.mp present
    exact fresh ((beq_iff_eq.mp same) ▸ member)
  constructor
  · have filtered := permutation.filter (fun position => !(before.any fun candidate => candidate == position))
    have simplified : scopeDifference (inserted :: before) before = [inserted] := by
      simp only [scopeDifference, List.filter_cons, insertedMissing, Bool.not_false,
        if_true]
      change inserted :: scopeDifference before before = [inserted]
      rw [oldRemoved]
    change (scopeDifference after before).Perm (scopeDifference (inserted :: before) before) at filtered
    rw [simplified] at filtered
    exact List.perm_singleton.mp filtered
  · apply List.filter_eq_nil_iff.mpr
    intro position member
    have present : (after.any fun candidate => candidate == position) = true :=
      List.any_eq_true.mpr ⟨position, permutation.symm.subset (by simp [member]), by simp⟩
    simp [present]

/-- One fresh complete identity creates exactly its immutable public scope position. -/
theorem projectScopes_insert_differences (program : Program)
    (occurrences : List RuntimeScopeOccurrence) (inserted : RuntimeScopeOccurrence)
    (definition : DefinitionScope)
    (binding : uniqueDefinitionScope? program inserted.id.definitionScopeId = some definition)
    (fresh : ∀ occurrence ∈ occurrences, occurrence.id ≠ inserted.id) :
    scopeDifference (projectScopes program (insertScopeOccurrence inserted occurrences))
        (projectScopes program occurrences) =
      [{ id := inserted.id, parent := inserted.parent, bpmnElementId := definition.originElementId }] ∧
    scopeDifference (projectScopes program occurrences)
        (projectScopes program (insertScopeOccurrence inserted occurrences)) = [] := by
  have permutation : (projectScopes program (insertScopeOccurrence inserted occurrences)).Perm
      (scopePosition program inserted :: projectScopes program occurrences) :=
    (projection_perm _ _).trans (((insertion_perm scopeOccurrenceBefore inserted occurrences).map
      (scopePosition program)).trans (List.Perm.cons _ (projection_perm _ _).symm))
  have absent : scopePosition program inserted ∉ projectScopes program occurrences := by
    intro member
    obtain ⟨occurrence, member, same⟩ := List.mem_map.mp ((projection_perm _ _).subset member)
    exact fresh occurrence member (congrArg PublicScopePosition.id same)
  simpa only [scopePosition, binding] using
    difference_of_fresh_perm _ _ _ permutation absent

/-- Filtering runtime scope identities retains exactly the same complete public scope payloads. -/
theorem projectScopes_filter_membership (program : Program) (occurrences : List RuntimeScopeOccurrence)
    (keep : ScopeOccurrenceId → Bool) (position : PublicScopePosition) :
    position ∈ projectScopes program (occurrences.filter fun scope => keep scope.id) ↔
      position ∈ projectScopes program occurrences ∧ keep position.id = true := by
  constructor
  · intro member
    obtain ⟨scope, present, equal⟩ := List.mem_map.mp ((projection_perm _ _).subset member)
    obtain ⟨present, retained⟩ := List.mem_filter.mp present
    refine ⟨(projection_perm _ _).symm.subset (List.mem_map.mpr ⟨scope, present, equal⟩), ?_⟩
    simpa only [← equal, scopePosition] using retained
  · rintro ⟨member, retained⟩
    obtain ⟨scope, present, equal⟩ := List.mem_map.mp ((projection_perm _ _).subset member)
    apply (projection_perm _ _).symm.subset
    exact List.mem_map.mpr ⟨scope, List.mem_filter.mpr ⟨present,
      by simpa only [← equal, scopePosition] using retained⟩, equal⟩

/-- Scope deletion publishes every removed predecessor payload, with no entered scope. -/
theorem projectScopes_filter_differences (program : Program) (occurrences : List RuntimeScopeOccurrence)
    (keep : ScopeOccurrenceId → Bool) :
    scopeDifference (projectScopes program occurrences)
        (projectScopes program (occurrences.filter fun scope => keep scope.id)) =
      (projectScopes program occurrences).filter (fun position => !(keep position.id)) ∧
    scopeDifference (projectScopes program (occurrences.filter fun scope => keep scope.id))
        (projectScopes program occurrences) = [] := by
  constructor
  · apply List.filter_congr
    intro position member
    have present : ((projectScopes program (occurrences.filter fun scope => keep scope.id)).any
        fun candidate => candidate == position) = keep position.id := by
      apply Bool.eq_iff_iff.mpr
      simp [List.any_eq_true, projectScopes_filter_membership, member]
    exact congrArg Bool.not present
  · apply List.filter_eq_nil_iff.mpr
    intro position member removed
    have prior := (projectScopes_filter_membership program occurrences keep position).mp member |>.1
    have present : ((projectScopes program occurrences).any fun candidate => candidate == position) = true :=
      List.any_eq_true.mpr ⟨position, prior, by simp⟩
    simp [present] at removed

end BpmnSemantics.SemanticProcess

import BpmnSemantics.SemanticProcess.ScopeStorageOrder

/-! # Fresh scope insertion and existing ownership

The scope-creation validity proof needs singleton lookups to survive insertion, not merely
membership. These laws preserve the existing ownership checks without assuming successor validity.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem exactLiveOccurrence_insertScopeOccurrence_of_ne (state : RuntimeState)
    (inserted : RuntimeScopeOccurrence) (owner : ScopeOccurrenceId)
    (different : inserted.id ≠ owner) :
    exactLiveOccurrence
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences } owner =
      exactLiveOccurrence state owner := by
  simp only [exactLiveOccurrence, insertScopeOccurrence, length_filter_canonicalInsertBy]
  simp [different]

theorem exactLiveOccurrence_insertScopeOccurrence_created (state : RuntimeState)
    (inserted : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ inserted.id) :
    exactLiveOccurrence
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences }
      inserted.id = true := by
  have absent : state.scopeOccurrences.filter (fun occurrence =>
      decide (occurrence.id = inserted.id)) = [] := by
    simp only [List.filter_eq_nil_iff, decide_eq_true_eq]
    exact fresh
  simp [exactLiveOccurrence, insertScopeOccurrence, length_filter_canonicalInsertBy, absent]

theorem exactLiveOccurrence_insertScopeOccurrence_preserves (state : RuntimeState)
    (inserted : RuntimeScopeOccurrence) (owner : ScopeOccurrenceId)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ inserted.id)
    (live : exactLiveOccurrence state owner = true) :
    exactLiveOccurrence
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences }
      owner = true := by
  have different : inserted.id ≠ owner := by
    intro same
    have absent : state.scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.id = owner)) = [] := by
      simp only [List.filter_eq_nil_iff, decide_eq_true_eq]
      simpa [same] using fresh
    simp [exactLiveOccurrence, absent] at live
  rw [exactLiveOccurrence_insertScopeOccurrence_of_ne state inserted owner different]
  exact live

/-- Equal complete identities invalidate singleton ownership even when the parent payload differs. -/
theorem exactLiveOccurrence_insertScopeOccurrence_duplicate (state : RuntimeState)
    (inserted : RuntimeScopeOccurrence)
    (live : exactLiveOccurrence state inserted.id = true) :
    exactLiveOccurrence
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences }
      inserted.id = false := by
  simp only [exactLiveOccurrence, decide_eq_true_eq] at live
  simp [exactLiveOccurrence, insertScopeOccurrence, length_filter_canonicalInsertBy, live]

theorem waitOwnersLive_insertScopeOccurrence (state : RuntimeState)
    (inserted : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ inserted.id)
    (valid : waitOwnersLive state = true) :
    waitOwnersLive
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences } =
      true := by
  have preserves := exactLiveOccurrence_insertScopeOccurrence_preserves state inserted
  simp only [waitOwnersLive, Bool.and_eq_true, List.all_eq_true] at valid ⊢
  obtain ⟨⟨⟨⟨⟨⟨⟨⟨tasks, messages⟩, timers⟩, effects⟩, incidents⟩, selections⟩,
    races⟩, calls⟩, activities⟩ := valid
  exact ⟨⟨⟨⟨⟨⟨⟨⟨fun wait member => preserves wait.owner fresh (tasks wait member),
    fun wait member => preserves wait.owner fresh (messages wait member)⟩,
    fun wait member => preserves wait.owner fresh (timers wait member)⟩,
    fun wait member => preserves wait.owner fresh (effects wait member)⟩,
    fun incident member => preserves incident.wait.owner fresh (incidents incident member)⟩,
    fun record member => preserves record.owner fresh (selections record member)⟩,
    fun race member => preserves race.owner fresh (races race member)⟩,
    fun record member => preserves record.caller fresh (calls record member)⟩,
    fun record member => preserves record.owner fresh (activities record member)⟩

theorem activityRecordsOwnLiveWork_insertScopeOccurrence (state : RuntimeState)
    (inserted : RuntimeScopeOccurrence)
    (fresh : ∀ occurrence ∈ state.scopeOccurrences, occurrence.id ≠ inserted.id)
    (valid : activityRecordsOwnLiveWork state = true) :
    activityRecordsOwnLiveWork
      { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences } =
      true := by
  have bodies (record : ActivityOccurrence) (live : activityBodyLive state record = true) :
      activityBodyLive
        { state with scopeOccurrences := insertScopeOccurrence inserted state.scopeOccurrences }
        record = true := by
    cases body : record.body with
    | userTask task => simpa [activityBodyLive, body] using live
    | parallelUserTasks first rest => simpa [activityBodyLive, body] using live
    | childScope owner =>
        simp only [activityBodyLive, body]
        exact exactLiveOccurrence_insertScopeOccurrence_preserves state inserted owner fresh
          (by simpa [activityBodyLive, body] using live)
  simp only [activityRecordsOwnLiveWork, List.all_eq_true, Bool.and_eq_true] at valid ⊢
  intro record member
  have previous := valid record member
  exact ⟨⟨⟨bodies record previous.1.1.1, previous.1.1.2⟩, previous.1.2⟩, previous.2⟩

end BpmnSemantics.SemanticProcess

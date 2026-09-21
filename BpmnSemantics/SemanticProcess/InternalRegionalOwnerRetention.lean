import BpmnSemantics.SemanticProcess.InternalRegionalOwnershipClosure

/-! RSI-OWN-01 gives every Activity a live owning scope independently of its body.
REG-OWN-CLOSE-01 must retain that owner whenever it retains the Activity record. -/

namespace BpmnSemantics.SemanticProcess

def regionalActivityOwnersClosed (state : RuntimeState) (keep : RegionalReferenceRetention) : Bool :=
  state.activityOccurrences.all fun record => !keep.activity record ||
    allMatchingRetained state.scopeOccurrences keep.scope (fun scope => decide (scope.id = record.owner))

theorem regionalActivityOwnersClosed_preserves_owners (before after : RuntimeState)
    (keep : RegionalReferenceRetention)
    (closed : regionalActivityOwnersClosed before keep = true)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter keep.scope)
    (activities : after.activityOccurrences = before.activityOccurrences.filter keep.activity)
    (live : before.activityOccurrences.all (fun record => exactLiveOccurrence before record.owner) = true) :
    after.activityOccurrences.all (fun record => exactLiveOccurrence after record.owner) = true := by
  rw [activities]
  apply List.all_eq_true.mpr
  intro record member
  obtain ⟨prior, kept⟩ := List.mem_filter.mp member
  have ownerClosed := List.all_eq_true.mp closed record prior
  simp only [kept, Bool.not_true, Bool.false_or] at ownerClosed
  have census := allMatchingRetained_preserves_census _ _ _ ownerClosed
  simpa only [exactLiveOccurrence, scopes, census] using List.all_eq_true.mp live record prior

theorem regionalActivityOwnersClosed_after_filter (before after : RuntimeState)
    (first second : RegionalReferenceRetention)
    (closed : regionalActivityOwnersClosed before second = true)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter first.scope)
    (activities : after.activityOccurrences = before.activityOccurrences.filter first.activity) :
    regionalActivityOwnersClosed after second = true := by
  rw [regionalActivityOwnersClosed, activities]
  apply List.all_eq_true.mpr
  intro record member
  have prior := List.all_eq_true.mp closed record (List.mem_filter.mp member).1
  cases kept : second.activity record with
  | false => simp
  | true =>
      simp only [kept, Bool.not_true, Bool.false_or] at prior ⊢
      rw [scopes]
      exact allMatchingRetained_filter _ _ _ _ prior

/-- A surviving body does not excuse removing the retained record's owning scope
under RSI-OWN-01. The refusal applies to every regional retention mask. -/
theorem regionalActivityOwnersClosed_refuses_removed_owner (state : RuntimeState)
    (keep : RegionalReferenceRetention) (record : ActivityOccurrence) (scope : RuntimeScopeOccurrence)
    (recordMember : record ∈ state.activityOccurrences) (scopeMember : scope ∈ state.scopeOccurrences)
    (owner : scope.id = record.owner) (retained : keep.activity record = true)
    (removed : keep.scope scope = false) : regionalActivityOwnersClosed state keep = false := by
  apply Bool.eq_false_iff.mpr
  intro closed
  have refs := List.all_eq_true.mp closed record recordMember
  simp only [retained, Bool.not_true, Bool.false_or] at refs
  have scopeKept := List.all_eq_true.mp refs scope scopeMember
  simp [owner, removed] at scopeKept

end BpmnSemantics.SemanticProcess

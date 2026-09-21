import BpmnSemantics.SemanticProcess.InternalRegionalPairSelectionFrame

/-! Bounded completion withdraws a parent-owned Activity and deadline outside its child region. Explicit Activity and Timer reads protect that selection where root disjointness alone would be insufficient. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem regional_pair_read_activity_retained (before : RuntimeState)
    (left : InternalRegionalSelection) (leftRegion : InternalOccurrenceRegion)
    (leftFootprint rightFootprint : InternalRegionalStateFootprint)
    (leftFound : regionalStateFootprint? before left leftRegion = some leftFootprint)
    (independent : regionalStateFootprintsIndependent leftFootprint rightFootprint = true)
    (record : ActivityOccurrence) (member : record ∈ before.activityOccurrences)
    (read : .activityAssociation record ∈ rightFootprint.reads) :
    (regionalSelectionReferenceRetention before left).activity record = true := by
  cases kept : (regionalSelectionReferenceRetention before left).activity record with
  | true => rfl
  | false =>
      have written := regionalStateFootprint_protects_withdrawn_activity before left leftRegion leftFootprint
        record member kept leftFound
      have separated := regional_independent_read_write _ _ independent _ _ written read
      simp [regionalStateAtomsConflict, regionalActivityAssociationsConflict, sameActivityOccurrence] at separated

private theorem activity_lookup_retained (before after : RuntimeState)
    (keep : ActivityOccurrence → Bool) (child : ScopeOccurrenceId) (record : ActivityOccurrence)
    (fields : after.activityOccurrences = before.activityOccurrences.filter keep)
    (found : activityOccurrenceForScope? before.activityOccurrences child = some record)
    (kept : keep record = true) :
    activityOccurrenceForScope? after.activityOccurrences child = some record := by
  unfold activityOccurrenceForScope? at found ⊢
  split at found
  · rename_i actual census
    cases found
    rw [fields, regional_pair_retained_singleton _ keep _ record census kept]
  · contradiction

/-- A surviving bounded Activity retains every attached Timer census by REG-OWN-CLOSE-01;
the pair need not re-prove Timer identity or enumerate the regional deletion families. -/
theorem regional_pair_completion_withdrawal (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation : SemanticOperation)
    (left right : PreparedInternalRegional) (definition : DefinitionScopeId)
    (choice : InternalCompletionWithdrawal)
    (valid : runtimeStateWellFormed program hosting before = true)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFootprint : regionalStateFootprint? before right.selection right.region = some right.footprint)
    (rightKind : right.selection.kind = .completing choice)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after)
    (children : after.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) =
      before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)))
    (chosen : selectInternalCompletionWithdrawal? program before definition = some choice) :
    selectInternalCompletionWithdrawal? program after definition = some choice := by
  cases choice with
  | unbounded =>
      exact (completionWithdrawal_unbounded program after definition
        (completionWithdrawal_unbounded_facts program before definition chosen)).1
  | bounded record deadline =>
      obtain ⟨declaration, child, parent, attached, declarations, childCensus, parentEq,
        recordFound, recordOwner, handlers, timerElement, timerCensus, deadlineOwner⟩ :=
        completionWithdrawal_bounded_facts program before definition record deadline chosen
      obtain ⟨snapshots, _, _, closed, _, footprint, _⟩ :=
        prepareInternalRegional_facts program before leftOperation left leftFound
      obtain ⟨selected, references⟩ := ownershipClosedSelection_facts program before leftOperation left.selection closed
      have member := (activityOccurrenceForScope_sound recordFound).1
      have kept := regional_pair_read_activity_retained before left.selection left.region left.footprint right.footprint
        footprint independent record member
        (regionalStateFootprint_bounded_activity_read before right.selection right.region right.footprint
          record deadline rightKind rightFootprint)
      have identities : waitIdentitiesUnique before = true := by
        simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
        simp_all only
      obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before leftOperation left leftFound
      have same : actual = after := Option.some.inj (executed.symm.trans applied)
      subst actual
      have fields := regionalSelection_reference_fields program before after leftOperation left.selection
        snapshots identities selected fired
      have recordAfter := activity_lookup_retained before after
        (regionalSelectionReferenceRetention before left.selection).activity child.id record fields.2.1 recordFound kept
      have recordClosed := List.all_eq_true.mp (Bool.and_eq_true_iff.mp references).1 record member
      simp only [kept, Bool.not_true, Bool.false_or] at recordClosed
      have timerClosed := List.all_eq_true.mp (Bool.and_eq_true_iff.mp recordClosed).2 (.timer attached)
        (by simp [handlers])
      have timerAfter := allMatchingRetained_preserves_census before.timerWaits
        (regionalSelectionReferenceRetention before left.selection).timer (timerIdNamesWait attached) timerClosed
      exact completionWithdrawal_bounded_of_facts program after definition declaration child parent record attached deadline
        declarations (children.trans childCensus) parentEq recordAfter recordOwner handlers timerElement
        (by rw [fields.2.2.2.2.1, timerAfter]; exact timerCensus) deadlineOwner

end BpmnSemantics.SemanticProcess.InternalCommutation

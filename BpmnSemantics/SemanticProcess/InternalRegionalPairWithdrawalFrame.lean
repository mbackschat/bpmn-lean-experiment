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
  | monitored record deadline =>
      exact (boundedWithdrawal_not_monitored program before definition record deadline chosen).elim
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

private theorem monitored_activity_read (state : RuntimeState)
    (selected : InternalRegionalSelection) (region : InternalOccurrenceRegion)
    (footprint : InternalRegionalStateFootprint) (record : ActivityOccurrence) (deadline : Option TimerWait)
    (kind : selected.kind = .completing (.monitored record deadline))
    (found : regionalStateFootprint? state selected region = some footprint) :
    .activityAssociation record ∈ footprint.reads := by
  unfold regionalStateFootprint? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨base, selectedBase, found⟩ := Option.bind_eq_some_iff.mp found
  cases found
  apply (canonicalRegionalStateAtoms_mem _ _).mpr
  unfold regionalBaseFootprint? at selectedBase
  rw [kind] at selectedBase
  repeat' first | (solve | simp at selectedBase) | split at selectedBase
  all_goals cases selectedBase <;> simp_all
  all_goals subst_vars; cases deadline <;> exact List.mem_cons_self

/-- Exact body, identity and optional Timer censuses retain monitored selection under
independent regional filtering; consumed one-shot Timers retain their empty census. -/
theorem regional_pair_subscribed_completion_withdrawal (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation : SemanticOperation)
    (left right : PreparedInternalRegional) (definition : DefinitionScopeId) (output : Option ControlPlaceId)
    (choice : InternalCompletionWithdrawal)
    (valid : runtimeStateWellFormed program hosting before = true)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFootprint : regionalStateFootprint? before right.selection right.region = some right.footprint)
    (rightKind : right.selection.kind = .completing choice)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after)
    (control : after.control = before.control)
    (children : after.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) =
      before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)))
    (parents : ∀ child parent,
      before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [child] →
      child.parent = some parent →
      after.scopeOccurrences.filter (fun scope => decide (scope.id = parent)) =
        before.scopeOccurrences.filter (fun scope => decide (scope.id = parent)))
    (chosen : selectSubscribedCompletionWithdrawal? program before definition output = some choice) :
    selectSubscribedCompletionWithdrawal? program after definition output = some choice := by
  unfold selectSubscribedCompletionWithdrawal? at chosen ⊢
  split at chosen
  · next monitored =>
    rw [if_pos monitored]
    obtain ⟨pair, _, chosen⟩ := Option.bind_eq_some_iff.mp chosen
    split at chosen
    · next addressed =>
      cases chosen
      obtain ⟨snapshots, _, _, closed, _, footprint, _⟩ :=
        prepareInternalRegional_facts program before leftOperation left leftFound
      obtain ⟨selected, references⟩ := ownershipClosedSelection_facts program before leftOperation left.selection closed
      have bound := pair.property
      obtain ⟨childCensus, childScope, parentEq, parentCensus, bodyCensus, recordCensus,
        body, owner, process, childProcess, running⟩ := bound.2.1
      have member : pair.val.record ∈ before.activityOccurrences :=
        (List.mem_filter.mp (show pair.val.record ∈ before.activityOccurrences.filter (sameActivityOccurrence pair.val.record) by
          rw [recordCensus]; simp)).1
      have kept := regional_pair_read_activity_retained before left.selection left.region left.footprint right.footprint
        footprint independent pair.val.record member
        (monitored_activity_read before right.selection right.region right.footprint _ _ rightKind rightFootprint)
      have identities : waitIdentitiesUnique before = true := by
        simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
        simp_all only
      obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before leftOperation left leftFound
      have same : actual = after := Option.some.inj (executed.symm.trans applied)
      subst actual
      have fields := regionalSelection_reference_fields program before after leftOperation left.selection
        snapshots identities selected fired
      have afterRecords : after.activityOccurrences.filter (sameActivityOccurrence pair.val.record) = [pair.val.record] := by
        rw [fields.2.1]
        exact regional_pair_retained_singleton _ _ _ _ recordCensus kept
      have afterBody : after.activityOccurrences.filter
          (fun record => decide (record.body = .childScope pair.val.child.id)) = [pair.val.record] := by
        rw [fields.2.1]
        exact regional_pair_retained_singleton _ _ _ _ bodyCensus kept
      have afterChildren : after.scopeOccurrences.filter
          (fun scope => decide (scope.id.definitionScopeId = pair.val.definition.childScopeId)) = [pair.val.child] := by
        rw [addressed.1, children, ← addressed.1]
        exact childCensus
      have afterParents : after.scopeOccurrences.filter (fun scope => decide (scope.id = pair.val.parent.id)) =
          [pair.val.parent] := by
        rw [parents pair.val.child pair.val.parent.id (by simpa only [addressed.1] using childCensus) parentEq]
        exact parentCensus
      have afterBound : MonitoredScopeBinding program after pair.val := by
        refine ⟨bound.1, ⟨afterChildren, childScope, parentEq, afterParents, afterBody, afterRecords,
          body, owner, process, childProcess, control.trans running⟩, ?_⟩
        have binding := bound.2.2
        cases deadline : pair.val.timer with
        | none =>
            simp only [MonitoredScopeTimerBinding, deadline] at binding ⊢
            refine ⟨binding.1, binding.2.1, ?_⟩
            rw [fields.2.2.2.2.1, List.filter_filter]
            apply List.filter_eq_nil_iff.mpr
            intro timer member
            have absent := List.filter_eq_nil_iff.mp binding.2.2 timer member
            simp [absent]
        | some timer =>
            simp only [MonitoredScopeTimerBinding, deadline] at binding ⊢
            have recordClosed := List.all_eq_true.mp (Bool.and_eq_true_iff.mp references).1 pair.val.record member
            simp only [kept, Bool.not_true, Bool.false_or] at recordClosed
            have timerClosed := List.all_eq_true.mp (Bool.and_eq_true_iff.mp recordClosed).2
              (.timer (boundaryTimerWaitIdentity timer)) (by simp [binding.1])
            have timerIdentity : after.timerWaits.filter (timerIdNamesWait (boundaryTimerWaitIdentity timer)) = [timer] := by
              rw [fields.2.2.2.2.1, allMatchingRetained_preserves_census _ _ _ timerClosed]
              exact binding.2.2.1
            have timerKept : (regionalSelectionReferenceRetention before left.selection).timer timer = true := by
              have afterMember : timer ∈ after.timerWaits :=
                (List.mem_filter.mp (show timer ∈ after.timerWaits.filter _ by rw [timerIdentity]; simp)).1
              rw [fields.2.2.2.2.1] at afterMember
              exact (List.mem_filter.mp afterMember).2
            refine ⟨binding.1, ?_, ?_⟩
            · rw [fields.2.2.2.2.1]
              exact regional_pair_retained_singleton _ _ _ _ binding.2.1 timerKept
            · simpa only [NonInterruptingBoundaryTimerBinding, timerIdentity, afterRecords,
                binding.2.2.1, recordCensus] using binding.2.2
      have rebuilt := monitoredScopePairForChild_complete program after pair.val afterBound
      rw [addressed.1] at rebuilt
      simp only [rebuilt, Option.bind_eq_bind, Option.bind_some]
      rw [if_pos addressed]
    · contradiction
  · next unmonitored =>
    rw [if_neg unmonitored]
    exact regional_pair_completion_withdrawal program before after hosting leftOperation left right definition choice
      valid leftFound rightFootprint rightKind independent applied children chosen

end BpmnSemantics.SemanticProcess.InternalCommutation

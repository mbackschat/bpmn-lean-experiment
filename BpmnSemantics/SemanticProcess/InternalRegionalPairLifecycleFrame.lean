import BpmnSemantics.SemanticProcess.InternalRegionalPairFootprintFrame
import BpmnSemantics.SemanticProcess.InternalRegionalInstantaneousFold
import BpmnSemantics.SemanticProcess.InternalRegionalPairSelection

/-! Cancellation publication depends on projected anchors and live handler classification, including private Timers. Exact retained populations preserve that template without assuming publication acceptance. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem any_congr_on (values : List α) (left right : α → Bool)
    (same : ∀ value ∈ values, left value = right value) : values.any left = values.any right := by
  apply Bool.eq_iff_iff.mpr
  simp only [List.any_eq_true]
  constructor
  · rintro ⟨value, member, present⟩
    exact ⟨value, member, by rwa [← same value member]⟩
  · rintro ⟨value, member, present⟩
    exact ⟨value, member, by rwa [same value member]⟩

private theorem cancellation_predicates_disjoint (ownerLeft ownerRight handlerLeft handlerRight : Bool)
    (owners : (ownerLeft && ownerRight) = false)
    (leftKeeps : handlerRight = true → (!ownerLeft && !handlerLeft) = true)
    (rightKeeps : handlerLeft = true → (!ownerRight && !handlerRight) = true) :
    ((ownerLeft || handlerLeft) && (ownerRight || handlerRight)) = false := by
  cases ownerLeft <;> cases ownerRight <;> cases handlerLeft <;> cases handlerRight <;> simp_all

/-- Acceptance and the regional fold determine the actual successor projection, including
canonical order and retained-end identity, without another operation-family projection proof. -/
theorem preparedRegional_open_projection_filter (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after) :
    ∃ current, projectOpenFlowNodeOccurrences? program before = some current ∧
      projectOpenFlowNodeOccurrences? program after =
        some (removeEndedFlowNodeOccurrences current prepared.publicationTemplate.retainedEnds) := by
  have programValid : programWellFormed program = true := by
    have parts := valid
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at parts
    have position := parts.1
    simp only [runtimePositionValid, Bool.and_eq_true] at position
    exact position.1.1
  obtain ⟨actual, actualApplied, accepted⟩ := preparedRegional_accepted_lifecycle program before hosting hosting 0
    operation prepared programValid valid found
  have same : actual = after := Option.some.inj (actualApplied.symm.trans applied)
  subst actual
  obtain ⟨current, currentProjected, folded⟩ := preparedRegional_lifecycle_fold program before operation prepared hosting 0 found
  unfold flowNodeOccurrenceDeltaForOperation? at accepted
  obtain ⟨candidate, _, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  unfold acceptFlowNodeOccurrenceCandidate? at accepted
  obtain ⟨prior, priorProjected, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨next, nextProjected, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨result, resultFolded, accepted⟩ := Option.bind_eq_some_iff.mp accepted
  split at accepted
  · next agrees =>
      cases accepted
      have priorEq : prior = current := Option.some.inj (priorProjected.symm.trans currentProjected)
      subst prior
      have resultEq : result = removeEndedFlowNodeOccurrences current prepared.publicationTemplate.retainedEnds :=
        Option.some.inj (resultFolded.symm.trans folded)
      exact ⟨current, currentProjected, by simpa only [← agrees, resultEq] using nextProjected⟩
  · contradiction

theorem regional_pair_retained_timer_frame (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after)
    (timer : TimerWait) (member : timer ∈ after.timerWaits) :
    flowNodeOccurrenceBoundaryTimerBound program after timer =
      flowNodeOccurrenceBoundaryTimerBound program before timer := by
  have identities : waitIdentitiesUnique before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    simp_all only
  obtain ⟨snapshots, _, _, closed, _, footprint, _⟩ := prepareInternalRegional_facts program before leftOperation left leftFound
  have selected := (ownershipClosedSelection_facts program before leftOperation left.selection closed).1
  obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before leftOperation left leftFound
  have same : actual = after := Option.some.inj (executed.symm.trans applied)
  subst actual
  have afterRunning := (regional_pair_control_frame program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied).1.trans running
  cases leftOperation with
  | returnProcess id origin process definition output =>
      obtain ⟨returned, record, root, returnedApplied, _, _, _, parentless, quiet, _, scopes,
        tasks, _, timers, _, _, activities, _, _, census⟩ :=
        preparedReturn_quiescent_fields program before hosting id origin process definition output left valid leftFound
      have returnedEq : returned = after := Option.some.inj (returnedApplied.symm.trans applied)
      rw [returnedEq] at scopes tasks timers activities
      have oldMember : timer ∈ before.timerWaits := by simpa only [timers] using member
      have different : timer.owner ≠ root.id := by
        intro ownerEq
        have present : before.timerWaits.any (fun wait => wait.owner == root.id) = true :=
          List.any_eq_true.mpr ⟨timer, oldMember, by simp [ownerEq]⟩
        simp [scopeQuiescent, present] at quiet
      exact regional_return_boundary_timer_frame program before after root timer parentless different census scopes tasks activities
  | completeScope id origin definition output =>
      cases output with
      | some output =>
          obtain ⟨completed, completedApplied, frame⟩ := preparedChildComplete_boundary_timer_frame program before
            id origin definition output left identities leftFound
          have completedEq : completed = after := Option.some.inj (completedApplied.symm.trans applied)
          subst completed
          exact frame timer member
      | none =>
          have raw : completeBoundedScope? program before definition none = some after := by
            simp only [fire?, snapshots] at fired
            exact fired
          obtain ⟨withdrawal, _, census⟩ := regionalSelection_complete_census program before id origin definition none left.selection selected
          obtain ⟨ordinary, completed, control, _⟩ := completeBoundedScope_position_fields program before after definition none raw
          have update := (completeScopeState_selected_update before ordinary definition none left.selection.root census completed).2
          cases parent : left.selection.root.parent <;> simp only [parent, running] at update
          · split at update
            · contradiction
            · cases update
              simp only at control
              rw [afterRunning] at control
              contradiction
          · contradiction
  | throwError id origin input error handler =>
      have raw : throwErrorState? before input error handler = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨parent, _, _, update⟩ := regionalSelection_error_execution program before after id origin input error handler left.selection selected raw
      rw [update] at member ⊢
      exact cancelScopeSubtree_boundary_timer_frame program before left.selection.root.id .remove timer member
  | terminateScope id origin input definition =>
      have raw : terminateScopeState? program before id origin input definition = some after := by
        simp only [fire?, snapshots] at fired
        exact fired
      obtain ⟨chosen, _⟩ := regionalSelection_terminate_owner program before id origin input definition left.selection selected
      simp only [terminateScopeState?, chosen, Option.some.injEq] at raw
      subst after
      exact cancelScopeSubtree_boundary_timer_frame program before left.selection.root.id .retain timer member
  | _ => simp [selectInternalRegional?] at selected

private theorem closed_reference_handlers_retained (state : RuntimeState)
    (keep : RegionalReferenceRetention) (records : List ActivityOccurrence)
    (closed : regionalOwnershipClosed state keep = true)
    (retained : ∀ record ∈ records, record ∈ state.activityOccurrences ∧ keep.activity record = true) :
    (∀ wait ∈ state.messageWaits, activityRecordsAttachMessageWait records wait = true → keep.message wait = true) ∧
      (∀ wait ∈ state.timerWaits, anyTimerIdNamesWait (attachedTimersOf records) wait = true → keep.timer wait = true) := by
  have handlers (record : ActivityOccurrence) (member : record ∈ records) :
      record.attachedHandlers.all (fun handler => match handler with
        | .timer timer => allMatchingRetained state.timerWaits keep.timer (timerIdNamesWait timer)
        | .message message => allMatchingRetained state.messageWaits keep.message (messageIdNamesWait message)) = true := by
    obtain ⟨present, kept⟩ := retained record member
    have references := List.all_eq_true.mp (Bool.and_eq_true_iff.mp closed).1 record present
    simp only [kept, Bool.not_true, Bool.false_or] at references
    exact (Bool.and_eq_true_iff.mp references).2
  constructor
  · intro wait member attached
    obtain ⟨record, recordMember, attached⟩ := List.any_eq_true.mp attached
    obtain ⟨id, idMember, named⟩ := List.any_eq_true.mp attached
    obtain ⟨handler, handlerMember, handlerEq⟩ := List.mem_filterMap.mp idMember
    cases handler with
    | timer timer => simp at handlerEq
    | message message =>
        simp only [Option.some.injEq] at handlerEq
        subst message
        have targets := List.all_eq_true.mp (handlers record recordMember) (.message id) handlerMember
        have target := List.all_eq_true.mp targets wait member
        simpa only [named, Bool.not_true, Bool.false_or] using target
  · intro wait member attached
    obtain ⟨id, idMember, named⟩ := List.any_eq_true.mp attached
    obtain ⟨record, recordMember, attached⟩ := List.mem_flatMap.mp idMember
    obtain ⟨handler, handlerMember, handlerEq⟩ := List.mem_filterMap.mp attached
    cases handler with
    | message message => simp at handlerEq
    | timer timer =>
        simp only [Option.some.injEq] at handlerEq
        subst timer
        have targets := List.all_eq_true.mp (handlers record recordMember) (.timer id) handlerMember
        have target := List.all_eq_true.mp targets wait member
        simpa only [named, Bool.not_true, Bool.false_or] using target

theorem regional_pair_handler_withdrawal (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after)
    (cancelling : right.selection.kind = .terminating ∨ ∃ parent, right.selection.kind = .interrupting parent) :
    ∀ id, scopeCancellationWithdrawsHandler program after right.selection.root.id id =
      scopeCancellationWithdrawsHandler program before right.selection.root.id id := by
  have leftFacts := prepareInternalRegional_facts program before leftOperation left leftFound
  obtain ⟨selected, closed⟩ := ownershipClosedSelection_facts program before leftOperation left.selection leftFacts.2.2.2.1
  have identities : waitIdentitiesUnique before = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    simp_all only
  obtain ⟨actual, fired, executed⟩ := prepareInternalRegional_executes program before leftOperation left leftFound
  have same : actual = after := Option.some.inj (executed.symm.trans applied)
  subst actual
  have fields := regionalSelection_reference_fields program before after leftOperation left.selection
    leftFacts.1 identities selected fired
  let oldRecords := withdrawnByRegion (fun owner => occurrenceInSubtree before.scopeOccurrences right.selection.root.id owner ||
    (calledInstanceClosure before right.selection.root.id).contains owner.processInstanceId) before.activityOccurrences
  have records : withdrawnByRegion (fun owner => occurrenceInSubtree after.scopeOccurrences right.selection.root.id owner ||
      (calledInstanceClosure after right.selection.root.id).contains owner.processInstanceId) after.activityOccurrences = oldRecords := by
    have writes := withdrawn_activity_frame program before after hosting leftOperation rightOperation left right
      valid running leftFound rightFound independent applied
    unfold regionalWithdrawnActivityWrites at writes
    have raw := (List.map_inj_right (fun _ _ equal => InternalRegionalStateAtom.activityAssociation.inj equal)).mp writes
    rcases cancelling with kind | ⟨parent, kind⟩ <;>
      simpa only [regionalSelectionReferenceRetention, kind, cancellationReferenceRetention, Bool.not_not,
        oldRecords, withdrawnByRegion] using raw
  have retained (record : ActivityOccurrence) (member : record ∈ oldRecords) :
      record ∈ before.activityOccurrences ∧ (regionalSelectionReferenceRetention before left.selection).activity record = true := by
    have afterMember : record ∈ after.activityOccurrences :=
      (List.mem_filter.mp (show record ∈ withdrawnByRegion (fun owner =>
        occurrenceInSubtree after.scopeOccurrences right.selection.root.id owner ||
          (calledInstanceClosure after right.selection.root.id).contains owner.processInstanceId) after.activityOccurrences by
            rw [records]; exact member)).1
    rw [fields.2.1] at afterMember
    exact List.mem_filter.mp afterMember
  obtain ⟨messagesKept, timersKept⟩ := closed_reference_handlers_retained before _ oldRecords closed retained
  have messageFrame (id : OccurrenceId) :
      after.messageWaits.any (fun wait => messageIdNamesWait id wait && activityRecordsAttachMessageWait oldRecords wait) =
      before.messageWaits.any (fun wait => messageIdNamesWait id wait && activityRecordsAttachMessageWait oldRecords wait) := by
    rw [fields.2.2.2.1, List.any_filter]
    apply any_congr_on
    intro wait member
    cases attached : activityRecordsAttachMessageWait oldRecords wait with
    | false => simp
    | true => simp [messagesKept wait member attached]
  have timerFrame (id : OccurrenceId) :
      after.timerWaits.any (fun wait => timerIdNamesWait id wait && !flowNodeOccurrenceBoundaryTimerBound program after wait &&
        anyTimerIdNamesWait (attachedTimersOf oldRecords) wait) =
      before.timerWaits.any (fun wait => timerIdNamesWait id wait && !flowNodeOccurrenceBoundaryTimerBound program before wait &&
        anyTimerIdNamesWait (attachedTimersOf oldRecords) wait) := by
    rw [fields.2.2.2.2.1, List.any_filter]
    apply any_congr_on
    intro wait member
    cases attached : anyTimerIdNamesWait (attachedTimersOf oldRecords) wait with
    | false => simp
    | true =>
        have kept := timersKept wait member attached
        have afterMember : wait ∈ after.timerWaits := by
          rw [fields.2.2.2.2.1]
          exact List.mem_filter.mpr ⟨member, kept⟩
        have classification := regional_pair_retained_timer_frame program before after hosting leftOperation rightOperation left right
          valid running leftFound rightFound independent applied wait afterMember
        simp [kept, classification]
  intro id
  simp only [scopeCancellationWithdrawsHandler, records, messageFrame, timerFrame]
  rfl

private theorem cancellation_handler_classification (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (current : List OpenSemanticFlowNodeOccurrence) (root : ScopeOccurrenceId)
    (running : state.control = .running hosting)
    (valid : flowNodeOccurrenceWaitProgramValidity program state = true)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    (∀ wait ∈ state.waits, scopeCancellationWithdrawsHandler program state root (userTaskWaitOccurrence wait) = false) ∧
    (∀ wait ∈ state.messageWaits, scopeCancellationWithdrawsHandler program state root (messageWaitOccurrence wait) =
      activityRecordsAttachMessageWait (withdrawnByRegion (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
        (calledInstanceClosure state root).contains owner.processInstanceId) state.activityOccurrences) wait) ∧
    (∀ wait ∈ state.timerWaits.filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program state timer),
      scopeCancellationWithdrawsHandler program state root (timerWaitOccurrence wait) =
        anyTimerIdNamesWait (attachedTimersOf (withdrawnByRegion (fun owner => occurrenceInSubtree state.scopeOccurrences root owner ||
          (calledInstanceClosure state root).contains owner.processInstanceId) state.activityOccurrences)) wait) ∧
    (∀ wait ∈ state.effectWaits, scopeCancellationWithdrawsHandler program state root (effectWaitOccurrence wait) = false) ∧
    (∀ incident ∈ state.effectIncidents,
      scopeCancellationWithdrawsHandler program state root (effectWaitOccurrence incident.wait) = false) := by
  have unique := projected_public_wait_identities_nodup program state hosting current running valid projected
  obtain ⟨fourUnique, _, beforeIncident⟩ := List.nodup_append.mp unique
  obtain ⟨threeUnique, _, beforeEffect⟩ := List.nodup_append.mp fourUnique
  obtain ⟨twoUnique, timerUnique, beforeTimer⟩ := List.nodup_append.mp threeUnique
  obtain ⟨_, messageUnique, beforeMessage⟩ := List.nodup_append.mp twoUnique
  refine ⟨?_, ?_, ?_, ?_, ?_⟩
  · intro wait member
    have present : userTaskWaitOccurrence wait ∈ state.waits.map userTaskWaitOccurrence :=
      List.mem_map.mpr ⟨wait, member, rfl⟩
    apply scopeCancellationWithdrawsHandler_absent
    · intro message; exact beforeMessage _ present _ message rfl
    · intro timer; exact beforeTimer _ (by simp only [List.mem_append]; exact Or.inl present) _ timer rfl
  · intro wait member
    apply scopeCancellationWithdrawsHandler_message program state root wait messageUnique member
    intro timer
    exact beforeTimer _ (by simp only [List.mem_append]; exact Or.inr (List.mem_map.mpr ⟨wait, member, rfl⟩)) _ timer rfl
  · intro wait member
    obtain ⟨present, visible⟩ := List.mem_filter.mp member
    apply scopeCancellationWithdrawsHandler_timer program state root wait timerUnique present (by simpa using visible)
    intro message
    exact beforeTimer _ (by simp only [List.mem_append]; exact Or.inr message)
      _ (List.mem_map.mpr ⟨wait, member, rfl⟩) rfl
  · intro wait member
    have present : effectWaitOccurrence wait ∈ state.effectWaits.map effectWaitOccurrence :=
      List.mem_map.mpr ⟨wait, member, rfl⟩
    apply scopeCancellationWithdrawsHandler_absent
    · intro message; exact beforeEffect _ (by simp only [List.mem_append]; exact Or.inl (Or.inr message)) _ present rfl
    · intro timer; exact beforeEffect _ (by simp only [List.mem_append]; exact Or.inr timer) _ present rfl
  · intro incident member
    have present : effectWaitOccurrence incident.wait ∈ state.effectIncidents.map (fun value => effectWaitOccurrence value.wait) :=
      List.mem_map.mpr ⟨incident, member, rfl⟩
    apply scopeCancellationWithdrawsHandler_absent
    · intro message; exact beforeIncident _ (by simp only [List.mem_append]; exact Or.inl (Or.inl (Or.inr message))) _ present rfl
    · intro timer; exact beforeIncident _ (by simp only [List.mem_append]; exact Or.inl (Or.inr timer)) _ present rfl

private theorem cancelled_handlers_retained_by_other (state : RuntimeState)
    (selected other : InternalRegionalSelection) (region otherRegion : InternalOccurrenceRegion)
    (footprint otherFootprint : InternalRegionalStateFootprint)
    (selectedFound : regionalStateFootprint? state selected region = some footprint)
    (otherFound : regionalStateFootprint? state other otherRegion = some otherFootprint)
    (independent : regionalStateFootprintsIndependent footprint otherFootprint = true)
    (closed : regionalOwnershipClosed state (regionalSelectionReferenceRetention state selected) = true)
    (cancelling : other.kind = .terminating ∨ ∃ parent, other.kind = .interrupting parent) :
    (∀ wait ∈ state.messageWaits, activityRecordsAttachMessageWait (withdrawnByRegion (fun owner =>
        occurrenceInSubtree state.scopeOccurrences other.root.id owner ||
          (calledInstanceClosure state other.root.id).contains owner.processInstanceId) state.activityOccurrences) wait = true →
      (regionalSelectionReferenceRetention state selected).message wait = true) ∧
    (∀ wait ∈ state.timerWaits, anyTimerIdNamesWait (attachedTimersOf (withdrawnByRegion (fun owner =>
        occurrenceInSubtree state.scopeOccurrences other.root.id owner ||
          (calledInstanceClosure state other.root.id).contains owner.processInstanceId) state.activityOccurrences)) wait = true →
      (regionalSelectionReferenceRetention state selected).timer wait = true) := by
  apply closed_reference_handlers_retained state _ _ closed
  intro record member
  obtain ⟨recordMember, removed⟩ := List.mem_filter.mp member
  refine ⟨recordMember, ?_⟩
  have otherRemoved : (regionalSelectionReferenceRetention state other).activity record = false := by
    rcases cancelling with kind | ⟨parent, kind⟩ <;>
      simp only [regionalSelectionReferenceRetention, kind, cancellationReferenceRetention, removed, Bool.not_true]
  cases kept : (regionalSelectionReferenceRetention state selected).activity record with
  | true => rfl
  | false =>
      have leftWritten := regionalStateFootprint_protects_withdrawn_activity state selected region footprint record recordMember kept selectedFound
      have rightWritten := regionalStateFootprint_protects_withdrawn_activity state other otherRegion otherFootprint record recordMember otherRemoved otherFound
      have conflict := regional_independent_write_write _ _ independent _ _ leftWritten rightWritten
      simp [regionalStateAtomsConflict, regionalActivityAssociationsConflict, sameActivityOccurrence] at conflict

private theorem mapped_cancellation_disjoint (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (leftRoot rightRoot : ScopeOccurrenceId)
    (leftRegion rightRegion : InternalOccurrenceRegion)
    (position : runtimePositionValid program hosting state = true)
    (running : state.control = .running hosting)
    (leftDerived : deriveInternalOccurrenceRegion? state leftRoot = some leftRegion)
    (rightDerived : deriveInternalOccurrenceRegion? state rightRoot = some rightRegion)
    {α : Type} (values : List α) (owner : α → ScopeOccurrenceId) (element : α → NodeId)
    (activation : α → Nat) (identity : α → OccurrenceId) (starts : List OpenSemanticFlowNodeOccurrence)
    (mapped : values.mapM (fun value => waitStart? program state (owner value) (element value) (activation value)) = some starts)
    (identityEq : ∀ value ∈ values, identity value =
      { processInstanceId := (owner value).processInstanceId
        elementId := ⟨(element value).value⟩
        activation := activation value })
    (separated : ∀ value ∈ values, (owner value) ∈ state.scopeOccurrences.map (·.id) →
      ((occurrenceInSubtree state.scopeOccurrences leftRoot (owner value) ||
          (calledInstanceClosure state leftRoot).contains (owner value).processInstanceId ||
          scopeCancellationWithdrawsHandler program state leftRoot (identity value)) &&
        (occurrenceInSubtree state.scopeOccurrences rightRoot (owner value) ||
          (calledInstanceClosure state rightRoot).contains (owner value).processInstanceId ||
          scopeCancellationWithdrawsHandler program state rightRoot (identity value))) = false) :
    ∀ entry ∈ starts, ∀ retainLeft retainRight,
      (regionalCancelsOpenOccurrence program state leftRegion retainLeft entry &&
        regionalCancelsOpenOccurrence program state rightRegion retainRight entry) = false := by
  intro entry member retainLeft retainRight
  obtain ⟨value, valueMember, started⟩ := mapM_output_member values _ starts mapped entry member
  have live := (waitStart_regional_ownership program state _ _ _ entry started).1
  unfold waitStart? at started
  obtain ⟨process, _, started⟩ := Option.bind_eq_some_iff.mp started
  cases started
  have result := separated value valueMember live
  rw [identityEq value valueMember] at result
  simp only [regionalCancelsOpenOccurrence,
    (deriveInternalOccurrenceRegion_spec state _ _ leftDerived).1,
    (deriveInternalOccurrenceRegion_spec state _ _ rightDerived).1,
    regional_cancellation_mask program state hosting hosting position running _ _ leftDerived (owner value) live,
    regional_cancellation_mask program state hosting hosting position running _ _ rightDerived (owner value) live]
  exact result

private theorem cancellation_wait_disjoint (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional) (current entries : List OpenSemanticFlowNodeOccurrence)
    (valid : runtimeStateWellFormed program hosting state = true)
    (running : state.control = .running hosting)
    (leftFound : prepareInternalRegional? program state leftOperation = some left)
    (rightFound : prepareInternalRegional? program state rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (leftCancels : left.selection.kind = .terminating ∨ ∃ parent, left.selection.kind = .interrupting parent)
    (rightCancels : right.selection.kind = .terminating ∨ ∃ parent, right.selection.kind = .interrupting parent)
    (opened : projectOpenFlowNodeOccurrences? program state = some current)
    (projected : projectWaits? program state = some entries) :
    ∀ entry ∈ entries, ∀ retainLeft retainRight,
      (regionalCancelsOpenOccurrence program state left.region retainLeft entry &&
        regionalCancelsOpenOccurrence program state right.region retainRight entry) = false := by
  have lf := prepareInternalRegional_facts program state leftOperation left leftFound
  have rf := prepareInternalRegional_facts program state rightOperation right rightFound
  have leftDerived := lf.2.2.2.2.1
  have rightDerived := rf.2.2.2.2.1
  have position : runtimePositionValid program hosting state = true := by
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at valid
    exact valid.1
  have programValidity := (projectOpenFlowNodeOccurrences_validities program state current hosting running opened).1
  have waitValidity : flowNodeOccurrenceWaitProgramValidity program state = true := by
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at programValidity
    exact programValidity.1.1.2
  have leftHandlers := cancellation_handler_classification program state hosting current left.selection.root.id running waitValidity opened
  have rightHandlers := cancellation_handler_classification program state hosting current right.selection.root.id running waitValidity opened
  have leftKeeps := cancelled_handlers_retained_by_other state left.selection right.selection left.region right.region
    left.footprint right.footprint lf.2.2.2.2.2.1 rf.2.2.2.2.2.1 independent
    (ownershipClosedSelection_facts program state leftOperation left.selection lf.2.2.2.1).2 rightCancels
  have rightKeeps := cancelled_handlers_retained_by_other state right.selection left.selection right.region left.region
    right.footprint left.footprint rf.2.2.2.2.2.1 lf.2.2.2.2.2.1
    (regionalStateFootprintsIndependent_symmetric _ _ independent)
    (ownershipClosedSelection_facts program state rightOperation right.selection rf.2.2.2.1).2 leftCancels
  have disjoint := regional_pair_regions_disjoint state left.selection right.selection left.region right.region
    left.footprint right.footprint lf.2.2.2.2.2.1 rf.2.2.2.2.2.1 independent
  let cancelled (selected : InternalRegionalSelection) (owner : ScopeOccurrenceId) :=
    occurrenceInSubtree state.scopeOccurrences selected.root.id owner ||
      (calledInstanceClosure state selected.root.id).contains owner.processInstanceId
  have ownersDisjoint (owner : ScopeOccurrenceId) (live : owner ∈ state.scopeOccurrences.map (·.id)) :
      (cancelled left.selection owner && cancelled right.selection owner) = false := by
    dsimp only [cancelled]
    rw [← regional_cancellation_mask program state hosting hosting position running _ _ leftDerived owner live,
      ← regional_cancellation_mask program state hosting hosting position running _ _ rightDerived owner live]
    apply Bool.eq_false_iff.mpr
    intro both
    obtain ⟨l, r⟩ := Bool.and_eq_true_iff.mp both
    exact disjoint owner (List.contains_iff_mem.mp l) (List.contains_iff_mem.mp r)
  have messageDisjoint (wait : MessageWait) (member : wait ∈ state.messageWaits)
      (live : wait.owner ∈ state.scopeOccurrences.map (·.id)) :
      ((cancelled left.selection wait.owner || scopeCancellationWithdrawsHandler program state left.selection.root.id (messageWaitOccurrence wait)) &&
        (cancelled right.selection wait.owner || scopeCancellationWithdrawsHandler program state right.selection.root.id (messageWaitOccurrence wait))) = false := by
    rw [leftHandlers.2.1 wait member, rightHandlers.2.1 wait member]
    have lk := leftKeeps.1 wait member
    have rk := rightKeeps.1 wait member
    rcases leftCancels with kindL | ⟨parentL, kindL⟩ <;>
      rcases rightCancels with kindR | ⟨parentR, kindR⟩ <;>
      simp only [regionalSelectionReferenceRetention, kindL, kindR, cancellationReferenceRetention] at lk rk
    all_goals
      have base := ownersDisjoint wait.owner live
      exact cancellation_predicates_disjoint _ _ _ _ base lk rk
  have timerDisjoint (wait : TimerWait)
      (member : wait ∈ state.timerWaits.filter (fun timer => !flowNodeOccurrenceBoundaryTimerBound program state timer))
      (live : wait.owner ∈ state.scopeOccurrences.map (·.id)) :
      ((cancelled left.selection wait.owner || scopeCancellationWithdrawsHandler program state left.selection.root.id (timerWaitOccurrence wait)) &&
        (cancelled right.selection wait.owner || scopeCancellationWithdrawsHandler program state right.selection.root.id (timerWaitOccurrence wait))) = false := by
    rw [leftHandlers.2.2.1 wait member, rightHandlers.2.2.1 wait member]
    have lk := leftKeeps.2 wait (List.mem_filter.mp member).1
    have rk := rightKeeps.2 wait (List.mem_filter.mp member).1
    rcases leftCancels with kindL | ⟨parentL, kindL⟩ <;>
      rcases rightCancels with kindR | ⟨parentR, kindR⟩ <;>
      simp only [regionalSelectionReferenceRetention, kindL, kindR, cancellationReferenceRetention] at lk rk
    all_goals
      have base := ownersDisjoint wait.owner live
      exact cancellation_predicates_disjoint _ _ _ _ base lk rk
  have mapped := @mapped_cancellation_disjoint program state hosting left.selection.root.id right.selection.root.id
    left.region right.region position running leftDerived rightDerived
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq, effectsEq, incidentsEq, rfl⟩ :=
    (projectWaits_eq_some_iff program state entries).mp projected
  obtain ⟨taskOwners, messageOwners, timerOwners, effectOwners, incidentOwners⟩ :=
    flowNodeOccurrenceWaitProgramValidity_wait_owner_ids program state waitValidity
  intro entry member retainLeft retainRight
  simp only [List.mem_append] at member
  rcases member with member | member | member | member | member
  · exact @mapped _ state.waits (·.owner) (fun wait => ⟨wait.task.id.value⟩) (·.activation) userTaskWaitOccurrence tasks tasksEq
      (by intro wait mem; simp only [userTaskWaitOccurrence, taskOwners wait mem])
      (by intro wait mem live; simpa only [leftHandlers.1 wait mem, rightHandlers.1 wait mem, Bool.or_false] using ownersDisjoint wait.owner live)
      entry member retainLeft retainRight
  · exact @mapped _ state.messageWaits (·.owner) (·.elementId) (·.activation) messageWaitOccurrence messages messagesEq
      (by intro wait mem; simp only [messageWaitOccurrence, messageOwners wait mem]) messageDisjoint entry member retainLeft retainRight
  · exact @mapped TimerWait _ (·.owner) (·.elementId) (·.activation) timerWaitOccurrence timers timersEq
      (by intro wait mem; simp only [timerWaitOccurrence, timerOwners wait (List.mem_filter.mp mem).1]) timerDisjoint entry member retainLeft retainRight
  · exact @mapped _ state.effectWaits (·.owner) (·.elementId) (·.activation) effectWaitOccurrence effects effectsEq
      (by intro wait mem; simp only [effectWaitOccurrence, effectOwners wait mem])
      (by intro wait mem live; simpa only [leftHandlers.2.2.2.1 wait mem, rightHandlers.2.2.2.1 wait mem, Bool.or_false] using ownersDisjoint wait.owner live)
      entry member retainLeft retainRight
  · exact @mapped _ state.effectIncidents (·.wait.owner) (·.wait.elementId) (·.wait.activation) (fun incident => effectWaitOccurrence incident.wait)
      incidents incidentsEq (by intro incident mem; simp only [effectWaitOccurrence, incidentOwners incident mem])
      (by intro incident mem live; simpa only [leftHandlers.2.2.2.2 incident mem, rightHandlers.2.2.2.2 incident mem, Bool.or_false] using ownersDisjoint incident.wait.owner live)
      entry member retainLeft retainRight

private theorem cancellation_open_disjoint (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional) (current : List OpenSemanticFlowNodeOccurrence)
    (valid : runtimeStateWellFormed program hosting state = true)
    (running : state.control = .running hosting)
    (leftFound : prepareInternalRegional? program state leftOperation = some left)
    (rightFound : prepareInternalRegional? program state rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (leftCancels : left.selection.kind = .terminating ∨ ∃ parent, left.selection.kind = .interrupting parent)
    (rightCancels : right.selection.kind = .terminating ∨ ∃ parent, right.selection.kind = .interrupting parent)
    (opened : projectOpenFlowNodeOccurrences? program state = some current) :
    ∀ entry ∈ current, ∀ retainLeft retainRight,
      (regionalCancelsOpenOccurrence program state left.region retainLeft entry &&
        regionalCancelsOpenOccurrence program state right.region retainRight entry) = false := by
  have lf := prepareInternalRegional_facts program state leftOperation left leftFound
  have rf := prepareInternalRegional_facts program state rightOperation right rightFound
  have disjoint := regional_pair_regions_disjoint state left.selection right.selection left.region right.region
    left.footprint right.footprint lf.2.2.2.2.2.1 rf.2.2.2.2.2.1 independent
  have scopes (entry : OpenSemanticFlowNodeOccurrence) (member : entry ∈ current)
      (id : ScopeOccurrenceId) (anchor : entry.anchor = .scope id) (retainLeft retainRight : Bool) :
      (regionalCancelsOpenOccurrence program state left.region retainLeft entry &&
        regionalCancelsOpenOccurrence program state right.region retainRight entry) = false := by
    obtain ⟨scope, present, identity, parent⟩ :=
      (projectOpen_regional_ownership program state hosting current entry running opened member).2 id anchor
    have inside (region : InternalOccurrenceRegion) (root : ScopeOccurrenceId)
        (derived : deriveInternalOccurrenceRegion? state root = some region) :
        region.contains entry.owner = true → region.contains id = true := by
      intro contained
      exact List.contains_iff_mem.mpr ((deriveInternalOccurrenceRegion_spec state root region derived).2.2.2.2.1
        entry.owner (List.contains_iff_mem.mp contained) id (.inl ⟨scope, present, parent, identity⟩))
    apply Bool.eq_false_iff.mpr
    intro both
    obtain ⟨l, r⟩ := Bool.and_eq_true_iff.mp both
    simp only [regionalCancelsOpenOccurrence, anchor, Bool.and_eq_true, Bool.or_eq_true] at l r
    have lm := l.2.elim (fun h => h) (inside left.region _ lf.2.2.2.2.1)
    have rm := r.2.elim (fun h => h) (inside right.region _ rf.2.2.2.2.1)
    exact disjoint _ (List.contains_iff_mem.mp lm) (List.contains_iff_mem.mp rm)
  have calls (entry : OpenSemanticFlowNodeOccurrence) (id : OccurrenceId)
      (anchor : entry.anchor = .callActivity id) (retainLeft retainRight : Bool) :
      (regionalCancelsOpenOccurrence program state left.region retainLeft entry &&
        regionalCancelsOpenOccurrence program state right.region retainRight entry) = false := by
    apply Bool.eq_false_iff.mpr
    intro both
    obtain ⟨l, r⟩ := Bool.and_eq_true_iff.mp both
    simp only [regionalCancelsOpenOccurrence, anchor] at l r
    exact disjoint _ (List.contains_iff_mem.mp l) (List.contains_iff_mem.mp r)
  intro entry member retainLeft retainRight
  have raw := opened
  simp only [projectOpenFlowNodeOccurrences?, running] at raw
  split at raw
  · contradiction
  · simp only [bind, Option.bind, pure, Pure.pure] at raw
    obtain ⟨waits, waitsEq, raw⟩ := Option.bind_eq_some_iff.mp raw
    obtain ⟨scopeStarts, scopeEq, raw⟩ := Option.bind_eq_some_iff.mp raw
    obtain ⟨callStarts, callEq, raw⟩ := Option.bind_eq_some_iff.mp raw
    split at raw
    · have currentEq := Option.some.inj raw
      have rawMember := member
      rw [← currentEq, mem_sortFlowNodeOccurrenceStarts] at rawMember
      rcases List.mem_append.mp rawMember with rawMember | rawMember
      · rcases List.mem_append.mp rawMember with rawMember | rawMember
        · exact cancellation_wait_disjoint program state hosting leftOperation rightOperation left right current waits
            valid running leftFound rightFound independent leftCancels rightCancels opened waitsEq
            entry rawMember retainLeft retainRight
        · obtain ⟨scope, _, started⟩ := mapM_output_member _ _ scopeStarts scopeEq entry rawMember
          exact scopes entry member scope.id (scope_start_anchor program state scope entry started) retainLeft retainRight
      · obtain ⟨record, _, started⟩ := mapM_output_member _ _ callStarts callEq entry rawMember
        exact calls entry record.id (call_start_anchor program state record entry started) retainLeft retainRight
    · contradiction

theorem mapM_input_member (values : List α) (project : α → Option β)
    (results : List β) (mapped : values.mapM project = some results)
    (value : α) (member : value ∈ values) :
    ∃ result ∈ results, project value = some result := by
  induction values generalizing results with
  | nil => simp at member
  | cons head tail ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
      obtain ⟨first, firstEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨rest, restEq, resultEq⟩ := Option.bind_eq_some_iff.mp mapped
      simp only [pure, Pure.pure, Option.some.injEq] at resultEq
      subst results
      rcases List.mem_cons.mp member with rfl | member
      · exact ⟨first, List.mem_cons_self, firstEq⟩
      · obtain ⟨result, resultMember, resultEq⟩ := ih rest restEq member
        exact ⟨result, List.mem_cons_of_mem _ resultMember, resultEq⟩

private theorem projected_call_owner (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (current : List OpenSemanticFlowNodeOccurrence)
    (running : state.control = .running hosting)
    (opened : projectOpenFlowNodeOccurrences? program state = some current)
    (record : CalledProcessOccurrence) (recordMember : record ∈ state.calledProcessOccurrences)
    (entry : OpenSemanticFlowNodeOccurrence) (member : entry ∈ current)
    (anchor : entry.anchor = .callActivity record.id) : entry.owner = record.caller := by
  have raw := opened
  simp only [projectOpenFlowNodeOccurrences?, running] at raw
  split at raw
  · contradiction
  · simp only [bind, Option.bind, pure, Pure.pure] at raw
    obtain ⟨waits, _, raw⟩ := Option.bind_eq_some_iff.mp raw
    obtain ⟨scopes, _, raw⟩ := Option.bind_eq_some_iff.mp raw
    obtain ⟨calls, callEq, raw⟩ := Option.bind_eq_some_iff.mp raw
    split at raw
    · obtain ⟨selected, selectedMember, selectedEq⟩ := mapM_input_member _ _ calls callEq record recordMember
      have selectedAnchor := call_start_anchor program state record selected selectedEq
      have selectedPresent : selected ∈ current := by
        rw [← Option.some.inj raw, mem_sortFlowNodeOccurrenceStarts]
        exact List.mem_append_right _ selectedMember
      have singleton := filter_eq_singleton_of_key_nodup current (·.anchor)
        (fun value => value.anchor == selected.anchor) selected
        (projectOpenFlowNodeOccurrences_anchor_nodup program state current opened) selectedPresent (by simp)
        (by intro value _ equal; exact beq_iff_eq.mp equal)
      have entryPresent : entry ∈ [selected] := by
        rw [← singleton]
        exact List.mem_filter.mpr ⟨member, by simp [anchor, selectedAnchor]⟩
      have equal := List.mem_singleton.mp entryPresent
      subst entry
      unfold callStart? at selectedEq
      obtain ⟨process, _, selectedEq⟩ := Option.bind_eq_some_iff.mp selectedEq
      cases selectedEq
      rfl
    · contradiction

private theorem open_anchor_unique (current : List OpenSemanticFlowNodeOccurrence)
    (unique : (current.map (·.anchor)).Nodup)
    (left right : OpenSemanticFlowNodeOccurrence) (leftMember : left ∈ current)
    (rightMember : right ∈ current) (same : left.anchor = right.anchor) : left = right := by
  have singleton := filter_eq_singleton_of_key_nodup current (·.anchor)
    (fun value => value.anchor == right.anchor) right unique rightMember (by simp)
    (by intro value _ equal; exact beq_iff_eq.mp equal)
  have present : left ∈ current.filter (fun value => value.anchor == right.anchor) :=
    List.mem_filter.mpr ⟨leftMember, by simp [same]⟩
  rw [singleton] at present
  exact List.mem_singleton.mp present

private theorem cancellation_entry_not_ended (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional) (current : List OpenSemanticFlowNodeOccurrence)
    (valid : runtimeStateWellFormed program hosting state = true)
    (running : state.control = .running hosting)
    (leftFound : prepareInternalRegional? program state leftOperation = some left)
    (rightFound : prepareInternalRegional? program state rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (rightCancels : right.selection.kind = .terminating ∨ ∃ parent, right.selection.kind = .interrupting parent)
    (opened : projectOpenFlowNodeOccurrences? program state = some current)
    (entry : OpenSemanticFlowNodeOccurrence) (member : entry ∈ current) (retain : Bool)
    (cancelled : regionalCancelsOpenOccurrence program state right.region retain entry = true) :
    entry.anchor ∉ left.publicationTemplate.retainedEnds.map (·.anchor) := by
  have lf := prepareInternalRegional_facts program state leftOperation left leftFound
  have rf := prepareInternalRegional_facts program state rightOperation right rightFound
  have selected := (ownershipClosedSelection_facts program state leftOperation left.selection lf.2.2.2.1).1
  have operation := regionalSelection_operation program state leftOperation left.selection selected
  have facts := regionalSelection_lifecycle_facts program state leftOperation left.selection selected
  have disjoint := regional_pair_regions_disjoint state left.selection right.selection left.region right.region
    left.footprint right.footprint lf.2.2.2.2.2.1 rf.2.2.2.2.2.1 independent
  obtain ⟨_, _, actual, _, identities, ends, _, _, actualOpened, _, lifecycle, template⟩ :=
    regionalPublicationTemplate_facts program state left.selection left.region left.publicationTemplate lf.2.2.2.2.2.2
  have actualEq : actual = current := Option.some.inj (actualOpened.symm.trans opened)
  subst actual
  have cancelling (leftCancels : left.selection.kind = .terminating ∨ ∃ parent, left.selection.kind = .interrupting parent)
      (retainLeft : Bool) (endsEq : ends = regionalCancellationEnds program state left.region retainLeft current) :
      entry.anchor ∉ left.publicationTemplate.retainedEnds.map (·.anchor) := by
    rw [template, endsEq]
    intro present
    obtain ⟨ending, endingMember, anchorEq⟩ := List.mem_map.mp present
    obtain ⟨other, otherMember, endingEq⟩ := List.mem_map.mp endingMember
    obtain ⟨otherMember, otherCancelled⟩ := List.mem_filter.mp otherMember
    have same : other = entry := open_anchor_unique current
      (projectOpenFlowNodeOccurrences_anchor_nodup program state current opened)
      other entry otherMember member (by rw [← anchorEq, ← endingEq])
    subst other
    have separate := cancellation_open_disjoint program state hosting leftOperation rightOperation left right current
      valid running leftFound rightFound independent leftCancels rightCancels opened entry member retainLeft retain
    simp [otherCancelled, cancelled] at separate
  cases leftOperation with
  | returnProcess id origin process definition output =>
      obtain ⟨record, kind, _, census⟩ := regionalSelection_return_record program state id origin process definition output left.selection selected
      simp only [regionalLifecycleTemplate?, operation, kind] at lifecycle
      split at lifecycle
      · cases lifecycle
        rw [template]
        simp only [List.map_cons, List.map_nil, List.mem_cons, List.not_mem_nil, or_false]
        intro anchor
        have recordMember : record ∈ state.calledProcessOccurrences :=
          (List.mem_filter.mp (show record ∈ state.calledProcessOccurrences.filter _ by rw [census]; simp)).1
        have owner := projected_call_owner program state hosting current running opened record recordMember entry member anchor
        have outside := regional_pair_read_owner_outside state right.selection right.region right.footprint left.footprint
          rf.2.2.2.2.2.1 (regionalStateFootprintsIndependent_symmetric _ _ independent) record.caller
          (regionalStateFootprint_return_caller_read state left.selection left.region left.footprint record kind lf.2.2.2.2.2.1)
        simp only [regionalCancelsOpenOccurrence, anchor, owner, outside] at cancelled
        contradiction
      · contradiction
  | completeScope id origin definition output =>
      cases kind : left.selection.kind <;> simp only [kind] at facts <;> try contradiction
      simp only [regionalLifecycleTemplate?, operation, kind] at lifecycle
      cases parent : left.selection.root.parent with
      | none =>
          simp only [parent] at lifecycle
          cases lifecycle
          simp [template]
      | some parentOwner =>
          simp only [parent] at lifecycle
          split at lifecycle
          · cases lifecycle
            rw [template]
            simp only [List.map_cons, List.map_nil, List.mem_cons, List.not_mem_nil, or_false]
            intro anchor
            have owned := (projectOpen_regional_ownership program state hosting current entry running opened member).2 _ anchor
            obtain ⟨scope, scopeMember, identity, parentEq⟩ := owned
            have inside : right.region.contains left.selection.root.id = true := by
              simp only [regionalCancelsOpenOccurrence, anchor, Bool.and_eq_true, Bool.or_eq_true] at cancelled
              rcases cancelled.2 with rootInside | ownerInside
              · exact rootInside
              · exact List.contains_iff_mem.mpr ((deriveInternalOccurrenceRegion_spec state _ _ rf.2.2.2.2.1).2.2.2.2.1
                  entry.owner (List.contains_iff_mem.mp ownerInside) _ (.inl ⟨scope, scopeMember, parentEq, identity⟩))
            exact disjoint _ (deriveInternalOccurrenceRegion_spec state _ _ lf.2.2.2.2.1).2.1
              (List.contains_iff_mem.mp inside)
          · contradiction
  | throwError id origin input error handler =>
      cases kind : left.selection.kind <;> simp only [kind] at facts <;> try contradiction
      simp only [regionalLifecycleTemplate?, operation, kind] at lifecycle
      obtain ⟨_, _, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
      obtain ⟨_, _, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
      cases lifecycle
      exact cancelling (Or.inr ⟨_, kind⟩) false rfl
  | terminateScope id origin input definition =>
      cases kind : left.selection.kind <;> simp only [kind] at facts <;> try contradiction
      simp only [regionalLifecycleTemplate?, operation, kind] at lifecycle
      obtain ⟨_, _, lifecycle⟩ := Option.bind_eq_some_iff.mp lifecycle
      cases lifecycle
      exact cancelling (Or.inl kind) true rfl
  | _ => simp at facts

/-- Independent preparation protects every projected entry selected by cancellation,
including handlers whose owner is outside the cancelling region. -/
theorem regionalCancellationEnds_after_independent_regional (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (applied : applyPreparedInternalRegional? program before left = some after)
    (cancelling : right.selection.kind = .terminating ∨ ∃ parent, right.selection.kind = .interrupting parent) :
    ∃ current next,
      projectOpenFlowNodeOccurrences? program before = some current ∧
      projectOpenFlowNodeOccurrences? program after = some next ∧
      ∀ retain, regionalCancellationEnds program after right.region retain next =
        regionalCancellationEnds program before right.region retain current := by
  obtain ⟨current, opened, nextOpened⟩ := preparedRegional_open_projection_filter program before after hosting
    leftOperation left valid leftFound applied
  have handlers := regional_pair_handler_withdrawal program before after hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent applied cancelling
  have root := (deriveInternalOccurrenceRegion_spec before _ _
    (prepareInternalRegional_facts program before rightOperation right rightFound).2.2.2.2.1).1
  have predicate (entry : OpenSemanticFlowNodeOccurrence) (retain : Bool) :
      regionalCancelsOpenOccurrence program after right.region retain entry =
        regionalCancelsOpenOccurrence program before right.region retain entry := by
    cases anchor : entry.anchor <;> simp only [regionalCancelsOpenOccurrence, anchor, root, handlers]
  refine ⟨current, _, opened, nextOpened, ?_⟩
  intro retain
  unfold regionalCancellationEnds removeEndedFlowNodeOccurrences
  rw [List.filter_filter]
  apply congrArg (List.map fun entry : OpenSemanticFlowNodeOccurrence =>
    ({ anchor := entry.anchor, terminal := .cancelled } : UnnumberedFlowNodeOccurrenceEnd))
  apply List.filter_congr
  intro entry member
  rw [predicate]
  cases selected : regionalCancelsOpenOccurrence program before right.region retain entry with
  | false => simp
  | true =>
      have absent := cancellation_entry_not_ended program before hosting leftOperation rightOperation left right current
        valid running leftFound rightFound independent cancelling opened entry member retain selected
      have notContained : (left.publicationTemplate.retainedEnds.map (·.anchor)).contains entry.anchor = false :=
        Bool.eq_false_iff.mpr (fun contained => absent (List.contains_iff_mem.mp contained))
      simp only [notContained, Bool.not_false, Bool.true_and]

end BpmnSemantics.SemanticProcess.InternalCommutation

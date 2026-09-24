import BpmnSemantics.SemanticProcess.InternalRegionalCancellationProjectionFrames
import BpmnSemantics.SemanticProcess.InternalRegionalCancellationEffectValidity
import BpmnSemantics.SemanticProcess.InternalRegionalProjectionRemoval

/-! Cancellation compares public anchors only after private Timer classification.
The predecessor projection supplies the cross-family identity census needed to preserve
unrelated waits with the same raw identity as a private deadline (RHP-PRIVATE-01).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem mapped_wait_identity_census (program : Program) (state : RuntimeState)
    (values : List α) (owner : α → ScopeOccurrenceId) (element : α → NodeId)
    (activation : α → Nat) (identity : α → OccurrenceId)
    (entries : List OpenSemanticFlowNodeOccurrence)
    (projected : values.mapM (fun value => waitStart? program state (owner value)
      (element value) (activation value)) = some entries)
    (identities : ∀ value ∈ values, identity value =
      { processInstanceId := (owner value).processInstanceId,
        elementId := ⟨(element value).value⟩, activation := activation value }) :
    entries.map (·.anchor) = (values.map identity).map SemanticFlowNodeOccurrenceAnchor.wait := by
  rw [mapM_waitStart_anchor_map program state values owner element activation entries projected,
    List.map_map]
  apply List.map_congr_left
  intro value member
  simp only [Function.comp_def, identities value member]

theorem projected_public_wait_identity_census (program : Program) (state : RuntimeState)
    (entries : List OpenSemanticFlowNodeOccurrence)
    (valid : flowNodeOccurrenceWaitProgramValidity program state = true)
    (projected : projectWaits? program state = some entries) :
    entries.map (·.anchor) =
      (state.waits.map userTaskWaitOccurrence ++ state.messageWaits.map messageWaitOccurrence ++
        (state.timerWaits.filter fun timer => !flowNodeOccurrenceBoundaryTimerBound program state timer).map timerWaitOccurrence ++
        state.effectWaits.map effectWaitOccurrence ++
        state.effectIncidents.map (fun incident => effectWaitOccurrence incident.wait)).map
          SemanticFlowNodeOccurrenceAnchor.wait := by
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
    effectsEq, incidentsEq, rfl⟩ := (projectWaits_eq_some_iff program state entries).mp projected
  obtain ⟨taskOwners, messageOwners, timerOwners, effectOwners, incidentOwners⟩ :=
    flowNodeOccurrenceWaitProgramValidity_wait_owner_ids program state valid
  have taskKeys := mapped_wait_identity_census program state state.waits (·.owner)
    (fun wait => ⟨wait.task.id.value⟩) (·.activation) userTaskWaitOccurrence tasks tasksEq
    (by intro wait member; simp only [userTaskWaitOccurrence, taskOwners wait member])
  have messageKeys := mapped_wait_identity_census program state state.messageWaits (·.owner)
    (·.elementId) (·.activation) messageWaitOccurrence messages messagesEq
    (by intro wait member; simp only [messageWaitOccurrence, messageOwners wait member])
  have timerKeys := mapped_wait_identity_census program state
    (state.timerWaits.filter fun timer => !flowNodeOccurrenceBoundaryTimerBound program state timer)
    (·.owner) (·.elementId)
    (·.activation) timerWaitOccurrence timers timersEq
    (by intro wait member; simp only [timerWaitOccurrence, timerOwners wait (List.mem_filter.mp member).1])
  have effectKeys := mapped_wait_identity_census program state state.effectWaits (·.owner)
    (·.elementId) (·.activation) effectWaitOccurrence effects effectsEq
    (by intro wait member; simp only [effectWaitOccurrence, effectOwners wait member])
  have incidentKeys := mapped_wait_identity_census program state state.effectIncidents (·.wait.owner)
    (·.wait.elementId) (·.wait.activation) (fun incident => effectWaitOccurrence incident.wait)
    incidents incidentsEq
    (by intro incident member; simp only [effectWaitOccurrence, incidentOwners incident member])
  simp only [List.map_append, taskKeys, messageKeys, timerKeys, effectKeys, incidentKeys, List.append_assoc]

theorem projected_public_wait_identities_nodup (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (current : List OpenSemanticFlowNodeOccurrence)
    (running : state.control = .running hosting)
    (valid : flowNodeOccurrenceWaitProgramValidity program state = true)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    (state.waits.map userTaskWaitOccurrence ++ state.messageWaits.map messageWaitOccurrence ++
      (state.timerWaits.filter fun timer => !flowNodeOccurrenceBoundaryTimerBound program state timer).map timerWaitOccurrence ++
      state.effectWaits.map effectWaitOccurrence ++
      state.effectIncidents.map (fun incident => effectWaitOccurrence incident.wait)).Nodup := by
  simp only [projectOpenFlowNodeOccurrences?, running] at projected
  split at projected
  · contradiction
  · simp only [bind, Option.bind, pure, Pure.pure] at projected
    obtain ⟨waits, waitsEq, projected⟩ := Option.bind_eq_some_iff.mp projected
    obtain ⟨scopes, _, projected⟩ := Option.bind_eq_some_iff.mp projected
    obtain ⟨calls, _, projected⟩ := Option.bind_eq_some_iff.mp projected
    split at projected
    · next unique =>
        have rawUnique := ((sortFlowNodeOccurrenceStarts_perm (waits ++ scopes ++ calls)).map (·.anchor)).nodup_iff.mp unique
        have waitUnique : (waits.map (·.anchor)).Nodup :=
          (List.nodup_append.mp (List.nodup_append.mp (by
            simpa only [List.map_append] using rawUnique)).1).1
        rw [projected_public_wait_identity_census program state waits valid waitsEq] at waitUnique
        exact List.Pairwise.of_map SemanticFlowNodeOccurrenceAnchor.wait
          (fun _ _ different same => different (congrArg _ same)) waitUnique
    · contradiction

private theorem messageIdNamesWait_identity (id : OccurrenceId) (wait : MessageWait) :
    messageIdNamesWait id wait = decide (messageWaitOccurrence wait = id) := by
  rcases id with ⟨process, ⟨element⟩, activation⟩
  apply Bool.eq_iff_iff.mpr
  simp only [messageIdNamesWait, messageWaitOccurrence, Bool.and_eq_true, beq_iff_eq,
    decide_eq_true_eq, OccurrenceId.mk.injEq, SemanticId.mk.injEq]
  grind

private theorem timerIdNamesWait_identity (id : OccurrenceId) (wait : TimerWait) :
    timerIdNamesWait id wait = decide (timerWaitOccurrence wait = id) := by
  rcases id with ⟨process, ⟨element⟩, activation⟩
  apply Bool.eq_iff_iff.mpr
  simp only [timerIdNamesWait, timerWaitOccurrence, Bool.and_eq_true, beq_iff_eq,
    decide_eq_true_eq, OccurrenceId.mk.injEq, SemanticId.mk.injEq]
  grind

private theorem keyed_any_absent [DecidableEq β] (values : List α) (key : α → β)
    (id : β) (predicate : α → Bool) (absent : id ∉ values.map key) :
    values.any (fun value => decide (key value = id) && predicate value) = false := by
  apply List.any_eq_false.mpr
  intro value member
  have different : key value ≠ id := by
    intro same
    exact absent (List.mem_map.mpr ⟨value, member, same⟩)
  simp [different]

/-- An unissued wait identity cannot be withdrawn indirectly through an Activity handler. -/
theorem absent_wait_anchor_not_withdrawn (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (id : OccurrenceId) (absent : openWaitAnchorAbsent state id = true)
    (disposition : SelectedScopeDisposition := .remove) :
    scopeCancellationWithdrawsHandler program state root id disposition = false := by
  have missing : id ∉ openWaitAnchors state := by
    simpa [openWaitAnchorAbsent, List.contains_eq_mem] using absent
  have messages : id ∉ state.messageWaits.map messageWaitOccurrence :=
    fun member => missing (by simp [openWaitAnchors, member])
  have timers : id ∉ state.timerWaits.map timerWaitOccurrence :=
    fun member => missing (by simp [openWaitAnchors, member])
  simp only [scopeCancellationWithdrawsHandler, messageIdNamesWait_identity,
    timerIdNamesWait_identity, Bool.and_assoc,
    keyed_any_absent state.messageWaits messageWaitOccurrence id _ messages,
    keyed_any_absent state.timerWaits timerWaitOccurrence id _ timers, Bool.false_or]

theorem keyed_any_unique [DecidableEq β] (values : List α) (key : α → β)
    (selected : α) (predicate : α → Bool)
    (unique : (values.map key).Nodup) (member : selected ∈ values) :
    values.any (fun value => decide (key value = key selected) && predicate value) = predicate selected := by
  have singleton := filter_eq_singleton_of_key_nodup values key
    (fun value => decide (key value = key selected)) selected unique member (by simp)
    (by intro value _ same; exact of_decide_eq_true same)
  rw [← List.any_filter, singleton]
  simp

private theorem scopeCancellationWithdrawsHandler_public_keys (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (id : OccurrenceId)
    (disposition : SelectedScopeDisposition := .remove) :
    scopeCancellationWithdrawsHandler program state root id disposition =
      let withdrawn := withdrawnByRegion (fun owner =>
        occurrenceInSubtree state.scopeOccurrences root owner ||
          (calledInstanceClosure state root).contains owner.processInstanceId) state.activityOccurrences (retainedCancellationRoot root disposition)
      (state.messageWaits.any fun wait => decide (messageWaitOccurrence wait = id) &&
        activityRecordsAttachMessageWait withdrawn wait) ||
      ((state.timerWaits.filter fun wait => !flowNodeOccurrenceBoundaryTimerBound program state wait).any
        fun wait => decide (timerWaitOccurrence wait = id) && anyTimerIdNamesWait (attachedTimersOf withdrawn) wait) := by
  simp only [scopeCancellationWithdrawsHandler, messageIdNamesWait_identity,
    timerIdNamesWait_identity, List.any_filter]
  congr 1
  apply congrArg (fun predicate => state.timerWaits.any predicate)
  funext wait
  simp only [Bool.and_assoc, Bool.and_left_comm]

theorem scopeCancellationWithdrawsHandler_absent (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (id : OccurrenceId)
    (messages : id ∉ state.messageWaits.map messageWaitOccurrence)
    (timers : id ∉ (state.timerWaits.filter fun wait =>
      !flowNodeOccurrenceBoundaryTimerBound program state wait).map timerWaitOccurrence)
    (disposition : SelectedScopeDisposition := .remove) :
    scopeCancellationWithdrawsHandler program state root id disposition = false := by
  rw [scopeCancellationWithdrawsHandler_public_keys (disposition := disposition)]
  simp only [keyed_any_absent _ _ id _ messages, keyed_any_absent _ _ id _ timers, Bool.or_false]

theorem scopeCancellationWithdrawsHandler_message (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (wait : MessageWait)
    (unique : (state.messageWaits.map messageWaitOccurrence).Nodup)
    (member : wait ∈ state.messageWaits)
    (timers : messageWaitOccurrence wait ∉ (state.timerWaits.filter fun timer =>
      !flowNodeOccurrenceBoundaryTimerBound program state timer).map timerWaitOccurrence)
    (disposition : SelectedScopeDisposition := .remove) :
    scopeCancellationWithdrawsHandler program state root (messageWaitOccurrence wait) disposition =
      activityRecordsAttachMessageWait (withdrawnByRegion (fun owner =>
        occurrenceInSubtree state.scopeOccurrences root owner ||
          (calledInstanceClosure state root).contains owner.processInstanceId) state.activityOccurrences (retainedCancellationRoot root disposition)) wait := by
  rw [scopeCancellationWithdrawsHandler_public_keys (disposition := disposition)]
  simp only [keyed_any_unique _ _ wait _ unique member,
    keyed_any_absent _ _ (messageWaitOccurrence wait) _ timers, Bool.or_false]

theorem scopeCancellationWithdrawsHandler_timer (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (wait : TimerWait)
    (unique : ((state.timerWaits.filter fun timer =>
      !flowNodeOccurrenceBoundaryTimerBound program state timer).map timerWaitOccurrence).Nodup)
    (member : wait ∈ state.timerWaits)
    (isPublic : flowNodeOccurrenceBoundaryTimerBound program state wait = false)
    (messages : timerWaitOccurrence wait ∉ state.messageWaits.map messageWaitOccurrence)
    (disposition : SelectedScopeDisposition := .remove) :
    scopeCancellationWithdrawsHandler program state root (timerWaitOccurrence wait) disposition =
      anyTimerIdNamesWait (attachedTimersOf (withdrawnByRegion (fun owner =>
        occurrenceInSubtree state.scopeOccurrences root owner ||
          (calledInstanceClosure state root).contains owner.processInstanceId) state.activityOccurrences (retainedCancellationRoot root disposition))) wait := by
  rw [scopeCancellationWithdrawsHandler_public_keys (disposition := disposition)]
  simp only [keyed_any_absent _ _ (timerWaitOccurrence wait) _ messages, Bool.false_or]
  exact keyed_any_unique _ _ wait _ unique (List.mem_filter.mpr ⟨member, by simp [isPublic]⟩)

private theorem cancellation_wait_mapM (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (values : List α) (owner : α → ScopeOccurrenceId) (element : α → NodeId)
    (activation : α → Nat) (identity : α → OccurrenceId) (withdrawn : α → Bool)
    (entries : List OpenSemanticFlowNodeOccurrence)
    (valid : runtimePositionValid program expected state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (projected : values.mapM (fun value => waitStart? program state (owner value)
      (element value) (activation value)) = some entries)
    (identities : ∀ value ∈ values, identity value =
      { processInstanceId := (owner value).processInstanceId,
        elementId := ⟨(element value).value⟩, activation := activation value })
    (handlers : ∀ value ∈ values,
      scopeCancellationWithdrawsHandler program state root.id (identity value) disposition = withdrawn value) :
    (values.filter fun value =>
      !(occurrenceInSubtree state.scopeOccurrences root.id (owner value) ||
        (calledInstanceClosure state root.id).contains (owner value).processInstanceId) && !withdrawn value).mapM
          (fun value => waitStart? program (cancelScopeSubtree state root.id disposition)
            (owner value) (element value) (activation value)) =
      some (entries.filter fun entry => !flowNodeOccurrenceOwnedBySubtree program state root.id entry disposition) := by
  apply mapM_filter_preserves_success _ _ _ _ _ entries projected
  · intro value member entry started
    have handler := handlers value member
    rw [identities value member] at handler
    unfold waitStart? at started
    obtain ⟨process, _, started⟩ := Option.bind_eq_some_iff.mp started
    cases started
    change (!_ && !withdrawn value) =
      !(_ || scopeCancellationWithdrawsHandler program state root.id
        { processInstanceId := (owner value).processInstanceId,
          elementId := ⟨(element value).value⟩, activation := activation value } disposition)
    simp only [handler, Bool.not_or]
  · intro value member entry started kept
    simp only [Bool.and_eq_true, Bool.not_eq_true'] at kept
    rw [cancelScopeSubtree_child_wait_start_frame program state expected hosting root disposition
      (owner value) (element value) (activation value) valid running rootMember child kept.1]
    exact started

theorem cancelScopeSubtree_public_timers (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition) :
    (cancelScopeSubtree state root disposition).timerWaits.filter
        (fun timer => !flowNodeOccurrenceBoundaryTimerBound program (cancelScopeSubtree state root disposition) timer) =
      (state.timerWaits.filter fun timer => !flowNodeOccurrenceBoundaryTimerBound program state timer).filter
        (fun timer => !(occurrenceInSubtree state.scopeOccurrences root timer.owner ||
          (calledInstanceClosure state root).contains timer.owner.processInstanceId) &&
          !anyTimerIdNamesWait (attachedTimersOf (withdrawnByRegion (fun owner =>
            occurrenceInSubtree state.scopeOccurrences root owner ||
              (calledInstanceClosure state root).contains owner.processInstanceId) state.activityOccurrences (retainedCancellationRoot root disposition))) timer) := by
  calc
    _ = (cancelScopeSubtree state root disposition).timerWaits.filter
        (fun timer => !flowNodeOccurrenceBoundaryTimerBound program state timer) := by
      apply List.filter_congr
      intro timer member
      rw [cancelScopeSubtree_boundary_timer_frame program state root disposition timer member]
    _ = _ := by
      change ((state.timerWaits.filter _).filter _) = _
      rw [List.filter_filter, List.filter_filter]
      apply List.filter_congr
      intro timer _
      exact Bool.and_comm _ _

theorem cancelScopeSubtree_child_wait_projection (program : Program) (state : RuntimeState)
    (expected hosting : SemanticId) (root : RuntimeScopeOccurrence) (disposition : SelectedScopeDisposition)
    (current entries : List OpenSemanticFlowNodeOccurrence)
    (valid : runtimePositionValid program expected state = true)
    (running : state.control = .running hosting)
    (rootMember : root ∈ state.scopeOccurrences) (child : root.parent ≠ none)
    (waitValid : flowNodeOccurrenceWaitProgramValidity program state = true)
    (opened : projectOpenFlowNodeOccurrences? program state = some current)
    (projected : projectWaits? program state = some entries) :
    projectWaits? program (cancelScopeSubtree state root.id disposition) =
      some (entries.filter fun entry => !flowNodeOccurrenceOwnedBySubtree program state root.id entry disposition) := by
  let publicTimers := state.timerWaits.filter fun timer => !flowNodeOccurrenceBoundaryTimerBound program state timer
  let withdrawn := withdrawnByRegion (fun owner => occurrenceInSubtree state.scopeOccurrences root.id owner ||
    (calledInstanceClosure state root.id).contains owner.processInstanceId) state.activityOccurrences (retainedCancellationRoot root.id disposition)
  have unique := projected_public_wait_identities_nodup program state hosting current running waitValid opened
  obtain ⟨fourUnique, _, beforeIncident⟩ := List.nodup_append.mp unique
  obtain ⟨threeUnique, _, beforeEffect⟩ := List.nodup_append.mp fourUnique
  obtain ⟨twoUnique, timerUnique, beforeTimer⟩ := List.nodup_append.mp threeUnique
  obtain ⟨_, messageUnique, beforeMessage⟩ := List.nodup_append.mp twoUnique
  have taskHandlers (wait : UserTaskWait) (member : wait ∈ state.waits) :
      scopeCancellationWithdrawsHandler program state root.id (userTaskWaitOccurrence wait) disposition = false := by
    have present : userTaskWaitOccurrence wait ∈ state.waits.map userTaskWaitOccurrence :=
      List.mem_map.mpr ⟨wait, member, rfl⟩
    apply scopeCancellationWithdrawsHandler_absent (disposition := disposition)
    · intro message
      exact beforeMessage _ present _ message rfl
    · intro timer
      exact beforeTimer _ (by simp only [List.mem_append]; exact Or.inl present) _ timer rfl
  have messageHandlers (wait : MessageWait) (member : wait ∈ state.messageWaits) :
      scopeCancellationWithdrawsHandler program state root.id (messageWaitOccurrence wait) disposition =
        activityRecordsAttachMessageWait withdrawn wait := by
    apply scopeCancellationWithdrawsHandler_message (disposition := disposition) program state root.id wait messageUnique member
    intro timer
    exact beforeTimer _ (by simp only [List.mem_append]; exact Or.inr (List.mem_map.mpr ⟨wait, member, rfl⟩)) _ timer rfl
  have timerHandlers (wait : TimerWait) (member : wait ∈ publicTimers) :
      scopeCancellationWithdrawsHandler program state root.id (timerWaitOccurrence wait) disposition =
        anyTimerIdNamesWait (attachedTimersOf withdrawn) wait := by
    obtain ⟨present, visible⟩ := List.mem_filter.mp member
    apply scopeCancellationWithdrawsHandler_timer (disposition := disposition) program state root.id wait timerUnique present
      (by simpa using visible)
    intro message
    exact beforeTimer _ (by simp only [List.mem_append]; exact Or.inr message)
      _ (List.mem_map.mpr ⟨wait, member, rfl⟩) rfl
  have effectHandlers (wait : EffectWait) (member : wait ∈ state.effectWaits) :
      scopeCancellationWithdrawsHandler program state root.id (effectWaitOccurrence wait) disposition = false := by
    have present : effectWaitOccurrence wait ∈ state.effectWaits.map effectWaitOccurrence :=
      List.mem_map.mpr ⟨wait, member, rfl⟩
    apply scopeCancellationWithdrawsHandler_absent (disposition := disposition)
    · intro message
      exact beforeEffect _ (by simp only [List.mem_append]; exact Or.inl (Or.inr message)) _ present rfl
    · intro timer
      exact beforeEffect _ (by simp only [List.mem_append]; exact Or.inr timer) _ present rfl
  have incidentHandlers (incident : SemanticEffectIncident) (member : incident ∈ state.effectIncidents) :
      scopeCancellationWithdrawsHandler program state root.id (effectWaitOccurrence incident.wait) disposition = false := by
    have present : effectWaitOccurrence incident.wait ∈
        state.effectIncidents.map (fun incident => effectWaitOccurrence incident.wait) :=
      List.mem_map.mpr ⟨incident, member, rfl⟩
    apply scopeCancellationWithdrawsHandler_absent (disposition := disposition)
    · intro message
      exact beforeIncident _ (by simp only [List.mem_append]; exact Or.inl (Or.inl (Or.inr message))) _ present rfl
    · intro timer
      exact beforeIncident _ (by simp only [List.mem_append]; exact Or.inl (Or.inr timer)) _ present rfl
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
    effectsEq, incidentsEq, rfl⟩ := (projectWaits_eq_some_iff program state entries).mp projected
  obtain ⟨taskOwners, messageOwners, timerOwners, effectOwners, incidentOwners⟩ :=
    flowNodeOccurrenceWaitProgramValidity_wait_owner_ids program state waitValid
  have taskAfter := cancellation_wait_mapM program state expected hosting root disposition state.waits
    (·.owner) (fun wait => ⟨wait.task.id.value⟩) (·.activation) userTaskWaitOccurrence (fun _ => false)
    tasks valid running rootMember child tasksEq
    (by intro wait member; simp only [userTaskWaitOccurrence, taskOwners wait member]) taskHandlers
  have messageAfter := cancellation_wait_mapM program state expected hosting root disposition state.messageWaits
    (·.owner) (·.elementId) (·.activation) messageWaitOccurrence (activityRecordsAttachMessageWait withdrawn)
    messages valid running rootMember child messagesEq
    (by intro wait member; simp only [messageWaitOccurrence, messageOwners wait member]) messageHandlers
  have timerAfter := cancellation_wait_mapM program state expected hosting root disposition publicTimers
    (·.owner) (·.elementId) (·.activation) timerWaitOccurrence (anyTimerIdNamesWait (attachedTimersOf withdrawn))
    timers valid running rootMember child timersEq
    (by intro wait member; simp only [timerWaitOccurrence, timerOwners wait (List.mem_filter.mp member).1]) timerHandlers
  have effectAfter := cancellation_wait_mapM program state expected hosting root disposition state.effectWaits
    (·.owner) (·.elementId) (·.activation) effectWaitOccurrence (fun _ => false)
    effects valid running rootMember child effectsEq
    (by intro wait member; simp only [effectWaitOccurrence, effectOwners wait member]) effectHandlers
  have incidentAfter := cancellation_wait_mapM program state expected hosting root disposition state.effectIncidents
    (·.wait.owner) (·.wait.elementId) (·.wait.activation) (fun incident => effectWaitOccurrence incident.wait) (fun _ => false)
    incidents valid running rootMember child incidentsEq
    (by intro incident member; simp only [effectWaitOccurrence, incidentOwners incident member]) incidentHandlers
  simp only [Bool.not_false, Bool.and_true] at taskAfter effectAfter incidentAfter
  change (cancelScopeSubtree state root.id disposition).waits.mapM _ = _ at taskAfter
  change (cancelScopeSubtree state root.id disposition).messageWaits.mapM _ = _ at messageAfter
  change (cancelScopeSubtree state root.id disposition).effectWaits.mapM _ = _ at effectAfter
  change (cancelScopeSubtree state root.id disposition).effectIncidents.mapM _ = _ at incidentAfter
  rw [← cancelScopeSubtree_public_timers program state root.id disposition] at timerAfter
  simp only [projectWaits?, taskAfter, messageAfter, timerAfter, effectAfter, incidentAfter,
    Option.bind_eq_bind, Option.bind_some, pure, Pure.pure, List.filter_append, List.append_assoc]

end BpmnSemantics.SemanticProcess.InternalCommutation

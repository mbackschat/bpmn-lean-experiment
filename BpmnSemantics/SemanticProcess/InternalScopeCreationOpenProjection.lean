import BpmnSemantics.SemanticProcess.ScopeCreationLifecycleValidity
import BpmnSemantics.SemanticProcess.InternalScopeCreationSelectionFrames
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycleProofs
import BpmnSemantics.SemanticProcess.CallReachability
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycleOrder

/-! Open lifecycle projection through the actual scope-creation patch from the
[scope-creation contract](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#scope-creation-preparation-prerequisite).
Successful old lookups remain exact; the newly created owner intentionally gains a lookup and anchor.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem scopeCreation_process_lookup_preserved (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (owner : ScopeOccurrenceId) (process : ProcessId)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (prior : processIdForOwner? program state owner = some process) :
    processIdForOwner? program (selected.apply state) owner = some process := by
  obtain ⟨hosting, running⟩ := selectInternalScopeCreation_running state operation selected selection
  have controlFrame : (selected.apply state).control = state.control := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  have live : flowNodeOccurrenceOwnerLiveUnique state owner = true := by
    by_cases live : flowNodeOccurrenceOwnerLiveUnique state owner = true
    · exact live
    · simp [processIdForOwner?, hostingInstanceId?, running, live] at prior
  have afterLive := selectInternalScopeCreation_preserves_live state operation selected owner selection live
  change flowNodeOccurrenceOwnerLiveUnique (selected.apply state) owner = true at afterLive
  simp only [processIdForOwner?, hostingInstanceId?, controlFrame, running,
    bind, Option.bind, live, afterLive, Bool.not_true, Bool.false_eq_true, ↓reduceIte] at prior ⊢
  by_cases hostingOwner : owner.processInstanceId = hosting
  · simpa only [hostingOwner, ↓reduceIte] using prior
  simp only [hostingOwner, ↓reduceIte] at prior ⊢
  cases kind : selected.kind with
  | child => simpa only [InternalScopeCreationSelection.apply, kind] using prior
  | called record =>
      obtain ⟨_, _, _, root, _, _, freshScopes, _⟩ :=
        scopeCreation_selection_call_facts state operation selected record hosting running selection kind
      have different : record.calledRoot.processInstanceId ≠ owner.processInstanceId := by
        intro same
        have empty : state.scopeOccurrences.filter (fun scope => decide (scope.id = owner)) = [] := by
          apply List.filter_eq_nil_iff.mpr
          intro scope member matched
          have exactOwner : scope.id = owner := of_decide_eq_true matched
          have denied := List.filter_eq_nil_iff.mp (List.length_eq_zero_iff.mp freshScopes) scope member
          apply denied
          simp only [decide_eq_true_eq]
          rw [exactOwner, root, same]
        simp [flowNodeOccurrenceOwnerLiveUnique, empty] at live
      generalize filtered : state.calledProcessOccurrences.filter
        (fun candidate => decide (candidate.calledRoot.processInstanceId = owner.processInstanceId)) =
          records at prior
      cases records with
      | nil => contradiction
      | cons old rest => cases rest with
        | cons other tail => contradiction
        | nil =>
            have exactRecords :
                (sortCallRecords (record :: state.calledProcessOccurrences)).filter
                  (fun candidate => decide (candidate.calledRoot.processInstanceId = owner.processInstanceId)) =
                    [old] := by
              apply List.Perm.eq_singleton
              have permutation := (sortCallRecords_perm (record :: state.calledProcessOccurrences)).filter
                (fun candidate => decide (candidate.calledRoot.processInstanceId = owner.processInstanceId))
              simpa only [List.filter_cons, different, decide_false, Bool.false_eq_true,
                ↓reduceIte, filtered] using permutation
            simpa only [InternalScopeCreationSelection.apply, kind, exactRecords] using prior

private theorem mapM_preserves_success (values : List α) (before after : α → Option β)
    (preserved : ∀ value result, before value = some result → after value = some result)
    (results : List β) (prior : values.mapM before = some results) :
    values.mapM after = some results := by
  induction values generalizing results with
  | nil => simpa using prior
  | cons head tail ih =>
      simp only [List.mapM_cons, bind, Option.bind] at prior ⊢
      cases first : before head with
      | none => simp [first] at prior
      | some value =>
          cases rest : tail.mapM before with
          | none => simp [first, rest] at prior
          | some remaining =>
              simp only [first, rest] at prior
              rw [preserved head value first, ih remaining rest]
              exact prior

theorem scopeCreation_wait_start_preserved (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (owner : ScopeOccurrenceId) (element : NodeId) (activation : Nat)
    (start : OpenSemanticFlowNodeOccurrence)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (prior : waitStart? program state owner element activation = some start) :
    waitStart? program (selected.apply state) owner element activation = some start := by
  unfold waitStart? at prior ⊢
  obtain ⟨process, lookup, prior⟩ := Option.bind_eq_some_iff.mp prior
  rw [scopeCreation_process_lookup_preserved program state operation selected owner process selection lookup]
  exact prior

theorem scopeCreation_scope_start_preserved (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (scope : RuntimeScopeOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (prior : scopeStart? program state scope = some start) :
    scopeStart? program (selected.apply state) scope = some start := by
  unfold scopeStart? at prior ⊢
  obtain ⟨owner, parent, prior⟩ := Option.bind_eq_some_iff.mp prior
  obtain ⟨process, lookup, prior⟩ := Option.bind_eq_some_iff.mp prior
  rw [parent]
  simp only [bind, Option.bind]
  rw [scopeCreation_process_lookup_preserved program state operation selected owner process selection lookup]
  exact prior

theorem scopeCreation_call_start_preserved (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (record : CalledProcessOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (prior : callStart? program state record = some start) :
    callStart? program (selected.apply state) record = some start := by
  unfold callStart? at prior ⊢
  obtain ⟨process, lookup, prior⟩ := Option.bind_eq_some_iff.mp prior
  rw [scopeCreation_process_lookup_preserved program state operation selected record.caller process
    selection lookup]
  exact prior

theorem scopeCreation_wait_projection_preserved (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (excluded : ∀ id origin input entry definition boundary,
      .enterBoundedScope id origin input entry definition boundary ∈ program.operations →
        selected.created.parent = none ∨ definition ≠ selected.created.id.definitionScopeId)
    (waits : List OpenSemanticFlowNodeOccurrence)
    (prior : projectWaits? program state = some waits) :
    projectWaits? program (selected.apply state) = some waits := by
  have taskFrame : (selected.apply state).waits = state.waits := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  have messageFrame : (selected.apply state).messageWaits = state.messageWaits := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  have effectFrame : (selected.apply state).effectWaits = state.effectWaits := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  have incidentFrame : (selected.apply state).effectIncidents = state.effectIncidents := by
    cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
  have timerFrame : ((selected.apply state).timerWaits.filter fun wait =>
      !flowNodeOccurrenceBoundaryTimerBound program (selected.apply state) wait) =
        state.timerWaits.filter (fun wait => !flowNodeOccurrenceBoundaryTimerBound program state wait) := by
    have unchanged : (selected.apply state).timerWaits = state.timerWaits := by
      cases kind : selected.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
    rw [unchanged]
    apply List.filter_congr
    intro timer _
    rw [scopeCreation_boundary_timer_frame program state selected timer excluded]
  unfold projectWaits? at prior ⊢
  rw [taskFrame, messageFrame, timerFrame, effectFrame, incidentFrame]
  obtain ⟨tasks, tasksEq, prior⟩ := Option.bind_eq_some_iff.mp prior
  obtain ⟨messages, messagesEq, prior⟩ := Option.bind_eq_some_iff.mp prior
  obtain ⟨timers, timersEq, prior⟩ := Option.bind_eq_some_iff.mp prior
  obtain ⟨effects, effectsEq, prior⟩ := Option.bind_eq_some_iff.mp prior
  obtain ⟨incidents, incidentsEq, prior⟩ := Option.bind_eq_some_iff.mp prior
  have taskAfter := mapM_preserves_success state.waits _ _
    (fun wait start found => scopeCreation_wait_start_preserved program state operation selected
      wait.owner ⟨wait.task.id.value⟩ wait.activation start selection found) tasks tasksEq
  have messageAfter := mapM_preserves_success state.messageWaits _ _
    (fun wait start found => scopeCreation_wait_start_preserved program state operation selected
      wait.owner wait.elementId wait.activation start selection found) messages messagesEq
  have timerAfter := mapM_preserves_success _ _ _
    (fun (wait : TimerWait) start found => scopeCreation_wait_start_preserved program state operation selected
      wait.owner wait.elementId wait.activation start selection found) timers timersEq
  have effectAfter := mapM_preserves_success state.effectWaits _ _
    (fun wait start found => scopeCreation_wait_start_preserved program state operation selected
      wait.owner wait.elementId wait.activation start selection found) effects effectsEq
  have incidentAfter := mapM_preserves_success state.effectIncidents _ _
    (fun incident start found => scopeCreation_wait_start_preserved program state operation selected
      incident.wait.owner incident.wait.elementId incident.wait.activation start selection found)
      incidents incidentsEq
  rw [taskAfter]
  simp only [bind, Option.bind]
  rw [messageAfter]
  rw [timerAfter]
  rw [effectAfter]
  rw [incidentAfter]
  exact prior

theorem open_projection_single_start_from_components (program : Program) (before after : RuntimeState)
    (hostingBefore hostingAfter : SemanticId)
    (current waits scopes calls nextWaits nextScopes nextCalls : List OpenSemanticFlowNodeOccurrence)
    (start : OpenSemanticFlowNodeOccurrence)
    (beforeRunning : before.control = .running hostingBefore)
    (afterRunning : after.control = .running hostingAfter)
    (projected : projectOpenFlowNodeOccurrences? program before = some current)
    (beforeWaits : projectWaits? program before = some waits)
    (beforeScopes : (before.scopeOccurrences.filter fun scope => scope.parent.isSome).mapM
      (scopeStart? program before) = some scopes)
    (beforeCalls : before.calledProcessOccurrences.mapM (callStart? program before) = some calls)
    (afterWaits : projectWaits? program after = some nextWaits)
    (afterScopes : (after.scopeOccurrences.filter fun scope => scope.parent.isSome).mapM
      (scopeStart? program after) = some nextScopes)
    (afterCalls : after.calledProcessOccurrences.mapM (callStart? program after) = some nextCalls)
    (insertion : (nextWaits ++ nextScopes ++ nextCalls).Perm (start :: (waits ++ scopes ++ calls)))
    (fresh : start.anchor ∉ current.map (·.anchor))
    (admitted : programWellFormed program = true)
    (occurrences : flowNodeOccurrenceProgramValidity program after = true)
    (races : eventRaceAssociationsValid after = true)
    (associations : calledProcessAssociationsValid after = true)
    (incidents : effectIncidentAssociationsValid after = true)
    (messages : messageBoundedProjectionValid program after = true) :
    projectOpenFlowNodeOccurrences? program after =
      some (sortFlowNodeOccurrenceStarts (start :: current)) := by
  have currentEq : current = sortFlowNodeOccurrenceStarts (waits ++ scopes ++ calls) := by
    simp only [projectOpenFlowNodeOccurrences?, beforeRunning] at projected
    split at projected
    · contradiction
    · simp [beforeWaits, beforeScopes, beforeCalls] at projected
      simpa only [List.append_assoc] using projected.2.symm
  have currentPerm : current.Perm (waits ++ scopes ++ calls) := by
    rw [currentEq]
    exact sortFlowNodeOccurrenceStarts_perm _
  have afterPerm : (nextWaits ++ nextScopes ++ nextCalls).Perm (start :: current) :=
    insertion.trans (List.Perm.cons start currentPerm.symm)
  have currentNodup := projectOpenFlowNodeOccurrences_anchor_nodup program before current projected
  have extendedNodup : ((start :: current).map (·.anchor)).Nodup := by
    simpa only [List.map_cons, List.nodup_cons] using And.intro fresh currentNodup
  have rawNodup := (afterPerm.map (·.anchor)).nodup_iff.mpr extendedNodup
  have sortedNodup := ((sortFlowNodeOccurrenceStarts_perm
    (nextWaits ++ nextScopes ++ nextCalls)).map (·.anchor)).nodup_iff.mpr rawNodup
  have sortedEq := sortFlowNodeOccurrenceStarts_perm_eq afterPerm
  simp only [projectOpenFlowNodeOccurrences?, afterRunning, admitted, occurrences, races,
    associations, incidents, messages, Bool.not_true, Bool.or_self, Bool.false_eq_true,
    ↓reduceIte, bind, Option.bind, pure, Pure.pure, afterWaits, afterScopes, afterCalls, sortedNodup]
  rw [sortedEq]

private theorem mapM_output_member (values : List α) (project : α → Option β)
    (results : List β) (mapped : values.mapM project = some results)
    (result : β) (member : result ∈ results) :
    ∃ value ∈ values, project value = some result := by
  induction values generalizing results with
  | nil => simp_all
  | cons head tail ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
      obtain ⟨first, firstEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨rest, restEq, resultEq⟩ := Option.bind_eq_some_iff.mp mapped
      simp only [pure, Pure.pure, Option.some.injEq] at resultEq
      subst results
      rcases List.mem_cons.mp member with rfl | member
      · exact ⟨head, List.mem_cons_self, firstEq⟩
      · obtain ⟨value, valueMember, valueEq⟩ := ih rest restEq member
        exact ⟨value, List.mem_cons_of_mem head valueMember, valueEq⟩

theorem scope_start_anchor (program : Program) (state : RuntimeState)
    (scope : RuntimeScopeOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (projected : scopeStart? program state scope = some start) :
    start.anchor = .scope scope.id := by
  unfold scopeStart? at projected
  obtain ⟨owner, _, projected⟩ := Option.bind_eq_some_iff.mp projected
  obtain ⟨process, _, projected⟩ := Option.bind_eq_some_iff.mp projected
  split at projected
  · next definition _ =>
      simp only [bind, Option.bind, pure, Pure.pure, Option.some.injEq] at projected
      subst start
      rfl
  · contradiction

theorem call_start_anchor (program : Program) (state : RuntimeState)
    (record : CalledProcessOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (projected : callStart? program state record = some start) :
    start.anchor = .callActivity record.id := by
  unfold callStart? at projected
  obtain ⟨process, _, projected⟩ := Option.bind_eq_some_iff.mp projected
  cases projected
  rfl

private theorem mapped_wait_anchor (program : Program) (state : RuntimeState)
    (values : List α) (owner : α → ScopeOccurrenceId) (element : α → NodeId) (activation : α → Nat)
    (starts : List OpenSemanticFlowNodeOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (mapped : values.mapM (fun value => waitStart? program state (owner value)
      (element value) (activation value)) = some starts) (member : start ∈ starts) :
    ∃ occurrence, start.anchor = .wait occurrence := by
  obtain ⟨value, _, projected⟩ := mapM_output_member values _ starts mapped start member
  exact ⟨_, waitStart_anchor_of_eq program state _ _ _ _ projected⟩

private theorem projected_wait_anchor (program : Program) (state : RuntimeState)
    (starts : List OpenSemanticFlowNodeOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (projected : projectWaits? program state = some starts) (member : start ∈ starts) :
    ∃ occurrence, start.anchor = .wait occurrence := by
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
    effectsEq, incidentsEq, rfl⟩ := (projectWaits_eq_some_iff program state starts).mp projected
  simp only [List.mem_append] at member
  rcases member with member | member | member | member | member
  · exact mapped_wait_anchor program state state.waits (·.owner) (fun wait => ⟨wait.task.id.value⟩)
      (·.activation) tasks start tasksEq member
  · exact mapped_wait_anchor program state state.messageWaits (·.owner) (·.elementId)
      (·.activation) messages start messagesEq member
  · exact mapped_wait_anchor program state
      (state.timerWaits.filter fun wait => !flowNodeOccurrenceBoundaryTimerBound program state wait)
      (·.owner) (·.elementId)
      (·.activation) timers start timersEq member
  · exact mapped_wait_anchor program state state.effectWaits (·.owner) (·.elementId)
      (·.activation) effects start effectsEq member
  · exact mapped_wait_anchor program state state.effectIncidents (fun incident => incident.wait.owner)
      (fun incident => incident.wait.elementId) (fun incident => incident.wait.activation)
      incidents start incidentsEq member

theorem open_projection_anchor_sources (program : Program) (state : RuntimeState)
    (hosting : SemanticId) (starts : List OpenSemanticFlowNodeOccurrence)
    (start : OpenSemanticFlowNodeOccurrence) (running : state.control = .running hosting)
    (projected : projectOpenFlowNodeOccurrences? program state = some starts) (member : start ∈ starts) :
    (∃ occurrence, start.anchor = .wait occurrence) ∨
      (∃ scope ∈ state.scopeOccurrences, start.anchor = .scope scope.id) ∨
      (∃ record ∈ state.calledProcessOccurrences, start.anchor = .callActivity record.id) := by
  simp only [projectOpenFlowNodeOccurrences?, running] at projected
  split at projected
  · contradiction
  · simp only [bind, Option.bind, pure, Pure.pure] at projected
    obtain ⟨waits, waitsEq, projected⟩ := Option.bind_eq_some_iff.mp projected
    obtain ⟨scopes, scopesEq, projected⟩ := Option.bind_eq_some_iff.mp projected
    obtain ⟨calls, callsEq, projected⟩ := Option.bind_eq_some_iff.mp projected
    split at projected
    · cases projected
      rw [mem_sortFlowNodeOccurrenceStarts] at member
      rcases List.mem_append.mp member with member | member
      · rcases List.mem_append.mp member with member | member
        · exact Or.inl (projected_wait_anchor program state waits start waitsEq member)
        · obtain ⟨scope, scopeMember, scopeEq⟩ := mapM_output_member _ _ scopes scopesEq start member
          exact Or.inr (Or.inl ⟨scope, (List.mem_filter.mp scopeMember).1,
            scope_start_anchor program state scope start scopeEq⟩)
      · obtain ⟨record, recordMember, recordEq⟩ := mapM_output_member _ _ calls callsEq start member
        exact Or.inr (Or.inr ⟨record, recordMember, call_start_anchor program state record start recordEq⟩)
    · contradiction

theorem scopeCreation_called_parent_none (state : RuntimeState) (operation : SemanticOperation)
    (selected : InternalScopeCreationSelection) (record : CalledProcessOccurrence)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (called : selected.kind = .called record) : selected.created.parent = none := by
  unfold selectInternalScopeCreation? at selection
  obtain ⟨hosting, _, selection⟩ := Option.bind_eq_some_iff.mp selection
  cases operation
  all_goals first
    | contradiction
    | obtain ⟨owner, _, selection⟩ := Option.bind_eq_some_iff.mp selection
      dsimp only at selection
      repeat first | contradiction | split at selection
      all_goals cases selection
      all_goals first | contradiction | rfl

theorem scopeCreation_projection_components (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (waits scopes calls : List OpenSemanticFlowNodeOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (beforeScopes : (state.scopeOccurrences.filter fun scope => scope.parent.isSome).mapM
      (scopeStart? program state) = some scopes)
    (beforeCalls : state.calledProcessOccurrences.mapM (callStart? program state) = some calls)
    (created : (match selected.kind with
      | .child => scopeStart? program (selected.apply state) selected.created
      | .called record => callStart? program (selected.apply state) record) = some start) :
    ∃ nextScopes nextCalls,
      ((selected.apply state).scopeOccurrences.filter fun scope => scope.parent.isSome).mapM
        (scopeStart? program (selected.apply state)) = some nextScopes ∧
      (selected.apply state).calledProcessOccurrences.mapM
        (callStart? program (selected.apply state)) = some nextCalls ∧
      (waits ++ nextScopes ++ nextCalls).Perm (start :: (waits ++ scopes ++ calls)) := by
  have oldScopes := mapM_preserves_success _ _ _
    (fun scope start projected => scopeCreation_scope_start_preserved program state operation selected
      scope start selection projected) scopes beforeScopes
  have oldCalls := mapM_preserves_success _ _ _
    (fun record start projected => scopeCreation_call_start_preserved program state operation selected
      record start selection projected) calls beforeCalls
  cases kind : selected.kind with
  | child =>
      obtain ⟨hosting, running⟩ := selectInternalScopeCreation_running state operation selected selection
      have parent := (scopeCreation_selection_child_facts state operation selected hosting running selection kind).2.2.1
      have kept : selected.created.parent.isSome = true := by simp [parent]
      simp only [kind] at created
      obtain ⟨nextScopes, nextScopesEq, permutation⟩ := filter_mapM_canonicalInsertBy_some
        scopeOccurrenceBefore (fun scope => scope.parent.isSome) (scopeStart? program (selected.apply state))
        selected.created start state.scopeOccurrences scopes kept created oldScopes
      refine ⟨nextScopes, calls, ?_, ?_, ?_⟩
      · simpa only [InternalScopeCreationSelection.apply, kind, insertScopeOccurrence] using nextScopesEq
      · simpa only [InternalScopeCreationSelection.apply, kind] using oldCalls
      · simpa only [List.append_assoc] using append_component_insert_perm waits nextScopes scopes calls
          start permutation
  | called record =>
      have parent := scopeCreation_called_parent_none state operation selected record selection kind
      have rejected : selected.created.parent.isSome = false := by simp [parent]
      have scopeFrame := filter_canonicalInsertBy_rejected scopeOccurrenceBefore
        (fun scope => scope.parent.isSome) selected.created state.scopeOccurrences rejected
      simp only [kind] at created
      have withNew : (record :: state.calledProcessOccurrences).mapM
          (callStart? program (selected.apply state)) = some (start :: calls) := by
        simp [created, oldCalls]
      obtain ⟨nextCalls, nextCallsEq, permutation⟩ := mapM_some_of_perm
        (callStart? program (selected.apply state)) _ _
        (sortCallRecords_perm (record :: state.calledProcessOccurrences)) (start :: calls) withNew
      refine ⟨scopes, nextCalls, ?_, ?_, ?_⟩
      · simpa only [InternalScopeCreationSelection.apply, kind, insertScopeOccurrence, scopeFrame] using oldScopes
      · simpa only [InternalScopeCreationSelection.apply, kind] using nextCallsEq
      · simpa only [List.append_nil] using append_component_insert_perm (waits ++ scopes)
          nextCalls calls [] start permutation

theorem scopeCreation_started_anchor_fresh (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (current : List OpenSemanticFlowNodeOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (selection : selectInternalScopeCreation? state operation = some selected)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (created : (match selected.kind with
      | .child => scopeStart? program (selected.apply state) selected.created
      | .called record => callStart? program (selected.apply state) record) = some start) :
    start.anchor ∉ current.map (·.anchor) := by
  obtain ⟨hosting, running⟩ := selectInternalScopeCreation_running state operation selected selection
  intro member
  obtain ⟨old, oldMember, anchorEq⟩ := List.mem_map.mp member
  have sources := open_projection_anchor_sources program state hosting current old running projected oldMember
  cases kind : selected.kind with
  | child =>
      simp only [kind] at created
      have anchor := scope_start_anchor program (selected.apply state) selected.created start created
      have same := anchorEq.trans anchor
      rcases sources with ⟨wait, waitEq⟩ | ⟨scope, scopeMember, scopeEq⟩ | ⟨record, _, recordEq⟩
      · rw [waitEq] at same
        contradiction
      · rw [scopeEq] at same
        exact selectInternalScopeCreation_fresh state operation selected selection scope scopeMember
          (SemanticFlowNodeOccurrenceAnchor.scope.inj same)
      · rw [recordEq] at same
        contradiction
  | called record =>
      simp only [kind] at created
      have anchor := call_start_anchor program (selected.apply state) record start created
      have same := anchorEq.trans anchor
      rcases sources with ⟨wait, waitEq⟩ | ⟨scope, _, scopeEq⟩ | ⟨oldRecord, oldRecordMember, recordEq⟩
      · rw [waitEq] at same
        contradiction
      · rw [scopeEq] at same
        contradiction
      · rw [recordEq] at same
        have identity := SemanticFlowNodeOccurrenceAnchor.callActivity.inj same
        have facts := scopeCreation_selection_call_facts state operation selected record hosting
          running selection kind
        have excluded := facts.2.2.2.2.2.2.2
        have denied := List.filter_eq_nil_iff.mp (List.length_eq_zero_iff.mp excluded) oldRecord oldRecordMember
        exact denied (by simp [identity])

end BpmnSemantics.SemanticProcess.InternalCommutation

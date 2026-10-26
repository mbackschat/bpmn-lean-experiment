module

import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycleLaws
import BpmnSemantics.SemanticProcess.CallActivityLaws
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidity

/-! # Flow-node occurrence lifecycle fold-soundness laws

This module owns the quantified laws relating an accepted lifecycle delta to the independently
projected open occurrences: that an accepted operation or external-stimulus delta folds exactly to
the immediate successor projection, and that it preserves every prior open occurrence for which it
publishes no terminal.

Exactness of the four actual cancellation branches is the separate responsibility of
[`FlowNodeOccurrenceCancellationProofs`](FlowNodeOccurrenceCancellationProofs.lean), which consumes
these laws. Concrete executable witnesses remain in the conformance module.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem contains_ended_anchor_iff (ended : List UnnumberedFlowNodeOccurrenceEnd)
    (anchor : SemanticFlowNodeOccurrenceAnchor) :
    (ended.map (·.anchor)).contains anchor = true ↔
      ∃ ending, ending ∈ ended ∧ ending.anchor = anchor := by
  simp

/-- The five independently mapped wait families are the complete wait projection. -/
theorem projectWaits_eq_some_iff (program : Program) (state : RuntimeState)
    (projected : List OpenSemanticFlowNodeOccurrence) :
    projectWaits? program state = some projected ↔
      ∃ tasks messages timers effects incidents,
        state.waits.mapM (fun wait => waitStart? program state wait.owner
            ⟨wait.task.id.value⟩ wait.activation) = some tasks ∧
        state.messageWaits.mapM (fun wait => waitStart? program state wait.owner
            wait.elementId wait.activation) = some messages ∧
        (state.timerWaits.filter fun wait =>
            !flowNodeOccurrenceBoundaryTimerBound program state wait).mapM
            (fun wait => waitStart? program state wait.owner wait.elementId wait.activation) =
          some timers ∧
        state.effectWaits.mapM (fun wait => waitStart? program state wait.owner
            wait.elementId wait.activation) = some effects ∧
        state.effectIncidents.mapM (fun incident => waitStart? program state
            incident.wait.owner incident.wait.elementId incident.wait.activation) =
          some incidents ∧
        projected = tasks ++ (messages ++ (timers ++ (effects ++ incidents))) := by
  simp only [projectWaits?, Option.bind_eq_bind]
  constructor
  · intro selected
    obtain ⟨tasks, tasksEq, selected⟩ := Option.bind_eq_some_iff.mp selected
    obtain ⟨messages, messagesEq, selected⟩ := Option.bind_eq_some_iff.mp selected
    obtain ⟨timers, timersEq, selected⟩ := Option.bind_eq_some_iff.mp selected
    obtain ⟨effects, effectsEq, selected⟩ := Option.bind_eq_some_iff.mp selected
    obtain ⟨incidents, incidentsEq, resultEq⟩ := Option.bind_eq_some_iff.mp selected
    simp at resultEq
    exact ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
      effectsEq, incidentsEq, resultEq.symm⟩
  · rintro ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
      effectsEq, incidentsEq, rfl⟩
    simp [tasksEq, messagesEq, timersEq, effectsEq, incidentsEq]

theorem waitStart_anchor_of_eq (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (elementId : NodeId) (activation : Nat)
    (start : OpenSemanticFlowNodeOccurrence)
    (started : waitStart? program state owner elementId activation = some start) :
    start.anchor = .wait
      { processInstanceId := owner.processInstanceId, elementId := ⟨elementId.value⟩, activation } := by
  simp only [waitStart?, Option.bind_eq_bind] at started
  obtain ⟨processId, _, result⟩ := Option.bind_eq_some_iff.mp started
  simp at result
  have anchorEq := congrArg (fun value : OpenSemanticFlowNodeOccurrence => value.anchor) result
  change SemanticFlowNodeOccurrenceAnchor.wait
    { processInstanceId := owner.processInstanceId, elementId := ⟨elementId.value⟩,
      activation } = start.anchor at anchorEq
  exact anchorEq.symm

theorem mapM_waitStart_anchor_map (program : Program) (state : RuntimeState)
    (values : List α) (owner : α → ScopeOccurrenceId) (element : α → NodeId)
    (activation : α → Nat) (starts : List OpenSemanticFlowNodeOccurrence)
    (mapped : values.mapM (fun value => waitStart? program state (owner value)
      (element value) (activation value)) = some starts) :
    starts.map (·.anchor) = values.map (fun value =>
      SemanticFlowNodeOccurrenceAnchor.wait
        { processInstanceId := (owner value).processInstanceId,
          elementId := ⟨(element value).value⟩, activation := activation value }) := by
  induction values generalizing starts with
  | nil => simp_all
  | cons value rest ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
      obtain ⟨start, startEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨tail, tailEq, result⟩ := Option.bind_eq_some_iff.mp mapped
      simp at result
      subst starts
      simp [waitStart_anchor_of_eq program state _ _ _ _ startEq, ih tail tailEq]

/-- Every projected wait anchor comes from one raw wait family. Boundary timers remain a subset. -/
theorem projectWaits_wait_anchor_mem (program : Program) (state : RuntimeState)
    (projected : List OpenSemanticFlowNodeOccurrence) (occurrence : OccurrenceId)
    (projectedEq : projectWaits? program state = some projected)
    (member : SemanticFlowNodeOccurrenceAnchor.wait occurrence ∈ projected.map (·.anchor)) :
    occurrence ∈
      state.waits.map (fun wait =>
        { processInstanceId := wait.owner.processInstanceId,
          elementId := ⟨wait.task.id.value⟩, activation := wait.activation }) ++
      state.messageWaits.map (fun wait =>
        { processInstanceId := wait.owner.processInstanceId,
          elementId := ⟨wait.elementId.value⟩, activation := wait.activation }) ++
      state.timerWaits.map (fun wait =>
        { processInstanceId := wait.owner.processInstanceId,
          elementId := ⟨wait.elementId.value⟩, activation := wait.activation }) ++
      state.effectWaits.map (fun wait =>
        { processInstanceId := wait.owner.processInstanceId,
          elementId := ⟨wait.elementId.value⟩, activation := wait.activation }) ++
      state.effectIncidents.map (fun incident =>
        { processInstanceId := incident.wait.owner.processInstanceId,
          elementId := ⟨incident.wait.elementId.value⟩,
          activation := incident.wait.activation }) := by
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq,
      effectsEq, incidentsEq, rfl⟩ :=
    (projectWaits_eq_some_iff program state projected).mp projectedEq
  have tasksAnchors := mapM_waitStart_anchor_map program state state.waits
    (·.owner) (fun wait => ⟨wait.task.id.value⟩) (·.activation) tasks tasksEq
  have messagesAnchors := mapM_waitStart_anchor_map program state state.messageWaits
    (·.owner) (·.elementId) (·.activation) messages messagesEq
  have timersAnchors := mapM_waitStart_anchor_map program state
    (state.timerWaits.filter fun wait => !flowNodeOccurrenceBoundaryTimerBound program state wait)
    (·.owner) (·.elementId) (·.activation) timers timersEq
  have effectsAnchors := mapM_waitStart_anchor_map program state state.effectWaits
    (·.owner) (·.elementId) (·.activation) effects effectsEq
  have incidentsAnchors := mapM_waitStart_anchor_map program state state.effectIncidents
    (fun incident => incident.wait.owner) (fun incident => incident.wait.elementId)
    (fun incident => incident.wait.activation) incidents incidentsEq
  simp only [List.map_append, tasksAnchors, messagesAnchors, timersAnchors, effectsAnchors,
    incidentsAnchors, List.mem_append, List.mem_map] at member
  have rawMember :
      occurrence ∈ state.waits.map (fun wait =>
          { processInstanceId := wait.owner.processInstanceId,
            elementId := ⟨wait.task.id.value⟩, activation := wait.activation }) ∨
      occurrence ∈ state.messageWaits.map (fun wait =>
          { processInstanceId := wait.owner.processInstanceId,
            elementId := ⟨wait.elementId.value⟩, activation := wait.activation }) ∨
      occurrence ∈ state.timerWaits.map (fun wait =>
          { processInstanceId := wait.owner.processInstanceId,
            elementId := ⟨wait.elementId.value⟩, activation := wait.activation }) ∨
      occurrence ∈ state.effectWaits.map (fun wait =>
          { processInstanceId := wait.owner.processInstanceId,
            elementId := ⟨wait.elementId.value⟩, activation := wait.activation }) ∨
      occurrence ∈ state.effectIncidents.map (fun incident =>
          { processInstanceId := incident.wait.owner.processInstanceId,
            elementId := ⟨incident.wait.elementId.value⟩,
            activation := incident.wait.activation }) := by
    rcases member with member | member | member | member | member
    · exact Or.inl (by simpa using member)
    · exact Or.inr (Or.inl (by simpa using member))
    · rcases member with ⟨wait, waitMember, same⟩
      exact Or.inr (Or.inr (Or.inl (List.mem_map.mpr
        ⟨wait, (List.mem_filter.mp waitMember).1,
          SemanticFlowNodeOccurrenceAnchor.wait.inj same⟩)))
    · exact Or.inr (Or.inr (Or.inr (Or.inl (by simpa using member))))
    · exact Or.inr (Or.inr (Or.inr (Or.inr (by simpa using member))))
  simpa only [List.mem_append, or_assoc] using rawMember

theorem mapM_no_anchor (values : List α) (project : α → Option OpenSemanticFlowNodeOccurrence)
    (starts : List OpenSemanticFlowNodeOccurrence) (anchor : SemanticFlowNodeOccurrenceAnchor)
    (mapped : values.mapM project = some starts)
    (pointwise : ∀ value start, project value = some start → start.anchor ≠ anchor) :
    anchor ∉ starts.map (·.anchor) := by
  induction values generalizing starts with
  | nil => simp_all
  | cons value rest ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
      obtain ⟨start, startEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨tail, tailEq, result⟩ := Option.bind_eq_some_iff.mp mapped
      simp at result
      subst starts
      simp [Ne.symm (pointwise value start startEq), ih tail tailEq]

theorem scopeStart_anchor_ne_wait (program : Program) (state : RuntimeState)
    (occurrence : RuntimeScopeOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (wait : OccurrenceId) (started : scopeStart? program state occurrence = some start) :
    start.anchor ≠ .wait wait := by
  simp only [scopeStart?, Option.bind_eq_bind] at started
  obtain ⟨owner, _, started⟩ := Option.bind_eq_some_iff.mp started
  obtain ⟨processId, _, started⟩ := Option.bind_eq_some_iff.mp started
  generalize definitionsEq : (program.definitionScopes.filter fun scope =>
    decide (scope.id = occurrence.id.definitionScopeId)) = definitions at started
  cases definitions with
  | nil => simp at started
  | cons definition rest =>
      cases rest with
      | nil =>
          simp at started
          subst start
          simp
      | cons other tail => simp at started

theorem callStart_anchor_ne_wait (program : Program) (state : RuntimeState)
    (record : CalledProcessOccurrence) (start : OpenSemanticFlowNodeOccurrence)
    (wait : OccurrenceId) (started : callStart? program state record = some start) :
    start.anchor ≠ .wait wait := by
  simp only [callStart?, Option.bind_eq_bind] at started
  obtain ⟨processId, _, result⟩ := Option.bind_eq_some_iff.mp started
  simp at result
  subst start
  simp

private theorem mapM_some_of_mem (values : List α) (project : α → Option β)
    (results : List β) (mapped : values.mapM project = some results)
    (value : α) (member : value ∈ values) :
    ∃ result, project value = some result := by
  induction values generalizing results with
  | nil => simp at member
  | cons current rest ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
      obtain ⟨head, headEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨tail, tailEq, resultEq⟩ := Option.bind_eq_some_iff.mp mapped
      rcases List.mem_cons.mp member with rfl | restMember
      · exact ⟨head, headEq⟩
      · exact ih tail tailEq restMember

private theorem mapM_callStart_anchor_map (program : Program) (state : RuntimeState)
    (records : List CalledProcessOccurrence) (starts : List OpenSemanticFlowNodeOccurrence)
    (mapped : records.mapM (callStart? program state) = some starts) :
    starts.map (·.anchor) = records.map fun record => .callActivity record.id := by
  induction records generalizing starts with
  | nil => simp_all
  | cons record rest ih =>
      simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
      obtain ⟨start, startEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨tail, tailEq, result⟩ := Option.bind_eq_some_iff.mp mapped
      simp at result
      subst starts
      simp only [List.map_cons, List.cons.injEq, ih tail tailEq, and_true]
      simp only [callStart?, Option.bind_eq_bind] at startEq
      obtain ⟨processId, _, result⟩ := Option.bind_eq_some_iff.mp startEq
      simp at result
      subst start
      rfl

private theorem call_activity_anchor_nodup_ids (records : List CalledProcessOccurrence)
    (nodup : (records.map fun record =>
      SemanticFlowNodeOccurrenceAnchor.callActivity record.id).Nodup) :
    (records.map (·.id)).Nodup := by
  induction records with
  | nil => simp
  | cons record rest ih =>
      simp only [List.map_cons, List.nodup_cons] at nodup ⊢
      refine ⟨?_, ih nodup.2⟩
      intro member
      obtain ⟨candidate, candidateMember, candidateEq⟩ := List.mem_map.mp member
      apply nodup.1
      exact List.mem_map.mpr ⟨candidate, candidateMember,
        congrArg SemanticFlowNodeOccurrenceAnchor.callActivity candidateEq⟩

private theorem projected_called_process_ids_nodup (program : Program) (state : RuntimeState)
    (current : List OpenSemanticFlowNodeOccurrence) (instanceId : SemanticId)
    (running : state.control = .running instanceId)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    (state.calledProcessOccurrences.map (·.id)).Nodup := by
  simp only [projectOpenFlowNodeOccurrences?, running] at projected
  split at projected
  · simp at projected
  · cases waitsEq : projectWaits? program state with
    | none => simp [waitsEq] at projected
    | some waits =>
        cases scopesEq :
            (state.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
              (scopeStart? program state) with
        | none => simp [waitsEq, scopesEq] at projected
        | some scopes =>
            cases callsEq : state.calledProcessOccurrences.mapM (callStart? program state) with
            | none => simp [waitsEq, scopesEq, callsEq] at projected
            | some calls =>
                simp [waitsEq, scopesEq, callsEq] at projected
                let raw := waits ++ (scopes ++ calls)
                have rawNodup : (raw.map (·.anchor)).Nodup :=
                  ((sortFlowNodeOccurrenceStarts_perm raw).map (·.anchor)).nodup_iff.mp
                    projected.1
                have callsNodup : (calls.map (·.anchor)).Nodup :=
                  (List.nodup_append.mp
                    (List.nodup_append.mp
                      (by simpa [raw, List.map_append] using rawNodup)).2.1).2.1
                rw [mapM_callStart_anchor_map program state _ _ callsEq] at callsNodup
                exact call_activity_anchor_nodup_ids _ callsNodup

theorem filter_eq_singleton_of_key_nodup (values : List α) (key : α → β)
    [DecidableEq β] (predicate : α → Bool) (selected : α)
    (keysNodup : (values.map key).Nodup) (selectedMember : selected ∈ values)
    (selectedAccepted : predicate selected = true)
    (acceptedKey : ∀ value ∈ values, predicate value = true → key value = key selected) :
    values.filter predicate = [selected] := by
  induction values with
  | nil => simp at selectedMember
  | cons current rest ih =>
      obtain ⟨keyFresh, restNodup⟩ := List.nodup_cons.mp keysNodup
      by_cases currentEq : current = selected
      · subst current
        have restRejected : ∀ value ∈ rest, predicate value = false := by
          intro value member
          apply Bool.eq_false_iff.mpr
          intro accepted
          have sameKey := acceptedKey value (by simp [member]) accepted
          exact keyFresh (sameKey ▸ List.mem_map.mpr ⟨value, member, rfl⟩)
        have filteredEmpty : rest.filter predicate = [] :=
          List.filter_eq_nil_iff.mpr fun value member accepted => by
            rw [restRejected value member] at accepted
            contradiction
        simp [selectedAccepted, filteredEmpty]
      · have selectedRest : selected ∈ rest :=
          (List.mem_cons.mp selectedMember).resolve_left (Ne.symm currentEq)
        have currentRejected : predicate current = false := by
          apply Bool.eq_false_iff.mpr
          intro accepted
          have sameKey := acceptedKey current (by simp) accepted
          exact keyFresh (sameKey ▸ List.mem_map.mpr ⟨selected, selectedRest, rfl⟩)
        have restKeys : ∀ value ∈ rest, predicate value = true →
            key value = key selected := by
          exact fun value member => acceptedKey value (by simp [member])
        simp [currentRejected, ih restNodup selectedRest restKeys]

/-- A successful open projection resolves the Process identity of every exact live owner. -/
theorem processIdForOwner_isSome_of_open_projection (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (current : List OpenSemanticFlowNodeOccurrence)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (callsValid : calledProcessAssociationsValid state = true)
    (live : exactLiveOccurrence state owner = true)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    (processIdForOwner? program state owner).isSome = true := by
  have binding := flowNodeOccurrenceStructuralProgramValidity_live_owner_binding
    program state owner instanceId structural running live
  have ownerLive : flowNodeOccurrenceOwnerLiveUnique state owner = true := by
    simpa [exactLiveOccurrence, flowNodeOccurrenceOwnerLiveUnique] using live
  rcases binding with ⟨occurrence, parent, occurrenceMember, occurrenceEq, parentEq,
      sameInstance, parentLive⟩ | hosting | ⟨record, recordMember, rootEq⟩
  · have filteredMember : occurrence ∈
        state.scopeOccurrences.filter fun current => current.parent.isSome :=
      List.mem_filter.mpr ⟨occurrenceMember, by simp [parentEq]⟩
    simp only [projectOpenFlowNodeOccurrences?, running] at projected
    split at projected
    · simp at projected
    · cases waitsEq : projectWaits? program state with
      | none => simp [waitsEq] at projected
      | some waits =>
          cases scopesEq :
              (state.scopeOccurrences.filter fun current => current.parent.isSome).mapM
                (scopeStart? program state) with
          | none => simp [waitsEq, scopesEq] at projected
          | some scopes =>
              obtain ⟨start, started⟩ := mapM_some_of_mem _ _ scopes scopesEq
                occurrence filteredMember
              simp only [scopeStart?, Option.bind_eq_bind, parentEq, Option.bind_some] at started
              obtain ⟨processId, parentProcess, _⟩ := Option.bind_eq_some_iff.mp started
              have parentSome := congrArg Option.isSome parentProcess
              simpa [processIdForOwner?, hostingInstanceId?, running, ownerLive,
                parentLive, sameInstance] using parentSome
  · simp [processIdForOwner?, hostingInstanceId?, running, ownerLive, hosting]
  · have idsNodup := projected_called_process_ids_nodup program state current instanceId
        running projected
    have accepted : (fun candidate : CalledProcessOccurrence =>
        decide (candidate.calledRoot.processInstanceId = owner.processInstanceId)) record = true := by
      simp [rootEq]
    have sameId : ∀ candidate ∈ state.calledProcessOccurrences,
        decide (candidate.calledRoot.processInstanceId = owner.processInstanceId) = true →
          candidate.id = record.id := by
      intro candidate candidateMember candidateAccepted
      apply calledProcessAssociationsValid_called_instance_injective state candidate record running
        callsValid candidateMember recordMember
      exact (of_decide_eq_true candidateAccepted).trans
        (congrArg ScopeOccurrenceId.processInstanceId rootEq).symm
    have singleton := filter_eq_singleton_of_key_nodup state.calledProcessOccurrences
      (·.id) (fun candidate =>
        decide (candidate.calledRoot.processInstanceId = owner.processInstanceId)) record
      idsNodup recordMember accepted sameId
    by_cases hostingOwner : owner.processInstanceId = instanceId
    · simp [processIdForOwner?, hostingInstanceId?, running, ownerLive, hostingOwner]
    · simp [processIdForOwner?, hostingInstanceId?, running, ownerLive, hostingOwner,
        singleton]

/-- A successful running-state projection exposes every guard it checked. -/
theorem projectOpenFlowNodeOccurrences_validities (program : Program) (state : RuntimeState)
    (current : List OpenSemanticFlowNodeOccurrence) (instanceId : SemanticId)
    (running : state.control = .running instanceId)
    (projected : projectOpenFlowNodeOccurrences? program state = some current) :
    flowNodeOccurrenceProgramValidity program state = true ∧
      calledProcessAssociationsValid state = true ∧
      eventRaceAssociationsValid state = true ∧
      effectIncidentAssociationsValid state = true ∧
      messageBoundedProjectionValid program state = true := by
  unfold projectOpenFlowNodeOccurrences? at projected
  rw [running] at projected
  generalize invalidEq : (!programWellFormed program ||
    !flowNodeOccurrenceProgramValidity program state ||
    !eventRaceAssociationsValid state ||
    !calledProcessAssociationsValid state ||
    !effectIncidentAssociationsValid state ||
    !messageBoundedProjectionValid program state) = invalid at projected
  cases invalid with
  | true => simp at projected
  | false =>
      simp at invalidEq
      exact ⟨invalidEq.1.1.1.1.2, invalidEq.1.1.2, invalidEq.1.1.1.2,
        invalidEq.1.2, invalidEq.2⟩

/-- One fresh projected wait preserves the independent open-set oracle. -/
theorem projectOpenFlowNodeOccurrences_one_wait_insert_isSome
    (program : Program) (before after : RuntimeState)
    (newStart : OpenSemanticFlowNodeOccurrence) (current : List OpenSemanticFlowNodeOccurrence)
    (beforeRunning : before.control = .running beforeInstance)
    (afterRunning : after.control = .running afterInstance)
    (beforeProjected : projectOpenFlowNodeOccurrences? program before = some current)
    (waitInsertion : ∀ beforeWaits, projectWaits? program before = some beforeWaits →
      ∃ afterWaits, projectWaits? program after = some afterWaits ∧
        afterWaits.Perm (newStart :: beforeWaits))
    (scopesFrame :
      (after.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
          (scopeStart? program after) =
        (before.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
          (scopeStart? program before))
    (callsFrame : after.calledProcessOccurrences.mapM (callStart? program after) =
      before.calledProcessOccurrences.mapM (callStart? program before))
    (newWaitAnchor : ∃ occurrence, newStart.anchor = .wait occurrence)
    (freshWaits : ∀ beforeWaits, projectWaits? program before = some beforeWaits →
      newStart.anchor ∉ beforeWaits.map (·.anchor))
    (programValid : programWellFormed program = true)
    (occurrencesValid : flowNodeOccurrenceProgramValidity program after = true)
    (racesValid : eventRaceAssociationsValid after = true)
    (callsValid : calledProcessAssociationsValid after = true)
    (incidentsValid : effectIncidentAssociationsValid after = true)
    (messagePairsValid : messageBoundedProjectionValid program after = true) :
    (projectOpenFlowNodeOccurrences? program after).isSome = true := by
  simp only [projectOpenFlowNodeOccurrences?, beforeRunning] at beforeProjected
  split at beforeProjected
  · simp at beforeProjected
  · cases beforeWaitsEq : projectWaits? program before with
    | none => simp [beforeWaitsEq] at beforeProjected
    | some beforeWaits =>
        cases beforeScopesEq :
            (before.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
              (scopeStart? program before) with
        | none => simp [beforeWaitsEq, beforeScopesEq] at beforeProjected
        | some scopes =>
            cases beforeCallsEq : before.calledProcessOccurrences.mapM
                (callStart? program before) with
            | none => simp [beforeWaitsEq, beforeScopesEq, beforeCallsEq] at beforeProjected
            | some calls =>
                simp [beforeWaitsEq, beforeScopesEq, beforeCallsEq] at beforeProjected
                obtain ⟨afterWaits, afterWaitsEq, waitsPerm⟩ :=
                  waitInsertion beforeWaits beforeWaitsEq
                have afterScopesEq :
                    (after.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).mapM
                        (scopeStart? program after) = some scopes := by
                  rw [scopesFrame, beforeScopesEq]
                have afterCallsEq : after.calledProcessOccurrences.mapM
                    (callStart? program after) = some calls := by
                  rw [callsFrame, beforeCallsEq]
                let beforeRaw := beforeWaits ++ (scopes ++ calls)
                let afterRaw := afterWaits ++ (scopes ++ calls)
                have beforeFacts : current = sortFlowNodeOccurrenceStarts beforeRaw ∧
                    (beforeRaw.map (·.anchor)).Nodup := ⟨beforeProjected.2.symm,
                  ((sortFlowNodeOccurrenceStarts_perm beforeRaw).map (·.anchor)).nodup_iff.mp
                    beforeProjected.1⟩
                have freshRaw : newStart.anchor ∉ beforeRaw.map (·.anchor) := by
                  obtain ⟨newOccurrence, newAnchorEq⟩ := newWaitAnchor
                  have freshWait := freshWaits beforeWaits beforeWaitsEq
                  rw [newAnchorEq] at freshWait ⊢
                  have freshScopes := mapM_no_anchor _ (scopeStart? program before) scopes
                    (.wait newOccurrence) beforeScopesEq
                    (fun occurrence start started =>
                      scopeStart_anchor_ne_wait program before occurrence start newOccurrence started)
                  have freshCalls := mapM_no_anchor _ (callStart? program before) calls
                    (.wait newOccurrence) beforeCallsEq
                    (fun record start started =>
                      callStart_anchor_ne_wait program before record start newOccurrence started)
                  simpa only [beforeRaw, List.map_append, List.mem_append, not_or] using
                    ⟨freshWait, freshScopes, freshCalls⟩
                have insertedNodup : ((newStart :: beforeRaw).map (·.anchor)).Nodup :=
                  List.nodup_cons.mpr ⟨freshRaw, beforeFacts.2⟩
                have afterRawNodup : (afterRaw.map (·.anchor)).Nodup :=
                  ((waitsPerm.append (List.Perm.refl (scopes ++ calls))).map
                    (·.anchor)).nodup_iff.mpr insertedNodup
                have afterSortedNodup :
                    ((sortFlowNodeOccurrenceStarts afterRaw).map (·.anchor)).Nodup :=
                  ((sortFlowNodeOccurrenceStarts_perm afterRaw).map
                    (·.anchor)).nodup_iff.mpr afterRawNodup
                simp [projectOpenFlowNodeOccurrences?, afterRunning, programValid,
                  occurrencesValid, racesValid, callsValid, incidentsValid, messagePairsValid,
                  afterWaitsEq, afterScopesEq, afterCallsEq, afterRaw, afterSortedNodup]

private theorem accepted_candidate_equals_independent_open_projection
    (program : Program) (before after : RuntimeState)
    (candidate delta : UnnumberedFlowNodeOccurrenceDelta)
    (accepted : acceptFlowNodeOccurrenceCandidate? program before after candidate = some delta) :
    ∃ openBefore openAfter,
      candidate = delta ∧
      projectOpenFlowNodeOccurrences? program before = some openBefore ∧
      projectOpenFlowNodeOccurrences? program after = some openAfter ∧
      applyFlowNodeOccurrenceDelta? openBefore delta = some openAfter := by
  unfold acceptFlowNodeOccurrenceCandidate? at accepted
  simp only [Option.bind_eq_bind] at accepted
  obtain ⟨openBefore, beforeEq, projected⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨openAfter, afterEq, folded⟩ := Option.bind_eq_some_iff.mp projected
  obtain ⟨foldResult, foldEq, selected⟩ := Option.bind_eq_some_iff.mp folded
  split at selected <;> simp_all

/-- Any accepted operation delta folds to the independently projected immediate successor. -/
theorem accepted_operation_delta_equals_independent_open_projection
    (program : Program) (before after : RuntimeState) (operation : SemanticOperation)
    (commandId : SemanticId) (transitionIndex : Nat)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (accepted : flowNodeOccurrenceDeltaForOperation? program before after operation
      commandId transitionIndex = some delta) :
    ∃ openBefore openAfter,
      projectOpenFlowNodeOccurrences? program before = some openBefore ∧
      projectOpenFlowNodeOccurrences? program after = some openAfter ∧
      applyFlowNodeOccurrenceDelta? openBefore delta = some openAfter := by
  unfold flowNodeOccurrenceDeltaForOperation? at accepted
  obtain ⟨candidate, _, acceptedCandidate⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨openBefore, openAfter, candidateEq, beforeEq, afterEq, folded⟩ :=
    accepted_candidate_equals_independent_open_projection program before after candidate delta
      acceptedCandidate
  exact ⟨openBefore, openAfter, beforeEq, afterEq, folded⟩

/-- Every successful open projection has pairwise-distinct lifecycle anchors. -/
theorem projectOpenFlowNodeOccurrences_anchor_nodup (program : Program)
    (state : RuntimeState) (projected : List OpenSemanticFlowNodeOccurrence)
    (selected : projectOpenFlowNodeOccurrences? program state = some projected) :
    (projected.map (·.anchor)).Nodup := by
  unfold projectOpenFlowNodeOccurrences? at selected
  cases controlEq : state.control <;> simp_all
  case running =>
    obtain ⟨_, projectedState⟩ := selected
    obtain ⟨waits, _, projectedState⟩ := Option.bind_eq_some_iff.mp projectedState
    obtain ⟨scopes, _, projectedState⟩ := Option.bind_eq_some_iff.mp projectedState
    obtain ⟨calls, _, projectedState⟩ := Option.bind_eq_some_iff.mp projectedState
    split at projectedState
    · simp at projectedState
      subst projected
      assumption
    · simp at projectedState

/-- External-stimulus acceptance has the same exact immediate-successor fold guarantee. -/
theorem accepted_stimulus_delta_equals_independent_open_projection
    (program : Program) (before after : RuntimeState) (stimulus : Stimulus)
    (transitionIndex : Nat) (delta : UnnumberedFlowNodeOccurrenceDelta)
    (accepted : flowNodeOccurrenceDeltaForStimulus? program before after stimulus
      transitionIndex = some delta) :
    ∃ openBefore openAfter,
      projectOpenFlowNodeOccurrences? program before = some openBefore ∧
      projectOpenFlowNodeOccurrences? program after = some openAfter ∧
      applyFlowNodeOccurrenceDelta? openBefore delta = some openAfter := by
  unfold flowNodeOccurrenceDeltaForStimulus? at accepted
  obtain ⟨candidate, _, acceptedCandidate⟩ := Option.bind_eq_some_iff.mp accepted
  obtain ⟨openBefore, openAfter, candidateEq, beforeEq, afterEq, folded⟩ :=
    accepted_candidate_equals_independent_open_projection program before after candidate delta
      acceptedCandidate
  exact ⟨openBefore, openAfter, beforeEq, afterEq, folded⟩

/-- An accepted delta preserves every prior open occurrence for which it publishes no terminal. -/
theorem accepted_delta_preserves_unended_open_occurrence
    (current : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (after : List OpenSemanticFlowNodeOccurrence)
    (occurrence : OpenSemanticFlowNodeOccurrence)
    (accepted : applyFlowNodeOccurrenceDelta? current delta = some after)
    (wasOpen : occurrence ∈ current)
    (unended : (delta.ended.map (·.anchor)).contains occurrence.anchor = false) :
    occurrence ∈ after := by
  unfold applyFlowNodeOccurrenceDelta? at accepted
  repeat' split at accepted <;> simp_all
  have resultEq : removeEndedFlowNodeOccurrences (availableAfterStarts current delta)
      delta.ended = after := accepted.2.2.2
  rw [← resultEq]
  rw [mem_removeEndedFlowNodeOccurrences]
  constructor
  · exact mem_sortFlowNodeOccurrenceStarts occurrence (current ++ delta.started) |>.2
      (List.mem_append_left delta.started wasOpen)
  · cases containsEq : (delta.ended.map (·.anchor)).contains occurrence.anchor with
    | false => rfl
    | true =>
        obtain ⟨ending, endingMember, anchorEq⟩ :=
          (contains_ended_anchor_iff delta.ended occurrence.anchor).mp containsEq
        exact False.elim (unended ending endingMember anchorEq)

/-- Human and Service projections are total when all live owners belong to the hosting Process and their raw anchors are unique. -/
theorem projectOpenFlowNodeOccurrences_hosting_total (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (wellFormed : programWellFormed program = true)
    (valid : flowNodeOccurrenceProgramValidity program state = true)
    (races : eventRaceAssociationsValid state = true)
    (calls : calledProcessAssociationsValid state = true)
    (messagePairs : messageBoundedProjectionValid program state = true)
    (messagesEmpty : state.messageWaits = []) (timersEmpty : state.timerWaits = [])
    (incidentsEmpty : state.effectIncidents = []) (callsEmpty : state.calledProcessOccurrences = [])
    (hosting : ∀ owner, flowNodeOccurrenceOwnerLiveUnique state owner = true →
      owner.processInstanceId = instanceId)
    (waitsUnique : ((state.waits.map fun wait =>
      (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : OccurrenceId)) ++
      state.effectWaits.map fun wait =>
        (⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩ : OccurrenceId)).Nodup)
    (scopesUnique : (state.scopeOccurrences.map (·.id)).Nodup) :
    ∃ occurrences, projectOpenFlowNodeOccurrences? program state = some occurrences := by
  have mapTotal {α β : Type} (values : List α) (project : α → Option β)
      (total : ∀ value ∈ values, ∃ result, project value = some result) :
      ∃ results, values.mapM project = some results := by
    induction values with
    | nil => exact ⟨[], rfl⟩
    | cons head tail ih =>
        obtain ⟨first, firstEq⟩ := total head (by simp)
        obtain ⟨rest, restEq⟩ := ih (fun value member => total value (by simp [member]))
        exact ⟨first :: rest, by simp [firstEq, restEq]⟩
  have processTotal (owner : ScopeOccurrenceId) (live : flowNodeOccurrenceOwnerLiveUnique state owner = true) :
      processIdForOwner? program state owner = some program.processId := by
    simp [processIdForOwner?, hostingInstanceId?, running, live, hosting owner live]
  have structural : flowNodeOccurrenceStructuralProgramValidity program state = true :=
    (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp valid).1).1).1
  have waits : flowNodeOccurrenceWaitProgramValidity program state = true :=
    (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp valid).1).1).2
  have humans := (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp waits).1).1).1
  have effects := (Bool.and_eq_true_iff.mp waits).2
  have userTotal (wait : UserTaskWait) (member : wait ∈ state.waits) :
      ∃ start, waitStart? program state wait.owner ⟨wait.task.id.value⟩ wait.activation = some start := by
    have checked := List.all_eq_true.mp humans wait member
    have owned : FlowNodeOccurrenceProgramValidity.Internal.occurrenceOwnerValid state
        wait.processInstanceId wait.owner ⟨wait.task.id.value⟩ wait.activation = true := by
      with_unfolding_all exact (Bool.and_eq_true_iff.mp checked).1
    have live := (Bool.and_eq_true_iff.mp owned).2
    refine ⟨{
      anchor := .wait ⟨wait.owner.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩
      processId := program.processId, elementId := ⟨wait.task.id.value⟩, owner := wait.owner }, ?_⟩
    simp [waitStart?, processTotal wait.owner live]
    with_unfolding_all rfl
  have effectTotal (wait : EffectWait) (member : wait ∈ state.effectWaits) :
      ∃ start, waitStart? program state wait.owner wait.elementId wait.activation = some start := by
    have checked := List.all_eq_true.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp effects).1).1 wait member
    have owned : FlowNodeOccurrenceProgramValidity.Internal.occurrenceOwnerValid state
        wait.processInstanceId wait.owner wait.elementId wait.activation = true := by
      with_unfolding_all exact (Bool.and_eq_true_iff.mp checked).1
    have live := (Bool.and_eq_true_iff.mp owned).2
    refine ⟨{
      anchor := .wait ⟨wait.owner.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩
      processId := program.processId, elementId := wait.elementId, owner := wait.owner }, ?_⟩
    simp [waitStart?, processTotal wait.owner live]
    with_unfolding_all rfl
  obtain ⟨userStarts, usersEq⟩ := mapTotal state.waits _ userTotal
  obtain ⟨effectStarts, effectsEq⟩ := mapTotal state.effectWaits _ effectTotal
  have scopeTotal (scope : RuntimeScopeOccurrence)
      (member : scope ∈ state.scopeOccurrences.filter (fun occurrence => occurrence.parent.isSome)) :
      ∃ start, scopeStart? program state scope = some start := by
    obtain ⟨present, parented⟩ := List.mem_filter.mp member
    obtain ⟨parent, parentEq⟩ := Option.isSome_iff_exists.mp parented
    have checked := List.all_eq_true.mp (Bool.and_eq_true_iff.mp structural).1 scope present
    with_unfolding_all
      change (match program.definitionScopes.filter (fun definition => decide (definition.id = scope.id.definitionScopeId)) with
        | [definition] => _ | _ => false) = true at checked
    generalize census : program.definitionScopes.filter
        (fun definition => decide (definition.id = scope.id.definitionScopeId)) = definitions at checked
    cases definitions with
    | nil => simp at checked
    | cons definition rest =>
        cases rest with
        | cons other tail => simp at checked
        | nil =>
            simp only [Bool.and_eq_true] at checked
            have parentLive : flowNodeOccurrenceOwnerLiveUnique state parent = true := by
              cases definitionParent : definition.parentScopeId <;>
                simp [definitionParent, parentEq, running] at checked
              exact checked.2.2
            refine ⟨{
              anchor := .scope scope.id, processId := program.processId
              elementId := definition.originElementId, owner := parent }, ?_⟩
            simp [scopeStart?, parentEq, processTotal parent parentLive, census]
  obtain ⟨scopeStarts, scopesEq⟩ := mapTotal
    (state.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome) _ scopeTotal
  have scopeAnchors : scopeStarts.map (·.anchor) =
      (state.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).map
        (fun occurrence => SemanticFlowNodeOccurrenceAnchor.scope occurrence.id) := by
    have transport (values : List RuntimeScopeOccurrence) (starts : List OpenSemanticFlowNodeOccurrence)
        (mapped : values.mapM (scopeStart? program state) = some starts) :
        starts.map (·.anchor) = values.map (fun occurrence => SemanticFlowNodeOccurrenceAnchor.scope occurrence.id) := by
      induction values generalizing starts with
      | nil => simp_all
      | cons head tail ih =>
          simp only [List.mapM_cons, Option.bind_eq_bind] at mapped
          obtain ⟨first, firstEq, mapped⟩ := Option.bind_eq_some_iff.mp mapped
          obtain ⟨rest, restEq, result⟩ := Option.bind_eq_some_iff.mp mapped
          cases Option.some.inj result
          have anchor : first.anchor = .scope head.id := by
            unfold scopeStart? at firstEq
            obtain ⟨_, _, firstEq⟩ := Option.bind_eq_some_iff.mp firstEq
            obtain ⟨_, _, firstEq⟩ := Option.bind_eq_some_iff.mp firstEq
            split at firstEq <;> simp_all
            cases firstEq
            rfl
          simp [anchor, ih rest restEq]
    exact transport _ _ scopesEq
  have ownerIds := flowNodeOccurrenceProgramValidity_wait_owner_ids program state valid
  have userAnchors : userStarts.map (·.anchor) = state.waits.map
      (fun wait => SemanticFlowNodeOccurrenceAnchor.wait
        ⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩) := by
    rw [mapM_waitStart_anchor_map program state _ _ _ _ _ usersEq]
    apply List.map_congr_left
    intro wait member
    simp [ownerIds.1 wait member]
  have effectAnchors : effectStarts.map (·.anchor) = state.effectWaits.map
      (fun wait => SemanticFlowNodeOccurrenceAnchor.wait
        ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩) := by
    rw [mapM_waitStart_anchor_map program state _ _ _ _ _ effectsEq]
    apply List.map_congr_left
    intro wait member
    simp [ownerIds.2.2.2.1 wait member]
  have waitAnchors : ((userStarts ++ effectStarts).map (·.anchor)).Nodup := by
    simpa only [List.Nodup, List.map_append, userAnchors, effectAnchors, List.map_map, Function.comp_def] using
      waitsUnique.map (S := (· ≠ ·)) (f := SemanticFlowNodeOccurrenceAnchor.wait)
        (by intro left right different equal; exact different (SemanticFlowNodeOccurrenceAnchor.wait.inj equal))
  have scopeKeys : ((state.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).map (·.id)).Nodup :=
    ((List.filter_sublist : (state.scopeOccurrences.filter fun occurrence => occurrence.parent.isSome).Sublist
      state.scopeOccurrences).map RuntimeScopeOccurrence.id).nodup scopesUnique
  have scopeUnique : (scopeStarts.map (·.anchor)).Nodup := by
    rw [scopeAnchors]
    simpa only [List.Nodup, List.map_map, Function.comp_def] using
      scopeKeys.map (S := (· ≠ ·)) (f := SemanticFlowNodeOccurrenceAnchor.scope)
        (by intro left right different equal; exact different (SemanticFlowNodeOccurrenceAnchor.scope.inj equal))
  have disjoint : ∀ left ∈ (userStarts ++ effectStarts).map (·.anchor),
      ∀ right ∈ scopeStarts.map (·.anchor), left ≠ right := by
    rw [List.map_append, userAnchors, effectAnchors, scopeAnchors]
    simp only [List.mem_append, List.mem_map]
    rintro _ (⟨_, _, rfl⟩ | ⟨_, _, rfl⟩) _ ⟨_, _, rfl⟩ equal <;> contradiction
  let projected := sortFlowNodeOccurrenceStarts (userStarts ++ effectStarts ++ scopeStarts)
  have unique : (projected.map (·.anchor)).Nodup :=
    ((sortFlowNodeOccurrenceStarts_perm _).map (·.anchor)).nodup_iff.mpr
      (by simpa only [List.map_append] using List.nodup_append.mpr ⟨waitAnchors, scopeUnique, disjoint⟩)
  have canonicalUnique : ((sortFlowNodeOccurrenceStarts (userStarts ++ (effectStarts ++ scopeStarts))).map (·.anchor)).Nodup :=
    by simpa only [projected, List.append_assoc] using unique
  refine ⟨projected, ?_⟩
  simp [projectOpenFlowNodeOccurrences?, running, wellFormed, valid, races, calls, messagePairs,
    effectIncidentAssociationsValid, incidentsEmpty, projectWaits?, messagesEmpty, timersEmpty,
    usersEq, effectsEq, scopesEq, callsEmpty, projected, canonicalUnique, List.append_assoc]

end BpmnSemantics.SemanticProcess

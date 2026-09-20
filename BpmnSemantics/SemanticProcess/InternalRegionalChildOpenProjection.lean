import BpmnSemantics.SemanticProcess.InternalRegionalChildWaitProjection

/-! The actual child-completion projection removes exactly the completed scope anchor.
All admission predicates and component projections come from predecessor validity and
the selected evaluator; canonical filtering preserves the predecessor anchor census. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem projectWaits_filter_non_wait_anchor (program : Program) (state : RuntimeState)
    (anchor : SemanticFlowNodeOccurrenceAnchor) (entries : List OpenSemanticFlowNodeOccurrence)
    (nonWait : ∀ id, (.wait id : SemanticFlowNodeOccurrenceAnchor) ≠ anchor)
    (projected : projectWaits? program state = some entries) :
    entries.filter (fun entry => decide (entry.anchor ≠ anchor)) = entries := by
  have mapped {α : Type} (values : List α) (owner : α → ScopeOccurrenceId) (element : α → NodeId)
      (activation : α → Nat) (starts : List OpenSemanticFlowNodeOccurrence)
      (found : values.mapM (fun value => waitStart? program state (owner value) (element value) (activation value)) = some starts) :
      starts.filter (fun entry => decide (entry.anchor ≠ anchor)) = starts := by
    apply List.filter_eq_self.mpr
    intro entry member
    obtain ⟨value, _, selected⟩ := mapM_output_member values _ starts found entry member
    rw [waitStart_anchor_of_eq program state (owner value) (element value) (activation value) entry selected]
    simp [nonWait]
  obtain ⟨tasks, messages, timers, effects, incidents, tasksEq, messagesEq, timersEq, effectsEq, incidentsEq, rfl⟩ :=
    (projectWaits_eq_some_iff program state entries).mp projected
  simp only [List.filter_append,
    mapped state.waits (·.owner) (fun wait => ⟨wait.task.id.value⟩) (·.activation) tasks tasksEq,
    mapped state.messageWaits (·.owner) (·.elementId) (·.activation) messages messagesEq,
    mapped (state.timerWaits.filter fun timer => !flowNodeOccurrenceBoundaryTimerBound program state timer)
      (·.owner) (·.elementId) (·.activation) timers timersEq,
    mapped state.effectWaits (·.owner) (·.elementId) (·.activation) effects effectsEq,
    mapped state.effectIncidents (·.wait.owner) (·.wait.elementId) (·.wait.activation) incidents incidentsEq]

theorem projectWaits_filter_scope_anchor (program : Program) (state : RuntimeState)
    (root : ScopeOccurrenceId) (entries : List OpenSemanticFlowNodeOccurrence)
    (projected : projectWaits? program state = some entries) :
    entries.filter (fun entry => decide (entry.anchor ≠ .scope root)) = entries :=
  projectWaits_filter_non_wait_anchor program state (.scope root) entries (by intro id; simp) projected

theorem preparedChildComplete_open_projection (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (current : List OpenSemanticFlowNodeOccurrence)
    (admitted : programWellFormed program = true)
    (identities : waitIdentitiesUnique before = true)
    (projected : projectOpenFlowNodeOccurrences? program before = some current)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      projectOpenFlowNodeOccurrences? program after =
        some (current.filter fun entry => decide (entry.anchor ≠ .scope prepared.selection.root.id)) := by
  obtain ⟨_, _, _, closedSelection, _⟩ := prepareInternalRegional_facts program before _ prepared found
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
  obtain ⟨hosting, running⟩ := regionalSelection_running program before _ prepared.selection selection
  obtain ⟨priorProgram, priorCalls, priorRaces, priorIncidents, priorMessages⟩ :=
    projectOpenFlowNodeOccurrences_validities program before current hosting running projected
  have priorParts := priorProgram
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at priorParts
  have raw := projected
  simp only [projectOpenFlowNodeOccurrences?, running] at raw
  split at raw
  · contradiction
  · simp only [bind, Option.bind, pure, Pure.pure] at raw
    obtain ⟨waits, waitsEq, raw⟩ := Option.bind_eq_some_iff.mp raw
    obtain ⟨scopeEntries, scopeEq, raw⟩ := Option.bind_eq_some_iff.mp raw
    obtain ⟨callEntries, callEq, raw⟩ := Option.bind_eq_some_iff.mp raw
    have currentEq : current = sortFlowNodeOccurrenceStarts (waits ++ scopeEntries ++ callEntries) := by
      split at raw
      · exact (Option.some.inj raw).symm
      · contradiction
    obtain ⟨after, applied, waitFrame⟩ := preparedChildComplete_wait_projection program before id origin definition output
      prepared admitted priorParts.1.1.2 identities found
    obtain ⟨scopeAfter, scopeApplied, _, scopeAfterEq, callAfterEq⟩ :=
      preparedChildComplete_scope_and_call_projection program before id origin definition output prepared scopeEntries callEntries
        priorParts.1.1.1 scopeEq callEq found
    have sameScopes : scopeAfter = after := Option.some.inj (scopeApplied.symm.trans applied)
    subst scopeAfter
    obtain ⟨validAfter, validApplied, occurrences⟩ := preparedChildComplete_program_validity program before id origin definition output
      prepared priorProgram identities found
    have sameValid : validAfter = after := Option.some.inj (validApplied.symm.trans applied)
    subst validAfter
    obtain ⟨associationAfter, associationApplied, associations, incidents, races⟩ :=
      preparedChildComplete_projection_associations program before id origin definition output prepared identities
        priorCalls priorIncidents priorRaces found
    have sameAssociations : associationAfter = after := Option.some.inj (associationApplied.symm.trans applied)
    subst associationAfter
    obtain ⟨messageAfter, messageApplied, messages⟩ :=
      preparedChildComplete_message_projection_validity program before id origin definition output prepared identities priorMessages found
    have sameMessages : messageAfter = after := Option.some.inj (messageApplied.symm.trans applied)
    subst messageAfter
    obtain ⟨lookupAfter, lookupApplied, _, control, _⟩ :=
      preparedChildComplete_projection_lookup_fields program before id origin definition output prepared found
    have sameLookup : lookupAfter = after := Option.some.inj (lookupApplied.symm.trans applied)
    subst lookupAfter
    have afterRunning := control.trans running
    have waitKeep := projectWaits_filter_scope_anchor program before prepared.selection.root.id waits waitsEq
    have sortedEq : sortFlowNodeOccurrenceStarts (waits ++
        scopeEntries.filter (fun entry => decide (entry.anchor ≠ .scope prepared.selection.root.id)) ++
        callEntries.filter (fun entry => decide (entry.anchor ≠ .scope prepared.selection.root.id))) =
        current.filter (fun entry => decide (entry.anchor ≠ .scope prepared.selection.root.id)) := by
      rw [currentEq, ← sortFlowNodeOccurrenceStarts_filter]
      simp only [List.filter_append, waitKeep]
    have nodup := projectOpenFlowNodeOccurrences_anchor_nodup program before current projected
    have retainedNodup : ((current.filter fun entry => decide (entry.anchor ≠ .scope prepared.selection.root.id)).map (·.anchor)).Nodup :=
      nodup.sublist (List.Sublist.map _ List.filter_sublist)
    have afterWaits := waitFrame.trans waitsEq
    refine ⟨after, applied, ?_⟩
    simp only [projectOpenFlowNodeOccurrences?, afterRunning, admitted, occurrences, races, associations, incidents, messages,
      Bool.not_true, Bool.or_self, Bool.false_eq_true, ↓reduceIte, bind, Option.bind, pure, Pure.pure,
      afterWaits, scopeAfterEq, callAfterEq, sortedEq, retainedNodup]

theorem preparedChildComplete_retained_ends (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (parent : prepared.selection.root.parent.isSome = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    prepared.publicationTemplate.retainedEnds =
      [{ anchor := .scope prepared.selection.root.id, terminal := .completed }] := by
  obtain ⟨_, _, _, closedSelection, _, _, published⟩ := prepareInternalRegional_facts program before _ prepared found
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
  have operation := regionalSelection_operation program before _ prepared.selection selection
  obtain ⟨withdrawal, kind, _⟩ := regionalSelection_complete_census program before id origin definition
    (some output) prepared.selection selection
  obtain ⟨hosting, positions, current, delta, identities, ends, _, _, _, _, lifecycle, template⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  simp only [regionalLifecycleTemplate?, operation, kind] at lifecycle
  cases rootParent : prepared.selection.root.parent with
  | none => simp [rootParent] at parent
  | some owner =>
      simp only [rootParent] at lifecycle
      split at lifecycle
      · cases lifecycle
        rw [template]
      · contradiction

/-- The selected child completion is accepted against its independently projected successor
at every command ID and transition index. No acceptance or successor-validity premise is used. -/
theorem preparedChildComplete_accepted_lifecycle (program : Program) (before : RuntimeState)
    (commandId : SemanticId) (transitionIndex : Nat)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (admitted : programWellFormed program = true)
    (identities : waitIdentitiesUnique before = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceDeltaForOperation? program before after (.completeScope id origin definition (some output))
        commandId transitionIndex = some (prepared.publicationTemplate.lifecycle commandId transitionIndex) := by
  obtain ⟨current, opened, folded⟩ := preparedRegional_lifecycle_fold program before
    (.completeScope id origin definition (some output)) prepared commandId transitionIndex found
  obtain ⟨after, applied, projected⟩ := preparedChildComplete_open_projection program before id origin definition output
    prepared current admitted identities opened found
  obtain ⟨fieldsAfter, withdrawal, fieldsApplied, fired, _, children, _⟩ :=
    preparedChildComplete_wait_fields program before id origin definition output prepared identities found
  have same : fieldsAfter = after := Option.some.inj (fieldsApplied.symm.trans applied)
  subst fieldsAfter
  have snapshots := (prepareInternalRegional_facts program before _ prepared found).1
  have result : completeBoundedScope? program before definition (some output) = some after := by
    simp only [fire?, snapshots] at fired
    change completeBoundedScope? program before definition (some output) = some after at fired
    exact fired
  have parent := completeBoundedScope_child_has_parent program before after definition output prepared.selection.root children result
  have ends := preparedChildComplete_retained_ends program before id origin definition output prepared parent found
  have removal : removeEndedFlowNodeOccurrences current prepared.publicationTemplate.retainedEnds =
      current.filter (fun entry => decide (entry.anchor ≠ .scope prepared.selection.root.id)) := by
    simp only [removeEndedFlowNodeOccurrences, ends, List.map_cons, List.map_nil]
    apply List.filter_congr
    intro entry member
    apply Bool.eq_iff_iff.mpr
    simp
  rw [removal] at folded
  refine ⟨after, applied, ?_⟩
  unfold flowNodeOccurrenceDeltaForOperation?
  rw [preparedRegional_lifecycle_candidate program before after _ prepared commandId transitionIndex found]
  simp only [Option.bind_some, acceptFlowNodeOccurrenceCandidate?, opened, projected,
    Option.bind_eq_bind, folded, ↓reduceIte]

end BpmnSemantics.SemanticProcess.InternalCommutation

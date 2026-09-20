import BpmnSemantics.SemanticProcess.InternalRegionalReturnScopeCallProjection
import BpmnSemantics.SemanticProcess.InternalRegionalChildOpenProjection

/-! Accepted Return publication composes actual cleanup, all independent projection
guards, and exact Scope/Call/wait populations. The ending removes only the selected
Call anchor; canonical order and anchor uniqueness come from predecessor projection. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem preparedReturn_open_projection (program : Program) (before : RuntimeState)
    (expected : SemanticId) (id : OperationId) (origin : BpmnElementOrigin) (process : ProcessId)
    (definition : DefinitionScopeId) (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (current : List OpenSemanticFlowNodeOccurrence)
    (admitted : programWellFormed program = true)
    (valid : runtimeStateWellFormed program expected before = true)
    (projected : projectOpenFlowNodeOccurrences? program before = some current)
    (found : prepareInternalRegional? program before (.returnProcess id origin process definition output) = some prepared) :
    ∃ after record, applyPreparedInternalRegional? program before prepared = some after ∧
      prepared.selection.kind = .returning record ∧ projectOpenFlowNodeOccurrences? program after =
        some (current.filter fun entry => decide (entry.anchor ≠ .callActivity record.id)) := by
  have facts := valid
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at facts
  have position := facts.1
  have identities := facts.2.2.2.2.1
  obtain ⟨_, _, _, closedSelection, _⟩ := prepareInternalRegional_facts program before _ prepared found
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
  obtain ⟨hosting, running⟩ := regionalSelection_running program before _ prepared.selection selection
  obtain ⟨priorProgram, priorCalls, priorRaces, priorIncidents, priorMessages⟩ :=
    projectOpenFlowNodeOccurrences_validities program before current hosting running projected
  obtain ⟨after, record, root, applied, kind, rootEq, rootMember, parentless, quiet, actual, scopes, _, _, _, _, _, _, _, _, census⟩ :=
    preparedReturn_quiescent_fields program before expected id origin process definition output prepared valid found
  obtain ⟨chosen, chosenKind, chosenRoot, chosenCensus⟩ :=
    regionalSelection_return_record program before id origin process definition output prepared.selection selection
  have sameRecord : chosen = record := by simpa using chosenKind.symm.trans kind
  have rootId : root.id = record.calledRoot := rootEq.trans (chosenRoot.trans (congrArg CalledProcessOccurrence.calledRoot sameRecord))
  have selectedMember : record ∈ before.calledProcessOccurrences := by
    have present := congrArg (fun values : List CalledProcessOccurrence => chosen ∈ values) chosenCensus
    simp only [List.mem_singleton] at present
    exact sameRecord ▸ (List.mem_filter.mp (Eq.mpr present trivial)).1
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
    have scopeAfterEq := (quiescent_return_scope_projection program before after expected hosting record root output
      position running priorCalls selectedMember parentless census scopes actual).trans scopeEq
    have callAfterEq := quiescent_return_call_projection program before after hosting record root output callEntries
      running priorCalls selectedMember rootMember rootId parentless quiet actual callEq
    obtain ⟨waitAfter, waitApplied, waitFrame⟩ :=
      preparedReturn_wait_projection program before expected id origin process definition output prepared valid found
    have sameWaits : waitAfter = after := Option.some.inj (waitApplied.symm.trans applied)
    rw [sameWaits] at waitFrame
    obtain ⟨validAfter, validApplied, occurrences⟩ :=
      preparedReturn_program_validity program before expected id origin process definition output prepared valid priorProgram found
    have sameValid : validAfter = after := Option.some.inj (validApplied.symm.trans applied)
    rw [sameValid] at occurrences
    obtain ⟨associationAfter, associationApplied, associations, incidents, races⟩ :=
      preparedReturn_projection_associations program before id origin process definition output prepared identities priorIncidents priorRaces found
    have sameAssociations : associationAfter = after := Option.some.inj (associationApplied.symm.trans applied)
    rw [sameAssociations] at associations incidents races
    obtain ⟨messageAfter, messageApplied, messages⟩ :=
      preparedReturn_message_projection_validity program before expected id origin process definition output prepared valid priorMessages found
    have sameMessages : messageAfter = after := Option.some.inj (messageApplied.symm.trans applied)
    rw [sameMessages] at messages
    have afterRunning : after.control = .running hosting := by simpa only [actual, removeCalledProcessTree] using running
    have waitKeep := projectWaits_filter_non_wait_anchor program before (.callActivity record.id) waits
      (by intro id; simp) waitsEq
    have scopeKeep : scopeEntries.filter (fun entry => decide (entry.anchor ≠ .callActivity record.id)) = scopeEntries := by
      apply List.filter_eq_self.mpr
      intro entry member
      obtain ⟨scope, _, start⟩ := mapM_output_member _ _ scopeEntries scopeEq entry member
      rw [scope_start_anchor program before scope entry start]
      rfl
    have sortedEq : sortFlowNodeOccurrenceStarts (waits ++ scopeEntries ++
        callEntries.filter (fun entry => decide (entry.anchor ≠ .callActivity record.id))) =
        current.filter (fun entry => decide (entry.anchor ≠ .callActivity record.id)) := by
      rw [currentEq, ← sortFlowNodeOccurrenceStarts_filter]
      simp only [List.filter_append, waitKeep, scopeKeep]
    have nodup := projectOpenFlowNodeOccurrences_anchor_nodup program before current projected
    have retainedNodup : ((current.filter fun entry => decide (entry.anchor ≠ .callActivity record.id)).map (·.anchor)).Nodup :=
      nodup.sublist (List.Sublist.map _ List.filter_sublist)
    have afterWaits := waitFrame.trans waitsEq
    refine ⟨after, record, applied, kind, ?_⟩
    simp only [projectOpenFlowNodeOccurrences?, afterRunning, admitted, occurrences, races, associations, incidents, messages,
      Bool.not_true, Bool.or_self, Bool.false_eq_true, ↓reduceIte, bind, Option.bind, pure, Pure.pure,
      afterWaits, scopeAfterEq, callAfterEq, sortedEq, retainedNodup]

theorem preparedReturn_retained_ends (program : Program) (before : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (process : ProcessId)
    (definition : DefinitionScopeId) (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (record : CalledProcessOccurrence) (kind : prepared.selection.kind = .returning record)
    (found : prepareInternalRegional? program before (.returnProcess id origin process definition output) = some prepared) :
    prepared.publicationTemplate.retainedEnds =
      [{ anchor := .callActivity record.id, terminal := .completed }] := by
  obtain ⟨_, _, _, closedSelection, _, _, published⟩ := prepareInternalRegional_facts program before _ prepared found
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
  have operation := regionalSelection_operation program before _ prepared.selection selection
  obtain ⟨hosting, positions, current, delta, identities, ends, _, _, _, _, lifecycle, template⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  simp only [regionalLifecycleTemplate?, operation, kind] at lifecycle
  split at lifecycle
  · cases lifecycle
    rw [template]
  · contradiction

/-- Actual Return publication is accepted at every command ID and transition index,
without assuming successor validity, projection equality, or publication acceptance. -/
theorem preparedReturn_accepted_lifecycle (program : Program) (before : RuntimeState)
    (expected commandId : SemanticId) (transitionIndex : Nat)
    (id : OperationId) (origin : BpmnElementOrigin) (process : ProcessId)
    (definition : DefinitionScopeId) (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (admitted : programWellFormed program = true)
    (valid : runtimeStateWellFormed program expected before = true)
    (found : prepareInternalRegional? program before (.returnProcess id origin process definition output) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceDeltaForOperation? program before after (.returnProcess id origin process definition output)
        commandId transitionIndex = some (prepared.publicationTemplate.lifecycle commandId transitionIndex) := by
  obtain ⟨current, opened, folded⟩ := preparedRegional_lifecycle_fold program before
    (.returnProcess id origin process definition output) prepared commandId transitionIndex found
  obtain ⟨after, record, applied, kind, projected⟩ := preparedReturn_open_projection program before expected id origin process definition output
    prepared current admitted valid opened found
  have ends := preparedReturn_retained_ends program before id origin process definition output prepared record kind found
  have removal : removeEndedFlowNodeOccurrences current prepared.publicationTemplate.retainedEnds =
      current.filter (fun entry => decide (entry.anchor ≠ .callActivity record.id)) := by
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

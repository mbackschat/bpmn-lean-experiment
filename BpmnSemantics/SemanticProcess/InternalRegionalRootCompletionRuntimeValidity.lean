import BpmnSemantics.SemanticProcess.InternalRegionalCompletionCompensationValidity
import BpmnSemantics.SemanticProcess.InternalRegionalCompletionOpenProjection

/-! Root completion retires the sole quiescent scope. The predecessor's preparation
and ownership closure rule out stranded work; successful Compensation history survives
the control change through the terminal lifecycle proof. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem preparedRootComplete_preserves_runtimeStateWellFormed (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (definition : DefinitionScopeId) (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition none) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      runtimeStateWellFormed program hosting after = true := by
  have components := valid
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at components
  obtain ⟨position, races, incidents, owners, waitIds, bounds, declarations, hidden, order,
    activities, timers, messages, activityIds, controllers, sequential, parallel, controllerIds,
    exhaustion, _, bodyClaims, retention, snapshotValid, execution⟩ := components
  obtain ⟨snapshots, declared, _, closedSelection, _, _, published⟩ :=
    prepareInternalRegional_facts program before _ prepared found
  obtain ⟨selection, closed⟩ := ownershipClosedSelection_facts program before _ prepared.selection closedSelection
  obtain ⟨actual, running⟩ := regionalSelection_running program before _ prepared.selection selection
  have same := runtimePositionValid_running_instance program hosting actual before position running
  subst actual
  obtain ⟨_, _, current, _, _, _, _, _, opened, _⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have programValid := (projectOpenFlowNodeOccurrences_validities program before current hosting running opened).1
  have structural : flowNodeOccurrenceStructuralProgramValidity program before = true := by
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at programValid
    exact programValid.1.1.1
  have operation : .completeScope id origin definition none ∈ program.operations :=
    (List.mem_filter.mp (by rw [declared]; simp)).1
  obtain ⟨checked, fired, afterPosition, afterActivities, afterRaces⟩ :=
    ownershipClosedSelection_preserves_position_and_references program before hosting _ prepared.selection
      snapshots position structural operation waitIds activities races closedSelection
  obtain ⟨after, firedAgain, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have equal : checked = after := Option.some.inj (fired.symm.trans firedAgain)
  subst checked
  have result : completeBoundedScope? program before definition none = some after := by
    have raw := firedAgain
    simp only [fire?, snapshots] at raw
    change completeSelectedScope? program before definition none = some after at raw
    unfold completeSelectedScope? at raw
    split at raw
    · unfold completeMonitoredScope? at raw
      obtain ⟨pair, _, raw⟩ := Option.bind_eq_some_iff.mp raw
      simp at raw
    · exact raw
  obtain ⟨withdrawal, kind, census⟩ := regionalSelection_complete_census program before id origin definition none
    prepared.selection selection
  obtain ⟨ordinary, completed, _⟩ := completeBoundedScope_position_fields program before after definition none result
  obtain ⟨quiet, update⟩ := completeScopeState_selected_update before ordinary definition none prepared.selection.root census completed
  have selected : prepared.selection.root ∈ before.scopeOccurrences.filter
      (fun scope => decide (scope.id.definitionScopeId = definition)) := by rw [census]; simp
  obtain ⟨rootMember, definitionEq⟩ := List.mem_filter.mp selected
  cases parent : prepared.selection.root.parent with
  | some parent => simp [parent, running] at update
  | none =>
      have hostingRoot := declaredComplete_hosting_instance program before hosting hosting id origin definition
        prepared.selection.root position structural running operation rootMember (of_decide_eq_true definitionEq) parent
      obtain ⟨onlyRoot, noTokens, noCalls⟩ := quiescent_hosting_root_position_fields program before hosting hosting
        position running prepared.selection.root rootMember parent hostingRoot quiet
      obtain ⟨noTasks, noMessages, noTimers, noEffects, noIncidents, noSelected, noRaces, _⟩ :=
        quiescent_singleton_root_wait_fields before prepared.selection.root onlyRoot owners quiet
      have sameOrdinary : ordinary = after := by
        unfold completeBoundedScope? at result
        rw [completed] at result
        cases bounded : boundedScopeDefinitionForChild? program definition with
        | none => simpa only [bounded, Option.some.injEq] using result
        | some entry =>
            simp [bounded, boundedScopeChildOccurrence?, ← List.head?_filter, census, parent] at result
      rw [sameOrdinary] at update
      have fields := regionalSelection_reference_fields program before after _ prepared.selection snapshots waitIds selection firedAgain
      have noScopeRetained : ∀ scope ∈ before.scopeOccurrences,
          (regionalSelectionReferenceRetention before prepared.selection).scope scope = false := by
        intro scope _
        cases withdrawal <;> simp [regionalSelectionReferenceRetention, kind,
          ordinaryCompletionReferenceRetention, boundedCompletionReferenceRetention,
          monitoredCompletionReferenceRetention, parent]
      have noActivities := retained_activities_empty_of_no_body before
        (regionalSelectionReferenceRetention before prepared.selection) (by
          intro record member
          have live := List.all_eq_true.mp activities record member
          simp only [Bool.and_eq_true] at live
          exact live.1.1.1) noTasks noScopeRetained closed
      have afterActivitiesEmpty : after.activityOccurrences = [] := fields.2.1.trans noActivities
      simp only [parent, running] at update
      split at update
      · contradiction
      · have actualFields := Option.some.inj update.symm
        have terminal : after.control = .completed hosting := by rw [actualFields]
        obtain ⟨succeeded, noHandlerWaits⟩ := quiescent_singleton_compensation_succeeded program before hosting
          prepared.selection.root running onlyRoot quiet execution
        have nextRetention := completion_root_compensation_retention program before after hosting
          prepared.selection.root running terminal onlyRoot (by rw [actualFields]) retention
        have nextExecution := compensation_execution_completed_retained_frame program before after hosting terminal
          (by rw [actualFields]) noHandlerWaits (by simpa only [actualFields] using noHandlerWaits) succeeded execution
        refine ⟨after, applied, ?_⟩
        rw [actualFields] at afterPosition afterActivities afterRaces afterActivitiesEmpty nextRetention nextExecution ⊢
        change before.activityOccurrences = [] at afterActivitiesEmpty
        have nextOwners : waitOwnersLive { before with control := .completed hosting, scopeOccurrences := [] } = true := by
          simp only [waitOwnersLive, noTasks, noMessages, noTimers, noEffects, noIncidents,
            noSelected, noRaces, noCalls, afterActivitiesEmpty, List.all_nil, Bool.and_self]
        have nextOrder : canonicalCollectionOrder { before with control := .completed hosting, scopeOccurrences := [] } = true := by
          simpa only [canonicalCollectionOrder, onlyRoot, orderedBy] using order
        simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc]
        exact ⟨afterPosition, afterRaces,
          by simp [effectIncidentAssociationsValid, noIncidents],
          nextOwners, waitIds, bounds, declarations, hidden,
          nextOrder, afterActivities, timers, messages, activityIds, controllers, sequential, parallel,
          controllerIds, exhaustion, trivial, bodyClaims, nextRetention,
          by simpa only [compensationEventSubProcessSnapshotStateValid, snapshots] using snapshotValid,
          nextExecution⟩

end BpmnSemantics.SemanticProcess.InternalCommutation

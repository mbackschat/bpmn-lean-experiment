import BpmnSemantics.SemanticProcess.InternalRegionalQuiescence
import BpmnSemantics.SemanticProcess.InternalRegionalInstantaneousFold

/-! Root completion's terminal projection follows from predecessor quiescence, live ownership,
and the selected local-data closure. Historical and issuance fields need not be empty. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- Effect-tagged scopes remain governed by the existing reverse Effect census. -/
theorem regionalLocalData_empty_of_no_owners (program : Program) (state : RuntimeState)
    (keepActivity : ActivityOccurrence → Bool)
    (effects : flowNodeOccurrenceEffectProgramValidity program state = true)
    (noWaits : state.effectWaits = []) (noIncidents : state.effectIncidents = [])
    (closed : regionalRetainedLocalDataClosed state keepActivity (fun _ => true) = true)
    (noActivities : state.activityOccurrences.filter keepActivity = []) :
    state.variables.activities = [] := by
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro scope member
  cases tagged : scope.owner with
  | effectOccurrence id =>
      have localExact := (Bool.and_eq_true_iff.mp effects).2
      have localOwners := (Bool.and_eq_true_iff.mp localExact).2
      have scopeValid := List.all_eq_true.mp localOwners scope member
      change (match scope.owner with
        | .effectOccurrence _ =>
            ((state.effectWaits ++ state.effectIncidents.map (·.wait)).filter
              (fun wait => activityScopeMatches (effectWaitOccurrenceId wait) scope)).length = 1
        | .activityOccurrence _ => true) = true at scopeValid
      simp [tagged, noWaits, noIncidents] at scopeValid
  | activityOccurrence id =>
      obtain ⟨record, census, survives⟩ := regionalRetainedLocalDataClosed_owner state
        keepActivity (fun _ => true) closed scope member rfl id tagged
      have present : record ∈ state.activityOccurrences :=
        (List.mem_filter.mp (by rw [census]; simp)).1
      have retained : record ∈ state.activityOccurrences.filter keepActivity :=
        List.mem_filter.mpr ⟨present, survives⟩
      simp [noActivities] at retained

/-- Bounded withdrawal can only change its Timer and Activity collections after ordinary completion. -/
theorem regionalCompletion_effect_and_branch_fields (program : Program) (before after : RuntimeState)
    (definition : DefinitionScopeId) (output : Option ControlPlaceId)
    (result : completeBoundedScope? program before definition output = some after) :
    after.effectWaits = before.effectWaits ∧ after.effectIncidents = before.effectIncidents ∧
      after.selectedBranchSets = before.selectedBranchSets := by
  have ordinaryFields (completed : RuntimeState)
      (ordinary : completeScopeState? before definition output = some completed) :
      completed.effectWaits = before.effectWaits ∧ completed.effectIncidents = before.effectIncidents ∧
        completed.selectedBranchSets = before.selectedBranchSets := by
    unfold completeScopeState? at ordinary
    split at ordinary
    · split at ordinary
      · simp at ordinary
      · unfold completeQuiescentScope? at ordinary
        repeat' split at ordinary
        all_goals first
          | (simp at ordinary; done)
          | (simp only [Option.some.injEq] at ordinary; subst completed; exact ⟨rfl, rfl, rfl⟩)
    · simp at ordinary
  unfold completeBoundedScope? at result
  cases ordinary : completeScopeState? before definition output with
  | none => simp [ordinary] at result
  | some completed =>
      simp only [ordinary] at result
      repeat' split at result
      all_goals first
        | (simp at result; done)
        | (simp only [Option.some.injEq] at result; subst after; exact ordinaryFields completed ordinary)

/-- Normal hosting-root completion has an empty open set on both sides. Predecessor runtime
validity supplies body liveness; preparation additionally supplies local-owner survival. -/
theorem preparedRootComplete_open_projection (program : Program) (before : RuntimeState)
    (expected : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (definition : DefinitionScopeId) (prepared : PreparedInternalRegional)
    (wellFormed : runtimeStateWellFormed program expected before = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition none) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      projectOpenFlowNodeOccurrences? program before = some [] ∧
      projectOpenFlowNodeOccurrences? program after = some [] := by
  obtain ⟨snapshots, declaration, _, closedSelection, _, _, published⟩ :=
    prepareInternalRegional_facts program before _ prepared found
  have selection := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).1
  have closed := (ownershipClosedSelection_facts program before _ prepared.selection closedSelection).2
  obtain ⟨withdrawal, kind, census⟩ :=
    regionalSelection_complete_census program before id origin definition none prepared.selection selection
  obtain ⟨hosting, positions, current, delta, identities, ends, running, projected, opened, _, _, _⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have runningState : before.control = .running hosting := by
    unfold runningInstance? at running
    split at running
    · cases running; assumption
    · contradiction
  have valid : runtimePositionValid program hosting before = true := by
    unfold projectControlPosition? at projected
    split at projected
    · assumption
    · contradiction
  have programValid := (projectOpenFlowNodeOccurrences_validities program before current hosting runningState opened).1
  have structural : flowNodeOccurrenceStructuralProgramValidity program before = true := by
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at programValid
    exact programValid.1.1.1
  have effectValid : flowNodeOccurrenceEffectProgramValidity program before = true := by
    simp only [flowNodeOccurrenceProgramValidity, flowNodeOccurrenceWaitProgramValidity,
      Bool.and_eq_true] at programValid
    exact programValid.1.1.2.2
  have declared : .completeScope id origin definition none ∈ program.operations := by
    have present : .completeScope id origin definition none ∈ program.operations.filter
        (fun candidate => decide (candidate.id = (SemanticOperation.completeScope id origin definition none).id)) := by
      rw [declaration]; simp
    exact (List.mem_filter.mp present).1
  obtain ⟨after, fired, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have result : completeBoundedScope? program before definition none = some after := by
    simp only [fire?, snapshots] at fired
    change completeBoundedScope? program before definition none = some after at fired
    exact fired
  obtain ⟨ordinary, completed, control, afterScopes, afterCalls, afterTokens⟩ :=
    completeBoundedScope_position_fields program before after definition none result
  obtain ⟨quiet, update⟩ := completeScopeState_selected_update before ordinary definition none prepared.selection.root census completed
  have rootMember : prepared.selection.root ∈ before.scopeOccurrences.filter
      (fun scope => decide (scope.id.definitionScopeId = definition)) := by rw [census]; simp
  obtain ⟨rootMember, definitionEq⟩ := List.mem_filter.mp rootMember
  cases parentEq : prepared.selection.root.parent with
  | some parent => simp [parentEq, runningState] at update
  | none =>
      have hostingRoot := declaredComplete_hosting_instance program before hosting hosting id origin definition
        prepared.selection.root valid structural runningState declared rootMember
        (of_decide_eq_true definitionEq) parentEq
      obtain ⟨onlyRoot, noTokens, noCalls⟩ := quiescent_hosting_root_position_fields program before hosting hosting
        valid runningState prepared.selection.root rootMember parentEq hostingRoot quiet
      simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at wellFormed
      obtain ⟨_, _, _, owners, uniqueWaits, _, _, _, _, activities, _⟩ := wellFormed
      obtain ⟨noTasks, noMessages, noTimers, noEffects, noIncidents, noSelected, noRaces, _⟩ :=
        quiescent_singleton_root_wait_fields before prepared.selection.root onlyRoot owners quiet
      have noScopeRetained : ∀ scope ∈ before.scopeOccurrences,
          (regionalSelectionReferenceRetention before prepared.selection).scope scope = false := by
        intro scope member
        cases withdrawal <;> simp [regionalSelectionReferenceRetention, kind,
          ordinaryCompletionReferenceRetention, boundedCompletionReferenceRetention, parentEq]
      have noActivities := retained_activities_empty_of_no_body before
        (regionalSelectionReferenceRetention before prepared.selection) (by
          intro record member
          have live := List.all_eq_true.mp activities record member
          simp only [Bool.and_eq_true] at live
          exact live.1.1.1) noTasks noScopeRetained closed
      have localClosed := ownershipClosedSelection_local_data program before _ prepared.selection closedSelection
      have noLocals := regionalLocalData_empty_of_no_owners program before
        (regionalSelectionReferenceRetention before prepared.selection).activity effectValid noEffects noIncidents
        (by simpa only [regionalSelectionLocalDataRetention, kind] using localClosed) noActivities
      have beforeEmpty : projectOpenFlowNodeOccurrences? program before = some [] := by
        have shape := opened
        simp only [projectOpenFlowNodeOccurrences?, runningState] at shape
        split at shape
        · contradiction
        · have currentEmpty : current = [] := by
            simpa [projectWaits?, noTasks, noMessages, noTimers, noEffects, noIncidents,
              onlyRoot, parentEq, noCalls, sortFlowNodeOccurrenceStarts,
              BpmnSemantics.SemanticProcess.sortBy] using shape.symm
          simpa [currentEmpty] using opened
      obtain ⟨fields, localFields⟩ := regionalSelection_retention_fields program before after _ prepared.selection
        snapshots uniqueWaits selection fired
      obtain ⟨effectFields, incidentFields, selectedFields⟩ :=
        regionalCompletion_effect_and_branch_fields program before after definition none result
      simp only [parentEq, runningState] at update
      split at update
      · contradiction
      · cases update
        have terminal : after.control = .completed hosting := control
        refine ⟨after, applied, beforeEmpty, ?_⟩
        simp only [projectOpenFlowNodeOccurrences?, terminal]
        change (if after.scopeOccurrences.isEmpty && after.tokens.isEmpty && after.waits.isEmpty &&
          after.messageWaits.isEmpty && after.timerWaits.isEmpty && after.effectWaits.isEmpty &&
          after.effectIncidents.isEmpty && after.selectedBranchSets.isEmpty && after.eventRaces.isEmpty &&
          after.calledProcessOccurrences.isEmpty && after.variables.activities.isEmpty then some [] else none) = some []
        simp [afterScopes, afterTokens, afterCalls, noTokens, noCalls,
          fields.2.2.1, fields.2.2.2.1, fields.2.2.2.2.1, fields.2.2.2.2.2,
          noTasks, noMessages, noTimers, noRaces, effectFields, incidentFields, selectedFields,
          noEffects, noIncidents, noSelected, localFields, noLocals]

/-- Actual publication accepts the retained root-completion template at any command/index. -/
theorem preparedRootComplete_accepted_lifecycle (program : Program) (before : RuntimeState)
    (expected commandId : SemanticId) (transitionIndex : Nat)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId)
    (prepared : PreparedInternalRegional)
    (wellFormed : runtimeStateWellFormed program expected before = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition none) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      flowNodeOccurrenceDeltaForOperation? program before after (.completeScope id origin definition none)
        commandId transitionIndex = some (prepared.publicationTemplate.lifecycle commandId transitionIndex) := by
  obtain ⟨after, applied, beforeEmpty, afterEmpty⟩ :=
    preparedRootComplete_open_projection program before expected id origin definition prepared wellFormed found
  obtain ⟨current, opened, folded⟩ := preparedRegional_lifecycle_fold program before
    (.completeScope id origin definition none) prepared commandId transitionIndex found
  have currentEmpty : current = [] := Option.some.inj (opened.symm.trans beforeEmpty)
  subst current
  simp only [removeEndedFlowNodeOccurrences, List.filter_nil] at folded
  refine ⟨after, applied, ?_⟩
  unfold flowNodeOccurrenceDeltaForOperation?
  rw [preparedRegional_lifecycle_candidate program before after _ prepared commandId transitionIndex found]
  simp only [Option.bind_some, acceptFlowNodeOccurrenceCandidate?, beforeEmpty, afterEmpty,
    Option.bind_eq_bind, folded, ↓reduceIte]

end BpmnSemantics.SemanticProcess.InternalCommutation

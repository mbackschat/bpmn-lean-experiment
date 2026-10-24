import BpmnSemantics.SemanticProcess.InternalRegionalPreparationLaws
import BpmnSemantics.SemanticProcess.InternalRegionalCompletionMultiInstanceValidity
import BpmnSemantics.SemanticProcess.InternalRegionalCompletionCompensationValidity
import BpmnSemantics.SemanticProcess.InternalRegionalChildProjectionValidity
import BpmnSemantics.SemanticProcess.InternalRegionalControllerValidity

/-! Child completion changes scope/token positions, disposes its scope-local frame, expires owned passive listeners and may
withdraw one bounded Activity and its deadline. Owner closure protects the
retained Activity owners that quiescence alone does not constrain. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem child_completion_runtime_frame (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (root : RuntimeScopeOccurrence) (running : before.control = .running hosting)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (result : completeSelectedScope? program before definition (some output) = some after) :
    after = { before with
      scopeOccurrences := after.scopeOccurrences, tokens := after.tokens
      timerWaits := after.timerWaits, activityOccurrences := after.activityOccurrences
      variables := { before.variables with scopes := after.variables.scopes }
      eventSubProcessMessageSubscriptions := after.eventSubProcessMessageSubscriptions } := by
  obtain ⟨ordinary, completed, timers, activities, rfl⟩ :=
    completeSelectedScope_ordinary_withdrawal program before after definition (some output) result
  have update := (completeScopeState_selected_update before ordinary definition (some output) root census completed).2
  cases parent : root.parent with
  | none => simp [parent, running] at update
  | some owner =>
      simp only [parent, running] at update
      split at update
      · cases update
        simp only [running]
      · contradiction

private theorem quiescent_owners_after_child {α : Type} (before after : RuntimeState)
    (removed : ScopeOccurrenceId) (values retained : List α) (owner : α → ScopeOccurrenceId)
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun scope => decide (scope.id ≠ removed)))
    (subset : retained ⊆ values)
    (live : values.all (fun value => exactLiveOccurrence before (owner value)) = true)
    (quiet : (!(values.any fun value => owner value == removed)) = true) :
    retained.all (fun value => exactLiveOccurrence after (owner value)) = true := by
  apply List.all_eq_true.mpr
  intro value member
  have prior := subset member
  have different : owner value ≠ removed := by
    intro same
    have present : (values.any fun candidate => owner candidate == removed) = true :=
      List.any_eq_true.mpr ⟨value, prior, by simp [same]⟩
    simp [present] at quiet
  have census := regional_other_owner_census before after removed (owner value) scopes different
  change exactLiveOccurrence after (owner value) = exactLiveOccurrence before (owner value) at census
  rw [census]
  exact List.all_eq_true.mp live value prior

private theorem child_completion_wait_owners (before after : RuntimeState)
    (selected : InternalRegionalSelection)
    (frame : after = { before with
      scopeOccurrences := after.scopeOccurrences, tokens := after.tokens
      timerWaits := after.timerWaits, activityOccurrences := after.activityOccurrences
      variables := { before.variables with scopes := after.variables.scopes }
      eventSubProcessMessageSubscriptions := after.eventSubProcessMessageSubscriptions })
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter
      (fun scope => decide (scope.id ≠ selected.root.id)))
    (fields : regionalReferenceFieldsMatch before after (regionalSelectionReferenceRetention before selected))
    (quiet : scopeQuiescent before selected.root.id = true)
    (closed : regionalActivityOwnersClosed before (regionalSelectionReferenceRetention before selected) = true)
    (owners : waitOwnersLive before = true) : waitOwnersLive after = true := by
  have prior := owners
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at prior
  obtain ⟨tasks, messages, timers, effects, incidents, branches, races, calls, activities⟩ := prior
  have quiescence := quiet
  simp only [scopeQuiescent, Bool.and_eq_true, and_assoc] at quiescence
  obtain ⟨_, taskQuiet, messageQuiet, timerQuiet, effectQuiet, incidentQuiet, branchQuiet, raceQuiet, callQuiet, _, _⟩ := quiescence
  have sameTasks : after.waits = before.waits := by simpa only using congrArg RuntimeState.waits frame
  have sameMessages : after.messageWaits = before.messageWaits := by simpa only using congrArg RuntimeState.messageWaits frame
  have sameEffects : after.effectWaits = before.effectWaits := by simpa only using congrArg RuntimeState.effectWaits frame
  have sameIncidents : after.effectIncidents = before.effectIncidents := by simpa only using congrArg RuntimeState.effectIncidents frame
  have sameBranches : after.selectedBranchSets = before.selectedBranchSets := by simpa only using congrArg RuntimeState.selectedBranchSets frame
  have sameRaces : after.eventRaces = before.eventRaces := by simpa only using congrArg RuntimeState.eventRaces frame
  have sameCalls : after.calledProcessOccurrences = before.calledProcessOccurrences := by simpa only using congrArg RuntimeState.calledProcessOccurrences frame
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc]
  exact ⟨quiescent_owners_after_child before after _ before.waits after.waits (·.owner) scopes (by rw [sameTasks]; exact List.Subset.refl _) tasks taskQuiet,
    quiescent_owners_after_child before after _ before.messageWaits after.messageWaits (·.owner) scopes (by rw [sameMessages]; exact List.Subset.refl _) messages messageQuiet,
    quiescent_owners_after_child before after _ before.timerWaits after.timerWaits (·.owner) scopes
      (fun _ member => (List.mem_filter.mp (fields.2.2.2.2.1 ▸ member)).1) timers timerQuiet,
    quiescent_owners_after_child before after _ before.effectWaits after.effectWaits (·.owner) scopes (by rw [sameEffects]; exact List.Subset.refl _) effects effectQuiet,
    quiescent_owners_after_child before after _ before.effectIncidents after.effectIncidents (·.wait.owner) scopes (by rw [sameIncidents]; exact List.Subset.refl _) incidents incidentQuiet,
    quiescent_owners_after_child before after _ before.selectedBranchSets after.selectedBranchSets (·.owner) scopes (by rw [sameBranches]; exact List.Subset.refl _) branches branchQuiet,
    quiescent_owners_after_child before after _ before.eventRaces after.eventRaces (·.owner) scopes (by rw [sameRaces]; exact List.Subset.refl _) races raceQuiet,
    quiescent_owners_after_child before after _ before.calledProcessOccurrences after.calledProcessOccurrences (·.caller) scopes (by rw [sameCalls]; exact List.Subset.refl _) calls callQuiet,
    regionalActivityOwnersClosed_preserves_owners before after _ closed fields.1 fields.2.1 activities⟩

private theorem child_completion_token_order (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (root : RuntimeScopeOccurrence) (running : before.control = .running hosting)
    (census : before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) = [root])
    (result : completeSelectedScope? program before definition (some output) = some after)
    (ordered : orderedBy controlTokenBefore before.tokens = true) :
    orderedBy controlTokenBefore after.tokens = true := by
  obtain ⟨ordinary, completed, _, _, _, tokens⟩ :=
    completeSelectedScope_position_fields program before after definition (some output) result
  have update := (completeScopeState_selected_update before ordinary definition (some output) root census completed).2
  cases parent : root.parent with
  | none => simp [parent, running] at update
  | some owner =>
      simp only [parent, running] at update
      split at update
      · cases update
        rw [tokens]
        exact orderedBy_addToken _ output owner ordered
      · contradiction

private theorem child_completion_repeated_definitions (program : Program)
    (id : OperationId) (origin : BpmnElementOrigin) (definition : DefinitionScopeId) (output : ControlPlaceId)
    (valid : programWellFormed program = true)
    (completion : .completeScope id origin definition (some output) ∈ program.operations) :
    ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?, entry.childScopeId ≠ definition := by
  obtain ⟨root, scope, _, lifecycle, found, child⟩ := programGraphWellFormed_completion_binding program
    id origin definition (some output) (programWellFormed_graph program valid) completion
  have scopeId : scope.id = definition := by simpa using List.find?_some found
  have scopeMember := List.mem_of_find?_eq_some found
  have parent : scope.parentScopeId.isSome = true := by cases eq : scope.parentScopeId <;> simp_all
  intro entry declared same
  obtain ⟨operation, member, projected⟩ := List.mem_filterMap.mp declared
  cases operation <;> simp only [sequentialScopeEntry?, Option.some.injEq] at projected <;> try contradiction
  rename_i eid eorigin input body childScope normalOutput collection item mappings condition
  subst entry
  apply scopeLifecycle_completion_excludes_repeated_entry program root scope id origin (some output)
    _ lifecycle scopeMember parent (by simpa only [scopeId] using completion) member
  exact ⟨eid, eorigin, input, body, normalOutput, collection, item, mappings, condition,
    by change childScope = definition at same; rw [same, scopeId]⟩

private theorem child_completion_repeated_validity (program : Program) (before after : RuntimeState)
    (selected : InternalRegionalSelection) (withdrawal : InternalCompletionWithdrawal)
    (kind : selected.kind = .completing withdrawal)
    (fields : regionalReferenceFieldsMatch before after (regionalSelectionReferenceRetention before selected))
    (scopes : after.scopeOccurrences = before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ selected.root.id)))
    (locals : after.variables.scopes = before.variables.scopes.filter (fun scope => decide (scope.owner ≠ selected.root.id)))
    (control : after.control = before.control)
    (controllers : after.sequentialScopeControllers = before.sequentialScopeControllers)
    (process : after.variables.process = before.variables.process)
    (ownerClosed : regionalActivityOwnersClosed before (regionalSelectionReferenceRetention before selected) = true)
    (distinct : ∀ entry ∈ program.operations.filterMap sequentialScopeEntry?, entry.childScopeId ≠ selected.root.id.definitionScopeId)
    (valid : sequentialScopeStateValid program before = true) : sequentialScopeStateValid program after = true := by
  let keep := (regionalSelectionReferenceRetention before selected).activity
  have bodyKept (entry : SequentialScopeEntry) (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?)
      (binding : SequentialScopeBinding) (bound : sequentialScopeBindingForEntry? entry before = some binding) :
      binding.body.id ≠ selected.root.id := by
    have definition := (repeated_binding_members entry before binding bound).2.2.2.2.2.2.2.2.2.2.2
    intro same
    exact distinct entry declared (definition.symm.trans (congrArg ScopeOccurrenceId.definitionScopeId same))
  have activityKept (entry : SequentialScopeEntry) (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?)
      (binding : SequentialScopeBinding) (bound : sequentialScopeBindingForEntry? entry before = some binding) :
      keep binding.activity = true := by
    have different := bodyKept entry declared binding bound
    have body := (sequentialScope_binding_activity entry before binding bound).2
    cases withdrawal <;> simp [keep, regionalSelectionReferenceRetention, kind, ordinaryCompletionReferenceRetention,
      boundedCompletionReferenceRetention, monitoredCompletionReferenceRetention, body, different]
  have nextBinding (entry : SequentialScopeEntry) (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?)
      (binding : SequentialScopeBinding) (bound : sequentialScopeBindingForEntry? entry before = some binding) :
      sequentialScopeBindingForEntry? entry after = some binding := by
    obtain ⟨activityMember, bodyMember, controllerMember, localMember, _, _, _, _, _, localOwner, ownerLive, _⟩ :=
      repeated_binding_members entry before binding bound
    have kept := activityKept entry declared binding bound
    have different := bodyKept entry declared binding bound
    have ownerRetained := List.all_eq_true.mp ownerClosed binding.activity activityMember
    simp only [show (regionalSelectionReferenceRetention before selected).activity binding.activity = true from kept,
      Bool.not_true, Bool.false_or] at ownerRetained
    have nextOwner : after.scopeOccurrences.any (fun occurrence => occurrence.id == binding.activity.owner) = true := by
      obtain ⟨owner, member, named⟩ := List.any_eq_true.mp ownerLive
      have retained := List.all_eq_true.mp ownerRetained owner member
      have ownerEq : owner.id = binding.activity.owner := by simpa using named
      simp only [ownerEq, decide_true, Bool.not_true, Bool.false_or] at retained
      rw [fields.1]
      exact List.any_eq_true.mpr ⟨owner, List.mem_filter.mpr ⟨member, retained⟩, named⟩
    apply sequentialScopeBindingForEntry_retained entry before after binding bound control
      (fields.2.1 ▸ List.filter_sublist) _ (scopes ▸ List.filter_sublist) _
      (by rw [controllers]; exact List.Sublist.refl _) _ (locals ▸ List.filter_sublist) _ nextOwner
    · rw [fields.2.1]; exact List.mem_filter.mpr ⟨activityMember, kept⟩
    · rw [scopes]; exact List.mem_filter.mpr ⟨bodyMember, by simp [different]⟩
    · rw [controllers]; exact controllerMember
    · rw [locals]; exact List.mem_filter.mpr ⟨localMember, by simp [localOwner, different]⟩
  apply sequentialScopeStateValid_binding_frame program before after valid controllers _ _ nextBinding
    (fun entry _ => by simp only [sequentialScopeCollection?, process])
  · intro entry declared
    rw [fields.2.1]
    apply allMatchingRetained_preserves_census
    apply List.all_eq_true.mpr
    intro activity member
    cases named : activity.activityElementId == entry.elementId with
    | false => simp [named]
    | true =>
        change (!(activity.activityElementId == entry.elementId) || keep activity) = true
        simp only [named, Bool.not_true, Bool.false_or]
        have prior := List.all_eq_true.mp (Bool.and_eq_true_iff.mp valid).2 entry declared
        dsimp only at prior
        have present : activity ∈ before.activityOccurrences.filter (fun activity => activity.activityElementId == entry.elementId) :=
          List.mem_filter.mpr ⟨member, named⟩
        split at prior
        · rename_i empty _; rw [empty] at present; contradiction
        · rename_i record body census _
          cases bound : sequentialScopeBindingForEntry? entry before with
          | none => simp only [bound] at prior; contradiction
          | some binding =>
              have bindingCensus := (sequentialScope_binding_activity entry before binding bound).1
              have same : activity = binding.activity := by simpa only [bindingCensus, List.mem_singleton] using present
              simpa only [same] using activityKept entry declared binding bound
        · contradiction
  · intro entry declared
    rw [scopes]
    apply allMatchingRetained_preserves_census
    apply List.all_eq_true.mpr
    intro body member
    cases named : body.id.definitionScopeId == entry.childScopeId with
    | false => simp [named]
    | true =>
        have different : body.id ≠ selected.root.id := by
          intro same
          exact distinct entry declared ((beq_iff_eq.mp named).symm.trans (congrArg ScopeOccurrenceId.definitionScopeId same))
        simp [named, different]

theorem preparedChildComplete_preserves_runtimeStateWellFormed (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (id : OperationId) (origin : BpmnElementOrigin)
    (definition : DefinitionScopeId) (output : ControlPlaceId) (prepared : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (found : prepareInternalRegional? program before (.completeScope id origin definition (some output)) = some prepared) :
    ∃ after, applyPreparedInternalRegional? program before prepared = some after ∧
      runtimeStateWellFormed program hosting after = true := by
  have domain := prepareInternalRegional_rootCompensationDomain program before _ prepared found
  have components := valid
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at components
  obtain ⟨position, races, incidents, owners, waitIds, bounds, declarations, hidden, order,
    activities, timers, messages, activityIds, controllers, sequential, parallel, controllerIds,
    exhaustion, _, bodyClaims, retention, snapshotValid, execution, repeated⟩ := components
  obtain ⟨snapshots, declared, _, closedSelection, _, _, published⟩ :=
    prepareInternalRegional_facts program before _ prepared found
  obtain ⟨selection, closed⟩ := ownershipClosedSelection_facts program before _ prepared.selection closedSelection
  have ownerClosed := ownershipClosedSelection_activity_owners program before _ prepared.selection closedSelection
  obtain ⟨actual, running⟩ := regionalSelection_running program before _ prepared.selection selection
  have same := runtimePositionValid_running_instance program hosting actual before position running
  subst actual
  obtain ⟨_, _, current, _, _, _, _, _, opened, _⟩ :=
    regionalPublicationTemplate_facts program before prepared.selection prepared.region prepared.publicationTemplate published
  have programValid := (projectOpenFlowNodeOccurrences_validities program before current hosting running opened).1
  have structural : flowNodeOccurrenceStructuralProgramValidity program before = true := by
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at programValid
    exact programValid.1.1.1
  obtain ⟨checked, fired, nextPosition, nextActivities, nextRaces⟩ :=
    ownershipClosedSelection_preserves_position_and_references program before hosting _ prepared.selection
      snapshots position structural (List.mem_filter.mp (by rw [declared]; simp)).1
      waitIds activities races (by intro interrupts; simp [operationInterrupts] at interrupts) closedSelection
  obtain ⟨after, firedAgain, applied⟩ := prepareInternalRegional_executes program before _ prepared found
  have equal : checked = after := Option.some.inj (fired.symm.trans firedAgain)
  subst checked
  have result : completeSelectedScope? program before definition (some output) = some after := by
    exact selectInternalRegional?_completeScope_fired program before before after id origin definition (some output) _
      selection snapshots firedAgain
  obtain ⟨withdrawal, kind, census⟩ := regionalSelection_complete_census program before id origin definition (some output)
    prepared.selection selection
  have frame := child_completion_runtime_frame program before after hosting definition output prepared.selection.root running census result
  obtain ⟨lookupAfter, lookupApplied, quiet, control, _, scopes⟩ :=
    preparedChildComplete_projection_lookup_fields program before id origin definition output prepared found
  have sameLookup : lookupAfter = after := Option.some.inj (lookupApplied.symm.trans applied)
  subst lookupAfter
  have child : prepared.selection.root.parent ≠ none := by
    have parent := completeSelectedScope_child_has_parent program before after definition output prepared.selection.root census result
    intro absent
    simp [absent] at parent
  have member : prepared.selection.root ∈ before.scopeOccurrences :=
    (List.mem_filter.mp (show prepared.selection.root ∈ before.scopeOccurrences.filter
      (fun scope => decide (scope.id.definitionScopeId = definition)) by rw [census]; simp)).1
  have fields := regionalSelection_reference_fields program before after _ prepared.selection snapshots waitIds selection firedAgain
  have taskFrame : after.waits = before.waits := by simpa only using congrArg RuntimeState.waits frame
  have controllerFrame : after.sequentialMultiInstanceControllers = before.sequentialMultiInstanceControllers := by
    simpa only using congrArg RuntimeState.sequentialMultiInstanceControllers frame
  have timerSublist : after.timerWaits.Sublist before.timerWaits := fields.2.2.2.2.1 ▸ List.filter_sublist
  have activitySublist : after.activityOccurrences.Sublist before.activityOccurrences := fields.2.1 ▸ List.filter_sublist
  obtain ⟨nextWaitIds, nextActivityIds, nextControllerIds⟩ := runtime_identity_uniqueness_of_sublists before after
    (by rw [taskFrame]; exact List.Sublist.refl _) (by rw [frame]; exact List.Sublist.refl _)
    timerSublist (by rw [frame]; exact List.Sublist.refl _) activitySublist
    (by rw [controllerFrame]; exact List.Sublist.refl _) waitIds activityIds controllerIds
  have nextSequential := completion_preserves_sequential_bindings program before after prepared.selection withdrawal kind
    fields taskFrame controllerFrame closed activities sequential controllerIds bodyClaims timers
  have processBindings := congrArg (fun variables : ScopedVariables => variables.process.bindings)
    (regionalLocalData_selected_completion_variables program before after definition (some output) result)
  have nextParallel := completion_preserves_parallel_bindings program before after prepared.selection withdrawal kind
    fields taskFrame (by rw [frame]) processBindings (by intro; rw [frame]; rfl)
    (by intro; rw [frame]; rfl) (by intro; rw [frame]; rfl) closed activities parallel bodyClaims timers
  have nextControllers : controllersOwnLiveActivity after = true := by
    unfold controllersOwnLiveActivity
    rw [controllerFrame]
    apply List.all_eq_true.mpr
    intro controller present
    rw [completion_smi_activity_census program before after prepared.selection withdrawal kind fields.2.1 controller
      (List.all_eq_true.mp (Bool.and_eq_true_iff.mp sequential).1 controller present)]
    exact List.all_eq_true.mp controllers controller present
  have nextBounds : runtimeStateIdentityBound after = true := by
    simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounds ⊢
    rw [frame, fields.2.2.2.2.1, fields.2.1]
    exact ⟨⟨bounds.1.1, all_filter _ _ _ bounds.1.2⟩, all_filter _ _ _ bounds.2⟩
  have nextDeclarations : waitDeclarationsValid program hosting after = true := by
    simp only [waitDeclarationsValid, Bool.and_eq_true, and_assoc] at declarations ⊢
    rw [frame, fields.2.2.2.2.1]
    refine ⟨declarations.1, declarations.2.1, ?_, declarations.2.2.2.1, declarations.2.2.2.2⟩
    apply List.all_eq_true.mpr
    intro wait present
    obtain ⟨kept, inInstance⟩ := List.mem_filter.mp present
    exact List.all_eq_true.mp declarations.2.2.1 wait
      (List.mem_filter.mpr ⟨(List.mem_filter.mp kept).1, inInstance⟩)
  have nextOrder : canonicalCollectionOrder after = true := by
    have tokenOrder := child_completion_token_order program before after hosting definition output prepared.selection.root
      running census result (canonicalCollectionOrder_tokens before order)
    simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at order ⊢
    rw [frame, scopes, fields.2.2.2.2.1, fields.2.1]
    obtain ⟨_, aa, tasks, activations, msgs, ts, effects, ma, ta, ea, locals, branches,
      rs, calls, acts, smi, pmi, ss, sa, ca, ra⟩ := order
    exact ⟨tokenOrder, aa, tasks, activations, msgs, orderedBy_filter regional_timerWaitBefore_compose _ _ ts, effects,
      ma, ta, ea, locals, branches, rs, calls, orderedBy_filter regional_activityOccurrenceBefore_compose _ _ acts,
      smi, pmi, orderedBy_filter (fun a b c => scopeOwnerBefore_compose a.id b.id c.id) _ _ ss, sa, ca, ra⟩
  have nextRetention := completion_child_compensation_retention program domain before after hosting prepared.selection.root
    running control member child scopes (by rw [frame]) retention
  have nextExecution := completion_child_compensation_execution program domain before after hosting hosting prepared.selection.root
    position running control member child scopes (by rw [frame]) (by rw [frame])
    (by rw [frame]; exact List.Subset.refl _) (by rw [frame]; exact List.Subset.refl _) execution
  have locals : after.variables.scopes = before.variables.scopes.filter
      (fun scope => decide (scope.owner ≠ prepared.selection.root.id)) := by
    obtain ⟨ordinary, completed, ts, acts, update⟩ := completeSelectedScope_ordinary_withdrawal program before after definition (some output) result
    have variables := completeScopeState_variable_fields before ordinary definition (some output) prepared.selection.root census completed
    rw [update]
    cases parent : prepared.selection.root.parent with
    | none => exact (child parent).elim
    | some owner => simpa only [parent] using congrArg ScopedVariables.scopes variables
  have rootDefinition : prepared.selection.root.id.definitionScopeId = definition := by
    have present : prepared.selection.root ∈ before.scopeOccurrences.filter (fun scope => decide (scope.id.definitionScopeId = definition)) := by rw [census]; simp
    exact of_decide_eq_true (List.mem_filter.mp present).2
  have distinct := child_completion_repeated_definitions program id origin definition output
    (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp position).1).1
    (List.mem_filter.mp (by rw [declared]; simp)).1
  have nextRepeated := child_completion_repeated_validity program before after prepared.selection withdrawal kind fields scopes locals
    control (by rw [frame]) (by rw [frame]) ownerClosed (by simpa only [rootDefinition] using distinct) repeated
  refine ⟨after, applied, ?_⟩
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc]
  exact ⟨nextPosition, nextRaces,
    (regional_child_incident_associations_frame before after prepared.selection.root.id quiet scopes control
      (by rw [frame]) (by rw [frame]) (by rw [frame])).trans incidents,
    child_completion_wait_owners before after prepared.selection frame scopes fields quiet ownerClosed owners,
    nextWaitIds, nextBounds, nextDeclarations, by rw [frame]; exact hidden,
    nextOrder, nextActivities, attachedTimersUnambiguous_of_sublist before after activitySublist timerSublist timers,
    attachedMessagesUnambiguous_of_sublist before after activitySublist messages, nextActivityIds,
    nextControllers, nextSequential, nextParallel, nextControllerIds,
    by rw [frame]; exact exhaustion,
    by change (match after.control with | .notStarted => _ | _ => true) = true; rw [control, running],
    by rw [fields.2.1]; exact activityBodyClaimsUnique_filter _ _ bodyClaims,
    nextRetention, by rw [frame]; simpa only [compensationEventSubProcessSnapshotStateValid, snapshots] using snapshotValid,
    nextExecution, nextRepeated⟩

end BpmnSemantics.SemanticProcess.InternalCommutation

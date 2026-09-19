import BpmnSemantics.SemanticProcess.InternalScopeCreationOpenProjection
import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProcessIdentityProofs
import BpmnSemantics.SemanticProcess.ScopeCreationLifecycleStructuralValidity
import BpmnSemantics.SemanticProcess.InternalScopeCreationRuntimeValidity
import BpmnSemantics.SemanticProcess.InternalCommutationOpenProjection
import BpmnSemantics.SemanticProcess.InternalScopeCreationCommutation

/-! Accepted lifecycle publication for the prepared child and Call operations in the
[scope-creation contract](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md#scope-creation-preparation-prerequisite).
Predecessor validity, projection, and preparation determine the successor projection and actual
candidate acceptance; independent pairs retain those results in either execution order.
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private theorem selected_process_agrees (program : Program) (owner : ScopeOccurrenceId)
    (lookup : Option DefinitionScopeId) (candidate runtime : ProcessId)
    (selected : (do
      let staticOwner ← lookup
      if staticOwner ≠ owner.definitionScopeId then none
      else candidateProcessIdForDefinitionScope? program staticOwner) = some candidate)
    (projected : candidateProcessIdForDefinitionScope? program owner.definitionScopeId = some runtime) :
    candidate = runtime := by
  obtain ⟨staticOwner, _, selected⟩ := Option.bind_eq_some_iff.mp selected
  split at selected
  · contradiction
  · next same =>
      have same : staticOwner = owner.definitionScopeId := by simpa using same
      rw [same, projected] at selected
      exact (Option.some.inj selected).symm

theorem candidate_scope_start_agrees_with_projection (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId) (scope : RuntimeScopeOccurrence)
    (start : OpenSemanticFlowNodeOccurrence) (process : ProcessId)
    (staticProcess : candidateProcessIdForDefinitionScope? program owner.definitionScopeId = some process)
    (runtimeProcess : processIdForOwner? program state owner = some process)
    (candidate : candidateScopeStart? program operation owner scope = some start) :
    scopeStart? program state scope = some start := by
  unfold candidateScopeStart? at candidate
  obtain ⟨candidateProcess, selected, candidate⟩ := Option.bind_eq_some_iff.mp candidate
  have same : candidateProcess = process := by
    with_unfolding_all exact selected_process_agrees program owner _ candidateProcess process selected staticProcess
  subst candidateProcess
  cases operation <;> simp only [bind, Option.bind] at candidate <;> try contradiction
  all_goals
    split at candidate
    · contradiction
    · next shape =>
        obtain ⟨definition, definitionFound, candidate⟩ := Option.bind_eq_some_iff.mp candidate
        split at candidate
        · contradiction
        · next binding =>
            simp only [Bool.or_eq_true, decide_eq_true_eq, not_or] at shape binding
            have parent : scope.parent = some owner := by
              simpa using shape.1.1.1
            have originEq := Classical.byContradiction binding.2
            unfold scopeStart?
            rw [parent]
            simp only [bind, Option.bind, runtimeProcess]
            unfold definitionScope? at definitionFound
            split at definitionFound
            · next actual filtered =>
                cases definitionFound
                rw [filtered]
                simpa only [originEq] using candidate
            · contradiction

theorem candidate_call_start_agrees_with_projection (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId) (record : CalledProcessOccurrence)
    (start : OpenSemanticFlowNodeOccurrence) (process : ProcessId)
    (staticProcess : candidateProcessIdForDefinitionScope? program owner.definitionScopeId = some process)
    (runtimeProcess : processIdForOwner? program state owner = some process)
    (candidate : candidateCallStart? program operation owner record = some start) :
    callStart? program state record = some start := by
  unfold candidateCallStart? at candidate
  obtain ⟨candidateProcess, selected, candidate⟩ := Option.bind_eq_some_iff.mp candidate
  have same : candidateProcess = process := by
    with_unfolding_all exact selected_process_agrees program owner _ candidateProcess process selected staticProcess
  subst candidateProcess
  cases operation <;> dsimp only at candidate <;> try contradiction
  case invokeProcess =>
    split at candidate
    · contradiction
    · next shape =>
        simp only [Bool.or_eq_true, decide_eq_true_eq, not_or] at shape
        have caller : record.caller = owner := by simpa using shape.1.1.1.1.1.1
        have element := Classical.byContradiction shape.1.1.1.1.2
        unfold callStart?
        rw [caller, runtimeProcess]
        simpa only [bind, Option.bind, element] using candidate

theorem prepared_scope_creation_start_projects (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (admitted : programWellFormed program = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    ∃ start,
      prepared.publicationTemplate.lifecycle = { started := [start], ended := [] } ∧
      (match prepared.selection.kind with
       | .child => scopeStart? program (prepared.selection.apply state) prepared.selection.created
       | .called record => callStart? program (prepared.selection.apply state) record) = some start := by
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
    selection, running, _, _, owners, _, _, _, startFound, _, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  have live : flowNodeOccurrenceOwnerLiveUnique state selected.owner = true := by
    simp [flowNodeOccurrenceOwnerLiveUnique, owners]
  have ownerHosting : selected.owner.processInstanceId = hosting := by
    cases kind : selected.kind with
    | child => exact (scopeCreation_selection_child_facts state operation selected hosting running selection kind).1
    | called record => exact (scopeCreation_selection_call_facts state operation selected record hosting
        running selection kind).1
  have process : processIdForOwner? program state selected.owner = some program.processId := by
    simp [processIdForOwner?, hostingInstanceId?, running, live, ownerHosting]
  have staticProcess := candidateProcessIdForDefinitionScope_eq_processIdForOwner
    program state selected.owner program.processId hosting admitted running structural live process
  have afterProcess := scopeCreation_process_lookup_preserved program state operation selected selected.owner
    program.processId selection process
  refine ⟨start, rfl, ?_⟩
  change (match selected.kind with
    | .child => scopeStart? program (selected.apply state) selected.created
    | .called record => callStart? program (selected.apply state) record) = some start
  cases kind : selected.kind with
  | child =>
      simp only [internalScopeCreationStart?, kind] at startFound
      exact candidate_scope_start_agrees_with_projection program (selected.apply state) selected.operation
        selected.owner selected.created start program.processId staticProcess afterProcess startFound
  | called record =>
      simp only [internalScopeCreationStart?, kind] at startFound
      exact candidate_call_start_agrees_with_projection program (selected.apply state) selected.operation
        selected.owner record start program.processId staticProcess afterProcess startFound

theorem prepared_scope_creation_open_projection (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (instanceId : SemanticId) (current : List OpenSemanticFlowNodeOccurrence)
    (admitted : programWellFormed program = true)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    ∃ start,
      prepared.publicationTemplate.lifecycle = { started := [start], ended := [] } ∧
      projectOpenFlowNodeOccurrences? program (prepared.selection.apply state) =
        some (sortFlowNodeOccurrenceStarts (start :: current)) := by
  have selection : selectInternalScopeCreation? state operation = some prepared.selection := by
    obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
      selectedEq, _, _, _, _, _, _, _, _, _, rfl⟩ :=
        prepareInternalScopeCreation_facts program state operation prepared found
    exact selectedEq
  obtain ⟨hosting, running⟩ := selectInternalScopeCreation_running state operation prepared.selection selection
  have afterRunning : (prepared.selection.apply state).control = .running hosting := by
    cases kind : prepared.selection.kind <;> simp only [InternalScopeCreationSelection.apply, kind, running]
  have prior := projectOpenFlowNodeOccurrences_validities program state current hosting running projected
  have structuralBefore : flowNodeOccurrenceStructuralProgramValidity program state = true := by
    have all := prior.1
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at all
    exact all.1.1.1
  have structuralAfter := prepareInternalScopeCreation_preserves_structuralProgramValidity
    program state operation prepared admitted structuralBefore found
  have excluded := prepareInternalScopeCreation_excludes_bounded_entry program state operation prepared
  have excluded : ∀ id origin input entry definition boundary,
      .enterBoundedScope id origin input entry definition boundary ∈ program.operations →
        prepared.selection.created.parent = none ∨ definition ≠ prepared.selection.created.id.definitionScopeId :=
    fun id origin input entry definition boundary member =>
      excluded id origin input entry definition boundary admitted found member
  have occurrenceValid := scopeCreation_program_validity_of_structural program state operation
    prepared.selection selection excluded prior.1 structuralAfter
  have afterWF := prepareInternalScopeCreation_preserves_runtimeStateWellFormed program instanceId state
    operation prepared admitted valid found
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at afterWF
  have associations := prepareInternalScopeCreation_preserves_callAssociations program state operation
    prepared admitted prior.2.1 found
  have messages : messageBoundedProjectionValid program (prepared.selection.apply state) = true := by
    cases kind : prepared.selection.kind <;> simp only [InternalScopeCreationSelection.apply, kind]
    all_goals with_unfolding_all exact prior.2.2.2.2
  obtain ⟨start, template, created⟩ := prepared_scope_creation_start_projects program state operation
    prepared admitted structuralBefore found
  have fresh := scopeCreation_started_anchor_fresh program state operation prepared.selection current start
    selection projected created
  refine ⟨start, template, ?_⟩
  have components := projected
  simp only [projectOpenFlowNodeOccurrences?, running] at components
  split at components
  · contradiction
  · simp only [bind, Option.bind, pure, Pure.pure] at components
    obtain ⟨waits, waitsEq, components⟩ := Option.bind_eq_some_iff.mp components
    obtain ⟨scopes, scopesEq, components⟩ := Option.bind_eq_some_iff.mp components
    obtain ⟨calls, callsEq, _⟩ := Option.bind_eq_some_iff.mp components
    have afterWaits := scopeCreation_wait_projection_preserved program state operation prepared.selection
      selection excluded waits waitsEq
    obtain ⟨nextScopes, nextCalls, afterScopes, afterCalls, permutation⟩ :=
      scopeCreation_projection_components program state operation prepared.selection waits scopes calls start
        selection scopesEq callsEq created
    exact open_projection_single_start_from_components program state (prepared.selection.apply state)
      hosting hosting current waits scopes calls waits nextScopes nextCalls start running afterRunning projected
      waitsEq scopesEq callsEq afterWaits afterScopes afterCalls permutation fresh admitted occurrenceValid
      afterWF.2.1 associations afterWF.2.2.1 messages

theorem prepared_scope_creation_candidate (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (commandId : SemanticId) (transitionIndex : Nat)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    candidateFlowNodeOccurrenceDeltaForOperation? program state (prepared.selection.apply state)
      operation commandId transitionIndex = some prepared.publicationTemplate.lifecycle := by
  obtain ⟨selected, hosting, ownerRecord, origin, definition, start, delta,
    selection, running, _, _, _, _, _, _, startFound, _, rfl⟩ :=
      prepareInternalScopeCreation_facts program state operation prepared found
  unfold selectInternalScopeCreation? at selection
  simp only [running, bind, Option.bind] at selection
  cases operation with
  | enterScope id selectedOrigin input entry childScope =>
      obtain ⟨owner, owned, selection⟩ := Option.bind_eq_some_iff.mp selection
      split at selection
      · contradiction
      · next fresh =>
          cases selection
          let created : RuntimeScopeOccurrence :=
            { id := { processInstanceId := hosting, definitionScopeId := childScope,
                      activation := scopeActivationCount state childScope + 1 }, parent := some owner }
          let keep := fun scope : RuntimeScopeOccurrence =>
            decide (scope.id.definitionScopeId = childScope && scope.parent = some owner)
          have absent : state.scopeOccurrences.filter keep = [] := by
            apply List.filter_eq_nil_iff.mpr
            intro scope member accepted
            have same : scope.id.definitionScopeId = childScope := by
              simpa only [keep, decide_eq_true_eq, Bool.and_eq_true] using
                ((Bool.and_eq_true _ _).mp (of_decide_eq_true accepted)).1
            apply fresh
            simp only [Bool.or_eq_true]
            right
            apply List.any_eq_true.mpr
            exact ⟨scope, member, by simp [same]⟩
          have singleton : (insertScopeOccurrence created state.scopeOccurrences).filter keep = [created] := by
            apply List.Perm.eq_singleton
            have permutation := filter_canonicalInsertBy_perm scopeOccurrenceBefore keep created
              state.scopeOccurrences (by simp [keep, created])
            simpa only [insertScopeOccurrence, absent] using permutation
          simp only [internalScopeCreationStart?] at startFound
          change candidateFlowNodeOccurrenceDeltaForOperation? program state
            (_ : RuntimeState) (.enterScope id selectedOrigin input entry childScope) commandId transitionIndex =
              some { started := [start], ended := [] }
          simp only [candidateFlowNodeOccurrenceDeltaForOperation?, flowNodeSelectedOperationOwner?, owned,
            bind, Option.bind, InternalScopeCreationSelection.apply]
          change (do
            let scope ← match (insertScopeOccurrence created state.scopeOccurrences).filter keep with
              | [scope] => some scope | _ => none
            pure (canonicalFlowNodeOccurrenceDelta
              [← candidateScopeStart? program (.enterScope id selectedOrigin input entry childScope) owner scope] [])) = _
          rw [singleton]
          simp only [bind, Option.bind, created, startFound, pure, Pure.pure]
          rfl
  | invokeProcess id selectedOrigin input process root entry returned =>
      obtain ⟨owner, owned, selection⟩ := Option.bind_eq_some_iff.mp selection
      try dsimp only at selection
      repeat first | contradiction | split at selection
      all_goals cases selection
      all_goals
        let record : CalledProcessOccurrence :=
          { id := { processInstanceId := owner.processInstanceId,
                    elementId := ⟨selectedOrigin.elementId.value⟩,
                    activation := callActivationCount state selectedOrigin.elementId + 1 },
            caller := owner, calledProcessId := process,
            calledRoot :=
              { processInstanceId := deriveCalledProcessInstanceId owner.processInstanceId
                  selectedOrigin.elementId (callActivationCount state selectedOrigin.elementId + 1)
                definitionScopeId := root, activation := 1 }
            returnOperationId := returned }
        have excluded : (state.calledProcessOccurrences.filter fun candidate => decide
            (candidate.id = record.id ||
              candidate.calledRoot.processInstanceId = record.calledRoot.processInstanceId)).length = 0 := by
          assumption
        have absent : state.calledProcessOccurrences.filter (fun candidate => decide (candidate.id = record.id)) = [] := by
          apply List.filter_eq_nil_iff.mpr
          intro candidate member matched
          have denied := List.filter_eq_nil_iff.mp (List.length_eq_zero_iff.mp excluded) candidate member
          exact denied (by simp [of_decide_eq_true matched])
        have singleton : (sortCallRecords (record :: state.calledProcessOccurrences)).filter
            (fun candidate => decide (candidate.id = record.id)) = [record] := by
          apply List.Perm.eq_singleton
          have permutation := (sortCallRecords_perm (record :: state.calledProcessOccurrences)).filter
            (fun candidate => decide (candidate.id = record.id))
          simpa only [List.filter_cons, decide_true, ↓reduceIte, absent] using permutation
        simp only [internalScopeCreationStart?] at startFound
        simp only [makeInternalScopeCreationPreparation, candidateFlowNodeOccurrenceDeltaForOperation?,
          flowNodeSelectedOperationOwner?, owned, bind, Option.bind, InternalScopeCreationSelection.apply]
        change (do
          let actual ← match (sortCallRecords (record :: state.calledProcessOccurrences)).filter
              (fun candidate => decide (candidate.id = record.id)) with
            | [actual] => some actual | _ => none
          pure (canonicalFlowNodeOccurrenceDelta
            [← candidateCallStart? program (.invokeProcess id selectedOrigin input process root entry returned)
              owner actual] [])) = some { started := [start], ended := [] }
        rw [singleton]
        simp only [bind, Option.bind, record, startFound, pure, Pure.pure]
        rfl
  | _ => contradiction

theorem prepareInternalScopeCreation_accepted_lifecycle (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (prepared : PreparedInternalScopeCreation)
    (instanceId commandId : SemanticId) (transitionIndex : Nat)
    (current : List OpenSemanticFlowNodeOccurrence)
    (admitted : programWellFormed program = true)
    (valid : runtimeStateWellFormed program instanceId state = true)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (found : prepareInternalScopeCreation? program state operation = some prepared) :
    flowNodeOccurrenceDeltaForOperation? program state (prepared.selection.apply state) operation
      commandId transitionIndex = some prepared.publicationTemplate.lifecycle := by
  obtain ⟨start, template, afterProjection⟩ := prepared_scope_creation_open_projection program state
    operation prepared instanceId current admitted valid projected found
  have candidate := prepared_scope_creation_candidate program state operation prepared commandId transitionIndex found
  rw [template] at candidate ⊢
  have nonTransition : transitionAnchor start.anchor = false := by
    cases shape : transitionAnchor start.anchor with
    | false => rfl
    | true =>
        exact False.elim (projectOpenFlowNodeOccurrences_transitionAnchor_false program
          (prepared.selection.apply state) (sortFlowNodeOccurrenceStarts (start :: current)) afterProjection
          ⟨start, (mem_sortFlowNodeOccurrenceStarts start (start :: current)).mpr List.mem_cons_self, shape⟩)
  exact single_start_candidate_accepted program state (prepared.selection.apply state) operation commandId
    transitionIndex current start (sortFlowNodeOccurrenceStarts (start :: current)) projected afterProjection
    rfl candidate nonTransition

theorem prepared_scope_creation_pair_accepted_lifecycle
    (program : Program) (instanceId commandId : SemanticId) (state : RuntimeState)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalScopeCreation)
    (transitionIndex : Nat) (current : List OpenSemanticFlowNodeOccurrence)
    (programWF : programWellFormed program = true)
    (stateWF : runtimeStateWellFormed program instanceId state = true)
    (projected : projectOpenFlowNodeOccurrences? program state = some current)
    (leftFound : prepareInternalScopeCreation? program state leftOperation = some left)
    (rightFound : prepareInternalScopeCreation? program state rightOperation = some right)
    (separated : localControlStateFootprintsNonInterfering left.footprint right.footprint = true) :
    flowNodeOccurrenceDeltaForOperation? program state (left.selection.apply state)
      leftOperation commandId transitionIndex = some left.publicationTemplate.lifecycle ∧
    flowNodeOccurrenceDeltaForOperation? program (left.selection.apply state)
      (right.selection.apply (left.selection.apply state)) rightOperation commandId
      (transitionIndex + 1) = some right.publicationTemplate.lifecycle ∧
    flowNodeOccurrenceDeltaForOperation? program state (right.selection.apply state)
      rightOperation commandId transitionIndex = some right.publicationTemplate.lifecycle ∧
    flowNodeOccurrenceDeltaForOperation? program (right.selection.apply state)
      (left.selection.apply (right.selection.apply state)) leftOperation commandId
      (transitionIndex + 1) = some left.publicationTemplate.lifecycle ∧
    ∃ next, projectOpenFlowNodeOccurrences? program
      (right.selection.apply (left.selection.apply state)) = some next ∧
      projectOpenFlowNodeOccurrences? program
        (left.selection.apply (right.selection.apply state)) = some next := by
  obtain ⟨leftAfterRight, rightAfterLeft, leftValid, rightValid, _, _, sameState⟩ :=
    prepared_scope_creation_pair_complete program instanceId state leftOperation rightOperation left right
      programWF stateWF leftFound rightFound separated
  obtain ⟨leftStart, _, leftProjected⟩ := prepared_scope_creation_open_projection program state
    leftOperation left instanceId current programWF stateWF projected leftFound
  obtain ⟨rightStart, _, rightProjected⟩ := prepared_scope_creation_open_projection program state
    rightOperation right instanceId current programWF stateWF projected rightFound
  obtain ⟨finalStart, _, finalProjected⟩ := prepared_scope_creation_open_projection program
    (left.selection.apply state) rightOperation right instanceId
    (sortFlowNodeOccurrenceStarts (leftStart :: current)) programWF leftValid leftProjected rightAfterLeft
  refine ⟨prepareInternalScopeCreation_accepted_lifecycle program state leftOperation left instanceId
    commandId transitionIndex current programWF stateWF projected leftFound,
    prepareInternalScopeCreation_accepted_lifecycle program (left.selection.apply state) rightOperation right
      instanceId commandId (transitionIndex + 1) (sortFlowNodeOccurrenceStarts (leftStart :: current))
      programWF leftValid leftProjected rightAfterLeft,
    prepareInternalScopeCreation_accepted_lifecycle program state rightOperation right instanceId
      commandId transitionIndex current programWF stateWF projected rightFound,
    prepareInternalScopeCreation_accepted_lifecycle program (right.selection.apply state) leftOperation left
      instanceId commandId (transitionIndex + 1) (sortFlowNodeOccurrenceStarts (rightStart :: current))
      programWF rightValid rightProjected leftAfterRight,
    _, finalProjected, ?_⟩
  rw [← sameState]
  exact finalProjected

end BpmnSemantics.SemanticProcess.InternalCommutation

import BpmnSemantics.SemanticProcess.SequentialScopeAdmissionValidityProofs
import BpmnSemantics.SemanticProcess.SequentialScopeBodyAccountingProofs
import BpmnSemantics.SemanticProcess.ActivityDataInputOutputMultiInstanceFrames
import BpmnSemantics.SemanticProcess.ParallelScopeWaitPublicationProofs
import BpmnSemantics.SemanticProcess.InternalRegionalIdentityValidity

/-! SMIS-ADMIT-01 retains full runtime validity and actual projectability for successful individual transitions through admission and lifecycle contracts, below certificate preservation and scheduler transport. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

private theorem sequentialScope_entry_declarations_count (operations : List SemanticOperation)
    (element : String) :
    (operations.filter fun
      | .enterSequentialMultiInstanceScope _ origin _ _ _ _ _ _ _ _ =>
          decide (origin.elementId.value = element)
      | _ => false).length =
      ((operations.filterMap sequentialScopeEntry?).filter
        (fun entry => entry.elementId.value == element)).length := by
  induction operations with
  | nil => rfl
  | cons operation operations ih =>
      cases operation <;> simp [List.filter_cons, List.filterMap_cons, sequentialScopeEntry?, ih]
      split <;> simp_all

/-- A valid current-body binding already requires exactly one entry declaration for every SMIS controller. -/
theorem sequentialScopeStateValid_controller_declarations (program : Program) (state : RuntimeState)
    (valid : sequentialScopeStateValid program state = true) :
    state.sequentialScopeControllers.all (fun controller =>
      (program.operations.filter fun
        | .enterSequentialMultiInstanceScope _ origin _ _ _ _ _ _ _ _ =>
            decide (origin.elementId.value = controller.id.activityElementId.value)
        | _ => false).length = 1) = true := by
  have checkedControllers := (Bool.and_eq_true_iff.mp valid).1
  apply List.all_eq_true.mpr
  intro controller member
  have checked := List.all_eq_true.mp checkedControllers controller member
  rw [sequentialScope_entry_declarations_count]
  split at checked <;> try contradiction
  all_goals simp_all

/-- SMIS-IDENTITY-01's current-body census identifies each token at a body-owned port without selecting a single-input owner. -/
theorem sequentialScope_current_body_token_owner (program : Program) (hosting : SemanticId)
    (entry : SequentialScopeEntry) (state : RuntimeState) (binding : SequentialScopeBinding)
    (token : ControlToken) (wellFormed : runtimeStateWellFormed program hosting state = true)
    (running : state.control = .running hosting)
    (declared : entry ∈ program.operations.filterMap sequentialScopeEntry?)
    (bound : sequentialScopeBindingForEntry? entry state = some binding)
    (member : token ∈ state.tokens)
    (placeOwner : program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = token.placeId)) =
        [{ controlPlaceId := token.placeId, scopeId := entry.childScopeId }]) :
    token.owner = binding.body.id := by
  have parts := wellFormed
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at parts
  obtain ⟨live, scope⟩ := sequentialScope_present_token_static_scope program hosting state token
    entry.childScopeId parts.1 running member placeOwner
  have valid : sequentialScopeStateValid program state = true := by grind
  have census := sequentialScope_valid_body_census program entry state binding declared valid bound
  obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
  have selected : occurrence ∈ state.scopeOccurrences.filter
      (fun candidate => decide (candidate.id = token.owner)) := by rw [singleton]; simp
  obtain ⟨present, identity⟩ := List.mem_filter.mp selected
  have identity : occurrence.id = token.owner := of_decide_eq_true identity
  have inBody : occurrence ∈ state.scopeOccurrences.filter
      (fun candidate => candidate.id.definitionScopeId == entry.childScopeId) :=
    List.mem_filter.mpr ⟨present, by simp [identity, scope]⟩
  rw [census] at inBody
  exact identity.symm.trans (congrArg RuntimeScopeOccurrence.id (List.mem_singleton.mp inBody))

/-- SMIS-DATA-01's actual Human completion rewrites only its selected wait, continuation token and scoped data. -/
theorem sequentialScope_user_completion_frame (program : Program) (before after : RuntimeState)
    (taskId : UserTaskInstanceId) (values : List VariableBinding)
    (completed : completeSequentialScopeUserTask? program before taskId values = some after) :
    ∃ wait variables, sequentialScopeTaskWaits before taskId = [wait] ∧
      after = { before with
        waits := before.waits.erase wait
        variables := variables
        tokens := addToken before.tokens wait.output wait.owner } := by
  obtain ⟨wait, variables, selected, _, frame⟩ :=
    sequentialScope_user_completion_data_frame program before after taskId values completed
  exact ⟨wait, variables, selected, frame⟩

/-- SMIS-DATA-01's actual mapped Service completion rewrites only its selected wait, continuation token and scoped data. -/
theorem sequentialScope_effect_completion_frame (program : Program) (before after : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (completed : completeSequentialScopeEffect? program before effectId result = some after) :
    ∃ wait variables, before.effectWaits.filter (effectIdNamesWait effectId) = [wait] ∧
      after = { before with
        effectWaits := before.effectWaits.erase wait
        variables := variables
        tokens := addToken before.tokens wait.output wait.owner } := by
  obtain ⟨wait, _, variables, selected, _, _, frame⟩ :=
    sequentialScope_effect_completion_data_frame program before after effectId result completed
  exact ⟨wait, { variables with
    activities := variables.activities.filter (fun scope => !activityScopeMatches effectId scope) }, selected, frame⟩

private theorem smis_entry_task_separation (program : Program) (entry : SequentialScopeEntry)
    (separate : ∀ operation ∈ program.operations, ∀ taskId,
      operationDeclaresWaitKey operation (userTaskWaitDeclarationKey taskId) = true →
        taskId.value ≠ entry.elementId.value) :
    (∀ operation ∈ program.operations,
      match operation with
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ _ _ _ => task.id.value ≠ entry.elementId.value
      | _ => True) ∧
    (∀ operation ∈ program.operations, ∀ arm,
      ParallelMultiInstanceArm.ofOperation? operation = some arm → arm.taskId.value ≠ entry.elementId.value) := by
  constructor
  · intro operation member
    cases operation <;> try trivial
    exact separate _ member _ (by simp [operationDeclaresWaitKey, operationWaitDeclarationKeys])
  · intro operation member arm parsed
    cases operation <;> simp only [ParallelMultiInstanceArm.ofOperation?, Option.some.injEq] at parsed <;> try contradiction
    subst arm
    exact separate _ member _ (by simp [operationDeclaresWaitKey, operationWaitDeclarationKeys])

/-- Actual SMIS entry retains the complete runtime and publication foundation; static port and child declarations are discharged by the admitted consumer. -/
theorem sequentialScope_entry_full_validity (program : Program) (hosting : SemanticId)
    (entry : SequentialScopeEntry) (parent : ScopeOccurrenceId) (definition : DefinitionScope)
    (before : RuntimeState) (result : SequentialScopeEntryResult)
    (wellFormed : runtimeStateWellFormed program hosting before = true)
    (projectable : (projectOpenFlowNodeOccurrences? program before).isSome = true)
    (running : before.control = .running hosting)
    (admitted : SequentialScopeProgram.admitted program = true)
    (analyzed : ∃ analysis, SequentialScopeControl.analyze program = some analysis)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (lookup : uniqueDefinitionScope? program entry.childScopeId = some definition)
    (staticParent : definition.parentScopeId = some parent.definitionScopeId)
    (source : definition.originElementId = entry.elementId)
    (staticBinding : ∀ activation, scopeOperationBindingValid program
      ⟨⟨parent.processInstanceId, entry.childScopeId, activation⟩, some parent⟩ definition = true)
    (taskSeparated : ∀ operation ∈ program.operations, ∀ taskId,
      operationDeclaresWaitKey operation (userTaskWaitDeclarationKey taskId) = true →
        taskId.value ≠ entry.elementId.value)
    (declared : ∀ port ∈ [entry.childEntry, entry.normalOutput], ∃ place,
      program.controlPlaces.filter (fun candidate => decide (candidate.id = port)) = [place])
    (childOwned : program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = entry.childEntry)) =
        [{ controlPlaceId := entry.childEntry, scopeId := entry.childScopeId }])
    (outputOwned : program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = entry.normalOutput)) =
        [{ controlPlaceId := entry.normalOutput, scopeId := parent.definitionScopeId }])
    (noWork : before.waits = [] ∧ before.effectWaits = [] ∧ before.activityOccurrences = [])
    (census : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = [] ∧
      before.eventRaces = [] ∧ before.calledProcessOccurrences = [] ∧ before.selectedBranchSets = [] ∧
      before.sequentialScopeControllers = [] ∧ before.parallelScopeControllers = [] ∧
      before.sequentialMultiInstanceControllers = [] ∧ before.parallelMultiInstanceControllers = [])
    (forest : before.scopeOccurrences = [⟨parent, none⟩])
    (hostingParent : parent.processInstanceId = hosting)
    (entered : enterSequentialScopeResult? entry before parent = some result) :
    runtimeStateWellFormed program hosting result.state = true ∧
      (projectOpenFlowNodeOccurrences? program result.state).isSome = true := by
  have excluded : program.compensationActivityRetention = none ∧
      program.compensationEventSubProcessSnapshots = none ∧ program.compensationExecution = none := by
    obtain ⟨analysis, checked⟩ := analyzed
    unfold SequentialScopeControl.analyze at checked
    split at checked <;> try contradiction
    have absent : program.compensationActivityRetention.isSome = false ∧
        program.compensationEventSubProcessSnapshots.isSome = false ∧
        program.compensationExecution.isSome = false := by grind
    simpa only [Option.isSome_eq_false_iff, Option.isNone_iff_eq_none] using absent
  have parts := wellFormed
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at parts
  have position : runtimePositionValid program hosting before = true := parts.1
  have afterPosition := sequentialScope_entry_preserves_position program hosting entry parent definition
    before result position running lookup staticParent declared childOwned outputOwned entered
  have bounded : runtimeStateIdentityBound before = true := by grind
  have afterBounded := sequentialScope_entry_preserves_identity_bound entry before parent result bounded entered
  have associations : sequentialScopeStateValid program before = true := by grind
  have afterAssociations := sequentialScope_entry_preserves_validity program entry before parent result entries associations entered
  have claims : activityBodyClaimsUnique before.activityOccurrences = true := by grind
  have liveWork : activityRecordsOwnLiveWork before = true := by grind
  have afterClaims := sequentialScope_entry_body_claims entry before parent result entered liveWork claims
  have afterDeclarations := sequentialScopeStateValid_controller_declarations program result.state afterAssociations
  have canonical := runtimeStateWellFormed_canonicalCollectionOrder program hosting before wellFormed
  unfold enterSequentialScopeResult? at entered
  split at entered <;> try contradiction
  obtain ⟨items, _, entered⟩ := Option.bind_eq_some_iff.mp entered
  cases items with
  | nil =>
      cases Option.some.inj entered
      have tokens : orderedBy controlTokenBefore before.tokens = true := by
        simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at canonical
        exact canonical.1
      have newTokens := orderedBy_addToken _ entry.normalOutput parent
        (orderedBy_removeToken before.tokens entry.input parent tokens)
      let changed := { before with tokens := addToken (removeToken before.tokens entry.input parent) entry.normalOutput parent }
      have seqFrame := sequentialMultiInstanceProgramBindingsValid_frame program before changed rfl rfl rfl rfl
      have parFrame := parallelMultiInstanceProgramBindingsValid_frame program before changed rfl rfl rfl rfl
        rfl (fun _ => rfl) (fun _ => rfl) (fun _ => rfl)
      have structuralFrame := flowNodeOccurrenceStructuralProgramValidity_frame program before changed rfl rfl rfl
      have effectFrame := flowNodeOccurrenceEffectProgramValidity_frame program before changed rfl rfl rfl rfl
      have messagePairs : messageBoundedProjectionValid program changed = true := by
        apply List.all_eq_true.mpr
        intro operation _
        cases operation <;> simp [messageBoundedOperationProjectionValid, changed, noWork.1, noWork.2.2, census.1]
      constructor
      · simp_all [changed, SequentialScopeEntryResult.state, runtimeStateWellFormed,
          canonicalCollectionOrder, compensationActivityRetentionStateValid,
          compensationEventSubProcessSnapshotStateValid, compensationExecutionStateValid,
          excluded.1, excluded.2.1, excluded.2.2, running, Bool.and_eq_true, and_assoc,
          eventRaceAssociationsValid, effectIncidentAssociationsValid, waitOwnersLive,
          waitIdentitiesUnique, waitDeclarationsValid, hiddenRecordDeclarationsValid,
          activityRecordsOwnLiveWork, attachedTimersUnambiguous, attachedMessagesUnambiguous,
          activityIdentitiesUnique, controllersOwnLiveActivity, controllerIdentitiesUnique,
          controllersNotExhausted, activityBodyClaimsUnique]
      · simp_all [changed, SequentialScopeEntryResult.state, projectOpenFlowNodeOccurrences?,
          projectWaits?, flowNodeOccurrenceProgramValidity, flowNodeOccurrenceWaitProgramValidity,
          flowNodeOccurrenceUserTaskProgramValidity,
          eventRaceAssociationsValid, calledProcessAssociationsValid, effectIncidentAssociationsValid,
          rootInstanceId?, sortFlowNodeOccurrenceStarts, sortBy]
  | cons item rest =>
      obtain ⟨⟨issued, child⟩, issuance, entered⟩ := Option.bind_eq_some_iff.mp entered
      obtain ⟨variables, initialized, entered⟩ := Option.bind_eq_some_iff.mp entered
      cases Option.some.inj entered
      unfold issueSequentialScope? at issuance
      simp only [running] at issuance
      split at issuance <;> try contradiction
      rename_i vacant
      simp only [Option.some.injEq, Prod.mk.injEq] at issuance
      rcases issuance with ⟨rfl, rfl⟩
      let child : ScopeOccurrenceId :=
        ⟨parent.processInstanceId, entry.childScopeId, scopeActivationCount before entry.childScopeId + 1⟩
      let created : RuntimeScopeOccurrence := ⟨child, some parent⟩
      let record : ActivityOccurrence :=
        { processInstanceId := parent.processInstanceId, activityElementId := entry.elementId,
          activation := activityActivationCount before ⟨entry.elementId.value⟩ + 1,
          owner := parent, body := .childScope child, attachedHandlers := [] }
      let changed : RuntimeState := { before with
        control := .running hosting,
        scopeOccurrences := insertScopeOccurrence created before.scopeOccurrences,
        scopeActivations := setScopeActivationCount before.scopeActivations entry.childScopeId child.activation,
        tokens := removeToken (addToken before.tokens entry.childEntry child) entry.input parent,
        variables := variables,
        activityOccurrences := insertActivityOccurrence record before.activityOccurrences,
        activityActivations := setActivationCount before.activityActivations ⟨entry.elementId.value⟩ record.activation,
        sequentialScopeControllers := before.sequentialScopeControllers ++
          [⟨sequentialScopeActivityId record, rest.length + 1, 0, item⟩] }
      change runtimeStateWellFormed program hosting changed = true ∧
        (projectOpenFlowNodeOccurrences? program changed).isSome = true
      change runtimePositionValid program hosting changed = true at afterPosition
      change runtimeStateIdentityBound changed = true at afterBounded
      change sequentialScopeStateValid program changed = true at afterAssociations
      change activityBodyClaimsUnique changed.activityOccurrences = true at afterClaims
      change changed.sequentialScopeControllers.all _ = true at afterDeclarations
      have fresh : ∀ occurrence ∈ before.scopeOccurrences, occurrence.id ≠ child := by
        intro occurrence member same
        exact vacant (List.any_eq_true.mpr ⟨occurrence, member, by simp [same, child]⟩)
      have different : child ≠ parent := by
        intro same
        exact fresh ⟨parent, none⟩ (by rw [forest]; simp) same.symm
      have parentLive : exactLiveOccurrence changed parent = true := by
        simpa only [changed, exactLiveOccurrence] using
          exactLiveOccurrence_insertScopeOccurrence_preserves before created parent fresh
            (by simp [exactLiveOccurrence, forest])
      have childLive : exactLiveOccurrence changed child = true := by
        simpa only [changed, exactLiveOccurrence] using
          exactLiveOccurrence_insertScopeOccurrence_created before created fresh
      have variableFrame := initializeScopeVariables_preserves_other_data initialized
      have nextRunning : changed.control = .running hosting := rfl
      have orderParts := canonical
      simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at orderParts
      have tokenOrder := orderedBy_removeToken _ entry.input parent
        (orderedBy_addToken before.tokens entry.childEntry child orderParts.1)
      have counterOrder : orderedBy activationBefore changed.activityActivations = true := by
        apply orderedBy_insertTaskActivation
        exact orderedBy_filter (stringKeyBefore_compose (fun row : TaskActivation => row.taskId.value))
          _ _ orderParts.2.1
      have scopeOrder := orderedBy_insertScopeOccurrence created before.scopeOccurrences
        (by grind : orderedBy scopeOccurrenceBefore before.scopeOccurrences = true)
      have scopeCounterOrder := orderedBy_setScopeActivationCount before.scopeActivations entry.childScopeId
        child.activation (by grind : orderedBy scopeActivationBefore before.scopeActivations = true)
      have nextOrder : canonicalCollectionOrder changed = true := by
        simp_all [canonicalCollectionOrder, changed, record, noWork.2.2, insertActivityOccurrence, orderedBy]
      have sequentialValid : sequentialMultiInstanceProgramBindingsValid program before = true := by grind
      have parallelValid : parallelMultiInstanceProgramBindingsValid program before = true := by grind
      obtain ⟨sequentialSeparated, parallelSeparated⟩ := smis_entry_task_separation program entry taskSeparated
      have sequentialInserted := sequentialBindings_insertActivityOccurrence_frame program before record
        sequentialSeparated sequentialValid
      have parallelInserted := parallelBindings_insertActivityOccurrence_frame program before record
        parallelSeparated parallelValid
      have nextSequential : sequentialMultiInstanceProgramBindingsValid program changed = true := by
        rw [sequentialMultiInstanceProgramBindingsValid_frame program
          { before with activityOccurrences := insertActivityOccurrence record before.activityOccurrences }
          changed rfl rfl rfl rfl]
        exact sequentialInserted
      have nextParallel : parallelMultiInstanceProgramBindingsValid program changed = true := by
        rw [← parallelMultiInstanceProgramBindingsValid_frame program
          { before with
            activityOccurrences := insertActivityOccurrence record before.activityOccurrences,
            activityActivations := setActivationCount before.activityActivations ⟨entry.elementId.value⟩ record.activation }
          changed rfl rfl rfl rfl (congrArg (fun data => data.bindings) variableFrame.1).symm
          (fun _ => rfl) (fun _ => rfl) (fun _ => rfl)]
        exact parallelInserted
      have nextWellFormed : runtimeStateWellFormed program hosting changed = true := by
        simp_all [runtimeStateWellFormed, changed, noWork.1, noWork.2.1, noWork.2.2,
          insertActivityOccurrence, record, eventRaceAssociationsValid, effectIncidentAssociationsValid,
          waitOwnersLive, waitIdentitiesUnique, waitDeclarationsValid, hiddenRecordDeclarationsValid,
          activityRecordsOwnLiveWork, activityBodyLive, activityTaskBodyOwnersAgree,
          attachedTimersUnambiguous, attachedMessagesUnambiguous, ActivityOccurrence.timerHandlerOccurrences,
          ActivityOccurrence.messageHandlerOccurrences, activityIdentitiesUnique, occursOnce, sameActivityOccurrence,
          controllerIdentitiesUnique, controllersNotExhausted, controllersOwnLiveActivity,
          sequentialScopeActivityId,
          compensationActivityRetentionStateValid, compensationEventSubProcessSnapshotStateValid,
          compensationExecutionStateValid, excluded.1, excluded.2.1, excluded.2.2]
        exact afterDeclarations
      have structural := sequentialScope_structural_of_position program hosting changed afterPosition nextRunning
        (by simpa only [changed] using census.2.2.2.2.1) (by
          intro occurrence member actual found
          rcases (mem_insertScopeOccurrence created occurrence before.scopeOccurrences).mp member with rfl | old
          · have same : actual = definition := Option.some.inj (found.symm.trans lookup)
            subst actual
            exact staticBinding child.activation
          · have same : occurrence = ⟨parent, none⟩ := by simpa only [forest, List.mem_singleton] using old
            simp [same, scopeOperationBindingValid])
      have waitValidity : flowNodeOccurrenceWaitProgramValidity program changed = true := by
        obtain ⟨current, projectedBefore⟩ := Option.isSome_iff_exists.mp projectable
        have prior := (projectOpenFlowNodeOccurrences_validities program before current hosting running projectedBefore).1
        have effects : flowNodeOccurrenceEffectProgramValidity program before = true :=
          (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp
            (Bool.and_eq_true_iff.mp prior).1).1).2).2
        have nextEffects : flowNodeOccurrenceEffectProgramValidity program changed = true := by
          have scopeFrame : flowNodeOccurrenceEffectProgramValidity program
              { before with scopeOccurrences := changed.scopeOccurrences } =
              flowNodeOccurrenceEffectProgramValidity program before := by
            unfold flowNodeOccurrenceEffectProgramValidity
            exact congr (congrArg Bool.and (by
              simp only [noWork.2.1, census.2.2.1, List.all_nil])) (by with_unfolding_all rfl)
          rw [flowNodeOccurrenceEffectProgramValidity_frame program
            { before with scopeOccurrences := changed.scopeOccurrences } changed rfl rfl rfl variableFrame.2.1,
            scopeFrame]
          exact effects
        simp only [flowNodeOccurrenceWaitProgramValidity, nextEffects, Bool.and_true]
        simp [flowNodeOccurrenceUserTaskProgramValidity, changed, noWork.1, census.1, census.2.1]
      have occurrenceValidity : flowNodeOccurrenceProgramValidity program changed = true := by
        simp only [flowNodeOccurrenceProgramValidity, structural, waitValidity, Bool.true_and]
        simp [changed, census.2.2.2.1, census.2.2.2.2.2.1]
      have pairs : messageBoundedProjectionValid program changed = true := by
        apply List.all_eq_true.mpr
        intro operation member
        cases operation <;> simp [messageBoundedOperationProjectionValid, changed,
          noWork.1, noWork.2.2, census.1, insertActivityOccurrence, record]
        all_goals
          exact Or.inr (Ne.symm (taskSeparated _ member _
            (by simp [operationDeclaresWaitKey, operationWaitDeclarationKeys])))
      have afterFacts := (position_iff program hosting hosting changed nextRunning).mp afterPosition
      obtain ⟨occurrences, projected⟩ := projectOpenFlowNodeOccurrences_hosting_total program changed hosting
        nextRunning afterFacts.1 occurrenceValidity (by simp [eventRaceAssociationsValid, changed, census.2.2.2.1])
        afterFacts.2.2.2.2.1 pairs (by simpa only [changed] using census.1)
        (by simpa only [changed] using census.2.1) (by simpa only [changed] using census.2.2.1)
        (by simpa only [changed] using census.2.2.2.2.1)
        (by
          intro owner live
          obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
          have member : occurrence ∈ changed.scopeOccurrences :=
            (List.mem_filter.mp (singleton.symm ▸ List.mem_singleton_self occurrence)).1
          have filtered : occurrence ∈ changed.scopeOccurrences.filter
              (fun candidate => decide (candidate.id = owner)) := by rw [singleton]; simp
          have same : occurrence.id = owner := of_decide_eq_true (List.mem_filter.mp filtered).2
          rcases (mem_insertScopeOccurrence created occurrence before.scopeOccurrences).mp member with rfl | old
          · simpa only [← same, created, child] using hostingParent
          · have root : occurrence = ⟨parent, none⟩ := by simpa only [forest, List.mem_singleton] using old
            simpa only [← same, root] using hostingParent)
        (by simp [changed, noWork.1, noWork.2.1])
        (by
          simp only [changed, forest, insertScopeOccurrence, canonicalInsertBy]
          split <;> simp [created, different, Ne.symm different])
      exact ⟨nextWellFormed, by rw [projected]; rfl⟩

private theorem smis_task_mi_absent (program : Program) (state : RuntimeState)
    (sequential : state.sequentialMultiInstanceControllers = [])
    (parallel : state.parallelMultiInstanceControllers = [])
    (domain : ∀ operation ∈ program.operations,
      operation.kind ≠ .awaitSequentialMultiInstanceUserTask ∧
      operation.kind ≠ .awaitParallelMultiInstanceUserTask) :
    sequentialMultiInstanceProgramBindingsValid program state = true ∧
      parallelMultiInstanceProgramBindingsValid program state = true := by
  constructor
  · simp only [sequentialMultiInstanceProgramBindingsValid,
      sequentialMultiInstanceControllerProgramBindingsValid, sequential, List.all_nil, Bool.true_and]
    apply List.all_eq_true.mpr
    intro operation member
    have excluded := domain operation member
    cases operation <;> simp_all [SemanticOperation.kind, sequentialMultiInstanceOperationBindingComplete]
  · simp only [parallelMultiInstanceProgramBindingsValid, parallel,
      List.all_nil, Bool.true_and, parallelMultiInstanceControllersOrdered]
    apply List.all_eq_true.mpr
    intro operation member
    have excluded := domain operation member
    cases operation <;> simp_all [SemanticOperation.kind, ParallelMultiInstanceArm.ofOperation?]

private theorem smis_ingress_runtime_assembly (program : Program) (hosting : SemanticId)
    (before : RuntimeState) (tokens : List ControlToken) (humans : List UserTaskWait)
    (effects : List EffectWait) (variables : ScopedVariables)
    (wellFormed : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (humanSubset : humans.Sublist before.waits) (effectSubset : effects.Sublist before.effectWaits)
    (dataSubset : variables.activities.Sublist before.variables.activities)
    (position : runtimePositionValid program hosting { before with tokens := tokens } = true)
    (tokenOrder : orderedBy controlTokenBefore tokens = true)
    (associations : sequentialScopeStateValid program { before with variables := variables } = true)
    (shape : ∀ record ∈ before.activityOccurrences, ∃ child, record.body = .childScope child)
    (empty : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = [] ∧
      before.eventRaces = [] ∧ before.calledProcessOccurrences = [] ∧ before.selectedBranchSets = [] ∧
      before.parallelScopeControllers = [] ∧ before.sequentialMultiInstanceControllers = [] ∧
      before.parallelMultiInstanceControllers = [])
    (excluded : program.compensationActivityRetention = none ∧
      program.compensationEventSubProcessSnapshots = none ∧ program.compensationExecution = none)
    (domain : ∀ operation ∈ program.operations,
      operation.kind ≠ .awaitSequentialMultiInstanceUserTask ∧
      operation.kind ≠ .awaitParallelMultiInstanceUserTask) :
    runtimeStateWellFormed program hosting { before with
      tokens := tokens, waits := humans, effectWaits := effects, variables := variables } = true := by
  let after := { before with tokens := tokens, waits := humans, effectWaits := effects, variables := variables }
  have prior := wellFormed
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at prior
  have canonical := runtimeStateWellFormed_canonicalCollectionOrder program hosting before wellFormed
  have order := canonical
  simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at order
  have humanOrder := orderedBy_sublist userTaskWaitBefore_compose _ _ humanSubset (by grind)
  have effectOrder := orderedBy_sublist regional_effectWaitBefore_compose _ _ effectSubset (by grind)
  have dataOrder := orderedBy_sublist regional_activityVariableScopeBefore_compose _ _ dataSubset (by grind)
  have afterOrder : canonicalCollectionOrder after = true := by
    simp_all [canonicalCollectionOrder, after]
  have uniqueness := runtime_identity_uniqueness_of_sublists before after humanSubset
    (List.Sublist.refl _) (List.Sublist.refl _) effectSubset (List.Sublist.refl _)
    (List.Sublist.refl _) (by grind) (by grind) (by grind)
  have ownerPrior : waitOwnersLive before = true := by grind
  have owners : waitOwnersLive after = true := by
    simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at ownerPrior ⊢
    simp only [after, empty.1, empty.2.1, empty.2.2.1, empty.2.2.2.1,
      empty.2.2.2.2.1, empty.2.2.2.2.2.1, List.all_nil, true_and] at ownerPrior ⊢
    refine ⟨?_, ?_, ?_⟩
    · exact List.all_eq_true.mpr (fun wait member => List.all_eq_true.mp ownerPrior.1 wait (humanSubset.subset member))
    · exact List.all_eq_true.mpr (fun wait member => List.all_eq_true.mp ownerPrior.2.1 wait (effectSubset.subset member))
    · exact ownerPrior.2.2
  have boundedPrior : runtimeStateIdentityBound before = true := by grind
  have bounded : runtimeStateIdentityBound after = true := by
    simp only [runtimeStateIdentityBound, Bool.and_eq_true, and_assoc] at boundedPrior ⊢
    exact ⟨List.all_eq_true.mpr (fun wait member =>
      List.all_eq_true.mp boundedPrior.1 wait (humanSubset.subset member)), boundedPrior.2⟩
  have declarationPrior : waitDeclarationsValid program hosting before = true := by grind
  have declarations : waitDeclarationsValid program hosting after = true := by
    simp only [waitDeclarationsValid, empty.1, empty.2.1, empty.2.2.1,
      List.filter_nil, List.all_nil, Bool.and_true, Bool.and_eq_true] at declarationPrior
    simp only [waitDeclarationsValid, after, empty.1, empty.2.1, empty.2.2.1,
      List.filter_nil, List.all_nil, Bool.and_true, Bool.and_eq_true]
    constructor
    · exact List.all_eq_true.mpr (fun wait member => List.all_eq_true.mp declarationPrior.1 wait
        (List.mem_filter.mpr ⟨humanSubset.subset (List.mem_filter.mp member).1, (List.mem_filter.mp member).2⟩))
    · exact List.all_eq_true.mpr (fun wait member => List.all_eq_true.mp declarationPrior.2 wait
        (List.mem_filter.mpr ⟨effectSubset.subset (List.mem_filter.mp member).1, (List.mem_filter.mp member).2⟩))
  have activityPrior : activityRecordsOwnLiveWork before = true := by grind
  have activity : activityRecordsOwnLiveWork after = true := by
    apply List.all_eq_true.mpr
    intro record member
    obtain ⟨child, body⟩ := shape record member
    simpa only [activityRecordsOwnLiveWork, after, activityBodyLive, activityTaskBodyOwnersAgree,
      body, exactLiveOccurrence]
      using List.all_eq_true.mp activityPrior record member
  have inactive := smis_task_mi_absent program after empty.2.2.2.2.2.2.2.1
    empty.2.2.2.2.2.2.2.2 domain
  have afterPosition : runtimePositionValid program hosting after = true := by
    with_unfolding_all exact position
  have hiddenPrior : hiddenRecordDeclarationsValid program before = true := by grind
  have hidden : hiddenRecordDeclarationsValid program after = true := by
    with_unfolding_all exact hiddenPrior
  have attachedTimer : attachedTimersUnambiguous after = true := by
    simp [attachedTimersUnambiguous, after, empty.2.1]
  have attachedMessagePrior : attachedMessagesUnambiguous before = true := by grind
  have attachedMessage : attachedMessagesUnambiguous after = true := by
    with_unfolding_all exact attachedMessagePrior
  have afterAssociations : sequentialScopeStateValid program after = true := by
    with_unfolding_all exact associations
  change runtimeStateWellFormed program hosting after = true
  simp_all [runtimeStateWellFormed, after, eventRaceAssociationsValid,
    effectIncidentAssociationsValid, compensationActivityRetentionStateValid,
    compensationEventSubProcessSnapshotStateValid, compensationExecutionStateValid,
    excluded.1, excluded.2.1, excluded.2.2, controllersOwnLiveActivity,
    controllersNotExhausted]

private theorem smis_ingress_projection (program : Program) (hosting : SemanticId)
    (before after : RuntimeState)
    (position : runtimePositionValid program hosting after = true)
    (running : after.control = .running hosting)
    (flow : flowNodeOccurrenceProgramValidity program after = true)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (humans : after.waits.Sublist before.waits) (effects : after.effectWaits.Sublist before.effectWaits)
    (empty : after.messageWaits = [] ∧ after.timerWaits = [] ∧ after.effectIncidents = [] ∧
      after.eventRaces = [] ∧ after.calledProcessOccurrences = [])
    (messageDomain : ∀ operation ∈ program.operations,
      operation.kind ≠ .awaitMessageBoundedUserTask ∧ operation.kind ≠ .awaitMessageMonitoredUserTask)
    (hosted : ∀ occurrence ∈ before.scopeOccurrences, occurrence.id.processInstanceId = hosting)
    (scopeKeys : (before.scopeOccurrences.map (·.id)).Nodup)
    (waitKeys : ((before.waits.map fun wait =>
      (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : OccurrenceId)) ++
      before.effectWaits.map fun wait =>
        (⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩ : OccurrenceId)).Nodup) :
    (projectOpenFlowNodeOccurrences? program after).isSome = true := by
  have facts := (position_iff program hosting hosting after running).mp position
  have pairs : messageBoundedProjectionValid program after = true := by
    apply List.all_eq_true.mpr
    intro operation member
    have excluded := messageDomain operation member
    cases operation <;> simp_all [SemanticOperation.kind, messageBoundedOperationProjectionValid]
  obtain ⟨occurrences, projected⟩ := projectOpenFlowNodeOccurrences_hosting_total program after hosting
    running facts.1 flow (by simp [eventRaceAssociationsValid, empty.2.2.2.1])
    facts.2.2.2.2.1 pairs empty.1 empty.2.1 empty.2.2.1 empty.2.2.2.2
    (by
      intro owner live
      obtain ⟨occurrence, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
      have member : occurrence ∈ after.scopeOccurrences.filter (fun scope => decide (scope.id = owner)) := by
        rw [census]; simp
      obtain ⟨present, same⟩ := List.mem_filter.mp member
      rw [scopes] at present
      simpa only [of_decide_eq_true same] using hosted occurrence present)
    ((humans.map _ |>.append (effects.map _)).nodup waitKeys)
    (by simpa only [scopes] using scopeKeys)
  rw [projected]
  rfl

/-- SMIS-DATA-01's distinct Human and Service ingress share validity assembly, while their exact data-disposal contracts remain separate. -/
theorem sequentialScope_ingress_full_validity (program : Program) (hosting : SemanticId)
    (analysis : SequentialScopeData.Analysis) (before after : RuntimeState)
    (wellFormed : runtimeStateWellFormed program hosting before = true)
    (projectable : (projectOpenFlowNodeOccurrences? program before).isSome = true)
    (running : before.control = .running hosting)
    (analyzed : SequentialScopeData.analyze program = some analysis)
    (invariant : SequentialScopeBoundaryInvariant program before)
    (shape : ∀ record ∈ before.activityOccurrences, ∃ child, record.body = .childScope child)
    (empty : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = [] ∧
      before.eventRaces = [] ∧ before.calledProcessOccurrences = [] ∧ before.selectedBranchSets = [] ∧
      before.parallelScopeControllers = [] ∧ before.sequentialMultiInstanceControllers = [] ∧
      before.parallelMultiInstanceControllers = [])
    (excluded : program.compensationActivityRetention = none ∧
      program.compensationEventSubProcessSnapshots = none ∧ program.compensationExecution = none)
    (domain : ∀ operation ∈ program.operations,
      operation.kind ≠ .awaitSequentialMultiInstanceUserTask ∧
      operation.kind ≠ .awaitParallelMultiInstanceUserTask ∧
      operation.kind ≠ .awaitMessageBoundedUserTask ∧ operation.kind ≠ .awaitMessageMonitoredUserTask)
    (hosted : ∀ occurrence ∈ before.scopeOccurrences, occurrence.id.processInstanceId = hosting)
    (scopeKeys : (before.scopeOccurrences.map (·.id)).Nodup)
    (waitKeys : ((before.waits.map fun wait =>
      (⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ : OccurrenceId)) ++
      before.effectWaits.map fun wait =>
        (⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩ : OccurrenceId)).Nodup)
    (ports : ∀ port owner,
      (∃ wait ∈ before.waits, wait.output = port ∧ wait.owner = owner) ∨
      (∃ wait ∈ before.effectWaits, wait.output = port ∧ wait.owner = owner) →
      (∃ place, program.controlPlaces.filter (fun candidate => decide (candidate.id = port)) = [place]) ∧
      program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = port)) =
        [{ controlPlaceId := port, scopeId := owner.definitionScopeId }])
    (completed : (∃ taskId values, completeSequentialScopeUserTask? program before taskId values = some after) ∨
      (∃ effectId result, completeSequentialScopeEffect? program before effectId result = some after)) :
    runtimeStateWellFormed program hosting after = true ∧
      (projectOpenFlowNodeOccurrences? program after).isSome = true := by
  have prior := wellFormed
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at prior
  have position : runtimePositionValid program hosting before = true := prior.1
  have owners : waitOwnersLive before = true := by grind
  simp only [waitOwnersLive, Bool.and_eq_true, and_assoc] at owners
  obtain ⟨occurrences, projected⟩ := Option.isSome_iff_exists.mp projectable
  have flow := (projectOpenFlowNodeOccurrences_validities program before occurrences hosting running projected).1
  have waits : flowNodeOccurrenceWaitProgramValidity program before = true := by
    simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true, and_assoc] at flow
    exact flow.2.1
  have canonical := runtimeStateWellFormed_canonicalCollectionOrder program hosting before wellFormed
  have tokenOrder : orderedBy controlTokenBefore before.tokens = true := by
    simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at canonical
    exact canonical.1
  have taskDomain : ∀ operation ∈ program.operations,
      operation.kind ≠ .awaitSequentialMultiInstanceUserTask ∧
      operation.kind ≠ .awaitParallelMultiInstanceUserTask :=
    fun operation member => ⟨(domain operation member).1, (domain operation member).2.1⟩
  have messageDomain : ∀ operation ∈ program.operations,
      operation.kind ≠ .awaitMessageBoundedUserTask ∧ operation.kind ≠ .awaitMessageMonitoredUserTask :=
    fun operation member => (domain operation member).2.2
  rcases completed with ⟨taskId, values, completed⟩ | ⟨effectId, result, completed⟩
  · have afterInvariant := sequentialScope_invariant_user_completion program analysis before after taskId values analyzed invariant completed
    obtain ⟨wait, variables, selected, written, frame⟩ := sequentialScope_user_completion_data_frame program before after taskId values completed
    have member : wait ∈ before.waits := by
      have present : wait ∈ sequentialScopeTaskWaits before taskId := by rw [selected]; simp
      exact (List.mem_filter.mp present).1
    have port := ports wait.output wait.owner (Or.inl ⟨wait, member, rfl, rfl⟩)
    have live := List.all_eq_true.mp owners.1 wait member
    have added := runtimePositionValid_addToken program hosting before wait.output wait.owner position live port.1 port.2
    have activityFrame := sequentialScope_write_activity_frame program before wait.owner values .userTask variables written
    subst after
    have stateValid : sequentialScopeStateValid program { before with variables := variables } = true := by
      with_unfolding_all exact afterInvariant.associations
    have valid := smis_ingress_runtime_assembly program hosting before
      (addToken before.tokens wait.output wait.owner) (before.waits.erase wait) before.effectWaits variables wellFormed running
      List.erase_sublist (List.Sublist.refl _) (by rw [activityFrame]; exact List.Sublist.refl _) added
      (orderedBy_addToken _ _ _ tokenOrder) stateValid shape empty excluded taskDomain
    have waitValid := ParallelScopeCommand.human_disposal_valid program before wait variables activityFrame waits empty.1 empty.2.1
    have nextFlow := flowNodeOccurrenceProgramValidity_of_wait_frame program before _ flow waitValid rfl rfl rfl rfl rfl
    exact ⟨valid, smis_ingress_projection program hosting before _ (by with_unfolding_all exact added)
      running nextFlow rfl List.erase_sublist (List.Sublist.refl _) (by exact ⟨empty.1, empty.2.1, empty.2.2.1, empty.2.2.2.1, empty.2.2.2.2.1⟩)
      messageDomain hosted scopeKeys waitKeys⟩
  · have afterInvariant := sequentialScope_invariant_effect_completion program analysis before after effectId result analyzed invariant completed
    obtain ⟨wait, values, variables, selected, identity, written, frame⟩ := sequentialScope_effect_completion_data_frame program before after effectId result completed
    have member : wait ∈ before.effectWaits := by
      have present : wait ∈ before.effectWaits.filter (effectIdNamesWait effectId) := by rw [selected]; simp
      exact (List.mem_filter.mp present).1
    have port := ports wait.output wait.owner (Or.inr ⟨wait, member, rfl, rfl⟩)
    have live := List.all_eq_true.mp owners.2.2.2.1 wait member
    have added := runtimePositionValid_addToken program hosting before wait.output wait.owner position live port.1 port.2
    have activityFrame := sequentialScope_write_activity_frame program before wait.owner values .serviceTask variables written
    subst after
    have stateValid : sequentialScopeStateValid program { before with variables := variables } = true := by
      with_unfolding_all exact afterInvariant.associations
    have valid := smis_ingress_runtime_assembly program hosting before
      (addToken before.tokens wait.output wait.owner) before.waits (before.effectWaits.erase wait)
      { variables with activities := variables.activities.filter (fun scope => !activityScopeMatches effectId scope) }
      wellFormed running
      (List.Sublist.refl _) List.erase_sublist (by rw [activityFrame]; exact List.filter_sublist)
      added (orderedBy_addToken _ _ _ tokenOrder) stateValid shape empty excluded taskDomain
    have waitValid := ParallelScopeCommand.service_disposal_valid program before wait member variables activityFrame
      waits empty.1 empty.2.1 empty.2.2.1
    rw [identity] at afterInvariant valid ⊢
    have nextFlow := flowNodeOccurrenceProgramValidity_of_wait_frame program before _ flow waitValid rfl rfl rfl rfl rfl
    exact ⟨valid, smis_ingress_projection program hosting before _ (by with_unfolding_all exact added)
      running nextFlow rfl (List.Sublist.refl _) List.erase_sublist (by exact ⟨empty.1, empty.2.1, empty.2.2.1, empty.2.2.2.1, empty.2.2.2.2.1⟩)
      messageDomain hosted scopeKeys waitKeys⟩

/-- SMIS-END-01 preserves full runtime validity and open projectability through actual terminal retirement and fresh-body turnover. -/
theorem sequentialScope_completion_full_validity (program : Program) (hosting : SemanticId)
    (entry : SequentialScopeEntry) (definition : DefinitionScope)
    (before : RuntimeState) (binding : SequentialScopeBinding) (result : SequentialScopeCompletionResult)
    (wellFormed : runtimeStateWellFormed program hosting before = true)
    (projectable : (projectOpenFlowNodeOccurrences? program before).isSome = true)
    (running : before.control = .running hosting)
    (invariant : SequentialScopeBoundaryInvariant program before)
    (entries : program.operations.filterMap sequentialScopeEntry? = [entry])
    (bound : sequentialScopeBindingForEntry? entry before = some binding)
    (forest : before.scopeOccurrences.Perm [⟨binding.activity.owner, none⟩, binding.body])
    (activities : before.activityOccurrences = [binding.activity])
    (controllers : before.sequentialScopeControllers = [binding.controller])
    (locals : before.variables.scopes = [binding.locals])
    (handlers : binding.activity.attachedHandlers = [])
    (hosted : binding.activity.owner.processInstanceId = hosting)
    (lookup : uniqueDefinitionScope? program entry.childScopeId = some definition)
    (staticBinding : ∀ child, child.definitionScopeId = entry.childScopeId →
      scopeOperationBindingValid program ⟨child, some binding.activity.owner⟩ definition = true)
    (declared : ∀ port ∈ [entry.childEntry, entry.normalOutput], ∃ place,
      program.controlPlaces.filter (fun candidate => decide (candidate.id = port)) = [place])
    (childOwned : program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = entry.childEntry)) =
      [{ controlPlaceId := entry.childEntry, scopeId := entry.childScopeId }])
    (outputOwned : program.controlPlaceScopes.filter (fun ownership => decide (ownership.controlPlaceId = entry.normalOutput)) =
      [{ controlPlaceId := entry.normalOutput, scopeId := binding.activity.owner.definitionScopeId }])
    (noWork : before.waits = [] ∧ before.effectWaits = [])
    (empty : before.messageWaits = [] ∧ before.timerWaits = [] ∧ before.effectIncidents = [] ∧
      before.eventRaces = [] ∧ before.calledProcessOccurrences = [] ∧ before.selectedBranchSets = [] ∧
      before.parallelScopeControllers = [] ∧ before.sequentialMultiInstanceControllers = [] ∧
      before.parallelMultiInstanceControllers = [])
    (excluded : program.compensationActivityRetention = none ∧
      program.compensationEventSubProcessSnapshots = none ∧ program.compensationExecution = none)
    (domain : ∀ operation ∈ program.operations,
      operation.kind ≠ .awaitSequentialMultiInstanceUserTask ∧ operation.kind ≠ .awaitParallelMultiInstanceUserTask ∧
      operation.kind ≠ .awaitMessageBoundedUserTask ∧ operation.kind ≠ .awaitMessageMonitoredUserTask)
    (completed : completeSequentialScopeResult? entry before = some result) :
    runtimeStateWellFormed program hosting result.state = true ∧
      (projectOpenFlowNodeOccurrences? program result.state).isSome = true := by
  have prior := wellFormed
  simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at prior
  have position := sequentialScope_completion_preserves_position program hosting entry before binding result
    prior.1 running bound declared childOwned outputOwned completed
  have bounded := sequentialScope_completion_preserves_identity_bound entry before result (by grind) completed
  have claims := sequentialScope_completion_body_claims entry before result completed (by grind) (by grind)
  have afterInvariant := sequentialScope_completion_preserves_invariant program entry before result
    entries invariant completed
  have associations := afterInvariant.associations
  have declarations := sequentialScopeStateValid_controller_declarations program result.state associations
  have canonical := sequentialScope_completion_preserves_order entry before binding result bound activities
    (runtimeStateWellFormed_canonicalCollectionOrder program hosting before wellFormed) completed
  have populations := sequentialScope_completion_populations entry before binding result bound forest activities controllers locals completed
  have frame := sequentialScope_completion_state_frame entry before binding result bound completed
  have controlFrame := congrArg RuntimeState.control frame
  have waitFrame := congrArg RuntimeState.waits frame
  have effectFrame := congrArg RuntimeState.effectWaits frame
  have messageFrame := congrArg RuntimeState.messageWaits frame
  have timerFrame := congrArg RuntimeState.timerWaits frame
  have incidentFrame := congrArg RuntimeState.effectIncidents frame
  have raceFrame := congrArg RuntimeState.eventRaces frame
  have callFrame := congrArg RuntimeState.calledProcessOccurrences frame
  have selectedFrame := congrArg RuntimeState.selectedBranchSets frame
  have parallelScopeFrame := congrArg RuntimeState.parallelScopeControllers frame
  have sequentialFrame := congrArg RuntimeState.sequentialMultiInstanceControllers frame
  have parallelFrame := congrArg RuntimeState.parallelMultiInstanceControllers frame
  have retentionFrame := congrArg RuntimeState.compensationActivityRetentions frame
  have snapshotFrame := congrArg RuntimeState.compensationParentContextRetentions frame
  have triggerFrame := congrArg RuntimeState.compensationTriggers frame
  have handlerFrame := congrArg RuntimeState.compensationHandlerEffectWaits frame
  clear frame
  have runningAfter : result.state.control = .running hosting := controlFrame.trans running
  have inactive := smis_task_mi_absent program result.state (sequentialFrame.trans empty.2.2.2.2.2.2.2.1)
    (parallelFrame.trans empty.2.2.2.2.2.2.2.2)
    (fun operation member => ⟨(domain operation member).1, (domain operation member).2.1⟩)
  obtain ⟨current, projected⟩ := Option.isSome_iff_exists.mp projectable
  have flowPrior := (projectOpenFlowNodeOccurrences_validities program before current hosting running projected).1
  have effectPrior : flowNodeOccurrenceEffectProgramValidity program before = true := by
    simp only [flowNodeOccurrenceProgramValidity, flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true, and_assoc] at flowPrior
    grind
  have effects : flowNodeOccurrenceEffectProgramValidity program result.state = true := by
    have scopeFrame : flowNodeOccurrenceEffectProgramValidity program
        { before with scopeOccurrences := result.state.scopeOccurrences } =
        flowNodeOccurrenceEffectProgramValidity program before := by
      unfold flowNodeOccurrenceEffectProgramValidity
      exact congr (congrArg Bool.and (by
        simp only [noWork.2, empty.2.2.1, List.all_nil])) (by with_unfolding_all rfl)
    rw [flowNodeOccurrenceEffectProgramValidity_frame program
      { before with scopeOccurrences := result.state.scopeOccurrences } result.state
      rfl effectFrame incidentFrame populations.2.1, scopeFrame]
    exact effectPrior
  have waits : flowNodeOccurrenceWaitProgramValidity program result.state = true := by
    simp [flowNodeOccurrenceWaitProgramValidity, flowNodeOccurrenceUserTaskProgramValidity,
      waitFrame, noWork.1, messageFrame, empty.1, timerFrame, empty.2.1, effects]
  have keys := sequentialScope_position_scope_keys program hosting result.state position runningAfter
  have messageDomain : ∀ operation ∈ program.operations,
      operation.kind ≠ .awaitMessageBoundedUserTask ∧ operation.kind ≠ .awaitMessageMonitoredUserTask :=
    fun operation member => (domain operation member).2.2
  cases result with
  | terminal owner after =>
      simp only [SequentialScopeCompletionResult.state] at *
      obtain ⟨_, _, _, scopes, records, _, _⟩ := populations
      have structural := sequentialScope_structural_of_position program hosting after position runningAfter
        (callFrame.trans empty.2.2.2.2.1) (by
          intro occurrence member actual _
          have same : occurrence = ⟨binding.activity.owner, none⟩ := by simpa [scopes] using member
          simp [same, scopeOperationBindingValid])
      have flow : flowNodeOccurrenceProgramValidity program after = true := by
        simp [flowNodeOccurrenceProgramValidity, structural, waits, selectedFrame, empty.2.2.2.2.2.1, raceFrame, empty.2.2.2.1]
      have hostingFacts := sequentialScope_position_hosting program hosting after binding.activity.owner position runningAfter hosted
        (by intro occurrence member; exact Or.inl (congrArg RuntimeScopeOccurrence.id (by simpa [scopes] using member)))
      constructor
      · simp_all [runtimeStateWellFormed, eventRaceAssociationsValid, effectIncidentAssociationsValid,
          waitOwnersLive, waitIdentitiesUnique, waitDeclarationsValid, hiddenRecordDeclarationsValid,
          activityRecordsOwnLiveWork, attachedTimersUnambiguous, attachedMessagesUnambiguous,
          activityIdentitiesUnique, controllersOwnLiveActivity, controllerIdentitiesUnique, controllersNotExhausted,
          compensationActivityRetentionStateValid, compensationEventSubProcessSnapshotStateValid, compensationExecutionStateValid]
      · exact smis_ingress_projection program hosting after after position runningAfter flow rfl
          (List.Sublist.refl _) (List.Sublist.refl _)
          ⟨messageFrame.trans empty.1, timerFrame.trans empty.2.1, incidentFrame.trans empty.2.2.1,
            raceFrame.trans empty.2.2.2.1, callFrame.trans empty.2.2.2.2.1⟩
          messageDomain hostingFacts keys (by simp [waitFrame, noWork.1, effectFrame, noWork.2])
  | next owner after =>
      simp only [SequentialScopeCompletionResult.state] at *
      obtain ⟨_, _, _, child, item, localFrame, childScope, scopes, records, _, _, _⟩ := populations
      have rootMember : (⟨binding.activity.owner, none⟩ : RuntimeScopeOccurrence) ∈ after.scopeOccurrences :=
        scopes.mem_iff.mpr (by simp)
      have bodyMember : (⟨child, some binding.activity.owner⟩ : RuntimeScopeOccurrence) ∈ after.scopeOccurrences :=
        scopes.mem_iff.mpr (by simp)
      have facts := (position_iff program hosting hosting after runningAfter).mp position
      have parentLive := (facts.2.2.2.2.2.1 _ rootMember).1
      have childLive := (facts.2.2.2.2.2.1 _ bodyMember).1
      have structural : flowNodeOccurrenceStructuralProgramValidity program after = true := by
        apply sequentialScope_structural_of_position program hosting after position runningAfter (callFrame.trans empty.2.2.2.2.1)
        intro occurrence member actual found
        have cases := scopes.mem_iff.mp member
        simp only [List.mem_cons, List.not_mem_nil, or_false] at cases
        rcases cases with rfl | rfl
        · rfl
        · have same : actual = definition := Option.some.inj (found.symm.trans (childScope ▸ lookup))
          subst actual
          exact staticBinding child childScope
      have flow : flowNodeOccurrenceProgramValidity program after = true := by
        simp [flowNodeOccurrenceProgramValidity, structural, waits, selectedFrame, empty.2.2.2.2.2.1, raceFrame, empty.2.2.2.1]
      have hostingFacts := sequentialScope_position_hosting program hosting after binding.activity.owner position runningAfter hosted
        (by
          intro occurrence member
          have cases := scopes.mem_iff.mp member
          simp only [List.mem_cons, List.not_mem_nil, or_false] at cases
          rcases cases with rfl | rfl <;> simp)
      constructor
      · simp_all [runtimeStateWellFormed, eventRaceAssociationsValid, effectIncidentAssociationsValid,
          waitOwnersLive, waitIdentitiesUnique, waitDeclarationsValid, hiddenRecordDeclarationsValid,
          activityRecordsOwnLiveWork, activityBodyLive, activityTaskBodyOwnersAgree,
          ActivityOccurrence.timerHandlerOccurrences, ActivityOccurrence.messageHandlerOccurrences,
          attachedTimersUnambiguous, attachedMessagesUnambiguous, activityIdentitiesUnique, occursOnce,
          sameActivityOccurrence, controllersOwnLiveActivity, controllerIdentitiesUnique, controllersNotExhausted,
          compensationActivityRetentionStateValid, compensationEventSubProcessSnapshotStateValid, compensationExecutionStateValid]
      · exact smis_ingress_projection program hosting after after position runningAfter flow rfl
          (List.Sublist.refl _) (List.Sublist.refl _)
          ⟨messageFrame.trans empty.1, timerFrame.trans empty.2.1, incidentFrame.trans empty.2.2.1,
            raceFrame.trans empty.2.2.2.1, callFrame.trans empty.2.2.2.2.1⟩
          messageDomain hostingFacts keys (by simp [waitFrame, noWork.1, effectFrame, noWork.2])

end BpmnSemantics.SemanticProcess

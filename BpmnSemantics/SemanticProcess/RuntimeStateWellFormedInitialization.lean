import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.MessageStartAdmission
import BpmnSemantics.SemanticProcess.TimerStartAdmission
import BpmnSemantics.SemanticProcess.CommandAdmission

/-! # Runtime-state well-formedness at initialization

This module owns `RSI-OBL-01` and `RSI-OBL-02`: the complete invariant for the empty state and actual committed start admission, under the existing position hypothesis. `RINIT-START-01` includes the root reservation performed after the intermediate raw constructor. The raw constructor's separate guarantee requires no snapshot declaration.

These are initialization base cases. They neither establish position validity nor prove preservation through internal closure or subsequent transitions, and therefore do not justify installing a full-invariant admission gate.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem startingCompensationValid (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (position : runtimePositionValid program instanceId state = true)
    (triggers : state.compensationTriggers = [])
    (waits : state.compensationHandlerEffectWaits = [])
    (control : state.control = .notStarted ∨ ∃ id, state.control = .running id) :
    compensationExecutionStateValid program state = true := by
  simp only [runtimePositionValid, Bool.and_eq_true] at position
  have structural := position.1.1
  simp only [programWellFormed, Bool.and_eq_true] at structural
  exact compensationExecutionStateValid_empty program state structural.2 triggers waits control

private theorem startingProgramFacts (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (position : runtimePositionValid program instanceId state = true) :
    programWellFormed program = true ∧
      compensationActivityRetentionDeclarationValid program = true ∧
      compensationEventSubProcessSnapshotDeclarationValid program = true := by
  simp only [runtimePositionValid, Bool.and_eq_true] at position
  have structural := position.1.1
  have retention : compensationActivityRetentionDeclarationValid program = true := by
    simp only [programWellFormed, Bool.and_eq_true] at structural
    exact structural.1.2
  refine ⟨structural, retention, ?_⟩
  have graph := programWellFormed_graph program structural
  unfold programGraphWellFormedForProgram at graph
  change (match (_ : List OperationId) with
    | [start] => match programEntryRootScopeId? program with
      | some entryRoot => _
      | none => false
    | _ => false) = true at graph
  split at graph
  · split at graph
    · rename_i entryRoot rootFound
      simp only [Bool.and_eq_true] at graph
      have lifecycle : compensationEventSubProcessSnapshotScopeLifecycleWellFormed program
          entryRoot = true := by grind
      exact ((Bool.and_eq_true _ _).mp lifecycle).1
    · contradiction
  · contradiction

private theorem startingParallelValid (program : Program) (state : RuntimeState)
    (structural : programWellFormed program = true)
    (controllers : state.parallelMultiInstanceControllers = [])
    (records : state.activityOccurrences = []) (waits : state.waits = [])
    (timers : state.timerWaits = []) :
    parallelMultiInstanceProgramBindingsValid program state = true := by
  simp only [parallelMultiInstanceProgramBindingsValid, controllers, List.all_nil,
    parallelMultiInstanceControllersOrdered, Bool.true_and, List.all_eq_true]
  intro operation member
  cases operation <;> simp only [ParallelMultiInstanceArm.ofOperation?]
  rename_i id origin input taskId taskName data output timer completion limits
  let operation := SemanticOperation.awaitParallelMultiInstanceUserTask id origin input taskId
    taskName data output timer completion limits
  have operationIdsUnique : (program.operations.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
      (fun _ _ different same => different (congrArg OperationId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program structural)
  have placeIdsUnique : (program.controlPlaces.map (·.id)).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
    rw [List.map_map]
    exact strictlySortedStrings_nodup _ (programWellFormed_controlPlaceIdsSorted program structural)
  obtain ⟨owner, _, ownership, _, _⟩ := programGraphWellFormed_operationControlPlaceScope
    program operation input (programWellFormed_graph program structural) operationIdsUnique
    placeIdsUnique member (by simp [operation, operationControlPlacesShareOwner])
      (by change input ∈ [input, timer.output]; simp)
  have owned : operationOwningScope? program id = some owner := by
    change program.operationScopes.filter (fun ownership =>
      decide (ownership.operationId = id)) = [{ operationId := id, scopeId := owner }] at ownership
    unfold operationOwningScope?
    rw [ownership]
  simp [SemanticOperation.id, owned, records, waits, timers]

private theorem initialSnapshotValid (program : Program)
    (valid : compensationEventSubProcessSnapshotDeclarationValid program = true) :
    compensationEventSubProcessSnapshotStateValid program initialState = true := by
  cases present : program.compensationEventSubProcessSnapshots with
  | none => simp [compensationEventSubProcessSnapshotStateValid, valid, present, initialState]
  | some declaration =>
      have declaredValid := valid
      simp only [compensationEventSubProcessSnapshotDeclarationValid, present] at declaredValid
      split at declaredValid
      · contradiction
      · simp only [Bool.and_eq_true, decide_eq_true_eq] at declaredValid
        have capacity : 2 ≤ declaration.maxCanonicalBytes := by grind
        simp [compensationEventSubProcessSnapshotStateValid, valid, present, initialState,
          canonicalCompensationParentContextRetentionsUtf8Bytes, retentionLifecycleValid]
        exact ⟨rfl, capacity⟩

private theorem startedRetentionValid (program : Program) (instanceId : SemanticId)
    (variables : List VariableBinding) (raw : RuntimeState)
    (retentions : List CompensationParentContextRetention)
    (built : runningProgramStartState? program instanceId variables = some raw)
    (valid : compensationActivityRetentionDeclarationValid program = true) :
    compensationActivityRetentionStateValid program
      { raw with compensationParentContextRetentions := retentions } = true := by
  unfold runningProgramStartState? at built
  simp only [Option.bind_eq_bind, Option.bind_eq_some_iff, Option.pure_def,
    Option.some.injEq] at built
  obtain ⟨root, rootFound, rfl⟩ := built
  cases present : program.compensationActivityRetention with
  | none => simp [compensationActivityRetentionStateValid, valid, present]
  | some declaration =>
      have declarationValid := valid
      simp only [compensationActivityRetentionDeclarationValid, present, Bool.and_eq_true,
        decide_eq_true_eq] at declarationValid
      have capacity : 2 ≤ declaration.maxCanonicalBytes := by grind
      have flat := declarationValid.1.1.1.1.1.1.1.1.1.1.1.1
      have rootId : root.id = declaration.definitionScopeId := by
        change (match program.definitionScopes.filter (·.parentScopeId.isNone) with
          | [scope] => scope.id == declaration.definitionScopeId && scope.parentScopeId.isNone &&
            scope.originElementId.value == program.processId.value &&
            (program.compensationExecution.isSome || program.definitionScopes.length = 1)
          | _ => false) = true at flat
        split at flat
        · rename_i scope parentless
          simp only [Bool.and_eq_true, beq_iff_eq] at flat
          unfold rootDefinitionScope? at rootFound
          split at rootFound
          · rename_i selected selectedOnly
            have selectedEq : selected = root := Option.some.inj rootFound
            have member : root ∈ program.definitionScopes.filter (fun scope =>
                scope.parentScopeId.isNone &&
                  decide (scope.originElementId.value = program.processId.value)) := by
              rw [selectedOnly, selectedEq]
              simp
            obtain ⟨member, matched⟩ := List.mem_filter.mp member
            have parentMember : root ∈ program.definitionScopes.filter
                (·.parentScopeId.isNone) := List.mem_filter.mpr
                  ⟨member, ((Bool.and_eq_true _ _).mp matched).1⟩
            rw [parentless] at parentMember
            have same : root = scope := by simpa using parentMember
            exact same ▸ flat.1.1.1
          · contradiction
        · contradiction
      simp only [compensationActivityRetentionStateValid, valid, present, Bool.true_and]
      change (_ && _ && _ && _ && _ && _ && _ && _ && _ && _) = true
      simp [rootId, canonicalCompensationRecordsUtf8Bytes, capacity]
      exact ⟨rfl, rfl⟩

private theorem startedWithSnapshots_wellFormed (program : Program) (instanceId : SemanticId)
    (variables : List VariableBinding) (raw : RuntimeState)
    (retentions : List CompensationParentContextRetention)
    (built : runningProgramStartState? program instanceId variables = some raw)
    (position : runtimePositionValid program instanceId
      { raw with compensationParentContextRetentions := retentions } = true)
    (snapshots : compensationEventSubProcessSnapshotStateValid program
      { raw with compensationParentContextRetentions := retentions } = true) :
    runtimeStateWellFormed program instanceId
      { raw with compensationParentContextRetentions := retentions } = true := by
  obtain ⟨structural, retentionDeclared, _⟩ := startingProgramFacts program instanceId _ position
  have retention := startedRetentionValid program instanceId variables raw retentions
    built retentionDeclared
  have parallel : parallelMultiInstanceProgramBindingsValid program
      { raw with compensationParentContextRetentions := retentions } = true := by
    unfold runningProgramStartState? at built
    simp only [Option.bind_eq_bind, Option.bind_eq_some_iff, Option.pure_def,
      Option.some.injEq] at built
    obtain ⟨_, _, rfl⟩ := built
    exact startingParallelValid program _ structural rfl rfl rfl rfl
  unfold runningProgramStartState? at built
  simp only [Option.bind_eq_bind, Option.bind_eq_some_iff, Option.pure_def,
    Option.some.injEq] at built
  obtain ⟨_, _, rfl⟩ := built
  have compensation := startingCompensationValid program instanceId _ position
    rfl rfl (.inr ⟨instanceId, rfl⟩)
  unfold runtimeStateWellFormed
  rw [position, compensation, snapshots, retention, parallel]
  simp [runningStartState, initialState, emptyScopedVariables, waitOwnersLive, waitIdentitiesUnique,
    waitDeclarationsValid, hiddenRecordDeclarationsValid, canonicalCollectionOrder, orderedBy,
    eventRaceAssociationsValid, effectIncidentAssociationsValid, runtimeStateIdentityBound,
    activityRecordsOwnLiveWork, attachedTimersUnambiguous, attachedMessagesUnambiguous,
    activityIdentitiesUnique, activityBodyClaimsUnique, controllersOwnLiveActivity,
    sequentialMultiInstanceProgramBindingsValid,
    sequentialMultiInstanceControllerProgramBindingsValid,
    sequentialMultiInstanceOperationBindingComplete,
    controllerIdentitiesUnique, controllersNotExhausted, parallelMultiInstanceControllersOrdered]
  intro operation _
  cases operation <;> simp
  split <;> rfl

/-- `RSI-OBL-01`. On the empty state, well-formedness reduces exactly to the position predicate the
account already had.

The position predicate supplies structural Program admission, including declaration validity and the separately approved empty execution capacity. Empty runtime collections discharge the remaining ownership and uniqueness checks; the theorem adds no new Program premise. -/
theorem initialState_wellFormed (program : Program) (instanceId : SemanticId)
    (position : runtimePositionValid program instanceId initialState = true) :
    runtimeStateWellFormed program instanceId initialState = true := by
  obtain ⟨structural, retentionDeclared, snapshotDeclared⟩ :=
    startingProgramFacts program instanceId initialState position
  have compensation := startingCompensationValid program instanceId initialState position
    rfl rfl (.inl rfl)
  have snapshots := initialSnapshotValid program snapshotDeclared
  have retention : compensationActivityRetentionStateValid program initialState = true := by
    cases present : program.compensationActivityRetention <;>
      simp [compensationActivityRetentionStateValid, retentionDeclared, present, initialState]
  have parallel := startingParallelValid program initialState structural rfl rfl rfl rfl
  unfold runtimeStateWellFormed
  rw [position, compensation, snapshots, retention, parallel]
  simp [initialState, emptyScopedVariables, notStartedStateEmpty, waitOwnersLive, waitIdentitiesUnique,
    waitDeclarationsValid, hiddenRecordDeclarationsValid, canonicalCollectionOrder, orderedBy,
    eventRaceAssociationsValid, effectIncidentAssociationsValid, runtimeStateIdentityBound,
    activityRecordsOwnLiveWork, attachedTimersUnambiguous, attachedMessagesUnambiguous,
    activityIdentitiesUnique, activityBodyClaimsUnique,
    controllersOwnLiveActivity, sequentialMultiInstanceProgramBindingsValid,
    sequentialMultiInstanceControllerProgramBindingsValid,
    sequentialMultiInstanceOperationBindingComplete,
    controllerIdentitiesUnique, controllersNotExhausted, parallelMultiInstanceControllersOrdered]
  intro operation _
  cases operation <;> simp
  split <;> rfl

/-- `RINIT-RAW-01`. The intermediate raw constructor is well-formed only on the declaration-free snapshot domain. Selected-root reservation belongs to actual admission, as specified by `RINIT-START-01`. -/
theorem runningProgramStartState_wellFormed (program : Program) (instanceId : SemanticId)
    (initialVariables : List VariableBinding) (start : RuntimeState)
    (built : runningProgramStartState? program instanceId initialVariables = some start)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (position : runtimePositionValid program instanceId start = true) :
    runtimeStateWellFormed program instanceId start = true := by
  have empty : start.compensationParentContextRetentions = [] := by
    unfold runningProgramStartState? at built
    simp only [Option.bind_eq_bind, Option.bind_eq_some_iff, Option.pure_def,
      Option.some.injEq] at built
    obtain ⟨_, _, rfl⟩ := built
    rfl
  have snapshots : compensationEventSubProcessSnapshotStateValid program start = true := by
    simp [compensationEventSubProcessSnapshotStateValid,
      compensationEventSubProcessSnapshotDeclarationValid, absent, empty]
  simpa using startedWithSnapshots_wellFormed program instanceId initialVariables start
    start.compensationParentContextRetentions built (by simpa using position)
    (by simpa using snapshots)

/-- `RINIT-RAW-01` for the intermediate Message Start constructor. -/
theorem admitMessageStart_wellFormed (program : Program) (state : RuntimeState)
    (processId instanceId startEventId : SemanticId) (channel : MessageChannel)
    (start : RuntimeState)
    (admitted : admitMessageStart? program state processId instanceId startEventId channel
      = some start)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (position : runtimePositionValid program instanceId start = true) :
    runtimeStateWellFormed program instanceId start = true := by
  unfold admitMessageStart? at admitted
  split at admitted
  · split at admitted
    · exact runningProgramStartState_wellFormed program instanceId [] start admitted absent position
    · exact absurd admitted (by simp)
  all_goals exact absurd admitted (by simp)


/-- `RINIT-RAW-01` for the intermediate Timer Start constructor. -/
theorem admitTimerStart_wellFormed (program : Program) (state : RuntimeState)
    (processId instanceId startEventId : SemanticId) (start : RuntimeState)
    (admitted : admitTimerStart? program state processId instanceId startEventId = some start)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (position : runtimePositionValid program instanceId start = true) :
    runtimeStateWellFormed program instanceId start = true := by
  unfold admitTimerStart? at admitted
  split at admitted
  · split at admitted
    · exact runningProgramStartState_wellFormed program instanceId [] start admitted absent position
    · exact absurd admitted (by simp)
  all_goals exact absurd admitted (by simp)

/-- `RSI-OBL-02` / `RINIT-START-01`. The complete invariant holds at the actual committed start boundary, including any selected root reservation. The position premise remains explicit; internal closure and subsequent preservation are outside this theorem. -/
theorem admitStimulusWithCompensationSnapshots_initialStart_wellFormed
    (program : Program) (stimulus : Stimulus) (instanceId : SemanticId)
    (startKind : match stimulus with
      | .startProcess _ _ requested _ | .triggerMessageStart _ _ requested _ _
      | .triggerTimerStart _ _ requested _ => requested = instanceId
      | _ => False)
    (committed : (admitStimulusWithCompensationSnapshots program initialState stimulus).outcome =
      .committed)
    (position : runtimePositionValid program instanceId
      (admitStimulusWithCompensationSnapshots program initialState stimulus).state = true) :
    runtimeStateWellFormed program instanceId
      (admitStimulusWithCompensationSnapshots program initialState stimulus).state = true := by
  cases present : program.compensationEventSubProcessSnapshots with
  | none =>
      have legacy := admitStimulusWithCompensationSnapshots_withoutDeclaration program initialState
        stimulus present
      rw [legacy] at committed position ⊢
      obtain ⟨_, variables, built⟩ := admitStimulus_committed_start_shape program stimulus
        instanceId startKind committed
      exact runningProgramStartState_wellFormed program instanceId variables _ built present position
  | some declaration =>
      have snapshots := admitStimulusWithCompensationSnapshots_committed_stateValid program
        initialState stimulus declaration present committed
      obtain ⟨variables, raw, retentions, built, frame⟩ :=
        admitStimulusWithCompensationSnapshots_committed_start_shape program stimulus instanceId
          startKind committed
      rw [frame] at position snapshots ⊢
      exact startedWithSnapshots_wellFormed program instanceId variables raw retentions built
        position snapshots

/-- `RINIT-LEGACY-01`. Successful legacy admission is declaration-free, so its existing equality with snapshot-aware admission transfers the complete guarantee. -/
theorem admitStimulus_initialStart_wellFormed (program : Program) (stimulus : Stimulus)
    (instanceId : SemanticId)
    (startKind : match stimulus with
      | .startProcess _ _ requested _ | .triggerMessageStart _ _ requested _ _
      | .triggerTimerStart _ _ requested _ => requested = instanceId
      | _ => False)
    (committed : (admitStimulus program initialState stimulus).outcome = .committed)
    (position : runtimePositionValid program instanceId
      (admitStimulus program initialState stimulus).state = true) :
    runtimeStateWellFormed program instanceId
      (admitStimulus program initialState stimulus).state = true := by
  have absent := (admitStimulus_committed_start_shape program stimulus instanceId
    startKind committed).1
  have legacy := admitStimulusWithCompensationSnapshots_withoutDeclaration program initialState
    stimulus absent
  rw [← legacy] at committed position ⊢
  exact admitStimulusWithCompensationSnapshots_initialStart_wellFormed program stimulus instanceId
    startKind committed position

theorem admitStartProcessWithCompensationSnapshots_wellFormed (program : Program)
    (commandId processId instanceId : SemanticId) (variables : List VariableBinding)
    (committed : (admitStimulusWithCompensationSnapshots program initialState
      (.startProcess commandId processId instanceId variables)).outcome = .committed)
    (position : runtimePositionValid program instanceId
      (admitStimulusWithCompensationSnapshots program initialState
        (.startProcess commandId processId instanceId variables)).state = true) :
    runtimeStateWellFormed program instanceId
      (admitStimulusWithCompensationSnapshots program initialState
        (.startProcess commandId processId instanceId variables)).state = true :=
  admitStimulusWithCompensationSnapshots_initialStart_wellFormed program _ instanceId rfl
    committed position

theorem admitMessageStartWithCompensationSnapshots_wellFormed (program : Program)
    (commandId processId instanceId startEventId : SemanticId) (channel : MessageChannel)
    (committed : (admitStimulusWithCompensationSnapshots program initialState
      (.triggerMessageStart commandId processId instanceId startEventId channel)).outcome = .committed)
    (position : runtimePositionValid program instanceId
      (admitStimulusWithCompensationSnapshots program initialState
        (.triggerMessageStart commandId processId instanceId startEventId channel)).state = true) :
    runtimeStateWellFormed program instanceId
      (admitStimulusWithCompensationSnapshots program initialState
        (.triggerMessageStart commandId processId instanceId startEventId channel)).state = true :=
  admitStimulusWithCompensationSnapshots_initialStart_wellFormed program _ instanceId rfl
    committed position

theorem admitTimerStartWithCompensationSnapshots_wellFormed (program : Program)
    (commandId processId instanceId startEventId : SemanticId)
    (committed : (admitStimulusWithCompensationSnapshots program initialState
      (.triggerTimerStart commandId processId instanceId startEventId)).outcome = .committed)
    (position : runtimePositionValid program instanceId
      (admitStimulusWithCompensationSnapshots program initialState
        (.triggerTimerStart commandId processId instanceId startEventId)).state = true) :
    runtimeStateWellFormed program instanceId
      (admitStimulusWithCompensationSnapshots program initialState
        (.triggerTimerStart commandId processId instanceId startEventId)).state = true :=
  admitStimulusWithCompensationSnapshots_initialStart_wellFormed program _ instanceId rfl
    committed position

theorem admitStartProcess_wellFormed (program : Program)
    (commandId processId instanceId : SemanticId) (variables : List VariableBinding)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId variables)).outcome = .committed)
    (position : runtimePositionValid program instanceId
      (admitStimulus program initialState
        (.startProcess commandId processId instanceId variables)).state = true) :
    runtimeStateWellFormed program instanceId
      (admitStimulus program initialState
        (.startProcess commandId processId instanceId variables)).state = true :=
  admitStimulus_initialStart_wellFormed program _ instanceId rfl committed position

theorem admitMessageStartCommitted_wellFormed (program : Program)
    (commandId processId instanceId startEventId : SemanticId) (channel : MessageChannel)
    (committed : (admitStimulus program initialState
      (.triggerMessageStart commandId processId instanceId startEventId channel)).outcome = .committed)
    (position : runtimePositionValid program instanceId
      (admitStimulus program initialState
        (.triggerMessageStart commandId processId instanceId startEventId channel)).state = true) :
    runtimeStateWellFormed program instanceId
      (admitStimulus program initialState
        (.triggerMessageStart commandId processId instanceId startEventId channel)).state = true :=
  admitStimulus_initialStart_wellFormed program _ instanceId rfl committed position

theorem admitTimerStartCommitted_wellFormed (program : Program)
    (commandId processId instanceId startEventId : SemanticId)
    (committed : (admitStimulus program initialState
      (.triggerTimerStart commandId processId instanceId startEventId)).outcome = .committed)
    (position : runtimePositionValid program instanceId
      (admitStimulus program initialState
        (.triggerTimerStart commandId processId instanceId startEventId)).state = true) :
    runtimeStateWellFormed program instanceId
      (admitStimulus program initialState
        (.triggerTimerStart commandId processId instanceId startEventId)).state = true :=
  admitStimulus_initialStart_wellFormed program _ instanceId rfl committed position

end BpmnSemantics.SemanticProcess

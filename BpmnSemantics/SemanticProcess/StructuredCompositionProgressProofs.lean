module

public import BpmnSemantics.SemanticProcess.StructuredCompositionCompletionAvailabilityProofs
public import BpmnSemantics.SemanticProcess.Lowering
public import BpmnSemantics.SemanticProcess.InternalScheduledClosure
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProcessIdentityProofs
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle

/-! SPC-CLOSURE-01 connects reachable lifecycle and data invariants to enabled transitions and exact task-command readiness. Reverse enablement is established before the bounded closure evaluator is assembled. Discovery also requires the selected profile because `ordinaryExecutionFrontier` and `mergeExecutionFrontier` dispatch by profile while structural analysis remains profile-independent. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.StructuredComposition

/-- A token's analyzed consumer is enabled by the actual reachable runtime, including data arming and merge passage. -/
theorem reached_token_has_enabled_consumer
    (program : Program) (analysis : Analysis) (commandId processId instanceId runningId : SemanticId)
    (bindings : List VariableBinding) (reached : RuntimeState) (token : ControlToken)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state reached)
    (running : reached.control = .running runningId) (live : token ∈ reached.tokens) :
    ∃ operation ∈ program.operations, ∃ after, fire? program operation reached = some after := by
  obtain ⟨_, _, _, vertices, _, _, graph⟩ := program_analysis_projection program analysis analyzed
  have startPositions := committed_start_has_input_positions program vertices analysis commandId processId instanceId
    bindings profile committed
  have startBound := committed_start_task_execution_has_at_most_one_control_unit program analysis commandId processId
    instanceId bindings _ profile analyzed committed .initial
  have positions := task_execution_preserves_input_positions program vertices analysis _ reached wellFormed profile
    analyzed graph startPositions startBound reachable
  have valid := committed_start_execution_has_valid_bindings program analysis commandId processId instanceId bindings
    reached profile analyzed committed reachable
  have bounded := committed_start_task_execution_has_at_most_one_control_unit program analysis commandId processId
    instanceId bindings reached profile analyzed committed reachable
  obtain ⟨frame, shape⟩ := reached_state_has_exact_lifecycle program analysis commandId processId instanceId bindings reached
    wellFormed profile analyzed committed reachable
  obtain ⟨owner, startOwned⟩ := committed_start_has_root_owner program commandId processId instanceId bindings profile committed
  have owned := task_execution_preserves_root_ownership program analysis _ reached owner analyzed startOwned startBound reachable
  have tokenRunning : reached.control = .running token.owner.processInstanceId := by
    rw [owned.2.1 token live, root_owner_matches_running_instance reached owner runningId frame owned running]
    exact running
  have single := (live_token_under_bound_is_single reached token bounded live).1
  obtain ⟨target, consumer, _⟩ := positions.1 token live
  obtain ⟨operation, member, uniqueConsumer, consumes, namedConsumer⟩ := consumer_identifies_unique_input_operation program token.placeId target consumer
  clear uniqueConsumer namedConsumer
  have allowed := program_analysis_operations_allowed program analysis analyzed operation member
  obtain ⟨_, _, _, noSnapshots, _⟩ := program_analysis_excludes_foreign_declarations program analysis analyzed
  refine ⟨operation, member, ?_⟩
  cases operation <;> simp only [OperationAllowed] at allowed
  all_goals try contradiction
  all_goals simp only [operationInputs, List.mem_singleton] at consumes
  all_goals try contradiction
  case awaitUserTask id origin input output task =>
    simp [fire_awaitUserTask_withoutSnapshotDeclaration _ _ _ _ _ _ _ noSnapshots,
      awaitUserTaskState?, onlyTokenOwner?, tokenOwners, single, consumes, runningInstance?, running]
  case awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput =>
    obtain ⟨source, available⟩ := reached_data_task_input_is_available program analysis commandId processId instanceId
      bindings reached token id origin input output taskId taskName directInput directOutput wellFormed profile analyzed
      committed reachable member tokenRunning live consumes
    have noScopes := (no_wait_has_no_activity_lifetime program reached shape
      (live_token_under_bound_is_single reached token bounded live).2.1).2
    simp only [fire?, noSnapshots]
    change ∃ after, activateDataInputOutputUserTask? (programPropertyPathValuePolicy program) reached input
      output taskId taskName directInput = some after
    rw [programPropertyPathValuePolicy_eq_scalar (by simp [profile])]
    simp [activateDataInputOutputUserTask?, onlyTokenOwner?, tokenOwners, single, consumes,
      dataInputOutputRunningInstance_of_running running, available, noScopes]
  case choose id origin input candidates output defaultOrigin =>
    obtain ⟨selected, selection⟩ := unique_bindings_make_choice_total reached.variables.process.bindings valid.1 candidates output
    simp [fire_choose_withoutSnapshotDeclaration _ _ _ _ _ _ _ _ noSnapshots,
      chooseState?, onlyTokenOwner?, tokenOwners, single, consumes, selection]
  case mergeExclusive id origin inputs output =>
    rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ noSnapshots,
      mergeExclusiveState_singleton_offer reached inputs output token single consumes]
    exact ⟨_, rfl⟩
  case reachNoneEnd id origin input =>
    simp [fire_reachNoneEnd_withoutSnapshotDeclaration _ _ _ _ _ noSnapshots,
      reachNoneEndState?, onlyTokenOwner?, tokenOwners, single, consumes, runningInstance?, running]


theorem running_pending_root_enables_initiation
    (program : Program) (analysis : Analysis) (state : RuntimeState) (instanceId : SemanticId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (frame : LifecycleFrame state) (running : state.control = .running instanceId)
    (pending : state.initiationPending = true) :
    ∃ operation ∈ program.operations, ∃ after, fire? program operation state = some after := by
  obtain ⟨id, origin, output, member⟩ := admitted_program_has_initiation program analysis wellFormed analyzed
  obtain ⟨_, _, _, noSnapshots, _⟩ := program_analysis_excludes_foreign_declarations program analysis analyzed
  rcases frame.2 with ⟨root, _, scopes⟩ | ⟨_, completed, _⟩
  · refine ⟨.initiate id origin output, member, ?_⟩
    simp only [fire?, noSnapshots]
    change ∃ after, initiateState? state output = some after
    simp [initiateState?, rootScopeOccurrence?, scopes, pending]
  · simp [running] at completed

theorem running_empty_root_enables_completion
    (program : Program) (analysis : Analysis) (state : RuntimeState) (instanceId : SemanticId)
    (root : DefinitionScope) (owner : ScopeOccurrenceId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (definitions : program.definitionScopes = [root]) (rootKey : owner.definitionScopeId = root.id)
    (owned : RootOwnedControl owner state) (frame : LifecycleFrame state)
    (running : state.control = .running instanceId) (pending : state.initiationPending = false)
    (noTokens : state.tokens = []) (noWaits : state.waits = []) :
    ∃ operation ∈ program.operations, ∃ after, fire? program operation state = some after := by
  obtain ⟨id, origin, scope, _, completions, _, _⟩ := program_analysis_projection program analysis analyzed
  have member : SemanticOperation.completeScope id origin scope none ∈ program.operations := by
    have filtered : SemanticOperation.completeScope id origin scope none ∈ program.operations.filter isScopeCompletion :=
      by rw [completions]; simp
    exact (List.mem_filter.mp filtered).1
  obtain ⟨_, definition, _, _, found, _⟩ := programGraphWellFormed_completion_binding program id origin scope none
    (programWellFormed_graph program wellFormed) member
  have same : definition = root := by
    simpa [definitions] using List.mem_of_find?_eq_some found
  have scopeKey : scope = root.id := by
    have key : definition.id = scope := by simpa only [decide_eq_true_eq] using List.find?_some found
    simpa [same] using key.symm
  obtain ⟨_, _, _, noSnapshots, _⟩ := program_analysis_excludes_foreign_declarations program analysis analyzed
  rcases frame.2 with ⟨liveRoot, _, scopes⟩ | ⟨_, completed, _⟩
  · have liveKey : liveRoot = owner := owned.1 { id := liveRoot, parent := none } (by simp [scopes])
    have quiet : scopeQuiescent state liveRoot = true := by
      obtain ⟨messages, timers, effects, incidents, branches, races, calls, _, _, _, _, triggers, _⟩ := frame.1.1
      simp [scopeQuiescent, noTokens, noWaits, messages, timers, effects, incidents, branches, races, calls,
        triggers, scopes]
    refine ⟨.completeScope id origin scope none, member, ?_⟩
    simp only [fire?, noSnapshots]
    change ∃ after, completeSelectedScope? program state scope none = some after
    rw [selected_scope_completion_delegates_to_root program state scope
      (program_analysis_operations_allowed program analysis analyzed)]
    rw [liveKey] at scopes quiet
    simp [completeScopeState?, scopes, rootKey, scopeKey, quiet, completeQuiescentScope?, running, pending]
  · simp [running] at completed


/-- A reached Running state with no enabled raw operation exposes its one exact task lifetime. -/
theorem reached_raw_stable_running_has_task
    (program : Program) (analysis : Analysis) (commandId processId instanceId runningId : SemanticId)
    (bindings : List VariableBinding) (reached : RuntimeState)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state reached)
    (running : reached.control = .running runningId)
    (stable : ∀ operation ∈ program.operations, fire? program operation reached = none) :
    (∃ wait, reached.waits = [wait]) ∧ TaskLifetimeShape program reached := by
  obtain ⟨frame, shape⟩ := reached_state_has_exact_lifecycle program analysis commandId processId instanceId bindings reached
    wellFormed profile analyzed committed reachable
  have bounded := committed_start_task_execution_has_at_most_one_control_unit program analysis commandId processId
    instanceId bindings reached profile analyzed committed reachable
  have notEnabled : ¬∃ operation ∈ program.operations, ∃ after, fire? program operation reached = some after := by
    rintro ⟨operation, member, after, fired⟩
    simp [stable operation member] at fired
  have pending : reached.initiationPending = false := by
    cases pending : reached.initiationPending with
    | false => rfl
    | true => exact False.elim (notEnabled
        (running_pending_root_enables_initiation program analysis reached runningId wellFormed analyzed frame running pending))
  have noTokens : reached.tokens = [] := by
    apply List.eq_nil_iff_forall_not_mem.mpr
    intro token live
    exact notEnabled (reached_token_has_enabled_consumer program analysis commandId processId instanceId runningId
      bindings reached token wellFormed profile analyzed committed reachable running live)
  have hasWait : reached.waits ≠ [] := by
    intro noWaits
    obtain ⟨root, owner, definitions, rootKey, startOwned⟩ := committed_start_has_declared_root_owner program analysis
      commandId processId instanceId bindings profile analyzed committed
    have startBound := committed_start_task_execution_has_at_most_one_control_unit program analysis commandId processId
      instanceId bindings _ profile analyzed committed .initial
    have owned := task_execution_preserves_root_ownership program analysis _ reached owner analyzed startOwned startBound reachable
    exact notEnabled (running_empty_root_enables_completion program analysis reached runningId root owner
      wellFormed analyzed definitions rootKey owned frame running pending noTokens noWaits)
  rcases shape with ⟨noWaits, _⟩ | ⟨wait, operation, singleton, details⟩
  · exact False.elim (hasWait noWaits)
  · exact ⟨⟨wait, singleton⟩, Or.inr ⟨wait, operation, singleton, details⟩⟩


/-- Exact lowering binds flow provenance to the already unique control-place keys; raw Program validation alone does not. -/
theorem lowered_program_has_unique_flow_origins (source : CheckedProcess) (program : Program)
    (wellFormed : programWellFormed program = true) (lowered : program = lowerCheckedProcess source) :
    (program.controlPlaces.map (·.origin.elementId)).Nodup := by
  apply List.Pairwise.of_map (S := (· ≠ ·)) flowControlPlaceId
    (fun _ _ different same => different (congrArg flowControlPlaceId same))
  have keys : (program.controlPlaces.map (·.origin.elementId)).map flowControlPlaceId =
      program.controlPlaces.map (·.id) := by
    simp [lowered, lowerCheckedProcess, CheckedSequenceFlow.toControlPlace, flowControlPlaceId]
  rw [keys]
  exact (admitted_program_has_unique_identity_keys program wellFormed).2

open InternalCommutation

theorem admitted_merge_port_has_provenance
    (program : Program) (id : OperationId) (origin : BpmnElementOrigin)
    (inputs : List ControlPlaceId) (output place : ControlPlaceId) (owner : ScopeOccurrenceId)
    (wellFormed : programWellFormed program = true)
    (origins : (program.controlPlaces.map (·.origin.elementId)).Nodup)
    (member : SemanticOperation.mergeExclusive id origin inputs output ∈ program.operations)
    (port : place ∈ inputs ++ [output])
    (owned : operationOwningScope? program id = some owner.definitionScopeId) :
    ∃ flowOrigin, internalLocalControlPlaceOrigin? program place owner = some flowOrigin := by
  obtain ⟨operations, places⟩ := admitted_program_has_unique_identity_keys program wellFormed
  obtain ⟨scope, declared, operationBinding, portBinding, declaration⟩ :=
    programGraphWellFormed_operationControlPlaceScope program (.mergeExclusive id origin inputs output) place
      (programWellFormed_graph program wellFormed) operations places member rfl port
  change program.operationScopes.filter (fun binding => decide (binding.operationId = id)) =
    [{ operationId := id, scopeId := scope }] at operationBinding
  have same : scope = owner.definitionScopeId := by
    unfold operationOwningScope? at owned
    change (match program.operationScopes.filter (fun binding => decide (binding.operationId = id)) with
      | [binding] => some binding.scopeId | _ => none) = some owner.definitionScopeId at owned
    rw [operationBinding] at owned
    exact Option.some.inj owned
  have declaredMember : declared ∈ program.controlPlaces := by
    have filtered : declared ∈ program.controlPlaces.filter (fun candidate => decide (candidate.id = place)) :=
      by rw [declaration]; simp
    exact (List.mem_filter.mp filtered).1
  have uniqueOrigin := filter_key_eq_singleton_of_nodup program.controlPlaces (·.origin.elementId)
    declared origins declaredMember
  have allNonempty : program.controlPlaces.all (fun place =>
      nonempty place.id.value && nonempty place.origin.elementId.value) = true := by
    simp only [programWellFormed, Bool.and_eq_true] at wellFormed
    grind
  have nonemptyOrigin : declared.origin.elementId.value ≠ "" := by
    have valid := List.all_eq_true.mp allNonempty declared declaredMember
    simp only [Bool.and_eq_true] at valid
    simpa [nonempty] using valid.2
  exact ⟨declared.origin, by simp [internalLocalControlPlaceOrigin?, selectedInputOrigin?,
    declaration, portBinding, same, nonemptyOrigin, uniqueOrigin]⟩

theorem singleton_merge_has_position_delta
    (program : Program) (id : OperationId) (origin : BpmnElementOrigin)
    (inputs : List ControlPlaceId) (input output : ControlPlaceId) (owner : ScopeOccurrenceId)
    (wellFormed : programWellFormed program = true)
    (origins : (program.controlPlaces.map (·.origin.elementId)).Nodup)
    (member : SemanticOperation.mergeExclusive id origin inputs output ∈ program.operations)
    (offered : input ∈ inputs)
    (owned : operationOwningScope? program id = some owner.definitionScopeId) :
    ∃ delta, internalLocalControlPositionDelta? program { owner, consumed := [input], produced := [output] } = some delta := by
  obtain ⟨inputOrigin, inputFound⟩ := admitted_merge_port_has_provenance program id origin inputs output input owner
    wellFormed origins member (List.mem_append_left _ offered) owned
  obtain ⟨outputOrigin, outputFound⟩ := admitted_merge_port_has_provenance program id origin inputs output output owner
    wellFormed origins member (by simp) owned
  by_cases same : input = output
  · simp [internalLocalControlPositionDelta?, same, List.eraseDups_cons, outputFound, List.mapM_cons, List.mapM_nil]
  · simp [internalLocalControlPositionDelta?, List.eraseDups_cons, Ne.symm same, inputFound, outputFound, List.mapM_cons, List.mapM_nil]

theorem singleton_merge_preparation_is_total
    (program : Program) (state : RuntimeState) (token : ControlToken)
    (root : DefinitionScope) (instanceId : SemanticId)
    (id : OperationId) (origin : BpmnElementOrigin) (inputs : List ControlPlaceId) (output : ControlPlaceId)
    (wellFormed : programWellFormed program = true) (noSnapshots : program.compensationEventSubProcessSnapshots = none)
    (owned : operationOwningScope? program id = some token.owner.definitionScopeId)
    (origins : (program.controlPlaces.map (·.origin.elementId)).Nodup)
    (definitions : program.definitionScopes = [root]) (rootKey : token.owner.definitionScopeId = root.id)
    (member : SemanticOperation.mergeExclusive id origin inputs output ∈ program.operations)
    (single : state.tokens = [token]) (offered : token.placeId ∈ inputs)
    (scopes : state.scopeOccurrences = [{ id := token.owner, parent := none }])
    (running : state.control = .running instanceId) (time : state.logicalTimeMs = 0) :
    ∃ prepared, prepareInternalMerge? program state (.mergeExclusive id origin inputs output)
        (.mergeInput id token.owner token.placeId) = some prepared ∧
      applyPreparedInternalTransition? program state (.mergeInput prepared) =
        fire? program (.mergeExclusive id origin inputs output) state := by
  let operation := SemanticOperation.mergeExclusive id origin inputs output
  obtain ⟨delta, deltaFound⟩ := singleton_merge_has_position_delta program id origin inputs token.placeId output
    token.owner wellFormed origins member offered owned
  obtain ⟨operations, places⟩ := admitted_program_has_unique_identity_keys program wellFormed
  obtain ⟨scope, _, operationBinding, _, _⟩ := programGraphWellFormed_operationControlPlaceScope program operation token.placeId
    (programWellFormed_graph program wellFormed) operations places member rfl (List.mem_append_left _ offered)
  change program.operationScopes.filter (fun binding => decide (binding.operationId = id)) =
    [{ operationId := id, scopeId := scope }] at operationBinding
  have scopeKey : scope = token.owner.definitionScopeId := by
    have found := owned
    change (match program.operationScopes.filter (fun binding => decide (binding.operationId = id)) with
      | [binding] => some binding.scopeId | _ => none) = some token.owner.definitionScopeId at found
    rw [operationBinding] at found
    exact Option.some.inj found
  obtain ⟨processId, processFound⟩ := candidateProcessIdForDefinitionScope_total program wellFormed root (by simp [definitions])
  rw [← rootKey] at processFound
  have identityFound := candidateOperationFlowNodeIdentity_of_exact_selection program operation token.owner origin.elementId
    processId { operationId := id, scopeId := scope }
    (filter_key_eq_singleton_of_nodup program.operations (·.id) operation operations member)
    operationBinding scopeKey processFound
  have valid := List.all_eq_true.mp (programWellFormed_operations program wellFormed) operation member
  change (((nonempty id.value && nonempty origin.elementId.value) && _) && _ && !inputs.contains output && _ && _) = true at valid
  simp only [Bool.and_eq_true] at valid
  have nonemptyOrigin : origin.elementId.value ≠ "" := by simpa [nonempty] using valid.1.1.1.1.1.2
  have different : token.placeId ≠ output := by
    have absent : output ∉ inputs := by simpa using valid.1.1.2
    intro equal
    exact absent (equal ▸ offered)
  let selected : InternalMergeSelection := { operation, owner := token.owner, input := token.placeId, output }
  let prepared := makeInternalMergePreparation state selected instanceId { processId, elementId := origin.elementId, owner := token.owner } delta
  have ready : prepareInternalMerge? program state operation (.mergeInput id token.owner token.placeId) = some prepared := by
    simp [prepareInternalMerge?, selectInternalMerge?, operation, offered, single, runningInstance?, running,
      noSnapshots, exactLiveOccurrence, scopes, nonemptyOrigin, time, SemanticProcessJson.isSafeWireNat,
      internalLocalControlTokensAvailable, InternalMergeSelection.tokens, different, Ne.symm different,
      SemanticOperation.origin, SemanticProcessJson.maxSafeWireNat, identityFound, deltaFound, prepared, selected]
  refine ⟨prepared, ready, ?_⟩
  rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ noSnapshots,
    mergeExclusiveState_singleton_offer state inputs output token single offered]
  simp [applyPreparedInternalTransition?, noSnapshots, PreparedInternalTransition.Prepared, prepared,
    makeInternalMergePreparation, selected, InternalMergeSelection.alternative, operation, SemanticOperation.id, ready,
    PreparedInternalTransition.apply, InternalMergeSelection.apply, InternalMergeSelection.tokens,
    TokenPatch.apply, removeTokens, addTokens, single, removeToken, addToken, canonicalInsertBy]

/-- An enabled admitted operation belongs to exactly one control phase, with a concrete consumed token in the routing phase. -/
theorem admitted_enabled_operation_has_phase
    (program : Program) (analysis : Analysis) (before after : RuntimeState)
    (operation : SemanticOperation) (root : ScopeOccurrenceId)
    (analyzed : programAnalysis program = some analysis) (member : operation ∈ program.operations)
    (bounded : ControlUnitBound before) (owned : RootOwnedControl root before)
    (fired : fire? program operation before = some after) :
    (before.initiationPending = true ∧ (match operation with | .initiate .. => true | _ => false) = true) ∨
    (∃ token, before.tokens = [token] ∧ token.placeId ∈ operationInputs operation) ∨
    (before.initiationPending = false ∧ before.tokens = [] ∧ isScopeCompletion operation = true) := by
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have selected := allowed operation member
  have step := fire_sound program operation before after fired
  have tokenPhase : ∀ input owner, onlyTokenOwner? before input = some owner →
      ∃ token, before.tokens = [token] ∧ token.placeId = input := by
    intro input owner found
    obtain ⟨token, single, _, _⟩ := enabled_token_under_bound_is_single before input owner bounded found
    exact ⟨token, single, (singleton_token_owner before token input owner single found).1⟩
  cases operation <;> simp only [OperationAllowed] at selected
  all_goals try contradiction
  case initiate id origin output =>
    cases step with
    | initiate _ _ _ _ _ active =>
      obtain ⟨_, _, active⟩ := Option.bind_eq_some_iff.mp active
      split at active
      · exact Or.inl ⟨by assumption, rfl⟩
      · contradiction
  case awaitUserTask id origin input output task =>
    cases step with
    | awaitUserTask _ _ _ _ _ _ _ active =>
      obtain ⟨owner, found, _⟩ := Option.bind_eq_some_iff.mp active
      obtain ⟨token, single, key⟩ := tokenPhase input owner found
      exact Or.inr (Or.inl ⟨token, single, by simp [operationInputs, key]⟩)
  case awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput =>
    cases step with
    | awaitDataInputOutputUserTask _ _ _ _ _ _ _ _ _ _ active =>
      obtain ⟨owner, found, _⟩ := Option.bind_eq_some_iff.mp active
      obtain ⟨token, single, key⟩ := tokenPhase input owner found
      exact Or.inr (Or.inl ⟨token, single, by simp [operationInputs, key]⟩)
  case choose id origin input candidates output defaultOrigin =>
    cases step with
    | choose _ _ _ _ _ _ _ _ active =>
      obtain ⟨owner, found, _⟩ := Option.bind_eq_some_iff.mp active
      obtain ⟨token, single, key⟩ := tokenPhase input owner found
      exact Or.inr (Or.inl ⟨token, single, by simp [operationInputs, key]⟩)
  case reachNoneEnd id origin input =>
    cases step with
    | reachNoneEnd _ _ _ _ _ active =>
      obtain ⟨owner, found, _⟩ := Option.bind_eq_some_iff.mp active
      obtain ⟨token, single, key⟩ := tokenPhase input owner found
      exact Or.inr (Or.inl ⟨token, single, by simp [operationInputs, key]⟩)
  case mergeExclusive id origin inputs output =>
    have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
    rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ absent] at fired
    unfold mergeExclusiveState? at fired
    split at fired
    · rename_i token singleton
      have present : token ∈ exclusiveMergeInputTokens before inputs := by rw [singleton]; simp
      obtain ⟨live, port⟩ := List.mem_filter.mp present
      change inputs.contains token.placeId = true at port
      exact Or.inr (Or.inl ⟨token, (live_token_under_bound_is_single before token bounded live).1,
        by simpa [operationInputs] using port⟩)
    · contradiction
  case completeScope id origin scope output =>
    cases output with
    | some output => contradiction
    | none =>
      cases step with
      | completeScope _ _ _ _ _ _ completed =>
        change completeSelectedScope? program before scope none = some after at completed
        rw [selected_scope_completion_delegates_to_root program before scope allowed] at completed
        unfold completeScopeState? at completed
        split at completed
        · rename_i occurrence selectedScope
          have occurrenceMember : occurrence ∈ before.scopeOccurrences.filter (fun candidate =>
              decide (candidate.id.definitionScopeId = scope)) := by rw [selectedScope]; simp
          have same := owned.1 occurrence (List.mem_filter.mp occurrenceMember).1
          split at completed
          · contradiction
          · rename_i quiet
            have noTokens : before.tokens = [] := by
              apply List.eq_nil_iff_forall_not_mem.mpr
              intro token live
              have present : (before.tokens.any fun token => token.owner == occurrence.id) = true :=
                List.any_eq_true.mpr ⟨token, live, by simp [owned.2.1 token live, same]⟩
              simp [scopeQuiescent, present] at quiet
            unfold completeQuiescentScope? at completed
            split at completed
            · split at completed
              · contradiction
              · exact Or.inr (Or.inr ⟨by simpa using (show ¬before.initiationPending = true from by assumption), noTokens, rfl⟩)
            · contradiction
            · contradiction
        · contradiction

theorem admitted_enabled_operation_is_unique
    (program : Program) (analysis : Analysis) (state leftAfter rightAfter : RuntimeState)
    (left right : SemanticOperation) (root : ScopeOccurrenceId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (bounded : ControlUnitBound state) (owned : RootOwnedControl root state)
    (consumers : ∀ token ∈ state.tokens, ∃ target, consumer? program token.placeId = some target)
    (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (leftFired : fire? program left state = some leftAfter) (rightFired : fire? program right state = some rightAfter) :
    left = right := by
  have phase := fun operation after member fired =>
    admitted_enabled_operation_has_phase program analysis state after operation root analyzed member bounded owned fired
  have singletonSame (predicate : SemanticOperation → Bool)
      (count : (program.operations.filter predicate).length = 1)
      (leftSelected : predicate left = true) (rightSelected : predicate right = true) : left = right := by
    obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp count
    have l := List.mem_filter.mpr ⟨leftMember, leftSelected⟩
    have r := List.mem_filter.mpr ⟨rightMember, rightSelected⟩
    rw [singleton] at l r
    exact (List.eq_of_mem_singleton l).trans (List.eq_of_mem_singleton r).symm
  by_cases pending : state.initiationPending = true
  · have initiation : ∀ operation after, operation ∈ program.operations → fire? program operation state = some after →
        (match operation with | .initiate .. | .initiateMessage .. | .initiateTimer .. => true | _ => false) = true := by
      intro operation after member fired
      rcases phase operation after member fired with ⟨_, kind⟩ | ⟨token, single, _⟩ | ⟨done, _⟩
      · cases operation <;> simp_all
      · simp [ControlUnitBound, pending, single] at bounded
      · simp [pending] at done
    have count : (program.operations.filter (fun operation => match operation with
        | .initiate .. | .initiateMessage .. | .initiateTimer .. => true | _ => false)).length = 1 := by
      simp only [programWellFormed, Bool.and_eq_true] at wellFormed
      exact of_decide_eq_true wellFormed.1.1.1.1.2
    exact singletonSame _ count (initiation left leftAfter leftMember leftFired) (initiation right rightAfter rightMember rightFired)
  · by_cases empty : state.tokens = []
    · have completion : ∀ operation after, operation ∈ program.operations → fire? program operation state = some after →
          isScopeCompletion operation = true := by
        intro operation after member fired
        rcases phase operation after member fired with ⟨pending, _⟩ | ⟨token, single, _⟩ | ⟨_, _, kind⟩
        · contradiction
        · simp [empty] at single
        · exact kind
      obtain ⟨_, _, _, _, completions, _⟩ := program_analysis_projection program analysis analyzed
      exact singletonSame isScopeCompletion (by rw [completions]; rfl)
        (completion left leftAfter leftMember leftFired) (completion right rightAfter rightMember rightFired)
    · have tokenConsumer : ∀ operation after, operation ∈ program.operations → fire? program operation state = some after →
          ∃ token, state.tokens = [token] ∧ token.placeId ∈ operationInputs operation := by
        intro operation after member fired
        rcases phase operation after member fired with ⟨pending, _⟩ | token | ⟨_, empty, _⟩
        · contradiction
        · exact token
        · contradiction
      obtain ⟨token, single, leftPort⟩ := tokenConsumer left leftAfter leftMember leftFired
      obtain ⟨other, otherSingle, rightPort⟩ := tokenConsumer right rightAfter rightMember rightFired
      have same : other = token := by simpa using otherSingle.symm.trans single
      rw [same] at rightPort
      obtain ⟨target, consumer⟩ := consumers token (by simp [single])
      obtain ⟨_, _, singleton, _⟩ := consumer_identifies_unique_input_operation program token.placeId target consumer
      exact singletonSame (fun operation => (operationInputs operation).contains token.placeId)
        (by rw [singleton]; rfl) (by simpa using leftPort) (by simpa using rightPort)

theorem refused_operation_has_empty_discovery
    (program : Program) (analysis : Analysis) (state : RuntimeState) (operation : SemanticOperation)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis) (bounded : ControlUnitBound state)
    (refused : fire? program operation state = none) :
    (match operation, state.control with
      | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
      | _, _ => ordinaryExecutionFrontier program state operation) = {} := by
  have merge := isMergeTargetOperation_eq_false_of_profile program operation
    (by simp [profile, structuredCompositionCheckpointProfileId])
  have ordinary : ordinaryExecutionFrontier program state operation = {} := by
    simp [ordinaryExecutionFrontier, profile, structuredCompositionCheckpointProfileId, refused, merge]
  cases operation <;> try exact ordinary
  case mergeExclusive id origin inputs output =>
    cases control : state.control <;> try exact ordinary
    case running instanceId =>
      obtain ⟨_, _, _, noSnapshots, _⟩ := program_analysis_excludes_foreign_declarations program analysis analyzed
      have empty : exclusiveMergeInputTokens state inputs = [] := by
        apply List.eq_nil_iff_forall_not_mem.mpr
        intro token present
        obtain ⟨live, port⟩ := List.mem_filter.mp present
        change inputs.contains token.placeId = true at port
        have single := (live_token_under_bound_is_single state token bounded live).1
        rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ noSnapshots,
          mergeExclusiveState_singleton_offer state inputs output token single (by simpa using port)] at refused
        contradiction
      simp [mergeExecutionFrontier, profile, structuredCompositionCheckpointProfileId, internalMergeInputAlternatives, empty, List.mapM_nil,
        InternalCommutation.sortBy]

theorem enabled_operation_has_singleton_discovery
    (program : Program) (analysis : Analysis) (state after : RuntimeState) (operation : SemanticOperation)
    (root : DefinitionScope) (owner : ScopeOccurrenceId)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (origins : (program.controlPlaces.map (·.origin.elementId)).Nodup)
    (definitions : program.definitionScopes = [root]) (rootKey : owner.definitionScopeId = root.id)
    (frame : LifecycleFrame state) (bounded : ControlUnitBound state) (owned : RootOwnedControl owner state)
    (member : operation ∈ program.operations) (fired : fire? program operation state = some after) :
    ∃ offer : InternalExecutionOffer, offer.operation = operation ∧ offer.successor = after ∧
      (∀ prepared, offer.preparation = some prepared → prepared.alternative = offer.alternative) ∧
      (match operation, state.control with
        | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
        | _, _ => ordinaryExecutionFrontier program state operation) = { offers := [offer] } := by
  have phase := admitted_enabled_operation_has_phase program analysis state after operation owner analyzed member bounded owned fired
  have merge := isMergeTargetOperation_eq_false_of_profile program operation
    (by simp [profile, structuredCompositionCheckpointProfileId])
  have ordinary (selected : (match operation with | .reachNoneEnd .. => (selectInternalEnd? state operation).isSome | _ => true) = true) :
      ∃ offer : InternalExecutionOffer, offer.operation = operation ∧ offer.successor = after ∧
        (∀ prepared, offer.preparation = some prepared → prepared.alternative = offer.alternative) ∧
        ordinaryExecutionFrontier program state operation = { offers := [offer] } :=
    ⟨{ alternative := .operation operation.id, operation, successor := after,
       preparation := prepareInternalTransition? program state operation }, rfl, rfl,
      fun prepared found => prepareInternalTransition_alternative program state operation prepared found,
      by simp [ordinaryExecutionFrontier, profile, structuredCompositionCheckpointProfileId, fired, merge]; cases operation <;> exact selected⟩
  cases operation
  all_goals try exact ordinary rfl
  case reachNoneEnd id origin input =>
    obtain ⟨token, single, port⟩ : ∃ token, state.tokens = [token] ∧ token.placeId = input := by
      simpa [operationInputs, isScopeCompletion] using phase
    exact ordinary (by simp [selectInternalEnd?, single, port])
  case mergeExclusive id origin inputs output =>
    cases control : state.control
    all_goals try exact ordinary rfl
    case running instanceId =>
      obtain ⟨token, single, port⟩ : ∃ token, state.tokens = [token] ∧ token.placeId ∈ inputs := by
        simpa [operationInputs, isScopeCompletion] using phase
      have tokenOwner := owned.2.1 token (by simp [single])
      have scopes : state.scopeOccurrences = [{ id := token.owner, parent := none }] := by
        rcases frame.2 with ⟨live, _, scopes⟩ | ⟨_, completed, _⟩
        · have liveOwner := owned.1 { id := live, parent := none } (by simp [scopes])
          change live = owner at liveOwner
          simpa [liveOwner, tokenOwner] using scopes
        · simp [control] at completed
      obtain ⟨prepared, ready, applied⟩ := singleton_merge_preparation_is_total program state token root instanceId
        id origin inputs output wellFormed (program_analysis_excludes_foreign_declarations program analysis analyzed).2.2.2.1
        (by rw [tokenOwner, rootKey]; exact admitted_operations_share_declared_root program analysis root wellFormed analyzed definitions _ member)
        origins definitions (by simpa [tokenOwner] using rootKey)
        member single port scopes control frame.1.2
      rw [fired] at applied
      have alternatives : internalMergeInputAlternatives state (.mergeExclusive id origin inputs output) =
          [.mergeInput id token.owner token.placeId] := by
        unfold internalMergeInputAlternatives
        have selected : exclusiveMergeInputTokens state inputs = [token] := by
          change state.tokens.filter (fun candidate => inputs.contains candidate.placeId) = [token]
          simp [single, port]
        simp [selected, List.eraseDups_cons, InternalCommutation.sortBy, InternalCommutation.sortInsertBy]
      refine ⟨{
        alternative := .mergeInput id token.owner token.placeId
        operation := .mergeExclusive id origin inputs output
        successor := after, preparation := some (.mergeInput prepared) }, rfl, rfl, ?_, ?_⟩
      · intro candidate found
        cases Option.some.inj found
        obtain ⟨_, selected, _, _, _, selection, _, _, _, _, _, _, _, same⟩ :=
          prepareInternalMerge_facts program state _ _ prepared ready
        rw [same]
        exact (selectInternalMerge_facts state _ _ selected selection).2.1
      · simp [mergeExecutionFrontier, profile, structuredCompositionCheckpointProfileId, alternatives, List.mapM_cons, List.mapM_nil, ready, applied]

/-- The actual scheduler discovers exactly the raw stable state or its unique faithful enabled offer. -/
theorem admitted_frontier_is_complete
    (program : Program) (analysis : Analysis) (state : RuntimeState) (root : DefinitionScope) (owner : ScopeOccurrenceId)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (origins : (program.controlPlaces.map (·.origin.elementId)).Nodup)
    (definitions : program.definitionScopes = [root]) (rootKey : owner.definitionScopeId = root.id)
    (frame : LifecycleFrame state) (bounded : ControlUnitBound state) (owned : RootOwnedControl owner state)
    (consumers : ∀ token ∈ state.tokens, ∃ target, consumer? program token.placeId = some target) :
    (deriveInternalExecutionFrontier program state = {} ∧ ∀ operation ∈ program.operations, fire? program operation state = none) ∨
    ∃ offer : InternalExecutionOffer, offer.operation ∈ program.operations ∧
      fire? program offer.operation state = some offer.successor ∧
      (∀ prepared, offer.preparation = some prepared → prepared.alternative = offer.alternative) ∧
      deriveInternalExecutionFrontier program state = { offers := [offer] } := by
  classical
  by_cases enabled : ∃ operation ∈ program.operations, ∃ after, fire? program operation state = some after
  · obtain ⟨operation, member, after, fired⟩ := enabled
    obtain ⟨offer, operationEq, successorEq, aligned, discovered⟩ := enabled_operation_has_singleton_discovery
      program analysis state after operation root owner profile wellFormed analyzed origins definitions rootKey frame bounded owned member fired
    have active : (match state.control with | .cancelled _ | .failed .. => false | _ => true) = true := by
      rcases frame.2 with ⟨_, control, _⟩ | ⟨_, control, _⟩ <;> simp [control]
    have unique : program.operations.Nodup := List.Pairwise.of_map (S := (· ≠ ·)) (·.id)
      (fun _ _ different same => different (congrArg SemanticOperation.id same))
      (admitted_program_has_unique_identity_keys program wellFormed).1
    refine Or.inr ⟨offer, by simpa [operationEq] using member, by simpa [operationEq, successorEq] using fired, aligned, ?_⟩
    apply deriveInternalExecutionFrontier_singleton program state operation offer active unique member discovered
    intro candidate candidateMember different
    apply refused_operation_has_empty_discovery program analysis state candidate profile analyzed bounded
    cases found : fire? program candidate state with
    | none => rfl
    | some successor => exact False.elim (different (admitted_enabled_operation_is_unique program analysis state successor after
        candidate operation owner wellFormed analyzed bounded owned consumers candidateMember member found fired))
  · have stable : ∀ operation ∈ program.operations, fire? program operation state = none := by
      intro operation member
      cases found : fire? program operation state with
      | none => rfl
      | some after => exact False.elim (enabled ⟨operation, member, after, found⟩)
    exact Or.inl ⟨deriveInternalExecutionFrontier_empty program state (fun operation member =>
      refused_operation_has_empty_discovery program analysis state operation profile analyzed bounded (stable operation member)), stable⟩

/-- Exact lowering and actual reachability make the existing rank bound sufficient for successful scheduled closure and raw stability. -/
theorem reached_scheduled_closure_is_bounded
    (source : CheckedProcess) (program : Program) (analysis : Analysis)
    (startCommandId commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (wellFormed : programWellFormed program = true) (lowered : program = lowerCheckedProcess source)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState (.startProcess startCommandId processId instanceId bindings)).outcome = .committed)
    (fuel index ordinal : Nat) (reached : RuntimeState)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess startCommandId processId instanceId bindings)).state reached)
    (within : runtimeBurstRank program analysis reached ≤ fuel) :
    let closed := closeScheduledTraced fuel program commandId index ordinal [] reached
    closed.failed = false ∧ TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess startCommandId processId instanceId bindings)).state closed.state ∧
      (∀ operation ∈ program.operations, fire? program operation closed.state = none) ∧
      ((∃ completedId, closed.state.control = .completed completedId) ∨
        ∃ wait ∈ closed.state.waits, ∃ completionBindings,
          (admitStimulus program closed.state (.completeUserTaskInstance commandId {
            processInstanceId := wait.processInstanceId, elementId := ⟨wait.task.id.value⟩,
            activation := wait.activation } completionBindings)).outcome = .committed) := by
  obtain ⟨_, _, _, vertices, _, _, graph⟩ := program_analysis_projection program analysis analyzed
  have positions := committed_start_has_input_positions program vertices analysis startCommandId processId instanceId bindings profile committed
  have startBound := committed_start_task_execution_has_at_most_one_control_unit program analysis startCommandId processId instanceId
    bindings _ profile analyzed committed .initial
  obtain ⟨root, owner, definitions, rootKey, startOwned⟩ := committed_start_has_declared_root_owner program analysis
    startCommandId processId instanceId bindings profile analyzed committed
  have origins := lowered_program_has_unique_flow_origins source program wellFormed lowered
  induction fuel using Nat.strongRecOn generalizing index ordinal reached with
  | ind fuel ih =>
    have frame := (reached_state_has_exact_lifecycle program analysis startCommandId processId instanceId bindings reached
      wellFormed profile analyzed committed reachable).1
    have bounded := task_execution_reachable_preserves_control_unit_bound program analysis _ reached analyzed startBound reachable
    have owned := task_execution_preserves_root_ownership program analysis _ reached owner analyzed startOwned startBound reachable
    have reachedPositions := task_execution_preserves_input_positions program vertices analysis _ reached wellFormed profile
      analyzed graph positions startBound reachable
    rcases admitted_frontier_is_complete program analysis reached root owner profile wellFormed analyzed origins definitions rootKey
      frame bounded owned (fun token live => let ⟨target, found, _⟩ := reachedPositions.1 token live; ⟨target, found⟩) with
      ⟨frontier, stable⟩ | ⟨offer, member, fired, aligned, frontier⟩
    · simp only [closeScheduledTraced_stable fuel program commandId index ordinal reached frontier]
      rcases frame.2 with ⟨liveOwner, running, _⟩ | ⟨completedId, completed, _⟩
      · obtain ⟨⟨wait, waits⟩, _⟩ := reached_raw_stable_running_has_task program analysis startCommandId processId instanceId
          liveOwner.processInstanceId bindings reached wellFormed profile analyzed committed reachable running stable
        have ready := reached_task_has_admitted_completion program analysis startCommandId commandId processId instanceId
          bindings reached wellFormed profile analyzed committed reachable (by simp [waits])
        exact ⟨rfl, reachable, stable, Or.inr ready⟩
      · exact ⟨rfl, reachable, stable, Or.inl ⟨completedId, completed⟩⟩
    · have decreased := reached_fire_decreases_burst_rank program analysis startCommandId processId instanceId bindings
        reached offer.successor offer.operation wellFormed profile analyzed committed reachable member fired
      have selected : program.operations.find? (fun operation => decide (operation.id = offer.operation.id)) = some offer.operation := by
        rw [← List.head?_filter, filter_key_eq_singleton_of_nodup program.operations (·.id) offer.operation
          (admitted_program_has_unique_identity_keys program wellFormed).1 member]
        rfl
      have nextReach := TaskExecutionReachable.step offer.operation.id reachable
        (show step program reached offer.operation.id = some offer.successor by simp [step, selected, fired])
      cases fuel with
      | zero => omega
      | succ remaining =>
        have tail := ih remaining (by omega) (index := index + 1) (ordinal := ordinal) (reached := offer.successor) nextReach (by omega)
        have equations := closeScheduledTraced_singleton_step remaining program commandId index ordinal reached offer frontier aligned
        change (closeScheduledTraced (remaining + 1) program commandId index ordinal [] reached).failed = false ∧ _
        rw [equations.2, equations.1]
        exact tail

end BpmnSemantics.SemanticProcess.StructuredComposition

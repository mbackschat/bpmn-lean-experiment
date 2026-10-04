import BpmnSemantics.SemanticProcess.SerialBusinessTaskDataProofs
import BpmnSemantics.SemanticProcess.Execution
import BpmnSemantics.SemanticProcess.StructuredCompositionLifecycleProofs

/-! SBT-RESULT-01 and SBT-REFUSE-01 expose actual atomic completion and predecessor-preserving refusal. The unified reachable invariant uses the exact root lifetime, foreign-state absence and issuance frame preserved by these real transitions. -/

namespace BpmnSemantics.SemanticProcess

/-- Input arming preserves the containing context; only the new occurrence owns its snapshot. -/
theorem serial_activation_preserves_process (state : RuntimeState)
    (instanceId : SemanticId) (owner : ScopeOccurrenceId) (input output : ControlPlaceId)
    (effect : EffectDefinition) :
    (activateEffect state instanceId owner input output effect none).variables.process =
      state.variables.process := rfl

inductive SerialEffectCompletionStep (program : Program) :
    RuntimeState → EffectOccurrenceId → EffectExecutionResult → RuntimeState → Prop where
  | commit (state : RuntimeState) (effectId : EffectOccurrenceId) (wait : EffectWait)
      (scope : ActivityVariableScope) (patch bindings : List VariableBinding)
      (occurrence : state.effectWaits.filter (effectOccurrenceMatches effectId) = [wait])
      (owner : state.variables.activities.filter (activityScopeMatches effectId) = [scope])
      (mapping : serialEffectPatch? (SerialBusinessTask.programHandlers program)
        wait.outputMappings state.variables.process.bindings patch = some bindings) :
      SerialEffectCompletionStep program state effectId (.success patch)
        { state with
          effectWaits := state.effectWaits.erase wait
          variables := { state.variables with
            process := { bindings }
            activities := state.variables.activities.filter (fun activity => !activityScopeMatches effectId activity) }
          tokens := addToken state.tokens wait.output wait.owner }

/-- Successful completion exposes unique occurrence/local ownership, a complete validated mapping, cleanup and the exact continuation place. -/
theorem completeSerialEffect_sound (program : Program) (before after : RuntimeState)
    (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (completed : completeSerialEffect? program before effectId result = some after) :
    SerialEffectCompletionStep program before effectId result after := by
  unfold completeSerialEffect? at completed
  split at completed
  · rename_i wait selected
    obtain ⟨variables, mapped, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeSerialActivityScope? at mapped
    split at mapped
    · rename_i scope patch owned resultEq
      obtain ⟨bindings, mapping, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      cases mapped
      cases completed
      exact .commit before effectId wait _ _ bindings selected (by assumption) mapping
    · contradiction
  · contradiction


/-- Whole-stimulus refusal never exposes speculative mapped output or continuation state. -/
theorem serial_refused_command_preserves_every_field (fuel : Nat) (program : Program)
    (state : RuntimeState) (stimulus : Stimulus)
    (refused : admitStimulus program state stimulus = { outcome := .rejected, state }) :
    (applyStimulus fuel program state stimulus).state = state := by
  rw [applyStimulus_rejected_of_admission fuel program state stimulus refused]


/-- New profile admission checks its current snapshot and root associations before dispatching any command. -/
theorem serial_committed_ingress_has_checked_predecessor (program : Program)
    (state : RuntimeState) (stimulus : Stimulus)
    (committed : (admitStimulus program state stimulus).outcome = .committed) :
    serialBusinessCommandAdmitted program state stimulus = true := by
  cases declarations : program.compensationEventSubProcessSnapshots with
  | some declaration => simp [admitStimulus, declarations] at committed
  | none =>
      cases accepted : serialBusinessCommandAdmitted program state stimulus with
      | false => simp [admitStimulus, declarations, accepted] at committed
      | true => rfl

namespace SerialBusinessTask

theorem admitted_serial_guard_has_no_foreign_effects (program : Program) (before : RuntimeState)
    (stimulus : Stimulus) (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (guarded : serialBusinessCommandAdmitted program before stimulus = true) :
    before.effectIncidents = [] ∧ before.compensationHandlerEffectWaits = [] := by
  unfold serialBusinessCommandAdmitted at guarded
  rw [show (program.identity.semanticProfile != serialBusinessTaskProfileId) = false from by rw [profile]; rfl] at guarded
  simp only [Bool.false_and, Bool.false_eq_true, ↓reduceIte, Bool.and_eq_true] at guarded
  have joined := guarded.1.1.2
  dsimp only [serialRuntimeAssociationsValid] at joined
  simp only [Bool.and_eq_true] at joined
  exact ⟨List.isEmpty_iff.mp joined.1.1.1.1.1.1.1.1.1.1.2,
    List.isEmpty_iff.mp joined.1.1.1.1.2⟩

theorem guarded_program_admission (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (guarded : serialBusinessCommandAdmitted program state stimulus = true) : programWellFormed program = true ∧ programProfileCapabilitiesValid program = true := by
  unfold serialBusinessCommandAdmitted at guarded
  rw [show (program.identity.semanticProfile != serialBusinessTaskProfileId) = false from by rw [profile]; rfl] at guarded
  simp only [Bool.false_and, Bool.false_eq_true, ↓reduceIte, Bool.and_eq_true] at guarded
  exact guarded.1.1.1.1

theorem guarded_start_instance_nonempty (program : Program) (state : RuntimeState)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (guarded : serialBusinessCommandAdmitted program state
      (.startProcess commandId processId instanceId bindings) = true) : instanceId.value ≠ "" := by
  unfold serialBusinessCommandAdmitted at guarded
  rw [show (program.identity.semanticProfile != serialBusinessTaskProfileId) = false from by rw [profile]; rfl] at guarded
  simp only [Bool.false_and, Bool.false_eq_true, ↓reduceIte, Bool.and_eq_true] at guarded
  have nonempty : instanceId.value.isEmpty = false := by simpa using guarded.2
  intro empty
  simp [empty] at nonempty

/-- Admission's single identity census includes every control-place origin, which the runtime projection resolves independently of port IDs. -/
theorem program_places_unique_origins (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    (program.controlPlaces.map (·.origin.elementId.value)).Nodup := by
  unfold programAnalysis at analyzed
  split at analyzed
  · contradiction
  · obtain ⟨completion, selected, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
    cases completion <;> try simp only at analyzed
    all_goals try contradiction
    case completeScope id origin scope output =>
      cases output with
      | some output => contradiction
      | none =>
          dsimp only at analyzed
          split at analyzed
          · contradiction
          · rename_i unique
            simp only [bne_iff_ne, Classical.not_not] at unique
            have distinct := StructuredComposition.equal_deduplicated_length_has_unique_names _ unique
            exact (List.nodup_append.mp (List.nodup_cons.mp distinct).2).2.1



theorem declared_place_unique_origin (program : Program) (analysis : Analysis) (place : ControlPlace)
    (analyzed : programAnalysis program = some analysis) (member : place ∈ program.controlPlaces) :
    program.controlPlaces.filter (fun candidate => decide (candidate.origin = place.origin)) = [place] := by
  apply refined_unique_filter program.controlPlaces (fun candidate => decide (candidate.origin.elementId.value = place.origin.elementId.value))
    (fun candidate => decide (candidate.origin = place.origin)) place
  · exact filter_key_eq_singleton_of_nodup _ _ _ (program_places_unique_origins program analysis analyzed) member
  · intro candidate _ same
    simp only [decide_eq_true_eq] at same ⊢
    rw [same]
  · simp

/-- The exact token port binding is carried operationally from the admitted root through each real continuation. -/
def DeclaredToken (program : Program) (token : ControlToken) : Prop :=
  (∃ place, program.controlPlaces.filter (fun candidate => decide (candidate.id = token.placeId)) = [place]) ∧
  program.controlPlaceScopes.filter (fun binding => decide (binding.controlPlaceId = token.placeId)) =
    [{ controlPlaceId := token.placeId, scopeId := token.owner.definitionScopeId }]

theorem owned_operation_port (program : Program) (operation : SemanticOperation) (port : ControlPlaceId)
    (owner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (member : operation ∈ program.operations) (shared : operationControlPlacesShareOwner operation = true)
    (included : port ∈ operationControlPlaces operation)
    (owned : operationOwningScope? program operation.id = some owner.definitionScopeId) :
    DeclaredToken program ⟨port, owner⟩ := by
  obtain ⟨operations, places⟩ := StructuredComposition.admitted_program_has_unique_identity_keys program wellFormed
  obtain ⟨scope, place, declared, bound, found⟩ := programGraphWellFormed_operationControlPlaceScope program
    operation port (programWellFormed_graph program wellFormed) operations places member shared included
  have same : scope = owner.definitionScopeId := by simpa [operationOwningScope?, declared] using owned
  exact ⟨⟨place, found⟩, by simpa [same] using bound⟩

theorem token_operation_owned (program : Program) (operation : SemanticOperation) (token : ControlToken)
    (wellFormed : programWellFormed program = true) (member : operation ∈ program.operations)
    (shared : operationControlPlacesShareOwner operation = true)
    (included : token.placeId ∈ operationControlPlaces operation) (bound : DeclaredToken program token) :
    operationOwningScope? program operation.id = some token.owner.definitionScopeId := by
  obtain ⟨operations, places⟩ := StructuredComposition.admitted_program_has_unique_identity_keys program wellFormed
  obtain ⟨scope, _, declared, portScope, _⟩ := programGraphWellFormed_operationControlPlaceScope program
    operation token.placeId (programWellFormed_graph program wellFormed) operations places member shared included
  have same : scope = token.owner.definitionScopeId := by simpa using portScope.symm.trans bound.2
  simp [operationOwningScope?, declared, same]

theorem declared_initiation_owned (program : Program) (owner : ScopeOccurrenceId)
    (id : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (wellFormed : programWellFormed program = true) (root : DeclaredRoot program owner)
    (member : .initiate id origin output ∈ program.operations) :
    operationOwningScope? program id = some owner.definitionScopeId := by
  obtain ⟨definition, scopes, _, _, key, _⟩ := root
  obtain ⟨_, _, _, ownership⟩ := programGraphWellFormed_scopeContract program (programWellFormed_graph program wellFormed)
  have respects := List.all_eq_true.mp (Bool.and_eq_true_iff.mp ownership).2 _ member
  unfold operationRespectsScopes at respects
  split at respects
  · contradiction
  · rename_i scope found
    have existsRoot := (Bool.and_eq_true_iff.mp respects).1
    change ((program.definitionScopes.find? (fun candidate => decide (candidate.id = scope))).any
      (·.parentScopeId.isNone)) = true at existsRoot
    cases declared : program.definitionScopes.find? (fun candidate => decide (candidate.id = scope)) with
    | none => simp [declared] at existsRoot
    | some selected =>
      have selectedEq : selected = definition := by simpa [scopes] using List.mem_of_find?_eq_some declared
      have scopeEq : scope = owner.definitionScopeId := by
        have named : selected.id = scope := by simpa using List.find?_some declared
        simpa [selectedEq, key] using named.symm
      change (program.operationScopes.find? (fun binding => decide (binding.operationId = id))).map (·.scopeId) = some scope at found
      rw [StructuredComposition.admitted_scope_lookup_is_exact program id wellFormed] at found
      simpa [scopeEq] using found

theorem selected_completion_is_root (program : Program) (state : RuntimeState)
    (scope : DefinitionScopeId)
    (allowed : ∀ operation ∈ program.operations, OperationAllowed operation) :
    completeSelectedScope? program state scope none = completeScopeState? state scope none := by
  have noBounded : boundedScopeOperations program = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro operation member
    have selected := allowed operation member
    cases operation <;> simp_all [OperationAllowed]
  have noMonitored : monitoredScopeDefinitions program = [] := by
    apply List.filterMap_eq_nil_iff.mpr
    intro operation member
    have selected := allowed operation member
    cases operation <;> simp_all [OperationAllowed]
  simp only [completeSelectedScope?, isMonitoredScopeDefinition, noMonitored, List.any_nil,
    Bool.false_eq_true, ↓reduceIte, completeBoundedScope?, boundedScopeDefinitionForChild?,
    noBounded, List.find?_nil]
  cases completeScopeState? state scope none <;> rfl

theorem program_analysis_declarations_absent (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    program.compensationActivityRetention = none ∧ program.compensationEventSubProcessSnapshots = none ∧
      program.compensationExecution = none ∧ program.interruptingMessageEventSubProcesses = [] := by
  unfold programAnalysis at analyzed
  split at analyzed
  · contradiction
  · rename_i admitted
    simp at admitted
    exact ⟨admitted.1.1.1.2, admitted.1.1.2, admitted.1.2, admitted.2⟩

private theorem allowed_filterMap_absent (program : Program) (project : SemanticOperation → Option α)
    (allowed : ∀ operation ∈ program.operations, OperationAllowed operation)
    (excluded : ∀ operation, OperationAllowed operation → project operation = none) :
    program.operations.filterMap project = [] := by
  apply List.filterMap_eq_nil_iff.mpr
  intro operation member
  exact excluded operation (allowed operation member)

private theorem allowed_filter_absent (program : Program) (select : SemanticOperation → Bool)
    (allowed : ∀ operation ∈ program.operations, OperationAllowed operation)
    (excluded : ∀ operation, OperationAllowed operation → select operation = false) :
    program.operations.filter select = [] := by
  apply List.filter_eq_nil_iff.mpr
  intro operation member
  simp [excluded operation (allowed operation member)]

theorem completion_foreign_families_absent (program : Program) (analysis : Analysis)
    (taskId : TaskDefinitionId) (analyzed : programAnalysis program = some analysis) :
    parallelMultiInstanceEntryForTask? program taskId = none ∧
      sequentialMultiInstanceOperationForTask? program taskId = none ∧
      isMessageMonitoredTaskDefinition program taskId = false ∧
      isMessageBoundedTaskDefinition program taskId = false ∧
      isBoundedTaskDefinition program taskId = false ∧
      dataInputTaskOperations program = [] ∧ dataOutputTaskOperations program = [] ∧
      isMonitoredTaskDefinition program taskId = false ∧
      isDataInputOutputTaskDefinition program taskId = false := by
  have allowed := program_analysis_operations_allowed program analysis analyzed
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
  · unfold parallelMultiInstanceEntryForTask?
    rw [allowed_filter_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed, ParallelMultiInstanceArm.ofOperation?])]
  · unfold sequentialMultiInstanceOperationForTask?
    rw [allowed_filter_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])]
  · unfold isMessageMonitoredTaskDefinition messageMonitoredTaskDefinitions
    rw [allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])]
    rfl
  · unfold isMessageBoundedTaskDefinition messageBoundedTaskOperations
    rw [allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])]
    rfl
  · unfold isBoundedTaskDefinition boundedTaskOperations
    rw [allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])]
    rfl
  · exact allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])
  · exact allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])
  · unfold isMonitoredTaskDefinition monitoredTaskOperations
    rw [allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])]
    rfl
  · unfold isDataInputOutputTaskDefinition dataInputOutputTaskContracts
    rw [allowed_filterMap_absent program _ allowed (by
      intro operation selected
      cases operation <;> simp_all [OperationAllowed])]
    rfl

/-- The existing User Task dispatcher either refuses exactly or commits its actual raw completion and canonical Process merge. -/
theorem human_dispatch_cases (program : Program) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (analyzed : programAnalysis program = some analysis) :
    let result := dispatchStimulus program before (.completeUserTaskInstance commandId taskId bindings)
    (result = { outcome := .rejected, state := before } ∧
      (before.control ≠ .running taskId.processInstanceId ∨ bindingsValid (programHandlers program) bindings ≠ true ∨
        completeUserTask before taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation = none)) ∨
      ∃ after, bindingsValid (programHandlers program) bindings = true ∧
      completeUserTask before taskId.processInstanceId ⟨taskId.elementId.value⟩
        taskId.activation = some after ∧
      result = { outcome := .committed, state :=
        { after with variables := { after.variables with process :=
          { bindings := mergeProcessVariableBindings after.variables.process.bindings bindings } } } } := by
  dsimp only
  obtain ⟨noRetention, noSnapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
  obtain ⟨noParallel, noSequential, noMessageMonitored, noMessageBounded, noBounded,
    noInput, noOutput, noMonitored, noComposed⟩ := completion_foreign_families_absent program analysis
      ⟨taskId.elementId.value⟩ analyzed
  have ordinary : isCallActivityProgram program = false := by
    simp [isCallActivityProgram, profile, serialBusinessTaskProfileId]
  have legacy : completeOrdinaryUserTaskWithCompensation? completeUserTask program before taskId =
      completeUserTask before taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation := by
    simp [completeOrdinaryUserTaskWithCompensation?, compensationTargetDeclaredForFamily, noRetention]
  have typed : bindingsValid (programHandlers program) bindings = true →
      processDataBindingsAdmitted program.identity.semanticProfile .userTaskCompletion bindings = true := by
    intro valid
    apply List.all_eq_true.mpr
    intro binding member
    have scalarValue := (Bool.and_eq_true_iff.mp (List.all_eq_true.mp (Bool.and_eq_true_iff.mp valid).2 binding member)).2
    cases valueEq : binding.value <;> simp [valueEq, scalar] at scalarValue
    all_goals rw [profile]; rfl
  cases control : before.control <;>
    simp only [dispatchStimulus, noSnapshots] <;>
    simp [control, noParallel, noSequential, noMessageMonitored, noMessageBounded,
      noBounded, noInput, noOutput, noMonitored, noComposed, ordinary, legacy]
  case running instanceId =>
    cases completed : completeUserTask before taskId.processInstanceId
        ⟨taskId.elementId.value⟩ taskId.activation with
    | none => simp
    | some after =>
        simp only
        split
        · rename_i accepted
          have patchValid : bindingsValid (programHandlers program) bindings = true := by
            simpa [profile] using accepted.1.1.2
          exact Or.inr ⟨patchValid, after, rfl, rfl⟩
        · rename_i rejected
          refine Or.inl ⟨rfl, ?_⟩
          by_cases identity : taskId.processInstanceId = instanceId
          · by_cases valid : bindingsValid (programHandlers program) bindings = true
            · rw [typed valid] at rejected
              simp [profile, identity, valid, structuredCompositionOrdinaryCompletionAdmitted,
                serialBusinessTaskProfileId, structuredCompositionCheckpointProfileId] at rejected
            · exact Or.inr (Or.inl (by simpa using valid))
          · exact Or.inl (Ne.symm identity)

/-- Reachability is generated only by the real evaluator and real public User/effect admission. -/
inductive ExecutionReachable (program : Program) (initial : RuntimeState) : RuntimeState → Prop where
  | initial : ExecutionReachable program initial initial
  | step {before after : RuntimeState} (choice : OperationId)
      (reached : ExecutionReachable program initial before)
      (executed : SemanticProcess.step program before choice = some after) : ExecutionReachable program initial after
  | human {before : RuntimeState} (commandId : SemanticId) (taskId : UserTaskInstanceId)
      (bindings : List VariableBinding) (reached : ExecutionReachable program initial before) :
      ExecutionReachable program initial (admitStimulus program before
        (.completeUserTaskInstance commandId taskId bindings)).state
  | effect {before : RuntimeState} (commandId : SemanticId) (effectId : EffectOccurrenceId)
      (result : EffectExecutionResult) (reached : ExecutionReachable program initial before) :
      ExecutionReachable program initial (admitStimulus program before (.completeEffect commandId effectId result)).state

/-- Actual committed start admission establishes the data predicate; no caller-supplied availability premise is needed. -/
theorem committed_start_supplies_suffix (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    bindingsValid (programHandlers program) bindings = true ∧ SuffixAvailable bindings analysis.ordered := by
  apply admitted_start_bindings_supply_suffix program analysis bindings analyzed
  obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
  cases admitted : startBindingsAdmitted program bindings with
  | true => rfl
  | false =>
      simp [admitStimulus, snapshots, initialState, profile, admitted] at committed

theorem committed_start_has_exact_builder (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    runningProgramStartState? program instanceId bindings = some (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).state := by
  obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
  have serial := serial_committed_ingress_has_checked_predecessor program initialState
    (.startProcess commandId processId instanceId bindings) committed
  cases created : runningProgramStartState? program instanceId bindings with
  | none =>
      simp [admitStimulus, snapshots, serial, profile, created,
        show initialState.effectIncidents = [] from rfl,
        show initialState.control = .notStarted from rfl] at committed
      repeat' (split at committed <;> simp_all)
  | some started =>
      simp [admitStimulus, snapshots, serial, profile, created,
        show initialState.effectIncidents = [] from rfl,
        show initialState.control = .notStarted from rfl] at committed ⊢
      repeat' (split at committed <;> simp_all)

/-- The serial frame excludes the foreign-family gates, so an admitted completion reaches its payload dispatcher exactly. -/
theorem serial_completion_admission_eq_dispatch (program : Program) (analysis : Analysis)
    (before : RuntimeState) (stimulus : Stimulus)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (analyzed : programAnalysis program = some analysis) (foreign : ForeignRuntimeEmpty before)
    (guarded : serialBusinessCommandAdmitted program before stimulus = true)
    (completion : IsSerialCompletion stimulus) :
    admitStimulus program before stimulus = dispatchStimulus program before stimulus := by
  obtain ⟨_, snapshots, _, messages⟩ := program_analysis_declarations_absent program analysis analyzed
  have dataValid : callDataRuntimeStateValid program before = true := by
    simp [callDataRuntimeStateValid, profile, serialBusinessTaskProfileId, callDataCheckpointProfileId]
  have messageValid : interruptingMessageEventSubProcessStateValid program before = true := by
    simp_all [interruptingMessageEventSubProcessStateValid, ForeignRuntimeEmpty,
      serialBusinessTaskProfileId, interruptingMessageEventSubProcessProfileId]
  have incidents : before.effectIncidents = [] := foreign.2.2.1
  cases stimulus <;> simp only [IsSerialCompletion] at completion <;> try contradiction
  all_goals simp [admitStimulus, dispatchStimulus, snapshots, guarded, dataValid, messageValid, incidents]

theorem guarded_effect_dispatch_cases (program : Program) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (analyzed : programAnalysis program = some analysis)
    (guarded : serialBusinessCommandAdmitted program before (.completeEffect commandId effectId result) = true) :
    dispatchStimulus program before (.completeEffect commandId effectId result) = { outcome := .rejected, state := before } ∨
      ∃ after, completeSerialEffect? program before effectId result = some after ∧
        dispatchStimulus program before (.completeEffect commandId effectId result) = { outcome := .committed, state := after } := by
  obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
  have noCompensation := (admitted_serial_guard_has_no_foreign_effects program before
    (.completeEffect commandId effectId result) profile guarded).2
  cases control : before.control <;>
    simp [dispatchStimulus, snapshots, control, noCompensation, profile]
  split
  · contradiction
  · cases completed : completeSerialEffect? program before effectId result with
    | none => simp
    | some after =>
      simp only
      split
      · exact Or.inr ⟨after, rfl, rfl⟩
      · exact Or.inl rfl
  · exact Or.inl rfl

def frontierFields (state : RuntimeState) :
    Bool × List ControlToken × List UserTaskWait × List EffectWait × List ActivityVariableScope :=
  (state.initiationPending, state.tokens, state.waits, state.effectWaits, state.variables.activities)

/-- The suffix points at the unique current operation; an armed effect retains exactly its captured local snapshot. -/
inductive OrderedPosition (program : Program) (ordered : List Vertex) (state : RuntimeState) : List Vertex → Prop where
  | pending (fields : frontierFields state = (true, [], [], [], [])) :
      OrderedPosition program ordered state ordered
  | token (vertex : Vertex) (rest : List Vertex) (token : ControlToken)
      (fields : frontierFields state = (false, [token], [], [], []))
      (consumer : consumer? program token.placeId = some vertex.id)
      (bound : DeclaredToken program token) :
      OrderedPosition program ordered state (vertex :: rest)
  | human (vertex : Vertex) (rest : List Vertex) (wait : UserTaskWait)
      (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
      (fields : frontierFields state = (false, [], [wait], [], []))
      (declared : .awaitUserTask id origin input wait.output wait.task ∈ program.operations)
      (projected : operationVertex? program (.awaitUserTask id origin input wait.output wait.task) = some vertex)
      (metadata : wait.metadata = wait.task.metadata)
      (owned : operationOwningScope? program id = some wait.owner.definitionScopeId) :
      OrderedPosition program ordered state (vertex :: rest)
  | effect (vertex : Vertex) (rest : List Vertex) (wait : EffectWait)
      (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId) (effect : EffectDefinition)
      (fields : frontierFields state = (false, [], [], [wait],
        [{ owner := .effectOccurrence ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩,
           bindings := wait.arguments }]))
      (declared : .awaitEffect id origin input wait.output effect none ∈ program.operations)
      (projected : operationVertex? program (.awaitEffect id origin input wait.output effect none) = some vertex)
      (element : effect.elementId = wait.elementId) (descriptor : effect.descriptor = wait.descriptor)
      (outputs : effect.outputMappings = wait.outputMappings)
      (snapshot : inputSnapshotMatches effect.inputMappings wait.arguments = true)
      (route : wait.bpmnErrorRoute = none)
      (owned : operationOwningScope? program id = some wait.owner.definitionScopeId) :
      OrderedPosition program ordered state (vertex :: rest)
  | finished (fields : frontierFields state = (false, [], [], [], [])) :
      OrderedPosition program ordered state []

/-- The position and available inputs share the same actual suffix of the independently analyzed order. -/
def AtOrderedSuffix (program : Program) (analysis : Analysis) (state : RuntimeState) : Prop :=
  ∃ earlier remaining, analysis.ordered = earlier ++ remaining ∧
    OrderedPosition program analysis.ordered state remaining ∧
    SuffixAvailable state.variables.process.bindings remaining ∧
    bindingsValid (programHandlers program) state.variables.process.bindings = true

/-- SBT internal work distinguishes the transient empty running root from committed completion. -/
def positionDepth (state : RuntimeState) (remaining : List Vertex) : Nat :=
  if state.initiationPending then 2
  else if !state.tokens.isEmpty then
    if remaining.head?.any (·.kind == .finish) then 2 else 1
  else if state.waits.isEmpty && state.effectWaits.isEmpty then
    match state.control with | .running _ => 1 | _ => 0
  else 0

/-- Every actual indexed phase has depth at most two, with zero precisely at a wait or committed completion. -/
theorem position_depth_spec (program : Program) (ordered remaining : List Vertex)
    (state : RuntimeState) (owner : ScopeOccurrenceId) (framed : RootFrame owner state)
    (position : OrderedPosition program ordered state remaining) :
    positionDepth state remaining ≤ 2 ∧
      (positionDepth state remaining = 0 ↔ state.waits ≠ [] ∨ state.effectWaits ≠ [] ∨ state.control = .completed owner.processInstanceId) := by
  rcases framed.2.2.2.1 with ⟨running, _⟩ | ⟨completed, _, tokens, waits, effects, pending⟩
  all_goals cases position <;> simp_all [frontierFields, positionDepth]
  all_goals split <;> simp_all

/-- The same reachable owner/port facts satisfy the independent runtime position checker. -/
theorem ordered_suffix_position_guard (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (analyzed : programAnalysis program = some analysis) (nonempty : owner.processInstanceId.value ≠ "")
    (root : DeclaredRoot program owner) (framed : RootFrame owner state)
    (indexed : AtOrderedSuffix program analysis state) : runtimePositionValid program owner.processInstanceId state = true := by
  have origins : ∀ place ∈ program.controlPlaces,
      program.controlPlaces.filter (fun candidate => decide (candidate.origin = place.origin)) = [place] :=
    fun place member => declared_place_unique_origin program analysis place analyzed member
  obtain ⟨definition, definitions, parent, origin, key, activation⟩ := root
  have rootSelected : uniqueDefinitionScope? program owner.definitionScopeId = some definition := by
    simp [uniqueDefinitionScope?, definitions, key]
  obtain ⟨tokensOwned, humansOwned, effectsOwned, life, foreign, issued⟩ := framed
  obtain ⟨_, _, _, position, _⟩ := indexed
  unfold runtimePositionValid
  apply Bool.and_eq_true_iff.mpr
  constructor
  · apply Bool.and_eq_true_iff.mpr
    refine ⟨wellFormed, ?_⟩
    change ((program.controlPlaces.all fun place => (program.controlPlaces.filter fun candidate =>
      decide (candidate.origin = place.origin)).length = 1) && program.definitionScopes.all fun scope =>
        (program.definitionScopes.filter fun candidate => decide (candidate.originElementId = scope.originElementId)).length = 1) = true
    apply Bool.and_eq_true_iff.mpr
    constructor
    · exact List.all_eq_true.mpr (fun place member => by simp [origins place member])
    · simp [definitions]
  · have tokenEntries : ∀ token ∈ state.tokens, ∃ place,
        uniqueControlPlace? program token.placeId = some place ∧
        program.controlPlaceScopes.filter (fun binding => decide (binding.controlPlaceId = token.placeId)) =
          [{ controlPlaceId := token.placeId, scopeId := token.owner.definitionScopeId }] := by
      intro selected present
      cases position with
      | pending fields => simp_all [frontierFields]
      | human vertex rest wait id origin input fields declared projected metadata owned => simp_all [frontierFields]
      | effect vertex rest wait id origin input effect fields declared projected element descriptor outputs snapshot route owned => simp_all [frontierFields]
      | finished fields => simp_all [frontierFields]
      | token vertex rest token fields consumer bound =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        have same : selected = token := by simpa [fields.2.1] using present
        subst selected
        obtain ⟨⟨place, census⟩, binding⟩ := bound
        have member : place ∈ program.controlPlaces :=
          (List.mem_filter.mp (show place ∈ program.controlPlaces.filter (fun candidate => decide (candidate.id = token.placeId)) by rw [census]; simp)).1
        exact ⟨place, by simp [uniqueControlPlace?, census, origins place member], binding⟩
    change (match state.control with
      | .notStarted => _ | .running _ => _ | .completed _ => _ | .cancelled _ => _ | .failed .. => _) = true
    rcases life with ⟨running, live⟩ | ⟨completed, live, noTokens, _⟩
    · simp only [running]
      change (_ && _ && _ && _ && _) = true
      have calls : state.calledProcessOccurrences = [] := by simp_all [ForeignRuntimeEmpty]
      have rootCount : (state.scopeOccurrences.filter fun occurrence =>
          match uniqueDefinitionScope? program occurrence.id.definitionScopeId with
          | none => false
          | some scope => occurrence.parent.isNone && occurrence.id.processInstanceId = owner.processInstanceId &&
              scope.parentScopeId.isNone && scope.originElementId.value = program.processId.value).length = 1 := by
        simp [live, rootSelected, parent, origin]
      have tokensValid : state.tokens.all (fun token =>
          match uniqueControlPlace? program token.placeId,
              (match program.controlPlaceScopes.filter (fun binding => decide (binding.controlPlaceId = token.placeId)) with
               | [binding] => some binding.scopeId | _ => none) with
          | some _, some scope => scope = token.owner.definitionScopeId && exactLiveOccurrence state token.owner
          | _, _ => false) = true := by
        apply List.all_eq_true.mpr
        intro token member
        obtain ⟨place, selected, binding⟩ := tokenEntries token member
        simp [selected, binding, exactLiveOccurrence, live, tokensOwned token member]
      apply Bool.and_eq_true_iff.mpr
      refine ⟨?_, tokensValid⟩
      apply Bool.and_eq_true_iff.mpr
      constructor
      · apply Bool.and_eq_true_iff.mpr
        refine ⟨?_, ?_⟩
        · apply Bool.and_eq_true_iff.mpr
          refine ⟨by simp, ?_⟩
          with_unfolding_all exact decide_eq_true_iff.mpr rootCount
        · simp [calledProcessAssociationsValid, rootInstanceId?, running, calls, live]
      · change (state.scopeOccurrences.all fun occurrence => exactLiveOccurrence state occurrence.id && _) = true
        rw [live]
        simp only [List.all_cons, List.all_nil, Bool.and_true]
        apply Bool.and_eq_true_iff.mpr
        refine ⟨by simp [exactLiveOccurrence, live], ?_⟩
        change (match uniqueDefinitionScope? program owner.definitionScopeId with | none => false | some _ => _) = true
        rw [rootSelected]
        change (decide (owner.processInstanceId.value ≠ "") && owner.activation > 0 && _) = true
        rw [show decide (owner.processInstanceId.value ≠ "") = true from decide_eq_true_iff.mpr nonempty]
        simp only [activation, Nat.lt_add_one, decide_true, Bool.true_and]
        change (match definition.parentScopeId, (none : Option ScopeOccurrenceId) with
          | none, none => _ | some _, some _ => _ | _, _ => _) = true
        simp only [parent]
        change (let hosting := true && owner.processInstanceId = owner.processInstanceId &&
                  definition.parentScopeId.isNone && definition.originElementId.value = program.processId.value
                let called := match state.calledProcessOccurrences.filter (fun record => decide (record.calledRoot = owner)) with
                  | [record] => record.calledProcessId.value = definition.originElementId.value | _ => false
                (hosting && !called) || (!hosting && called)) = true
        simp [parent, origin, calls]
    · simp [completed, live, noTokens]


theorem program_operations_unique_by_id (program : Program) (left right : SemanticOperation)
    (wellFormed : programWellFormed program = true)
    (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (same : left.id.value = right.id.value) : left = right := by
  have unique := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  have filtered := filter_key_eq_singleton_of_nodup program.operations (fun operation => operation.id.value)
    right unique rightMember
  have member : left ∈ program.operations.filter (fun operation => decide (operation.id.value = right.id.value)) :=
    List.mem_filter.mpr ⟨leftMember, by simp [same]⟩
  rw [filtered] at member
  exact List.mem_singleton.mp member

/-- A current token's independently selected consumer determines the exact projected chain vertex. -/
theorem token_consumer_projects_current_vertex (program : Program) (analysis : Analysis)
    (operation : SemanticOperation) (vertex : Vertex) (input : ControlPlaceId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (member : operation ∈ program.operations) (current : vertex ∈ analysis.ordered)
    (consumes : input ∈ operationInputs operation)
    (consumer : consumer? program input = some vertex.id) :
    operationVertex? program operation = some vertex := by
  obtain ⟨selected, unique, named⟩ := consumer_exact program input vertex.id consumer
  have selectedMember : operation ∈ program.operations.filter (fun op => (operationInputs op).contains input) :=
    List.mem_filter.mpr ⟨member, by simpa using consumes⟩
  rw [unique] at selectedMember
  have sameSelected := List.mem_singleton.mp selectedMember
  obtain ⟨declared, declaredMember, projected⟩ := ordered_vertex_has_operation program analysis vertex analyzed current
  have same : operation.id.value = declared.id.value := by
    rw [sameSelected, named, operation_projection_identity program declared vertex projected]
  rw [program_operations_unique_by_id program operation declared wellFormed member declaredMember same]
  exact projected

theorem position_with_pending_is_initial (program : Program) (ordered remaining : List Vertex)
    (state : RuntimeState) (position : OrderedPosition program ordered state remaining)
    (pending : state.initiationPending = true) :
    remaining = ordered ∧ frontierFields state = (true, [], [], [], []) := by
  cases position with
  | pending fields => exact ⟨rfl, fields⟩
  | token vertex rest token fields consumer bound =>
      simp only [frontierFields, Prod.mk.injEq] at fields; simp_all
  | human vertex rest wait id origin input fields declared projected metadata owned =>
      simp only [frontierFields, Prod.mk.injEq] at fields; simp_all
  | effect vertex rest wait id origin input effect fields declared projected element descriptor outputs snapshot route owned =>
      simp only [frontierFields, Prod.mk.injEq] at fields; simp_all
  | finished fields =>
      simp only [frontierFields, Prod.mk.injEq] at fields; simp_all

theorem position_with_token_has_current_head (program : Program) (ordered remaining : List Vertex)
    (state : RuntimeState) (input : ControlPlaceId) (owner : ScopeOccurrenceId)
    (position : OrderedPosition program ordered state remaining)
    (found : onlyTokenOwner? state input = some owner) :
    ∃ vertex rest token, remaining = vertex :: rest ∧
      frontierFields state = (false, [token], [], [], []) ∧ token.placeId = input ∧
      owner = token.owner ∧ consumer? program input = some vertex.id ∧ DeclaredToken program token := by
  cases position with
  | pending fields =>
      simp only [frontierFields, Prod.mk.injEq] at fields
      simp [onlyTokenOwner?, tokenOwners, fields.2.1] at found
  | token vertex rest token fields consumer bound =>
      have parts := fields
      simp only [frontierFields, Prod.mk.injEq] at parts
      by_cases matching : token.placeId = input
      · simp [onlyTokenOwner?, tokenOwners, parts.2.1, matching] at found
        exact ⟨vertex, rest, token, rfl, fields, matching, found.symm, by simpa [matching] using consumer, bound⟩
      · simp [onlyTokenOwner?, tokenOwners, parts.2.1, matching] at found
  | human vertex rest wait id origin input fields declared projected metadata owned =>
      simp only [frontierFields, Prod.mk.injEq] at fields
      simp [onlyTokenOwner?, tokenOwners, fields.2.1] at found
  | effect vertex rest wait id origin input effect fields declared projected element descriptor outputs snapshot route owned =>
      simp only [frontierFields, Prod.mk.injEq] at fields
      simp [onlyTokenOwner?, tokenOwners, fields.2.1] at found
  | finished fields =>
      simp only [frontierFields, Prod.mk.injEq] at fields
      simp [onlyTokenOwner?, tokenOwners, fields.2.1] at found

theorem position_frame (program : Program) (ordered remaining : List Vertex)
    (before after : RuntimeState) (position : OrderedPosition program ordered before remaining)
    (same : frontierFields after = frontierFields before) : OrderedPosition program ordered after remaining := by
  cases position with
  | pending fields => exact .pending (same.trans fields)
  | token vertex rest token fields consumer bound => exact .token vertex rest token (same.trans fields) consumer bound
  | human vertex rest wait id origin input fields declared projected metadata owned =>
      exact .human vertex rest wait id origin input (same.trans fields) declared projected metadata owned
  | effect vertex rest wait id origin input effect fields declared projected element descriptor outputs snapshot route owned =>
      exact .effect vertex rest wait id origin input effect (same.trans fields) declared projected element descriptor outputs snapshot route owned
  | finished fields => exact .finished (same.trans fields)

/-- Actual human completion advances exactly its declared output; supplied data preserves every remaining obligation. -/
theorem human_completion_preserves_ordered_suffix (program : Program) (analysis : Analysis)
    (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (patch : List VariableBinding)
    (patchValid : bindingsValid (programHandlers program) patch = true)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis) (indexed : AtOrderedSuffix program analysis before)
    (owner : ScopeOccurrenceId) (framed : RootFrame owner before)
    (completed : completeUserTask before instanceId taskId activation = some after) :
    let resumed := { after with variables := { after.variables with process :=
      { bindings := mergeProcessVariableBindings after.variables.process.bindings patch } } }
    RootFrame owner resumed ∧ AtOrderedSuffix program analysis resumed := by
  dsimp only
  obtain ⟨tokensOwned, humansOwned, effectsOwned, life, foreign, issued⟩ := framed
  obtain ⟨earlier, remaining, orderEq, position, available, canonical⟩ := indexed
  obtain ⟨_, _, _, vertices, _, _, graph⟩ := program_analysis_projection program analysis analyzed
  have links := chain_links_suffix earlier remaining (by rw [← orderEq]; exact (analysis_ordered_facts vertices analysis graph).2.1)
  unfold completeUserTask at completed
  split at completed
  · contradiction
  · rename_i selected found
    have live := List.mem_of_find?_eq_some found
    have runningLife : before.control = .running owner.processInstanceId ∧
        before.scopeOccurrences = [{ id := owner, parent := none }] := by
      rcases life with running | ⟨_, _, _, empty, _⟩
      · exact running
      · simp [empty] at live
    have root := humansOwned selected live
    cases position with
    | pending fields =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        simp [fields.2.2.1] at live
    | token vertex rest token fields consumer bound =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        simp [fields.2.2.1] at live
    | effect vertex rest wait id origin input effect fields declared projected element descriptor outputs snapshot route owned =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        simp [fields.2.2.1] at live
    | finished fields =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        simp [fields.2.2.1] at live
    | human vertex rest wait id origin input fields declared projected metadata owned =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        have same : selected = wait := by simpa [fields.2.2.1] using live
        subst selected
        simp [operationVertex?, Option.bind_eq_some_iff] at projected
        obtain ⟨_, nextId, consumer, vertexEq⟩ := projected
        have outputs : vertex.outputs = [nextId] := by rw [← vertexEq]
        have noWrites : vertex.writes = [] := by rw [← vertexEq]
        obtain ⟨next, more, restEq, named, _⟩ := chain_output_selects_next vertex rest nextId links outputs
        cases Option.some.inj completed
        refine ⟨?_, ?_⟩
        · refine ⟨?_, ?_, effectsOwned, Or.inl runningLife, foreign, ?_⟩ <;>
            simp [fields.2.2.1, fields.2.1, root.1, addToken, canonicalInsertBy, IssuanceFrame] <;>
            exact ⟨issued.1, issued.2.1, issued.2.2.1⟩
        refine ⟨earlier ++ [vertex], rest, by simpa [List.append_assoc] using orderEq, ?_, ?_, ?_⟩
        · rw [restEq]
          apply OrderedPosition.token next more ⟨wait.output, wait.owner⟩
          · simp [frontierFields, fields.1, fields.2.1, fields.2.2.1, fields.2.2.2.1,
              fields.2.2.2.2, addToken, canonicalInsertBy]
          · simpa [named] using consumer
          · exact owned_operation_port program (.awaitUserTask id origin input wait.output wait.task) wait.output wait.owner
              wellFormed declared rfl (by simp [operationControlPlaces, operationOutputs]) owned
        · exact human_merge_advances_available_suffix before.variables.process.bindings patch vertex rest noWrites available
        · exact bindings_merge_valid _ _ _
            (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp canonical).1)
            (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp patchValid).1) canonical patchValid

/-- The reachable shape supplies both the private declaration/snapshot join and the ordinary runtime declaration guard. -/
theorem ordered_suffix_wait_guards (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (root : DeclaredRoot program owner) (framed : RootFrame owner state)
    (indexed : AtOrderedSuffix program analysis state) :
    serialRuntimeAssociationsValid program state = true ∧
      waitDeclarationsValid program owner.processInstanceId state = true := by
  obtain ⟨definition, scopes, parent, origin, key, activation⟩ := root
  have frameParts := framed
  obtain ⟨tokenOwners, humanOwners, effectOwners, life, foreign, issued⟩ := frameParts
  obtain ⟨_, _, _, position, _⟩ := indexed
  cases position with
  | pending fields => simp_all [serialRuntimeAssociationsValid, waitDeclarationsValid, frontierFields, ForeignRuntimeEmpty]
  | token vertex rest token fields consumer bound =>
      simp_all [serialRuntimeAssociationsValid, waitDeclarationsValid, frontierFields, ForeignRuntimeEmpty]
  | finished fields => simp_all [serialRuntimeAssociationsValid, waitDeclarationsValid, frontierFields, ForeignRuntimeEmpty]
  | human vertex rest wait id origin input fields declared projected metadata owned =>
      have census := human_wait_census program wait id origin input wellFormed declared metadata
      have unique := programWellFormed_waitDeclarer program (.awaitUserTask id origin input wait.output wait.task)
        (userTaskWaitDeclarationKey wait.task.id) wellFormed declared
        (by simp [operationDeclaresWaitKey, operationWaitDeclarationKeys])
      simp only [frontierFields, Prod.mk.injEq] at fields
      have identity := humanOwners wait (by simp [fields.2.2.1])
      rcases life with ⟨running, live⟩ | ⟨_, _, _, empty, _⟩
      · simp_all [serialRuntimeAssociationsValid, waitDeclarationsValid, ForeignRuntimeEmpty,
          userTaskWaitDeclarers_eq_keyFilter, declaredByExactlyOneOwnedOperation, SemanticOperation.id]
        with_unfolding_all exact congrArg List.length census
      · simp_all
  | effect vertex rest wait id origin input effect fields declared projected element descriptor outputs snapshot route owned =>
      have census := effect_wait_census program wait id origin input effect wellFormed declared element descriptor outputs route snapshot
      have aligned := programWellFormed_awaitEffect_elements_align program wellFormed id origin input wait.output effect none declared
      have unique := programWellFormed_waitDeclarer program (.awaitEffect id origin input wait.output effect none)
        (effectWaitDeclarationKey wait.elementId) wellFormed declared
        (by simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, aligned, element])
      simp only [frontierFields, Prod.mk.injEq] at fields
      have identity := effectOwners wait (by simp [fields.2.2.2.1])
      rcases life with ⟨running, live⟩ | ⟨_, _, _, _, empty, _⟩
      · simp_all [serialRuntimeAssociationsValid, waitDeclarationsValid, ForeignRuntimeEmpty,
          effectWaitDeclarers_eq_keyFilter, declaredByExactlyOneOwnedOperation, SemanticOperation.id,
          activityScopeMatches, localDataOwnerMatches]
        with_unfolding_all exact congrArg List.length census
      · simp_all

/-- Admissible completion identities are taken from live waits; result coverage is over distinct declared local sources. -/
inductive AdmissibleCompletion (program : Program) (state : RuntimeState) : Stimulus → Prop where
  | human (commandId : SemanticId) (wait : UserTaskWait) (patch : List VariableBinding)
      (live : wait ∈ state.waits) (valid : bindingsValid (programHandlers program) patch = true) :
      AdmissibleCompletion program state (.completeUserTaskInstance commandId
        ⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ patch)
  | effect (commandId : SemanticId) (wait : EffectWait) (patch : List VariableBinding) (sources : List String)
      (live : wait ∈ state.effectWaits) (valid : bindingsValid (programHandlers program) patch = true)
      (collected : wait.outputMappings.mapM (fun m => match m.expression with | .localVariable n => some n | _ => none) = some sources)
      (count : sources.eraseDups.length = patch.length) (covered : sources.all (fun name => patch.any (·.name == name)) = true) :
      AdmissibleCompletion program state (.completeEffect commandId
        ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩ (.success patch))

/-- Exact live identity and admissible supplied data suffice for actual dispatcher success, including nullable fan-out. -/
theorem admissible_completion_dispatch_commits (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (stimulus : Stimulus) (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (analyzed : programAnalysis program = some analysis) (framed : RootFrame owner state)
    (indexed : AtOrderedSuffix program analysis state) (admissible : AdmissibleCompletion program state stimulus) :
    (dispatchStimulus program state stimulus).outcome = .committed := by
  obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
  obtain ⟨_, _, _, position, _⟩ := indexed
  cases admissible with
  | human commandId wait patch live valid =>
      have single : state.waits = [wait] := by cases position <;> simp_all [frontierFields]
      have identity := (framed.2.1 wait live).2
      have running : state.control = .running wait.processInstanceId := by
        rcases framed.2.2.2.1 with ⟨running, _⟩ | ⟨_, _, _, empty, _⟩ <;> simp_all
      rcases human_dispatch_cases program analysis state commandId ⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ patch profile analyzed with ⟨_, refused⟩ | ⟨after, _, _, committed⟩
      · simp [running, valid, completeUserTask, single] at refused
      · rw [committed]
  | effect commandId wait patch sources live valid collected count covered =>
      have fields : state.effectWaits = [wait] ∧ state.variables.activities =
          [{ owner := .effectOccurrence ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩, bindings := wait.arguments }] := by
        cases position <;> simp_all [frontierFields]
      have identity := (framed.2.2.1 wait live).2
      have running : state.control = .running wait.processInstanceId := by
        rcases framed.2.2.2.1 with ⟨running, _⟩ | ⟨_, _, _, _, empty, _⟩ <;> simp_all
      have noCompensation : state.compensationHandlerEffectWaits = [] := framed.2.2.2.2.1.2.2.2.2.2.2.2.2.2.2.2.2.1
      obtain ⟨bindings, mapped⟩ := serial_patch_exists (programHandlers program) wait.outputMappings state.variables.process.bindings patch sources collected valid count covered
      simp [dispatchStimulus, snapshots, running, noCompensation, profile, completeSerialEffect?, fields.1,
        effectOccurrenceMatches, completeSerialActivityScope?, fields.2, activityScopeMatches, localDataOwnerMatches, mapped]

end SerialBusinessTask


end BpmnSemantics.SemanticProcess

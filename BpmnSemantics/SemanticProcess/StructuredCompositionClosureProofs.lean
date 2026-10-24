module

public import BpmnSemantics.SemanticProcess.StructuredCompositionDataProofs
public import BpmnSemantics.SemanticProcess.CommandAdmissionLaws

/-! SPC-AVAILABLE-01 and SPC-CLOSURE-01 connect admitted starts and local preservation laws to finite actual execution. This owner assembles reachable-state consequences without replacing the existing evaluator or its transition relations. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.StructuredComposition

theorem task_execution_preserves_valid_bindings
    (program : Program) (analysis : Analysis) (initial reached : RuntimeState)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (valid : ProcessBindingsValid initial.variables.process.bindings)
    (reachable : TaskExecutionReachable program initial reached) :
    ProcessBindingsValid reached.variables.process.bindings := by
  induction reachable with
  | initial => exact valid
  | step choice reachable executed ih =>
      unfold SemanticProcess.step at executed
      split at executed
      · contradiction
      · rename_i operation selected
        rw [admitted_internal_step_preserves_process_bindings program analysis operation _ _
          analyzed (List.mem_of_find?_eq_some selected) executed]
        exact ih
  | completion commandId taskId bindings reachable ih =>
      exact completion_admission_preserves_valid_bindings program analysis _ commandId taskId
        bindings profile analyzed ih

theorem task_execution_preserves_binding_presence
    (program : Program) (analysis : Analysis) (initial reached : RuntimeState) (name : String)
    (analyzed : programAnalysis program = some analysis)
    (present : BindingPresent initial.variables.process.bindings name)
    (reachable : TaskExecutionReachable program initial reached) :
    BindingPresent reached.variables.process.bindings name := by
  induction reachable with
  | initial => exact present
  | step choice reachable executed ih =>
      unfold SemanticProcess.step at executed
      split at executed
      · contradiction
      · rename_i operation selected
        rw [admitted_internal_step_preserves_process_bindings program analysis operation _ _
          analyzed (List.mem_of_find?_eq_some selected) executed]
        exact ih
  | completion commandId taskId bindings reachable ih =>
      exact completion_admission_preserves_binding_presence program analysis _ commandId taskId
        bindings name ih analyzed

theorem committed_start_process_bindings
    (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).state.variables.process.bindings = bindings := by
  have storage := admitStimulus_committed_collection_storage program initialState _ committed
  simp only [initialState] at storage
  obtain ⟨_, _, _, noSnapshots, _⟩ :=
    program_analysis_excludes_foreign_declarations program analysis analyzed
  cases created : runningProgramStartState? program instanceId bindings with
  | none =>
      simp [admitStimulus, storage, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid,
        noSnapshots, initialState, profile, created] at committed
      split at committed <;> first | contradiction | (split at committed <;> contradiction)
  | some started =>
      have data : started.variables.process.bindings = bindings := by
        simp only [runningProgramStartState?, bind, pure, Option.bind_eq_some_iff] at created
        obtain ⟨root, found, created⟩ := created
        cases Option.some.inj created
        rfl
      simp [admitStimulus, storage, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid,
        noSnapshots, initialState, profile, created] at committed ⊢
      split at committed
      · split at committed <;> simp_all
      · contradiction

theorem committed_start_requirements_remain_present
    (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (reached : RuntimeState)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state
      reached) :
    ∀ name ∈ analysis.required, BindingPresent reached.variables.process.bindings name := by
  have initialBindings := committed_start_process_bindings program analysis commandId processId
    instanceId bindings profile analyzed committed
  intro name required
  apply task_execution_preserves_binding_presence program analysis _ reached name analyzed _ reachable
  rw [initialBindings]
  exact committed_start_supplies_required_bindings program initialState commandId processId
    instanceId bindings analysis profile analyzed committed name required



theorem committed_start_execution_has_valid_bindings
    (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (reached : RuntimeState)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state
      reached) : ProcessBindingsValid reached.variables.process.bindings := by
  apply task_execution_preserves_valid_bindings program analysis _ reached profile analyzed _ reachable
  rw [committed_start_process_bindings program analysis commandId processId instanceId bindings
    profile analyzed committed]
  obtain ⟨canonical, typed⟩ := committed_start_bindings_canonical_and_typed program initialState
    commandId processId instanceId bindings analysis profile analyzed committed
  refine ⟨canonical_bindings_have_unique_names bindings canonical, ?_⟩
  intro binding member
  have accepted := List.all_eq_true.mp typed binding member
  change variableValueAdmitted program.identity.semanticProfile .processStart binding.value = true at accepted
  rwa [profile, (composition_scalar_domains_agree binding.value).1] at accepted

theorem matching_wait_declares_its_key
    (wait : UserTaskWait) (operation : SemanticOperation) (matched : WaitMatchesOperation wait operation) :
    operationDeclaresWaitKey operation (userTaskWaitDeclarationKey wait.task.id) = true := by
  cases operation <;> simp only [WaitMatchesOperation] at matched
  all_goals try contradiction
  all_goals simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, matched.1]

theorem input_positions_for_declared_wait
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (state : RuntimeState)
    (wait : UserTaskWait) (operation : SemanticOperation)
    (wellFormed : programWellFormed program = true)
    (positions : RuntimeInputPositions program vertices analysis state)
    (live : wait ∈ state.waits) (member : operation ∈ program.operations)
    (declares : operationDeclaresWaitKey operation (userTaskWaitDeclarationKey wait.task.id) = true) :
    WaitMatchesOperation wait operation ∧
      InputsPresent vertices analysis state.variables.process.bindings operation.id.value := by
  obtain ⟨source, included, matched, inputs⟩ := positions.2 wait live
  have onlySource := programWellFormed_waitDeclarer program source (userTaskWaitDeclarationKey wait.task.id)
    wellFormed included (matching_wait_declares_its_key wait source matched)
  have selected : operation ∈ program.operations.filter
      (fun candidate => operationDeclaresWaitKey candidate (userTaskWaitDeclarationKey wait.task.id)) :=
    List.mem_filter.mpr ⟨member, declares⟩
  rw [onlySource] at selected
  have same := List.mem_singleton.mp selected
  rw [same]
  exact ⟨matched, inputs⟩

theorem data_completion_preserves_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (instanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat) (bindings : List VariableBinding)
    (wellFormed : programWellFormed program = true)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation bindings = some after) :
    RuntimeInputPositions program vertices analysis after := by
  obtain ⟨contract, wait, next, declared, live, key, waits, tokens, output⟩ :=
    data_completion_has_exact_continuation program before after instanceId taskId activation bindings bounded completed
  obtain ⟨taskKey, origin, member⟩ := dataInputOutputTaskContract_facts declared
  have declaredKey : operationDeclaresWaitKey
      (.awaitDataInputOutputUserTask contract.operationId origin contract.input contract.output contract.taskId
        contract.taskName contract.directInput contract.directOutput) (userTaskWaitDeclarationKey wait.task.id) = true := by
    simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, key, taskKey]
  have inputs := (input_positions_for_declared_wait program vertices analysis before wait _
    wellFormed positions live member declaredKey).2
  obtain ⟨target, consumer, supplied⟩ := declared_completion_transports_input_obligations program analysis vertices
    before after instanceId taskId activation bindings contract analyzed graph inputs declared completed
  constructor
  · intro token included
    have same : token = next := by simpa [tokens] using included
    subst token
    exact ⟨target, by simpa [output] using consumer, supplied⟩
  · simp [waits]

theorem ordinary_completion_admission_has_declaration
    (program : Program) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (accepted : structuredCompositionOrdinaryCompletionAdmitted program taskId bindings = true) :
    ∃ id origin input output task,
      SemanticOperation.awaitUserTask id origin input output task ∈ program.operations ∧
        task.id.value = taskId.elementId.value := by
  simp [structuredCompositionOrdinaryCompletionAdmitted, profile] at accepted
  obtain ⟨operation, singleton⟩ := List.length_eq_one_iff.mp accepted.2
  have filtered := Eq.mpr (congrArg (fun values => operation ∈ values) singleton)
    (List.mem_singleton_self operation)
  obtain ⟨member, kind⟩ := List.mem_filter.mp filtered
  cases operation <;> simp only [Bool.false_eq_true] at kind
  all_goals try contradiction
  case awaitUserTask id origin input output task =>
    exact ⟨id, origin, input, output, task, member, by simpa using kind⟩

theorem ordinary_completion_preserves_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (accepted : structuredCompositionOrdinaryCompletionAdmitted program taskId bindings = true)
    (completed : completeUserTask before taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation = some after) :
    RuntimeInputPositions program vertices analysis after := by
  obtain ⟨id, origin, input, output, task, member, taskKey⟩ :=
    ordinary_completion_admission_has_declaration program taskId bindings profile accepted
  obtain ⟨wait, live, next, key, waits, tokens, place⟩ := ordinary_completion_has_exact_continuation
    before after taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation bounded completed
  have declares : operationDeclaresWaitKey (.awaitUserTask id origin input output task)
      (userTaskWaitDeclarationKey wait.task.id) = true := by
    simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, userTaskWaitDeclarationKey, key, taskKey]
  obtain ⟨matched, inputs⟩ := input_positions_for_declared_wait program vertices analysis before wait _
    wellFormed positions live member declares
  obtain ⟨source, included, projected⟩ := program_analysis_projects_each_executable_operation
    program analysis _ analyzed member rfl
  simp [operationVertex?, bind, Option.bind_eq_some_iff] at projected
  obtain ⟨_, target, consumer, shape⟩ := projected
  have unchanged := ordinary_completion_preserves_process_bindings before after taskId.processInstanceId
    ⟨taskId.elementId.value⟩ taskId.activation completed
  have supplied : InputsPresent vertices analysis after.variables.process.bindings target := by
    rw [unchanged]
    apply predecessor_supplies_successor_inputs vertices analysis source target _ graph included
    · simp [← shape]
    · simpa [← shape] using inputs
    · intro name written
      simp [← shape] at written
  constructor
  · intro token live
    have same : token = next := by simpa [tokens] using live
    subst token
    exact ⟨target, by simpa [place, matched.2] using consumer, supplied⟩
  · simp [waits]

theorem process_merge_preserves_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (state : RuntimeState)
    (bindings : List VariableBinding) (positions : RuntimeInputPositions program vertices analysis state) :
    RuntimeInputPositions program vertices analysis
      { state with variables := { state.variables with process :=
        { bindings := mergeProcessVariableBindings state.variables.process.bindings bindings } } } := by
  constructor
  · intro token live
    obtain ⟨target, consumer, inputs⟩ := positions.1 token live
    exact ⟨target, consumer, fun name needed => merge_preserves_binding_presence _ _ name (inputs name needed)⟩
  · intro wait live
    obtain ⟨operation, member, matched, inputs⟩ := positions.2 wait live
    exact ⟨operation, member, matched, fun name needed => merge_preserves_binding_presence _ _ name (inputs name needed)⟩

theorem completion_admission_preserves_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before : RuntimeState)
    (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before) :
    RuntimeInputPositions program vertices analysis
      (admitStimulus program before (.completeUserTaskInstance commandId taskId bindings)).state := by
  rcases completion_admission_cases program analysis before commandId taskId bindings analyzed with
    refused | ⟨after, completed, _, result⟩ | ⟨after, completed, ordinary, _, result⟩ |
      ⟨after, completed, call, _, result⟩
  · simpa [refused] using positions
  · rw [result]
    exact data_completion_preserves_input_positions program vertices analysis before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation bindings wellFormed analyzed graph positions bounded completed
  · rw [result]
    apply process_merge_preserves_input_positions
    exact ordinary_completion_preserves_input_positions program vertices analysis before after taskId bindings
      wellFormed profile analyzed graph positions bounded ordinary completed
  · simp [isCallActivityProgram, profile, structuredCompositionCheckpointProfileId] at call

theorem task_execution_preserves_input_positions
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (initial reached : RuntimeState)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (positions : RuntimeInputPositions program vertices analysis initial) (bounded : ControlUnitBound initial)
    (reachable : TaskExecutionReachable program initial reached) :
    RuntimeInputPositions program vertices analysis reached := by
  induction reachable with
  | initial => exact positions
  | step choice reachable executed ih =>
      have bound := task_execution_reachable_preserves_control_unit_bound program analysis _ _ analyzed bounded reachable
      unfold SemanticProcess.step at executed
      split at executed
      · contradiction
      · rename_i operation selected
        exact admitted_fire_preserves_input_positions program vertices analysis _ _ operation analyzed graph
          (List.mem_of_find?_eq_some selected) ih bound executed
  | completion commandId taskId bindings reachable ih =>
      have bound := task_execution_reachable_preserves_control_unit_bound program analysis _ _ analyzed bounded reachable
      exact completion_admission_preserves_input_positions program vertices analysis _ commandId taskId bindings
        wellFormed profile analyzed graph ih bound

theorem reached_data_task_input_is_available
    (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding) (reached : RuntimeState)
    (token : ControlToken) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (taskId : TaskDefinitionId) (taskName : Option String)
    (directInput : DirectActivityDataInput) (directOutput : DirectActivityDataOutput)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state reached)
    (member : SemanticOperation.awaitDataInputOutputUserTask id origin input output taskId taskName
      directInput directOutput ∈ program.operations)
    (running : reached.control = .running token.owner.processInstanceId)
    (live : token ∈ reached.tokens) (position : token.placeId = input) :
    ∃ binding, dataInputOutputSourceBinding? .scalar reached token.owner directInput = some binding := by
  obtain ⟨_, _, _, vertices, _, _, graph⟩ := program_analysis_projection program analysis analyzed
  have startPositions := committed_start_has_input_positions program vertices analysis commandId processId instanceId
    bindings profile committed
  have startBound := committed_start_task_execution_has_at_most_one_control_unit program analysis commandId processId
    instanceId bindings _ profile analyzed committed .initial
  have positions := task_execution_preserves_input_positions program vertices analysis _ reached wellFormed profile
    analyzed graph startPositions startBound reachable
  have valid := committed_start_execution_has_valid_bindings program analysis commandId processId instanceId bindings
    reached profile analyzed committed reachable
  have required := committed_start_requirements_remain_present program analysis commandId processId instanceId bindings
    reached profile analyzed committed reachable
  exact input_position_supplies_data_task_lookup program vertices analysis reached token id origin input output
    taskId taskName directInput directOutput analyzed graph member running live position positions valid required

def runtimeBurstRank (program : Program) (analysis : Analysis) (state : RuntimeState) : Nat :=
  if state.initiationPending then analysis.maximumBurst
  else match state.tokens with
    | token :: _ => ((consumer? program token.placeId).map (burstRank analysis.ordered)).getD 0
    | [] => if state.waits.isEmpty then
        match state.control with | .running _ => 1 | _ => 0
      else 0

theorem routing_frame_decreases_runtime_burst_rank
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (operation : SemanticOperation) (source : Vertex) (token next : ControlToken)
    (graph : analyze vertices = some analysis) (member : operation ∈ program.operations)
    (included : source ∈ analysis.ordered) (projected : operationVertex? program operation = some source)
    (automatic : source.kind = .start ∨ source.kind = .choice ∨ source.kind = .merge)
    (positions : RuntimeInputPositions program vertices analysis before)
    (single : before.tokens = [token]) (input : token.placeId ∈ operationInputs operation)
    (tokens : after.tokens = [next]) (output : next.placeId ∈ SemanticProcess.operationOutputs operation)
    (pendingBefore : before.initiationPending = false) (pendingAfter : after.initiationPending = false) :
    runtimeBurstRank program analysis after < runtimeBurstRank program analysis before := by
  obtain ⟨current, consumer, _⟩ := positions.1 token (by simp [single])
  have named := consumer_names_the_input_operation program token.placeId current operation consumer member input
  have identity := projected_operation_preserves_identity program operation source projected
  obtain ⟨target, edge, nextConsumer⟩ := projected_output_has_analyzed_edge program operation source next.placeId projected output
  have ordered := analysis_computes_from_complete_forward_order vertices analysis graph
  have decreased := automatic_edge_decreases_burst_rank analysis.ordered source target
    (analysis_ordered_ids_unique vertices analysis graph) ordered.2.2.1 included edge automatic
  simpa [runtimeBurstRank, single, tokens, pendingBefore, pendingAfter, consumer, nextConsumer,
    identity, named] using decreased

theorem choice_decreases_runtime_burst_rank
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input defaultOutput : ControlPlaceId)
    (candidates : List ConditionalCandidate) (defaultOrigin : BpmnSequenceFlowOrigin)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (member : SemanticOperation.choose id origin input candidates defaultOutput defaultOrigin ∈ program.operations)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (fired : fire? program (.choose id origin input candidates defaultOutput defaultOrigin) before = some after) :
    runtimeBurstRank program analysis after < runtimeBurstRank program analysis before := by
  have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
  have active := fired
  rw [fire_choose_withoutSnapshotDeclaration _ _ _ _ _ _ _ _ absent] at active
  obtain ⟨owner, owned, _⟩ := Option.bind_eq_some_iff.mp active
  obtain ⟨token, single, _, pending⟩ := enabled_token_under_bound_is_single before input owner bounded owned
  obtain ⟨_, _, pendingAfter, place, next, tokens, output⟩ := choice_preserves_single_control_token
    program before after token id origin input defaultOutput candidates defaultOrigin single fired
  obtain ⟨source, included, projected⟩ := program_analysis_projects_each_executable_operation program analysis _ analyzed member rfl
  have kind : source.kind = .choice := by
    have projection := projected
    simp [operationVertex?, bind, Option.bind_eq_some_iff] at projection
    obtain ⟨_, _, _, same⟩ := projection
    cases same
    rfl
  exact routing_frame_decreases_runtime_burst_rank program vertices analysis before after _ source token next
    graph member included projected (Or.inr (Or.inl kind)) positions single
    (by simp [operationInputs, place]) tokens output pending (pendingAfter.trans pending)

theorem merge_decreases_runtime_burst_rank
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (inputs : List ControlPlaceId) (output : ControlPlaceId)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (member : SemanticOperation.mergeExclusive id origin inputs output ∈ program.operations)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (fired : fire? program (.mergeExclusive id origin inputs output) before = some after) :
    runtimeBurstRank program analysis after < runtimeBurstRank program analysis before := by
  have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
  have active := fired
  rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ absent] at active
  unfold mergeExclusiveState? at active
  split at active
  · rename_i token selected
    have offered : token ∈ exclusiveMergeInputTokens before inputs := by rw [selected]; simp
    obtain ⟨single, _, pending⟩ := live_token_under_bound_is_single before token bounded (List.mem_filter.mp offered).1
    obtain ⟨input, _, next, tokens, outputEq⟩ := merge_moves_single_token_to_output program before after token id origin inputs output single fired
    have pendingAfter : after.initiationPending = false := by
      cases Option.some.inj active
      exact pending
    obtain ⟨source, included, projected⟩ := program_analysis_projects_each_executable_operation program analysis _ analyzed member rfl
    have kind : source.kind = .merge := by
      have projection := projected
      simp [operationVertex?, bind, Option.bind_eq_some_iff] at projection
      obtain ⟨_, _, _, same⟩ := projection
      cases same
      rfl
    exact routing_frame_decreases_runtime_burst_rank program vertices analysis before after _ source token next
      graph member included projected (Or.inr (Or.inr kind)) positions single input tokens
      (by simp [SemanticProcess.operationOutputs, outputEq]) pending pendingAfter
  · contradiction

theorem initiation_decreases_runtime_burst_rank
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (member : SemanticOperation.initiate id origin output ∈ program.operations)
    (bounded : ControlUnitBound before)
    (fired : fire? program (.initiate id origin output) before = some after) :
    runtimeBurstRank program analysis after < runtimeBurstRank program analysis before := by
  have pending : before.initiationPending = true := by
    have step := fire_sound program _ before after fired
    cases step with
    | initiate _ _ _ _ _ initiated =>
        obtain ⟨owner, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
        by_cases pending : before.initiationPending = true
        · exact pending
        · simp [pending] at initiated
  have counts := bounded
  simp [ControlUnitBound, pending] at counts
  obtain ⟨_, _, pendingAfter, token, tokens, place⟩ :=
    initiation_creates_single_control_token program before after id origin output counts.1 fired
  obtain ⟨source, included, projected⟩ := program_analysis_projects_each_executable_operation program analysis _ analyzed member rfl
  have kind : source.kind = .start := by
    have projection := projected
    simp [operationVertex?, bind, Option.bind_eq_some_iff] at projection
    obtain ⟨_, _, same⟩ := projection
    cases same
    rfl
  obtain ⟨target, edge, consumer⟩ := projected_output_has_analyzed_edge program _ source output projected (by simp [SemanticProcess.operationOutputs])
  obtain ⟨_, permutation, forward, _, _, maximum⟩ := analysis_computes_from_complete_forward_order vertices analysis graph
  have decreases := automatic_edge_decreases_burst_rank analysis.ordered source target
    (analysis_ordered_ids_unique vertices analysis graph) forward included edge (Or.inl kind)
  have bound := (maximum_burst_bounds_resumption vertices analysis.ordered source
    (permutation.mem_iff.mp included)).1 kind
  rw [← maximum] at bound
  simpa [runtimeBurstRank, pending, pendingAfter, tokens, place, consumer] using Nat.lt_of_lt_of_le decreases bound

theorem arming_frame_decreases_runtime_burst_rank
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (token : ControlToken) (analyzed : programAnalysis program = some analysis)
    (graph : analyze vertices = some analysis) (positions : RuntimeInputPositions program vertices analysis before)
    (single : before.tokens = [token]) (tokens : after.tokens = []) (waits : after.waits.length = 1)
    (pendingBefore : before.initiationPending = false) (pendingAfter : after.initiationPending = false) :
    runtimeBurstRank program analysis after < runtimeBurstRank program analysis before := by
  obtain ⟨current, consumer, _⟩ := positions.1 token (by simp [single])
  obtain ⟨_, _, source, included, _, _, identity⟩ := consumer_has_analyzed_target program analysis _ _ analyzed consumer
  have ordered := analysis_computes_from_complete_forward_order vertices analysis graph
  have positive := burst_rank_positive analysis.ordered source
    (analysis_ordered_ids_unique vertices analysis graph) ordered.2.2.1 included
  have nonempty : after.waits.isEmpty = false := by
    cases found : after.waits <;> simp_all
  simpa [runtimeBurstRank, tokens, single, pendingBefore, pendingAfter, nonempty, consumer, identity] using positive

theorem ordinary_arming_decreases_runtime_burst_rank
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId) (task : UserTaskDefinition)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (fired : fire? program (.awaitUserTask id origin input output task) before = some after) :
    runtimeBurstRank program analysis after < runtimeBurstRank program analysis before := by
  have step := fire_sound program _ before after fired
  cases step with
  | awaitUserTask _ _ _ _ _ _ _ activated =>
      obtain ⟨owner, owned, _⟩ := Option.bind_eq_some_iff.mp activated
      obtain ⟨token, single, noWait, pending⟩ := enabled_token_under_bound_is_single before input owner bounded owned
      obtain ⟨tokens, waits, pendingAfter, _⟩ := ordinary_arming_replaces_single_token_with_single_wait
        program before after token id origin input output task single noWait fired
      exact arming_frame_decreases_runtime_burst_rank program vertices analysis before after token
        analyzed graph positions single tokens waits pending (pendingAfter.trans pending)

theorem data_arming_decreases_runtime_burst_rank
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (taskId : TaskDefinitionId) (taskName : Option String)
    (directInput : DirectActivityDataInput) (directOutput : DirectActivityDataOutput)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (fired : fire? program (.awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput) before = some after) :
    runtimeBurstRank program analysis after < runtimeBurstRank program analysis before := by
  have step := fire_sound program _ before after fired
  cases step with
  | awaitDataInputOutputUserTask _ _ _ _ _ _ _ _ _ _ activated =>
      obtain ⟨owner, owned, _⟩ := Option.bind_eq_some_iff.mp activated
      obtain ⟨token, single, noWait, pending⟩ := enabled_token_under_bound_is_single before input owner bounded owned
      obtain ⟨tokens, waits, pendingAfter, _⟩ := data_arming_replaces_single_token_with_single_wait
        program before after token id origin input output taskId taskName directInput directOutput single noWait fired
      exact arming_frame_decreases_runtime_burst_rank program vertices analysis before after token
        analyzed graph positions single tokens waits pending (pendingAfter.trans pending)

theorem none_end_decreases_runtime_burst_rank
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (member : SemanticOperation.reachNoneEnd id origin input ∈ program.operations)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (fired : fire? program (.reachNoneEnd id origin input) before = some after) :
    runtimeBurstRank program analysis after < runtimeBurstRank program analysis before := by
  have absent := fire_isSome_snapshotDeclaration_is_absent program _ before (congrArg Option.isSome fired)
  have active := fired
  rw [fire_reachNoneEnd_withoutSnapshotDeclaration _ _ _ _ _ absent] at active
  obtain ⟨owner, owned, _⟩ := Option.bind_eq_some_iff.mp active
  obtain ⟨token, single, noWait, pending⟩ := enabled_token_under_bound_is_single before input owner bounded owned
  have place := (singleton_token_owner before token input owner single owned).1
  obtain ⟨tokens, waits, pendingAfter⟩ := none_end_consumes_single_control_token program before after token id origin input single fired
  obtain ⟨current, consumer, _⟩ := positions.1 token (by simp [single])
  have named := consumer_names_the_input_operation program token.placeId current _ consumer member (by simp [operationInputs, place])
  obtain ⟨source, included, projected⟩ := program_analysis_projects_each_executable_operation program analysis _ analyzed member rfl
  have identity := projected_operation_preserves_identity program _ source projected
  have kind : source.kind = .finish := by
    simp [operationVertex?] at projected
    cases projected
    rfl
  have ordered := analysis_computes_from_complete_forward_order vertices analysis graph
  have rank := burst_rank_equation analysis.ordered source
    (analysis_ordered_ids_unique vertices analysis graph) ordered.2.2.1 included
  simp only [kind, identity] at rank
  simp only [runtimeBurstRank, pending, pendingAfter, tokens, waits, noWait, single, consumer, named,
    Bool.false_eq_true, ↓reduceIte, Option.map_some, Option.getD_some, List.isEmpty_nil]
  cases after.control <;> simp [rank]

theorem noncompletion_fire_decreases_runtime_burst_rank
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (operation : SemanticOperation) (analyzed : programAnalysis program = some analysis)
    (graph : analyze vertices = some analysis) (member : operation ∈ program.operations)
    (notCompletion : isScopeCompletion operation = false)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (fired : fire? program operation before = some after) :
    runtimeBurstRank program analysis after < runtimeBurstRank program analysis before := by
  have allowed := program_analysis_operations_allowed program analysis analyzed operation member
  cases operation <;> simp only [OperationAllowed, isScopeCompletion] at allowed notCompletion
  all_goals try contradiction
  case initiate id origin output =>
    exact initiation_decreases_runtime_burst_rank program vertices analysis before after id origin output
      analyzed graph member bounded fired
  case awaitUserTask id origin input output task =>
    exact ordinary_arming_decreases_runtime_burst_rank program vertices analysis before after id origin input output task
      analyzed graph positions bounded fired
  case awaitDataInputOutputUserTask id origin input output taskId taskName directInput directOutput =>
    exact data_arming_decreases_runtime_burst_rank program vertices analysis before after id origin input output
      taskId taskName directInput directOutput analyzed graph positions bounded fired
  case choose id origin input candidates defaultOutput defaultOrigin =>
    exact choice_decreases_runtime_burst_rank program vertices analysis before after id origin input defaultOutput
      candidates defaultOrigin analyzed graph member positions bounded fired
  case mergeExclusive id origin inputs output =>
    exact merge_decreases_runtime_burst_rank program vertices analysis before after id origin inputs output
      analyzed graph member positions bounded fired
  case reachNoneEnd id origin input =>
    exact none_end_decreases_runtime_burst_rank program vertices analysis before after id origin input
      analyzed graph member positions bounded fired

theorem task_execution_preserves_root_ownership
    (program : Program) (analysis : Analysis) (initial reached : RuntimeState) (owner : ScopeOccurrenceId)
    (analyzed : programAnalysis program = some analysis) (owned : RootOwnedControl owner initial)
    (bounded : ControlUnitBound initial) (reachable : TaskExecutionReachable program initial reached) :
    RootOwnedControl owner reached := by
  induction reachable with
  | initial => exact owned
  | step choice reachable executed ih =>
    have bound := task_execution_reachable_preserves_control_unit_bound program analysis _ _ analyzed bounded reachable
    unfold SemanticProcess.step at executed
    split at executed
    · contradiction
    · rename_i operation selected
      exact admitted_fire_preserves_root_ownership program analysis _ _ operation owner analyzed
        (List.mem_of_find?_eq_some selected) ih bound executed
  | completion commandId taskId bindings reachable ih =>
    exact completion_admission_preserves_root_ownership program analysis _ commandId taskId bindings owner analyzed ih

theorem root_completion_decreases_runtime_burst_rank
    (program : Program) (analysis : Analysis) (before after : RuntimeState) (owner : ScopeOccurrenceId)
    (id : OperationId) (origin : BpmnElementOrigin) (scope : DefinitionScopeId)
    (analyzed : programAnalysis program = some analysis) (owned : RootOwnedControl owner before)
    (fired : fire? program (.completeScope id origin scope none) before = some after) :
    runtimeBurstRank program analysis after < runtimeBurstRank program analysis before := by
  have step := fire_sound program _ before after fired
  cases step with
  | completeScope _ _ _ _ _ _ completed =>
    change completeSelectedScope? program before scope none = some after at completed
    rw [selected_scope_completion_delegates_to_root program before scope
      (program_analysis_operations_allowed program analysis analyzed)] at completed
    unfold completeScopeState? at completed
    split at completed
    · rename_i occurrence selected
      have member : occurrence ∈ before.scopeOccurrences.filter (fun candidate =>
          decide (candidate.id.definitionScopeId = scope)) := by rw [selected]; simp
      have same := owned.1 occurrence (List.mem_filter.mp member).1
      split at completed
      · contradiction
      · rename_i quiet
        have tokens : before.tokens = [] := by
          apply List.eq_nil_iff_forall_not_mem.mpr
          intro token live
          have present : (before.tokens.any fun token => token.owner == occurrence.id) = true :=
            List.any_eq_true.mpr ⟨token, live, by simp [owned.2.1 token live, same]⟩
          simp [scopeQuiescent, present] at quiet
        have waits : before.waits = [] := by
          apply List.eq_nil_iff_forall_not_mem.mpr
          intro wait live
          have present : (before.waits.any fun wait => wait.owner == occurrence.id) = true :=
            List.any_eq_true.mpr ⟨wait, live, by simp [owned.2.2 wait live, same]⟩
          simp [scopeQuiescent, present] at quiet
        unfold completeQuiescentScope? at completed
        split at completed
        · rename_i instanceId parent running
          split at completed
          · contradiction
          · rename_i pending
            cases Option.some.inj completed
            simp [runtimeBurstRank, tokens, waits, pending, running]
        · contradiction
        · contradiction
    · contradiction

/-- Actual reachability supplies the control, root-ownership and position invariants for every admitted operation. -/
theorem reached_fire_decreases_burst_rank
    (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (reached after : RuntimeState) (operation : SemanticOperation)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state reached)
    (member : operation ∈ program.operations)
    (fired : fire? program operation reached = some after) :
    runtimeBurstRank program analysis after < runtimeBurstRank program analysis reached := by
  obtain ⟨_, _, _, vertices, _, _, graph⟩ := program_analysis_projection program analysis analyzed
  have startPositions := committed_start_has_input_positions program vertices analysis commandId processId instanceId
    bindings profile committed
  have startBound := committed_start_task_execution_has_at_most_one_control_unit program analysis commandId processId
    instanceId bindings _ profile analyzed committed .initial
  have positions := task_execution_preserves_input_positions program vertices analysis _ reached wellFormed profile
    analyzed graph startPositions startBound reachable
  have bounded := task_execution_reachable_preserves_control_unit_bound program analysis _ reached analyzed startBound reachable
  by_cases notCompletion : isScopeCompletion operation = false
  · exact noncompletion_fire_decreases_runtime_burst_rank program vertices analysis reached after operation
      analyzed graph member notCompletion positions bounded fired
  · obtain ⟨owner, startOwned⟩ := committed_start_has_root_owner program commandId processId instanceId bindings profile committed
    have owned := task_execution_preserves_root_ownership program analysis _ reached owner analyzed startOwned startBound reachable
    have allowed := program_analysis_operations_allowed program analysis analyzed operation member
    cases operation <;> simp only [isScopeCompletion] at notCompletion
    all_goals try contradiction
    case completeScope id origin scope output =>
      cases output with
      | none => exact root_completion_decreases_runtime_burst_rank program analysis reached after owner id origin scope analyzed owned fired
      | some output => simp [OperationAllowed] at allowed

theorem continuation_frame_within_burst_bound
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (after : RuntimeState)
    (source : Vertex) (next : ControlToken) (target : String)
    (graph : analyze vertices = some analysis) (included : source ∈ analysis.ordered)
    (task : source.kind = .task) (edge : target ∈ source.outputs)
    (tokens : after.tokens = [next]) (consumer : consumer? program next.placeId = some target)
    (bounded : ControlUnitBound after) : runtimeBurstRank program analysis after ≤ analysis.maximumBurst := by
  have pending := (live_token_under_bound_is_single after next bounded (by simp [tokens])).2.2
  obtain ⟨_, permutation, _, _, _, maximum⟩ := analysis_computes_from_complete_forward_order vertices analysis graph
  have bound := (maximum_burst_bounds_resumption vertices analysis.ordered source
    (permutation.mem_iff.mp included)).2 task target edge
  simpa [runtimeBurstRank, tokens, pending, consumer, maximum] using bound

theorem data_completion_within_burst_bound
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (instanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat) (bindings : List VariableBinding)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (bounded : ControlUnitBound before)
    (completed : completeDataInputOutputUserTask? program before instanceId taskId activation bindings = some after) :
    runtimeBurstRank program analysis after ≤ analysis.maximumBurst := by
  obtain ⟨contract, _, next, declared, _, _, _, tokens, output⟩ :=
    data_completion_has_exact_continuation program before after instanceId taskId activation bindings bounded completed
  obtain ⟨source, included, target, consumer, shape, _, _⟩ :=
    completion_contract_has_analyzed_vertex program analysis taskId contract analyzed declared
  exact continuation_frame_within_burst_bound program vertices analysis after source next target graph included
    (by simp [shape]) (by simp [shape]) tokens (by simpa [output] using consumer)
    (data_completion_preserves_control_unit_bound program before after instanceId taskId activation bindings bounded completed)

theorem ordinary_completion_within_burst_bound
    (program : Program) (vertices : List Vertex) (analysis : Analysis) (before after : RuntimeState)
    (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis) (graph : analyze vertices = some analysis)
    (positions : RuntimeInputPositions program vertices analysis before) (bounded : ControlUnitBound before)
    (accepted : structuredCompositionOrdinaryCompletionAdmitted program taskId bindings = true)
    (completed : completeUserTask before taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation = some after) :
    runtimeBurstRank program analysis after ≤ analysis.maximumBurst := by
  obtain ⟨id, origin, input, output, task, member, taskKey⟩ :=
    ordinary_completion_admission_has_declaration program taskId bindings profile accepted
  obtain ⟨wait, live, next, key, _, tokens, place⟩ := ordinary_completion_has_exact_continuation
    before after taskId.processInstanceId ⟨taskId.elementId.value⟩ taskId.activation bounded completed
  have declares : operationDeclaresWaitKey (.awaitUserTask id origin input output task)
      (userTaskWaitDeclarationKey wait.task.id) = true := by
    simp [operationDeclaresWaitKey, operationWaitDeclarationKeys, userTaskWaitDeclarationKey, key, taskKey]
  have matched := (input_positions_for_declared_wait program vertices analysis before wait _
    wellFormed positions live member declares).1
  obtain ⟨source, included, projected⟩ := program_analysis_projects_each_executable_operation
    program analysis _ analyzed member rfl
  simp [operationVertex?, bind, Option.bind_eq_some_iff] at projected
  obtain ⟨_, target, consumer, shape⟩ := projected
  exact continuation_frame_within_burst_bound program vertices analysis after source next target graph included
    (by simp [← shape]) (by simp [← shape]) tokens (by simpa [place, matched.2] using consumer)
    (ordinary_completion_preserves_control_unit_bound before after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation bounded completed)

theorem accepted_completion_within_burst_bound
    (program : Program) (analysis : Analysis)
    (startCommand processId instanceId : SemanticId) (initialBindings : List VariableBinding)
    (reached : RuntimeState) (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (started : (admitStimulus program initialState
      (.startProcess startCommand processId instanceId initialBindings)).outcome = .committed)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess startCommand processId instanceId initialBindings)).state reached)
    (accepted : (admitStimulus program reached
      (.completeUserTaskInstance commandId taskId bindings)).outcome = .committed) :
    runtimeBurstRank program analysis (admitStimulus program reached
      (.completeUserTaskInstance commandId taskId bindings)).state ≤ analysis.maximumBurst := by
  obtain ⟨_, _, _, vertices, _, _, graph⟩ := program_analysis_projection program analysis analyzed
  have startPositions := committed_start_has_input_positions program vertices analysis startCommand processId instanceId
    initialBindings profile started
  have startBound := committed_start_task_execution_has_at_most_one_control_unit program analysis startCommand processId
    instanceId initialBindings _ profile analyzed started .initial
  have positions := task_execution_preserves_input_positions program vertices analysis _ reached wellFormed profile
    analyzed graph startPositions startBound reachable
  have bounded := task_execution_reachable_preserves_control_unit_bound program analysis _ reached analyzed startBound reachable
  rcases completion_admission_cases program analysis reached commandId taskId bindings analyzed with refused |
    ⟨after, completed, _, result⟩ | ⟨after, completed, ordinary, _, result⟩ | ⟨after, _, call, _, _⟩
  · simp [refused] at accepted
  · rw [result]
    exact data_completion_within_burst_bound program vertices analysis reached after taskId.processInstanceId
      ⟨taskId.elementId.value⟩ taskId.activation bindings analyzed graph bounded completed
  · rw [result]
    exact ordinary_completion_within_burst_bound program vertices analysis reached after taskId bindings
      wellFormed profile analyzed graph positions bounded ordinary completed
  · simp [isCallActivityProgram, profile, structuredCompositionCheckpointProfileId] at call

/-- A finite sequence of actual operation selections spends one rank unit per successful step. -/
theorem internal_sequence_spends_burst_rank
    (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (choices : List OperationId) (before after : RuntimeState)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state before)
    (executed : choices.foldlM (SemanticProcess.step program) before = some after) :
    choices.length + runtimeBurstRank program analysis after ≤ runtimeBurstRank program analysis before := by
  induction choices generalizing before with
  | nil =>
    have same : before = after := by simpa using executed
    simp [same]
  | cons choice choices ih =>
    simp only [List.foldlM_cons, bind, Option.bind_eq_some_iff] at executed
    obtain ⟨next, stepped, rest⟩ := executed
    have suffix := ih next (.step choice reachable stepped) rest
    have decreased : runtimeBurstRank program analysis next < runtimeBurstRank program analysis before := by
      unfold SemanticProcess.step at stepped
      split at stepped
      · contradiction
      · rename_i operation selected
        exact reached_fire_decreases_burst_rank program analysis commandId processId instanceId bindings before next
          operation wellFormed profile analyzed committed reachable (List.mem_of_find?_eq_some selected) stepped
    simp only [List.length_cons]
    omega

theorem accepted_completion_internal_sequence_is_bounded
    (program : Program) (analysis : Analysis)
    (startCommand processId instanceId : SemanticId) (initialBindings : List VariableBinding)
    (reached after : RuntimeState) (commandId : SemanticId) (taskId : UserTaskInstanceId)
    (bindings : List VariableBinding) (choices : List OperationId)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (started : (admitStimulus program initialState
      (.startProcess startCommand processId instanceId initialBindings)).outcome = .committed)
    (reachable : TaskExecutionReachable program
      (admitStimulus program initialState (.startProcess startCommand processId instanceId initialBindings)).state reached)
    (accepted : (admitStimulus program reached (.completeUserTaskInstance commandId taskId bindings)).outcome = .committed)
    (executed : choices.foldlM (SemanticProcess.step program)
      (admitStimulus program reached (.completeUserTaskInstance commandId taskId bindings)).state = some after) :
    choices.length ≤ scenarioClosureLimit := by
  have spent := internal_sequence_spends_burst_rank program analysis startCommand processId instanceId initialBindings
    wellFormed profile analyzed started choices _ after (.completion commandId taskId bindings reachable) executed
  have bound := accepted_completion_within_burst_bound program analysis startCommand processId instanceId initialBindings
    reached commandId taskId bindings wellFormed profile analyzed started reachable accepted
  have limit := committed_start_bounds_analysis program initialState analysis startCommand processId instanceId
    initialBindings profile analyzed started
  omega

theorem accepted_start_internal_sequence_is_bounded
    (program : Program) (analysis : Analysis) (commandId processId instanceId : SemanticId)
    (bindings : List VariableBinding) (choices : List OperationId) (after : RuntimeState)
    (wellFormed : programWellFormed program = true)
    (profile : program.identity.semanticProfile = structuredCompositionCheckpointProfileId)
    (analyzed : programAnalysis program = some analysis)
    (started : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (executed : choices.foldlM (SemanticProcess.step program)
      (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state = some after) :
    choices.length ≤ scenarioClosureLimit := by
  have spent := internal_sequence_spends_burst_rank program analysis commandId processId instanceId bindings
    wellFormed profile analyzed started choices _ after .initial executed
  have pending := (committed_initial_start_control_fields program commandId processId instanceId bindings profile started).2.2
  have limit := committed_start_bounds_analysis program initialState analysis commandId processId instanceId bindings
    profile analyzed started
  simp only [runtimeBurstRank, pending, ↓reduceIte] at spent
  omega

end BpmnSemantics.SemanticProcess.StructuredComposition

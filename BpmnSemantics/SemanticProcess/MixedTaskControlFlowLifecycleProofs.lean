import BpmnSemantics.SemanticProcess.MixedTaskBusinessErrorCompletionProofs
import BpmnSemantics.SemanticProcess.SerialBusinessTaskLifecycleProofs

/-! MTCF-PROGRESS-01 and MTCF-REPEAT-01 require one graph-indexed control unit with exact wait ownership and an actual Start-derived root frame, independent of any assumed serial traversal order. -/

namespace BpmnSemantics.SemanticProcess.MixedTaskControlFlow

open SerialBusinessTask (DeclaredRoot RootFrame RootLifecycle ForeignRuntimeEmpty IssuanceFrame
  DeclaredToken frontierFields)

/-- MTCF-PROGRESS-01 indexes the actual single control unit without imposing a serial order on the graph. -/
inductive Position (program : Program) (analysis : Analysis) (state : RuntimeState) : Option Vertex → Prop where
  | pending (vertex : Vertex) (member : vertex ∈ analysis.vertices)
      (start : vertex.id = analysis.startId) (kind : vertex.kind = .start)
      (fields : frontierFields state = (true, [], [], [], [])) :
      Position program analysis state (some vertex)
  | token (vertex : Vertex) (member : vertex ∈ analysis.vertices) (token : ControlToken)
      (fields : frontierFields state = (false, [token], [], [], []))
      (consumer : consumer? program token.placeId = some vertex.id)
      (bound : DeclaredToken program token) : Position program analysis state (some vertex)
  | human (vertex : Vertex) (member : vertex ∈ analysis.vertices) (wait : UserTaskWait)
      (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId)
      (fields : frontierFields state = (false, [], [wait], [], []))
      (declared : .awaitUserTask id origin input wait.output wait.task ∈ program.operations)
      (projected : operationVertex? program (.awaitUserTask id origin input wait.output wait.task) = some vertex)
      (metadata : wait.metadata = wait.task.metadata)
      (owned : operationOwningScope? program id = some wait.owner.definitionScopeId) :
      Position program analysis state (some vertex)
  | effect (vertex : Vertex) (member : vertex ∈ analysis.vertices) (wait : EffectWait)
      (id : OperationId) (origin : BpmnElementOrigin) (input : ControlPlaceId) (effect : EffectDefinition)
      (fields : frontierFields state = (false, [], [], [wait],
        [{ owner := .effectOccurrence ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩,
           bindings := wait.arguments }]))
      (declared : .awaitEffect id origin input wait.output effect wait.bpmnErrorRoute ∈ program.operations)
      (projected : operationVertex? program (.awaitEffect id origin input wait.output effect wait.bpmnErrorRoute) = some vertex)
      (element : effect.elementId = wait.elementId) (descriptor : effect.descriptor = wait.descriptor)
      (outputs : effect.outputMappings = wait.outputMappings)
      (snapshot : inputSnapshotMatches effect.inputMappings wait.arguments = true)
      (owned : operationOwningScope? program id = some wait.owner.definitionScopeId) :
      Position program analysis state (some vertex)
  | finished (fields : frontierFields state = (false, [], [], [], [])) :
      Position program analysis state none

def AtPosition (program : Program) (analysis : Analysis) (state : RuntimeState) : Prop :=
  ∃ frontier, Position program analysis state frontier ∧
    (match frontier with
      | some vertex => InputsAvailable analysis.vertices vertex.id state.variables.process.bindings
      | none => True) ∧
    SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) state.variables.process.bindings = true

theorem indexed_collection_storage (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (framed : RootFrame owner state) (indexed : AtPosition program analysis state) :
    committedStateCollectionAdmitted state = true := by
  apply SerialBusinessTask.root_frontier_collection_storage state owner framed
  obtain ⟨_, position, _⟩ := indexed
  cases position <;> simp_all [frontierFields]

theorem analyzed_definition_root (program : Program) (analysis : Analysis)
    (analyzed : programAnalysis program = some analysis) :
    ∃ root, program.definitionScopes = [root] ∧ programOwnershipValid program root = true := by
  unfold programAnalysis at analyzed
  obtain ⟨root, selected, analyzed⟩ := Option.bind_eq_some_iff.mp analyzed
  refine ⟨root, SerialBusinessTask.unique_some selected, ?_⟩
  split at analyzed
  · contradiction
  · simp_all

theorem analyzed_start_root_declared (program : Program) (analysis : Analysis)
    (instanceId : SemanticId) (root : DefinitionScope)
    (analyzed : programAnalysis program = some analysis)
    (found : rootDefinitionScope? program = some root) :
    DeclaredRoot program ⟨instanceId, root.id, 1⟩ := by
  obtain ⟨selected, scopes, owned⟩ := analyzed_definition_root program analysis analyzed
  have flags : selected.parentScopeId = none ∧ selected.originElementId.value = program.processId.value := by
    simp_all [programOwnershipValid]
  have same : selected = root := by
    simpa [rootDefinitionScope?, scopes, flags.1, flags.2] using found
  subst selected
  exact ⟨root, scopes, flags.1, flags.2, rfl, rfl⟩

theorem committed_start_has_exact_builder (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    runningProgramStartState? program instanceId bindings = some (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).state := by
  rcases profile with profile | profile
  all_goals
    obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
    have guarded := serial_committed_ingress_has_checked_predecessor program initialState
      (.startProcess commandId processId instanceId bindings) committed
    cases created : runningProgramStartState? program instanceId bindings with
    | none =>
        simp [admitStimulus, snapshots, guarded, profile, created,
          show initialState.effectIncidents = [] from rfl,
          show initialState.control = .notStarted from rfl] at committed
        repeat' (split at committed <;> simp_all)
    | some started =>
        simp [admitStimulus, snapshots, guarded, profile, created,
          show initialState.effectIncidents = [] from rfl,
          show initialState.control = .notStarted from rfl] at committed ⊢
        repeat' (split at committed <;> simp_all)

/-- The actual admitted Start establishes the root lifetime, issuance frame, graph position and data obligations together. -/
theorem committed_start_has_invariant (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    ∃ owner, owner.processInstanceId = instanceId ∧ DeclaredRoot program owner ∧
      RootFrame owner (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state ∧
      AtPosition program analysis (admitStimulus program initialState (.startProcess commandId processId instanceId bindings)).state := by
  have supplied := committed_start_inputs_available program analysis commandId processId instanceId bindings profile analyzed committed
  obtain ⟨noRetention, _, _, noListeners⟩ := program_analysis_declarations_absent program analysis analyzed
  have created := committed_start_has_exact_builder program analysis commandId processId instanceId bindings profile analyzed committed
  simp only [runningProgramStartState?, bind, pure, Option.bind_eq_some_iff] at created
  obtain ⟨root, found, created⟩ := created
  refine ⟨⟨instanceId, root.id, 1⟩, rfl, analyzed_start_root_declared program analysis instanceId root analyzed found, ?_, ?_⟩
  · rw [← Option.some.inj created]
    simp [RootFrame, RootLifecycle, ForeignRuntimeEmpty, IssuanceFrame, orderedBy, noRetention, noListeners,
      runningStartState, initialState, emptyScopedVariables]
  · rw [← Option.some.inj created]
    obtain ⟨vertex, member, kind, named⟩ :=
      (analyze_facts analysis.vertices analysis (program_analysis_graph program analysis analyzed)).start
    exact ⟨some vertex, .pending vertex member named kind rfl,
      by simpa only [named, runningStartState] using supplied.2, supplied.1⟩

theorem position_single_control (program : Program) (analysis : Analysis) (state : RuntimeState)
    (frontier : Option Vertex) (position : Position program analysis state frontier) :
    (if state.initiationPending then 1 else 0) + state.tokens.length + state.waits.length + state.effectWaits.length ≤ 1 := by
  cases position <;> simp_all [frontierFields]

theorem position_with_pending_is_start (program : Program) (analysis : Analysis)
    (state : RuntimeState) (frontier : Option Vertex) (position : Position program analysis state frontier)
    (pending : state.initiationPending = true) :
    ∃ vertex ∈ analysis.vertices, frontier = some vertex ∧ vertex.id = analysis.startId ∧ vertex.kind = .start ∧
      frontierFields state = (true, [], [], [], []) := by
  cases position with
  | pending vertex member start kind fields => exact ⟨vertex, member, rfl, start, kind, fields⟩
  | token | human | effect | finished => simp_all [frontierFields]

theorem position_with_token (program : Program) (analysis : Analysis) (state : RuntimeState)
    (frontier : Option Vertex) (input : ControlPlaceId) (owner : ScopeOccurrenceId)
    (position : Position program analysis state frontier) (found : onlyTokenOwner? state input = some owner) :
    ∃ vertex ∈ analysis.vertices, ∃ token, frontier = some vertex ∧
      frontierFields state = (false, [token], [], [], []) ∧ token.placeId = input ∧
      owner = token.owner ∧ consumer? program input = some vertex.id ∧ DeclaredToken program token := by
  cases position with
  | token vertex member token fields consumer bound =>
      have parts := fields
      simp only [frontierFields, Prod.mk.injEq] at parts
      by_cases matching : token.placeId = input
      · simp [onlyTokenOwner?, tokenOwners, parts.2.1, matching] at found
        exact ⟨vertex, member, token, rfl, fields, matching, found.symm, by simpa [matching] using consumer, bound⟩
      · simp [onlyTokenOwner?, tokenOwners, parts.2.1, matching] at found
  | pending | human | effect | finished => simp_all [frontierFields, onlyTokenOwner?, tokenOwners]

theorem position_with_offered_token (program : Program) (analysis : Analysis) (state : RuntimeState)
    (frontier : Option Vertex) (token : ControlToken) (position : Position program analysis state frontier)
    (offered : token ∈ state.tokens) :
    ∃ vertex ∈ analysis.vertices, frontier = some vertex ∧
      frontierFields state = (false, [token], [], [], []) ∧
      consumer? program token.placeId = some vertex.id ∧ DeclaredToken program token := by
  cases position with
  | token vertex member current fields consumer bound =>
      have same : token = current := by
        have parts := fields
        simp only [frontierFields, Prod.mk.injEq] at parts
        simpa [parts.2.1] using offered
      subst current
      exact ⟨vertex, member, rfl, fields, consumer, bound⟩
  | pending | human | effect | finished => simp_all [frontierFields]

theorem position_frame (program : Program) (analysis : Analysis) (frontier : Option Vertex)
    (before after : RuntimeState) (position : Position program analysis before frontier)
    (same : frontierFields after = frontierFields before) : Position program analysis after frontier := by
  cases position with
  | pending vertex member start kind fields => exact .pending vertex member start kind (same.trans fields)
  | token vertex member token fields consumer bound => exact .token vertex member token (same.trans fields) consumer bound
  | human vertex member wait id origin input fields declared projected metadata owned =>
      exact .human vertex member wait id origin input (same.trans fields) declared projected metadata owned
  | effect vertex member wait id origin input effect fields declared projected element descriptor outputs snapshot owned =>
      exact .effect vertex member wait id origin input effect (same.trans fields) declared projected
        element descriptor outputs snapshot owned
  | finished fields => exact .finished (same.trans fields)

theorem admitted_start_id (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) (vertex : Vertex) (member : vertex ∈ vertices)
    (kind : vertex.kind = .start) : vertex.id = analysis.startId := by
  have facts := analyze_facts vertices analysis accepted
  obtain ⟨first, firstMember, firstKind, named⟩ := facts.start
  obtain ⟨only, selected⟩ := List.length_eq_one_iff.mp facts.start_unique
  have current : vertex ∈ vertices.filter (·.kind == .start) := by simp [member, kind]
  have initial : first ∈ vertices.filter (·.kind == .start) := by simp [firstMember, firstKind]
  rw [selected] at current initial
  simpa [List.mem_singleton.mp current, List.mem_singleton.mp initial] using named

theorem human_completion_preserves_position (program : Program) (analysis : Analysis)
    (before after : RuntimeState) (instanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (patch : List VariableBinding)
    (patchValid : SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) patch = true)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis) (indexed : AtPosition program analysis before)
    (owner : ScopeOccurrenceId) (framed : RootFrame owner before)
    (completed : completeUserTask before instanceId taskId activation = some after) :
    let resumed := { after with variables := { after.variables with process :=
      { bindings := mergeProcessVariableBindings after.variables.process.bindings patch } } }
    RootFrame owner resumed ∧ AtPosition program analysis resumed := by
  dsimp only
  obtain ⟨tokensOwned, humansOwned, effectsOwned, life, foreign, issued⟩ := framed
  obtain ⟨frontier, position, available, canonical⟩ := indexed
  have graph := program_analysis_graph program analysis analyzed
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
    | pending vertex member start kind fields =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        simp [fields.2.2.1] at live
    | token vertex member token fields consumer bound =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        simp [fields.2.2.1] at live
    | effect vertex member wait id origin input effect fields declared projected element descriptor outputs snapshot owned =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        simp [fields.2.2.1] at live
    | finished fields =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        simp [fields.2.2.1] at live
    | human vertex member wait id origin input fields declared projected metadata owned =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        have same : selected = wait := by simpa [fields.2.2.1] using live
        subst selected
        simp [operationVertex?, Option.bind_eq_some_iff] at projected
        obtain ⟨_, nextId, consumer, vertexEq⟩ := projected
        have outputs : vertex.outputs = [nextId] := by rw [← vertexEq]
        have kind : vertex.kind = .human := by rw [← vertexEq]
        have edge : nextId ∈ vertex.outputs := by simp [outputs]
        obtain ⟨next, nextMember, named⟩ := output_has_vertex analysis.vertices analysis graph vertex member nextId edge
        cases Option.some.inj completed
        refine ⟨?_, ?_⟩
        · refine ⟨?_, ?_, effectsOwned, Or.inl runningLife, foreign, ?_⟩ <;>
            simp [fields.2.2.1, fields.2.1, root.1, addToken, canonicalInsertBy, IssuanceFrame] <;>
            exact ⟨issued.1, issued.2.1, issued.2.2.1, issued.2.2.2.2⟩
        refine ⟨some next, ?_, ?_, ?_⟩
        · apply Position.token next nextMember ⟨wait.output, wait.owner⟩
          · simp [frontierFields, fields.1, fields.2.1, fields.2.2.1, fields.2.2.2.1,
              fields.2.2.2.2, addToken, canonicalInsertBy]
          · simpa [named] using consumer
          · exact SerialBusinessTask.owned_operation_port program (.awaitUserTask id origin input wait.output wait.task) wait.output wait.owner
              wellFormed declared rfl (by change wait.output ∈ [input, wait.output]; simp) owned
        · change InputsAvailable analysis.vertices next.id _
          rw [named]
          exact human_patch_preserves_available analysis.vertices vertex nextId before.variables.process.bindings patch member edge kind available
        · exact SerialBusinessTask.bindings_merge_valid _ _ _
            (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp canonical).1)
            (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp patchValid).1) canonical patchValid

theorem effect_completion_preserves_position (program : Program) (analysis : Analysis)
    (before after : RuntimeState) (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis) (indexed : AtPosition program analysis before)
    (owner : ScopeOccurrenceId) (framed : RootFrame owner before)
    (completed : completeBusinessEffect? (SerialBusinessTask.programHandlers program) before effectId result = some after) :
    RootFrame owner after ∧ AtPosition program analysis after := by
  obtain ⟨tokensOwned, humansOwned, effectsOwned, life, foreign, issued⟩ := framed
  obtain ⟨frontier, position, available, canonical⟩ := indexed
  have graph := program_analysis_graph program analysis analyzed
  obtain ⟨selected, scope, patch, bindings, output, occurrence, owned, _, selectedOutput, mapped, successor⟩ :=
    business_completion_facts (SerialBusinessTask.programHandlers program) before after effectId result completed
  subst after
  have live : selected ∈ before.effectWaits := (List.mem_filter.mp
    (show selected ∈ before.effectWaits.filter (effectIdNamesWait effectId) by rw [occurrence]; simp)).1
  have runningLife : before.control = .running owner.processInstanceId ∧
      before.scopeOccurrences = [{ id := owner, parent := none }] := by
    rcases life with running | ⟨_, _, _, _, empty, _⟩
    · exact running
    · simp [empty] at live
  have root := effectsOwned selected live
  cases position with
  | pending vertex member start kind fields =>
      simp only [frontierFields, Prod.mk.injEq] at fields
      simp [fields.2.2.2.1] at live
  | token vertex member token fields consumer bound =>
      simp only [frontierFields, Prod.mk.injEq] at fields
      simp [fields.2.2.2.1] at live
  | human vertex member wait id origin input fields declared projected metadata owned =>
      simp only [frontierFields, Prod.mk.injEq] at fields
      simp [fields.2.2.2.1] at live
  | finished fields =>
      simp only [frontierFields, Prod.mk.injEq] at fields
      simp [fields.2.2.2.1] at live
  | effect vertex member wait id origin input effect fields declared projected element descriptor outputs snapshot owned =>
      simp only [frontierFields, Prod.mk.injEq] at fields
      have same : selected = wait := by simpa [fields.2.2.2.1] using live
      subst selected
      have localMatch : activityScopeMatches effectId
          { owner := .effectOccurrence ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩,
            bindings := wait.arguments } = true := by
        cases matched : activityScopeMatches effectId
            { owner := .effectOccurrence ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩,
              bindings := wait.arguments } <;> simp_all
      have data := service_projection_data program vertex id origin input wait.output effect wait.bpmnErrorRoute projected
      have mappings := data.2.1
      have targets : vertex.writes = wait.outputMappings.map (·.target) := by simpa [outputs] using data.2.2.2
      have outputMember := selected_effect_output_declared wait result output id origin input effect selectedOutput
      obtain ⟨nextId, edge, consumer⟩ := operation_output_consumer program
        (.awaitEffect id origin input wait.output effect wait.bpmnErrorRoute) vertex output projected outputMember
      obtain ⟨next, nextMember, named⟩ := output_has_vertex analysis.vertices analysis graph vertex member nextId edge
      refine ⟨?_, ?_⟩
      · refine ⟨?_, humansOwned, ?_, Or.inl runningLife, foreign, issued⟩ <;>
          simp [fields.2.2.2.1, fields.2.1, root.1, addToken, canonicalInsertBy]
      refine ⟨some next, ?_, ?_, ?_⟩
      · apply Position.token next nextMember ⟨output, wait.owner⟩
        · simp [frontierFields, fields.1, fields.2.1, fields.2.2.1, fields.2.2.2.1,
            fields.2.2.2.2, localMatch, addToken, canonicalInsertBy]
        · simpa [named] using consumer
        · apply SerialBusinessTask.owned_operation_port program (.awaitEffect id origin input wait.output effect wait.bpmnErrorRoute) output wait.owner
            wellFormed declared rfl ?_ owned
          cases routeEq : wait.bpmnErrorRoute <;> simp_all [operationControlPlaces, operationOutputs, SemanticProcess.operationOutputs]
      · change InputsAvailable analysis.vertices next.id bindings
        rw [named]
        exact service_patch_preserves_available analysis.vertices vertex nextId (SerialBusinessTask.programHandlers program) wait.outputMappings
          before.variables.process.bindings patch bindings member edge targets available mapped
      · have mappedOutputs : SerialBusinessTask.mappingsValid (SerialBusinessTask.programHandlers program) effect.inputMappings wait.outputMappings = true := by
          simpa [outputs] using mappings
        exact SerialBusinessTask.serial_patch_preserves_domain _ _ _ _ _ _
          (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp canonical).1)
          (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappedOutputs).1).1).2)
          canonical mappedOutputs mapped

def FirePhase (before : RuntimeState) (operation : SemanticOperation) (owner : ScopeOccurrenceId) : Prop :=
  (before.initiationPending = true ∧ (match operation with | .initiate .. => true | _ => false) = true) ∨
    (∃ token, before.tokens = [token] ∧ token.placeId ∈ operationInputs operation) ∨
    (before.initiationPending = false ∧ before.tokens = [] ∧ before.waits = [] ∧ before.effectWaits = [] ∧
      StructuredComposition.isScopeCompletion operation = true ∧ before.control = .running owner.processInstanceId)

/-- Selection must consume the indexed control unit; phase facts are derived from the actual firing rather than supplied as readiness assumptions. -/
theorem fire_phase (program : Program) (analysis : Analysis) (before after : RuntimeState)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId) (frontier : Option Vertex)
    (analyzed : programAnalysis program = some analysis) (framed : RootFrame owner before)
    (position : Position program analysis before frontier) (member : operation ∈ program.operations)
    (fired : fire? program operation before = some after) : FirePhase before operation owner := by
  have tokenPhase (input : ControlPlaceId) (root : ScopeOccurrenceId)
      (found : onlyTokenOwner? before input = some root) :
      ∃ token, before.tokens = [token] ∧ token.placeId = input := by
    obtain ⟨_, _, token, _, fields, port, _⟩ := position_with_token program analysis before frontier input root position found
    exact ⟨token, (show before.initiationPending = false ∧ before.tokens = [token] ∧ _ from
      by simpa only [frontierFields, Prod.mk.injEq] using fields).2.1, port⟩
  have allowed := program_analysis_operations_allowed program analysis analyzed operation member
  have step := fire_sound program operation before after fired
  cases operation <;> simp only [OperationAllowed] at allowed
  all_goals try contradiction
  case initiate id origin output =>
    cases step with
    | initiate _ _ _ _ _ active =>
        obtain ⟨root, found, active⟩ := Option.bind_eq_some_iff.mp active
        split at active
        · rename_i pending
          exact Or.inl ⟨pending, rfl⟩
        · contradiction
  case awaitUserTask id origin input output task =>
    cases step with
    | awaitUserTask _ _ _ _ _ _ _ active =>
        simp only [awaitUserTaskState?, bind, pure, Option.bind_eq_some_iff] at active
        obtain ⟨root, found, _⟩ := active
        exact Or.inr (Or.inl (by simpa [operationInputs] using tokenPhase input root found))
  case awaitEffect id origin input output effect route =>
    cases step with
    | awaitEffect _ _ _ _ _ _ _ _ active =>
        simp only [awaitEffectState?, program_analysis_effect_inputs program analysis analyzed, bind, pure, Option.bind_eq_some_iff] at active
        obtain ⟨root, found, _⟩ := active
        exact Or.inr (Or.inl (by simpa [operationInputs] using tokenPhase input root found))
  case choose id origin input candidates default defaultOrigin =>
    cases step with
    | choose _ _ _ _ _ _ _ _ active =>
        simp only [chooseState?, bind, pure, Option.bind_eq_some_iff] at active
        obtain ⟨root, found, _⟩ := active
        exact Or.inr (Or.inl (by simpa [operationInputs] using tokenPhase input root found))
  case mergeExclusive id origin inputs output =>
    cases step with
    | mergeExclusive _ _ _ _ _ _ active =>
      cases active with
      | permitted token offered =>
        have parts : token ∈ before.tokens ∧ token.placeId ∈ inputs := by
          change token ∈ before.tokens.filter (fun token => inputs.contains token.placeId) at offered
          simpa using offered
        obtain ⟨_, _, _, fields, _⟩ := position_with_offered_token program analysis before frontier token position parts.1
        simp only [frontierFields, Prod.mk.injEq] at fields
        exact Or.inr (Or.inl ⟨token, fields.2.1, parts.2⟩)
  case reachNoneEnd id origin input =>
    cases step with
    | reachNoneEnd _ _ _ _ _ active =>
        simp only [reachNoneEndState?, bind, pure, Option.bind_eq_some_iff] at active
        obtain ⟨root, found, _⟩ := active
        exact Or.inr (Or.inl (by simpa [operationInputs] using tokenPhase input root found))
  case completeScope id origin scope output =>
    cases output with
    | some output => contradiction
    | none =>
      cases step with
      | completeScope _ _ _ _ _ _ completed =>
        rw [selected_completion_is_root program analysis before scope analyzed] at completed
        obtain ⟨running, quiet, pending, _⟩ := SerialBusinessTask.root_completion_shape before after owner scope framed completed
        obtain ⟨tokens, humans, effects⟩ := SerialBusinessTask.quiescent_root_frontier_empty before owner framed.1
          (fun wait member => (framed.2.1 wait member).1) (fun wait member => (framed.2.2.1 wait member).1) quiet
        exact Or.inr (Or.inr ⟨pending, tokens, humans, effects, rfl, running⟩)

theorem firing_unique (program : Program) (analysis : Analysis) (state leftAfter rightAfter : RuntimeState)
    (left right : SemanticOperation) (owner : ScopeOccurrenceId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (framed : RootFrame owner state) (indexed : AtPosition program analysis state)
    (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (leftFired : fire? program left state = some leftAfter) (rightFired : fire? program right state = some rightAfter) : left = right := by
  obtain ⟨frontier, position, _⟩ := indexed
  have phase := fun operation after member fired => fire_phase program analysis state after operation owner frontier analyzed framed position member fired
  have singletonSame (predicate : SemanticOperation → Bool) (count : (program.operations.filter predicate).length = 1)
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
      · obtain ⟨_, _, _, fields, _⟩ := position_with_offered_token program analysis state frontier token position (by simp [single])
        simp [frontierFields, pending] at fields
      · simp [pending] at done
    have count : (program.operations.filter (fun operation => match operation with
        | .initiate .. | .initiateMessage .. | .initiateTimer .. => true | _ => false)).length = 1 := by
      simp only [programWellFormed, Bool.and_eq_true] at wellFormed
      exact of_decide_eq_true wellFormed.1.1.1.1.2
    exact singletonSame _ count (initiation left leftAfter leftMember leftFired) (initiation right rightAfter rightMember rightFired)
  · by_cases empty : state.tokens = []
    · have completion : ∀ operation after, operation ∈ program.operations → fire? program operation state = some after →
          StructuredComposition.isScopeCompletion operation = true := by
        intro operation after member fired
        rcases phase operation after member fired with ⟨active, _⟩ | ⟨token, single, _⟩ | ⟨_, _, _, _, kind⟩
        · contradiction
        · simp [empty] at single
        · exact kind.1
      obtain ⟨_, _, _, completions⟩ := program_analysis_completion program analysis analyzed
      exact singletonSame StructuredComposition.isScopeCompletion (by rw [completions]; rfl)
        (completion left leftAfter leftMember leftFired) (completion right rightAfter rightMember rightFired)
    · have tokenConsumer : ∀ operation after, operation ∈ program.operations → fire? program operation state = some after →
          ∃ token, state.tokens = [token] ∧ token.placeId ∈ operationInputs operation := by
        intro operation after member fired
        rcases phase operation after member fired with ⟨active, _⟩ | token | ⟨_, none, _⟩
        · contradiction
        · exact token
        · contradiction
      obtain ⟨token, single, leftPort⟩ := tokenConsumer left leftAfter leftMember leftFired
      obtain ⟨other, otherSingle, rightPort⟩ := tokenConsumer right rightAfter rightMember rightFired
      have same : other = token := by simpa using otherSingle.symm.trans single
      rw [same] at rightPort
      obtain ⟨vertex, _, _, _, consumer, _⟩ := position_with_offered_token program analysis state frontier token position (by simp [single])
      unfold consumer? at consumer
      obtain ⟨_, selected, _⟩ := Option.bind_eq_some_iff.mp consumer
      have census := SerialBusinessTask.unique_some selected
      exact singletonSame (fun operation => (operationInputs operation).contains token.placeId)
        (by rw [census]; rfl) (by simpa using leftPort) (by simpa using rightPort)

theorem position_guard (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (analyzed : programAnalysis program = some analysis) (nonempty : owner.processInstanceId.value ≠ "")
    (root : DeclaredRoot program owner) (framed : RootFrame owner state)
    (indexed : AtPosition program analysis state) : runtimePositionValid program owner.processInstanceId state = true := by
  have origins : ∀ place ∈ program.controlPlaces,
      program.controlPlaces.filter (fun candidate => decide (candidate.origin = place.origin)) = [place] :=
    fun place member => declared_place_unique_origin program analysis place analyzed member
  obtain ⟨definition, definitions, parent, origin, key, activation⟩ := root
  have rootSelected : uniqueDefinitionScope? program owner.definitionScopeId = some definition := by
    simp [uniqueDefinitionScope?, definitions, key]
  obtain ⟨tokensOwned, humansOwned, effectsOwned, life, foreign, issued⟩ := framed
  obtain ⟨_, position, _⟩ := indexed
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
      | pending vertex included start kind fields => simp_all [frontierFields]
      | human vertex included wait id origin input fields declared projected metadata owned => simp_all [frontierFields]
      | effect vertex included wait id origin input effect fields declared projected element descriptor outputs snapshot owned => simp_all [frontierFields]
      | finished fields => simp_all [frontierFields]
      | token vertex included token fields consumer bound =>
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


theorem position_wait_guards (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (root : DeclaredRoot program owner) (framed : RootFrame owner state)
    (indexed : AtPosition program analysis state) (analyzed : programAnalysis program = some analysis) :
    serialRuntimeAssociationsValid program state (program.identity.semanticProfile == mixedTaskBusinessErrorProfileId) = true ∧
      waitDeclarationsValid program owner.processInstanceId state = true := by
  obtain ⟨definition, scopes, parent, origin, key, activation⟩ := root
  have frameParts := framed
  obtain ⟨tokenOwners, humanOwners, effectOwners, life, foreign, issued⟩ := frameParts
  obtain ⟨_, position, _⟩ := indexed
  cases position with
  | pending vertex included start kind fields => simp_all [serialRuntimeAssociationsValid, waitDeclarationsValid, frontierFields, ForeignRuntimeEmpty]
  | token vertex included token fields consumer bound =>
      simp_all [serialRuntimeAssociationsValid, waitDeclarationsValid, frontierFields, ForeignRuntimeEmpty]
  | finished fields => simp_all [serialRuntimeAssociationsValid, waitDeclarationsValid, frontierFields, ForeignRuntimeEmpty]
  | human vertex included wait id origin input fields declared projected metadata owned =>
      have census := SerialBusinessTask.human_wait_census program wait id origin input wellFormed declared metadata
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
  | effect vertex included wait id origin input effect fields declared projected element descriptor outputs snapshot owned =>
      have admitted := analyzed_effect_route_admitted program analysis id origin input wait.output effect wait.bpmnErrorRoute analyzed declared
      have census := business_effect_wait_census program wait id origin input effect
        (program.identity.semanticProfile == mixedTaskBusinessErrorProfileId) wellFormed declared element descriptor outputs admitted snapshot
      have aligned := programWellFormed_awaitEffect_elements_align program wellFormed id origin input wait.output effect wait.bpmnErrorRoute declared
      have unique := programWellFormed_waitDeclarer program (.awaitEffect id origin input wait.output effect wait.bpmnErrorRoute)
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

theorem position_runtime_guard (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (analyzed : programAnalysis program = some analysis) (nonempty : owner.processInstanceId.value ≠ "")
    (root : DeclaredRoot program owner) (framed : RootFrame owner state)
    (indexed : AtPosition program analysis state) : runtimeStateWellFormed program owner.processInstanceId state = true := by
  have positionValid := position_guard program analysis state owner wellFormed analyzed nonempty root framed indexed
  have declarations := (position_wait_guards program analysis state owner wellFormed root framed indexed analyzed).2
  obtain ⟨retention, snapshots, compensation, _⟩ := program_analysis_declarations_absent program analysis analyzed
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have sequential : program.operations.all (sequentialMultiInstanceOperationBindingComplete program state) = true := by
    apply List.all_eq_true.mpr
    intro operation member
    have selected := allowed operation member
    cases operation <;> simp_all [OperationAllowed, sequentialMultiInstanceOperationBindingComplete]
  have compensationDeclaration : compensationExecutionDeclarationValid program = true := by
    simp only [compensationExecutionDeclarationValid, compensation, Bool.not_eq_true', List.any_eq_false]
    intro operation member
    have selected := allowed operation member
    cases operation <;> simp_all [OperationAllowed]
  have repeated : sequentialScopeStateValid program state = true := by
    have noRepeated : program.operations.filterMap sequentialScopeEntry? = [] := by
      apply List.filterMap_eq_nil_iff.mpr
      intro operation member
      have selected := allowed operation member
      cases operation <;> simp_all [OperationAllowed, sequentialScopeEntry?]
    have foreign := framed.2.2.2.2.1
    simp_all [ForeignRuntimeEmpty, sequentialScopeStateValid]
  have parallel : parallelMultiInstanceProgramBindingsValid program state = true := by
    unfold parallelMultiInstanceProgramBindingsValid
    have empty : state.parallelMultiInstanceControllers = [] := by
      have foreign := framed.2.2.2.2.1
      simp_all [ForeignRuntimeEmpty]
    simp only [empty, List.all_nil, Bool.true_and, parallelMultiInstanceControllersOrdered]
    apply List.all_eq_true.mpr
    intro operation member
    have selected := allowed operation member
    cases operation <;> simp_all [OperationAllowed, ParallelMultiInstanceArm.ofOperation?]
  obtain ⟨_, position, _⟩ := indexed
  obtain ⟨tokensOwned, humansOwned, effectsOwned, life, foreign, issued⟩ := framed
  cases position <;> rcases life with ⟨running, scopes⟩ | ⟨completed, scopes, noTokens, noHumans, noEffects, pending⟩
  all_goals
    simp_all [runtimeStateWellFormed, frontierFields, ForeignRuntimeEmpty, IssuanceFrame,
      eventRaceAssociationsValid, effectIncidentAssociationsValid, waitOwnersLive, exactLiveOccurrence,
      waitIdentitiesUnique, occursOnce, userTaskWaitKeyMatches, effectWaitKeyMatches,
      runtimeStateIdentityBound, hiddenRecordDeclarationsValid, canonicalCollectionOrder, orderedBy,
      activityRecordsOwnLiveWork, attachedTimersUnambiguous, attachedMessagesUnambiguous,
      activityIdentitiesUnique, controllersOwnLiveActivity, sequentialMultiInstanceProgramBindingsValid,
      sequentialMultiInstanceControllerProgramBindingsValid, controllerIdentitiesUnique,
      controllersNotExhausted, activityBodyClaimsUnique, parallelMultiInstanceControllersOrdered,
      compensationActivityRetentionStateValid, compensationActivityRetentionDeclarationValid,
      compensationEventSubProcessSnapshotStateValid, compensationEventSubProcessSnapshotDeclarationValid,
      compensationExecutionStateValid]

/-- Exact live identity and admissible supplied data suffice for actual dispatcher success, including nullable fan-out. -/
theorem admissible_completion_dispatch_commits (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (stimulus : Stimulus) (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (analyzed : programAnalysis program = some analysis) (framed : RootFrame owner state)
    (indexed : AtPosition program analysis state) (admissible : SerialBusinessTask.AdmissibleCompletion program state stimulus) :
    (dispatchStimulus program state stimulus).outcome = .committed := by
  obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
  obtain ⟨_, position, _⟩ := indexed
  cases admissible with
  | human commandId wait patch live valid =>
      have single : state.waits = [wait] := by cases position <;> simp_all [frontierFields]
      have identity := (framed.2.1 wait live).2
      have running : state.control = .running wait.processInstanceId := by
        rcases framed.2.2.2.1 with ⟨running, _⟩ | ⟨_, _, _, empty, _⟩ <;> simp_all
      rcases human_dispatch_cases program analysis state commandId ⟨wait.processInstanceId, ⟨wait.task.id.value⟩, wait.activation⟩ patch profile analyzed with ⟨_, refused⟩ | ⟨after, _, _, committed⟩
      · simp [taskIdNamesWait, running, valid, completeUserTask, single] at refused
      · rw [committed]
  | effect commandId wait patch sources live valid collected count covered =>
      have fields : state.effectWaits = [wait] ∧ state.variables.activities =
          [{ owner := .effectOccurrence ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩, bindings := wait.arguments }] := by
        cases position <;> simp_all [frontierFields]
      have identity := (framed.2.2.1 wait live).2
      have running : state.control = .running wait.processInstanceId := by
        rcases framed.2.2.2.1 with ⟨running, _⟩ | ⟨_, _, _, _, empty, _⟩ <;> simp_all
      have noCompensation : state.compensationHandlerEffectWaits = [] := framed.2.2.2.2.1.2.2.2.2.2.2.2.2.2.2.2.2.1
      obtain ⟨bindings, mapped⟩ := SerialBusinessTask.serial_patch_exists (SerialBusinessTask.programHandlers program) wait.outputMappings state.variables.process.bindings patch sources collected valid count covered
      rcases profile with profile | profile <;>
        simp [dispatchStimulus, snapshots, running, noCompensation, profile, completeSerialEffect?, completeBusinessEffect?, effectResultOutput, fields.1,
          effectIdNamesWait, completeSerialActivityScope?, fields.2, activityScopeMatches, localDataOwnerMatches, mapped]

theorem human_admission_preserves_position (program : Program) (analysis : Analysis)
    (before : RuntimeState) (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis) (indexed : AtPosition program analysis before)
    (owner : ScopeOccurrenceId) (framed : RootFrame owner before) :
    RootFrame owner (admitStimulus program before (.completeUserTaskInstance commandId taskId bindings)).state ∧
    AtPosition program analysis (admitStimulus program before
      (.completeUserTaskInstance commandId taskId bindings)).state := by
  obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
  cases guarded : serialBusinessCommandAdmitted program before (.completeUserTaskInstance commandId taskId bindings) with
  | false => simpa [admitStimulus, snapshots, guarded] using And.intro framed indexed
  | true =>
    rw [serial_completion_admission_eq_dispatch program analysis before _ profile analyzed framed.2.2.2.2.1
      (indexed_collection_storage program analysis before owner framed indexed) guarded trivial]
    rcases human_dispatch_cases program analysis before commandId taskId bindings profile analyzed with
      ⟨refused, _⟩ | ⟨after, _patchValid, completed, accepted⟩
    · simpa [refused] using And.intro framed indexed
    · rw [accepted]
      exact human_completion_preserves_position program analysis before after taskId.processInstanceId
        ⟨taskId.elementId.value⟩ taskId.activation bindings _patchValid wellFormed analyzed indexed owner framed completed

theorem effect_admission_preserves_position (program : Program) (analysis : Analysis)
    (before : RuntimeState) (commandId : SemanticId) (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis) (indexed : AtPosition program analysis before)
    (owner : ScopeOccurrenceId) (framed : RootFrame owner before) :
    RootFrame owner (admitStimulus program before (.completeEffect commandId effectId result)).state ∧
    AtPosition program analysis (admitStimulus program before (.completeEffect commandId effectId result)).state := by
  obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
  cases guarded : serialBusinessCommandAdmitted program before (.completeEffect commandId effectId result) with
  | false => simpa [admitStimulus, snapshots, guarded] using And.intro framed indexed
  | true =>
    rw [serial_completion_admission_eq_dispatch program analysis before _ profile analyzed framed.2.2.2.2.1
      (indexed_collection_storage program analysis before owner framed indexed) guarded trivial]
    rcases business_profile_effect_dispatch_cases program analysis before commandId effectId result profile analyzed guarded with
      refused | ⟨after, completed, accepted⟩
    · simpa [refused] using And.intro framed indexed
    · rw [accepted]
      exact effect_completion_preserves_position program analysis before after effectId result wellFormed analyzed indexed owner framed completed

theorem indexed_completion_guard (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (stimulus : Stimulus) (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (wellFormed : programWellFormed program = true) (capabilities : programProfileCapabilitiesValid program = true)
    (framed : RootFrame owner state) (indexed : AtPosition program analysis state)
    (associations : serialRuntimeAssociationsValid program state (program.identity.semanticProfile == mixedTaskBusinessErrorProfileId) = true)
    (runtime : runtimeStateWellFormed program owner.processInstanceId state = true) (completion : SerialBusinessTask.IsSerialCompletion stimulus) :
    serialBusinessCommandAdmitted program state stimulus = true := by
  obtain ⟨_, _, _, canonical⟩ := indexed
  rcases profile with profile | profile <;> rcases framed.2.2.2.1 with ⟨control, _⟩ | ⟨control, _⟩
  all_goals
    unfold serialBusinessCommandAdmitted
    simp only [profile] at associations
    simp only [profile, bne_self_eq_false, Bool.and_false, Bool.false_and, Bool.false_eq_true, ↓reduceIte, wellFormed, capabilities, canonical, associations, control, runtime, Bool.true_and]
    cases stimulus <;> simp only [SerialBusinessTask.IsSerialCompletion] at completion <;> (first | contradiction | rfl)

/-- Both accepted and refused completion commands retain issuance high-water marks, so completing an occurrence cannot make its identity reusable. -/
theorem completion_preserves_issuance (program : Program) (analysis : Analysis) (before : RuntimeState)
    (stimulus : Stimulus) (profile : program.identity.semanticProfile = mixedTaskControlFlowProfileId ∨
      program.identity.semanticProfile = mixedTaskBusinessErrorProfileId)
    (analyzed : programAnalysis program = some analysis) (foreign : ForeignRuntimeEmpty before)
    (completion : SerialBusinessTask.IsSerialCompletion stimulus) :
    (admitStimulus program before stimulus).state.activations = before.activations ∧
      (admitStimulus program before stimulus).state.effectActivations = before.effectActivations := by
  cases storageAdmitted : committedStateCollectionAdmitted before with
  | false => simp [admitStimulus_invalid_collection_storage program before stimulus storageAdmitted]
  | true =>
    obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
    cases guarded : serialBusinessCommandAdmitted program before stimulus with
    | false => simp [admitStimulus, snapshots, guarded]
    | true =>
      rw [serial_completion_admission_eq_dispatch program analysis before stimulus profile analyzed foreign storageAdmitted guarded completion]
      cases stimulus <;> simp only [SerialBusinessTask.IsSerialCompletion] at completion <;> try contradiction
      case completeUserTaskInstance commandId taskId bindings =>
        rcases human_dispatch_cases program analysis before commandId taskId bindings profile analyzed with
          ⟨refused, _⟩ | ⟨after, _, completed, committed⟩
        · simp [refused]
        · rw [committed]
          unfold completeUserTask at completed
          split at completed
          · contradiction
          · cases Option.some.inj completed
            exact ⟨rfl, rfl⟩
      case completeEffect commandId effectId result =>
        rcases business_profile_effect_dispatch_cases program analysis before commandId effectId result profile analyzed guarded with
          refused | ⟨after, completed, committed⟩
        · simp [refused]
        · rw [committed]
          obtain ⟨_, _, _, _, _, _, _, _, _, _, successor⟩ :=
            business_completion_facts (SerialBusinessTask.programHandlers program) before after effectId result completed
          rw [successor]
          exact ⟨rfl, rfl⟩

end BpmnSemantics.SemanticProcess.MixedTaskControlFlow

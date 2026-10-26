module

public import BpmnSemantics.SemanticProcess.MixedTaskControlFlowLifecycleProofs
public import BpmnSemantics.SemanticProcess.StructuredCompositionProgressProofs
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission

/-! MTCF-PROGRESS-01 connects the admitted wait-cut ranks to actual routing transitions; graph certificates alone cannot establish bounded runtime closure. Discovery helpers also require the ordinary profile domain: InternalExecutionFrontier dispatches by identity, whereas programAnalysis checks structure. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.MixedTaskControlFlow

open SerialBusinessTask (RootFrame RootLifecycle ForeignRuntimeEmpty IssuanceFrame frontierFields)

def positionDepth (analysis : Analysis) (state : RuntimeState) (frontier : Option Vertex) : Nat :=
  if !state.waits.isEmpty || !state.effectWaits.isEmpty then 0
  else match frontier with
    | some vertex => (rank? analysis.ranks vertex.id).getD 0
    | none => match state.control with | .running _ => 1 | _ => 0

theorem position_depth_bounded (program : Program) (analysis : Analysis) (state : RuntimeState)
    (frontier : Option Vertex) (analyzed : programAnalysis program = some analysis)
    (position : Position program analysis state frontier) :
    positionDepth analysis state frontier ≤ scenarioClosureLimit := by
  unfold positionDepth
  split
  · exact Nat.zero_le _
  · cases frontier with
    | none => cases state.control <;> simp [scenarioClosureLimit]
    | some vertex =>
        have member : vertex ∈ analysis.vertices := by cases position <;> assumption
        exact admitted_rank_bounded analysis.vertices analysis (program_analysis_graph program analysis analyzed) vertex member

theorem admitted_rank_positive (vertices : List Vertex) (analysis : Analysis)
    (accepted : analyze vertices = some analysis) (vertex : Vertex) (member : vertex ∈ vertices) :
    0 < (rank? analysis.ranks vertex.id).getD 0 := by
  obtain ⟨rank, found⟩ := admitted_rank_exists vertices analysis accepted vertex member
  have equation := admitted_rank_equation vertices analysis accepted vertex member
  rw [found] at equation ⊢
  simp only [Option.getD_some]
  cases kind : vertex.kind <;> simp only [vertexRank?, kind] at equation
  all_goals try (simp_all)
  all_goals
    obtain ⟨values, _, equal⟩ := Option.bind_eq_some_iff.mp equation.symm
    have size := Option.some.inj equal
    omega

/-- Both routing operations only replace the offered token; this shared argument preserves its root and derives the next graph position. -/
theorem routed_token_preserves_position (program : Program) (analysis : Analysis)
    (operation : SemanticOperation) (vertex : Vertex) (before : RuntimeState)
    (token : ControlToken) (output : ControlPlaceId) (rootOwner : ScopeOccurrenceId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (opMember : operation ∈ program.operations) (vertexMember : vertex ∈ analysis.vertices)
    (projected : operationVertex? program operation = some vertex)
    (internal : isWait vertex.kind = false) (shared : operationControlPlacesShareOwner operation = true)
    (inputPort : token.placeId ∈ operationControlPlaces operation)
    (outputPort : output ∈ operationControlPlaces operation) (outputMember : output ∈ operationOutputs operation)
    (declared : SerialBusinessTask.DeclaredToken program token)
    (fields : frontierFields before = (false, [token], [], [], []))
    (framed : RootFrame rootOwner before)
    (available : InputsAvailable analysis.vertices vertex.id before.variables.process.bindings)
    (canonical : SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program)
      before.variables.process.bindings = true) :
    let after := { before with tokens := [⟨output, token.owner⟩] }
    RootFrame rootOwner after ∧ ∃ next ∈ analysis.vertices,
      Position program analysis after (some next) ∧
      InputsAvailable analysis.vertices next.id after.variables.process.bindings ∧
      SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) after.variables.process.bindings = true ∧
      positionDepth analysis after (some next) < positionDepth analysis before (some vertex) := by
  have parts := fields
  simp only [frontierFields, Prod.mk.injEq] at parts
  have present : token ∈ before.tokens := by simp [parts.2.1]
  have owner := framed.1 token present
  have life := SerialBusinessTask.root_lifecycle_running_of_token rootOwner before framed.2.2.2.1 token present
  have owned := SerialBusinessTask.token_operation_owned program operation token wellFormed opMember shared inputPort declared
  obtain ⟨target, edge, consumer⟩ := operation_output_consumer program operation vertex output projected outputMember
  have accepted := program_analysis_graph program analysis analyzed
  obtain ⟨next, nextMember, named⟩ := output_has_vertex analysis.vertices analysis accepted vertex vertexMember target edge
  refine ⟨?_, next, nextMember, ?_, ?_, canonical, ?_⟩
  · exact ⟨by simpa using owner, framed.2.1, framed.2.2.1, Or.inl life, framed.2.2.2.2⟩
  · apply Position.token next nextMember ⟨output, token.owner⟩
    · simp [frontierFields, parts.1, parts.2.2.1, parts.2.2.2.1, parts.2.2.2.2]
    · simpa [named] using consumer
    · exact SerialBusinessTask.owned_operation_port program operation output token.owner wellFormed opMember shared outputPort owned
  · rw [named]
    apply nonwriter_edge_preserves_available analysis.vertices vertex target _ vertexMember edge _ available
    intro service
    simp [service, isWait] at internal
  · obtain ⟨sourceRank, targetRank, sourceEq, targetEq, decreased⟩ :=
      admitted_internal_edge_decreases analysis.vertices analysis accepted vertex vertexMember internal target edge
    simpa [positionDepth, parts.2.2.1, parts.2.2.2.1, named, sourceEq, targetEq] using decreased

def RoutingOperation : SemanticOperation → Prop
  | .choose .. | .mergeExclusive .. => True
  | _ => False

/-- Actual ordered Choice and offered-token Merge firing preserve the same invariant and strictly decrease the admitted rank. -/
theorem routing_fire_preserves_position (program : Program) (analysis : Analysis)
    (operation : SemanticOperation) (before after : RuntimeState) (frontier : Option Vertex)
    (rootOwner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (analyzed : programAnalysis program = some analysis) (member : operation ∈ program.operations)
    (routing : RoutingOperation operation) (framed : RootFrame rootOwner before)
    (position : Position program analysis before frontier)
    (available : match frontier with | some vertex => InputsAvailable analysis.vertices vertex.id before.variables.process.bindings | none => True)
    (canonical : SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) before.variables.process.bindings = true)
    (fired : fire? program operation before = some after) :
    RootFrame rootOwner after ∧ ∃ next ∈ analysis.vertices,
      Position program analysis after (some next) ∧
      InputsAvailable analysis.vertices next.id after.variables.process.bindings ∧
      SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) after.variables.process.bindings = true ∧
      positionDepth analysis after (some next) < positionDepth analysis before frontier := by
  have step := fire_sound program operation before after fired
  cases operation <;> simp only [RoutingOperation] at routing
  all_goals try contradiction
  case choose id origin input candidates default defaultOrigin =>
    cases step with
    | choose _ _ _ _ _ _ _ _ active =>
      simp only [chooseState?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨owner, found, output, selected, active⟩ := active
      obtain ⟨vertex, included, token, rfl, fields, inputEq, ownerEq, consumer, declared⟩ :=
        position_with_token program analysis before frontier input owner position found
      have projected := token_consumer_projects_current_vertex program analysis
        (.choose id origin input candidates default defaultOrigin) vertex input analyzed member included (by simp [operationInputs]) consumer
      have internal : isWait vertex.kind = false := by
        simp [operationVertex?, Option.bind_eq_some_iff] at projected
        obtain ⟨_, _, _, equal⟩ := projected
        simp [← equal, isWait]
      have offered := StructuredComposition.selected_conditional_output_is_declared candidates default output _ selected
      cases Option.some.inj active
      have parts := fields
      simp only [frontierFields, Prod.mk.injEq] at parts
      have result := routed_token_preserves_position program analysis
        (.choose id origin input candidates default defaultOrigin) vertex before token output rootOwner
        wellFormed analyzed member included projected internal rfl
        (by change token.placeId ∈ [input] ++ (candidates.map (·.output) ++ [default]); simp [inputEq])
        (by change output ∈ [input] ++ (candidates.map (·.output) ++ [default]); exact List.mem_append_right _ offered)
        offered declared fields framed available canonical
      simpa [chooseToken, parts.2.1, inputEq, ownerEq, removeToken, addToken, canonicalInsertBy] using result
  case mergeExclusive id origin inputs output =>
    cases step with
    | mergeExclusive _ _ _ _ _ _ active =>
      cases active with
      | permitted token offered =>
        have offeredParts : token ∈ before.tokens ∧ token.placeId ∈ inputs := by
          change token ∈ before.tokens.filter (fun token => inputs.contains token.placeId) at offered
          simpa using offered
        obtain ⟨vertex, included, rfl, fields, consumer, declared⟩ :=
          position_with_offered_token program analysis before frontier token position offeredParts.1
        have projected := token_consumer_projects_current_vertex program analysis
          (.mergeExclusive id origin inputs output) vertex token.placeId analyzed member included offeredParts.2 consumer
        have internal : isWait vertex.kind = false := by
          simp [operationVertex?, Option.bind_eq_some_iff] at projected
          obtain ⟨_, _, _, equal⟩ := projected
          simp [← equal, isWait]
        have parts := fields
        simp only [frontierFields, Prod.mk.injEq] at parts
        have result := routed_token_preserves_position program analysis
          (.mergeExclusive id origin inputs output) vertex before token output rootOwner
          wellFormed analyzed member included projected internal rfl
          (by change token.placeId ∈ inputs ++ [output]; simp [offeredParts.2])
          (by change output ∈ inputs ++ [output]; simp)
          (by simp [operationOutputs]) declared fields framed available canonical
        simpa [parts.2.1, removeToken, addToken, canonicalInsertBy] using result

/-- Every actual admitted internal firing preserves the graph-indexed invariant and consumes rank, including task arming and the final root completion. -/
theorem fire_preserves_position_with_depth (program : Program) (analysis : Analysis)
    (operation : SemanticOperation) (before after : RuntimeState) (frontier : Option Vertex)
    (rootOwner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (analyzed : programAnalysis program = some analysis) (scalar : programEffectMappingValuePolicy program = .scalar) (member : operation ∈ program.operations)
    (rootDeclared : SerialBusinessTask.DeclaredRoot program rootOwner) (framed : RootFrame rootOwner before)
    (position : Position program analysis before frontier)
    (available : match frontier with | some vertex => InputsAvailable analysis.vertices vertex.id before.variables.process.bindings | none => True)
    (canonical : SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) before.variables.process.bindings = true)
    (fired : fire? program operation before = some after) :
    RootFrame rootOwner after ∧ ∃ next, Position program analysis after next ∧
      (match next with | some vertex => InputsAvailable analysis.vertices vertex.id after.variables.process.bindings | none => True) ∧
      SerialBusinessTask.bindingsValid (SerialBusinessTask.programHandlers program) after.variables.process.bindings = true ∧
      positionDepth analysis after next < positionDepth analysis before frontier := by
  by_cases routing : RoutingOperation operation
  · obtain ⟨frame, next, _, placed, data, domain, decreased⟩ := routing_fire_preserves_position program analysis
      operation before after frontier rootOwner wellFormed analyzed member routing framed position available canonical fired
    exact ⟨frame, some next, placed, data, domain, decreased⟩
  have selected := program_analysis_operations_allowed program analysis analyzed operation member
  have accepted := program_analysis_graph program analysis analyzed
  obtain ⟨tokenOwners, humanOwners, effectOwners, life, foreign, issued⟩ := framed
  have step := fire_sound program operation before after fired
  cases operation <;> simp only [OperationAllowed, RoutingOperation] at selected routing
  all_goals try contradiction
  case initiate id origin output =>
    cases step with
    | initiate _ _ _ _ _ active =>
      obtain ⟨owner, found, active⟩ := Option.bind_eq_some_iff.mp active
      have sameOwner : owner = rootOwner := by
        rcases life with ⟨_, scopes⟩ | ⟨_, scopes, _⟩
        · simpa [rootScopeOccurrence?, scopes] using found.symm
        · simp [rootScopeOccurrence?, scopes] at found
      have runningLife : before.control = .running rootOwner.processInstanceId ∧
          before.scopeOccurrences = [{ id := rootOwner, parent := none }] := by
        rcases life with running | ⟨_, scopes, _⟩
        · exact running
        · simp [rootScopeOccurrence?, scopes] at found
      have owned := SerialBusinessTask.declared_initiation_owned program rootOwner id origin output wellFormed rootDeclared member
      split at active
      · rename_i pending
        obtain ⟨current, currentMember, rfl, startId, startKind, fields⟩ :=
          position_with_pending_is_start program analysis before frontier position pending
        obtain ⟨vertex, vertexMember, projected⟩ := operation_has_vertex program analysis (.initiate id origin output) analyzed member rfl
        have projection := projected
        simp [operationVertex?, Option.bind_eq_some_iff] at projection
        obtain ⟨target, consumer, vertexEq⟩ := projection
        have kind : vertex.kind = .start := by rw [← vertexEq]
        have named := admitted_start_id analysis.vertices analysis accepted vertex vertexMember kind
        have edge : target ∈ vertex.outputs := by simp [← vertexEq]
        obtain ⟨next, nextMember, nextId⟩ := output_has_vertex analysis.vertices analysis accepted vertex vertexMember target edge
        have parts := fields
        simp only [frontierFields, Prod.mk.injEq] at parts
        cases Option.some.inj active
        refine ⟨?_, some next, ?_, ?_, canonical, ?_⟩
        · refine ⟨?_, humanOwners, effectOwners, Or.inl runningLife, foreign, issued⟩
          simp [addToken, canonicalInsertBy, parts.2.1, sameOwner]
        · apply Position.token next nextMember ⟨output, owner⟩
          · simp [frontierFields, parts.2.1, parts.2.2.1, parts.2.2.2.1, parts.2.2.2.2, addToken, canonicalInsertBy]
          · simpa [nextId] using consumer
          · apply SerialBusinessTask.owned_operation_port program (.initiate id origin output) output owner wellFormed member rfl
            · change output ∈ [output]; simp
            · simpa [sameOwner, SemanticOperation.id] using owned
        · change InputsAvailable analysis.vertices next.id before.variables.process.bindings
          rw [nextId]
          apply nonwriter_edge_preserves_available analysis.vertices vertex target _ vertexMember edge (by simp [kind])
          simpa only [named, startId] using available
        · obtain ⟨sourceRank, targetRank, sourceEq, targetEq, decreased⟩ :=
            admitted_internal_edge_decreases analysis.vertices analysis accepted vertex vertexMember (by simp [kind, isWait]) target edge
          simpa [positionDepth, parts.2.2.1, parts.2.2.2.1, nextId, startId, ← named, sourceEq, targetEq] using decreased
      · contradiction
  case awaitUserTask id origin input output task =>
    cases step with
    | awaitUserTask _ _ _ _ _ _ _ active =>
      simp only [awaitUserTaskState?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨owner, found, instanceId, running, active⟩ := active
      obtain ⟨vertex, included, token, rfl, fields, inputEq, ownerEq, consumer, declared⟩ :=
        position_with_token program analysis before frontier input owner position found
      have projected := token_consumer_projects_current_vertex program analysis (.awaitUserTask id origin input output task)
        vertex input analyzed member included (by simp [operationInputs]) consumer
      have owned := SerialBusinessTask.token_operation_owned program (.awaitUserTask id origin input output task) token wellFormed member rfl
        (by change token.placeId ∈ [input, output]; simp [inputEq]) declared
      have parts := fields
      simp only [frontierFields, Prod.mk.injEq] at parts
      have present : token ∈ before.tokens := by simp [parts.2.1]
      have runningLife := SerialBusinessTask.root_lifecycle_running_of_token rootOwner before life token present
      have root := tokenOwners token present
      cases Option.some.inj active
      refine ⟨?_, some vertex, ?_, available, canonical, ?_⟩
      · refine ⟨?_, ?_, ?_, Or.inl runningLife, foreign,
          SerialBusinessTask.user_activation_issuance before owner.processInstanceId owner input output task issued parts.2.2.1⟩ <;>
          simp [activateUserTask, parts.2.1, parts.2.2.1, parts.2.2.2.1, inputEq, ownerEq, root, removeToken, insertUserTaskWait]
      · apply Position.human vertex included
          { processInstanceId := owner.processInstanceId, owner, task, activation := activationCount before task.id + 1,
            output, metadata := task.metadata } id origin input
        · simp [frontierFields, activateUserTask, parts.1, parts.2.1, parts.2.2.1,
            parts.2.2.2.1, parts.2.2.2.2, inputEq, ownerEq, removeToken, insertUserTaskWait]
        · exact member
        · exact projected
        · rfl
        · simpa [ownerEq, SemanticOperation.id] using owned
      · simpa [positionDepth, activateUserTask, parts.2.2.1, parts.2.2.2.1, insertUserTaskWait]
          using admitted_rank_positive analysis.vertices analysis accepted vertex included
  case awaitEffect id origin input output effect route =>
    cases step with
    | awaitEffect _ _ _ _ _ _ _ _ active =>
      simp only [awaitEffectState?, program_analysis_effect_inputs program analysis analyzed scalar, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨owner, found, instanceId, running, arguments, evaluated, active⟩ := active
      obtain ⟨vertex, included, token, rfl, fields, inputEq, ownerEq, consumer, declared⟩ :=
        position_with_token program analysis before frontier input owner position found
      have projected := token_consumer_projects_current_vertex program analysis (.awaitEffect id origin input output effect route)
        vertex input analyzed member included (by simp [operationInputs]) consumer
      have owned := SerialBusinessTask.token_operation_owned program (.awaitEffect id origin input output effect route) token wellFormed member rfl
        (by cases route <;> (change token.placeId ∈ input :: _; simp [inputEq])) declared
      have parts := fields
      simp only [frontierFields, Prod.mk.injEq] at parts
      have present : token ∈ before.tokens := by simp [parts.2.1]
      have runningLife := SerialBusinessTask.root_lifecycle_running_of_token rootOwner before life token present
      have root := tokenOwners token present
      split at active
      · contradiction
      · cases Option.some.inj active
        refine ⟨?_, some vertex, ?_, available, canonical, ?_⟩
        · refine ⟨?_, ?_, ?_, Or.inl runningLife, foreign,
            effect_activation_issuance_with_route before owner.processInstanceId owner input output effect route issued⟩ <;>
            simp [activateEffect, parts.2.1, parts.2.2.1, parts.2.2.2.1, inputEq, ownerEq, root,
              removeToken, insertEffectWait, canonicalInsertBy]
        · apply Position.effect vertex included
            { processInstanceId := owner.processInstanceId, owner, elementId := effect.elementId,
              activation := effectActivationCount before effect.elementId + 1, descriptor := effect.descriptor,
              arguments, outputMappings := effect.outputMappings, output, bpmnErrorRoute := route }
            id origin input effect
          · simp [frontierFields, activateEffect, evaluated, parts.1, parts.2.1, parts.2.2.1,
              parts.2.2.2.1, parts.2.2.2.2, inputEq, ownerEq, removeToken, insertEffectWait,
              canonicalInsertBy, addActivityVariableScope, insertActivityVariableScope]
          · exact member
          · exact projected
          · rfl
          · rfl
          · rfl
          · exact evaluateEnclosingInputMappings_snapshot _ _ _ evaluated
          · simpa [ownerEq, SemanticOperation.id] using owned
        · simpa [positionDepth, activateEffect, parts.2.2.1, parts.2.2.2.1, insertEffectWait, canonicalInsertBy]
            using admitted_rank_positive analysis.vertices analysis accepted vertex included
  case reachNoneEnd id origin input =>
    cases step with
    | reachNoneEnd _ _ _ _ _ active =>
      simp only [reachNoneEndState?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨owner, found, instanceId, running, active⟩ := active
      obtain ⟨vertex, included, token, rfl, fields, inputEq, ownerEq, consumer, declared⟩ :=
        position_with_token program analysis before frontier input owner position found
      have projected := token_consumer_projects_current_vertex program analysis (.reachNoneEnd id origin input)
        vertex input analyzed member included (by simp [operationInputs]) consumer
      have kind : vertex.kind = .finish := by
        simp [operationVertex?] at projected
        cases projected
        rfl
      have ranked := admitted_finish_rank analysis.vertices analysis accepted vertex included kind
      have parts := fields
      simp only [frontierFields, Prod.mk.injEq] at parts
      have runningLife := SerialBusinessTask.root_lifecycle_running_of_token rootOwner before life token (by simp [parts.2.1])
      cases Option.some.inj active
      refine ⟨?_, none, ?_, trivial, canonical, ?_⟩
      · refine ⟨?_, humanOwners, effectOwners, Or.inl runningLife, foreign, issued⟩
        simp [reachNoneEndToken, parts.2.1, inputEq, ownerEq, removeToken]
      · apply Position.finished
        simp [frontierFields, reachNoneEndToken, parts.1, parts.2.1, parts.2.2.1,
          parts.2.2.2.1, parts.2.2.2.2, inputEq, ownerEq, removeToken]
      · simp [positionDepth, reachNoneEndToken, parts.2.2.1, parts.2.2.2.1, runningLife.1, ranked]
  case completeScope id origin scope output =>
    cases output with
    | some output => contradiction
    | none =>
      cases step with
      | completeScope _ _ _ _ _ _ completed =>
        change completeSelectedScope? program before scope none = some after at completed
        rw [selected_completion_is_root program analysis before scope analyzed] at completed
        obtain ⟨running, quiet, pending, rfl⟩ := SerialBusinessTask.root_completion_shape before after rootOwner scope
          ⟨tokenOwners, humanOwners, effectOwners, life, foreign, issued⟩ completed
        obtain ⟨noTokens, noHumans, noEffects⟩ := SerialBusinessTask.quiescent_root_frontier_empty before rootOwner tokenOwners
          (fun wait member => (humanOwners wait member).1) (fun wait member => (effectOwners wait member).1) quiet
        have frontierEq : frontier = none := by
          cases position with
          | pending vertex included start kind fields =>
              simp [frontierFields, pending] at fields
          | token vertex included token fields consumer bound =>
              simp [frontierFields, noTokens] at fields
          | human vertex included wait id origin input fields declared projected metadata owned =>
              simp [frontierFields, noHumans] at fields
          | effect vertex included wait id origin input effect fields declared projected element descriptor outputs snapshot owned =>
              simp [frontierFields, noEffects] at fields
          | finished fields => rfl
        subst frontier
        refine ⟨?_, none, position_frame program analysis none _ _ position rfl, trivial, canonical, ?_⟩
        · simp_all [RootFrame, RootLifecycle, ForeignRuntimeEmpty, IssuanceFrame]
        · simp [positionDepth, noHumans, noEffects, running]

theorem position_progress (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (analyzed : programAnalysis program = some analysis) (scalar : programEffectMappingValuePolicy program = .scalar) (declared : SerialBusinessTask.DeclaredRoot program owner)
    (framed : RootFrame owner state) (indexed : AtPosition program analysis state) :
    state.waits ≠ [] ∨ state.effectWaits ≠ [] ∨ state.control = .completed owner.processInstanceId ∨
      ∃ operation ∈ program.operations, ∃ after, fire? program operation state = some after := by
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have absent := (program_analysis_declarations_absent program analysis analyzed).2.1
  obtain ⟨frontier, position, available, canonical⟩ := indexed
  obtain ⟨completionId, completionOrigin, completionScope, completions⟩ :=
    program_analysis_completion program analysis analyzed
  have life := framed.2.2.2.1
  rcases life with ⟨running, scopes⟩ | ⟨completed, _⟩
  · cases position with
    | human vertex included wait id origin input fields member projected metadata owned =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        exact Or.inl (by simp [fields.2.2.1])
    | effect vertex included wait id origin input effect fields member projected element descriptor outputs snapshot owned =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        exact Or.inr (Or.inl (by simp [fields.2.2.2.1]))
    | pending vertex included start kind fields =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        obtain ⟨operation, member, projected⟩ := vertex_has_operation program analysis vertex analyzed included
        apply Or.inr ∘ Or.inr ∘ Or.inr
        refine ⟨operation, member, ?_⟩
        have initiation : ∃ id origin output, operation = .initiate id origin output := by
          cases operation <;> simp_all [operationVertex?, Option.bind_eq_some_iff]
          all_goals try grind
          all_goals split at projected <;> simp_all [Option.bind_eq_some_iff] <;> grind
        obtain ⟨id, origin, output, rfl⟩ := initiation
        simp only [fire?, absent]
        change ∃ after, initiateState? state output = some after
        simp [initiateState?, rootScopeOccurrence?, scopes, fields.1]
    | token vertex included token fields consumer bound =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        have consumerFound := consumer
        unfold consumer? at consumer
        obtain ⟨operation, selected, named⟩ := Option.bind_eq_some_iff.mp consumer
        have census := SerialBusinessTask.unique_some selected
        clear named selected
        have selectedMember : operation ∈ program.operations.filter (fun op => (operationInputs op).contains token.placeId) := by rw [census]; simp
        obtain ⟨member, consumes⟩ := List.mem_filter.mp selectedMember
        have consumes' : token.placeId ∈ operationInputs operation := by simpa using consumes
        have projected := token_consumer_projects_current_vertex program analysis operation vertex token.placeId analyzed member included consumes' consumerFound
        have selected := allowed operation member
        apply Or.inr ∘ Or.inr ∘ Or.inr
        refine ⟨operation, member, ?_⟩
        cases operation <;> simp only [OperationAllowed] at selected
        all_goals try contradiction
        all_goals simp only [operationInputs, List.mem_singleton] at consumes'
        all_goals try contradiction
        case awaitUserTask id origin input output task =>
          simp [fire_awaitUserTask_withoutSnapshotDeclaration _ _ _ _ _ _ _ absent,
            awaitUserTaskState?, onlyTokenOwner?, tokenOwners, fields.2.1, consumes', runningInstance?, running]
        case awaitEffect id origin input output effect route =>
          obtain ⟨arguments, evaluated⟩ := current_service_inputs_evaluable program state analysis.vertices vertex id origin input output effect included projected available canonical
          simp only [fire?, absent]
          change ∃ after, awaitEffectState? program state input output effect route = some after
          simp [awaitEffectState?, program_analysis_effect_inputs program analysis analyzed scalar, onlyTokenOwner?, tokenOwners,
            fields.2.1, consumes', runningInstance?, running, evaluated, fields.2.2.2.2]
        case choose id origin input candidates output defaultOrigin =>
          obtain ⟨selected, selection⟩ := StructuredComposition.unique_bindings_make_choice_total state.variables.process.bindings
            (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp canonical).1) candidates output
          simp [fire_choose_withoutSnapshotDeclaration _ _ _ _ _ _ _ _ absent,
            chooseState?, onlyTokenOwner?, tokenOwners, fields.2.1, consumes', selection]
        case mergeExclusive id origin inputs output =>
          rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ absent,
            mergeExclusiveState_singleton_offer state inputs output token fields.2.1 consumes']
          exact ⟨_, rfl⟩
        case reachNoneEnd id origin input =>
          simp [fire_reachNoneEnd_withoutSnapshotDeclaration _ _ _ _ _ absent,
            reachNoneEndState?, onlyTokenOwner?, tokenOwners, fields.2.1, consumes', runningInstance?, running]
    | finished fields =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        have member : SemanticOperation.completeScope completionId completionOrigin completionScope none ∈ program.operations :=
          (List.mem_filter.mp (show _ ∈ program.operations.filter StructuredComposition.isScopeCompletion by rw [completions]; simp)).1
        obtain ⟨root, definitions, _, _, rootKey, _⟩ := declared
        obtain ⟨_, definition, _, _, found, _⟩ := programGraphWellFormed_completion_binding program completionId completionOrigin completionScope none
          (programWellFormed_graph program wellFormed) member
        have same : definition = root := by simpa [definitions] using List.mem_of_find?_eq_some found
        have key : completionScope = root.id := by
          have matched := List.find?_some found
          simpa [same] using (of_decide_eq_true matched).symm
        have foreign := framed.2.2.2.2.1
        have quiet : scopeQuiescent state owner = true := by
          simp_all [scopeQuiescent, ForeignRuntimeEmpty]
        apply Or.inr ∘ Or.inr ∘ Or.inr
        refine ⟨.completeScope completionId completionOrigin completionScope none, member, ?_⟩
        simp only [fire?, absent]
        change ∃ after, completeSelectedScope? program state completionScope none = some after
        rw [selected_completion_is_root program analysis state completionScope analyzed]
        simp [completeScopeState?, scopes, rootKey, key, quiet, completeQuiescentScope?, running, fields.1]
  · exact Or.inr (Or.inr (Or.inl completed))

open InternalCommutation in
theorem refused_operation_has_empty_discovery
    (program : Program) (analysis : Analysis) (state : RuntimeState) (operation : SemanticOperation)
    (ordinaryProfile : program.identity.semanticProfile.value ≠ "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" ∧
      program.identity.semanticProfile.value ≠ "cibseven-2.2.0-embedded-subprocess-completion-draft")
    (analyzed : programAnalysis program = some analysis) (indexed : AtPosition program analysis state)
    (refused : fire? program operation state = none) :
    (match operation, state.control with
      | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
      | _, _ => ordinaryExecutionFrontier program state operation) = {} := by
  have ordinary : ordinaryExecutionFrontier program state operation = {} := by
    simp [ordinaryExecutionFrontier, ordinaryProfile, refused]
  cases operation <;> try exact ordinary
  case mergeExclusive id origin inputs output =>
    cases control : state.control <;> try exact ordinary
    case running instanceId =>
      have noSnapshots := (program_analysis_declarations_absent program analysis analyzed).2.1
      have empty : exclusiveMergeInputTokens state inputs = [] := by
        apply List.eq_nil_iff_forall_not_mem.mpr
        intro token present
        obtain ⟨live, port⟩ := List.mem_filter.mp present
        change inputs.contains token.placeId = true at port
        obtain ⟨frontier, position, _⟩ := indexed
        obtain ⟨_, _, _, fields, _⟩ := position_with_offered_token program analysis state frontier token position live
        have single : state.tokens = [token] := by
          exact (show _ ∧ state.tokens = [token] ∧ _ from by simpa only [frontierFields, Prod.mk.injEq] using fields).2.1
        rw [fire_mergeExclusive_withoutSnapshotDeclaration _ _ _ _ _ _ noSnapshots,
          mergeExclusiveState_singleton_offer state inputs output token single (by simpa using port)] at refused
        contradiction
      simp [mergeExecutionFrontier, ordinaryProfile, internalMergeInputAlternatives, empty, List.mapM_nil,
        InternalCommutation.sortBy]

open InternalCommutation in
theorem enabled_operation_has_singleton_discovery
    (program : Program) (analysis : Analysis) (state after : RuntimeState) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId)
    (ordinaryProfile : program.identity.semanticProfile.value ≠ "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" ∧
      program.identity.semanticProfile.value ≠ "cibseven-2.2.0-embedded-subprocess-completion-draft")
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis) (scalar : programEffectMappingValuePolicy program = .scalar)
    (declared : SerialBusinessTask.DeclaredRoot program owner)
    (framed : RootFrame owner state) (indexed : AtPosition program analysis state)
    (member : operation ∈ program.operations) (fired : fire? program operation state = some after) :
    ∃ offer : InternalExecutionOffer, offer.operation = operation ∧ offer.successor = after ∧
      (∀ prepared, offer.preparation = some prepared → prepared.alternative = offer.alternative) ∧
      (match operation, state.control with
        | .mergeExclusive .., .running _ => mergeExecutionFrontier program state operation
        | _, _ => ordinaryExecutionFrontier program state operation) = { offers := [offer] } := by
  obtain ⟨frontier, position, _⟩ := indexed
  have phase := fire_phase program analysis state after operation owner frontier analyzed scalar framed position member fired
  have ordinary (selected : (match operation with | .reachNoneEnd .. => (selectInternalEnd? state operation).isSome | _ => true) = true) :
      ∃ offer : InternalExecutionOffer, offer.operation = operation ∧ offer.successor = after ∧
        (∀ prepared, offer.preparation = some prepared → prepared.alternative = offer.alternative) ∧
        ordinaryExecutionFrontier program state operation = { offers := [offer] } :=
    ⟨{ alternative := .operation operation.id, operation, successor := after,
       preparation := prepareInternalTransition? program state operation }, rfl, rfl,
      fun prepared found => prepareInternalTransition_alternative program state operation prepared found,
      by simp [ordinaryExecutionFrontier, ordinaryProfile, fired]; cases operation <;> exact selected⟩
  cases operation
  all_goals try exact ordinary rfl
  case reachNoneEnd id origin input =>
    obtain ⟨token, single, port⟩ : ∃ token, state.tokens = [token] ∧ token.placeId = input := by
      simpa [FirePhase, operationInputs, StructuredComposition.isScopeCompletion] using phase
    exact ordinary (by simp [selectInternalEnd?, single, port])
  case mergeExclusive id origin inputs output =>
    cases control : state.control
    all_goals try exact ordinary rfl
    case running instanceId =>
      obtain ⟨token, single, port⟩ : ∃ token, state.tokens = [token] ∧ token.placeId ∈ inputs := by
        simpa [FirePhase, operationInputs, StructuredComposition.isScopeCompletion] using phase
      have tokenOwner := framed.1 token (by simp [single])
      obtain ⟨root, definitions, _, _, rootKey, _⟩ := declared
      have origins : (program.controlPlaces.map (·.origin.elementId)).Nodup := by
        apply List.Pairwise.of_map (S := (· ≠ ·)) (fun id : SequenceFlowId => id.value)
          (fun _ _ different same => different (congrArg (fun id : SequenceFlowId => id.value) same))
        simpa only [List.map_map, Function.comp_def, List.Nodup] using program_places_unique_origins program analysis analyzed
      have scopes : state.scopeOccurrences = [{ id := token.owner, parent := none }] := by
        rcases framed.2.2.2.1 with ⟨_, scopes⟩ | ⟨completed, _⟩
        · simpa [tokenOwner] using scopes
        · simp [control] at completed
      have operationOwned : operationOwningScope? program id = some token.owner.definitionScopeId := by
        obtain ⟨_, _, _, _, _, bound⟩ := position_with_offered_token program analysis state frontier token position (by simp [single])
        exact SerialBusinessTask.token_operation_owned program (.mergeExclusive id origin inputs output) token wellFormed member rfl
          (by change token.placeId ∈ inputs ++ [output]; exact List.mem_append_left _ port) bound
      have time : state.logicalTimeMs = 0 := by
        have foreign := framed.2.2.2.2.1
        simp only [ForeignRuntimeEmpty] at foreign
        exact foreign.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.1
      obtain ⟨prepared, ready, applied⟩ := StructuredComposition.singleton_merge_preparation_is_total program state token root instanceId
        id origin inputs output wellFormed (program_analysis_declarations_absent program analysis analyzed).2.1 operationOwned
        origins definitions (by simpa [tokenOwner] using rootKey) member single port scopes control time
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
      · simp [mergeExecutionFrontier, ordinaryProfile, alternatives, List.mapM_cons, List.mapM_nil, ready, applied]

open InternalCommutation in
/-- Discovery preserves the actual Merge alternative and preparation, as well as ordinary operation offers. -/
theorem frontier_of_firing (program : Program) (analysis : Analysis) (state after : RuntimeState)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId)
    (ordinaryProfile : program.identity.semanticProfile.value ≠ "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" ∧
      program.identity.semanticProfile.value ≠ "cibseven-2.2.0-embedded-subprocess-completion-draft")
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis) (scalar : programEffectMappingValuePolicy program = .scalar)
    (declared : SerialBusinessTask.DeclaredRoot program owner) (framed : RootFrame owner state)
    (indexed : AtPosition program analysis state) (member : operation ∈ program.operations)
    (fired : fire? program operation state = some after) :
    ∃ offer : InternalExecutionOffer, offer.successor = after ∧
      deriveInternalExecutionFrontier program state = { offers := [offer] } ∧
      (∀ prepared, offer.preparation = some prepared → prepared.alternative = offer.alternative) := by
  obtain ⟨offer, _, successor, aligned, discovery⟩ := enabled_operation_has_singleton_discovery program analysis state after
    operation owner ordinaryProfile wellFormed analyzed scalar declared framed indexed member fired
  refine ⟨offer, successor, ?_, aligned⟩
  apply deriveInternalExecutionFrontier_singleton program state operation
  · rcases framed.2.2.2.1 with ⟨running, _⟩ | ⟨completed, _⟩ <;> simp [*]
  · apply List.Pairwise.of_map (S := (· ≠ ·)) (fun candidate : SemanticOperation => candidate.id.value)
      (fun _ _ different same => different (congrArg (fun op : SemanticOperation => op.id.value) same))
    exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  · exact member
  · exact discovery
  · intro candidate included different
    apply refused_operation_has_empty_discovery program analysis state candidate ordinaryProfile analyzed indexed
    cases selected : fire? program candidate state with
    | none => rfl
    | some successor => exact False.elim (different (firing_unique program analysis state successor after candidate operation
        owner wellFormed analyzed scalar framed indexed included member selected fired))

theorem settled_position_depth_zero (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (frontier : Option Vertex) (framed : RootFrame owner state)
    (position : Position program analysis state frontier)
    (settled : state.waits ≠ [] ∨ state.effectWaits ≠ [] ∨ state.control = .completed owner.processInstanceId) :
    positionDepth analysis state frontier = 0 := by
  rcases settled with human | effect | completed
  · cases waits : state.waits with
    | nil => exact False.elim (human waits)
    | cons first rest => simp [positionDepth, waits]
  · cases waits : state.effectWaits with
    | nil => exact False.elim (effect waits)
    | cons first rest => simp [positionDepth, waits]
  · rcases framed.2.2.2.1 with ⟨running, _⟩ | ⟨_, _, tokens, humans, effects, pending⟩
    · simp [completed] at running
    · cases position with
      | pending vertex included start kind fields => simp [frontierFields, pending] at fields
      | token vertex included token fields consumer bound => simp [frontierFields, tokens] at fields
      | human vertex included wait id origin input fields declared projected metadata owned => simp [frontierFields, humans] at fields
      | effect vertex included wait id origin input effect fields declared projected element descriptor outputs snapshot owned =>
          simp [frontierFields, effects] at fields
      | finished fields => simp [positionDepth, humans, effects, completed]

open InternalCommutation in
theorem settled_frontier (program : Program) (analysis : Analysis) (state : RuntimeState)
    (ordinaryProfile : program.identity.semanticProfile.value ≠ "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" ∧
      program.identity.semanticProfile.value ≠ "cibseven-2.2.0-embedded-subprocess-completion-draft")
    (owner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (analyzed : programAnalysis program = some analysis) (scalar : programEffectMappingValuePolicy program = .scalar) (declared : SerialBusinessTask.DeclaredRoot program owner)
    (framed : RootFrame owner state) (indexed : AtPosition program analysis state)
    (settled : state.waits ≠ [] ∨ state.effectWaits ≠ [] ∨ state.control = .completed owner.processInstanceId) :
    deriveInternalExecutionFrontier program state = {} := by
  apply deriveInternalExecutionFrontier_empty
  intro operation member
  apply refused_operation_has_empty_discovery program analysis state operation ordinaryProfile analyzed indexed
  cases fired : fire? program operation state with
  | none => rfl
  | some after =>
      obtain ⟨frontier, position, available, canonical⟩ := indexed
      obtain ⟨_, next, _, _, _, decreased⟩ := fire_preserves_position_with_depth program analysis operation state after frontier owner
        wellFormed analyzed scalar member declared framed position (by cases frontier <;> exact available) canonical fired
      have zero := settled_position_depth_zero program analysis state owner frontier framed position settled
      omega

end BpmnSemantics.SemanticProcess.MixedTaskControlFlow

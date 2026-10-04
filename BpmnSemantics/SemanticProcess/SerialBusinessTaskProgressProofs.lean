import BpmnSemantics.SemanticProcess.SerialBusinessTaskLifecycleProofs

/-! SBT-AVAILABLE-01 and SBT-CLOSURE-01 share an accepted-start reachable invariant: exact root and local ownership, ordered remaining suffix, required-input presence and canonical Process data. The proof index is not serialized execution data. -/

namespace BpmnSemantics.SemanticProcess.SerialBusinessTask

/-- Canonical issuance and the foreign-family frame close the remaining conjuncts of the actual ingress validator. -/
theorem ordered_suffix_runtime_guard (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (analyzed : programAnalysis program = some analysis) (nonempty : owner.processInstanceId.value ≠ "")
    (root : DeclaredRoot program owner) (framed : RootFrame owner state)
    (indexed : AtOrderedSuffix program analysis state) : runtimeStateWellFormed program owner.processInstanceId state = true := by
  have positionValid := ordered_suffix_position_guard program analysis state owner wellFormed analyzed nonempty root framed indexed
  have declarations := (ordered_suffix_wait_guards program analysis state owner wellFormed root framed indexed).2
  obtain ⟨retention, snapshots, compensation, _⟩ := program_analysis_declarations_absent program analysis analyzed
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have sequential : program.operations.all (sequentialMultiInstanceOperationBindingComplete program state) = true := by
    apply List.all_eq_true.mpr
    intro operation member
    have selected := allowed operation member
    cases operation <;> simp_all [OperationAllowed, sequentialMultiInstanceOperationBindingComplete]
  have noCompensation : (program.operations.any fun operation => match operation with
      | .triggerCompensation .. | .cancelTransaction .. => true | _ => false) = false := by
    apply List.any_eq_false.mpr
    intro operation member
    have selected := allowed operation member
    cases operation <;> simp_all [OperationAllowed]
  have compensationDeclaration : compensationExecutionDeclarationValid program = true := by
    unfold compensationExecutionDeclarationValid
    rw [compensation]
    change (!(program.operations.any fun operation => match operation with
      | .triggerCompensation .. | .cancelTransaction .. => true | _ => false)) = true
    rw [noCompensation]
    rfl
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
  obtain ⟨_, _, _, position, _⟩ := indexed
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

/-- The current Service's admitted input expressions are evaluable from the actual canonical suffix bindings. -/
theorem current_service_inputs_evaluable (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (vertex : Vertex) (rest : List Vertex)
    (projected : operationVertex? program (.awaitEffect id origin input output effect none) = some vertex)
    (available : SuffixAvailable state.variables.process.bindings (vertex :: rest))
    (canonical : bindingsValid (programHandlers program) state.variables.process.bindings = true) :
    ∃ arguments, evaluateEnclosingInputMappings state.variables.process.bindings effect.inputMappings = some arguments := by
  simp [operationVertex?, Option.bind_eq_some_iff] at projected
  obtain ⟨admitted, _, _, vertexEq⟩ := projected
  have mappings : mappingsValid (programHandlers program) effect.inputMappings effect.outputMappings = true := admitted.2
  apply inputs_evaluable (programHandlers program) state.variables.process.bindings effect.inputMappings
    (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappings).1).2
  intro name read
  apply canonical_present_binding_evaluable _ _ name canonical
  apply suffix_available_current_read _ vertex rest available name
  simpa [← vertexEq] using read

/-- Mandatory Human presence prevents the analyzed Start from feeding End directly. -/
theorem analysis_start_successor_not_finish (vertices : List Vertex) (analysis : Analysis)
    (first next : Vertex) (rest : List Vertex) (analyzed : analyze vertices = some analysis)
    (ordered : analysis.ordered = first :: next :: rest) (start : first.kind = .start) : next.kind ≠ .finish := by
  obtain ⟨permutation, links, _⟩ := analysis_ordered_facts vertices analysis analyzed
  have requirements : (∃ human ∈ vertices, human.kind = .human) ∧
      (∀ vertex ∈ vertices, vertex.kind = .finish → vertex.outputs = []) := by
    unfold analyze at analyzed
    split at analyzed
    · contradiction
    · rename_i admitted
      simp at admitted
      refine ⟨admitted.1.1.1.2, ?_⟩
      intro vertex member finish
      have localRule := admitted.2 vertex member
      simp [finish] at localRule
      exact localRule.2
  intro finish
  have included : next ∈ vertices := permutation.mem_iff.mp (by rw [ordered]; simp)
  have empty := requirements.2 next included finish
  have tail := chain_links_tail first (next :: rest) (by simpa [ordered] using links)
  have noRest := chain_end_has_no_suffix next rest tail empty
  obtain ⟨human, member, kind⟩ := requirements.1
  have placed := permutation.mem_iff.mpr member
  simp only [ordered, noRest, List.mem_cons, List.not_mem_nil, or_false] at placed
  rcases placed with rfl | rfl <;> simp_all

/-- The actual firing phase separates initial activation, one token consumer and root completion. -/
def SerialFirePhase (before : RuntimeState) (operation : SemanticOperation) (owner : ScopeOccurrenceId) : Prop :=
(before.initiationPending = true ∧ (match operation with | .initiate .. => true | _ => false) = true) ∨
    (∃ token, before.tokens = [token] ∧ token.placeId ∈ operationInputs operation) ∨
    (before.initiationPending = false ∧ before.tokens = [] ∧ before.waits = [] ∧ before.effectWaits = [] ∧
      StructuredComposition.isScopeCompletion operation = true ∧ before.control = .running owner.processInstanceId)

/-- Actual internal firing either retains the current waiting vertex or advances along its unique admitted output; its root frame and firing phase are derived from the same transition inversion. -/
theorem fire_preserves_suffix_with_depth (program : Program) (analysis : Analysis)
    (operation : SemanticOperation) (before after : RuntimeState)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (member : operation ∈ program.operations) (remaining : List Vertex)
    (indexed : ∃ earlier, analysis.ordered = earlier ++ remaining ∧ OrderedPosition program analysis.ordered before remaining ∧
      SuffixAvailable before.variables.process.bindings remaining ∧ bindingsValid (programHandlers program) before.variables.process.bindings = true)
    (rootOwner : ScopeOccurrenceId) (rootDeclared : DeclaredRoot program rootOwner) (framed : RootFrame rootOwner before)
    (fired : fire? program operation before = some after) :
    RootFrame rootOwner after ∧ (∃ earlier next, analysis.ordered = earlier ++ next ∧
      OrderedPosition program analysis.ordered after next ∧ SuffixAvailable after.variables.process.bindings next ∧
      bindingsValid (programHandlers program) after.variables.process.bindings = true ∧
      positionDepth after next < positionDepth before remaining) ∧ SerialFirePhase before operation rootOwner := by
  obtain ⟨tokenOwners, humanOwners, effectOwners, life, foreign, issued⟩ := framed
  obtain ⟨earlier, orderEq, position, available, canonical⟩ := indexed
  obtain ⟨_, _, _, vertices, _, _, graph⟩ := program_analysis_projection program analysis analyzed
  obtain ⟨permutation, allLinks, required, first, initialRest, firstEq, firstKind, uniqueStart⟩ :=
    analysis_ordered_facts vertices analysis graph
  have links := chain_links_suffix earlier remaining (by rw [← orderEq]; exact allLinks)
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have selected := allowed operation member
  have step := fire_sound program operation before after fired
  cases operation <;> simp only [OperationAllowed] at selected
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
      have owned := declared_initiation_owned program rootOwner id origin output wellFormed rootDeclared member
      split at active
      · rename_i pending
        obtain ⟨rfl, fields⟩ := position_with_pending_is_initial program analysis.ordered remaining before position pending
        obtain ⟨vertex, included, projected⟩ := operation_has_ordered_vertex program analysis
          (.initiate id origin output) analyzed member rfl
        simp [operationVertex?, Option.bind_eq_some_iff] at projected
        obtain ⟨nextId, consumer, vertexEq⟩ := projected
        have kind : vertex.kind = .start := by rw [← vertexEq]
        have inStarts : vertex ∈ vertices.filter (·.kind == .start) :=
          List.mem_filter.mpr ⟨permutation.mem_iff.mp included, by simp [kind]⟩
        rw [uniqueStart] at inStarts
        have same := List.mem_singleton.mp inStarts
        have outputs : first.outputs = [nextId] := by rw [← same, ← vertexEq]
        have noWrites : first.writes = [] := by rw [← same, ← vertexEq]
        obtain ⟨next, rest, restEq, named, _⟩ := chain_output_selects_next first initialRest nextId
          (by rw [← firstEq]; exact allLinks) outputs
        have nextNotEnd := analysis_start_successor_not_finish vertices analysis first next rest graph
          (by simpa [restEq] using firstEq) firstKind
        have components := fields
        simp only [frontierFields, Prod.mk.injEq] at components
        cases Option.some.inj active
        refine ⟨?_, ?_, Or.inl ⟨pending, rfl⟩⟩
        · refine ⟨?_, humanOwners, effectOwners, Or.inl runningLife, foreign, issued⟩
          simp only [frontierFields, Prod.mk.injEq] at fields
          simp [addToken, canonicalInsertBy, fields.2.1, sameOwner]
        refine ⟨[first], initialRest, by simpa using firstEq, ?_, ?_, canonical, by
          simp [positionDepth, pending, components.2.1, restEq, nextNotEnd, addToken, canonicalInsertBy]⟩
        · rw [restEq]
          apply OrderedPosition.token next rest ⟨output, owner⟩
          · simp only [frontierFields, Prod.mk.injEq] at fields
            simp [frontierFields, fields.2.1, fields.2.2.1, fields.2.2.2.1, fields.2.2.2.2,
              addToken, canonicalInsertBy]
          · simpa [named] using consumer
          · apply owned_operation_port program (.initiate id origin output) output owner wellFormed member rfl
            · simp [operationControlPlaces, operationOutputs]
            · simpa [sameOwner, SemanticOperation.id] using owned
        · intro name needed
          apply available name
          rw [firstEq]
          simp only [requiredInputs, noWrites, List.nil_append, List.mem_append]
          exact Or.inr needed
      · contradiction
  case awaitUserTask id origin input output task =>
    cases step with
    | awaitUserTask _ _ _ _ _ _ _ active =>
      simp only [awaitUserTaskState?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨owner, found, instanceId, running, active⟩ := active
      obtain ⟨vertex, rest, token, rfl, fields, inputEq, ownerEq, consumer, tokenDeclared⟩ :=
        position_with_token_has_current_head program analysis.ordered remaining before input owner position found
      have included : vertex ∈ analysis.ordered := by rw [orderEq]; simp
      have projected := token_consumer_projects_current_vertex program analysis (.awaitUserTask id origin input output task)
        vertex input wellFormed analyzed member included (by simp [operationInputs]) consumer
      have owned := token_operation_owned program (.awaitUserTask id origin input output task) token wellFormed member rfl
        (by change token.placeId ∈ [input, output]; simp [inputEq]) tokenDeclared
      simp only [frontierFields, Prod.mk.injEq] at fields
      have runningLife := root_lifecycle_running_of_token rootOwner before life token (by simp [fields.2.1])
      have root := tokenOwners token (by simp [fields.2.1])
      cases Option.some.inj active
      refine ⟨?_, ?_, Or.inr (Or.inl ⟨token, fields.2.1, by simp [operationInputs, inputEq]⟩)⟩
      · refine ⟨?_, ?_, ?_, Or.inl runningLife, foreign,
          user_activation_issuance before owner.processInstanceId owner input output task issued fields.2.2.1⟩ <;>
          simp [activateUserTask, fields.2.1, fields.2.2.1, fields.2.2.2.1, inputEq, ownerEq, root, removeToken, insertUserTaskWait]
      refine ⟨earlier, vertex :: rest, orderEq, ?_, available, canonical, by
        simp [positionDepth, activateUserTask, fields.1, fields.2.1, fields.2.2.1, inputEq, ownerEq, removeToken, insertUserTaskWait]
        split <;> omega⟩
      apply OrderedPosition.human vertex rest
        { processInstanceId := owner.processInstanceId, owner, task, activation := activationCount before task.id + 1,
          output, metadata := task.metadata } id origin input
      · simp [frontierFields, activateUserTask, fields.1, fields.2.1, fields.2.2.1,
          fields.2.2.2.1, fields.2.2.2.2, inputEq, ownerEq, removeToken, insertUserTaskWait]
      · exact member
      · exact projected
      · rfl
      · simpa [ownerEq, SemanticOperation.id] using owned
  case awaitEffect id origin input output effect route =>
    cases route with
    | some route => contradiction
    | none =>
      cases step with
      | awaitEffect _ _ _ _ _ _ _ _ active =>
        simp only [awaitEffectState?, bind, pure, Option.bind_eq_some_iff] at active
        obtain ⟨owner, found, instanceId, running, arguments, evaluated, active⟩ := active
        obtain ⟨vertex, rest, token, rfl, fields, inputEq, ownerEq, consumer, tokenDeclared⟩ :=
          position_with_token_has_current_head program analysis.ordered remaining before input owner position found
        have included : vertex ∈ analysis.ordered := by rw [orderEq]; simp
        have projected := token_consumer_projects_current_vertex program analysis (.awaitEffect id origin input output effect none)
          vertex input wellFormed analyzed member included (by simp [operationInputs]) consumer
        have owned := token_operation_owned program (.awaitEffect id origin input output effect none) token wellFormed member rfl
          (by change token.placeId ∈ [input, output]; simp [inputEq]) tokenDeclared
        simp only [frontierFields, Prod.mk.injEq] at fields
        have runningLife := root_lifecycle_running_of_token rootOwner before life token (by simp [fields.2.1])
        have root := tokenOwners token (by simp [fields.2.1])
        split at active
        · contradiction
        · cases Option.some.inj active
          refine ⟨?_, ?_, Or.inr (Or.inl ⟨token, fields.2.1, by simp [operationInputs, inputEq]⟩)⟩
          · refine ⟨?_, ?_, ?_, Or.inl runningLife, foreign,
              effect_activation_issuance before owner.processInstanceId owner input output effect issued⟩ <;>
              simp [activateEffect, fields.2.1, fields.2.2.1, fields.2.2.2.1, inputEq, ownerEq, root,
                removeToken, insertEffectWait, canonicalInsertBy]
          refine ⟨earlier, vertex :: rest, orderEq, ?_, available, canonical, by
            simp [positionDepth, activateEffect, fields.1, fields.2.1, fields.2.2.1, fields.2.2.2.1, inputEq, ownerEq, removeToken, insertEffectWait, canonicalInsertBy]
            split <;> omega⟩
          apply OrderedPosition.effect vertex rest
            { processInstanceId := owner.processInstanceId, owner, elementId := effect.elementId,
              activation := effectActivationCount before effect.elementId + 1, descriptor := effect.descriptor,
              arguments, outputMappings := effect.outputMappings, output, bpmnErrorRoute := none }
            id origin input effect
          · simp [frontierFields, activateEffect, evaluated, fields.1, fields.2.1, fields.2.2.1,
              fields.2.2.2.1, fields.2.2.2.2, inputEq, ownerEq, removeToken, insertEffectWait,
              canonicalInsertBy, addActivityVariableScope, insertActivityVariableScope]
          · exact member
          · exact projected
          · rfl
          · rfl
          · rfl
          · exact evaluateEnclosingInputMappings_snapshot _ _ _ evaluated
          · rfl
          · simpa [ownerEq, SemanticOperation.id] using owned
  case reachNoneEnd id origin input =>
    cases step with
    | reachNoneEnd _ _ _ _ _ active =>
      simp only [reachNoneEndState?, bind, pure, Option.bind_eq_some_iff] at active
      obtain ⟨owner, found, instanceId, running, active⟩ := active
      obtain ⟨vertex, rest, token, rfl, fields, inputEq, ownerEq, consumer, tokenDeclared⟩ :=
        position_with_token_has_current_head program analysis.ordered remaining before input owner position found
      have included : vertex ∈ analysis.ordered := by rw [orderEq]; simp
      have projected := token_consumer_projects_current_vertex program analysis (.reachNoneEnd id origin input)
        vertex input wellFormed analyzed member included (by simp [operationInputs]) consumer
      have outputs : vertex.outputs = [] := by
        simp [operationVertex?] at projected
        cases projected
        rfl
      have endKind : vertex.kind = .finish := by
        simp [operationVertex?] at projected
        cases projected
        rfl
      have noRest := chain_end_has_no_suffix vertex rest links outputs
      subst rest
      simp only [frontierFields, Prod.mk.injEq] at fields
      have runningLife := root_lifecycle_running_of_token rootOwner before life token (by simp [fields.2.1])
      cases Option.some.inj active
      refine ⟨?_, ?_, Or.inr (Or.inl ⟨token, fields.2.1, by simp [operationInputs, inputEq]⟩)⟩
      · refine ⟨?_, humanOwners, effectOwners, Or.inl runningLife, foreign, issued⟩
        simp [reachNoneEndToken, fields.2.1, inputEq, ownerEq, removeToken]
      refine ⟨earlier ++ [vertex], [], by simpa [List.append_assoc] using orderEq, ?_, ?_, canonical, by
        simp [positionDepth, reachNoneEndToken, fields.1, fields.2.1, fields.2.2.1, fields.2.2.2.1,
          runningLife.1, endKind, inputEq, ownerEq, removeToken]⟩
      · apply OrderedPosition.finished
        simp [frontierFields, reachNoneEndToken, fields.1, fields.2.1, fields.2.2.1,
          fields.2.2.2.1, fields.2.2.2.2, inputEq, ownerEq, removeToken]
      · intro name needed; simp [requiredInputs] at needed
  case completeScope id origin scope output =>
    cases output with
    | some output => contradiction
    | none =>
      cases step with
      | completeScope _ _ _ _ _ _ completed =>
        rw [selected_completion_is_root program before scope allowed] at completed
        obtain ⟨running, quiet, pending, rfl⟩ := root_completion_shape before after rootOwner scope
          ⟨tokenOwners, humanOwners, effectOwners, life, foreign, issued⟩ completed
        obtain ⟨noTokens, noHumans, noEffects⟩ := quiescent_root_frontier_empty before rootOwner tokenOwners
          (fun wait member => (humanOwners wait member).1) (fun wait member => (effectOwners wait member).1) quiet
        refine ⟨?_, ?_, Or.inr (Or.inr ⟨pending, noTokens, noHumans, noEffects, rfl, running⟩)⟩
        · simp_all [RootFrame, RootLifecycle, ForeignRuntimeEmpty, IssuanceFrame]
        exact ⟨earlier, remaining, orderEq, position_frame _ _ _ _ _ position rfl, available, canonical, by
          simp [positionDepth, pending, noTokens, noHumans, noEffects, running]⟩

/-- A complete mapped result advances exactly one Service suffix and disposes exactly the captured local owner. -/
theorem effect_completion_preserves_ordered_suffix (program : Program) (analysis : Analysis)
    (before after : RuntimeState) (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis) (indexed : AtOrderedSuffix program analysis before)
    (owner : ScopeOccurrenceId) (framed : RootFrame owner before)
    (completed : completeSerialEffect? program before effectId result = some after) :
    RootFrame owner after ∧ AtOrderedSuffix program analysis after := by
  obtain ⟨tokensOwned, humansOwned, effectsOwned, life, foreign, issued⟩ := framed
  obtain ⟨earlier, remaining, orderEq, position, available, canonical⟩ := indexed
  obtain ⟨_, _, _, vertices, _, _, graph⟩ := program_analysis_projection program analysis analyzed
  have links := chain_links_suffix earlier remaining (by rw [← orderEq]; exact (analysis_ordered_facts vertices analysis graph).2.1)
  have sound := completeSerialEffect_sound program before after effectId result completed
  cases sound with
  | commit selected scope patch bindings occurrence owned mapped =>
    have live : selected ∈ before.effectWaits := (List.mem_filter.mp
      (show selected ∈ before.effectWaits.filter (effectOccurrenceMatches effectId) by rw [occurrence]; simp)).1
    have runningLife : before.control = .running owner.processInstanceId ∧
        before.scopeOccurrences = [{ id := owner, parent := none }] := by
      rcases life with running | ⟨_, _, _, _, empty, _⟩
      · exact running
      · simp [empty] at live
    have root := effectsOwned selected live
    cases position with
    | pending fields =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        simp [fields.2.2.2.1] at live
    | token vertex rest token fields consumer bound =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        simp [fields.2.2.2.1] at live
    | human vertex rest wait id origin input fields declared projected metadata owned =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        simp [fields.2.2.2.1] at live
    | finished fields =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        simp [fields.2.2.2.1] at live
    | effect vertex rest wait id origin input effect fields declared projected element descriptor outputs snapshot route owned =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        have same : selected = wait := by simpa [fields.2.2.2.1] using live
        subst selected
        have localMatch : activityScopeMatches effectId
            { owner := .effectOccurrence ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩,
              bindings := wait.arguments } = true := by
          cases matched : activityScopeMatches effectId
              { owner := .effectOccurrence ⟨wait.processInstanceId, ⟨wait.elementId.value⟩, wait.activation⟩,
                bindings := wait.arguments } <;> simp_all
        simp [operationVertex?, Option.bind_eq_some_iff] at projected
        obtain ⟨admitted, nextId, consumer, vertexEq⟩ := projected
        have mappings : mappingsValid (programHandlers program) effect.inputMappings effect.outputMappings = true := admitted.2
        have nextOutput : vertex.outputs = [nextId] := by rw [← vertexEq]
        have targets : vertex.writes = wait.outputMappings.map (·.target) := by rw [← vertexEq, ← outputs]
        obtain ⟨next, more, restEq, named, _⟩ := chain_output_selects_next vertex rest nextId links nextOutput
        refine ⟨?_, ?_⟩
        · refine ⟨?_, humansOwned, ?_, Or.inl runningLife, foreign, issued⟩ <;>
            simp [fields.2.2.2.1, fields.2.1, root.1, addToken, canonicalInsertBy]
        refine ⟨earlier ++ [vertex], rest, by simpa [List.append_assoc] using orderEq, ?_, ?_, ?_⟩
        · rw [restEq]
          apply OrderedPosition.token next more ⟨wait.output, wait.owner⟩
          · simp [frontierFields, fields.1, fields.2.1, fields.2.2.1, fields.2.2.2.1,
              fields.2.2.2.2, localMatch, addToken, canonicalInsertBy]
          · simpa [named] using consumer
          · exact owned_operation_port program (.awaitEffect id origin input wait.output effect none) wait.output wait.owner
              wellFormed declared rfl (by simp [operationControlPlaces, operationOutputs]) owned
        · exact successful_result_advances_available_suffix (programHandlers program) wait.outputMappings
            before.variables.process.bindings patch bindings vertex rest targets available mapped
        · have mappedOutputs : mappingsValid (programHandlers program) effect.inputMappings wait.outputMappings = true := by
            simpa [outputs] using mappings
          exact serial_patch_preserves_domain _ _ _ _ _ _
            (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp canonical).1)
            (strictlySortedStrings_nodup _ (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp (Bool.and_eq_true_iff.mp mappedOutputs).1).1).2)
            canonical mappedOutputs mapped

theorem human_admission_preserves_ordered_suffix (program : Program) (analysis : Analysis)
    (before : RuntimeState) (commandId : SemanticId) (taskId : UserTaskInstanceId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis) (indexed : AtOrderedSuffix program analysis before)
    (owner : ScopeOccurrenceId) (framed : RootFrame owner before) :
    RootFrame owner (admitStimulus program before (.completeUserTaskInstance commandId taskId bindings)).state ∧
    AtOrderedSuffix program analysis (admitStimulus program before
      (.completeUserTaskInstance commandId taskId bindings)).state := by
  obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
  cases guarded : serialBusinessCommandAdmitted program before (.completeUserTaskInstance commandId taskId bindings) with
  | false => simpa [admitStimulus, snapshots, guarded] using And.intro framed indexed
  | true =>
    rw [serial_completion_admission_eq_dispatch program analysis before _ profile analyzed framed.2.2.2.2.1 guarded trivial]
    rcases human_dispatch_cases program analysis before commandId taskId bindings profile analyzed with
      ⟨refused, _⟩ | ⟨after, _patchValid, completed, accepted⟩
    · simpa [refused] using And.intro framed indexed
    · rw [accepted]
      exact human_completion_preserves_ordered_suffix program analysis before after taskId.processInstanceId
        ⟨taskId.elementId.value⟩ taskId.activation bindings _patchValid wellFormed analyzed indexed owner framed completed

theorem effect_admission_preserves_ordered_suffix (program : Program) (analysis : Analysis)
    (before : RuntimeState) (commandId : SemanticId) (effectId : EffectOccurrenceId) (result : EffectExecutionResult)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis) (indexed : AtOrderedSuffix program analysis before)
    (owner : ScopeOccurrenceId) (framed : RootFrame owner before) :
    RootFrame owner (admitStimulus program before (.completeEffect commandId effectId result)).state ∧
    AtOrderedSuffix program analysis (admitStimulus program before (.completeEffect commandId effectId result)).state := by
  obtain ⟨_, snapshots, _⟩ := program_analysis_declarations_absent program analysis analyzed
  cases guarded : serialBusinessCommandAdmitted program before (.completeEffect commandId effectId result) with
  | false => simpa [admitStimulus, snapshots, guarded] using And.intro framed indexed
  | true =>
    rw [serial_completion_admission_eq_dispatch program analysis before _ profile analyzed framed.2.2.2.2.1 guarded trivial]
    rcases guarded_effect_dispatch_cases program analysis before commandId effectId result profile analyzed guarded with
      refused | ⟨after, completed, accepted⟩
    · simpa [refused] using And.intro framed indexed
    · rw [accepted]
      exact effect_completion_preserves_ordered_suffix program analysis before after effectId result wellFormed analyzed indexed owner framed completed

/-- One admitted start supplies its exact root, pending position and required canonical data together. -/
theorem committed_start_has_serial_invariant (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed) :
    ∃ owner, owner.processInstanceId = instanceId ∧ DeclaredRoot program owner ∧ RootFrame owner (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).state ∧ AtOrderedSuffix program analysis (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).state := by
  have supplied := committed_start_supplies_suffix program analysis commandId processId instanceId bindings profile analyzed committed
  obtain ⟨noRetention, _, _, noListeners⟩ := program_analysis_declarations_absent program analysis analyzed
  have created := committed_start_has_exact_builder program analysis commandId processId instanceId bindings profile analyzed committed
  simp only [runningProgramStartState?, bind, pure, Option.bind_eq_some_iff] at created
  obtain ⟨root, found, created⟩ := created
  refine ⟨⟨instanceId, root.id, 1⟩, rfl, analyzed_start_root_declared program analysis instanceId root analyzed found, ?_, ?_⟩
  · rw [← Option.some.inj created]
    simp [RootFrame, RootLifecycle, ForeignRuntimeEmpty, IssuanceFrame, orderedBy, noRetention, noListeners, runningStartState,
      initialState, emptyScopedVariables]
  · rw [← Option.some.inj created]
    exact ⟨[], analysis.ordered, rfl, .pending rfl, supplied.2, supplied.1⟩


/-- The phase is a projection of joint preservation, under the same admitted-position premises. -/
theorem serial_fire_phase (program : Program) (analysis : Analysis) (before after : RuntimeState)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (declared : DeclaredRoot program owner) (framed : RootFrame owner before)
    (indexed : AtOrderedSuffix program analysis before) (member : operation ∈ program.operations)
    (fired : fire? program operation before = some after) : SerialFirePhase before operation owner := by
  obtain ⟨earlier, remaining, ordered, position, available, canonical⟩ := indexed
  exact (fire_preserves_suffix_with_depth program analysis operation before after wellFormed analyzed member remaining
    ⟨earlier, ordered, position, available, canonical⟩ owner declared framed fired).2.2

theorem serial_firing_unique (program : Program) (analysis : Analysis) (state leftAfter rightAfter : RuntimeState)
    (left right : SemanticOperation) (owner : ScopeOccurrenceId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (declared : DeclaredRoot program owner) (framed : RootFrame owner state) (indexed : AtOrderedSuffix program analysis state)
    (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (leftFired : fire? program left state = some leftAfter) (rightFired : fire? program right state = some rightAfter) : left = right := by
  have phase := fun operation after member fired => serial_fire_phase program analysis state after operation owner wellFormed analyzed declared framed indexed member fired
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
      · obtain ⟨_, _, _, position, _⟩ := indexed
        cases position <;> simp_all [frontierFields]
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
      obtain ⟨_, _, _, _, completions, _⟩ := program_analysis_projection program analysis analyzed
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
      obtain ⟨_, _, _, position, _⟩ := indexed
      have consumer : ∃ target, consumer? program token.placeId = some target := by
        cases position <;> simp_all [frontierFields]
      obtain ⟨target, selected⟩ := consumer
      obtain ⟨_, census, _⟩ := consumer_exact program token.placeId target selected
      exact singletonSame (fun operation => (operationInputs operation).contains token.placeId)
        (by rw [census]; rfl) (by simpa using leftPort) (by simpa using rightPort)

open InternalCommutation in
/-- A real enabled serial operation is the scheduler's unique faithful offer; preparation remains optional on this actual singleton path. -/
theorem serial_frontier_of_firing (program : Program) (analysis : Analysis) (state after : RuntimeState)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (declared : DeclaredRoot program owner) (framed : RootFrame owner state) (indexed : AtOrderedSuffix program analysis state)
    (member : operation ∈ program.operations) (fired : fire? program operation state = some after) :
    let offer : InternalExecutionOffer := {
      alternative := .operation operation.id, operation := operation, successor := after
      preparation := prepareInternalTransition? program state operation }
    deriveInternalExecutionFrontier program state = { offers := [offer] } ∧
      (∀ prepared, offer.preparation = some prepared → prepared.alternative = offer.alternative) := by
  dsimp only
  constructor
  · apply deriveInternalExecutionFrontier_singleton program state operation
    · rcases framed.2.2.2.1 with ⟨running, _⟩ | ⟨completed, _⟩ <;> simp [*]
    · apply List.Pairwise.of_map (S := (· ≠ ·)) (fun candidate : SemanticOperation => candidate.id.value)
        (fun _ _ different same => different (congrArg (fun op : SemanticOperation => op.id.value) same))
      exact strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
    · exact member
    · have allowed := program_analysis_operations_allowed program analysis analyzed operation member
      cases operation <;> simp only [OperationAllowed] at allowed
      all_goals try contradiction
      all_goals try (simp [ordinaryExecutionFrontier, fired]; done)
      case reachNoneEnd id origin input =>
        obtain ⟨token, single, port⟩ : ∃ token, state.tokens = [token] ∧ token.placeId = input := by
          simpa [SerialFirePhase, operationInputs, StructuredComposition.isScopeCompletion] using serial_fire_phase program analysis
            state after (.reachNoneEnd id origin input) owner wellFormed analyzed declared framed indexed member fired
        simp [ordinaryExecutionFrontier, fired, selectInternalEnd?, single, port]
    · intro candidate included different
      have refused : fire? program candidate state = none := by
        cases selected : fire? program candidate state with
        | none => rfl
        | some successor => exact False.elim (different (serial_firing_unique program analysis state successor after candidate operation
            owner wellFormed analyzed declared framed indexed included member selected fired))
      have allowed := program_analysis_operations_allowed program analysis analyzed candidate included
      cases candidate <;> simp only [OperationAllowed] at allowed
      all_goals try contradiction
      all_goals simp [ordinaryExecutionFrontier, refused]
  · exact fun prepared selected => prepareInternalTransition_alternative program state operation prepared selected

/-- Every indexed position either exposes its live external interaction, has completed, or enables a real declared operation. -/
theorem serial_position_progress (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (analyzed : programAnalysis program = some analysis) (declared : DeclaredRoot program owner)
    (framed : RootFrame owner state) (indexed : AtOrderedSuffix program analysis state) :
    state.waits ≠ [] ∨ state.effectWaits ≠ [] ∨ state.control = .completed owner.processInstanceId ∨
      ∃ operation ∈ program.operations, ∃ after, fire? program operation state = some after := by
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have absent := (program_analysis_declarations_absent program analysis analyzed).2.1
  obtain ⟨earlier, remaining, orderEq, position, available, canonical⟩ := indexed
  obtain ⟨completionId, completionOrigin, completionScope, vertices, completions, _, graph⟩ :=
    program_analysis_projection program analysis analyzed
  have life := framed.2.2.2.1
  rcases life with ⟨running, scopes⟩ | ⟨completed, _⟩
  · cases position with
    | human vertex rest wait id origin input fields member projected metadata owned =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        exact Or.inl (by simp [fields.2.2.1])
    | effect vertex rest wait id origin input effect fields member projected element descriptor outputs snapshot route owned =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        exact Or.inr (Or.inl (by simp [fields.2.2.2.1]))
    | pending fields =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        obtain ⟨_, _, _, first, rest, ordered, kind, _⟩ := analysis_ordered_facts vertices analysis graph
        obtain ⟨operation, member, projected⟩ := ordered_vertex_has_operation program analysis first analyzed (by simp [ordered])
        apply Or.inr ∘ Or.inr ∘ Or.inr
        refine ⟨operation, member, ?_⟩
        have selected := allowed operation member
        cases operation <;> simp only [OperationAllowed] at selected
        all_goals try contradiction
        case initiate id origin output =>
          simp only [fire?, absent]
          change ∃ after, initiateState? state output = some after
          simp [initiateState?, rootScopeOccurrence?, scopes, fields.1]
        all_goals simp [operationVertex?, Option.bind_eq_some_iff] at projected
        all_goals try (obtain ⟨_, _, _, vertexEq⟩ := projected; simp [← vertexEq] at kind)
        all_goals try (obtain ⟨_, _, vertexEq⟩ := projected; simp [← vertexEq] at kind)
        all_goals try (cases projected; contradiction)
        case awaitEffect id origin input output effect route =>
          cases route with
          | some route => contradiction
          | none =>
            simp [Option.bind_eq_some_iff] at projected
            obtain ⟨_, _, _, vertexEq⟩ := projected
            simp [← vertexEq] at kind
    | token vertex rest token fields consumer bound =>
        simp only [frontierFields, Prod.mk.injEq] at fields
        obtain ⟨operation, census, named⟩ := consumer_exact program token.placeId vertex.id consumer
        clear named
        have selectedMember : operation ∈ program.operations.filter (fun op => (operationInputs op).contains token.placeId) := by rw [census]; simp
        obtain ⟨member, consumes⟩ := List.mem_filter.mp selectedMember
        have consumes' : token.placeId ∈ operationInputs operation := by simpa using consumes
        have projected := token_consumer_projects_current_vertex program analysis operation vertex token.placeId wellFormed analyzed member
          (by rw [orderEq]; simp) consumes' consumer
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
          cases route with
          | some route => contradiction
          | none =>
            obtain ⟨arguments, evaluated⟩ := current_service_inputs_evaluable program state id origin input output effect vertex rest projected available canonical
            simp only [fire?, absent]
            change ∃ after, awaitEffectState? state input output effect none = some after
            simp [awaitEffectState?, onlyTokenOwner?, tokenOwners,
              fields.2.1, consumes', runningInstance?, running, evaluated, fields.2.2.2.2]
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
        rw [selected_completion_is_root program state completionScope allowed]
        simp [completeScopeState?, scopes, rootKey, key, quiet, completeQuiescentScope?, running, fields.1]
  · exact Or.inr (Or.inr (Or.inl completed))

open InternalCommutation in
/-- Actual live waits and completed roots have an empty scheduler frontier; an empty running root is excluded. -/
theorem serial_settled_frontier (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (analyzed : programAnalysis program = some analysis) (declared : DeclaredRoot program owner)
    (framed : RootFrame owner state) (indexed : AtOrderedSuffix program analysis state)
    (settled : state.waits ≠ [] ∨ state.effectWaits ≠ [] ∨ state.control = .completed owner.processInstanceId) :
    deriveInternalExecutionFrontier program state = {} := by
  apply deriveInternalExecutionFrontier_empty
  intro operation member
  have refused : fire? program operation state = none := by
    cases fired : fire? program operation state with
    | none => rfl
    | some after =>
        have phase := serial_fire_phase program analysis state after operation owner wellFormed analyzed declared framed indexed member fired
        obtain ⟨_, _, _, position, _⟩ := indexed
        have life := framed.2.2.2.1
        rcases life with ⟨running, _⟩ | ⟨completed, scopes, tokens, waits, effects, pending⟩
        all_goals cases position <;> simp_all [SerialFirePhase, frontierFields]
  have allowed := program_analysis_operations_allowed program analysis analyzed operation member
  cases operation <;> simp only [OperationAllowed] at allowed
  all_goals try contradiction
  all_goals simp [ordinaryExecutionFrontier, refused]

open InternalCommutation in
/-- The actual singleton scheduler drains the indexed depth, preserving actual reachability independently of optional publication records. -/
theorem serial_scheduled_closure (program : Program) (analysis : Analysis) (baseline state : RuntimeState)
    (owner : ScopeOccurrenceId) (commandId : SemanticId) (fuel index ordinal : Nat) (remaining : List Vertex)
    (wellFormed : programWellFormed program = true) (analyzed : programAnalysis program = some analysis)
    (declared : DeclaredRoot program owner) (framed : RootFrame owner state)
    (indexed : ∃ earlier, analysis.ordered = earlier ++ remaining ∧ OrderedPosition program analysis.ordered state remaining ∧
      SuffixAvailable state.variables.process.bindings remaining ∧ bindingsValid (programHandlers program) state.variables.process.bindings = true)
    (reachable : ExecutionReachable program baseline state) (within : positionDepth state remaining ≤ fuel) :
    let closed := closeScheduledTraced fuel program commandId index ordinal [] state
    closed.failed = false ∧ ExecutionReachable program baseline closed.state ∧
      (closed.state.waits ≠ [] ∨ closed.state.effectWaits ≠ [] ∨ closed.state.control = .completed owner.processInstanceId) := by
  induction fuel using Nat.strongRecOn generalizing state remaining index with
  | ind fuel ih =>
    obtain ⟨earlier, ordered, position, available, canonical⟩ := indexed
    have atSuffix : AtOrderedSuffix program analysis state := ⟨earlier, remaining, ordered, position, available, canonical⟩
    by_cases settled : state.waits ≠ [] ∨ state.effectWaits ≠ [] ∨ state.control = .completed owner.processInstanceId
    · rw [closeScheduledTraced_stable fuel program commandId index ordinal state
        (serial_settled_frontier program analysis state owner wellFormed analyzed declared framed atSuffix settled)]
      exact ⟨rfl, reachable, settled⟩
    · have progress := serial_position_progress program analysis state owner wellFormed analyzed declared framed atSuffix
      have enabled : ∃ operation ∈ program.operations, ∃ after, fire? program operation state = some after := by
        rcases progress with human | effect | completed | enabled
        · exact False.elim (settled (Or.inl human))
        · exact False.elim (settled (Or.inr (Or.inl effect)))
        · exact False.elim (settled (Or.inr (Or.inr completed)))
        · exact enabled
      obtain ⟨operation, member, after, fired⟩ := enabled
      obtain ⟨afterFrame, ⟨nextEarlier, next, nextOrder, nextPosition, nextAvailable, nextCanonical, decreased⟩, _⟩ :=
        fire_preserves_suffix_with_depth program analysis operation state after wellFormed analyzed member remaining
          ⟨earlier, ordered, position, available, canonical⟩ owner declared framed fired
      have selected : program.operations.find? (fun op => decide (op.id = operation.id)) = some operation := by
        rw [← List.head?_filter, filter_key_eq_singleton_of_nodup program.operations (·.id) operation
          (StructuredComposition.admitted_program_has_unique_identity_keys program wellFormed).1 member]
        rfl
      have nextReach := ExecutionReachable.step operation.id reachable
        (show SemanticProcess.step program state operation.id = some after by simp [SemanticProcess.step, selected, fired])
      cases fuel with
      | zero => omega
      | succ fuel =>
        have tail := ih fuel (by omega) after (index + 1) next afterFrame
          ⟨nextEarlier, nextOrder, nextPosition, nextAvailable, nextCanonical⟩ nextReach (by omega)
        obtain ⟨frontier, aligned⟩ := serial_frontier_of_firing program analysis state after operation owner wellFormed analyzed declared framed atSuffix member fired
        have equations := closeScheduledTraced_singleton_step fuel program commandId index ordinal state _ frontier aligned
        change (closeScheduledTraced (fuel + 1) program commandId index ordinal [] state).failed = false ∧ _
        rw [equations.2, equations.1]
        exact tail

/-- Guard construction consumes only the indexed state facts, independently of the reachability derivation. -/
theorem indexed_completion_guard (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (stimulus : Stimulus) (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (wellFormed : programWellFormed program = true) (capabilities : programProfileCapabilitiesValid program = true)
    (framed : RootFrame owner state) (indexed : AtOrderedSuffix program analysis state)
    (associations : serialRuntimeAssociationsValid program state = true)
    (runtime : runtimeStateWellFormed program owner.processInstanceId state = true) (completion : IsSerialCompletion stimulus) :
    serialBusinessCommandAdmitted program state stimulus = true := by
  obtain ⟨_, _, _, _, _, canonical⟩ := indexed
  rcases framed.2.2.2.1 with ⟨control, _⟩ | ⟨control, _⟩
  all_goals
    unfold serialBusinessCommandAdmitted
    rw [show (program.identity.semanticProfile != serialBusinessTaskProfileId) = false from by rw [profile]; rfl]
    simp only [Bool.false_and, Bool.false_eq_true, ↓reduceIte, wellFormed, capabilities, canonical, associations, control, runtime, Bool.true_and]
    cases stimulus <;> simp only [IsSerialCompletion] at completion <;> (first | contradiction | rfl)

/-- Accepted start derives the one exact Process owner, foreign-state absence, ordered position, remaining-input presence and captured local lifetime together. -/
theorem reached_serial_invariant (program : Program) (analysis : Analysis)
    (commandId processId instanceId : SemanticId) (bindings : List VariableBinding) (reached : RuntimeState)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).outcome = .committed)
    (reachable : ExecutionReachable program (admitStimulus program initialState
      (.startProcess commandId processId instanceId bindings)).state reached) :
    ∃ owner, owner.processInstanceId = instanceId ∧ instanceId.value ≠ "" ∧ DeclaredRoot program owner ∧ RootFrame owner reached ∧ AtOrderedSuffix program analysis reached ∧
      serialRuntimeAssociationsValid program reached = true ∧ runtimeStateWellFormed program instanceId reached = true ∧
      ∀ stimulus, AdmissibleCompletion program reached stimulus → (admitStimulus program reached stimulus).outcome = .committed := by
  have guarded := serial_committed_ingress_has_checked_predecessor program initialState
    (.startProcess commandId processId instanceId bindings) committed
  obtain ⟨wellFormed, capabilities⟩ := guarded_program_admission program initialState
    (.startProcess commandId processId instanceId bindings) profile guarded
  have nonempty := guarded_start_instance_nonempty program initialState commandId processId instanceId bindings profile guarded
  obtain ⟨owner, instanceEq, declared, framed, initialPosition⟩ :=
    committed_start_has_serial_invariant program analysis commandId processId instanceId bindings profile analyzed committed
  have joint : RootFrame owner reached ∧ AtOrderedSuffix program analysis reached := by
    induction reachable with
    | initial => exact ⟨framed, initialPosition⟩
    | step choice reachable executed ih =>
        unfold SemanticProcess.step at executed
        split at executed
        · contradiction
        · rename_i operation selected
          have member := List.mem_of_find?_eq_some selected
          obtain ⟨earlier, remaining, order, position, available, canonical⟩ := ih.2
          obtain ⟨frame, ⟨nextEarlier, next, nextOrder, nextPosition, nextAvailable, nextCanonical, _⟩, _⟩ :=
            fire_preserves_suffix_with_depth program analysis operation _ _ wellFormed analyzed member remaining
              ⟨earlier, order, position, available, canonical⟩ owner declared ih.1 executed
          exact ⟨frame, nextEarlier, next, nextOrder, nextPosition, nextAvailable, nextCanonical⟩
    | human commandId taskId bindings reachable ih =>
        exact human_admission_preserves_ordered_suffix program analysis _ commandId taskId bindings profile wellFormed analyzed ih.2 owner ih.1
    | effect commandId effectId result reachable ih =>
        exact effect_admission_preserves_ordered_suffix program analysis _ commandId effectId result profile wellFormed analyzed ih.2 owner ih.1
  have associations := (ordered_suffix_wait_guards program analysis reached owner wellFormed declared joint.1 joint.2).1
  have runtime := ordered_suffix_runtime_guard program analysis reached owner wellFormed analyzed
    (by simpa [instanceEq] using nonempty) declared joint.1 joint.2
  refine ⟨owner, instanceEq, nonempty, declared, joint.1, joint.2, associations, by simpa [instanceEq] using runtime, ?_⟩
  intro stimulus admissible
  have completion : IsSerialCompletion stimulus := by
    cases admissible <;> trivial
  have guarded := indexed_completion_guard program analysis reached owner stimulus profile wellFormed capabilities
    joint.1 joint.2 associations runtime completion
  rw [serial_completion_admission_eq_dispatch program analysis reached stimulus profile analyzed joint.1.2.2.2.2.1 guarded completion]
  exact admissible_completion_dispatch_commits program analysis reached owner stimulus profile analyzed joint.1 joint.2 admissible

open InternalCommutation in
/-- Accepted start and actual reachability suffice for bounded closure, including every actual User/effect resumption. -/
theorem reached_scheduled_closure_is_bounded (program : Program) (analysis : Analysis)
    (startCommandId commandId processId instanceId : SemanticId) (bindings : List VariableBinding)
    (state : RuntimeState) (fuel index ordinal : Nat)
    (profile : program.identity.semanticProfile = serialBusinessTaskProfileId)
    (analyzed : programAnalysis program = some analysis)
    (committed : (admitStimulus program initialState (.startProcess startCommandId processId instanceId bindings)).outcome = .committed)
    (reachable : ExecutionReachable program (admitStimulus program initialState (.startProcess startCommandId processId instanceId bindings)).state state)
    (within : 2 ≤ fuel) :
    let closed := closeScheduledTraced fuel program commandId index ordinal [] state
    closed.failed = false ∧ ExecutionReachable program
      (admitStimulus program initialState (.startProcess startCommandId processId instanceId bindings)).state closed.state ∧
      (closed.state.waits ≠ [] ∨ closed.state.effectWaits ≠ [] ∨ closed.state.control = .completed instanceId) := by
  obtain ⟨owner, instanceEq, _, declared, framed, indexed, _⟩ :=
    reached_serial_invariant program analysis startCommandId processId instanceId bindings state profile analyzed committed reachable
  have static := guarded_program_admission program initialState (.startProcess startCommandId processId instanceId bindings) profile
    (serial_committed_ingress_has_checked_predecessor program initialState _ committed)
  have wellFormed := static.1
  obtain ⟨earlier, remaining, ordered, position, available, canonical⟩ := indexed
  have bound := (position_depth_spec program analysis.ordered remaining state owner framed position).1
  simpa [instanceEq] using serial_scheduled_closure program analysis _ state owner commandId fuel index ordinal remaining
    wellFormed analyzed declared framed ⟨earlier, ordered, position, available, canonical⟩ reachable (Nat.le_trans bound within)

end BpmnSemantics.SemanticProcess.SerialBusinessTask

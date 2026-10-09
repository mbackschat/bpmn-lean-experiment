import BpmnSemantics.SemanticProcess.ParallelScopeStructuralPublicationProofs

/-! PMIS body arming uses the ordinary publication insertion laws. Actual prefix
certificates supply owner identity and next-counter freshness; successful scoped
input evaluation supplies the Service snapshot rather than a projection premise. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart

private theorem guard_tail {α : Type} (guard : Bool) (tail : Option α) (value : α)
    (successful : (if guard then none else tail) = some value) : tail = some value := by
  cases guard <;> simp_all

/-- Successful scoped Service evaluation checks the same canonical argument shape as ordinary Service evaluation. -/
theorem evaluateParallelScopeInputs_snapshot (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (mappings : List VariableMapping) (bindings : List VariableBinding)
    (evaluated : evaluateParallelScopeInputs? program state owner mappings = some bindings) :
    inputSnapshotMatches mappings bindings = true := by
  unfold evaluateParallelScopeInputs? at evaluated
  split at evaluated <;> try contradiction
  obtain ⟨binding, _, evaluated⟩ := Option.bind_eq_some_iff.mp evaluated
  split at evaluated <;> try contradiction
  exact evaluateInputMappings_snapshot _ mappings bindings evaluated

private theorem native_effect_inputs_snapshot (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (mappings : List VariableMapping) (bindings : List VariableBinding)
    (evaluated : (if hasParallelScopeDefinition program owner then
      evaluateParallelScopeInputs? program state owner mappings
      else evaluateEffectInputs? program state owner mappings) = some bindings) :
    inputSnapshotMatches mappings bindings = true := by
  split at evaluated
  · exact evaluateParallelScopeInputs_snapshot program state owner mappings bindings evaluated
  · exact evaluateEffectInputs_snapshot program state owner mappings bindings evaluated

/-- Native Human arming needs only its exact resolved declaration, live identity and prior wait correspondence. -/
theorem parallelScope_activateHuman_wait_program_validity
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (before : RuntimeState) (candidate : InternalOperationOccurrence)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId) (task : UserTaskDefinition)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some (.awaitUserTask id origin input output task))
    (named : !candidate.owner.processInstanceId.value.isEmpty = true)
    (valid : flowNodeOccurrenceWaitProgramValidity program before = true) :
    flowNodeOccurrenceWaitProgramValidity program
      (activateUserTask before candidate.owner.processInstanceId candidate.owner input output task) = true := by
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  have member := (resolveInternalOperationOccurrence_declaration program before candidate _ resolved).1
  have unique := analyzeProgram_human_uniqueFamilyDeclarer program analysis admitted id origin input output task member
  have declarers : userTaskWaitDeclarers program task.id = [.awaitUserTask id origin input output task] :=
    by simpa only [uniqueFamilyDeclarer?, decide_eq_true_eq] using unique
  have selected := resolved_exactProgramSelection program before candidate _ wellFormed resolved
  have declared := declaredByExactlyOneOwnedOperation_of_exactSelection program _ candidate.owner _ declarers selected
  have live := resolved_exactLiveOccurrence program before candidate _ resolved
  have element := programWellFormed_internalArm_element_nonempty program _ wellFormed member
  let wait : UserTaskWait := {
    processInstanceId := candidate.owner.processInstanceId
    owner := candidate.owner
    task := task
    activation := activationCount before task.id + 1
    output := output
    metadata := task.metadata }
  exact flowNodeOccurrenceWaitProgramValidity_insertOrdinaryUserTask program before id origin input wait valid
    declarers declared (by simpa [flowNodeOccurrenceOwnerLiveUnique, exactLiveOccurrence] using live) named
    (by simpa [wait] using element)
    (by simp [wait]) rfl rfl

/-- Native Service arming preserves its exact Effect-local bijection from reservation freshness and an evaluated snapshot. -/
theorem parallelScope_activateEffect_wait_program_validity
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (before : RuntimeState) (candidate : InternalOperationOccurrence)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute) (arguments : List VariableBinding)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some (.awaitEffect id origin input output effect route))
    (named : !candidate.owner.processInstanceId.value.isEmpty = true)
    (valid : flowNodeOccurrenceWaitProgramValidity program before = true)
    (reservationValid : occurrenceReservationStateValid before = true)
    (fresh : openWaitAnchorAbsent before
      ⟨candidate.owner.processInstanceId, ⟨effect.elementId.value⟩, effectActivationCount before effect.elementId + 1⟩ = true)
    (snapshot : inputSnapshotMatches effect.inputMappings arguments = true) :
    flowNodeOccurrenceWaitProgramValidity program
      (activateEffect before candidate.owner.processInstanceId candidate.owner input output effect route arguments) = true := by
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  have member := (resolveInternalOperationOccurrence_declaration program before candidate _ resolved).1
  have unique := analyzeProgram_effect_uniqueFamilyDeclarer program analysis admitted id origin input output effect route member
  have declarers : effectWaitDeclarers program effect.elementId = [.awaitEffect id origin input output effect route] :=
    by simpa only [uniqueFamilyDeclarer?, decide_eq_true_eq] using unique
  have selected := resolved_exactProgramSelection program before candidate _ wellFormed resolved
  have declared := declaredByExactlyOneOwnedOperation_of_exactSelection program _ candidate.owner _ declarers selected
  have live := resolved_exactLiveOccurrence program before candidate _ resolved
  have element := programWellFormed_internalArm_element_nonempty program _ wellFormed member
  have aligned := programWellFormed_awaitEffect_elements_align program wellFormed id origin input output effect route member
  let wait : EffectWait := {
    processInstanceId := candidate.owner.processInstanceId
    owner := candidate.owner
    elementId := effect.elementId
    activation := effectActivationCount before effect.elementId + 1
    descriptor := effect.descriptor
    arguments := arguments
    outputMappings := effect.outputMappings
    output := output
    bpmnErrorRoute := route }
  have missing : effectWaitOccurrence wait ∉ openWaitAnchors before := by
    simpa [openWaitAnchorAbsent, List.contains_eq_mem, wait, effectWaitOccurrence] using fresh
  have freshWaits : ∀ old ∈ before.effectWaits, effectWaitOccurrenceId wait ≠ effectWaitOccurrenceId old := by
    intro old member same
    apply missing
    simp only [openWaitAnchors, List.mem_append, List.mem_map, or_assoc]
    exact Or.inr (Or.inr (Or.inr (Or.inl ⟨old, member, by
      simpa [effectWaitOccurrence, effectWaitOccurrenceId] using same.symm⟩)))
  have freshIncidents : ∀ incident ∈ before.effectIncidents,
      effectWaitOccurrenceId wait ≠ effectWaitOccurrenceId incident.wait := by
    intro incident member same
    apply missing
    simp only [openWaitAnchors, List.mem_append, List.mem_map, or_assoc]
    exact Or.inr (Or.inr (Or.inr (Or.inr ⟨incident, member, by
      simpa [effectWaitOccurrence, effectWaitOccurrenceId] using same.symm⟩)))
  have available := effect_write_available_above_counter before wait arguments reservationValid (by dsimp [wait]; omega)
  have freshActivities : ∀ activity ∈ before.variables.activities,
      activityScopeMatches (effectWaitOccurrenceId wait) activity = false := by
    have rejectedAll : before.variables.activities.all (fun activity =>
        !activityScopeMatches (effectWaitOccurrence wait) activity) = true := by
      simpa [InternalArmingWrite.available, List.not_any_eq_all_not] using available
    intro activity member
    have rejected := List.all_eq_true.mp rejectedAll activity member
    simpa [effectWaitOccurrenceId, effectWaitOccurrence] using rejected
  exact flowNodeOccurrenceWaitProgramValidity_insertOrdinaryEffect program before id origin input effect route wait arguments
    valid declarers declared (by simpa [flowNodeOccurrenceOwnerLiveUnique, exactLiveOccurrence] using live) named
    (by simpa [wait] using element)
    (by simp [wait]) rfl aligned rfl rfl snapshot rfl rfl rfl
    (fun candidateId candidateOrigin candidateInput candidateOutput candidateEffect candidateRoute member =>
      programWellFormed_awaitEffect_elements_align program wellFormed candidateId candidateOrigin candidateInput
        candidateOutput candidateEffect candidateRoute member)
    freshWaits freshIncidents freshActivities

/-- Actual ordinary PMIS body execution preserves complete wait Program correspondence. -/
theorem ParallelScopeInternalPrefixReachable.body_wait_program_validity
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (before after : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program before)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (valid : flowNodeOccurrenceWaitProgramValidity program before = true)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    flowNodeOccurrenceWaitProgramValidity program after = true := by
  have member := (resolveInternalOperationOccurrence_declaration program before candidate operation resolved).1
  have active : ∃ instanceId, before.control = .running instanceId := by
    cases control : before.control with
    | running instanceId => exact ⟨instanceId, rfl⟩
    | _ => simp [applyInternalOperationOccurrence?, control] at applied
  obtain ⟨instanceId, running⟩ := active
  have structural := reachable.structural_program_valid program analysis admitted before instanceId running
  have live := resolved_exactLiveOccurrence program before candidate operation resolved
  have named := flowNodeOccurrenceStructuralProgramValidity_live_owner_nonempty program before candidate.owner structural live
  cases operation <;> simp [SemanticOperation.kind] at body
  all_goals simp only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some] at applied
  case awaitUserTask id origin input output task =>
    have applied := guard_tail _ _ after applied
    cases parallel : hasParallelScopeDefinition program candidate.owner with
    | false =>
        simp only [parallel] at applied
        cases Option.some.inj applied
        exact parallelScope_activateHuman_wait_program_validity program analysis admitted before candidate id origin input output
          task resolved named valid
    | true =>
        simp only [parallel, ↓reduceIte] at applied
        obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
        cases Option.some.inj applied
        exact parallelScope_activateHuman_wait_program_validity program analysis admitted before candidate id origin input output
          task resolved named valid
  case awaitEffect id origin input output effect route =>
    split at applied <;> try contradiction
    rename_i guard
    have unit : (before.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1 := by
      by_cases unitEq : (before.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1
      · exact unitEq
      · simp [unitEq] at guard
    obtain ⟨hosting, _, _, _, _, _, _, declarations, _⟩ := reachable_reservation_frame program analysis admitted
      before reachable instanceId running candidate (.awaitEffect id origin input output effect route) resolved input unit (fun _ => false)
    have reservationValid := reachable.reservation_valid program analysis admitted before
    have fresh := openWaitAnchorAbsent_effect_next program analysis before instanceId candidate.owner id origin input output
      effect route admitted reservationValid declarations hosting member
    cases parallel : hasParallelScopeDefinition program candidate.owner <;>
      simp only [parallel, ↓reduceIte] at applied
    all_goals
      obtain ⟨arguments, evaluated, applied⟩ := Option.bind_eq_some_iff.mp applied
      have snapshot := native_effect_inputs_snapshot program before candidate.owner effect.inputMappings arguments
        (by simpa only [parallel, Bool.false_eq_true, ↓reduceIte] using evaluated)
      cases Option.some.inj applied
      exact parallelScope_activateEffect_wait_program_validity program analysis admitted before candidate id origin input output
        effect route arguments resolved named valid reservationValid fresh snapshot
  all_goals
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact valid

private theorem reservedArm_wait_program_validity
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (before after : RuntimeState) (arm : InternalArmingPatch)
    (step : InternalOccurrencePatchStep program before after (.arm arm))
    (reservationValid : occurrenceReservationStateValid before = true)
    (valid : flowNodeOccurrenceWaitProgramValidity program before = true) :
    flowNodeOccurrenceWaitProgramValidity program after = true := by
  have prepared := step.2.2.2
  have next := InternalOccurrencePatchStep.arm_activation program before after arm step
  generalize allocated : arm.write.occurrence.activation = activation at prepared next
  obtain ⟨runtimeId, operation, input, running, hosting, _, resolved, inputEq, _, _,
    declaration, patchInput, _, shape, absent, _⟩ :=
    ParallelScopeReplay.prepareReservedOccurrenceArm_gate_provenance program before
      ⟨arm.operation.id, arm.owner⟩ activation arm prepared
  have named : !arm.owner.processInstanceId.value.isEmpty = true := by
    have initial := prepared
    simp only [prepareReservedOccurrenceArm?, running, bind] at initial
    obtain ⟨guard, _⟩ := ParallelScopeReplay.reserved_guard_success _ _ _ initial
    change arm.owner.processInstanceId = runtimeId at hosting
    rw [hosting]
    cases empty : runtimeId.value.isEmpty with
    | false => simp
    | true => simp [empty] at guard
  rw [declaration] at next
  rw [← hosting] at shape
  cases operation <;> simp only [ParallelScopeReplay.ReservedArmWriteShape] at shape <;> try contradiction
  case awaitUserTask id origin declaredInput output task =>
    simp only [internalArmInput?, Option.some.injEq] at inputEq
    rw [← inputEq] at patchInput
    have native := parallelScope_activateHuman_wait_program_validity program analysis admitted before
      ⟨arm.operation.id, arm.owner⟩ id origin declaredInput output task resolved named valid
    rw [step.1]
    simpa only [InternalOccurrencePatch.apply, applyInternalArmingPatch, patchInput, shape, next,
      activateUserTask] using native
  case awaitEffect id origin declaredInput output effect route =>
    simp only [internalArmInput?, Option.some.injEq] at inputEq
    rw [← inputEq] at patchInput
    obtain ⟨arguments, evaluated, write⟩ := shape
    have snapshot := native_effect_inputs_snapshot program before arm.owner effect.inputMappings arguments evaluated
    have fresh : openWaitAnchorAbsent before
        ⟨arm.owner.processInstanceId, ⟨effect.elementId.value⟩, effectActivationCount before effect.elementId + 1⟩ = true := by
      simpa only [write, InternalArmingWrite.occurrence, effectWaitOccurrence, next] using absent
    have native := parallelScope_activateEffect_wait_program_validity program analysis admitted before
      ⟨arm.operation.id, arm.owner⟩ id origin declaredInput output effect route arguments resolved named valid
      reservationValid fresh snapshot
    rw [step.1]
    simpa only [InternalOccurrencePatch.apply, applyInternalArmingPatch, patchInput, write, next,
      activateEffect, addActivityVariableScope, effectWaitOccurrence] using native

private theorem preparedBatch_raw_wait_program_validity
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (before : RuntimeState) (batch : InternalOccurrenceBatch)
    (prepared : prepareInternalOccurrenceBatch? program before = some batch)
    (absent : before.compensationHandlerEffectWaits = [])
    (valid : flowNodeOccurrenceWaitProgramValidity program before = true)
    (prior rest : List InternalOccurrencePatch) (splitBatch : batch.members = prior ++ rest) :
    flowNodeOccurrenceWaitProgramValidity program
      (prior.foldl (fun current patch => patch.apply current) before) = true := by
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  have reversedValid (reversed : List InternalOccurrencePatch) : ∀ rest,
      batch.members = reversed.reverse ++ rest →
      flowNodeOccurrenceWaitProgramValidity program
        (reversed.reverse.foldl (fun current patch => patch.apply current) before) = true := by
    induction reversed with
    | nil => intro _ _; exact valid
    | cons patch reversed ih =>
        intro rest splitBatch
        simp only [List.reverse_cons] at splitBatch ⊢
        have splitHead : batch.members = reversed.reverse ++ patch :: rest := by
          simpa only [List.append_assoc, List.singleton_append] using splitBatch
        have priorValid := ih (patch :: rest) splitHead
        simp only [List.foldl_append, List.foldl_cons, List.foldl_nil]
        cases patch with
        | token patch => exact priorValid
        | arm arm =>
            have step := preparedOccurrenceBatch_prefix_step program before batch prepared wellFormed absent
              reversed.reverse rest (.arm arm) splitHead
            have reservationValid := preparedOccurrenceBatch_prefix_reservation_valid program before batch prepared
              wellFormed absent reversed.reverse (.arm arm :: rest) splitHead
            exact reservedArm_wait_program_validity program analysis admitted _ _ arm step reservationValid priorValid
  simpa only [List.reverse_reverse] using reversedValid prior.reverse rest
    (by simpa only [List.reverse_reverse] using splitBatch)

private theorem reservedPrefix_wait_program_validity
    (program : Program) (before : RuntimeState) (members : List InternalOccurrencePatch)
    (prefixValid : ∀ prior rest, members = prior ++ rest →
      flowNodeOccurrenceWaitProgramValidity program
        (prior.foldl (fun current patch => patch.apply current) before) = true)
    (successors : List RuntimeState)
    (applied : applyReservedOccurrencePrefix? program before members = some successors) :
    ∀ successor ∈ successors, flowNodeOccurrenceWaitProgramValidity program successor = true := by
  have walk (rest : List InternalOccurrencePatch) : ∀ prior current successors,
      members = prior ++ rest → current = prior.foldl (fun state patch => patch.apply state) before →
      applyReservedOccurrencePrefix? program current rest = some successors →
      ∀ successor ∈ successors, flowNodeOccurrenceWaitProgramValidity program successor = true := by
    induction rest with
    | nil =>
        intro _ _ successors _ _ applied
        simp only [applyReservedOccurrencePrefix?, Option.some.injEq] at applied
        subst successors
        simp
    | cons patch rest ih =>
        intro prior current successors splitMembers currentEq applied
        simp only [applyReservedOccurrencePrefix?] at applied
        split at applied <;> try contradiction
        obtain ⟨tail, followed, applied⟩ := Option.bind_eq_some_iff.mp applied
        cases Option.some.inj applied
        have splitNext : members = (prior ++ [patch]) ++ rest := by
          simpa only [List.append_assoc, List.singleton_append] using splitMembers
        have nextEq : patch.apply current =
            (prior ++ [patch]).foldl (fun state patch => patch.apply state) before := by
          simp only [List.foldl_append, List.foldl_cons, List.foldl_nil, currentEq]
        have later := ih (prior ++ [patch]) (patch.apply current) tail splitNext nextEq followed
        intro successor present
        rcases List.mem_cons.mp present with rfl | present
        · rw [nextEq]
          exact prefixValid (prior ++ [patch]) rest splitNext
        · exact later successor present
  exact walk members [] before successors (by simp) rfl applied

/-- Every actual prepared-batch successor retains complete wait Program correspondence. -/
theorem ParallelScopeInternalPrefixReachable.batch_wait_program_validity
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (before : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program before)
    (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (valid : flowNodeOccurrenceWaitProgramValidity program before = true)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors) :
    ∀ successor ∈ successors, flowNodeOccurrenceWaitProgramValidity program successor = true := by
  obtain ⟨_, absent, _⟩ := reachable.start_certificate program analysis admitted before
  unfold applyInternalOccurrenceBatch? at applied
  split at applied <;> try contradiction
  rename_i accepted
  have prepared : prepareInternalOccurrenceBatch? program before = some batch := by
    simp only [Bool.or_eq_true, bne_iff_ne, not_or, Classical.not_not] at accepted
    exact accepted.2
  exact reservedPrefix_wait_program_validity program before batch.members
    (fun prior rest splitBatch => preparedBatch_raw_wait_program_validity program analysis admitted before
      batch prepared absent valid prior rest splitBatch) successors applied

end BpmnSemantics.SemanticProcess

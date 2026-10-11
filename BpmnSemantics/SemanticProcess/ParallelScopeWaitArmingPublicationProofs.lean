import BpmnSemantics.SemanticProcess.ParallelScopeStructuralPublicationProofs
import BpmnSemantics.SemanticProcess.ParallelScopeWaitPublicationProofs
import BpmnSemantics.SemanticProcess.ParallelScopeExcludedWaitProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReachableInvariantTransport
import BpmnSemantics.SemanticProcess.ParallelScopeActualStepEvidence

/-! PMIS native and reserved arming use the ordinary publication insertion laws.
Actual command and prefix history establish full Program correspondence at Running
states. Scoped input evaluation supplies the Service snapshot, and atomic refusal
retains the predecessor; no successful projection or publication is assumed. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

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

/-- Every actual prepared-batch successor retains complete wait Program correspondence. -/
theorem ParallelScopeInternalPrefixReachable.batch_wait_program_validity
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (before : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program before)
    (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (valid : flowNodeOccurrenceWaitProgramValidity program before = true)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors) :
    ∀ successor ∈ successors, flowNodeOccurrenceWaitProgramValidity program successor = true := by
  obtain ⟨_, absent, _⟩ := reachable.start_certificate program analysis admitted before
  have reservation := reachable.reservation_valid program analysis admitted before
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  have transported := applyInternalOccurrenceBatch_patch_induction program before batch successors
    (fun state => flowNodeOccurrenceWaitProgramValidity program state = true ∧
      occurrenceReservationStateValid state = true ∧ state.compensationHandlerEffectWaits = [])
    ⟨valid, reservation, absent⟩ (by
      intro state after patch _ actual prior
      refine ⟨?_, reserved_patch_step_reservation_valid program state after patch wellFormed actual prior.2.1 prior.2.2, ?_⟩
      · cases patch with
        | token token => rw [actual.1]; exact prior.1
        | arm arm => exact reservedArm_wait_program_validity program analysis admitted state after arm actual prior.2.1 prior.1
      · rw [actual.1, reserved_patch_compensation_waits]; exact prior.2.2) applied
  intro successor member
  exact (transported successor member).1

private def WaitPublicationInvariant (program : Program) (state : RuntimeState) : Prop :=
  (state.messageWaits = [] ∧ state.timerWaits = [] ∧ state.effectIncidents = []) ∧
    (state.selectedBranchSets = [] ∧ state.eventRaces = []) ∧
    ∀ instanceId, state.control = .running instanceId →
      flowNodeOccurrenceWaitProgramValidity program state = true

private theorem issued_choice_frame (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (items : List String) (index : Nat) (before after : RuntimeState)
    (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations)) :
    after.selectedBranchSets = before.selectedBranchSets ∧ after.eventRaces = before.eventRaces := by
  induction items generalizing before index iterations with
  | nil => cases Option.some.inj issued; exact ⟨rfl, rfl⟩
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨_, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      have frame := ih _ _ _ generated
      exact frame

private theorem entry_choice_frame (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (entered : enterParallelScope? entry before parent = some after) :
    after.selectedBranchSets = before.selectedBranchSets ∧ after.eventRaces = before.eventRaces := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered; exact ⟨rfl, rfl⟩
  · obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => contradiction
    | cons first rest =>
        cases Option.some.inj entered
        have frame := issued_choice_frame entry parent _ 0 _ issued (first :: rest) generated
        exact frame

private theorem cancel_bodies_choices_empty (iterations : List ParallelScopeIteration) (before : RuntimeState)
    (prior : before.selectedBranchSets = [] ∧ before.eventRaces = []) :
    let after := iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) before
    after.selectedBranchSets = [] ∧ after.eventRaces = [] := by
  induction iterations generalizing before with
  | nil => exact prior
  | cons first rest ih =>
      apply ih
      simp [cancelScopeSubtree, prior.1, prior.2]

private theorem retirement_choices_empty (entry : ParallelScopeEntry) (target : ScopeOccurrenceId)
    (before after : RuntimeState) (prior : before.selectedBranchSets = [] ∧ before.eventRaces = [])
    (completed : completeParallelScope? entry before target = some after) :
    after.selectedBranchSets = [] ∧ after.eventRaces = [] := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  rcases retirement with ⟨_, _, _, _⟩ | ⟨_, _⟩ | ⟨_, _, first, rest⟩ <;>
    cases Option.some.inj completed
  · simp [cancelScopeSubtree, prior.1, prior.2]
  · simp [cancelScopeSubtree, prior.1, prior.2]
  · apply cancel_bodies_choices_empty (first :: rest)
    simp [cancelScopeSubtree, prior.1, prior.2]

private theorem completeTask_choice_frame (program : Program) (before after : RuntimeState)
    (id : UserTaskInstanceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeTask? program before id values = some after) :
    after.selectedBranchSets = before.selectedBranchSets ∧ after.eventRaces = before.eventRaces := by
  unfold ParallelScopeCommand.completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact ⟨rfl, rfl⟩
  · obtain ⟨_, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact ⟨rfl, rfl⟩

private theorem completeEffect_choice_frame (program : Program) (before after : RuntimeState)
    (id : EffectOccurrenceId) (values : List VariableBinding)
    (completed : ParallelScopeCommand.completeEffect? program before id (.success values) = some after) :
    after.selectedBranchSets = before.selectedBranchSets ∧ after.eventRaces = before.eventRaces := by
  unfold ParallelScopeCommand.completeEffect? at completed
  split at completed <;> try contradiction
  rename_i candidates wait selected
  split at completed
  · simp only [completeParallelScopeEffect?, selected] at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact ⟨rfl, rfl⟩
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨_, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact ⟨rfl, rfl⟩

private theorem singleton_publication_invariant (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (before after : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program before)
    (candidate : InternalOperationOccurrence) (prior : WaitPublicationInvariant program before)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    WaitPublicationInvariant program after := by
  have excluded := applyInternalOperationOccurrence_parallelScope_excluded_waits program analysis admitted
    before after candidate prior.1 applied
  obtain ⟨instanceId, operation, running, resolved, _, classified⟩ :=
    parallelScope_singleton_execution_cases program analysis admitted profile before after candidate applied
  have valid := prior.2.2 instanceId running
  cases classified with
  | body body =>
    have choices : after.selectedBranchSets = [] ∧ after.eventRaces = [] := by
      rcases applyInternalOperationOccurrence_body_effect program before after candidate operation resolved body applied with
        ⟨patch, _, _, updated⟩ | ⟨patch, _, _, updated⟩
      · rw [updated]
        cases write : patch.write <;> simp only [applyInternalArmingPatch, write] <;> exact prior.2.1
      · rw [updated]; exact prior.2.1
    exact ⟨excluded, choices, fun _ _ => reachable.body_wait_program_validity program analysis admitted
      before after candidate operation resolved body valid applied⟩
  | initiation _ _ _ _ initiated =>
    unfold initiateState? at initiated
    obtain ⟨_, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
    split at initiated <;> try contradiction
    cases Option.some.inj initiated
    exact ⟨excluded, prior.2.1, fun _ _ => valid⟩
  | entry _ entered =>
    have choices := entry_choice_frame analysis.entry candidate.owner before after entered
    exact ⟨excluded, ⟨choices.1.trans prior.2.1.1, choices.2.trans prior.2.1.2⟩, fun _ _ =>
      enterParallelScope_wait_program_validity program analysis.entry candidate.owner before after
        (reachable.scope_identities_unique program analysis admitted before instanceId running) valid
        prior.1.1 prior.1.2.1 prior.1.2.2 entered⟩
  | retirement _ completed =>
    exact ⟨excluded, retirement_choices_empty analysis.entry candidate.owner before after prior.2.1 completed, fun _ _ =>
      ParallelScopeCommand.completeParallelScope_wait_program_validity program analysis.entry candidate.owner before after
        valid prior.1.1 prior.1.2.1 prior.1.2.2 completed⟩
  | rootCompletion scopeId output _ _ completion completed =>
    obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis admitted scopeId
    rw [completeSelectedScope?, unmonitored,
      completeBoundedScope_eq_completeScope_of_unbounded program before scopeId output unbounded] at completion
    have choices : after.selectedBranchSets = [] ∧ after.eventRaces = [] := by
      unfold completeScopeState? at completion
      split at completion <;> try contradiction
      split at completion <;> try contradiction
      unfold completeQuiescentScope? at completion
      all_goals repeat' split at completion
      all_goals first | contradiction | (cases Option.some.inj completion; exact prior.2.1)
    exact ⟨excluded, choices, by intro _ active; rw [completed] at active; contradiction⟩

private theorem batch_publication_invariant (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis)
    (before after : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program before)
    (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (prior : WaitPublicationInvariant program before)
    (applied : applyInternalOccurrenceBatch? program before batch = some successors)
    (endpoint : successors.getLast? = some after) : WaitPublicationInvariant program after := by
  have member := List.mem_of_getLast? endpoint
  have excluded := applyInternalOccurrenceBatch_excluded_waits program before batch successors prior.1 applied after member
  have choices := applyInternalOccurrenceBatch_prefix_induction program before batch successors
    (fun state => state.control = before.control ∧ state.selectedBranchSets = [] ∧ state.eventRaces = [])
    ⟨rfl, prior.2.1⟩ (by
      intro state patch _ _ retained
      cases patch with
      | token patch => exact retained
      | arm arm =>
          simp only [InternalOccurrencePatch.apply]
          cases write : arm.write <;> simp only [applyInternalArmingPatch, write] <;> exact retained) applied after member
  refine ⟨excluded, choices.2, ?_⟩
  intro instanceId running
  exact reachable.batch_wait_program_validity program analysis admitted before batch successors
    (prior.2.2 instanceId (choices.1.symm.trans running)) applied after member

private theorem admission_publication_invariant (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (selected : programSelected program = true)
    (before : RuntimeState) (boundary : ParallelScopeCommandBoundaryReachable program before)
    (stimulus : Stimulus) (prior : WaitPublicationInvariant program before)
    (committed : (admitStimulus program before stimulus).outcome = .committed) :
    WaitPublicationInvariant program (admitStimulus program before stimulus).state := by
  rcases parallelScope_committed_ingress_kind program selected before stimulus committed with
    ⟨commandId, processId, instanceId, values, rfl, _⟩ | completion
  · obtain ⟨rfl, started, _⟩ := boundary.committed_start_from_initial program analysis admitted selected
      before commandId processId instanceId values committed
    unfold runningProgramStartState? at started
    obtain ⟨_, _, started⟩ := Option.bind_eq_some_iff.mp started
    rw [← Option.some.inj started]
    refine ⟨⟨rfl, rfl, rfl⟩, ⟨rfl, rfl⟩, ?_⟩
    intro _ _
    rfl
  · apply admitStimulus_wait_preserves program before stimulus selected completion
      (WaitPublicationInvariant program) prior
    · intro id values after completed
      have choices := completeTask_choice_frame program before after id values completed
      refine ⟨ParallelScopeCommand.completeTask_excluded_waits program before after id values prior.1 completed,
        ⟨choices.1.trans prior.2.1.1, choices.2.trans prior.2.1.2⟩, ?_⟩
      intro instanceId running
      have control := ParallelScopeCommand.completeTask_control_frame program before after id values completed
      exact ParallelScopeCommand.completeTask_wait_program_validity program before after id values
        (prior.2.2 instanceId (control.symm.trans running)) prior.1.1 prior.1.2.1 completed
    · intro id values after completed
      have choices := completeEffect_choice_frame program before after id values completed
      refine ⟨ParallelScopeCommand.completeEffect_success_excluded_waits program before after id values prior.1 completed,
        ⟨choices.1.trans prior.2.1.1, choices.2.trans prior.2.1.2⟩, ?_⟩
      intro instanceId running
      have control := ParallelScopeCommand.completeEffect_success_control_frame program before after id values completed
      exact ParallelScopeCommand.completeEffect_success_wait_program_validity program before after id values
        (prior.2.2 instanceId (control.symm.trans running)) prior.1.1 prior.1.2.1 prior.1.2.2 completed

private theorem boundary_publication_invariant (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (selected : programSelected program = true)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (state : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program state) :
    WaitPublicationInvariant program state := by
  exact reachable.invariant_transport program profile (WaitPublicationInvariant program)
    ⟨⟨rfl, rfl, rfl⟩, ⟨rfl, rfl⟩, by intro _ running; simp [initialState] at running⟩
    (fun before boundary stimulus prior committed =>
      admission_publication_invariant program analysis admitted selected before boundary stimulus prior committed)
    (fun before after preceding candidate prior applied =>
      singleton_publication_invariant program analysis admitted profile before after preceding candidate prior applied)
    (fun before after preceding batch successors prior applied endpoint =>
      batch_publication_invariant program analysis admitted before after preceding batch successors prior applied endpoint) state

private theorem prefix_publication_invariant
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state) :
    WaitPublicationInvariant program state := by
  have selected : programSelected program = true := by
    cases choice : programSelected program with
    | false => simp [analyzeProgram, choice] at admitted
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [programSelected, beq_iff_eq] using selected
  exact reachable.invariant_transport program profile (WaitPublicationInvariant program)
    ⟨⟨rfl, rfl, rfl⟩, ⟨rfl, rfl⟩, by intro _ running; simp [initialState] at running⟩
    (fun before boundary stimulus prior committed =>
      admission_publication_invariant program analysis admitted selected before boundary stimulus prior committed)
    (fun before after preceding candidate prior applied =>
      singleton_publication_invariant program analysis admitted profile before after preceding candidate prior applied)
    (fun before after preceding batch successors prior applied endpoint =>
      batch_publication_invariant program analysis admitted before after preceding batch successors prior applied endpoint) state

/-- Start and actual command history establish full correspondence for Running prefixes; structural provenance alone cannot admit foreign waits. -/
theorem ParallelScopeInternalPrefixReachable.program_valid
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId) :
    flowNodeOccurrenceProgramValidity program state = true := by
  have invariant := prefix_publication_invariant program analysis admitted state reachable
  simp only [flowNodeOccurrenceProgramValidity, invariant.2.1.1, invariant.2.1.2, List.all_nil,
    Bool.and_true, Bool.and_eq_true]
  exact ⟨reachable.structural_program_valid program analysis admitted state instanceId running,
    invariant.2.2 instanceId running⟩

/-- Actual Running command boundaries inherit correspondence even after unchanged rejection or atomic rollback. -/
theorem ParallelScopeCommandBoundaryReachable.program_valid
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId) :
    flowNodeOccurrenceProgramValidity program state = true := by
  have selected : programSelected program = true := by
    cases choice : programSelected program with
    | false => simp [analyzeProgram, choice] at admitted
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [programSelected, beq_iff_eq] using selected
  have invariant := boundary_publication_invariant program analysis admitted selected profile state reachable
  simp only [flowNodeOccurrenceProgramValidity, invariant.2.1.1, invariant.2.1.2, List.all_nil,
    Bool.and_true, Bool.and_eq_true]
  have structural : flowNodeOccurrenceStructuralProgramValidity program state = true := by
    rcases reachable.initial_or_prefix program profile state with initial | preceding
    · subst state; simp [initialState] at running
    · exact preceding.structural_program_valid program analysis admitted state instanceId running
  exact ⟨structural, invariant.2.2 instanceId running⟩

theorem prefix_scope_projection_census
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId) :
    ∃ parent, parent.processInstanceId = instanceId ∧ ParallelScopeStructuralFrame parent state ∧
      ∀ scope ∈ state.scopeOccurrences, scope = ⟨parent, none⟩ ∨
        scope.parent = some parent ∧ scope.id.processInstanceId = instanceId := by
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis admitted state
  let observer : ScopeOccurrenceId := ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩
  rcases phases observer rfl with ready | ⟨_, _, _, _, _, _, _, phase⟩
  · have raw := seed.started
    simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at raw
    change _ = seed.ready at raw
    have identity : seed.instanceId = instanceId := by
      rw [ready, ← raw] at running
      exact ProcessControl.running.inj running
    refine ⟨seed.parent, identity, ?_, ?_⟩
    · rw [ready]
      exact runningProgramStartState_structural_parallel_frame program seed.instanceId seed.values seed.ready
        seed.root seed.rootSelected seed.started
    · intro scope member
      rw [ready, ← raw] at member
      exact Or.inl (by simpa only [ParallelScopeAcceptedStart.parent, List.mem_singleton] using member)
  have identity : seed.parent.processInstanceId = instanceId :=
    (phase.running_instance program analysis admitted observer seed.parent _ state _ instanceId running).symm
  refine ⟨seed.parent, identity, ?_⟩
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, _, _, suffix, _, parents, _, _, _, entered, following⟩
  · refine ⟨parents.structural_frame program analysis.entry seed.parent state, ?_⟩
    intro scope member
    exact Or.inl (by simpa [(parents.clean_and_foreign_marking program analysis.entry seed.parent state).1.1] using member)
  rcases following with history | ⟨_, _, _, _, _, _, _, ⟨_, completed⟩, _⟩
  · have clean := (parents.clean_and_foreign_marking program analysis.entry seed.parent before).1
    have issuedFrame := enterParallelScope_structural_parallel_frame analysis.entry seed.parent before issued clean
      (parents.structural_frame program analysis.entry seed.parent before) entered
    refine ⟨history.structural_frame program observer seed.parent selected issued state suffix issuedFrame, ?_⟩
    intro scope member
    have retained := history.scopeOccurrences_sublist program observer selected issued state suffix
    rcases parallelScope_issued_scope_provenance analysis.entry seed.parent before issued clean entered
        scope (retained.subset member) with root | ⟨parented, process, _⟩
    · exact Or.inl root
    · exact Or.inr ⟨parented, process.trans identity⟩
  · rw [running] at completed
    contradiction

/-- Actual Running prefixes derive every guard of the independent open-occurrence projector. -/
theorem ParallelScopeInternalPrefixReachable.open_projection
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId) :
    ∃ occurrences, projectOpenFlowNodeOccurrences? program state = some occurrences := by
  obtain ⟨parent, parentIdentity, frame, census⟩ :=
    prefix_scope_projection_census program analysis admitted state reachable instanceId running
  have scopeProcess (scope : RuntimeScopeOccurrence) (member : scope ∈ state.scopeOccurrences) :
      scope.id.processInstanceId = instanceId := by
    rcases census scope member with root | body
    · rw [root]; exact parentIdentity
    · exact body.2
  have hosting (owner : ScopeOccurrenceId) (live : flowNodeOccurrenceOwnerLiveUnique state owner = true) :
      owner.processInstanceId = instanceId := by
    obtain ⟨scope, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true live)
    have member : scope ∈ state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = owner)) := by
      rw [singleton]; simp
    obtain ⟨member, same⟩ := List.mem_filter.mp member
    simpa only [of_decide_eq_true same] using scopeProcess scope member
  have roots : state.scopeOccurrences.filter (fun scope => decide
      (scope.parent.isNone && scope.id.processInstanceId = instanceId)) = [⟨parent, none⟩] := by
    rw [← frame.root]
    apply List.filter_congr
    intro scope member
    rcases census scope member with root | ⟨parented, _⟩
    · simp [root, parentIdentity]
    · have different : scope.id ≠ parent := by
        intro same
        have own : scope ∈ state.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = parent)) :=
          List.mem_filter.mpr ⟨member, by simp [same]⟩
        rw [frame.root] at own
        have root : scope = ⟨parent, none⟩ := List.mem_singleton.mp own
        simp [root] at parented
      simp [parented, different]
  have calls : calledProcessAssociationsValid state = true := by
    have callRoots : state.scopeOccurrences.filter (fun scope =>
        decide (scope.parent = none) && decide (scope.id.processInstanceId = instanceId)) = [⟨parent, none⟩] := by
      simpa [Bool.and_eq_true, Option.isNone_iff_eq_none] using roots
    simp [calledProcessAssociationsValid, rootInstanceId?, running, callRoots, frame.noCalls,
      List.all_eq_true]
    intro scope member
    exact Or.inr (scopeProcess scope member)
  have invariant := prefix_publication_invariant program analysis admitted state reachable
  have messagePairs : messageBoundedProjectionValid program state = true := by
    apply List.all_eq_true.mpr
    intro operation member
    have allowed := (analyzeProgram_incidence_admission program analysis admitted).2.2
    have accepted := List.all_eq_true.mp allowed operation member
    cases operation <;> try rfl
    all_goals simp [programOperationAllowed, SequentialScopeProgram.operationAllowed] at accepted
  have anchors : (openWaitAnchors state).Nodup := by
    have reservation := reachable.reservation_valid program analysis admitted state
    simp only [occurrenceReservationStateValid, Bool.and_eq_true] at reservation
    exact (List.nodup_append.mp (of_decide_eq_true reservation.1.1.1.1.2)).1
  exact projectOpenFlowNodeOccurrences_hosting_total program state instanceId running
    (analyzeProgram_incidence_admission program analysis admitted).1
    (reachable.program_valid program analysis admitted state instanceId running)
    (by simp [eventRaceAssociationsValid, invariant.2.1.2]) calls messagePairs
    invariant.1.1 invariant.1.2.1 invariant.1.2.2 frame.noCalls hosting
    (by simpa [List.Nodup, List.pairwise_append, List.pairwise_map,
      openWaitAnchors, userTaskWaitOccurrence, effectWaitOccurrence,
      invariant.1.1, invariant.1.2.1, invariant.1.2.2] using anchors)
    (reachable.scope_identities_unique program analysis admitted state instanceId running)

/-- Actual command boundaries inherit total Running projection through committed execution or unchanged refusal. -/
theorem ParallelScopeCommandBoundaryReachable.open_projection
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId) :
    ∃ occurrences, projectOpenFlowNodeOccurrences? program state = some occurrences := by
  have selected : programSelected program = true := by
    cases choice : programSelected program with
    | false => simp [analyzeProgram, choice] at admitted
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [programSelected, beq_iff_eq] using selected
  rcases reachable.initial_or_prefix program profile state with initial | preceding
  · subst state; simp [initialState] at running
  · exact preceding.open_projection program analysis admitted state instanceId running

end BpmnSemantics.SemanticProcess

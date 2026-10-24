module

public import BpmnSemantics.SemanticProcess.ParallelScopeLiveBindingProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeReservationSelectionProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeInstanceIdentityProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeReservationHeadroomProofs

/-! # Reachable wait reservation

PMIS-SELECT-01 rechecks identity, declaration provenance and fresh write ownership
in addition to native transition enabledness. Actual command-prefix certificates
supply those checks before the scheduler constructs its reserved patch.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay

theorem reachable_reservation_frame (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (input : ControlPlaceId)
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1)
    (query : ActivityOccurrenceId → Bool) :
    candidate.owner.processInstanceId = instanceId ∧ instanceId.value.isEmpty = false ∧
    candidate.owner.definitionScopeId.value.isEmpty = false ∧ 0 < candidate.owner.activation ∧
    SemanticProcessJson.isSafeWireNat candidate.owner.activation = true ∧
    SemanticProcessJson.isSafeWireNat state.logicalTimeMs = true ∧
    occurrenceOwnerRootValid program state (state.scopeOccurrences.length + 1) candidate.owner = true ∧
    waitDeclarationsValid program instanceId state = true ∧
    (state.variables.activities.any fun frame => match frame.owner with
      | .activityOccurrence id => query id | _ => false) = false := by
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis analyzed state
  rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with rfl |
    ⟨id, origin, output, initial, records, _, _, phase⟩
  · have raw := seed.started
    simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at raw
    have tokens := congrArg (fun current : RuntimeState => current.tokens) raw
    change [] = seed.ready.tokens at tokens
    rw [← tokens] at unit
    simp at unit
  · have startAccepted : ParallelScopeCommand.stimulusAdmitted program initialState
        (.startProcess seed.commandId seed.processId seed.instanceId seed.values) = true := by
      have committed := seed.committed
      cases checked : ParallelScopeCommand.stimulusAdmitted program initialState
          (.startProcess seed.commandId seed.processId seed.instanceId seed.values) with
      | false =>
          cases snapshot : program.compensationEventSubProcessSnapshots <;>
            simp [admitStimulus, snapshot, checked] at committed
      | true => rfl
    have identity := phase.reservation_instance_identity program analysis analyzed initialState
      seed.commandId seed.processId seed.instanceId seed.values startAccepted _ seed.parent rfl initial state records
      instanceId running candidate operation resolved
    have bounds := phase.reservation_owner_bounds program analysis analyzed _ seed.parent initial state records
      instanceId running candidate operation resolved
    have ancestry := phase.reservation_owner_root_valid program analysis analyzed _ seed.parent initial state records
      instanceId running candidate operation resolved
    have time := phase.logical_time program analysis analyzed _ seed.parent initial state records
    have instanceEq := phase.running_instance program analysis analyzed _ seed.parent initial state records instanceId running
    have declarations := phase.wait_declarations program analysis analyzed _ seed.parent initial state records
    have frames := phase.activity_frame_absent program analysis analyzed _ seed.parent initial state records query
    refine ⟨identity.1, identity.2, bounds.2, bounds.1.2.1, ?_, ?_, ancestry, ?_, frames⟩
    · change decide (_ ≤ (9007199254740991 : Nat)) = true
      apply decide_eq_true
      have bound := bounds.1.2.2
      omega
    · simp [time, SemanticProcessJson.isSafeWireNat, SemanticProcessJson.maxSafeWireNat]
    · simpa only [instanceEq] using declarations

private theorem parent_is_ordinary (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis) (owner : ScopeOccurrenceId)
    (parent : owner.definitionScopeId ≠ analysis.entry.childScopeId) : hasParallelScopeDefinition program owner = false := by
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ :=
    ParallelScopeStart.analyzeProgram_body_certificate program analysis analyzed
  simp [hasParallelScopeDefinition, entries, Ne.symm parent]

private theorem scope_probe (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation) :
    hasParallelScopeDefinition program candidate.owner = false ∨
      (hasParallelScopeDefinition program candidate.owner = true ∧
        hasSequentialScopeDefinition program candidate.owner = false ∧
        evaluateParallelScopeInputs? program state candidate.owner [] = some []) := by
  by_cases child : candidate.owner.definitionScopeId = analysis.entry.childScopeId
  · exact Or.inr (reachable.child_scope_probe program analysis analyzed state instanceId running candidate operation resolved child)
  · exact Or.inl (parent_is_ordinary program analysis analyzed candidate.owner child)

/-- A reachable Human Task passes reservation checks at every safe ordinal above its counter,
including repeated child bodies, without a successful-preparation premise.
-/
theorem ParallelScopeInternalPrefixReachable.human_reserved_above_counter (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (task : UserTaskDefinition)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitUserTask id origin input output task))
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1)
    (activation : Nat) (above : activationCount state task.id < activation)
    (safe : SemanticProcessJson.isSafeWireNat activation = true) :
    ∃ patch, prepareReservedOccurrenceArm? program state candidate activation = some patch := by
  let operation := SemanticOperation.awaitUserTask id origin input output task
  have declared := (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).1
  have wellFormed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis analyzed).1
  have exactSelection := resolved_exactProgramSelection program state candidate operation wellFormed resolved
  dsimp only [operation] at exactSelection
  have live := resolved_exactLiveOccurrence program state candidate operation resolved
  obtain ⟨inputOrigin, inputSelected⟩ := resolved_selectedInputOrigin program state candidate operation input wellFormed resolved rfl (by change input ∈ [input] ++ [output]; simp)
  obtain ⟨hosting, named, definition, positive, ownerSafe, timeSafe, ancestry, declarations, frames⟩ :=
    reachable_reservation_frame program analysis analyzed state reachable instanceId running candidate operation resolved input unit
      (fun actor => actor.processInstanceId == instanceId && actor.activityElementId.value == task.id.value &&
        actor.activation == activation)
  have valid := reachable.reservation_valid program analysis analyzed state
  have probe := scope_probe program analysis analyzed state reachable instanceId running candidate operation resolved
  have activationPositive : 0 < activation := by omega
  have fresh := openWaitAnchorAbsent_human_above_counter program analysis state instanceId candidate.owner id origin input output task activation
    analyzed valid declarations hosting declared above
  have allowed := List.all_eq_true.mp (ParallelScopeStart.analyzeProgram_incidence_admission program analysis analyzed).2.2 operation declared
  have source : task.id.value = origin.elementId.value := by
    simp only [operation, ParallelScopeStart.programOperationAllowed, SequentialScopeProgram.operationAllowed,
      Bool.and_eq_true, beq_iff_eq] at allowed
    exact allowed.2
  have unique := ParallelScopeStart.analyzeProgram_human_uniqueFamilyDeclarer program analysis analyzed id origin input output task declared
  rw [hosting] at fresh
  rcases probe with ordinary | ⟨ordinary, sequential, empty⟩
  all_goals simp [prepareReservedOccurrenceArm?, running, safe, Nat.ne_of_gt activationPositive, hosting, named, definition, Nat.ne_of_gt positive,
    ownerSafe, timeSafe, ancestry, resolved, internalArmInput?, internalArmOrigin?, exactSelection, live, unit,
    inputSelected, ordinary, InternalArmingWrite.elementId, InternalArmingWrite.kind,
    InternalArmingWrite.occurrence, InternalArmingWrite.available, userTaskWaitOccurrence, ← source, unique, fresh]
  all_goals try simp [sequential, empty]
  all_goals
    intro frame member
    have absent := List.any_eq_false.mp frames frame member
    cases ownerEq : frame.owner
    all_goals first | rfl | simpa [ownerEq] using absent

/-- Reachable Service data and fresh output ownership suffice at every safe ordinal above
the counter, for parent and child waits without caller-supplied evaluated arguments.
-/
theorem ParallelScopeInternalPrefixReachable.service_reserved_above_counter (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitEffect id origin input output effect route))
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1)
    (activation : Nat) (above : effectActivationCount state effect.elementId < activation)
    (safe : SemanticProcessJson.isSafeWireNat activation = true) :
    ∃ patch, prepareReservedOccurrenceArm? program state candidate activation = some patch := by
  let operation := SemanticOperation.awaitEffect id origin input output effect route
  have declared := (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).1
  have wellFormed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis analyzed).1
  have exactSelection := resolved_exactProgramSelection program state candidate operation wellFormed resolved
  dsimp only [operation] at exactSelection
  have live := resolved_exactLiveOccurrence program state candidate operation resolved
  obtain ⟨inputOrigin, inputSelected⟩ := resolved_selectedInputOrigin program state candidate operation input wellFormed resolved rfl (by change input ∈ [input] ++ (output :: route.toList.map (·.output)); simp)
  obtain ⟨hosting, named, definition, positive, ownerSafe, timeSafe, ancestry, declarations, _⟩ :=
    reachable_reservation_frame program analysis analyzed state reachable instanceId running candidate operation resolved input unit (fun _ => false)
  have valid := reachable.reservation_valid program analysis analyzed state
  have inputsReady : ∃ arguments, (if hasParallelScopeDefinition program candidate.owner then
      evaluateParallelScopeInputs? program state candidate.owner effect.inputMappings
      else evaluateEffectInputs? program state candidate.owner effect.inputMappings) = some arguments := by
    by_cases child : candidate.owner.definitionScopeId = analysis.entry.childScopeId
    · obtain ⟨arguments, evaluated⟩ := reachable.reachable_child_effect_inputs program analysis analyzed state instanceId running candidate id origin input output effect route resolved child
      have parallel := (reachable.child_scope_probe program analysis analyzed state instanceId running candidate operation resolved child).1
      exact ⟨arguments, by simpa only [parallel, ↓reduceIte] using evaluated⟩
    · have ordinary := parent_is_ordinary program analysis analyzed candidate.owner child
      obtain ⟨after, enabled⟩ := reachable.parent_service_enabled program analysis analyzed state instanceId running candidate id origin input output effect route resolved child unit
      simp only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some, ordinary,
        Bool.false_and, Bool.false_eq_true, ↓reduceIte] at enabled
      split at enabled <;> try contradiction
      obtain ⟨arguments, inputs, _⟩ := Option.bind_eq_some_iff.mp enabled
      exact ⟨arguments, by simpa only [ordinary, Bool.false_eq_true, ↓reduceIte] using inputs⟩
  obtain ⟨arguments, inputs⟩ := inputsReady
  have probe := scope_probe program analysis analyzed state reachable instanceId running candidate operation resolved
  have activationPositive : 0 < activation := by omega
  have fresh := openWaitAnchorAbsent_effect_above_counter program analysis state instanceId candidate.owner id origin input output effect route activation
    analyzed valid declarations hosting declared above
  let wait : EffectWait := {
    processInstanceId := instanceId
    owner := candidate.owner
    elementId := effect.elementId
    activation := activation
    descriptor := effect.descriptor
    arguments := arguments
    outputMappings := effect.outputMappings
    output := output
    bpmnErrorRoute := route }
  have available := effect_write_available_above_counter state wait arguments valid (by dsimp [wait]; omega)
  have allowed := List.all_eq_true.mp (ParallelScopeStart.analyzeProgram_incidence_admission program analysis analyzed).2.2 operation declared
  have source : effect.elementId.value = origin.elementId.value := by
    simp only [operation, ParallelScopeStart.programOperationAllowed, SequentialScopeProgram.operationAllowed,
      Bool.and_eq_true, beq_iff_eq] at allowed
    exact congrArg NodeId.value allowed.2
  have unique := ParallelScopeStart.analyzeProgram_effect_uniqueFamilyDeclarer program analysis analyzed id origin input output effect route declared
  rw [hosting] at fresh
  dsimp only [wait] at available
  rcases probe with ordinary | ⟨ordinary, sequential, empty⟩
  all_goals simp only [ordinary, Bool.false_eq_true, ↓reduceIte] at inputs
  all_goals simp [prepareReservedOccurrenceArm?, running, safe, Nat.ne_of_gt activationPositive, hosting, named, definition, Nat.ne_of_gt positive,
    ownerSafe, timeSafe, ancestry, resolved, internalArmInput?, internalArmOrigin?, exactSelection, live, unit,
    inputSelected, ordinary, inputs, InternalArmingWrite.elementId, InternalArmingWrite.kind,
    InternalArmingWrite.occurrence, effectWaitOccurrence, ← source, unique, fresh, available]
  all_goals simp [sequential, empty]

/-- Every reachable human wait with one input token passes native-ordinal reservation. -/
theorem ParallelScopeInternalPrefixReachable.human_reserved (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (task : UserTaskDefinition)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitUserTask id origin input output task))
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1) :
    ∃ patch, prepareReservedOccurrenceArm? program state candidate (activationCount state task.id + 1) = some patch := by
  exact reachable.human_reserved_above_counter program analysis analyzed state instanceId running candidate id origin input output task resolved unit
    (activationCount state task.id + 1) (by omega) (reachable.native_issuance_safe program analysis analyzed state task.id ⟨task.id.value⟩).1

/-- Every reachable service wait with one input token passes native-ordinal reservation. -/
theorem ParallelScopeInternalPrefixReachable.service_reserved (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitEffect id origin input output effect route))
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1) :
    ∃ patch, prepareReservedOccurrenceArm? program state candidate (effectActivationCount state effect.elementId + 1) = some patch := by
  exact reachable.service_reserved_above_counter program analysis analyzed state instanceId running candidate id origin input output effect route resolved unit
    (effectActivationCount state effect.elementId + 1) (by omega) (reachable.native_issuance_safe program analysis analyzed state ⟨effect.elementId.value⟩ effect.elementId).2

private theorem cohort_headroom (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (owner : ScopeOccurrenceId) (input : ControlPlaceId)
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == owner).length = 1)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (reserved : List InternalOccurrencePatch) (length : reserved.length ≤ pairs.length)
    (human : TaskDefinitionId) (effect : NodeId) :
    SemanticProcessJson.isSafeWireNat (activationCount state human + reservedCohortSize reserved .userTask human.value + 1) = true ∧
      SemanticProcessJson.isSafeWireNat (effectActivationCount state effect + reservedCohortSize reserved .effect effect.value + 1) = true := by
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis analyzed state
  rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with rfl |
    ⟨id, origin, output, initial, records, declared, initiated, phase⟩
  · have raw := seed.started
    simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at raw
    have tokens := congrArg (fun current : RuntimeState => current.tokens) raw
    change [] = seed.ready.tokens at tokens
    rw [← tokens] at unit
    simp at unit
  · have bounds := phase.reservation_cohort_headroom program analysis analyzed _ seed.parent seed.instanceId seed.values seed.root
      seed.ready initial id origin output declared seed.rootSelected rfl seed.started initiated state records instanceId running
      seed.capacity seed.capacityAccepted pairs discovered reserved length human effect
    exact ⟨bounds.1.2, bounds.2.1.2⟩

/-- Discovery bounds the partial cohort, so its assigned human slot passes reservation without a separate safety premise. -/
theorem ParallelScopeInternalPrefixReachable.human_cohort_reserved (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (task : UserTaskDefinition)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitUserTask id origin input output task))
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (reserved : List InternalOccurrencePatch) (length : reserved.length ≤ pairs.length) :
    ∃ patch, prepareReservedOccurrenceArm? program state candidate (activationCount state task.id + reservedCohortSize reserved .userTask task.id.value + 1) = some patch := by
  have safe := (cohort_headroom program analysis analyzed state reachable instanceId running candidate.owner input unit
    pairs discovered reserved length task.id ⟨task.id.value⟩).1
  exact reachable.human_reserved_above_counter program analysis analyzed state instanceId running candidate id origin input output task
    resolved unit _ (by omega) safe

/-- Discovery bounds the partial cohort, so its assigned service slot passes reservation without a separate safety premise. -/
theorem ParallelScopeInternalPrefixReachable.service_cohort_reserved (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitEffect id origin input output effect route))
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (reserved : List InternalOccurrencePatch) (length : reserved.length ≤ pairs.length) :
    ∃ patch, prepareReservedOccurrenceArm? program state candidate (effectActivationCount state effect.elementId + reservedCohortSize reserved .effect effect.elementId.value + 1) = some patch := by
  have safe := (cohort_headroom program analysis analyzed state reachable instanceId running candidate.owner input unit
    pairs discovered reserved length ⟨effect.elementId.value⟩ effect.elementId).2
  exact reachable.service_reserved_above_counter program analysis analyzed state instanceId running candidate id origin input output effect route
    resolved unit _ (by omega) safe

end BpmnSemantics.SemanticProcess

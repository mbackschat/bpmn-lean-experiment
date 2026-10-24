module

public import BpmnSemantics.SemanticProcess.ParallelScopeFinalRetirement
public import BpmnSemantics.SemanticProcess.ParallelScopeWaitAnchorFreshnessProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeCounterHistoryProofs

/-! # Reachable wait reservation validity

PMIS-SELECT-01 requires fresh retained anchors as well as safe issuance counters.
Ordinary occurrence execution and reserved execution share these invariants;
validity preservation is separate from successful preparation of the next wait.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay

private theorem native_human_reservation_valid (before : RuntimeState) (owner : ScopeOccurrenceId)
    (input output : ControlPlaceId) (task : UserTaskDefinition)
    (valid : occurrenceReservationStateValid before = true) (absent : before.compensationHandlerEffectWaits = [])
    (nonempty : task.id.value.isEmpty = false)
    (safe : SemanticProcessJson.isSafeWireNat (activationCount before task.id + 1) = true)
    (fresh : openWaitAnchorAbsent before ⟨owner.processInstanceId, ⟨task.id.value⟩, activationCount before task.id + 1⟩ = true) :
    occurrenceReservationStateValid (activateUserTask before owner.processInstanceId owner input output task) = true := by
  let wait : UserTaskWait := {
    processInstanceId := owner.processInstanceId
    owner := owner
    task := task
    activation := activationCount before task.id + 1
    output := output
    metadata := task.metadata }
  let issued := { before with activations := setActivationCount before.activations task.id wait.activation }
  have issuedValid := occurrenceReservationStateValid_setActivationCount before task.id wait.activation valid nonempty safe (by dsimp [wait]; omega)
  have bounded : wait.activation ≤ activationCount issued task.id := by
    rw [activationCount_setActivationCount_self]
    exact Nat.le_refl _
  have freshWait : userTaskWaitOccurrence wait ∉ openWaitAnchors issued ++
      issued.compensationHandlerEffectWaits.map (fun retained =>
        (⟨retained.id.processInstanceId, retained.id.elementId, retained.id.activation⟩ : OccurrenceId)) := by
    change userTaskWaitOccurrence wait ∉ openWaitAnchors before ++ before.compensationHandlerEffectWaits.map _
    simpa [openWaitAnchorAbsent, wait, userTaskWaitOccurrence, absent] using fresh
  have inserted := occurrenceReservationStateValid_insertUserTaskWait issued wait issuedValid
    (by dsimp [wait]; omega) safe bounded freshWait
  change occurrenceReservationStateValid { { issued with waits := insertUserTaskWait wait issued.waits } with
    tokens := removeToken before.tokens input owner } = true
  rw [occurrenceReservationStateValid_tokens]
  exact inserted

private theorem native_effect_reservation_valid (before : RuntimeState) (owner : ScopeOccurrenceId)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (arguments : List VariableBinding)
    (valid : occurrenceReservationStateValid before = true) (absent : before.compensationHandlerEffectWaits = [])
    (nonempty : effect.elementId.value.isEmpty = false)
    (safe : SemanticProcessJson.isSafeWireNat (effectActivationCount before effect.elementId + 1) = true)
    (fresh : openWaitAnchorAbsent before ⟨owner.processInstanceId, ⟨effect.elementId.value⟩, effectActivationCount before effect.elementId + 1⟩ = true) :
    occurrenceReservationStateValid (activateEffect before owner.processInstanceId owner input output effect route arguments) = true := by
  let wait : EffectWait := {
    processInstanceId := owner.processInstanceId
    owner := owner
    elementId := effect.elementId
    activation := effectActivationCount before effect.elementId + 1
    descriptor := effect.descriptor
    arguments := arguments
    outputMappings := effect.outputMappings
    output := output
    bpmnErrorRoute := route }
  let issued := { before with effectActivations := setEffectActivationCount before.effectActivations effect.elementId wait.activation }
  have issuedValid := occurrenceReservationStateValid_setEffectActivationCount before effect.elementId wait.activation valid nonempty safe (by dsimp [wait]; omega)
  have bounded : wait.activation ≤ effectActivationCount issued effect.elementId := by
    rw [effectActivationCount_set_self]
    exact Nat.le_refl _
  have freshWait : effectWaitOccurrence wait ∉ openWaitAnchors issued ++
      issued.compensationHandlerEffectWaits.map (fun retained =>
        (⟨retained.id.processInstanceId, retained.id.elementId, retained.id.activation⟩ : OccurrenceId)) := by
    change effectWaitOccurrence wait ∉ openWaitAnchors before ++ before.compensationHandlerEffectWaits.map _
    simpa [openWaitAnchorAbsent, wait, effectWaitOccurrence, absent] using fresh
  have available := effect_write_available_above_counter before wait arguments valid (by dsimp [wait]; omega)
  have frameFresh := effect_write_available_owner_fresh before wait arguments available
  have inserted := occurrenceReservationStateValid_insertEffectWait issued wait arguments issuedValid
    (by dsimp [wait]; omega) safe bounded freshWait frameFresh
  let updatedVariables := { issued.variables with
    activities := insertActivityVariableScope ⟨.effectOccurrence (effectWaitOccurrence wait), arguments⟩ issued.variables.activities }
  let retained := { issued with
    effectWaits := insertEffectWait wait issued.effectWaits
    variables := updatedVariables }
  change occurrenceReservationStateValid { retained with
    tokens := removeToken before.tokens input owner } = true
  rw [occurrenceReservationStateValid_tokens]
  exact inserted

/-- Actual native arming preserves the same anchor/counter invariant as reserved patches.
Source-bound declarations exclude cross-family collisions; a safe next family counter
alone would not establish this result.
-/
theorem applyInternalOperationOccurrence_body_reservation_valid (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (hosting : SemanticId) (before after : RuntimeState) (candidate : InternalOperationOccurrence)
    (operation : SemanticOperation) (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after)
    (valid : occurrenceReservationStateValid before = true) (absent : before.compensationHandlerEffectWaits = [])
    (declarations : waitDeclarationsValid program hosting before = true)
    (hostingEq : candidate.owner.processInstanceId = hosting) : occurrenceReservationStateValid after = true := by
  have member := (resolveInternalOperationOccurrence_declaration program before candidate operation resolved).1
  have nonempty := programWellFormed_internalArm_element_nonempty program operation
    (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1 member
  cases control : before.control <;> simp only [applyInternalOperationOccurrence?, control, bind] at applied <;> try contradiction
  cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
  all_goals simp only [resolved, Option.bind_some] at applied
  case awaitUserTask id origin input output task =>
    split at applied <;> try contradiction
    rename_i accepted
    simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at accepted
    have fresh := openWaitAnchorAbsent_human_next program analysis before hosting candidate.owner id origin input output task
      admitted valid declarations hostingEq member
    have ready := native_human_reservation_valid before candidate.owner input output task valid absent
      (by simpa using nonempty) (by simpa only [Bool.not_not, Bool.not_false] using congrArg Bool.not accepted.1.2) fresh
    split at applied
    · obtain ⟨_, _, applied⟩ := Option.bind_eq_some_iff.mp applied
      cases Option.some.inj applied
      exact ready
    · cases Option.some.inj applied
      exact ready
  case awaitEffect id origin input output effect route =>
    split at applied <;> try contradiction
    rename_i accepted
    simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at accepted
    have fresh := openWaitAnchorAbsent_effect_next program analysis before hosting candidate.owner id origin input output effect route
      admitted valid declarations hostingEq member
    split at applied
    all_goals obtain ⟨arguments, _, applied⟩ := Option.bind_eq_some_iff.mp applied
    all_goals cases Option.some.inj applied
    all_goals
      exact native_effect_reservation_valid before candidate.owner input output effect route arguments valid absent
        (by simpa using nonempty) (by simpa only [Bool.not_not, Bool.not_false] using congrArg Bool.not accepted.1.2) fresh
  all_goals
    split at applied <;> try contradiction
    cases Option.some.inj applied
    exact valid


private theorem reachable_wait_declarations (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (before : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program before)
    (instanceId : SemanticId) (running : before.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation) :
    ∃ hosting, waitDeclarationsValid program hosting before = true ∧ candidate.owner.processInstanceId = hosting := by
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis admitted before
  rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with rfl |
    ⟨id, origin, output, initial, records, _, _, phase⟩
  · refine ⟨candidate.owner.processInstanceId, ?_, rfl⟩
    have raw := seed.started
    simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at raw
    change _ = seed.ready at raw
    rw [← raw]
    simp [waitDeclarationsValid, runningStartState, initialState]
  · exact ⟨seed.parent.processInstanceId,
      phase.wait_declarations program analysis admitted _ seed.parent initial before records,
      (phase.reservation_owner_bounds program analysis admitted _ seed.parent initial before records
        instanceId running candidate operation resolved).1.1⟩

theorem reachable_singleton_reservation_valid (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (before after : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program before)
    (candidate : InternalOperationOccurrence)
    (applied : applyInternalOperationOccurrence? program before candidate = some after)
    (valid : occurrenceReservationStateValid before = true) : occurrenceReservationStateValid after = true := by
  obtain ⟨_, absent, _⟩ := reachable.start_certificate program analysis admitted before
  obtain ⟨operation, resolved, _, replayed⟩ := applyInternalOperationOccurrence_replay_record
    program before after candidate profile applied
  let record : InternalTransitionRecord := {
    operationId := candidate.operationId
    operationKind := operation.kind
    origin := operation.origin
    owner := candidate.owner
    mergeInput := none }
  have replay : replayInternalOperationOccurrence? program before record = some after := replayed
  by_cases body : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]
  · have running : ∃ instanceId, before.control = .running instanceId := by
      cases control : before.control <;> simp only [applyInternalOperationOccurrence?, control, bind] at applied
      all_goals first | contradiction | exact ⟨_, rfl⟩
    obtain ⟨instanceId, running⟩ := running
    obtain ⟨hosting, declarations, hostingEq⟩ := reachable_wait_declarations program analysis admitted before reachable
      instanceId running candidate operation resolved
    exact applyInternalOperationOccurrence_body_reservation_valid program analysis admitted hosting before after
      candidate operation resolved body applied valid absent declarations hostingEq
  · cases operation <;> simp [SemanticOperation.kind] at body
    case initiate =>
      obtain ⟨output, _, _, _, _, _, initiated⟩ := replayed_initiation_execution program before after record rfl replay
      exact (initiateState_reservation_valid before after output initiated valid absent).1
    case enterParallelMultiInstanceScope =>
      have entered := replayed_parallel_entry_execution program analysis admitted before after record rfl replay
      exact (enterParallelScope_reservation_valid _ before after _ entered valid absent).1
    case completeParallelMultiInstanceScope =>
      obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program before after record rfl replay
      exact (completeParallelScope_reservation_valid entry before after candidate.owner completed valid absent).1
    case completeScope =>
      obtain ⟨scopeId, output, _, _, _, _, completed⟩ := replayed_scope_completion_execution program before after record rfl replay (ParallelScopeStart.analyzed_not_nested program analysis admitted)
          (ParallelScopeStart.analyzed_not_embedded_completion program analysis admitted)
      exact (completeSelectedScope_reservation_valid program analysis admitted before after scopeId output completed valid absent).1
    all_goals cases control : before.control <;>
      simp only [applyInternalOperationOccurrence?, control, resolved, bind, Option.bind_some,
        isMergeTargetOperation_eq_false_of_profile program _ (by rw [profile]; decide +kernel), Bool.false_eq_true, Bool.false_and, ↓reduceIte] at applied <;> contradiction

private theorem committed_ingress_reservation_valid (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (selected : ParallelScopeStart.programSelected program = true)
    (before : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program before)
    (stimulus : Stimulus) (committed : (admitStimulus program before stimulus).outcome = .committed) :
    occurrenceReservationStateValid (admitStimulus program before stimulus).state = true := by
  rcases reachable.start_certificate program analysis admitted before with rfl | ⟨seed, absent, phases⟩
  · obtain ⟨commandId, processId, instanceId, values, rfl⟩ := parallelScope_initial_committed_is_start program selected stimulus committed
    obtain ⟨started, _, _⟩ := parallelScope_committed_start_exact program selected commandId processId instanceId values committed
    exact (runningProgramStartState_reservation_valid program instanceId values _ started).1
  · have alreadyStarted : before.control ≠ .notStarted := by
      rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with rfl |
        ⟨id, origin, output, initial, records, _, _, phase⟩
      · rw [runningProgramStartState_control program seed.instanceId seed.values seed.ready seed.started]
        simp
      · exact phase.not_notStarted program analysis selected _ _ initial before records
    have completion : waitCompletionStimulus stimulus := by
      rcases parallelScope_committed_ingress_kind program selected before stimulus committed with ⟨_, _, _, _, _, control⟩ | completion
      · exact False.elim (alreadyStarted control)
      · exact completion
    have capacity := parallelScope_committed_resumption_capacity program analysis before stimulus selected admitted completion committed
    have valid : occurrenceReservationStateValid before = true := by
      cases checked : occurrenceReservationStateValid before
      · simp [ParallelScopeStart.programStateCapacity, checked] at capacity
      · rfl
    exact (admitStimulus_wait_reservation_valid program before stimulus selected completion valid absent).1

private theorem reserved_prefix_last (program : Program) (members : List InternalOccurrencePatch)
    (before : RuntimeState) (successors : List RuntimeState)
    (applied : applyReservedOccurrencePrefix? program before members = some successors) :
    (before :: successors).getLast? = some (members.foldl (fun state patch => patch.apply state) before) := by
  induction members generalizing before successors with
  | nil =>
    simp only [applyReservedOccurrencePrefix?, Option.some.injEq] at applied
    subst successors
    rfl
  | cons member rest ih =>
    simp only [applyReservedOccurrencePrefix?] at applied
    split at applied <;> try contradiction
    obtain ⟨tail, followed, applied⟩ := Option.bind_eq_some_iff.mp applied
    cases Option.some.inj applied
    simpa only [List.foldl_cons, List.getLast?_cons_cons] using ih (member.apply before) tail followed

private theorem batch_endpoint_reservation_valid (program : Program) (before after : RuntimeState)
    (batch : InternalOccurrenceBatch) (successors : List RuntimeState)
    (wellFormed : programWellFormed program = true) (absent : before.compensationHandlerEffectWaits = [])
    (applied : applyInternalOccurrenceBatch? program before batch = some successors)
    (endpoint : successors.getLast? = some after) : occurrenceReservationStateValid after = true := by
  unfold applyInternalOccurrenceBatch? at applied
  split at applied <;> try contradiction
  rename_i accepted
  have prepared : prepareInternalOccurrenceBatch? program before = some batch := by
    simp only [Bool.or_eq_true, bne_iff_ne, not_or, Classical.not_not] at accepted
    exact accepted.2
  have raw := reserved_prefix_last program batch.members before successors applied
  have same : after = batch.members.foldl (fun state patch => patch.apply state) before := by
    cases successors with
    | nil => simp at endpoint
    | cons first rest =>
      rw [List.getLast?_cons_cons, endpoint] at raw
      exact Option.some.inj raw
  rw [same]
  exact preparedOccurrenceBatch_prefix_reservation_valid program before batch prepared wellFormed absent batch.members [] (by simp)

/-- Every actual PMIS command prefix retains valid wait anchors and issuance counters.
This covers accepted ingress, native singleton execution and complete reserved batches;
no validity assumption is supplied by a later readiness theorem.
-/
theorem ParallelScopeInternalPrefixReachable.reservation_valid (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state) :
    occurrenceReservationStateValid state = true := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at admitted
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  have wellFormed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis admitted).1
  exact ParallelScopeInternalPrefixReachable.invariant_from_ingress program profile
    (fun current => occurrenceReservationStateValid current = true)
    (fun before boundary stimulus _ committed =>
      committed_ingress_reservation_valid program analysis admitted selected before boundary stimulus committed)
    (fun before after preceding candidate prior applied =>
      reachable_singleton_reservation_valid program analysis admitted profile before after preceding candidate applied prior)
    (fun before after preceding batch successors _ applied endpoint => by
      obtain ⟨_, absent, _⟩ := preceding.start_certificate program analysis admitted before
      exact batch_endpoint_reservation_valid program before after batch successors wellFormed absent applied endpoint)
    state reachable


/-- Actual Start capacity and the bounded continuation history leave a safe next
ordinal in both native wait families, including before initiation.
-/
theorem ParallelScopeInternalPrefixReachable.native_issuance_safe (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (human : TaskDefinitionId) (effect : NodeId) :
    SemanticProcessJson.isSafeWireNat (activationCount state human + 1) = true ∧
      SemanticProcessJson.isSafeWireNat (effectActivationCount state effect + 1) = true := by
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis admitted state
  rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with rfl |
    ⟨id, origin, output, initial, records, declared, initiated, phase⟩
  · obtain ⟨humans, effects, _⟩ := runningProgramStartState_native_counters program seed.instanceId seed.values seed.ready seed.started
    simp [activationCount, effectActivationCount, humans, effects, taskActivationCount, elementActivationCount,
      SemanticProcessJson.isSafeWireNat, SemanticProcessJson.maxSafeWireNat]
  · obtain ⟨humans, effects, _, ceiling⟩ := phase.native_counters_below_start_capacity program analysis admitted
      _ seed.parent seed.instanceId seed.values seed.root seed.ready initial id origin output declared seed.rootSelected
      rfl seed.started initiated state records seed.capacity seed.capacityAccepted human effect
    constructor
    all_goals change decide (_ ≤ (9007199254740991 : Nat)) = true
    all_goals apply decide_eq_true; omega

private theorem nonchild_ordinary (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (admitted : ParallelScopeStart.analyzeProgram program = some analysis) (owner : ScopeOccurrenceId)
    (parent : owner.definitionScopeId ≠ analysis.entry.childScopeId) : hasParallelScopeDefinition program owner = false := by
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ :=
    ParallelScopeStart.analyzeProgram_body_certificate program analysis admitted
  simp [hasParallelScopeDefinition, entries, Ne.symm parent]

/-- A parent Human Task with its unique real input cannot disappear from native
discovery because of reservation validity or counter exhaustion.
-/
theorem ParallelScopeInternalPrefixReachable.parent_human_enabled (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (task : UserTaskDefinition)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitUserTask id origin input output task))
    (parent : candidate.owner.definitionScopeId ≠ analysis.entry.childScopeId)
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1) :
    applyInternalOperationOccurrence? program state candidate =
      some (activateUserTask state candidate.owner.processInstanceId candidate.owner input output task) := by
  have valid := reachable.reservation_valid program analysis admitted state
  have safe := (reachable.native_issuance_safe program analysis admitted state task.id ⟨task.id.value⟩).1
  have ordinary := nonchild_ordinary program analysis admitted candidate.owner parent
  simp [applyInternalOperationOccurrence?, running, resolved, unit, valid, safe, ordinary]

/-- Parent Service arming has the same proved reservation and issuance guarantees.
Its data-input premise remains separate: this law does not assert that arbitrary
Service mappings can be evaluated from the current Process values.
-/
theorem ParallelScopeInternalPrefixReachable.parent_effect_enabled (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (admitted : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitEffect id origin input output effect route))
    (parent : candidate.owner.definitionScopeId ≠ analysis.entry.childScopeId)
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1)
    (arguments : List VariableBinding)
    (inputs : evaluateEffectInputs? program state candidate.owner effect.inputMappings = some arguments) :
    applyInternalOperationOccurrence? program state candidate =
      some (activateEffect state candidate.owner.processInstanceId candidate.owner input output effect route arguments) := by
  have valid := reachable.reservation_valid program analysis admitted state
  have safe := (reachable.native_issuance_safe program analysis admitted state ⟨effect.elementId.value⟩ effect.elementId).2
  have ordinary := nonchild_ordinary program analysis admitted candidate.owner parent
  simp [applyInternalOperationOccurrence?, running, resolved, unit, valid, safe, ordinary, inputs]

end BpmnSemantics.SemanticProcess

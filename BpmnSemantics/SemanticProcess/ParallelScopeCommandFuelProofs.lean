import BpmnSemantics.SemanticProcess.ParallelScopeCommandSuccessProofs
import BpmnSemantics.SemanticProcess.ParallelScopeRuntimePositionProofs

/-! # Parallel command fuel sufficiency

The accepted command capacity pays for actual scheduler work, including Start
initiation and terminal completion. This owner connects lifetime accounting to
command admission; publication completeness remains a separate obligation.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay ParallelScopeStart

/-- Lifetime capacity excludes fuel refusal at every endpoint, including terminal completion. -/
theorem closeScheduledTraced_parallelScope_phase_no_fuel_refusal
    (program : Program) (commandId : SemanticId)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (owner parent : ScopeOccurrenceId) (different : owner ≠ parent)
    (instanceId : SemanticId) (values : List VariableBinding) (root : DefinitionScope)
    (ready initial : RuntimeState) (startId : OperationId) (origin : BpmnElementOrigin) (output : ControlPlaceId)
    (startDeclared : SemanticOperation.initiate startId origin output ∈ program.operations)
    (rootSelected : rootDefinitionScope? program = some root) (parentIdentity : parent = ⟨instanceId, root.id, 1⟩)
    (started : runningProgramStartState? program instanceId values = some ready)
    (initiated : initiateState? ready output = some initial)
    (state : RuntimeState) (earlier : List CommittedTransition)
    (phase : ParallelScopeSchedulerPhase program analysis owner parent initial state earlier)
    (reachable : ParallelScopeInternalPrefixReachable program state)
    (fuel index ordinal : Nat) (schedule : InternalChoiceSchedule)
    (capacity : ProgramCapacity) (startCapacity : programStartCapacity program values = some capacity)
    (allocated : capacity.closureBound ≤ earlier.length + fuel + 1) :
    (closeScheduledTraced fuel program commandId index ordinal schedule state).hitBound = false := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  apply Bool.eq_false_iff.mpr
  intro hit
  obtain ⟨_, _, finalReachable⟩ := closeScheduledTraced_parallelScope_prefix_reachable program profile commandId
    fuel index ordinal schedule state reachable
  have clean := finalReachable.execution_discovery_successful_all program analysis admitted _
  obtain ⟨_, _, _, _, _, unstable, _⟩ := closeScheduledTraced_hitBound_cursor program commandId
    fuel index ordinal schedule state hit
  have nonempty : (deriveInternalExecutionFrontier program
      (closeScheduledTraced fuel program commandId index ordinal schedule state).state).offers ≠ [] := by
    intro empty
    simp [empty, clean] at unstable
  obtain ⟨offer, member⟩ := List.exists_mem_of_ne_nil _ nonempty
  obtain ⟨candidate, _, applied, _⟩ := deriveInternalExecutionFrontier_occurrence_sound program _ profile offer member
  have active : ∃ runtimeId, (closeScheduledTraced fuel program commandId index ordinal schedule state).state.control =
      .running runtimeId := by
    cases control : (closeScheduledTraced fuel program commandId index ordinal schedule state).state.control <;>
      simp only [applyInternalOperationOccurrence?, control] at applied <;> try contradiction
    exact ⟨_, rfl⟩
  obtain ⟨runtimeId, running⟩ := active
  have notHit := closeScheduledTraced_parallelScope_no_fuel_refusal program commandId analysis admitted owner parent
    different instanceId values root ready initial startId origin output startDeclared rootSelected parentIdentity
    started initiated state earlier phase reachable fuel index ordinal schedule _ rfl runtimeId running
    capacity startCapacity allocated
  rw [notHit] at hit
  contradiction

/-- Every committed Human or Service resumption receives sufficient fuel from its actual admission capacity. -/
theorem ParallelScopeCommandBoundaryReachable.completion_no_fuel_refusal
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program stable)
    (stimulus : Stimulus) (completion : waitCompletionStimulus stimulus)
    (committed : (admitStimulus program stable stimulus).outcome = .committed)
    (fuel : Nat) (limit : commandClosureLimit? program stable stimulus = some fuel) :
    (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 []
      (admitStimulus program stable stimulus).state).hitBound = false := by
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  have active : ∃ instanceId, stable.control = .running instanceId := by
    cases control : stable.control <;> try exact ⟨_, rfl⟩
    all_goals cases stimulus <;> simp only [waitCompletionStimulus] at completion <;> try contradiction
    all_goals cases snapshot : program.compensationEventSubProcessSnapshots <;>
      cases incidents : stable.effectIncidents <;> simp [admitStimulus, snapshot, control, incidents] at committed
  obtain ⟨runtimeId, running⟩ := active
  have accepted : ∃ resumed, programStateCapacity program stable = some resumed ∧ resumed.closureBound = fuel := by
    unfold commandClosureLimit? at limit
    simp only [selected, Bool.not_true, Bool.false_eq_true, ↓reduceIte, running] at limit
    split at limit <;> try contradiction
    exact Option.map_eq_some_iff.mp limit
  obtain ⟨resumed, capacityAccepted, fuelEq⟩ := accepted
  rcases reachable.initialized_certificate program analysis admitted stable with original | ⟨seed, absent, phases⟩
  · simp [original, initialState] at running
  · let owner : ScopeOccurrenceId := ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩
    obtain ⟨id, origin, output, initial, records, declared, initiated, phase⟩ := phases owner rfl
    have different : owner ≠ seed.parent := by
      intro same
      exact analyzeProgram_child_root_distinct program analysis admitted seed.root seed.rootSelected
        (congrArg ScopeOccurrenceId.definitionScopeId same)
    have boundEq := phase.resumption_closure_bound program analysis admitted owner seed.parent
      seed.instanceId seed.values seed.root seed.ready initial output seed.rootSelected rfl seed.started initiated
      stable runtimeId running records seed.capacity resumed seed.capacityAccepted capacityAccepted
    have nextPhase := (phase.wait_admission program analysis admitted owner seed.parent initial stable records
      stimulus completion committed absent).1
    exact closeScheduledTraced_parallelScope_phase_no_fuel_refusal program (stimulusCommandId stimulus) analysis admitted
      owner seed.parent different seed.instanceId seed.values seed.root seed.ready initial id origin output declared
      seed.rootSelected rfl seed.started initiated _ records nextPhase (.admitted stable stimulus reachable committed)
      fuel 1 0 [] seed.capacity seed.capacityAccepted (by omega)

/-- Start capacity includes its initial operation before the common lifetime accounting begins. -/
theorem ParallelScopeAcceptedStart.no_fuel_refusal
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (seed : ParallelScopeAcceptedStart program) :
    (closeScheduledTraced seed.capacity.closureBound program seed.commandId 1 0 [] seed.ready).hitBound = false := by
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [programSelected, beq_iff_eq] using selected
  have reachable : ParallelScopeInternalPrefixReachable program seed.ready :=
    .admitted initialState _ .initial seed.committed
  have raw := seed.started
  simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at raw
  change _ = seed.ready at raw
  have running : seed.ready.control = .running seed.instanceId := by rw [← raw]; rfl
  have distinct := analyzeProgram_child_root_distinct program analysis admitted seed.root seed.rootSelected
  have parents : ParallelScopeParentHistory program analysis.entry seed.parent seed.ready :=
    .start seed.instanceId seed.root seed.values seed.ready seed.rootSelected seed.started rfl distinct
  have clean := reachable.execution_discovery_successful_all program analysis admitted seed.ready
  have nonempty : (deriveInternalExecutionFrontier program seed.ready).offers ≠ [] := by
    intro empty
    exact seed.not_stable program analysis admitted (by simp [empty, clean])
  obtain ⟨pairs, discovered⟩ := reachable.frontier_discovery_total program analysis admitted seed.ready seed.instanceId running
  have count := deriveInternalExecutionFrontier_occurrence_length program seed.ready seed.instanceId pairs profile running discovered
  have single := parents.raw_frontier_length_le_one program analysis admitted seed.parent seed.ready pairs discovered
  have one : (deriveInternalExecutionFrontier program seed.ready).offers.length = 1 := by
    have positive := List.length_pos_iff.mpr nonempty
    omega
  obtain ⟨offer, singleton⟩ := List.length_eq_one_iff.mp one
  have noBatch : (deriveInternalExecutionFrontier program seed.ready).occurrenceBatch = none := by
    simp only [deriveInternalExecutionFrontier, running] at singleton ⊢
    rw [singleton]
    rfl
  have frontier : deriveInternalExecutionFrontier program seed.ready = { offers := [offer] } := by
    cases computed : deriveInternalExecutionFrontier program seed.ready
    simp_all
  obtain ⟨candidate, alternative, applied, preparation⟩ := deriveInternalExecutionFrontier_occurrence_sound
    program seed.ready profile offer (by rw [singleton]; simp)
  have chosen := selectInternalExecutionFrontier_singleton program.internalSchedulingMode 0 [] offer
    (by intro prepared accepted; rw [preparation] at accepted; contradiction)
  obtain ⟨id, origin, output, declared, initiated⟩ := parallelScope_start_occurrence_initiates program analysis admitted
    seed.instanceId seed.values seed.root seed.ready offer.successor seed.rootSelected distinct seed.started candidate applied
  let owner : ScopeOccurrenceId := ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩
  have different : owner ≠ seed.parent := by
    intro same
    exact distinct (congrArg ScopeOccurrenceId.definitionScopeId same)
  have phase : ParallelScopeSchedulerPhase program analysis owner seed.parent offer.successor offer.successor [] :=
    Or.inl ⟨.initiate parents output ⟨id, origin, declared⟩ initiated, .initial offer.successor⟩
  have nextReachable : ParallelScopeInternalPrefixReachable program offer.successor :=
    .singleton seed.ready offer.successor 0 [] [] false offer candidate reachable
      (by simpa only [frontier] using chosen) alternative applied
  have positive := phase.record_count_le_start_capacity program analysis admitted owner seed.parent seed.instanceId
    seed.values seed.root seed.ready offer.successor id origin output declared seed.rootSelected rfl seed.started initiated
    offer.successor [] seed.capacity seed.capacityAccepted
  cases fuelEq : seed.capacity.closureBound with
  | zero => simp [fuelEq] at positive
  | succ fuel =>
    have suffix := closeScheduledTraced_parallelScope_phase_no_fuel_refusal program seed.commandId analysis admitted
      owner seed.parent different seed.instanceId seed.values seed.root seed.ready offer.successor id origin output
      declared seed.rootSelected rfl seed.started initiated offer.successor [] phase nextReachable fuel 2 0 []
      seed.capacity seed.capacityAccepted (by simp [fuelEq])
    rw [closeScheduledTraced]
    simp only [frontier, List.isEmpty_cons, Bool.false_and, Bool.false_eq_true, ↓reduceIte, chosen,
      List.length_nil, Nat.not_lt_zero, Nat.sub_zero, Nat.add_zero]
    let closed := closeScheduledTraced fuel program seed.commandId 2 0 [] offer.successor
    change (if closed.failed then closed else { closed with records := _, lifecycles := _ }).hitBound = false
    split <;> exact suffix

/-- The exact command limit accepted by PMIS admission suffices for every committed ingress. -/
theorem ParallelScopeCommandBoundaryReachable.command_no_fuel_refusal
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program stable)
    (stimulus : Stimulus) (committed : (admitStimulus program stable stimulus).outcome = .committed)
    (fuel : Nat) (limit : commandClosureLimit? program stable stimulus = some fuel) :
    (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 []
      (admitStimulus program stable stimulus).state).hitBound = false := by
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  rcases parallelScope_committed_ingress_kind program selected stable stimulus committed with
    ⟨commandId, processId, instanceId, values, rfl, control⟩ | completion
  · rcases reachable.initialized_certificate program analysis admitted stable with rfl | ⟨seed, _, phases⟩
    · obtain ⟨started, capacity, capacityAccepted⟩ := parallelScope_committed_start_exact program selected
        commandId processId instanceId values committed
      have builder := started
      unfold runningProgramStartState? at builder
      obtain ⟨root, rootSelected, _⟩ := Option.bind_eq_some_iff.mp builder
      let seed : ParallelScopeAcceptedStart program := {
        commandId, processId, instanceId, values, root, capacity, committed, rootSelected, started, capacityAccepted }
      have fuelEq : capacity.closureBound = fuel := by
        unfold commandClosureLimit? at limit
        simp only [selected, Bool.not_true, Bool.false_eq_true, ↓reduceIte] at limit
        split at limit <;> try contradiction
        simpa only [initialState, capacityAccepted, Option.map_some, Option.some.injEq] using limit
      simpa only [seed, ParallelScopeAcceptedStart.ready, fuelEq, stimulusCommandId] using
        seed.no_fuel_refusal program analysis admitted
    · obtain ⟨id, origin, output, initial, records, _, _, phase⟩ :=
        phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl
      exact False.elim (phase.not_notStarted program analysis selected _ seed.parent initial stable records control)
  · exact reachable.completion_no_fuel_refusal program analysis admitted stable stimulus completion committed fuel limit

/-- Accepted PMIS command closure has no fuel, selection or schedule failure; publication remains separate. -/
theorem ParallelScopeCommandBoundaryReachable.command_closure_successful
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program stable)
    (stimulus : Stimulus) (committed : (admitStimulus program stable stimulus).outcome = .committed)
    (fuel : Nat) (limit : commandClosureLimit? program stable stimulus = some fuel) :
    (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 []
      (admitStimulus program stable stimulus).state).failed = false := by
  exact reachable.command_success_of_no_fuel_refusal program analysis admitted stable stimulus committed fuel
    (reachable.command_no_fuel_refusal program analysis admitted stable stimulus committed fuel limit)

/-- Result-only evaluation commits at a stable frontier; successful trace and lifecycle publication are not assumed. -/
theorem ParallelScopeCommandBoundaryReachable.command_result_committed_and_stable
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program stable)
    (stimulus : Stimulus) (committed : (admitStimulus program stable stimulus).outcome = .committed)
    (fuel : Nat) (limit : commandClosureLimit? program stable stimulus = some fuel) :
    (applyStimulus fuel program stable stimulus).outcome = .committed ∧
      ((deriveInternalExecutionFrontier program (applyStimulus fuel program stable stimulus).state).offers.isEmpty &&
        !(deriveInternalExecutionFrontier program (applyStimulus fuel program stable stimulus).state).preparationFailed) = true := by
  have success := reachable.command_closure_successful program analysis admitted stable stimulus committed fuel limit
  simp only [ScheduledClosureResult.failed, Bool.or_eq_false_iff] at success
  have result : (applyStimulus fuel program stable stimulus).outcome = .committed := by
    simp [applyStimulus, committed, StimulusResult.ofScheduledClosure, StimulusResult.ofClosure,
      success.1.1, success.1.2, success.2]
  exact ⟨result, applyStimulus_committed_frontier_stable fuel program stable stimulus result⟩

/-- Accepted result-only commands commit at a stable frontier and every Running endpoint binds all occurrences to the admitted Program. -/
theorem ParallelScopeCommandBoundaryReachable.command_result_committed_stable_and_program_valid
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program stable)
    (stimulus : Stimulus) (committed : (admitStimulus program stable stimulus).outcome = .committed)
    (fuel : Nat) (limit : commandClosureLimit? program stable stimulus = some fuel) :
    (applyStimulus fuel program stable stimulus).outcome = .committed ∧
      ((deriveInternalExecutionFrontier program (applyStimulus fuel program stable stimulus).state).offers.isEmpty &&
        !(deriveInternalExecutionFrontier program (applyStimulus fuel program stable stimulus).state).preparationFailed) = true ∧
      ∀ instanceId, (applyStimulus fuel program stable stimulus).state.control = .running instanceId →
        flowNodeOccurrenceProgramValidity program (applyStimulus fuel program stable stimulus).state = true := by
  obtain ⟨result, frontier⟩ := reachable.command_result_committed_and_stable program analysis admitted
    stable stimulus committed fuel limit
  refine ⟨result, frontier, ?_⟩
  intro instanceId running
  exact (ParallelScopeCommandBoundaryReachable.command stable fuel stimulus reachable).program_valid
    program analysis admitted _ instanceId running

/-- Actual Running command results retain token positions and complete open-occurrence projection; trace and lifecycle-delta acceptance remain separate. -/
theorem ParallelScopeCommandBoundaryReachable.command_result_committed_stable_and_projectable
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program stable)
    (stimulus : Stimulus) (committed : (admitStimulus program stable stimulus).outcome = .committed)
    (fuel : Nat) (limit : commandClosureLimit? program stable stimulus = some fuel) :
    (applyStimulus fuel program stable stimulus).outcome = .committed ∧
      ((deriveInternalExecutionFrontier program (applyStimulus fuel program stable stimulus).state).offers.isEmpty &&
        !(deriveInternalExecutionFrontier program (applyStimulus fuel program stable stimulus).state).preparationFailed) = true ∧
      ∀ instanceId, (applyStimulus fuel program stable stimulus).state.control = .running instanceId →
        runtimePositionValid program instanceId (applyStimulus fuel program stable stimulus).state = true ∧
          ∃ opened, projectOpenFlowNodeOccurrences? program (applyStimulus fuel program stable stimulus).state = some opened := by
  obtain ⟨result, frontier⟩ := reachable.command_result_committed_and_stable program analysis admitted
    stable stimulus committed fuel limit
  refine ⟨result, frontier, ?_⟩
  intro instanceId running
  let endpoint := ParallelScopeCommandBoundaryReachable.command stable fuel stimulus reachable
  exact ⟨endpoint.runtime_position program analysis admitted _ instanceId running,
    endpoint.open_projection program analysis admitted _ instanceId running⟩

end BpmnSemantics.SemanticProcess

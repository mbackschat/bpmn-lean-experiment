import BpmnSemantics.SemanticProcess.ParallelScopeCommandClosureProofs

/-! # Parallel command scheduler success

Actual committed command provenance supplies discovery, selection and execution
readiness through terminal completion. Fuel sufficiency and complete publication
are separate obligations; this owner excludes the other scheduler failures.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

private theorem replayed_root_completion_scopes_empty
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (before after : RuntimeState) (record : InternalTransitionRecord)
    (kind : record.operationKind = .completeScope)
    (replayed : replayInternalOperationOccurrence? program before record = some after) :
    after.scopeOccurrences = [] := by
  obtain ⟨scopeId, output, _, member, _, _, completed⟩ :=
    replayed_scope_completion_execution program before after record kind replayed (ParallelScopeStart.analyzed_not_nested program analysis admitted)
        (ParallelScopeStart.analyzed_not_embedded_completion program analysis admitted)
  have allowed := analyzeProgram_operation_allowed program analysis admitted _ member
  have noOutput : output = none := by
    cases output <;> simp [SequentialScopeProgram.operationAllowed] at allowed ⊢
  subst output
  obtain ⟨unmonitored, unbounded⟩ := admitted_completion_unwrapped program analysis admitted scopeId
  rw [completeSelectedScope?, unmonitored,
    completeBoundedScope_eq_completeScope_of_unbounded program before scopeId none unbounded] at completed
  unfold completeScopeState? at completed
  split at completed <;> try contradiction
  split at completed <;> try contradiction
  unfold completeQuiescentScope? at completed
  all_goals repeat' split at completed
  all_goals first
    | contradiction
    | (cases Option.some.inj completed; rfl)

private theorem admitted_empty_scope_occurrences
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (empty : state.scopeOccurrences = [])
    (operation : SemanticOperation) (member : operation ∈ program.operations) :
    internalOperationOccurrences? program state operation.id = some [] := by
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  have keysUnique := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  have mappedUnique : ((program.operations.map (·.id)).map OperationId.value).Nodup := by
    simpa only [List.map_map, Function.comp_def] using keysUnique
  have unique : (program.operations.map (·.id)).Nodup :=
    List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
      (fun _ _ different same => different (congrArg OperationId.value same)) mappedUnique
  have declaration : program.operations.filter (·.id == operation.id) = [operation] := by
    simpa only [Bool.beq_eq_decide_eq] using
      filter_key_eq_singleton_of_nodup program.operations (·.id) operation unique member
  obtain ⟨_, _, _, ownership⟩ := programGraphWellFormed_scopeContract program
    (programWellFormed_graph program wellFormed)
  simp only [scopedOwnershipComplete, Bool.and_eq_true, decide_eq_true_eq] at ownership
  have keys := ownership.1.1
  have bindingsUnique : (program.operationScopes.map (·.operationId)).Nodup := by rw [keys]; exact unique
  have bound : operation.id ∈ program.operationScopes.map (·.operationId) := by
    rw [keys]
    exact List.mem_map.mpr ⟨operation, member, rfl⟩
  obtain ⟨binding, bindingMember, bindingId⟩ := List.mem_map.mp bound
  have bindingCensus : program.operationScopes.filter (·.operationId == operation.id) = [binding] := by
    simpa only [bindingId, Bool.beq_eq_decide_eq] using
      filter_key_eq_singleton_of_nodup program.operationScopes (·.operationId) binding bindingsUnique bindingMember
  simp [internalOperationOccurrences?, declaration, bindingCensus, empty, InternalCommutation.sortBy]

/-- Root completion removes every runtime scope, so admitted terminal discovery has no candidates. -/
theorem ParallelScopeInternalPrefixReachable.completed_execution_frontier_empty
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (completed : state.control = .completed instanceId) :
    deriveInternalExecutionFrontier program state = {} := by
  have selected : programSelected program = true := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" :=
    by simpa only [programSelected, beq_iff_eq] using selected
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis admitted state
  obtain phase := phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl
  have scopes : state.scopeOccurrences = [] := by
    rcases phase with ready | ⟨_, _, _, initial, records, _, _, phase⟩
    · have started := seed.started
      simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at started
      change _ = seed.ready at started
      have running : seed.ready.control = .running seed.instanceId := by rw [← started]; rfl
      rw [ready, running] at completed
      contradiction
    rcases phase with ⟨parents, _⟩ |
      ⟨before, issued, _, _, suffix, _, parents, _, _, _, entered, following⟩
    · rw [parents.running_control program analysis.entry seed.parent state] at completed
      contradiction
    rcases following with history | ⟨_, record, middle, _, _, kind, replayed, _, _⟩
    · have running := (history.control_frame program ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ selected issued state suffix).trans
        ((enterParallelScope_control_frame analysis.entry seed.parent before issued entered).trans
          (parents.running_control program analysis.entry seed.parent before))
      rw [running] at completed
      contradiction
    · exact replayed_root_completion_scopes_empty program analysis admitted middle state record kind replayed
  apply deriveInternalExecutionFrontier_empty
  intro operation member
  have occurrences := admitted_empty_scope_occurrences program analysis admitted state scopes operation member
  have allowed := List.all_eq_true.mp (analyzeProgram_incidence_admission program analysis admitted).2.2 operation member
  have offers : internalOperationOccurrenceOffers? program state operation = some [] := by
    cases operation <;> simp [programOperationAllowed, SequentialScopeProgram.operationAllowed] at allowed <;> try contradiction
    all_goals simp [internalOperationOccurrenceOffers?, occurrences]
  simp [completed, ordinaryExecutionFrontier, profile, offers]

/-- Actual command-prefix reachability makes discovery successful at Running and terminal endpoints. -/
theorem ParallelScopeInternalPrefixReachable.execution_discovery_successful_all
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state) :
    (deriveInternalExecutionFrontier program state).preparationFailed = false := by
  cases control : state.control with
  | running instanceId => exact reachable.execution_discovery_successful program analysis admitted state instanceId control
  | completed instanceId => rw [reachable.completed_execution_frontier_empty program analysis admitted state instanceId control]
  | cancelled instanceId => simp [deriveInternalExecutionFrontier, control]
  | failed instanceId failure => simp [deriveInternalExecutionFrontier, control]
  | notStarted =>
    have selected : programSelected program = true := by
      cases selection : programSelected program with
      | false => simp [analyzeProgram, selection] at admitted
      | true => rfl
    obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis admitted state
    obtain phase := phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl
    rcases phase with ready | ⟨_, _, _, initial, records, _, _, phase⟩
    · have started := seed.started
      simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at started
      change _ = seed.ready at started
      have running : seed.ready.control = .running seed.instanceId := by rw [← started]; rfl
      rw [ready, running] at control
      contradiction
    · exact False.elim (phase.not_notStarted program analysis selected _ seed.parent initial state records control)

private theorem closeScheduledTraced_parallelScope_nonfuel_success
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (commandId : SemanticId) (fuel index ordinal : Nat) (state : RuntimeState)
    (endpoint : ParallelScopeInternalPrefixReachable program
      (closeScheduledTraced fuel program commandId index ordinal [] state).state)
    (complete : ∀ nextOrdinal,
      (deriveInternalExecutionFrontier program (closeScheduledTraced fuel program commandId index ordinal [] state).state).offers ≠ [] →
      selectInternalExecutionFrontier program.internalSchedulingMode nextOrdinal []
        (deriveInternalExecutionFrontier program (closeScheduledTraced fuel program commandId index ordinal [] state).state) =
        .execute (deriveInternalExecutionFrontier program (closeScheduledTraced fuel program commandId index ordinal [] state).state).offers [] false)
    (within : (closeScheduledTraced fuel program commandId index ordinal [] state).hitBound = false) :
    (closeScheduledTraced fuel program commandId index ordinal [] state).failed = false := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  induction fuel using Nat.strongRecOn generalizing index ordinal state with
  | ind fuel ih =>
    generalize closedEq : closeScheduledTraced fuel program commandId index ordinal [] state = closed
      at endpoint complete within ⊢
    unfold closeScheduledTraced at closedEq
    dsimp only at closedEq
    split at closedEq
    · simp only [List.isEmpty_nil, ↓reduceIte] at closedEq
      cases closedEq
      rfl
    · rename_i unstable
      cases fuel with
      | zero => cases closedEq; contradiction
      | succ fuel =>
        simp only at closedEq
        split at closedEq
        · rename_i chosen
          cases closedEq
          have clean := endpoint.execution_discovery_successful_all program analysis admitted state
          have nonempty : (deriveInternalExecutionFrontier program state).offers ≠ [] := by
            intro empty
            simp [empty, clean] at unstable
          rw [complete ordinal nonempty] at chosen
          contradiction
        · rename_i failure chosen
          cases closedEq
          have clean := endpoint.execution_discovery_successful_all program analysis admitted state
          have nonempty : (deriveInternalExecutionFrontier program state).offers ≠ [] := by
            intro empty
            simp [empty, clean] at unstable
          rw [complete ordinal nonempty] at chosen
          contradiction
        · rename_i remaining consumed chosen
          cases closedEq
          have clean := endpoint.execution_discovery_successful_all program analysis admitted state
          have nonempty : (deriveInternalExecutionFrontier program state).offers ≠ [] := by
            intro empty
            simp [empty, clean] at unstable
          rw [complete ordinal nonempty] at chosen
          injection chosen with empty
          exact False.elim (nonempty empty)
        · rename_i first rest remaining consumed chosen
          split at closedEq
          · cases closedEq; contradiction
          · rename_i enough
            split at closedEq
            · rename_i refused
              cases closedEq
              have clean := endpoint.execution_discovery_successful_all program analysis admitted state
              have nonempty : (deriveInternalExecutionFrontier program state).offers ≠ [] := by
                intro empty
                simp [empty, clean] at unstable
              have allSelected := complete ordinal nonempty
              rw [allSelected] at chosen
              injection chosen with offersEq remainingEq consumedEq
              have present : first ∈ (deriveInternalExecutionFrontier program state).offers := by
                rw [offersEq]
                simp
              obtain ⟨candidate, _, applied, preparation⟩ :=
                deriveInternalExecutionFrontier_occurrence_sound program state profile first present
              have running : ∃ instanceId, state.control = .running instanceId := by
                cases control : state.control <;> simp [applyInternalOperationOccurrence?, control] at applied
                exact ⟨_, rfl⟩
              obtain ⟨instanceId, running⟩ := running
              cases reserved : (deriveInternalExecutionFrontier program state).occurrenceBatch with
              | none =>
                simp only [selectInternalExecutionFrontier, clean, reserved, Option.isSome_none,
                  Bool.false_eq_true, ↓reduceIte, offersEq, List.mapM_cons, preparation] at allSelected
                cases rest with
                | nil =>
                  change (match (deriveInternalExecutionFrontier program state).occurrenceBatch with
                    | some _ => _
                    | none => some (_ : InternalClosureStep)) = none at refused
                  rw [reserved] at refused
                  contradiction
                | cons next tail => contradiction
              | some batch =>
                have prepared := deriveInternalExecutionFrontier_batch_prepared program state batch reserved
                have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
                have unique := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
                have aligned := prepareInternalOccurrenceBatch_frontier_alternatives program state instanceId batch profile running unique prepared
                obtain ⟨_, absent, _⟩ := endpoint.start_certificate program analysis admitted state
                obtain ⟨successors, executed, count⟩ := preparedOccurrenceBatch_applies program state batch prepared wellFormed absent
                have inhabited : successors ≠ [] := by
                  have cardinality := congrArg List.length aligned
                  simp only [List.length_map, offersEq, List.length_cons] at cardinality
                  intro empty
                  simp only [empty, List.length_nil] at count
                  omega
                obtain ⟨step, ready, _⟩ := executeSelectedFrontier_reserved_batch_ready program commandId index state
                  (deriveInternalExecutionFrontier program state) (first :: rest) batch successors reserved
                  (by simpa only [offersEq] using aligned) executed inhabited
                rw [refused] at ready
                contradiction
            · rename_i step executed
              have normalization : consumed = false ∧ remaining = [] := by
                rcases selectInternalExecutionFrontier_consumption program.internalSchedulingMode ordinal []
                  (deriveInternalExecutionFrontier program state) (first :: rest) remaining consumed chosen with
                  ⟨_, unchanged⟩ | ⟨_, _, _, _, _, _, impossible, _⟩
                · exact ⟨‹consumed = false›, unchanged⟩
                · contradiction
              rcases normalization with ⟨rfl, rfl⟩
              simp only [Bool.false_eq_true, ↓reduceIte, Nat.add_zero] at closedEq
              let suffix := closeScheduledTraced (fuel - rest.length) program commandId
                (index + rest.length + 1) ordinal [] step.state
              have preserved : closed.state = (closeScheduledTraced (fuel - rest.length) program commandId
                  (index + rest.length + 1) ordinal [] step.state).state := by
                rw [← closedEq]
                change (if suffix.failed then suffix else { suffix with records := _, lifecycles := _ }).state = suffix.state
                split <;> rfl
              have suffixWithin : (closeScheduledTraced (fuel - rest.length) program commandId
                  (index + rest.length + 1) ordinal [] step.state).hitBound = false := by
                rw [← closedEq] at within
                change (if suffix.failed then suffix else { suffix with records := _, lifecycles := _ }).hitBound = false at within
                split at within <;> exact within
              have success := ih (fuel - rest.length) (Nat.lt_succ_of_le (Nat.sub_le _ _))
                (index + rest.length + 1) ordinal step.state
                (preserved ▸ endpoint) (by simpa only [preserved] using complete) suffixWithin
              rw [← closedEq]
              change (if suffix.failed then suffix else { suffix with records := _, lifecycles := _ }).failed = false
              split <;> simpa only [ScheduledClosureResult.failed] using success

/-- Actual committed Start, Human and Service ingress cannot fail for discovery, selection or execution reasons; the separate fuel bound remains explicit. -/
theorem ParallelScopeCommandBoundaryReachable.command_success_of_no_fuel_refusal
    (program : Program) (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable : RuntimeState) (reachable : ParallelScopeCommandBoundaryReachable program stable)
    (stimulus : Stimulus) (committed : (admitStimulus program stable stimulus).outcome = .committed)
    (fuel : Nat)
    (within : (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 []
      (admitStimulus program stable stimulus).state).hitBound = false) :
    (closeScheduledTraced fuel program (stimulusCommandId stimulus) 1 0 []
      (admitStimulus program stable stimulus).state).failed = false := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  obtain ⟨_, _, endpoint⟩ := applyStimulus_parallelScope_closure_prefix_reachable program profile
    stable stimulus fuel reachable committed
  apply closeScheduledTraced_parallelScope_nonfuel_success program analysis admitted (stimulusCommandId stimulus)
    fuel 1 0 (admitStimulus program stable stimulus).state endpoint ?_ within
  intro ordinal nonempty
  exact reachable.command_selection_total program analysis admitted stable stimulus committed fuel _ rfl nonempty ordinal []

end BpmnSemantics.SemanticProcess

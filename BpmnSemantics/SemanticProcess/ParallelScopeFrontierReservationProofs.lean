import BpmnSemantics.SemanticProcess.ParallelScopeTokenReadinessProofs

/-! # Complete frontier member reservation

PMIS-SELECT-01 reserves every discovered occurrence against one predecessor.
Discovery supplies actual native applications and bounds every partial cohort;
reservation totality must precede the independent collective acceptance checks.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay

private theorem mapM_flatten_member (values : List α) (project : α → Option (List β))
    (pieces : List (List β)) (mapped : values.mapM project = some pieces)
    (value : β) (member : value ∈ pieces.flatten) :
    ∃ input ∈ values, ∃ piece, project input = some piece ∧ value ∈ piece := by
  induction values generalizing pieces with
  | nil => simp at mapped; subst pieces; simp at member
  | cons first rest ih =>
      simp only [List.mapM_cons, bind] at mapped
      obtain ⟨head, found, mapped⟩ := Option.bind_eq_some_iff.mp mapped
      obtain ⟨tail, tailFound, returned⟩ := Option.bind_eq_some_iff.mp mapped
      cases Option.some.inj returned
      rcases List.mem_append.mp member with present | present
      · exact ⟨first, by simp, head, found, present⟩
      · obtain ⟨input, inputMember, piece, result, present⟩ := ih tail tailFound present
        exact ⟨input, by simp [inputMember], piece, result, present⟩

private theorem occurrence_offers_applied (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (offers : List (InternalOperationOccurrence × RuntimeState))
    (discovered : internalOperationOccurrenceOffers? program state operation = some offers)
    (pair : InternalOperationOccurrence × RuntimeState) (member : pair ∈ offers) :
    applyInternalOperationOccurrence? program state pair.1 = some pair.2 := by
  cases operation <;> simp only [internalOperationOccurrenceOffers?, bind] at discovered <;> try contradiction
  all_goals
    obtain ⟨candidates, _, discovered⟩ := Option.bind_eq_some_iff.mp discovered
    obtain ⟨pieces, mapped, returned⟩ := Option.bind_eq_some_iff.mp discovered
    cases Option.some.inj returned
    obtain ⟨candidate, _, piece, result, present⟩ := mapM_flatten_member candidates _ pieces mapped pair member
    cases applied : applyInternalOperationOccurrence? program state candidate with
    | none =>
        simp only [applied] at result
        split at result <;> try contradiction
        cases Option.some.inj result
        simp at present
    | some successor =>
        simp only [applied] at result
        cases Option.some.inj result
        cases List.mem_singleton.mp present
        exact applied

/-- Every retained occurrence offer carries its actual native successor, independently of reservation. -/
theorem deriveInternalOccurrenceFrontier_member_applied (program : Program) (state : RuntimeState)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (pair : InternalOperationOccurrence × RuntimeState) (member : pair ∈ pairs) :
    applyInternalOperationOccurrence? program state pair.1 = some pair.2 := by
  unfold deriveInternalOccurrenceFrontier? at discovered
  obtain ⟨pieces, mapped, returned⟩ := Option.bind_eq_some_iff.mp discovered
  cases Option.some.inj returned
  obtain ⟨operation, _, offers, result, present⟩ := mapM_flatten_member _ _ pieces mapped pair member
  exact occurrence_offers_applied program state operation offers result pair present

/-- Reachable native body work appends one reserved member at the cohort slot selected by the actual accumulator. -/
theorem ParallelScopeInternalPrefixReachable.ordinary_member_reserved (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (after : RuntimeState) (applied : applyInternalOperationOccurrence? program state candidate = some after)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (reserved : List InternalOccurrencePatch) (length : reserved.length ≤ pairs.length) :
    ∃ member, reserveOccurrenceMembers? program state reserved [candidate] = some (reserved ++ [member]) := by
  have valid := reachable.reservation_valid program analysis analyzed state
  have counters : occurrenceCounterRowsValid (state.activations.map fun row => (row.taskId.value, row.count)) = true ∧
      occurrenceCounterRowsValid (state.effectActivations.map fun row => (row.elementId.value, row.count)) = true := by
    simp only [occurrenceReservationStateValid, Bool.and_eq_true] at valid
    exact ⟨valid.1.1.1.1.1.1, valid.1.1.1.1.1.2⟩
  have inputs := (ordinary_operation_inputs_unit program state after candidate operation resolved kind applied).2
  cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
  case awaitUserTask id origin input output task =>
    have unit := inputs input (by simp [bodyConsumedPorts, SequentialScopeControl.inputs])
    obtain ⟨patch, prepared⟩ := reachable.human_cohort_reserved program analysis analyzed state instanceId running candidate
      id origin input output task resolved unit pairs discovered reserved length
    refine ⟨.arm patch, ?_⟩
    simp only [reserveOccurrenceMembers?, resolved, bind, Option.bind_some]
    change (Option.bind (if !occurrenceCounterRowsValid (state.activations.map fun row => (row.taskId.value, row.count)) then none
        else some ((((state.activations.map fun row => (row.taskId.value, row.count)).find? (·.1 == task.id.value)).map Prod.snd).getD 0)) (fun base => Option.bind (prepareReservedOccurrenceArm? program state candidate (base + reservedCohortSize reserved .userTask task.id.value + 1)) (fun created => some (reserved ++ [.arm created])))) = some (reserved ++ [.arm patch])
    simp only [activationCount] at prepared
    simp only [counters.1, Bool.not_true, Bool.false_eq_true, ↓reduceIte, Option.bind_some,
      taskActivationCount_string_lookup, prepared]
  case awaitEffect id origin input output effect route =>
    have unit := inputs input (by simp [bodyConsumedPorts, SequentialScopeControl.inputs])
    obtain ⟨patch, prepared⟩ := reachable.service_cohort_reserved program analysis analyzed state instanceId running candidate
      id origin input output effect route resolved unit pairs discovered reserved length
    refine ⟨.arm patch, ?_⟩
    simp only [reserveOccurrenceMembers?, resolved, bind, Option.bind_some]
    change (Option.bind (if !occurrenceCounterRowsValid (state.effectActivations.map fun row => (row.elementId.value, row.count)) then none
        else some ((((state.effectActivations.map fun row => (row.elementId.value, row.count)).find? (·.1 == effect.elementId.value)).map Prod.snd).getD 0)) (fun base => Option.bind (prepareReservedOccurrenceArm? program state candidate (base + reservedCohortSize reserved .effect effect.elementId.value + 1)) (fun created => some (reserved ++ [.arm created])))) = some (reserved ++ [.arm patch])
    simp only [counters.2, Bool.not_true, Bool.false_eq_true, ↓reduceIte, Option.bind_some,
      effectActivationCount_string_lookup, prepared]
  all_goals
    obtain ⟨patch, prepared⟩ := reachable.token_reserved program analysis analyzed state instanceId running candidate _ resolved
      (by simp [SemanticOperation.kind]) after applied
    refine ⟨.token patch, ?_⟩
    simp [reserveOccurrenceMembers?, resolved, prepared]

private theorem reserve_cons_of_singleton (program : Program) (state : RuntimeState)
    (reserved : List InternalOccurrencePatch) (candidate : InternalOperationOccurrence)
    (member : InternalOccurrencePatch) (rest : List InternalOperationOccurrence)
    (step : reserveOccurrenceMembers? program state reserved [candidate] = some (reserved ++ [member])) :
    reserveOccurrenceMembers? program state reserved (candidate :: rest) =
      reserveOccurrenceMembers? program state (reserved ++ [member]) rest := by
  simp only [reserveOccurrenceMembers?] at step ⊢
  obtain ⟨operation, resolved, step⟩ := Option.bind_eq_some_iff.mp step
  simp only [resolved, bind, Option.bind_some]
  cases operation
  case awaitUserTask id origin input output task =>
    obtain ⟨base, baseEq, step⟩ := Option.bind_eq_some_iff.mp step
    simp only [bind, Option.bind_some, Option.pure_def] at step
    obtain ⟨patch, prepared, step⟩ := Option.bind_eq_some_iff.mp step
    have same := Option.some.inj step
    simp only [baseEq, Option.bind_some, Option.pure_def, prepared, same]
  case awaitEffect id origin input output effect route =>
    obtain ⟨base, baseEq, step⟩ := Option.bind_eq_some_iff.mp step
    simp only [bind, Option.bind_some, Option.pure_def] at step
    obtain ⟨patch, prepared, step⟩ := Option.bind_eq_some_iff.mp step
    have same := Option.some.inj step
    simp only [baseEq, Option.bind_some, Option.pure_def, prepared, same]
  all_goals
    obtain ⟨created, prepared, step⟩ := Option.bind_eq_some_iff.mp step
    have same := Option.some.inj step
    simp only [prepared, Option.bind_some, same]

/-- A classified ordinary frontier reserves every candidate in order, with no successful-reservation premise. Collective batch acceptance is separate. -/
theorem ParallelScopeInternalPrefixReachable.ordinary_frontier_reserves (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (classified : ∀ pair ∈ pairs, ∀ operation,
      resolveInternalOperationOccurrence? program state pair.1 = some operation →
      operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]) :
    ∃ members, reserveOccurrenceMembers? program state [] (pairs.map Prod.fst) = some members ∧
      members.length = pairs.length := by
  have total (candidates : List InternalOperationOccurrence) (reserved : List InternalOccurrencePatch)
      (subset : ∀ candidate ∈ candidates, candidate ∈ pairs.map Prod.fst)
      (budget : reserved.length + candidates.length ≤ pairs.length) :
      ∃ members, reserveOccurrenceMembers? program state reserved candidates = some members := by
    induction candidates generalizing reserved with
    | nil => exact ⟨reserved, rfl⟩
    | cons candidate rest ih =>
        obtain ⟨pair, present, same⟩ := List.mem_map.mp (subset candidate (by simp))
        have applied := deriveInternalOccurrenceFrontier_member_applied program state pairs discovered pair present
        rw [same] at applied
        have executed := applied
        simp only [applyInternalOperationOccurrence?, running, bind] at executed
        obtain ⟨operation, resolved, _⟩ := Option.bind_eq_some_iff.mp executed
        have pairResolved : resolveInternalOperationOccurrence? program state pair.1 = some operation := by simpa only [same] using resolved
        have kind := classified pair present operation pairResolved
        obtain ⟨member, step⟩ := reachable.ordinary_member_reserved program analysis analyzed state instanceId running candidate operation resolved
          kind pair.2 applied pairs discovered reserved (by simp only [List.length_cons] at budget; omega)
        obtain ⟨members, tail⟩ := ih (reserved ++ [member])
          (fun next member => subset next (by simp [member])) (by simp only [List.length_append, List.length_cons, List.length_nil] at budget ⊢; omega)
        exact ⟨members, (reserve_cons_of_singleton program state reserved candidate member rest step).trans tail⟩
  obtain ⟨members, reserved⟩ := total (pairs.map Prod.fst) [] (fun _ member => member) (by simp)
  refine ⟨members, reserved, ?_⟩
  simpa using (reserveOccurrenceMembers_trace program state [] (pairs.map Prod.fst) members reserved).length
    program state [] members (pairs.map Prod.fst)

/-- The actual Start/phase population bounds discovery before any reservation succeeds. -/
theorem ParallelScopeInternalPrefixReachable.frontier_count (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs) : pairs.length ≤ 17408 := by
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis analyzed state
  rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with rfl |
    ⟨id, origin, output, initial, records, _, _, phase⟩
  · have raw := seed.started
    simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at raw
    have scopes := congrArg (fun current : RuntimeState => current.scopeOccurrences.length) raw
    change 1 = seed.ready.scopeOccurrences.length at scopes
    have count := deriveInternalOccurrenceFrontier_length_le_population program seed.ready pairs discovered
    rw [← scopes, Nat.mul_one] at count
    have operations := ParallelScopeStart.analyzeProgram_operation_count program analysis analyzed
    omega
  · exact phase.frontier_count program analysis analyzed _ seed.parent initial state records instanceId running pairs discovered

private theorem prepared_token_increment_le_one (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (patch : InternalOccurrenceTokenPatch)
    (prepared : prepareOccurrenceTokenPatch? program state candidate = some patch) : patch.endIncrement ≤ 1 := by
  cases control : state.control <;> simp only [prepareOccurrenceTokenPatch?, control] at prepared <;> try contradiction
  obtain ⟨operation, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
  cases operation <;> simp only [bind, Option.bind_none] at prepared <;> try contradiction
  case' duplicate => split at prepared <;> try contradiction
  case' synchronize => split at prepared <;> try contradiction
  all_goals
    simp only [Option.bind_some] at prepared
    split at prepared <;> try contradiction
    split at prepared <;> try contradiction
    obtain ⟨_, _, prepared⟩ := Option.bind_eq_some_iff.mp prepared
    cases Option.some.inj prepared
    simp

/-- Each reserved End contributes one unit; arms and Fork/Join contribute none. This bounds the aggregate independently of batch acceptance. -/
theorem reserved_members_end_sum_bound (program : Program) (state : RuntimeState)
    (candidates : List InternalOperationOccurrence) (members : List InternalOccurrencePatch)
    (reserved : reserveOccurrenceMembers? program state [] candidates = some members) :
    (members.map (·.endIncrement)).sum ≤ members.length := by
  have trace := reserveOccurrenceMembers_trace program state [] candidates members reserved
  have each : ∀ member ∈ members, member.endIncrement ≤ 1 := by
    intro member present
    cases member with
    | arm arm => change 0 ≤ 1; omega
    | token patch =>
        have prepared := (trace.token_prepared program state [] members candidates patch present).resolve_left (by simp)
        exact prepared_token_increment_le_one program state _ patch prepared
  have sumBound (values : List InternalOccurrencePatch)
      (bounded : ∀ member ∈ values, member.endIncrement ≤ 1) :
      (values.map (·.endIncrement)).sum ≤ values.length := by
    induction values with
    | nil => simp
    | cons head tail ih =>
        have headBound := bounded head (by simp)
        have tailBound := ih (fun member present => bounded member (by simp [present]))
        simp only [List.map_cons, List.sum_cons, List.length_cons]
        omega
  exact sumBound members each

/-- Successful member reservation already establishes every published wait ordinal's positivity and wire safety, before the batch's anchor-uniqueness check. -/
theorem reserved_members_wait_ordinals (program : Program) (state : RuntimeState)
    (candidates : List InternalOperationOccurrence) (members : List InternalOccurrencePatch)
    (reserved : reserveOccurrenceMembers? program state [] candidates = some members) :
    (members.filterMap (·.waitOccurrence?)).all (fun id =>
      0 < id.activation && SemanticProcessJson.isSafeWireNat id.activation) = true := by
  have trace := reserveOccurrenceMembers_trace program state [] candidates members reserved
  apply List.all_eq_true.mpr
  intro id present
  obtain ⟨member, memberPresent, projected⟩ := List.mem_filterMap.mp present
  cases member with
  | token patch => simp [InternalOccurrencePatch.waitOccurrence?] at projected
  | arm arm =>
      have same : arm.write.occurrence = id := Option.some.inj projected
      obtain ⟨positive, prepared⟩ := (trace.arm_prepared program state [] members candidates arm memberPresent).resolve_left (by simp)
      obtain ⟨_, _, _, _, _, safe, _⟩ := prepareReservedOccurrenceArm_gate_provenance program state _ _ arm prepared
      rw [← same]
      simp only [positive, decide_true, safe, Bool.true_and]

/-- Actual discovery and Start capacity close the collective End-counter gate once members have been reserved; pairwise collision and anchor checks remain independent. -/
theorem ParallelScopeInternalPrefixReachable.reserved_end_sum_safe (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (members : List InternalOccurrencePatch)
    (reserved : reserveOccurrenceMembers? program state [] (pairs.map Prod.fst) = some members) :
    SemanticProcessJson.isSafeWireNat (state.endOccurrences + (members.map (·.endIncrement)).sum) = true := by
  have native := reachable.native_end_counter_bound program analysis analyzed state
  have frontier := reachable.frontier_count program analysis analyzed state instanceId running pairs discovered
  have length := (reserveOccurrenceMembers_trace program state [] (pairs.map Prod.fst) members reserved).length
    program state [] members (pairs.map Prod.fst)
  have increments := reserved_members_end_sum_bound program state (pairs.map Prod.fst) members reserved
  simp only [List.length_nil, List.length_map, Nat.zero_add] at length
  change decide (_ ≤ (9007199254740991 : Nat)) = true
  apply decide_eq_true
  omega

end BpmnSemantics.SemanticProcess

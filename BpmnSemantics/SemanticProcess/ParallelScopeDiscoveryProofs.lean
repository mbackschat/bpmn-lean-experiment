import BpmnSemantics.SemanticProcess.ParallelScopeParentFrontierProofs
import BpmnSemantics.SemanticProcess.ParallelScopeInputMultiplicityProofs

/-! # Total discovery for reachable parallel scopes

PMIS-SELECT-01 must distinguish disabled work from failed discovery. Admission
and actual command provenance provide unique declarations and live owners;
reachable wait readiness supplies native arming when an input token is present.
This does not assume successful reservation of the complete frontier.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

/-- Actual Start and entry create unique live scope identities; later command history only removes scopes. -/
theorem ParallelScopeInternalPrefixReachable.scope_identities_unique (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId) :
    (state.scopeOccurrences.map (·.id)).Nodup := by
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis admitted state
  let observer : ScopeOccurrenceId := ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩
  rcases phases observer rfl with rfl | ⟨_, _, _, _, _, _, _, phase⟩
  · have started := seed.started
    simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at started
    change _ = seed.ready at started
    rw [← started]
    simp
  rcases phase with ⟨parents, _⟩ |
    ⟨before, issued, _, _, suffix, _, parents, _, _, _, entered, later⟩
  · rw [(parents.clean_and_foreign_marking program analysis.entry seed.parent state).1.1]
    simp
  rcases later with history | ⟨_, _, _, _, _, _, _, ⟨_, completed⟩, _⟩
  · have unique : (before.scopeOccurrences.map (·.id)).Nodup := by
      rw [(parents.clean_and_foreign_marking program analysis.entry seed.parent before).1.1]
      simp
    have issuedUnique := enterParallelScope_preserves_scope_uniqueness entered unique
    have selected : programSelected program = true := by
      cases selection : programSelected program with
      | false => simp [analyzeProgram, selection] at admitted
      | true => rfl
    exact ((history.scopeOccurrences_sublist program observer selected issued state suffix).map (·.id)).nodup issuedUnique
  · rw [running] at completed
    cases completed

/-- Admission and reachable scope uniqueness make occurrence enumeration total, including empty owner populations. -/
theorem ParallelScopeInternalPrefixReachable.operation_occurrences_total (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (operation : SemanticOperation) (member : operation ∈ program.operations) :
    ∃ candidates, internalOperationOccurrences? program state operation.id = some candidates ∧
      ∀ candidate ∈ candidates, resolveInternalOperationOccurrence? program state candidate = some operation := by
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  have keysUnique := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  have mappedUnique : ((program.operations.map (·.id)).map OperationId.value).Nodup := by
    simpa only [List.map_map, Function.comp_def] using keysUnique
  have unique : (program.operations.map (·.id)).Nodup :=
    List.Pairwise.of_map (S := (· ≠ ·)) OperationId.value
      (fun _ _ different same => different (congrArg OperationId.value same))
      mappedUnique
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
  have scopes := reachable.scope_identities_unique program analysis admitted state instanceId running
  have rawUnique := (List.filter_sublist (p := fun owner : ScopeOccurrenceId => owner.definitionScopeId == binding.scopeId)).nodup scopes
  have ownersUnique := (sortBy_permutation InternalCommutation.scopeBefore _).nodup_iff.mpr rawUnique
  let owners := InternalCommutation.sortBy InternalCommutation.scopeBefore ((state.scopeOccurrences.map (·.id)).filter (·.definitionScopeId == binding.scopeId))
  let candidates := owners.map (fun owner => InternalOperationOccurrence.mk operation.id owner)
  have discovered : internalOperationOccurrences? program state operation.id = some candidates := by
    simp only [internalOperationOccurrences?, declaration, bindingCensus, ownersUnique, ↓reduceIte]
    rfl
  refine ⟨candidates, discovered, ?_⟩
  intro candidate present
  obtain ⟨owner, _, identity⟩ := List.mem_map.mp present
  cases identity
  have found : program.operations.find? (·.id == operation.id) = some operation := by
    rw [← List.head?_filter, declaration]
    rfl
  simpa only [resolveInternalOperationOccurrence?, discovered, bind, Option.bind_some,
    List.contains_iff_mem.mpr present, ↓reduceIte] using found

/-- Native Human arming succeeds at every reachable unit input, in either the parent or a repeated child. -/
theorem ParallelScopeInternalPrefixReachable.human_unit_enabled (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (task : UserTaskDefinition)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitUserTask id origin input output task))
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1) :
    ∃ after, applyInternalOperationOccurrence? program state candidate = some after := by
  obtain ⟨patch, prepared⟩ := reachable.human_reserved program analysis admitted state instanceId running candidate id origin input output task resolved unit
  obtain ⟨_, operation, _, _, _, safe, actual, _, _, scopeReady, _⟩ :=
    prepareReservedOccurrenceArm_gate_provenance program state candidate (activationCount state task.id + 1) patch prepared
  rw [resolved] at actual
  cases Option.some.inj actual
  have valid := reachable.reservation_valid program analysis admitted state
  have noOverlap : (hasParallelScopeDefinition program candidate.owner && hasSequentialScopeDefinition program candidate.owner) = false := by
    cases parallel : hasParallelScopeDefinition program candidate.owner with
    | false => rfl
    | true => rw [(scopeReady parallel).1]; rfl
  simp only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some,
    unit, beq_self_eq_true, Bool.not_true, valid, safe, noOverlap, Bool.false_or, Bool.false_eq_true, ↓reduceIte]
  cases parallel : hasParallelScopeDefinition program candidate.owner with
  | false => simp
  | true =>
    obtain ⟨_, values, evaluated⟩ := scopeReady parallel
    simp only [evaluated, Option.bind_some]
    exact ⟨_, rfl⟩

/-- Native Service arming uses the actual evaluated arguments retained by reachable reservation readiness. -/
theorem ParallelScopeInternalPrefixReachable.service_unit_enabled (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (id : OperationId) (origin : BpmnElementOrigin)
    (input output : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some (.awaitEffect id origin input output effect route))
    (unit : (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1) :
    ∃ after, applyInternalOperationOccurrence? program state candidate = some after := by
  obtain ⟨patch, prepared⟩ := reachable.service_reserved program analysis admitted state instanceId running candidate id origin input output effect route resolved unit
  obtain ⟨_, operation, _, _, _, safe, actual, _, _, scopeReady, _, _, _, shape, _⟩ :=
    prepareReservedOccurrenceArm_gate_provenance program state candidate (effectActivationCount state effect.elementId + 1) patch prepared
  rw [resolved] at actual
  cases Option.some.inj actual
  obtain ⟨arguments, evaluated, _⟩ := shape
  have valid := reachable.reservation_valid program analysis admitted state
  have noOverlap : (hasParallelScopeDefinition program candidate.owner && hasSequentialScopeDefinition program candidate.owner) = false := by
    cases parallel : hasParallelScopeDefinition program candidate.owner with
    | false => rfl
    | true => rw [(scopeReady parallel).1]; rfl
  simp only [applyInternalOperationOccurrence?, running, resolved, bind, Option.bind_some,
    unit, beq_self_eq_true, Bool.not_true, valid, safe, noOverlap, Bool.false_or, Bool.false_eq_true, ↓reduceIte]
  cases parallel : hasParallelScopeDefinition program candidate.owner <;>
    simp only [parallel, Bool.false_eq_true, ↓reduceIte] at evaluated ⊢ <;>
    exact ⟨_, by rw [evaluated]; rfl⟩

private theorem candidate_steps_total (program : Program) (state : RuntimeState)
    (candidates : List InternalOperationOccurrence) (enabled : InternalOperationOccurrence → Bool)
    (ready : ∀ candidate ∈ candidates, enabled candidate = true →
      ∃ after, applyInternalOperationOccurrence? program state candidate = some after) :
    ∃ chunks, candidates.mapM (fun candidate =>
      match applyInternalOperationOccurrence? program state candidate with
      | some after => some [(candidate, after)]
      | none => if enabled candidate then none else some []) = some chunks := by
  apply InternalCommutation.mapM_total
  intro candidate member
  cases applied : applyInternalOperationOccurrence? program state candidate with
  | some after => exact ⟨_, rfl⟩
  | none =>
    cases active : enabled candidate with
    | false => exact ⟨[], rfl⟩
    | true =>
      obtain ⟨after, enabledStep⟩ := ready candidate member active
      rw [applied] at enabledStep
      contradiction

/-- The only remaining wait-discovery premise is reachable input multiplicity; declaration, owner, data, ordinal and reservation gates are derived. -/
theorem ParallelScopeInternalPrefixReachable.operation_offers_from_input_bound (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (bounded : ∀ candidate operation input,
      resolveInternalOperationOccurrence? program state candidate = some operation →
      operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect] →
      internalArmInput? operation = some input →
      (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length ≤ 1)
    (operation : SemanticOperation) (member : operation ∈ program.operations) :
    ∃ pairs, internalOperationOccurrenceOffers? program state operation = some pairs := by
  obtain ⟨candidates, discovered, resolutions⟩ := reachable.operation_occurrences_total
    program analysis admitted state instanceId running operation member
  let enabled := fun candidate : InternalOperationOccurrence => match operation with
    | .awaitUserTask _ _ input .. | .awaitEffect _ _ input .. =>
      state.tokens.any fun token => token.placeId == input && token.owner == candidate.owner
    | _ => false
  have ready : ∀ candidate ∈ candidates, enabled candidate = true →
      ∃ after, applyInternalOperationOccurrence? program state candidate = some after := by
    intro candidate present active
    have resolved := resolutions candidate present
    have unit (input : ControlPlaceId)
        (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect])
        (inputEq : internalArmInput? operation = some input)
        (active : state.tokens.any (fun token => token.placeId == input && token.owner == candidate.owner) = true) :
        (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1 := by
      have upper := bounded candidate operation input resolved kind inputEq
      obtain ⟨token, member, included⟩ := List.any_eq_true.mp active
      have positive : 0 < (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length :=
        List.length_pos_iff_exists_mem.mpr ⟨token, List.mem_filter.mpr ⟨member, included⟩⟩
      omega
    cases operation <;> simp only [enabled] at active <;> try contradiction
    case awaitUserTask id origin input output task =>
      exact reachable.human_unit_enabled program analysis admitted state instanceId running candidate id origin
        input output task resolved (unit input (by simp [SemanticOperation.kind]) rfl active)
    case awaitEffect id origin input output effect route =>
      exact reachable.service_unit_enabled program analysis admitted state instanceId running candidate id origin
        input output effect route resolved (unit input (by simp [SemanticOperation.kind]) rfl active)
  obtain ⟨chunks, mapped⟩ := candidate_steps_total program state candidates enabled ready
  have allowed := List.all_eq_true.mp (analyzeProgram_incidence_admission program analysis admitted).2.2 operation member
  refine ⟨chunks.flatten, ?_⟩
  cases operation <;> simp [programOperationAllowed, SequentialScopeProgram.operationAllowed] at allowed <;> try contradiction
  all_goals
    simp only [enabled, Bool.false_eq_true, ↓reduceIte] at mapped
    simp only [internalOperationOccurrenceOffers?, discovered, bind, Option.bind_some,
      Bool.false_eq_true, ↓reduceIte]
    apply Option.bind_eq_some_iff.mpr
    refine ⟨chunks, ?_, rfl⟩
    refine Eq.trans ?_ mapped
    apply congrArg (fun project : InternalOperationOccurrence → Option (List (InternalOperationOccurrence × RuntimeState)) =>
      candidates.mapM project)
    funext candidate
    cases applyInternalOperationOccurrence? program state candidate <;> rfl

/-- Complete raw frontier discovery is total once reachable wait inputs are bounded; disabled candidates remain absent rather than becoming infrastructure failures. -/
theorem ParallelScopeInternalPrefixReachable.frontier_discovery_from_input_bound (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (bounded : ∀ candidate operation input,
      resolveInternalOperationOccurrence? program state candidate = some operation →
      operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect] →
      internalArmInput? operation = some input →
      (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length ≤ 1) :
    ∃ pairs, deriveInternalOccurrenceFrontier? program state = some pairs := by
  obtain ⟨chunks, mapped⟩ := InternalCommutation.mapM_total
    (InternalCommutation.sortBy (fun left right : SemanticOperation => left.id.value < right.id.value) program.operations)
    (internalOperationOccurrenceOffers? program state) (by
      intro operation member
      exact reachable.operation_offers_from_input_bound program analysis admitted state instanceId running bounded
        operation ((mem_sortBy _ _ _).mp member))
  exact ⟨chunks.flatten, by simp only [deriveInternalOccurrenceFrontier?, mapped, bind, Option.bind_some, pure]⟩

/-- Admission and actual command-prefix reachability suffice for complete discovery, without assuming enabledness, unit inputs or successful preparation. -/
theorem ParallelScopeInternalPrefixReachable.frontier_discovery_total (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId) :
    ∃ pairs, deriveInternalOccurrenceFrontier? program state = some pairs := by
  apply reachable.frontier_discovery_from_input_bound program analysis admitted state instanceId running
  intro candidate operation input resolved kind inputEq
  apply reachable.wait_input_multiplicity_le_one program analysis admitted state instanceId running
    candidate operation resolved kind input
  cases operation <;> simp [SemanticOperation.kind] at kind <;>
    simp_all [internalArmInput?, bodyConsumedPorts, SequentialScopeControl.inputs]

end BpmnSemantics.SemanticProcess

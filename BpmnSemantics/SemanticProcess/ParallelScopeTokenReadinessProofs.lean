module

public import BpmnSemantics.SemanticProcess.ParallelScopeWaitReservationProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeTokenPositionProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeFrontierClassificationProofs
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
import all BpmnSemantics.SemanticProcess.ParallelScopeData

/-! # Reachable token-control readiness

PMIS-SELECT-01 token reservation must preserve safe token multiplicity before
constructing a patch. Actual native enabledness supplies unit input buckets;
the admitted acyclic body's lifetime accounting supplies empty output buckets.
Neither fact assumes successful batch preparation or publication.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay

theorem ordinary_operation_inputs_unit (program : Program) (before after : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program before candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    (∃ input, input ∈ bodyConsumedPorts operation) ∧
      ∀ input ∈ bodyConsumedPorts operation,
        (before.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length = 1 := by
  cases control : before.control <;>
    simp only [applyInternalOperationOccurrence?, control, bind] at applied <;> try contradiction
  cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
  all_goals simp only [resolved, Option.bind_some] at applied
  case awaitUserTask id origin input output task =>
    split at applied <;> try contradiction
    rename_i valid
    simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at valid
    have unit := congrArg Bool.not valid.1.1.1
    simp only [Bool.not_not, Bool.not_false, beq_iff_eq] at unit
    refine ⟨⟨input, by simp [bodyConsumedPorts, SequentialScopeControl.inputs]⟩, ?_⟩
    simpa only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton, forall_eq] using unit
  case awaitEffect id origin input output effect route =>
    split at applied <;> try contradiction
    rename_i valid
    simp only [Bool.or_eq_true, Bool.not_eq_true, not_or] at valid
    have unit := congrArg Bool.not valid.1.1.1
    simp only [Bool.not_not, Bool.not_false, beq_iff_eq] at unit
    refine ⟨⟨input, by simp [bodyConsumedPorts, SequentialScopeControl.inputs]⟩, ?_⟩
    simpa only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton, forall_eq] using unit
  case duplicate id origin input outputs =>
    split at applied <;> try contradiction
    rename_i unit
    refine ⟨⟨input, by simp [bodyConsumedPorts, SequentialScopeControl.inputs]⟩, ?_⟩
    simpa only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton, forall_eq, beq_iff_eq] using unit
  case reachNoneEnd id origin input =>
    split at applied <;> try contradiction
    rename_i unit
    refine ⟨⟨input, by simp [bodyConsumedPorts, SequentialScopeControl.inputs]⟩, ?_⟩
    simpa only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton, forall_eq, beq_iff_eq] using unit
  case synchronize id origin inputs output =>
    split at applied <;> try contradiction
    rename_i valid
    simp only [Bool.and_eq_true, decide_eq_true_eq, List.all_eq_true, beq_iff_eq] at valid
    refine ⟨?_, valid.2⟩
    cases inputs with
    | nil => simp at valid
    | cons input rest => exact ⟨input, by simp [bodyConsumedPorts, SequentialScopeControl.inputs]⟩

/-- A reachable child firing has no token or blocked-wait credit on any output flow before it fires. -/
theorem ParallelScopeInternalPrefixReachable.child_outputs_empty (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (child : candidate.owner.definitionScopeId = analysis.entry.childScopeId)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (after : RuntimeState) (applied : applyInternalOperationOccurrence? program state candidate = some after) :
    ∀ place ∈ program.controlPlaces, place.id ∈ operationOutputs operation →
      continuationMarking state candidate.owner place.id = 0 := by
  have selected : ParallelScopeStart.programSelected program = true := by
    cases chosen : ParallelScopeStart.programSelected program with
    | false => simp [ParallelScopeStart.analyzeProgram, chosen] at analyzed
    | true => rfl
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    simpa only [ParallelScopeStart.programSelected, beq_iff_eq] using selected
  obtain ⟨actual, actualResolved, _, replayed⟩ :=
    applyInternalOperationOccurrence_replay_record program state after candidate profile applied
  rw [resolved] at actualResolved
  cases Option.some.inj actualResolved
  have unique := resolved_operation_unique program state candidate operation resolved
  have live := resolved_exactLiveOccurrence program state candidate operation resolved
  have count : (state.scopeOccurrences.filter (fun scope => decide (scope.id = candidate.owner))).length = 1 := of_decide_eq_true live
  obtain ⟨scope, census⟩ := List.length_eq_one_iff.mp count
  have member := List.mem_filter.mp (census.symm ▸ List.mem_singleton_self scope)
  have present : ∃ occurrence ∈ state.scopeOccurrences, occurrence.id = candidate.owner :=
    ⟨scope, member.1, of_decide_eq_true member.2⟩
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis analyzed state
  have distinct := ParallelScopeStart.analyzeProgram_child_root_distinct program analysis analyzed seed.root seed.rootSelected
  have noChild (current : RuntimeState) (census : current.scopeOccurrences = [⟨seed.parent, none⟩])
      (represented : ∃ occurrence ∈ current.scopeOccurrences, occurrence.id = candidate.owner) : False := by
    obtain ⟨occurrence, member, same⟩ := represented
    rw [census] at member
    cases List.mem_singleton.mp member
    exact distinct (child.symm.trans (congrArg ScopeOccurrenceId.definitionScopeId same.symm))
  rcases phases candidate.owner child with rfl | ⟨id, origin, output, initial, records, _, _, phase⟩
  · have raw := seed.started
    simp only [runningProgramStartState?, seed.rootSelected, bind, Option.bind_some, pure, Option.some.injEq] at raw
    change _ = seed.ready at raw
    exact False.elim (noChild seed.ready (by rw [← raw]; rfl) present)
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, prior, entryRecord, suffix, _, parents, _, _, _, entered, later⟩
  · exact False.elim (noChild state (parents.clean_and_foreign_marking program analysis.entry seed.parent state).1.1 present)
  rcases later with history | terminal
  · obtain ⟨found, lookup, empty⟩ := history.enabled_body_outputs_empty program analysis analyzed candidate.owner seed.parent selected
      before issued state after child parents entered suffix
      { operationId := candidate.operationId, operationKind := operation.kind,
        origin := operation.origin, owner := candidate.owner, mergeInput := none }
      rfl kind replayed
    rw [← List.head?_filter, unique] at lookup
    cases Option.some.inj lookup
    exact empty
  · obtain ⟨_, _, _, _, _, _, _, ⟨terminalId, completed⟩, _⟩ := terminal
    rw [running] at completed
    contradiction

theorem ParallelScopeInternalPrefixReachable.native_end_counter_bound (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state) :
    state.endOccurrences < 16400 := by
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis analyzed state
  rcases phases ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩ rfl with rfl |
    ⟨id, origin, output, initial, records, declared, initiated, phase⟩
  · have zero := (runningProgramStartState_native_counters program seed.instanceId seed.values seed.ready seed.started).2.2
    simp [zero]
  · obtain ⟨_, _, bound, ceiling⟩ := phase.native_counters_below_start_capacity program analysis analyzed
      _ seed.parent seed.instanceId seed.values seed.root seed.ready initial id origin output declared seed.rootSelected
      rfl seed.started initiated state records seed.capacity seed.capacityAccepted ⟨""⟩ ⟨""⟩
    omega

theorem ParallelScopeInternalPrefixReachable.native_end_increment_safe (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state) :
    SemanticProcessJson.isSafeWireNat (state.endOccurrences + 1) = true := by
  have bounded := reachable.native_end_counter_bound program analysis analyzed state
  change decide (_ ≤ (9007199254740991 : Nat)) = true
  apply decide_eq_true
  omega

private theorem token_operation_ports (program : Program) (operation : SemanticOperation)
    (wellFormed : programWellFormed program = true) (member : operation ∈ program.operations)
    (kind : operation.kind ∈ [SemanticOperationKind.duplicate, .synchronize, .reachNoneEnd]) :
    operation.origin.elementId.value.isEmpty = false ∧
      (bodyConsumedPorts operation).Nodup ∧ (operationOutputs operation).Nodup ∧
      (∀ port ∈ operationOutputs operation, ∃ place ∈ program.controlPlaces, place.id = port) ∧
      (operation.kind = .duplicate → operationOutputs operation ≠ []) ∧
      (operation.kind = .synchronize → bodyConsumedPorts operation ≠ []) := by
  have valid := List.all_eq_true.mp (programWellFormed_operations program wellFormed) operation member
  have unique (ports : List ControlPlaceId) (sorted : strictlySortedStrings (ports.map (·.value)) = true) : ports.Nodup :=
    List.Pairwise.of_map (S := (· ≠ ·)) ControlPlaceId.value
      (fun _ _ different same => different (congrArg ControlPlaceId.value same))
      (strictlySortedStrings_nodup _ sorted)
  cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
  all_goals simp only [operationWellFormed, Bool.and_eq_true] at valid
  case duplicate id origin input outputs =>
    have named : origin.elementId.value.isEmpty = false := by simpa [nonempty] using valid.1.1.1.1.2
    have length : 2 ≤ outputs.length := of_decide_eq_true valid.1.1.2
    refine ⟨named, by simp [bodyConsumedPorts, SequentialScopeControl.inputs], unique outputs valid.1.2, ?_, ?_, ?_⟩
    · intro port output
      simpa only [beq_iff_eq, decide_eq_true_eq] using List.any_eq_true.mp (List.all_eq_true.mp valid.2 port output)
    · intro _ empty; change outputs = [] at empty; simp [empty] at length
    · simp [SemanticOperation.kind]
  case synchronize id origin inputs output =>
    have named : origin.elementId.value.isEmpty = false := by simpa [nonempty] using valid.1.1.1.1.2
    have length : 2 ≤ inputs.length := of_decide_eq_true valid.1.1.1.2
    refine ⟨named, unique inputs valid.1.1.2, by simp [operationOutputs], ?_, ?_, ?_⟩
    · intro port outputMember
      have same : port = output := by simpa [operationOutputs] using outputMember
      subst port
      simpa only [beq_iff_eq, decide_eq_true_eq] using List.any_eq_true.mp valid.2
    · simp [SemanticOperation.kind]
    · intro _ empty; change inputs = [] at empty; simp [empty] at length
  case reachNoneEnd id origin input =>
    have named : origin.elementId.value.isEmpty = false := by simpa [nonempty] using valid.1.2
    exact ⟨named, by simp [bodyConsumedPorts, SequentialScopeControl.inputs], by simp [operationOutputs],
      by simp [operationOutputs], by simp [SemanticOperation.kind], by simp [SemanticOperation.kind]⟩

private theorem empty_marking_empty_bucket (state : RuntimeState) (owner : ScopeOccurrenceId)
    (place : ControlPlaceId) (empty : continuationMarking state owner place = 0) :
    (state.tokens.filter fun token => token.placeId == place && token.owner == owner).length = 0 := by
  have reordered : state.tokens.filter (fun token => token.owner == owner && token.placeId == place) =
      state.tokens.filter (fun token => token.placeId == place && token.owner == owner) := by simp only [Bool.and_comm]
  simp only [continuationMarking, reordered] at empty
  omega

/-- Native enabledness in an actual prefix is sufficient for Fork/Join/End reservation. Admission excludes parent Fork/Join; history checks static provenance and pre/post token bucket bounds. -/
theorem ParallelScopeInternalPrefixReachable.token_reserved (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.duplicate, .synchronize, .reachNoneEnd])
    (after : RuntimeState) (applied : applyInternalOperationOccurrence? program state candidate = some after) :
    ∃ patch, prepareOccurrenceTokenPatch? program state candidate = some patch := by
  have wellFormed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis analyzed).1
  have declared := (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).1
  have bodyKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] :=
    List.mem_cons_of_mem _ (List.mem_cons_of_mem _ kind)
  obtain ⟨⟨input, inputMember⟩, unit⟩ := ordinary_operation_inputs_unit program state after candidate operation resolved bodyKind applied
  obtain ⟨hosting, _, _, _, _, time, ancestry, _, _⟩ := reachable_reservation_frame
    program analysis analyzed state reachable instanceId running candidate operation resolved input (unit input inputMember) (fun _ => false)
  have childOrEnd : candidate.owner.definitionScopeId = analysis.entry.childScopeId ∨ operation.kind = .reachNoneEnd := by
    by_cases terminal : operation.kind = .reachNoneEnd
    · exact Or.inr terminal
    · exact Or.inl (ParallelScopeStart.resolved_fork_join_child program analysis analyzed state candidate operation resolved ancestry
        (by simpa [terminal] using kind))
  obtain ⟨named, consumedUnique, producedUnique, outputDeclared, forkNonempty, joinNonempty⟩ :=
    token_operation_ports program operation wellFormed declared kind
  have empty : ∀ port ∈ operationOutputs operation,
      (state.tokens.filter fun token => token.placeId == port && token.owner == candidate.owner).length = 0 := by
    intro port output
    rcases childOrEnd with child | terminal
    · obtain ⟨place, member, same⟩ := outputDeclared port output
      have zero := reachable.child_outputs_empty program analysis analyzed state instanceId running candidate operation resolved child bodyKind after applied
        place member (by simpa only [same] using output)
      exact empty_marking_empty_bucket state candidate.owner port (same ▸ zero)
    · cases operation <;> simp only [SemanticOperation.kind] at terminal <;> try contradiction
  have buckets : (bodyConsumedPorts operation ++ operationOutputs operation).all (fun place =>
      let count := (state.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length
      SemanticProcessJson.isSafeWireNat count &&
        SemanticProcessJson.isSafeWireNat (count - (bodyConsumedPorts operation).count place + (operationOutputs operation).count place)) = true := by
    apply List.all_eq_true.mpr
    intro place member
    have bounded : (state.tokens.filter fun token => token.placeId == place && token.owner == candidate.owner).length ≤ 1 := by
      rcases List.mem_append.mp member with consumed | produced
      · rw [unit place consumed]
        omega
      · rw [empty place produced]; omega
    have produced := List.nodup_iff_count.mp producedUnique place
    simp only [Bool.and_eq_true]
    constructor
    all_goals change decide (_ ≤ (9007199254740991 : Nat)) = true
    all_goals apply decide_eq_true; omega
  have sameScope : operationControlPlacesShareOwner operation = true := by
    cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
    all_goals rfl
  have ports : ∀ place ∈ bodyConsumedPorts operation ++ operationOutputs operation, place ∈ operationControlPlaces operation := by
    cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
    all_goals exact fun _ member => member
  obtain ⟨delta, position⟩ := ParallelScopeStart.resolved_token_patch_has_position_delta program analysis analyzed state candidate operation
    { owner := candidate.owner, consumed := bodyConsumedPorts operation, produced := operationOutputs operation }
    resolved sameScope rfl ports
  have exactSelection := resolved_exactProgramSelection program state candidate operation wellFormed resolved
  have live := resolved_exactLiveOccurrence program state candidate operation resolved
  have endSafe := reachable.native_end_increment_safe program analysis analyzed state
  have units : (bodyConsumedPorts operation).all (fun input =>
      (state.tokens.filter fun token => token.placeId == input && token.owner == candidate.owner).length == 1) = true := by
    simpa only [List.all_eq_true, beq_iff_eq] using unit
  cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
  all_goals simp only [bodyConsumedPorts, SequentialScopeControl.inputs, operationOutputs] at consumedUnique producedUnique buckets position units forkNonempty joinNonempty
  all_goals simp at named units buckets
  case duplicate id origin input outputs =>
    have notEmpty : outputs ≠ [] := forkNonempty rfl
    refine ⟨⟨.duplicate id origin input outputs, ⟨candidate.owner, [input], outputs⟩, 0⟩, ?_⟩
    simp [prepareOccurrenceTokenPatch?, running, resolved, notEmpty, hosting, live, exactSelection, named, time, ancestry,
      producedUnique, units, position]
    simpa only [units, Nat.sub_self, Nat.zero_add] using buckets
  case synchronize id origin inputs output =>
    have notEmpty : inputs ≠ [] := joinNonempty rfl
    refine ⟨⟨.synchronize id origin inputs output, ⟨candidate.owner, inputs, [output]⟩, 0⟩, ?_⟩
    simp [prepareOccurrenceTokenPatch?, running, resolved, notEmpty, hosting, live, exactSelection, named, time, ancestry,
      consumedUnique, buckets, position]
    exact ⟨units, buckets.1⟩
  case reachNoneEnd id origin input =>
    refine ⟨⟨.reachNoneEnd id origin input, ⟨candidate.owner, [input], []⟩, 1⟩, ?_⟩
    simp [prepareOccurrenceTokenPatch?, running, resolved, hosting, live, exactSelection, named, time, ancestry,
      producedUnique, units, position, endSafe]
    simpa only [units, Nat.sub_self] using buckets

end BpmnSemantics.SemanticProcess

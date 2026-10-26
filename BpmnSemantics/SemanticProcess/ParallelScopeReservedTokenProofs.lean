module

import BpmnSemantics.SemanticProcess.ParallelScopeFrontierReservationProofs
import BpmnSemantics.SemanticProcess.ParallelScopeBatchIdentityProofs
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
public import BpmnSemantics.SemanticProcess.ParallelScopeFinalRetirement
import BpmnSemantics.SemanticProcess.InternalTransitionAlternativeOrder
import BpmnSemantics.SemanticProcess.ParallelScopeFrontierClassificationProofs
import BpmnSemantics.SemanticProcess.ParallelScopeFrontierCorrespondenceProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReservationSelectionProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReservedArmingReplay
import BpmnSemantics.SemanticProcess.ParallelScopeTokenReadinessProofs
import BpmnSemantics.SemanticProcess.ParallelScopeWaitReservationProofs
import BpmnSemantics.SemanticProcess.StructuredCompositionAdmissionProofs

/-! # Disjoint token keys of reserved parallel members

PMIS-SELECT-01 separates different owners by their complete occurrence identity.
For one owner, admitted single-producer/single-consumer incidence separates like
ports, and actual output freshness separates produced ports from ready inputs.
These facts precede collective batch acceptance.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeReplay

private theorem resolved_ordinary_port_declared (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (wellFormed : programWellFormed program = true)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (kind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (port : ControlPlaceId) (member : port ∈ bodyConsumedPorts operation ++ operationOutputs operation) :
    ∃ place ∈ program.controlPlaces, place.id = port := by
  have sameScope : operationControlPlacesShareOwner operation = true := by
    cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
    all_goals rfl
  have portMember : port ∈ operationControlPlaces operation := by
    cases operation <;> simp only [SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
    all_goals exact member
  obtain ⟨origin, selected⟩ := resolved_selectedInputOrigin program state candidate operation port wellFormed resolved sameScope portMember
  unfold selectedInputOrigin? at selected
  generalize declarations : program.controlPlaces.filter (fun place => decide (place.id = port)) = places at selected
  cases places with
  | nil => simp at selected
  | cons place rest =>
      cases rest with
      | cons other tail => simp at selected
      | nil =>
          have present := List.mem_filter.mp (declarations.symm ▸ List.mem_singleton_self place)
          exact ⟨place, present.1, of_decide_eq_true present.2⟩

private theorem same_input_key (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (left right : SemanticOperation) (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces)
    (leftInput : place.id ∈ bodyConsumedPorts left) (rightInput : place.id ∈ bodyConsumedPorts right) :
    left.id = right.id := by
  obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp (ParallelScopeStart.analyzeProgram_place_incidence program analysis analyzed place declared).2
  have selected (operation : SemanticOperation) (member : operation ∈ program.operations)
      (input : place.id ∈ bodyConsumedPorts operation) : operation.id = only := by
    have included : operation.id ∈ program.operations.filterMap (fun operation =>
        if (SequentialScopeControl.inputs operation).contains place.id then some operation.id else none) :=
      List.mem_filterMap.mpr ⟨operation, member, by
        have ready : place.id ∈ SequentialScopeControl.inputs operation := input
        simp [ready]⟩
    rw [singleton] at included
    exact List.mem_singleton.mp included
  exact (selected left leftMember leftInput).trans (selected right rightMember rightInput).symm

private theorem same_output_key (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (left right : SemanticOperation) (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces)
    (leftOutput : place.id ∈ operationOutputs left) (rightOutput : place.id ∈ operationOutputs right) :
    left.id = right.id := by
  obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp (ParallelScopeStart.analyzeProgram_place_incidence program analysis analyzed place declared).1
  have leftPresent := declared_output_producer program left leftMember place.id leftOutput
  have rightPresent := declared_output_producer program right rightMember place.id rightOutput
  rw [singleton] at leftPresent rightPresent
  exact (List.mem_singleton.mp leftPresent).trans (List.mem_singleton.mp rightPresent).symm

private theorem enabled_token_output_empty (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (kind : operation.kind = .duplicate ∨ operation.kind = .synchronize)
    (after : RuntimeState) (applied : applyInternalOperationOccurrence? program state candidate = some after)
    (place : ControlPlace) (declared : place ∈ program.controlPlaces) (output : place.id ∈ operationOutputs operation) :
    (state.tokens.filter fun token => token.placeId == place.id && token.owner == candidate.owner).length = 0 := by
  have ordinary : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] := by
    rcases kind with same | same <;> simp [same]
  obtain ⟨⟨input, inputMember⟩, units⟩ := ordinary_operation_inputs_unit program state after candidate operation resolved ordinary applied
  obtain ⟨_, _, _, _, _, _, ancestry, _, _⟩ := reachable_reservation_frame program analysis analyzed state reachable instanceId running candidate operation resolved input (units input inputMember) (fun _ => false)
  have child := ParallelScopeStart.resolved_fork_join_child program analysis analyzed state candidate operation resolved ancestry kind
  have empty := reachable.child_outputs_empty program analysis analyzed state instanceId running candidate operation resolved child ordinary after applied place declared output
  have reordered : state.tokens.filter (fun token => token.owner == candidate.owner && token.placeId == place.id) =
      state.tokens.filter (fun token => token.placeId == place.id && token.owner == candidate.owner) := by simp only [Bool.and_comm]
  simp only [continuationMarking, reordered] at empty
  omega

private theorem enabled_ports_disjoint (program : Program) (analysis : ParallelScopeStart.ProgramAnalysis)
    (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (left right : InternalOperationOccurrence) (leftOperation rightOperation : SemanticOperation)
    (leftResolved : resolveInternalOperationOccurrence? program state left = some leftOperation)
    (rightResolved : resolveInternalOperationOccurrence? program state right = some rightOperation)
    (leftKind : leftOperation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (rightKind : rightOperation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (leftAfter rightAfter : RuntimeState)
    (leftApplied : applyInternalOperationOccurrence? program state left = some leftAfter)
    (rightApplied : applyInternalOperationOccurrence? program state right = some rightAfter)
    (sameOwner : left.owner = right.owner) (different : leftOperation.id ≠ rightOperation.id)
    (port : ControlPlaceId)
    (leftPort : port ∈ bodyConsumedPorts leftOperation ∨
      (port ∈ operationOutputs leftOperation ∧ (leftOperation.kind = .duplicate ∨ leftOperation.kind = .synchronize)))
    (rightPort : port ∈ bodyConsumedPorts rightOperation ∨
      (port ∈ operationOutputs rightOperation ∧ (rightOperation.kind = .duplicate ∨ rightOperation.kind = .synchronize))) : False := by
  have wellFormed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis analyzed).1
  have leftMember := (resolveInternalOperationOccurrence_declaration program state left leftOperation leftResolved).1
  have rightMember := (resolveInternalOperationOccurrence_declaration program state right rightOperation rightResolved).1
  obtain ⟨place, declared, identity⟩ := resolved_ordinary_port_declared program state left leftOperation wellFormed leftResolved leftKind port
    (List.mem_append.mpr (leftPort.elim Or.inl (fun produced => Or.inr produced.1)))
  rcases leftPort with leftInput | ⟨leftOutput, leftControl⟩
  · rcases rightPort with rightInput | ⟨rightOutput, rightControl⟩
    · exact different (same_input_key program analysis analyzed leftOperation rightOperation leftMember rightMember place declared
        (by simpa only [identity] using leftInput) (by simpa only [identity] using rightInput))
    · have empty := enabled_token_output_empty program analysis analyzed state reachable instanceId running right rightOperation rightResolved
        rightControl rightAfter rightApplied place declared (by simpa only [identity] using rightOutput)
      have unit := (ordinary_operation_inputs_unit program state leftAfter left leftOperation leftResolved leftKind leftApplied).2 port leftInput
      rw [identity, ← sameOwner] at empty
      omega
  · rcases rightPort with rightInput | ⟨rightOutput, _⟩
    · have empty := enabled_token_output_empty program analysis analyzed state reachable instanceId running left leftOperation leftResolved
        leftControl leftAfter leftApplied place declared (by simpa only [identity] using leftOutput)
      have unit := (ordinary_operation_inputs_unit program state rightAfter right rightOperation rightResolved rightKind rightApplied).2 port rightInput
      rw [identity, sameOwner] at empty
      omega
    · exact different (same_output_key program analysis analyzed leftOperation rightOperation leftMember rightMember place declared
        (by simpa only [identity] using leftOutput) (by simpa only [identity] using rightOutput))

private theorem prepared_token_ports (program : Program) (state : RuntimeState)
    (candidate : InternalOperationOccurrence) (patch : InternalOccurrenceTokenPatch)
    (prepared : prepareOccurrenceTokenPatch? program state candidate = some patch) :
    patch.operation.kind ∈ [SemanticOperationKind.duplicate, .synchronize, .reachNoneEnd] ∧
      patch.tokens.consumed = bodyConsumedPorts patch.operation ∧ patch.tokens.produced = operationOutputs patch.operation := by
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
    simp [SemanticOperation.kind, bodyConsumedPorts, SequentialScopeControl.inputs, operationOutputs]

private theorem reserved_member_ports (program : Program) (state : RuntimeState)
    (candidates : List InternalOperationOccurrence) (members : List InternalOccurrencePatch)
    (reserved : reserveOccurrenceMembers? program state [] candidates = some members)
    (member : InternalOccurrencePatch) (present : member ∈ members) :
    resolveInternalOperationOccurrence? program state ⟨member.operation.id, member.owner⟩ = some member.operation ∧
      member.operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] ∧
      ∀ key ∈ member.tokenKeys, key.1 = member.owner ∧
        (key.2 ∈ bodyConsumedPorts member.operation ∨
          (key.2 ∈ operationOutputs member.operation ∧ (member.operation.kind = .duplicate ∨ member.operation.kind = .synchronize))) := by
  have trace := reserveOccurrenceMembers_trace program state [] candidates members reserved
  cases member with
  | arm arm =>
      obtain ⟨_, prepared⟩ := (trace.arm_prepared program state [] members candidates arm present).resolve_left (by simp)
      obtain ⟨runtimeId, operation, input, _, _, _, resolved, inputEq, _, _, operationEq, inputSame, _, shape, _, _⟩ :=
        prepareReservedOccurrenceArm_gate_provenance program state _ _ arm prepared
      have exactResolved : resolveInternalOperationOccurrence? program state ⟨arm.operation.id, arm.owner⟩ = some arm.operation := by
        simpa only [← operationEq] using resolved
      refine ⟨exactResolved, ?_, ?_⟩
      · rw [show (InternalOccurrencePatch.arm arm).operation = arm.operation from rfl, operationEq]
        cases operation <;> simp only [ReservedArmWriteShape] at shape <;> try contradiction
        all_goals simp [SemanticOperation.kind]
      · intro key keyMember
        have keyEq : key = (arm.owner, arm.input) := List.mem_singleton.mp keyMember
        rw [keyEq]
        refine ⟨rfl, Or.inl ?_⟩
        change arm.input ∈ bodyConsumedPorts arm.operation
        rw [operationEq]
        cases operation <;> simp only [ReservedArmWriteShape] at shape <;> try contradiction
        all_goals
          simp only [internalArmInput?, Option.some.injEq] at inputEq
          simpa only [bodyConsumedPorts, SequentialScopeControl.inputs, List.mem_singleton, inputEq] using inputSame
  | token patch =>
      have prepared := (trace.token_prepared program state [] members candidates patch present).resolve_left (by simp)
      have resolved := (prepareOccurrenceTokenPatch_application program state _ patch prepared).2.1
      obtain ⟨kind, consumed, produced⟩ := prepared_token_ports program state _ patch prepared
      refine ⟨resolved, List.mem_cons_of_mem _ (List.mem_cons_of_mem _ kind), ?_⟩
      intro key keyMember
      obtain ⟨port, portMember, same⟩ := List.mem_map.mp keyMember
      subst key
      refine ⟨rfl, ?_⟩
      rw [consumed, produced] at portMember
      rcases List.mem_append.mp portMember with input | output
      · exact Or.inl input
      · refine Or.inr ⟨output, ?_⟩
        cases operation : patch.operation <;> simp only [operation, SemanticOperation.kind, List.mem_cons] at kind <;> try contradiction
        all_goals simp [InternalOccurrencePatch.operation, operation, SemanticOperation.kind]
        all_goals simp [operation, operationOutputs] at output

/-- Every pair of members reserved from actual discovery has disjoint owner/place keys. No batch-acceptance or pairwise-disjointness premise is used. -/
theorem ParallelScopeInternalPrefixReachable.reserved_token_keys_disjoint (program : Program)
    (analysis : ParallelScopeStart.ProgramAnalysis) (analyzed : ParallelScopeStart.analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (members : List InternalOccurrencePatch)
    (reserved : reserveOccurrenceMembers? program state [] (pairs.map Prod.fst) = some members) :
    members.Pairwise (fun left right => ∀ key ∈ left.tokenKeys, key ∉ right.tokenKeys) := by
  let identify := fun member : InternalOccurrencePatch =>
    ({ operationId := member.operation.id, owner := member.owner } : InternalOperationOccurrence)
  have trace := reserveOccurrenceMembers_trace program state [] (pairs.map Prod.fst) members reserved
  have aligned : members.map identify = pairs.map Prod.fst := by
    simpa only [List.map_nil, List.nil_append] using trace.identities program state [] members (pairs.map Prod.fst)
  have native (member : InternalOccurrencePatch) (present : member ∈ members) :
      ∃ after, applyInternalOperationOccurrence? program state (identify member) = some after := by
    have keyMember : identify member ∈ pairs.map Prod.fst := aligned ▸ List.mem_map.mpr ⟨member, present, rfl⟩
    obtain ⟨pair, pairMember, same⟩ := List.mem_map.mp keyMember
    exact ⟨pair.2, by rw [← same]; exact deriveInternalOccurrenceFrontier_member_applied program state pairs discovered pair pairMember⟩
  have wellFormed := (ParallelScopeStart.analyzeProgram_incidence_admission program analysis analyzed).1
  have declarations := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  have ordered := deriveInternalOccurrenceFrontier_ordered program state pairs declarations discovered
  have alternativeUnique : (pairs.map fun pair => InternalAlternative.operationOccurrence pair.1.operationId pair.1.owner).Nodup :=
    ordered.imp (fun less same => by
      rw [same] at less
      exact Bool.noConfusion ((internalAlternativeBefore_asymm _ _ less).symm.trans less))
  have candidateUnique : (pairs.map Prod.fst).Nodup := by
    apply List.Pairwise.of_map (S := (· ≠ ·)) (fun candidate : InternalOperationOccurrence =>
      InternalAlternative.operationOccurrence candidate.operationId candidate.owner)
      (fun _ _ different same => different (congrArg (fun candidate : InternalOperationOccurrence =>
        InternalAlternative.operationOccurrence candidate.operationId candidate.owner) same))
    simpa only [List.map_map, Function.comp_def, List.Nodup] using alternativeUnique
  rw [← aligned] at candidateUnique
  apply (List.pairwise_map.mp candidateUnique).imp_of_mem
  intro left right leftMember rightMember different key leftKey rightKey
  obtain ⟨leftResolved, leftKind, leftPorts⟩ := reserved_member_ports program state (pairs.map Prod.fst) members reserved left leftMember
  obtain ⟨rightResolved, rightKind, rightPorts⟩ := reserved_member_ports program state (pairs.map Prod.fst) members reserved right rightMember
  obtain ⟨leftAfter, leftApplied⟩ := native left leftMember
  obtain ⟨rightAfter, rightApplied⟩ := native right rightMember
  obtain ⟨leftOwner, leftPort⟩ := leftPorts key leftKey
  obtain ⟨rightOwner, rightPort⟩ := rightPorts key rightKey
  have sameOwner : left.owner = right.owner := leftOwner.symm.trans rightOwner
  have operationDifferent : left.operation.id ≠ right.operation.id := by
    intro same
    exact different (by simp only [identify, same, sameOwner])
  exact enabled_ports_disjoint program analysis analyzed state reachable instanceId running (identify left) (identify right)
    left.operation right.operation leftResolved rightResolved leftKind rightKind leftAfter rightAfter leftApplied rightApplied
    sameOwner operationDifferent key.2 leftPort rightPort

end BpmnSemantics.SemanticProcess

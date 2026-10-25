module

public import BpmnSemantics.SemanticProcess.ParallelScopeParentProgress
public import BpmnSemantics.SemanticProcess.ParallelScopeFrontierReservationProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeFrontierCorrespondenceProofs
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws

/-! # Pre-entry parent frontier exclusivity

PMIS-SELECT-01 uses the existing parent history's cursor and admitted declaration
incidence to exclude competing native occurrences before parallel entry. The
result includes pending Start, parent prelude work and entry, and requires no
reservation or successful collective preparation.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

private theorem admitted_initiations_eq (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (left right : SemanticOperation)
    (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (leftKind : left.kind = .initiate) (rightKind : right.kind = .initiate) : left = right := by
  have graph := programWellFormed_graph program (analyzeProgram_incidence_admission program analysis admitted).1
  unfold programGraphWellFormedForProgram programGraphWellFormedWithScopeLifecycle at graph
  dsimp only at graph
  split at graph <;> try contradiction
  rename_i start startsEq
  have singleton : program.operations.filterMap (fun operation => match operation with
      | .initiate id .. | .initiateMessage id .. | .initiateTimer id .. => some id | _ => none) = [start] := startsEq
  clear graph
  have selected (operation : SemanticOperation) (member : operation ∈ program.operations)
      (kind : operation.kind = .initiate) : operation.id = start := by
    have included : operation.id ∈ program.operations.filterMap (fun current => match current with
        | .initiate id .. | .initiateMessage id .. | .initiateTimer id .. => some id | _ => none) := by
      apply List.mem_filterMap.mpr
      refine ⟨operation, member, ?_⟩
      cases operation <;> simp_all [SemanticOperation.kind, SemanticOperation.id]
    rw [singleton] at included
    exact List.mem_singleton.mp included
  exact same_declaration program analysis admitted left right leftMember rightMember
    ((selected left leftMember leftKind).trans (selected right rightMember rightKind).symm)

private theorem admitted_consumers_eq (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (place : ControlPlace)
    (declared : place ∈ program.controlPlaces) (left right : SemanticOperation)
    (leftMember : left ∈ program.operations) (rightMember : right ∈ program.operations)
    (leftInput : place.id ∈ SequentialScopeControl.inputs left)
    (rightInput : place.id ∈ SequentialScopeControl.inputs right) : left = right := by
  obtain ⟨only, singleton⟩ := List.length_eq_one_iff.mp
    (analyzeProgram_place_incidence program analysis admitted place declared).2
  have selected (operation : SemanticOperation) (member : operation ∈ program.operations)
      (input : place.id ∈ SequentialScopeControl.inputs operation) : operation.id = only := by
    have included : operation.id ∈ program.operations.filterMap (fun current =>
        if (SequentialScopeControl.inputs current).contains place.id then some current.id else none) :=
      List.mem_filterMap.mpr ⟨operation, member, by simp [input]⟩
    rw [singleton] at included
    exact List.mem_singleton.mp included
  exact same_declaration program analysis admitted left right leftMember rightMember
    ((selected left leftMember leftInput).trans (selected right rightMember rightInput).symm)

private theorem admitted_entry_input (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (operation : SemanticOperation)
    (member : operation ∈ program.operations) (kind : operation.kind = .enterParallelMultiInstanceScope) :
    analysis.entry.input ∈ SequentialScopeControl.inputs operation := by
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := analyzeProgram_body_certificate program analysis admitted
  have parsed : ∃ entry, parallelScopeEntry? operation = some entry := by
    cases operation <;> simp_all [SemanticOperation.kind, parallelScopeEntry?]
  obtain ⟨entry, decoded⟩ := parsed
  have included : entry ∈ program.operations.filterMap parallelScopeEntry? :=
    List.mem_filterMap.mpr ⟨operation, member, decoded⟩
  rw [entries] at included
  have same : entry = analysis.entry := List.mem_singleton.mp included
  rw [same] at decoded
  cases operation <;> simp only [parallelScopeEntry?] at decoded <;> try contradiction
  have fields := Option.some.inj decoded
  simpa only [SequentialScopeControl.inputs, bodyConsumedPorts, List.mem_singleton] using
    (congrArg ParallelScopeEntry.input fields).symm

private theorem parent_enabled_requirement (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (parents : ParallelScopeParentHistory program analysis.entry parent before)
    (candidate : InternalOperationOccurrence)
    (applied : applyInternalOperationOccurrence? program before candidate = some after) :
    ∃ operation ∈ program.operations, operation.id = candidate.operationId ∧ candidate.owner = parent ∧
      ((operation.kind = .initiate ∧ before.initiationPending = true) ∨
        ∃ input ∈ SequentialScopeControl.inputs operation, 0 < continuationMarking before parent input) := by
  obtain ⟨operation, record, resolved, member, identity, owned, metadata, _, replayed, phases⟩ :=
    parents.pre_entry_occurrence_phases program analysis admitted parent before after candidate applied
  refine ⟨operation, member, identity, owned, ?_⟩
  rcases phases with ⟨kind, output, initiated, _⟩ | ⟨kind, _⟩ | ⟨kind, entered⟩ | ⟨kind, _⟩
  · left
    refine ⟨by simpa only [metadata] using kind, ?_⟩
    unfold initiateState? at initiated
    obtain ⟨_, _, initiated⟩ := Option.bind_eq_some_iff.mp initiated
    cases pending : before.initiationPending with
    | false => simp [pending] at initiated
    | true => rfl
  · right
    have operationKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] := by
      simpa only [metadata] using kind
    obtain ⟨⟨input, consumed⟩, positive⟩ :=
      body_step_inputs_positive program before after candidate operation resolved operationKind applied
    refine ⟨input, consumed, ?_⟩
    simpa only [owned] using positive input consumed
  · right
    have operationKind : operation.kind = .enterParallelMultiInstanceScope := by
      simpa only [metadata] using kind
    refine ⟨analysis.entry.input, admitted_entry_input program analysis admitted operation member operationKind, ?_⟩
    have unit : (before.tokens.filter fun token => token.placeId == analysis.entry.input && token.owner == parent).length = 1 := by
      unfold enterParallelScope? at entered
      split at entered <;> try contradiction
      rename_i valid
      simp only [Bool.or_eq_true, bne_iff_ne, not_or] at valid
      exact Classical.byContradiction valid.1.1.1.2
    have reordered : before.tokens.filter (fun token => token.owner == parent && token.placeId == analysis.entry.input) =
        before.tokens.filter (fun token => token.placeId == analysis.entry.input && token.owner == parent) := by
      simp only [Bool.and_comm]
    simp only [continuationMarking, reordered, unit]
    omega
  · exact False.elim
      (parents.no_root_completion_replay program analysis admitted parent before after record kind replayed)

/-- Actual native occurrences before entry select the same admitted Start or the same sole cursor consumer. -/
theorem ParallelScopeParentHistory.enabled_occurrence_unique (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (parent : ScopeOccurrenceId) (state : RuntimeState)
    (parents : ParallelScopeParentHistory program analysis.entry parent state)
    (left right : InternalOperationOccurrence) (leftAfter rightAfter : RuntimeState)
    (leftApplied : applyInternalOperationOccurrence? program state left = some leftAfter)
    (rightApplied : applyInternalOperationOccurrence? program state right = some rightAfter) : left = right := by
  obtain ⟨leftOperation, leftMember, leftIdentity, leftOwned, leftRequirement⟩ :=
    parent_enabled_requirement program analysis admitted parent state leftAfter parents left leftApplied
  obtain ⟨rightOperation, rightMember, rightIdentity, rightOwned, rightRequirement⟩ :=
    parent_enabled_requirement program analysis admitted parent state rightAfter parents right rightApplied
  have same : leftOperation = rightOperation := by
    rcases parents.cursor program analysis admitted parent state with
      ⟨_, zero⟩ | ⟨pending, operations, port, path, declared, _, _, credit⟩
    · have initiation (operation : SemanticOperation)
          (requirement : (operation.kind = .initiate ∧ state.initiationPending = true) ∨
            ∃ input ∈ SequentialScopeControl.inputs operation, 0 < continuationMarking state parent input) :
          operation.kind = .initiate := by
        rcases requirement with ⟨kind, _⟩ | ⟨input, _, positive⟩
        · exact kind
        · rw [zero parent input] at positive
          omega
      exact admitted_initiations_eq program analysis admitted leftOperation rightOperation leftMember rightMember
        (initiation leftOperation leftRequirement) (initiation rightOperation rightRequirement)
    · have input (operation : SemanticOperation)
          (requirement : (operation.kind = .initiate ∧ state.initiationPending = true) ∨
            ∃ input ∈ SequentialScopeControl.inputs operation, 0 < continuationMarking state parent input) :
          port.id ∈ SequentialScopeControl.inputs operation := by
        rcases requirement with ⟨_, initiated⟩ | ⟨input, consumed, positive⟩
        · simp [pending] at initiated
        · rw [credit input] at positive
          have sameInput : input = port.id := by
            by_cases sameInput : input = port.id
            · exact sameInput
            · simp [ownedPortCount, Ne.symm sameInput] at positive
          simpa only [sameInput] using consumed
      exact admitted_consumers_eq program analysis admitted port declared leftOperation rightOperation leftMember rightMember
        (input leftOperation leftRequirement) (input rightOperation rightRequirement)
  have identities : left.operationId = right.operationId :=
    leftIdentity.symm.trans ((congrArg SemanticOperation.id same).trans rightIdentity)
  have owners : left.owner = right.owner := leftOwned.trans rightOwned.symm
  cases left
  cases right
  cases identities
  cases owners
  rfl

/-- Successful raw discovery has at most one offer throughout the actual pre-entry parent history. -/
theorem ParallelScopeParentHistory.raw_frontier_length_le_one (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (parent : ScopeOccurrenceId) (state : RuntimeState)
    (parents : ParallelScopeParentHistory program analysis.entry parent state)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs) : pairs.length ≤ 1 := by
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  have declarations := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  have ordered := deriveInternalOccurrenceFrontier_ordered program state pairs declarations discovered
  cases pairs with
  | nil => simp
  | cons first rest =>
    cases rest with
    | nil => simp
    | cons second tail =>
      have firstApplied := deriveInternalOccurrenceFrontier_member_applied program state (first :: second :: tail)
        discovered first (by simp)
      have secondApplied := deriveInternalOccurrenceFrontier_member_applied program state (first :: second :: tail)
        discovered second (by simp)
      have same := parents.enabled_occurrence_unique program analysis admitted parent state first.1 second.1
        first.2 second.2 firstApplied secondApplied
      have before : internalAlternativeBefore (.operationOccurrence first.1.operationId first.1.owner)
          (.operationOccurrence second.1.operationId second.1.owner) = true :=
        (List.pairwise_cons.mp ordered).1 _ (by simp)
      rw [same] at before
      exact False.elim (Bool.noConfusion ((internalAlternativeBefore_asymm _ _ before).symm.trans before))

/-- Every actual multi-offer frontier lies in the post-entry lifetime phase; pending Start, pre-entry work and terminal completion cannot supply it. -/
theorem ParallelScopeInternalPrefixReachable.multiple_frontier_post_entry (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (multiple : 2 ≤ pairs.length) :
    ∃ seed : ParallelScopeAcceptedStart program, ∀ owner,
      owner.definitionScopeId = analysis.entry.childScopeId → ∃ before issued records,
        ParallelScopeParentHistory program analysis.entry seed.parent before ∧
        enterParallelScope? analysis.entry before seed.parent = some issued ∧
        ContinuationCommandHistory program owner issued state records := by
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis admitted state
  refine ⟨seed, ?_⟩
  intro owner child
  rcases phases owner child with rfl | ⟨_, _, _, _, _, _, _, phase⟩
  · have parents : ParallelScopeParentHistory program analysis.entry seed.parent seed.ready :=
      .start seed.instanceId seed.root seed.values seed.ready seed.rootSelected seed.started rfl
        (analyzeProgram_child_root_distinct program analysis admitted seed.root seed.rootSelected)
    have single := parents.raw_frontier_length_le_one program analysis admitted seed.parent seed.ready pairs discovered
    omega
  rcases phase with ⟨parents, _⟩ | ⟨before, issued, _, _, suffix, _, parents, _, _, _, entered, later⟩
  · have single := parents.raw_frontier_length_le_one program analysis admitted seed.parent state pairs discovered
    omega
  rcases later with history | ⟨_, _, _, _, _, _, _, completed, _⟩
  · exact ⟨before, issued, suffix, parents, entered, history⟩
  · obtain ⟨completedInstance, completed⟩ := completed
    rw [running] at completed
    cases completed

end BpmnSemantics.SemanticProcess

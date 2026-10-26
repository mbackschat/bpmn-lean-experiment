module

import BpmnSemantics.SemanticProcess.ParallelScopeTerminalFrontierProofs
import BpmnSemantics.SemanticProcess.ParallelScopeBatchAcceptanceProofs
import BpmnSemantics.SemanticProcess.ParallelScopeFrontierReservationProofs
import BpmnSemantics.SemanticProcess.ParallelScopeParentFrontierProofs
import BpmnSemantics.SemanticProcess.ParallelScopeParentProgress
import BpmnSemantics.SemanticProcess.ParallelScopeProgress
public import BpmnSemantics.SemanticProcess.ParallelScopeResumptionProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames
import BpmnSemantics.SemanticProcess.ParallelScopeReservationAncestryProofs

/-! # Structural operations in actual parallel frontiers

PMIS-SELECT-01 distinguishes ordinary independent body work from structural scope
transitions. Actual Start and entry provenance exclude a second initiation or
entry, without treating an accounting history as atomic-command reachability.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

/-- Every enabled member of an actual multi-offer frontier is ordinary work, retirement or final root completion; Start and repeated entry cannot occur there. -/
theorem ParallelScopeInternalPrefixReachable.multiple_frontier_operation_kinds (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (multiple : 2 ≤ pairs.length)
    (pair : InternalOperationOccurrence × RuntimeState) (present : pair ∈ pairs)
    (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state pair.1 = some operation) :
    operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] ∨
      operation.kind = .completeParallelMultiInstanceScope ∨ operation.kind = .completeScope := by
  have applied := deriveInternalOccurrenceFrontier_member_applied program state pairs discovered pair present
  obtain ⟨seed, _, phases⟩ := reachable.start_certificate program analysis admitted state
  let observer : ScopeOccurrenceId := ⟨seed.instanceId, analysis.entry.childScopeId, 1⟩
  rcases phases observer rfl with rfl | ⟨startId, origin, output, initial, records, startDeclared, initiated, phase⟩
  · have parents : ParallelScopeParentHistory program analysis.entry seed.parent seed.ready :=
      .start seed.instanceId seed.root seed.values seed.ready seed.rootSelected seed.started rfl
        (analyzeProgram_child_root_distinct program analysis admitted seed.root seed.rootSelected)
    have single := parents.raw_frontier_length_le_one program analysis admitted seed.parent seed.ready pairs discovered
    omega
  rcases phase with ⟨parents, _⟩ |
    ⟨before, issued, prior, entryRecord, suffix, _, parents, preceding, _, _, entered, later⟩
  · have single := parents.raw_frontier_length_le_one program analysis admitted seed.parent state pairs discovered
    omega
  rcases later with history | ⟨_, _, _, _, _, _, _, completed, _⟩
  · obtain ⟨actual, record, actualResolved, _, _, metadata, _, kinds⟩ :=
      ContinuationCommandHistory.post_entry_occurrence_phases program analysis admitted observer seed.parent seed.instanceId seed.values seed.root
        seed.ready initial before issued state pair.2 startId origin output startDeclared seed.rootSelected rfl
        seed.started initiated prior suffix preceding parents entered history pair.1 applied
    rw [resolved] at actualResolved
    cases Option.some.inj actualResolved
    rw [metadata] at kinds
    rcases kinds with ordinary | terminal
    · exact ordinary.elim Or.inl (fun retirement => Or.inr (Or.inl retirement))
    · exact Or.inr (Or.inr terminal.1)
  · obtain ⟨completedInstance, completed⟩ := completed
    rw [running] at completed
    cases completed

/-- Every member of a reachable multi-offer frontier is ordinary work or child retirement; final root completion is exclusive. -/
theorem ParallelScopeInternalPrefixReachable.multiple_frontier_ordinary_or_retirement (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (multiple : 2 ≤ pairs.length)
    (pair : InternalOperationOccurrence × RuntimeState) (present : pair ∈ pairs)
    (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state pair.1 = some operation) :
    operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd] ∨
      operation.kind = .completeParallelMultiInstanceScope := by
  rcases reachable.multiple_frontier_operation_kinds program analysis admitted state instanceId running pairs
    discovered multiple pair present operation resolved with ordinary | retirement | terminal
  · exact Or.inl ordinary
  · exact Or.inr retirement
  · have single := reachable.root_completion_frontier_length_le_one program analysis admitted state instanceId
      running pairs discovered pair present operation resolved terminal
    omega

/-- Actual multi-offer discovery installs a complete batch whenever child retirement is absent; no ordinary-kind or successful-preparation premise remains. -/
theorem ParallelScopeInternalPrefixReachable.retirement_free_frontier_batch_installed (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (multiple : 2 ≤ pairs.length)
    (noRetirement : ∀ pair ∈ pairs, ∀ operation,
      resolveInternalOperationOccurrence? program state pair.1 = some operation →
      operation.kind ≠ .completeParallelMultiInstanceScope) :
    ∃ batch, (deriveInternalExecutionFrontier program state).occurrenceBatch = some batch ∧
      batch.members.length = pairs.length ∧ (deriveInternalExecutionFrontier program state).preparationFailed = false := by
  apply reachable.ordinary_frontier_batch_installed program analysis admitted state instanceId running pairs discovered multiple
  intro pair present operation resolved
  rcases reachable.multiple_frontier_ordinary_or_retirement program analysis admitted state instanceId running pairs
    discovered multiple pair present operation resolved with ordinary | retirement
  · exact ordinary
  · exact False.elim (noRetirement pair present operation resolved retirement)

/-- A retiring scope cannot also supply an enabled ordinary operation: actual retirement requires quiescence, while native body execution consumes positive continuation credit. -/
theorem retirement_and_body_have_distinct_owners (program : Program) (state : RuntimeState)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (retiring body : InternalOperationOccurrence) (retirement operation : SemanticOperation)
    (retirementResolved : resolveInternalOperationOccurrence? program state retiring = some retirement)
    (bodyResolved : resolveInternalOperationOccurrence? program state body = some operation)
    (retirementKind : retirement.kind = .completeParallelMultiInstanceScope)
    (bodyKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (retired advanced : RuntimeState)
    (retirementApplied : applyInternalOperationOccurrence? program state retiring = some retired)
    (bodyApplied : applyInternalOperationOccurrence? program state body = some advanced) :
    retiring.owner ≠ body.owner := by
  intro same
  obtain ⟨actual, resolved, _, replayed⟩ :=
    applyInternalOperationOccurrence_replay_record program state retired retiring profile retirementApplied
  rw [retirementResolved] at resolved
  cases Option.some.inj resolved
  obtain ⟨entry, _, completed⟩ := replayed_retirement_execution program state retired
    { operationId := retiring.operationId, operationKind := retirement.kind,
      origin := retirement.origin, owner := retiring.owner, mergeInput := none } retirementKind replayed
  obtain ⟨⟨input, member⟩, positive⟩ := body_step_inputs_positive program state advanced body operation bodyResolved bodyKind bodyApplied
  have blocked := continuationMarking_positive_nonquiescent state body.owner input (positive input member)
  have refused := completeParallelScope_refuses_nonquiescent entry state body.owner blocked
  change completeParallelScope? entry state retiring.owner = some retired at completed
  rw [same, refused] at completed
  contradiction

/-- During scoped resumption, the stable sibling frame concentrates both retirement and ordinary progress on the resumed actor, so they cannot be enabled together. -/
theorem InternalCommutation.ParallelScopeOwnerFrame.retirement_excludes_body (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (stable state : RuntimeState)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable state actor)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (blocked : ∀ scope ∈ stable.scopeOccurrences, scope.id.definitionScopeId = analysis.entry.childScopeId →
      scopeQuiescent stable scope.id = false)
    (retiring body : InternalOperationOccurrence) (retirement operation : SemanticOperation)
    (retirementResolved : resolveInternalOperationOccurrence? program state retiring = some retirement)
    (bodyResolved : resolveInternalOperationOccurrence? program state body = some operation)
    (retirementKind : retirement.kind = .completeParallelMultiInstanceScope)
    (bodyKind : operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd])
    (retired advanced : RuntimeState)
    (retirementApplied : applyInternalOperationOccurrence? program state retiring = some retired)
    (bodyApplied : applyInternalOperationOccurrence? program state body = some advanced) : False := by
  have retirementOwner := frame.retirement_operation_owner program analysis stable state retired actor profile admitted blocked
    retiring retirement retirementResolved retirementKind retirementApplied
  have bodyOwner := (frame.body_step program stable state advanced actor profile empty successful
    body operation bodyResolved bodyKind bodyApplied).1
  exact retirement_and_body_have_distinct_owners program state profile retiring body retirement operation
    retirementResolved bodyResolved retirementKind bodyKind retired advanced retirementApplied bodyApplied
    (retirementOwner.trans bodyOwner.symm)

end BpmnSemantics.SemanticProcess

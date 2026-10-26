module

import BpmnSemantics.SemanticProcess.ParallelScopeStructuralFrontierProofs
import BpmnSemantics.SemanticProcess.ParallelScopeDiscoveryProofs
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
import BpmnSemantics.SemanticProcess.InternalTransitionAlternativeOrder
import BpmnSemantics.SemanticProcess.ParallelScopeFrontierClassificationProofs
import BpmnSemantics.SemanticProcess.ParallelScopeFrontierCorrespondenceProofs
import BpmnSemantics.SemanticProcess.ParallelScopeFrontierReservationProofs
import BpmnSemantics.SemanticProcess.ParallelScopeReservationSelectionProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeResumptionProofs
import BpmnSemantics.SemanticProcess.ParallelScopeEntryReachability
import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames

/-! # Refusal-free multi-offer preparation during scoped resumption

PMIS-SELECT-01 combines the actual resumption owner frame with admitted retirement
identity and strict raw frontier order. Two retirements identify one occurrence;
retirement beside ordinary work contradicts quiescence. The resulting ordinary
frontier installs its complete reserved batch. Initial-entry drain remains outside
this scoped-resumption premise.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation ParallelScopeStart ParallelScopeReplay

private theorem native_retirement_child (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (state after : RuntimeState)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
    (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
    (kind : operation.kind = .completeParallelMultiInstanceScope)
    (applied : applyInternalOperationOccurrence? program state candidate = some after) :
    candidate.owner.definitionScopeId = analysis.entry.childScopeId := by
  obtain ⟨actual, actualResolved, _, replayed⟩ :=
    applyInternalOperationOccurrence_replay_record program state after candidate profile applied
  have same : actual = operation := Option.some.inj (actualResolved.symm.trans resolved)
  subst actual
  obtain ⟨entry, member, completed⟩ := replayed_retirement_execution program state after
    { operationId := candidate.operationId, operationKind := operation.kind,
      origin := operation.origin, owner := candidate.owner, mergeInput := none } kind replayed
  obtain ⟨_, _, _, _, _, _, _, entries, _⟩ := analyzeProgram_body_certificate program analysis admitted
  rw [entries] at member
  have sameEntry : entry = analysis.entry := List.mem_singleton.mp member
  subst entry
  unfold completeParallelScope? at completed
  obtain ⟨binding, bound, _⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨_, _, _, _, child⟩ := parallelScopeBinding_body_record analysis.entry state candidate.owner binding bound
  exact child

/-- Stable sibling blockers concentrate both actual retirements on the resumed actor; admission identifies their unique paired declaration. -/
theorem InternalCommutation.ParallelScopeOwnerFrame.retirement_occurrences_unique (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (stable state : RuntimeState)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable state actor)
    (profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft")
    (blocked : ∀ scope ∈ stable.scopeOccurrences, scope.id.definitionScopeId = analysis.entry.childScopeId →
      scopeQuiescent stable scope.id = false)
    (left right : InternalOperationOccurrence) (leftOperation rightOperation : SemanticOperation)
    (leftResolved : resolveInternalOperationOccurrence? program state left = some leftOperation)
    (rightResolved : resolveInternalOperationOccurrence? program state right = some rightOperation)
    (leftKind : leftOperation.kind = .completeParallelMultiInstanceScope)
    (rightKind : rightOperation.kind = .completeParallelMultiInstanceScope)
    (leftAfter rightAfter : RuntimeState)
    (leftApplied : applyInternalOperationOccurrence? program state left = some leftAfter)
    (rightApplied : applyInternalOperationOccurrence? program state right = some rightAfter) : left = right := by
  have leftOwned := frame.retirement_operation_owner program analysis stable state leftAfter actor profile admitted blocked
    left leftOperation leftResolved leftKind leftApplied
  have rightOwned := frame.retirement_operation_owner program analysis stable state rightAfter actor profile admitted blocked
    right rightOperation rightResolved rightKind rightApplied
  have leftChild := native_retirement_child program analysis admitted state leftAfter profile left leftOperation
    leftResolved leftKind leftApplied
  have rightChild : right.owner.definitionScopeId = analysis.entry.childScopeId :=
    (congrArg ScopeOccurrenceId.definitionScopeId (rightOwned.trans leftOwned.symm)).trans leftChild
  obtain ⟨child, completion, _, _, _, _, _, _, childEq, completions, _⟩ :=
    analyzeProgram_body_certificate program analysis admitted
  have selected (candidate : InternalOperationOccurrence) (operation : SemanticOperation)
      (resolved : resolveInternalOperationOccurrence? program state candidate = some operation)
      (kind : operation.kind = .completeParallelMultiInstanceScope)
      (body : candidate.owner.definitionScopeId = analysis.entry.childScopeId) : operation = completion := by
    have declared := (resolveInternalOperationOccurrence_declaration program state candidate operation resolved).1
    have owned := resolved_definition_owner program state candidate operation resolved
    rw [body] at owned
    have population : operation ∈ child := childEq.symm ▸
      ParallelScopeStart.operation_owner_population program operation analysis.entry.childScopeId declared owned
    have included : operation ∈ [completion] := by
      rw [← completions]
      apply List.mem_filter.mpr
      refine ⟨population, ?_⟩
      cases operation <;> simp [SemanticOperation.kind] at kind ⊢
    exact List.mem_singleton.mp included
  have same : leftOperation = rightOperation :=
    (selected left leftOperation leftResolved leftKind leftChild).trans
      (selected right rightOperation rightResolved rightKind rightChild).symm
  have leftIdentity := (resolveInternalOperationOccurrence_declaration program state left leftOperation leftResolved).2
  have rightIdentity := (resolveInternalOperationOccurrence_declaration program state right rightOperation rightResolved).2
  have identities : left.operationId = right.operationId :=
    leftIdentity.symm.trans ((congrArg SemanticOperation.id same).trans rightIdentity)
  have owners : left.owner = right.owner := leftOwned.trans rightOwned.symm
  cases left
  cases right
  cases identities
  cases owners
  rfl

/-- Actual multi-offer discovery under the scoped-resumption frame is ordinary work and installs a complete batch without preparation refusal. -/
theorem ParallelScopeInternalPrefixReachable.scoped_resumption_frontier_batch_installed (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable state actor)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (blocked : ∀ scope ∈ stable.scopeOccurrences, scope.id.definitionScopeId = analysis.entry.childScopeId →
      scopeQuiescent stable scope.id = false)
    (pairs : List (InternalOperationOccurrence × RuntimeState))
    (discovered : deriveInternalOccurrenceFrontier? program state = some pairs)
    (multiple : 2 ≤ pairs.length) :
    (∀ pair ∈ pairs, ∀ operation,
      resolveInternalOperationOccurrence? program state pair.1 = some operation →
      operation.kind ∈ [SemanticOperationKind.awaitUserTask, .awaitEffect, .duplicate, .synchronize, .reachNoneEnd]) ∧
      ∃ batch, (deriveInternalExecutionFrontier program state).occurrenceBatch = some batch ∧
        batch.members.length = pairs.length ∧ (deriveInternalExecutionFrontier program state).preparationFailed = false := by
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  have wellFormed := (analyzeProgram_incidence_admission program analysis admitted).1
  have declarations := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program wellFormed)
  have ordered := deriveInternalOccurrenceFrontier_ordered program state pairs declarations discovered
  have noRetirement : ∀ pair ∈ pairs, ∀ operation,
      resolveInternalOperationOccurrence? program state pair.1 = some operation →
      operation.kind ≠ .completeParallelMultiInstanceScope := by
    intro retiring retiringMember retirement retirementResolved retirementKind
    have retirementApplied := deriveInternalOccurrenceFrontier_member_applied program state pairs discovered retiring retiringMember
    have sameRetirement (pair : InternalOperationOccurrence × RuntimeState) (present : pair ∈ pairs) :
        pair.1 = retiring.1 := by
      have applied := deriveInternalOccurrenceFrontier_member_applied program state pairs discovered pair present
      obtain ⟨operation, _, resolved, _, _, _, _, _⟩ :=
        applyInternalOperationOccurrence_admitted_phases program analysis admitted state pair.2 pair.1 applied
      rcases reachable.multiple_frontier_ordinary_or_retirement program analysis admitted state instanceId running pairs
        discovered multiple pair present operation resolved with ordinary | retired
      · exact False.elim (frame.retirement_excludes_body program analysis admitted stable state actor profile empty
          successful blocked retiring.1 pair.1 retirement operation retirementResolved resolved retirementKind ordinary
          retiring.2 pair.2 retirementApplied applied)
      · exact frame.retirement_occurrences_unique program analysis admitted stable state actor profile blocked
          pair.1 retiring.1 operation retirement resolved retirementResolved retired retirementKind
          pair.2 retiring.2 applied retirementApplied
    cases pairs with
    | nil => simp at multiple
    | cons first rest =>
      cases rest with
      | nil => simp at multiple
      | cons second tail =>
        have same : first.1 = second.1 :=
          (sameRetirement first (by simp)).trans (sameRetirement second (by simp)).symm
        have before : internalAlternativeBefore (.operationOccurrence first.1.operationId first.1.owner)
            (.operationOccurrence second.1.operationId second.1.owner) = true :=
          (List.pairwise_cons.mp ordered).1 _ (by simp)
        rw [same] at before
        exact Bool.noConfusion ((internalAlternativeBefore_asymm _ _ before).symm.trans before)
  refine ⟨?_, reachable.retirement_free_frontier_batch_installed program analysis admitted state instanceId running
    pairs discovered multiple noRetirement⟩
  intro pair present operation resolved
  rcases reachable.multiple_frontier_ordinary_or_retirement program analysis admitted state instanceId running pairs
    discovered multiple pair present operation resolved with ordinary | retirement
  · exact ordinary
  · exact False.elim (noRetirement pair present operation resolved retirement)

/-- The actual scheduler's multi-offer count suffices under the resumption frame; complete discovery and batch preparation are conclusions. -/
theorem ParallelScopeInternalPrefixReachable.scoped_resumption_batch_total (program : Program)
    (analysis : ProgramAnalysis) (admitted : analyzeProgram program = some analysis)
    (stable state : RuntimeState) (reachable : ParallelScopeInternalPrefixReachable program state)
    (instanceId : SemanticId) (running : state.control = .running instanceId)
    (actor : ScopeOccurrenceId) (frame : ParallelScopeOwnerFrame stable state actor)
    (empty : (deriveInternalExecutionFrontier program stable).offers = [])
    (successful : (deriveInternalExecutionFrontier program stable).preparationFailed = false)
    (blocked : ∀ scope ∈ stable.scopeOccurrences, scope.id.definitionScopeId = analysis.entry.childScopeId →
      scopeQuiescent stable scope.id = false)
    (multiple : 2 ≤ (deriveInternalExecutionFrontier program state).offers.length) :
    ∃ batch, (deriveInternalExecutionFrontier program state).occurrenceBatch = some batch ∧
      batch.members.length = (deriveInternalExecutionFrontier program state).offers.length ∧
      (deriveInternalExecutionFrontier program state).preparationFailed = false := by
  obtain ⟨pairs, discovered⟩ := reachable.frontier_discovery_total program analysis admitted state instanceId running
  have profile : program.identity.semanticProfile.value = "cibseven-2.2.0-parallel-multi-instance-subprocess-draft" := by
    cases selection : programSelected program with
    | false => simp [analyzeProgram, selection] at admitted
    | true => simpa only [programSelected, beq_iff_eq] using selection
  have count := deriveInternalExecutionFrontier_occurrence_length program state instanceId pairs profile running discovered
  obtain ⟨_, batch, installed, length, prepared⟩ := reachable.scoped_resumption_frontier_batch_installed
    program analysis admitted stable state instanceId running actor frame empty successful blocked pairs discovered
    (by omega)
  exact ⟨batch, installed, length.trans count.symm, prepared⟩

end BpmnSemantics.SemanticProcess

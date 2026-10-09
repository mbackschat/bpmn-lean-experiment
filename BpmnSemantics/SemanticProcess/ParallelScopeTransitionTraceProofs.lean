import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.ParallelScopeCommandReplay
import BpmnSemantics.SemanticProcess.ParallelScopeReplayFrames

/-! # Selected parallel transition-trace certificates

PMIS-SELECT-01 publication derives ordered replay and declaration attribution
from the executable trace check. Accounting-history consumers import this owner
without making the private runtime runner depend on graph or lifetime proofs.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Actual nonempty wait-command publications extend the existing lifetime history;
body/retirement classification remains explicit and supplies no fuel claim. -/
theorem applyStimulusTraced_parallel_scope_extends_history
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true)
    (owner parent : ScopeOccurrenceId) (initial : RuntimeState) (earlier : List CommittedTransition)
    (history : ParallelScopeReplay.ContinuationCommandHistory program owner initial state earlier)
    (published : (applyStimulusTraced closureLimit program state stimulus).committedTransitions ≠ [])
    (completion : ParallelScopeReplay.waitCompletionStimulus stimulus)
    (kinds : ∀ transition ∈ (applyStimulusTraced closureLimit program state stimulus).committedTransitions.tail,
      ParallelScopeReplay.bodyOrRetirementTransition transition)
    (frame : ParallelScopeStructuralFrame parent state) (different : owner ≠ parent) :
    ParallelScopeReplay.ContinuationCommandHistory program owner initial
      (applyStimulus closureLimit program state stimulus).state
      (earlier ++ (applyStimulusTraced closureLimit program state stimulus).committedTransitions.tail) := by
  obtain ⟨rest, shape⟩ := applyStimulusTraced_emitted_original_stimulus closureLimit program state stimulus published
  have replayed := applyStimulusTraced_emitted_trace_replays closureLimit program state stimulus published
  rw [shape] at replayed kinds ⊢
  simp only [List.tail_cons] at kinds ⊢
  exact history.extend_wait_command program owner parent selected initial state _ earlier rest stimulus replayed
    completion kinds frame different

/-- Nonempty PMIS publications inherit actual admission and exact ordered replay
steps from the shared publication check; no execution-budget premise is added. -/
theorem applyStimulusTraced_parallel_scope_ordered_steps
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true)
    (published : (applyStimulusTraced closureLimit program state stimulus).committedTransitions ≠ []) :
    ∃ (replayedStimulus : Stimulus) (rest : List CommittedTransition) (admitted : RuntimeState)
      (successors : List RuntimeState),
      (applyStimulusTraced closureLimit program state stimulus).committedTransitions =
        .externalStimulus replayedStimulus :: rest ∧
      (admitStimulus program state replayedStimulus).outcome = .committed ∧
      (admitStimulus program state replayedStimulus).state = admitted ∧
      successors.length = rest.length ∧ (admitted :: successors).getLast? =
        some (applyStimulus closureLimit program state stimulus).state ∧
      ∀ pair ∈ rest.zip ((admitted :: successors).zip successors),
        ∃ record, pair.1 = .internalOperation record ∧
          InternalCommutation.replayInternalOperationOccurrence? program pair.2.1 record = some pair.2.2 := by
  exact ParallelScopeReplay.committedTransitions_ordered_steps program selected state _ _
    (applyStimulusTraced_emitted_trace_replays closureLimit program state stimulus published)

/-- PMIS-SELECT-01 binds every actual emitted internal record to its declared operation and owner scope. -/
theorem applyStimulusTraced_parallel_scope_record_declaration
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (selected : ParallelScopeStart.programSelected program = true)
    (record : InternalTransitionRecord)
    (member : .internalOperation record ∈ (applyStimulusTraced closureLimit program state stimulus).committedTransitions) :
    ∃ operation, program.operations.find? (·.id == record.operationId) = some operation ∧
      operation.id = record.operationId ∧ operation.kind = record.operationKind ∧
      operation ∈ program.operations.filter (fun op => program.operationScopes.any
        (fun binding => binding.operationId == op.id && binding.scopeId == record.owner.definitionScopeId)) := by
  have published : (applyStimulusTraced closureLimit program state stimulus).committedTransitions ≠ [] := by
    intro empty
    simp [empty] at member
  obtain ⟨ingress, rest, admitted, successors, shape, _, _, length, _, aligned⟩ :=
    applyStimulusTraced_parallel_scope_ordered_steps closureLimit program state stimulus selected published
  rw [shape] at member
  have restMember : CommittedTransition.internalOperation record ∈ rest := by simpa using member
  have enough : rest.length ≤ ((admitted :: successors).zip successors).length := by simp [List.length_zip, length]
  have projected : CommittedTransition.internalOperation record ∈
      (rest.zip ((admitted :: successors).zip successors)).map Prod.fst := by
    rw [List.map_fst_zip enough]
    exact restMember
  obtain ⟨pair, present, first⟩ := List.mem_map.mp projected
  obtain ⟨actual, same, replayed⟩ := aligned pair present
  have identity : actual = record := by simpa only [CommittedTransition.internalOperation.injEq] using same.symm.trans first
  subst actual
  exact ParallelScopeReplay.replayed_declaration_scope program pair.2.1 pair.2.2 record replayed

/-- Profiles outside PMIS retain the previous emitted-trace replay conclusion without additional runtime assumptions. -/
theorem applyStimulusTraced_emitted_trace_replays_of_unselected_parallel_scope
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (unselected : ParallelScopeStart.programSelected program = false)
    (published : (applyStimulusTraced closureLimit program state stimulus).committedTransitions ≠ []) :
    replayCommittedTransitions program state
        (applyStimulusTraced closureLimit program state stimulus).committedTransitions =
      some (applyStimulus closureLimit program state stimulus).state := by
  rw [← ParallelScopeReplay.committedTransitions_of_unselected program state _ unselected]
  exact applyStimulusTraced_emitted_trace_replays closureLimit program state stimulus published

end BpmnSemantics.SemanticProcess

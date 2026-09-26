import BpmnSemantics.SemanticProcess.TransactionReachableClassification
import BpmnSemantics.SemanticProcess.TransactionInitialBatch

/-! # Selected Transaction scheduling guarantee

Complete admitted-grammar reachability derives the only parallel frontier and its actual preparation.
The existing finite-batch theorem then supplies complete-state and canonical paired-publication equality
for every permutation of that frontier, with no assumed successor validity or preparation premise.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

/-- Every reachable multiple-offer frontier actually prepares from its complete valid predecessor. -/
theorem transaction_reachable_multi_frontier_prepares (p : Program)
    (graph : transactionCancellationProgramGraph p = true) (valid : programWellFormed p = true)
    (state : RuntimeState) (reachable : TransactionInternalPrefixReachable p state)
    (multiple : 2 ≤ (snapshotInternalTransitionFrontier p state).transitions.length) :
    ∃ instanceId prepared,
      runtimeStateWellFormed p instanceId state = true ∧
      prepareSnapshotArmingBatch? p state
        ((snapshotInternalTransitionFrontier p state).transitions.map (·.1)) = some prepared := by
  obtain ⟨roles⟩ := transactionCancellationProgramGraph_roles p graph
  obtain ⟨heads⟩ := transaction_admitted_initial_tasks p roles
  rcases transaction_reachable_frontier_classification p roles heads graph valid state reachable with bound | selected
  · omega
  · obtain ⟨instanceId, nonemptyId, same⟩ := selected
    subst state
    obtain ⟨left, right, _, _, _, forward, backward⟩ :=
      transaction_initial_batch_prepared p roles heads valid instanceId nonemptyId
    rcases transaction_split_frontier_orders p roles heads graph instanceId with order | order
    · exact ⟨instanceId, [.ordinary heads.left.operation left, .ordinary heads.right.operation right],
        transaction_split_wellFormed p roles valid instanceId nonemptyId, by rw [order]; exact forward⟩
    · exact ⟨instanceId, [.ordinary heads.right.operation right, .ordinary heads.left.operation left],
        transaction_split_wellFormed p roles valid instanceId nonemptyId, by rw [order]; exact backward⟩

/-- The actual refusal-aware runner accepts every permutation with equal full state and canonical E1/E2 pairs. -/
theorem transaction_reachable_multi_frontier_publication (p : Program)
    (graph : transactionCancellationProgramGraph p = true) (valid : programWellFormed p = true)
    (state : RuntimeState) (reachable : TransactionInternalPrefixReachable p state)
    (multiple : 2 ≤ (snapshotInternalTransitionFrontier p state).transitions.length)
    (noRefusal : (snapshotInternalTransitionFrontier p state).refusal = none)
    (commandId : SemanticId) :
    ∃ instanceId prepared,
      runtimeStateWellFormed p instanceId state = true ∧
      prepareSnapshotArmingBatch? p state
        ((snapshotInternalTransitionFrontier p state).transitions.map (·.1)) = some prepared ∧
      ∀ reordered, prepared.Perm reordered →
        ∃ final leftPublications rightPublications,
          runtimeStateWellFormed p instanceId final = true ∧
          (projectOpenFlowNodeOccurrencesWithCompensation? p final).isSome = true ∧
          fireSnapshotInternalBatch p commandId state prepared =
            .applied { state := final, publications := leftPublications.map (·.pair) } ∧
          fireSnapshotInternalBatch p commandId state reordered =
            .applied { state := final, publications := rightPublications.map (·.pair) } ∧
          canonicalAcceptedInternalPublicationPairs leftPublications =
            canonicalAcceptedInternalPublicationPairs rightPublications := by
  obtain ⟨instanceId, prepared, stateValid, selected⟩ :=
    transaction_reachable_multi_frontier_prepares p graph valid state reachable multiple
  exact ⟨instanceId, prepared, stateValid, selected,
    fun reordered permutation => snapshot_frontier_runner_perm p state instanceId commandId
      prepared reordered valid stateValid selected noRefusal permutation⟩

end BpmnSemantics.SemanticProcess

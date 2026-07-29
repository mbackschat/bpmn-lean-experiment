import BpmnSemantics.Experiments.CheckedSourceFrontier
import BpmnSemantics.Experiments.CheckedSourceParallelFrontier
import BpmnSemantics.SemanticProcess.Fixtures

/-! # Checked-source frontier witnesses

This module instantiates the single-token and two-token frontier characterizations on the retained parallel checked process. It also retains the node-order discriminators that force the two-token result to be stated up to permutation.
-/

namespace BpmnSemantics.Experiments.CheckedSourceFrontierConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.Experiments.CheckedSourceAdmission
open BpmnSemantics.Experiments.CheckedSourceFrontier
open BpmnSemantics.Experiments.CheckedSourceParallelFrontier
open BpmnSemantics.Experiments.CheckedSourceSemantics

private def atFork : SourceRuntimeState :=
  { CheckedSourceSemantics.runningStartState parallelInstanceId with
    initiationPending := false
    tokens := [⟨"Flow_StartToFork"⟩] }

private def startToFork : CheckedSequenceFlow :=
  { id := ⟨"Flow_StartToFork"⟩
    sourceId := ⟨"StartEvent_1"⟩
    targetId := ⟨"Gateway_Fork"⟩ }

private def forkNode : CheckedNode :=
  .parallelGateway ⟨"Gateway_Fork"⟩ .diverging

private def atHalfJoin : SourceRuntimeState :=
  { CheckedSourceSemantics.runningStartState parallelInstanceId with
    initiationPending := false
    tokens := [⟨"Flow_AToJoin"⟩] }

private def aToJoin : CheckedSequenceFlow :=
  { id := ⟨"Flow_AToJoin"⟩
    sourceId := ⟨"UserTask_A"⟩
    targetId := ⟨"Gateway_Join"⟩ }

private def joinNode : CheckedNode :=
  .parallelGateway ⟨"Gateway_Join"⟩ .converging

private theorem premises :
    sourceGraphWellFormed parallelCheckedProcess = true ∧
      startToFork ∈ parallelCheckedProcess.sequenceFlows ∧
      forkNode ∈ parallelCheckedProcess.nodes ∧
      aToJoin ∈ parallelCheckedProcess.sequenceFlows ∧
      joinNode ∈ parallelCheckedProcess.nodes := by decide

/-- A token before the fork enables exactly the diverging gateway. -/
theorem forkFrontierIsSingleton :
    enabledTransitions parallelCheckedProcess atFork =
      [(forkNode, duplicateToken atFork ⟨"Flow_StartToFork"⟩
        [⟨"Flow_ForkToA"⟩, ⟨"Flow_ForkToB"⟩])] := by
  obtain ⟨wellFormed, flowMember, nodeMember, _, _⟩ := premises
  rw [enabledTransitionsAtSingleToken parallelCheckedProcess atFork startToFork
    forkNode wellFormed flowMember nodeMember (by rfl) (by decide) (by decide)]
  rfl

/-- One branch-output token before the join enables no internal transition. -/
theorem halfJoinFrontierIsEmpty :
    enabledTransitions parallelCheckedProcess atHalfJoin = [] := by
  obtain ⟨wellFormed, _, _, flowMember, nodeMember⟩ := premises
  rw [enabledTransitionsAtSingleToken parallelCheckedProcess atHalfJoin aToJoin
    joinNode wellFormed flowMember nodeMember (by rfl) (by decide) (by decide)]
  rfl

private def forkToA : CheckedSequenceFlow :=
  { id := ⟨"Flow_ForkToA"⟩
    sourceId := ⟨"Gateway_Fork"⟩
    targetId := ⟨"UserTask_A"⟩ }

private def forkToB : CheckedSequenceFlow :=
  { id := ⟨"Flow_ForkToB"⟩
    sourceId := ⟨"Gateway_Fork"⟩
    targetId := ⟨"UserTask_B"⟩ }

private def taskA : CheckedNode := .userTask ⟨"UserTask_A"⟩ (some "A")

private def taskB : CheckedNode := .userTask ⟨"UserTask_B"⟩ (some "B")

/-- Immediately after the fork produced both branch-input tokens. -/
private def atBothBranches : SourceRuntimeState :=
  { atFork with tokens := [⟨"Flow_ForkToA"⟩, ⟨"Flow_ForkToB"⟩] }

/-- Branch A waits at the join while branch B is still at its task input. -/
private def atJoinAndBranchB : SourceRuntimeState :=
  { atFork with tokens := [⟨"Flow_AToJoin"⟩, ⟨"Flow_ForkToB"⟩] }

/-- Both join inputs are offered, so one converging gateway is the only target. -/
private def atReadyJoin : SourceRuntimeState :=
  { atFork with tokens := [⟨"Flow_AToJoin"⟩, ⟨"Flow_BToJoin"⟩] }

/-- Both branch tokens are present but initiation has not settled, so the Start Event is still enabled alongside them. -/
private def atBothBranchesPending : SourceRuntimeState :=
  { atBothBranches with initiationPending := true }

/-- Graph-equivalent to the retained parallel process except for node order.

This is a synthetic node-order discriminator, not an admitted source. It keeps `parallelCheckedProcess.identity`, including that fixture's `sourceSha256`, so the order refutations vary node order alone. Two different node lists cannot both be those exact bytes: the retained identity is a deliberately shared fixture value here and asserts nothing about admission. The definition is private to this witness module, is never admitted, executed as a definition of record, or projected into an observation, and no evidence artifact may cite it. -/
private def reorderedParallelProcess : CheckedProcess :=
  { parallelCheckedProcess with nodes := parallelCheckedProcess.nodes.reverse }

private theorem twoTokenPremises :
    sourceGraphWellFormed reorderedParallelProcess = true ∧
      forkToA ∈ parallelCheckedProcess.sequenceFlows ∧
      forkToB ∈ parallelCheckedProcess.sequenceFlows ∧
      taskA ∈ parallelCheckedProcess.nodes ∧
      taskB ∈ parallelCheckedProcess.nodes := by decide

/-- The reordered source holds identity, Process ID, Sequence Flows, and node membership fixed while changing only node order.

This fact is deliberately unreferenced. It audits the construction of `reorderedParallelProcess`, so that `enabledListOrderFollowsNodeOrder` and `reorderedFrontierRefusesExactEquality` are known to discriminate node order rather than some other difference. The identity conjunct records that the discriminator holds identity fixed; per `reorderedParallelProcess` it is not a byte-identity claim. Nothing consumes this fact, so it does not itself prevent a future edit from perturbing the fixture further. -/
private theorem reorderedDiffersOnlyInNodeOrder :
    reorderedParallelProcess.identity = parallelCheckedProcess.identity ∧
      reorderedParallelProcess.processId = parallelCheckedProcess.processId ∧
      reorderedParallelProcess.sequenceFlows = parallelCheckedProcess.sequenceFlows ∧
      reorderedParallelProcess.nodes.Perm parallelCheckedProcess.nodes ∧
      reorderedParallelProcess.nodes ≠ parallelCheckedProcess.nodes :=
  ⟨rfl, rfl, rfl, List.reverse_perm _, by decide⟩

/-- Node order is visible in the raw enabled list: the graph-equivalent sources disagree on equality and agree up to permutation. -/
theorem enabledListOrderFollowsNodeOrder :
    enabledTransitions reorderedParallelProcess atBothBranches ≠
        enabledTransitions parallelCheckedProcess atBothBranches ∧
      (enabledTransitions reorderedParallelProcess atBothBranches).Perm
        (enabledTransitions parallelCheckedProcess atBothBranches) := by
  exact ⟨by decide, by decide⟩

/-- Exact equality is false on the reordered graph while the quantified permutation result still holds. -/
theorem reorderedFrontierRefusesExactEquality :
    enabledTransitions reorderedParallelProcess atBothBranches ≠
        (((fireNode? reorderedParallelProcess taskA atBothBranches).map
            fun successor => (taskA, successor)).toList ++
          ((fireNode? reorderedParallelProcess taskB atBothBranches).map
            fun successor => (taskB, successor)).toList) ∧
      (enabledTransitions reorderedParallelProcess atBothBranches).Perm
        (((fireNode? reorderedParallelProcess taskA atBothBranches).map
            fun successor => (taskA, successor)).toList ++
          ((fireNode? reorderedParallelProcess taskB atBothBranches).map
            fun successor => (taskB, successor)).toList) := by
  obtain ⟨reorderedWellFormed, _, _, _, _⟩ := twoTokenPremises
  exact ⟨by decide, enabledTransitionsAtTwoTokens reorderedParallelProcess
    atBothBranches forkToA forkToB taskA taskB reorderedWellFormed
    (by decide) (by decide) (by decide) (by decide) (by rfl) (by rfl)
    (by decide) (by rfl) (by rfl)⟩

/-- Even on the unmodified fixture, exchanging the two anchors refutes an orientation-dependent equality while preserving the permutation. -/
theorem swappedAnchorsRefuseExactEquality :
    enabledTransitions parallelCheckedProcess atBothBranches ≠
        (((fireNode? parallelCheckedProcess taskB atBothBranches).map
            fun successor => (taskB, successor)).toList ++
          ((fireNode? parallelCheckedProcess taskA atBothBranches).map
            fun successor => (taskA, successor)).toList) ∧
      (enabledTransitions parallelCheckedProcess atBothBranches).Perm
        (((fireNode? parallelCheckedProcess taskB atBothBranches).map
            fun successor => (taskB, successor)).toList ++
          ((fireNode? parallelCheckedProcess taskA atBothBranches).map
            fun successor => (taskA, successor)).toList) := by
  obtain ⟨_, memberForkToA, memberForkToB, memberA, memberB⟩ :=
    twoTokenPremises
  obtain ⟨wellFormed, _, _, _, _⟩ := premises
  exact ⟨by decide, enabledTransitionsAtTwoTokens parallelCheckedProcess
    atBothBranches forkToB forkToA taskB taskA wellFormed
    memberForkToB memberForkToA memberB memberA (by rfl) (by rfl)
    (by decide) (by decide) (by rfl)⟩

/-- Both branch tokens after the fork enable exactly the two independent User Task activations. -/
theorem forkedFrontierEnablesBothBranchTasks :
    (enabledTransitions parallelCheckedProcess atBothBranches).Perm
      [ (taskA, activateUserTask atBothBranches parallelInstanceId
          ⟨"UserTask_A"⟩ (some "A") ⟨"Flow_ForkToA"⟩ ⟨"Flow_AToJoin"⟩)
      , (taskB, activateUserTask atBothBranches parallelInstanceId
          ⟨"UserTask_B"⟩ (some "B") ⟨"Flow_ForkToB"⟩ ⟨"Flow_BToJoin"⟩) ] := by
  obtain ⟨_, memberForkToA, memberForkToB, memberA, memberB⟩ :=
    twoTokenPremises
  obtain ⟨wellFormed, _, _, _, _⟩ := premises
  refine List.Perm.trans (enabledTransitionsAtTwoTokens parallelCheckedProcess
    atBothBranches forkToA forkToB taskA taskB wellFormed memberForkToA
    memberForkToB memberA memberB (by rfl) (by rfl) (by decide) (by rfl) (by rfl)) ?_
  decide

/-- A half-ready join contributes nothing while its live sibling target still fits the two-token characterization. -/
theorem halfReadyJoinContributesNothing :
    fireNode? parallelCheckedProcess joinNode atJoinAndBranchB = none ∧
      (enabledTransitions parallelCheckedProcess atJoinAndBranchB).length = 1 ∧
      (fireNode? parallelCheckedProcess taskB atJoinAndBranchB).isSome = true ∧
      (enabledTransitions parallelCheckedProcess atJoinAndBranchB).Perm
        (((fireNode? parallelCheckedProcess joinNode atJoinAndBranchB).map
            fun successor => (joinNode, successor)).toList ++
          ((fireNode? parallelCheckedProcess taskB atJoinAndBranchB).map
            fun successor => (taskB, successor)).toList) := by
  obtain ⟨_, _, memberForkToB, _, memberB⟩ := twoTokenPremises
  obtain ⟨wellFormed, _, _, memberAToJoin, memberJoin⟩ := premises
  exact ⟨by decide, by decide, by decide, enabledTransitionsAtTwoTokens parallelCheckedProcess
    atJoinAndBranchB aToJoin forkToB joinNode taskB wellFormed
    memberAToJoin memberForkToB memberJoin memberB (by rfl) (by rfl)
    (by decide) (by rfl) (by rfl)⟩

/-- Distinct targets and a settled initiation flag are load-bearing: at each violating instance the theorem's own permutation conclusion is false, because a ready join contributes once rather than twice and pending initiation adds an unaccounted Start transition.

Each refutation names `List.Perm` at the exact arguments the theorem would receive rather than comparing list lengths, so it does not rest on the unstated step that permutation preserves length. `List.decidablePerm` carries `Classical.choice`, so this witness has the same axiom footprint as `enabledTransitionsAtTwoTokens` itself; a refutation of that theorem is worth no less for depending on exactly the axioms the theorem already depends on. -/
theorem excludedTwoTokenShapes :
    ¬ (enabledTransitions parallelCheckedProcess atReadyJoin).Perm
        (((fireNode? parallelCheckedProcess joinNode atReadyJoin).map
            fun successor => (joinNode, successor)).toList ++
          ((fireNode? parallelCheckedProcess joinNode atReadyJoin).map
            fun successor => (joinNode, successor)).toList) ∧
      ¬ (enabledTransitions parallelCheckedProcess atBothBranchesPending).Perm
        (((fireNode? parallelCheckedProcess taskA atBothBranchesPending).map
            fun successor => (taskA, successor)).toList ++
          ((fireNode? parallelCheckedProcess taskB atBothBranchesPending).map
            fun successor => (taskB, successor)).toList) ∧
      (enabledTransitions parallelCheckedProcess atReadyJoin).length = 1 ∧
      (enabledTransitions parallelCheckedProcess atBothBranchesPending).length = 3 := by
  decide

def stageThreeAFrontierChecks : Bool :=
  decide (
    enabledTransitions parallelCheckedProcess atFork =
      [(forkNode, duplicateToken atFork ⟨"Flow_StartToFork"⟩
        [⟨"Flow_ForkToA"⟩, ⟨"Flow_ForkToB"⟩])] ∧
    enabledTransitions parallelCheckedProcess atHalfJoin = [])

end BpmnSemantics.Experiments.CheckedSourceFrontierConformance

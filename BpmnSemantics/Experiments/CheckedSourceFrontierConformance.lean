import BpmnSemantics.Experiments.CheckedSourceFrontier
import BpmnSemantics.SemanticProcess.Fixtures

/-! # Single-token frontier witnesses

This module instantiates the Stage 3a characterization at the fork and half-join frontiers of the retained parallel checked process.
-/

namespace BpmnSemantics.Experiments.CheckedSourceFrontierConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.Experiments.CheckedSourceAdmission
open BpmnSemantics.Experiments.CheckedSourceFrontier
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

def stageThreeAFrontierChecks : Bool :=
  decide (
    enabledTransitions parallelCheckedProcess atFork =
      [(forkNode, duplicateToken atFork ⟨"Flow_StartToFork"⟩
        [⟨"Flow_ForkToA"⟩, ⟨"Flow_ForkToB"⟩])] ∧
    enabledTransitions parallelCheckedProcess atHalfJoin = [])

end BpmnSemantics.Experiments.CheckedSourceFrontierConformance

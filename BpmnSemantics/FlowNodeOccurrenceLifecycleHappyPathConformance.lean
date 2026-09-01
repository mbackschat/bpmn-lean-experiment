import BpmnSemantics.FlowNodeOccurrenceLifecycleFixtures
import BpmnSemantics.CallActivityConformance
import BpmnSemantics.EmbeddedSubProcessCompletionConformance

/-! # Flow-node occurrence lifecycle happy-path conformance

This module owns the executable witnesses for exact sequential, Call Activity, and embedded Sub-Process lifecycle pairing.
-/

namespace BpmnSemantics.FlowNodeOccurrenceLifecycleConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def sequentialStartTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit SequentialUserTask.program initialState
    SequentialUserTask.startStimulus

def sequentialCompletionTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit SequentialUserTask.program
    SequentialUserTask.afterStartState SequentialUserTask.completionStimulus

/-- The real admitted Start to User Task transition emits the exact instantaneous Start and one retained task occurrence. -/
theorem sequential_start_emits_exact_flow_node_units :
    sequentialStartTrace.result =
        applyStimulus scenarioClosureLimit SequentialUserTask.program initialState
          SequentialUserTask.startStimulus ∧
      sequentialStartTrace.flowNodeOccurrenceLifecycles.length =
        sequentialStartTrace.committedTransitions.length ∧
      (lifecycleStarts sequentialStartTrace).map (fun start => start.elementId.value) =
        ["StartEvent_1", "UserTask_Approve"] ∧
      (lifecycleEnds sequentialStartTrace).map (fun ending => ending.terminal) =
        [.completed] ∧
      (lifecycleStarts sequentialStartTrace).count
        { anchor := sequentialTaskAnchor
          processId := SequentialUserTask.program.processId
          elementId := ⟨"UserTask_Approve"⟩
          owner := SequentialUserTask.rootOwner } = 1 := by
  decide +kernel

/-- Completing the exact task resolves its prior anchor once and emits one instantaneous End Event. -/
theorem sequential_completion_pairs_the_task_and_end_once :
    (lifecycleEnds sequentialCompletionTrace).count
        { anchor := sequentialTaskAnchor, terminal := .completed } = 1 ∧
      (lifecycleStarts sequentialCompletionTrace).map (fun start => start.elementId.value) =
        ["EndEvent_1"] ∧
      (lifecycleEnds sequentialCompletionTrace).filter
        (fun ending => ending.terminal = .cancelled) = [] := by
  decide +kernel

/-- Both real sequential command prefixes fold to their independently projected exact heads. -/
theorem sequential_lifecycle_fold_matches_independent_projection :
    foldFlowNodeOccurrenceDeltas [] sequentialStartTrace.flowNodeOccurrenceLifecycles =
        projectOpenFlowNodeOccurrences? SequentialUserTask.program
          sequentialStartTrace.result.state ∧
      foldFlowNodeOccurrenceDeltas
          ((projectOpenFlowNodeOccurrences? SequentialUserTask.program
            SequentialUserTask.afterStartState).getD [])
          sequentialCompletionTrace.flowNodeOccurrenceLifecycles =
        projectOpenFlowNodeOccurrences? SequentialUserTask.program
          sequentialCompletionTrace.result.state := by
  decide +kernel

def callStartTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit CallActivityConformance.program initialState
    CallActivityConformance.start

def callReturnTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit CallActivityConformance.program
    CallActivityConformance.calledWaiting.state CallActivityConformance.completeCalled

def callAnchor : SemanticFlowNodeOccurrenceAnchor :=
  .callActivity
    { processInstanceId := CallActivityConformance.callerInstanceId
      elementId := ⟨"B_Call"⟩
      activation := 1 }

/-- Invoke and Return are one Call Activity occurrence, never two operation-count occurrences. -/
theorem call_activity_invoke_and_return_pair_one_occurrence :
    ((lifecycleStarts callStartTrace).filter (fun start => start.anchor = callAnchor)).length = 1 ∧
      ((lifecycleEnds callStartTrace).filter (fun ending => ending.anchor = callAnchor)).isEmpty ∧
      ((lifecycleStarts callReturnTrace).filter (fun start => start.anchor = callAnchor)).isEmpty ∧
      (lifecycleEnds callReturnTrace).count
        { anchor := callAnchor, terminal := .completed } = 1 := by
  decide +kernel

def embeddedStartTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit EmbeddedSubProcessCompletionConformance.program
    initialState EmbeddedSubProcessCompletionConformance.start

def embeddedFirstCompletionTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit EmbeddedSubProcessCompletionConformance.program
    EmbeddedSubProcessCompletionConformance.childWaiting.state
    EmbeddedSubProcessCompletionConformance.completeA

def embeddedSecondCompletionTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit EmbeddedSubProcessCompletionConformance.program
    EmbeddedSubProcessCompletionConformance.afterA.state
    EmbeddedSubProcessCompletionConformance.completeB

def embeddedScopeAnchor : SemanticFlowNodeOccurrenceAnchor :=
  .scope
    { processInstanceId := EmbeddedSubProcessCompletionConformance.instanceId
      definitionScopeId := EmbeddedSubProcessCompletionConformance.childScopeId
      activation := 1 }

/-- Enter and quiescent Complete are one embedded Sub-Process occurrence across commands. -/
theorem embedded_scope_entry_and_completion_pair_one_occurrence :
    ((lifecycleStarts embeddedStartTrace).filter
        (fun start => start.anchor = embeddedScopeAnchor)).length = 1 ∧
      ((lifecycleEnds embeddedFirstCompletionTrace).filter
        (fun ending => ending.anchor = embeddedScopeAnchor)).isEmpty ∧
      ((lifecycleStarts embeddedSecondCompletionTrace).filter
        (fun start => start.anchor = embeddedScopeAnchor)).isEmpty ∧
      (lifecycleEnds embeddedSecondCompletionTrace).count
        { anchor := embeddedScopeAnchor, terminal := .completed } = 1 := by
  decide +kernel

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance

module

public import BpmnSemantics.FlowNodeOccurrenceLifecycleFixtures
public import BpmnSemantics.CallActivityConformanceFixtures
public import BpmnSemantics.EmbeddedSubProcessCompletionConformance
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
public import BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance

/-! Fixture definitions and executable checks of [`FlowNodeOccurrenceLifecycleHappyPathConformance`](FlowNodeOccurrenceLifecycleHappyPathConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

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
def sequential_start_emits_exact_flow_node_units : Bool := decide <|
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
          owner := SequentialUserTask.rootOwner } = 1

/-- Completing the exact task resolves its prior anchor once and emits one instantaneous End Event. -/
def sequential_completion_pairs_the_task_and_end_once : Bool := decide <|
    (lifecycleEnds sequentialCompletionTrace).count
        { anchor := sequentialTaskAnchor, terminal := .completed } = 1 ∧
      (lifecycleStarts sequentialCompletionTrace).map (fun start => start.elementId.value) =
        ["EndEvent_1"] ∧
      (lifecycleEnds sequentialCompletionTrace).filter
        (fun ending => ending.terminal = .cancelled) = []

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
def call_activity_invoke_and_return_pair_one_occurrence : Bool := decide <|
    ((lifecycleStarts callStartTrace).filter (fun start => start.anchor = callAnchor)).length = 1 ∧
      ((lifecycleEnds callStartTrace).filter (fun ending => ending.anchor = callAnchor)).isEmpty ∧
      ((lifecycleStarts callReturnTrace).filter (fun start => start.anchor = callAnchor)).isEmpty ∧
      (lifecycleEnds callReturnTrace).count
        { anchor := callAnchor, terminal := .completed } = 1

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
def embedded_scope_entry_and_completion_pair_one_occurrence : Bool := decide <|
    ((lifecycleStarts embeddedStartTrace).filter
        (fun start => start.anchor = embeddedScopeAnchor)).length = 1 ∧
      ((lifecycleEnds embeddedFirstCompletionTrace).filter
        (fun ending => ending.anchor = embeddedScopeAnchor)).isEmpty ∧
      ((lifecycleStarts embeddedSecondCompletionTrace).filter
        (fun start => start.anchor = embeddedScopeAnchor)).isEmpty ∧
      (lifecycleEnds embeddedSecondCompletionTrace).count
        { anchor := embeddedScopeAnchor, terminal := .completed } = 1

/-- Every executable check of this module, named for the driver's failure report. -/
def flowNodeOccurrenceLifecycleHappyPathConformanceChecks : List (String × Bool) := [
  ("sequential_start_emits_exact_flow_node_units", sequential_start_emits_exact_flow_node_units),
  ("sequential_completion_pairs_the_task_and_end_once", sequential_completion_pairs_the_task_and_end_once),
  ("call_activity_invoke_and_return_pair_one_occurrence", call_activity_invoke_and_return_pair_one_occurrence),
  ("embedded_scope_entry_and_completion_pair_one_occurrence", embedded_scope_entry_and_completion_pair_one_occurrence)
]

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance

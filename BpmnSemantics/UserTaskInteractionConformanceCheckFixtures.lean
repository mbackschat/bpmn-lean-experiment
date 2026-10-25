module

public import BpmnSemantics.Conformance
public import BpmnSemantics.SequentialUserTaskFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity

/-! Fixture definitions and executable checks of [`UserTaskInteractionConformance`](UserTaskInteractionConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.UserTaskInteractionConformance


open BpmnSemantics
open BpmnSemantics.SequentialUserTask

def exactTaskId : UserTaskInstanceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := ⟨"UserTask_Approve"⟩
    activation := 1 }

def exactCompletionInteraction : EnabledInteraction :=
  .completeUserTaskInstance exactTaskId

def exactCompletionStimulus : Stimulus :=
  .completeUserTaskInstance
    ⟨"complete-user-task-instance"⟩ exactTaskId submittedValues

def interactionObservations : List ObservationKind :=
  [ .deployment
  , .commandResults
  , .processStatus
  , .activeWaits
  , .openUserTasks
  , .openTimers
  , .openEffects
  , .variables
  , .enabledInteractions
  , .logicalTime ]

def interactionScenario (id : String) (stimuli : List Stimulus) : Scenario :=
  { kind := .scenario
    id := ⟨id⟩
    profile := ⟨"cibseven-2.2.0-user-task-process-data-draft"⟩
    bpmn := contractScenario.bpmn
    stimuli
    observations := interactionObservations
    provenance := contractScenario.provenance }

def successfulScenario : Scenario :=
  interactionScenario "user-task-discovery-completion"
    [ startStimulus
    , exactCompletionStimulus ]

def wrongActivationScenario : Scenario :=
  interactionScenario "user-task-wrong-activation"
    [ startStimulus
    , .completeUserTaskInstance ⟨"wrong-activation"⟩
        { exactTaskId with activation := 2 }
        [{ name := "decision", value := .string "approved" }] ]

def staleCompletionScenario : Scenario :=
  interactionScenario "user-task-stale-completion"
    [ startStimulus
    , exactCompletionStimulus
    , .completeUserTaskInstance
        ⟨"complete-stale-user-task-instance"⟩ exactTaskId
        [{ name := "decision", value := .string "denied" }] ]

def waitingObservation : StateObservation :=
  { instanceId := ⟨"Instance_1"⟩
    status := .running
    activeWaits :=
      [ { elementId := ⟨"UserTask_Approve"⟩
          kind := .userTask
          multiplicity := 1 } ]
    openUserTasks :=
      [ { id := exactTaskId
          name := some "Approve"
          state := .active } ]
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := initialBindings
    enabledInteractions := [exactCompletionInteraction]
    logicalTimeMs := 0 }

def completedObservation : StateObservation :=
  { instanceId := ⟨"Instance_1"⟩
    status := .completed
    activeWaits := []
    openUserTasks := []
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := completedBindings
    enabledInteractions := []
    logicalTimeMs := 0 }

def expectedSuccessfulTrace : List CanonicalObservation :=
  [ .deployment .committed
  , .command ⟨"start-process"⟩ .committed
  , .state waitingObservation
  , .command ⟨"complete-user-task-instance"⟩ .committed
  , .state completedObservation ]

def expectedWrongActivationTrace : List CanonicalObservation :=
  [ .deployment .committed
  , .command ⟨"start-process"⟩ .committed
  , .state waitingObservation
  , .command ⟨"wrong-activation"⟩ .rejected
  , .state waitingObservation ]

def expectedStaleCompletionTrace : List CanonicalObservation :=
  expectedSuccessfulTrace ++
    [ .command ⟨"complete-stale-user-task-instance"⟩ .rejected
    , .state completedObservation ]

def wrong_activation_scenario_trace_is_exact : Bool := decide <|
    run wrongActivationScenario =
      { outcome := .semantic .rejected
        trace := expectedWrongActivationTrace }

def zero_closure_limit_is_a_harness_failure : Bool := decide <|
    runWithClosureLimit 0 successfulScenario =
      { outcome := .harnessFailure
        trace := [.deployment .committed] }

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("wrong_activation_scenario_trace_is_exact", wrong_activation_scenario_trace_is_exact),
  ("zero_closure_limit_is_a_harness_failure", zero_closure_limit_is_a_harness_failure)
]

end BpmnSemantics.UserTaskInteractionConformance

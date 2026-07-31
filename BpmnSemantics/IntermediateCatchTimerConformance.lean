import BpmnSemantics.SemanticProcess

/-! # BpmnSemantics.IntermediateCatchTimerConformance — exact PT1S timer locks

These checks own the direct Lean account for the admitted Intermediate Catch Timer capsule: independent literal normalization, exact-deadline firing, full occurrence/time refusal, and canonical observations.
-/

namespace BpmnSemantics.IntermediateCatchTimerConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile :=
          ⟨"cibseven-2.2.0-intermediate-catch-timer-draft"⟩
        sourceId := ⟨"intermediate-catch-timer-pt1s-process"⟩
        sourceSha256 :=
          "b3389192ebed301b9756441dbbbe860ca489917793287cf6ce907a273ce919d5" }
    processId := ⟨"Process_IntermediateCatchTimer"⟩
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_1"⟩
      , .noneStartEvent ⟨"StartEvent_1"⟩
      , .intermediateCatchTimerEvent ⟨"TimerCatch_PT1S"⟩ "PT1S" ]
    sequenceFlows :=
      [ { id := ⟨"Flow_StartToTimer"⟩
          sourceId := ⟨"StartEvent_1"⟩
          targetId := ⟨"TimerCatch_PT1S"⟩ }
      , { id := ⟨"Flow_TimerToEnd"⟩
          sourceId := ⟨"TimerCatch_PT1S"⟩
          targetId := ⟨"EndEvent_1"⟩ } ] }

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile :=
          ⟨"cibseven-2.2.0-intermediate-catch-timer-draft"⟩
        sourceId := ⟨"intermediate-catch-timer-pt1s-process"⟩
        sourceSha256 :=
          "b3389192ebed301b9756441dbbbe860ca489917793287cf6ce907a273ce919d5" }
    processId := ⟨"Process_IntermediateCatchTimer"⟩
    controlPlaces :=
      [ { id := ⟨"place:Flow_StartToTimer"⟩
          origin := { elementId := ⟨"Flow_StartToTimer"⟩ } }
      , { id := ⟨"place:Flow_TimerToEnd"⟩
          origin := { elementId := ⟨"Flow_TimerToEnd"⟩ } } ]
    operations :=
      [ .terminate
          ⟨"operation:EndEvent_1"⟩
          { elementId := ⟨"EndEvent_1"⟩ }
          ⟨"place:Flow_TimerToEnd"⟩
      , .initiate
          ⟨"operation:StartEvent_1"⟩
          { elementId := ⟨"StartEvent_1"⟩ }
          ⟨"place:Flow_StartToTimer"⟩
      , .awaitTimer
          ⟨"operation:TimerCatch_PT1S"⟩
          { elementId := ⟨"TimerCatch_PT1S"⟩ }
          ⟨"place:Flow_StartToTimer"⟩
          ⟨"place:Flow_TimerToEnd"⟩
          { elementId := ⟨"TimerCatch_PT1S"⟩, durationMs := 1000 } ] }

def timerId : TimerOccurrenceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := ⟨"TimerCatch_PT1S"⟩
    activation := 1 }

def timerWait : TimerWait :=
  { processInstanceId := timerId.processInstanceId
    elementId := ⟨timerId.elementId.value⟩
    activation := timerId.activation
    deadlineMs := 1000
    output := ⟨"place:Flow_TimerToEnd"⟩ }

def fireCommandId : SemanticId :=
  ⟨"fire-timer-sha256:6abd9ffaf10c2bcefd54580956fd16ca64043ce25367c6f8a5b697033bca5c3b"⟩

private def observations : List ObservationKind :=
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

def scenario : Scenario :=
  { kind := .scenario
    id := ⟨"intermediate-catch-timer-pt1s"⟩
    profile := ⟨"cibseven-2.2.0-intermediate-catch-timer-draft"⟩
    bpmn :=
      { id := ⟨"intermediate-catch-timer-pt1s-process"⟩
        relativePath := "scenarios/intermediate-catch-timer/process.bpmn"
        sha256 :=
          "b3389192ebed301b9756441dbbbe860ca489917793287cf6ce907a273ce919d5" }
    stimuli :=
      [ .startProcess
          ⟨"start-process"⟩
          ⟨"Process_IntermediateCatchTimer"⟩
          ⟨"Instance_1"⟩
      , .fireTimer fireCommandId timerId 1000 ]
    observations
    provenance :=
      { normativeRefs :=
          [ "BPMN 2.0.2 §10.5.4"
          , "BPMN 2.0.2 §10.5.5"
          , "BPMN 2.0.2 Table 10.89"
          , "BPMN 2.0.2 Table 10.101"
          , "BPMN 2.0.2 Table 10.122" ]
        cibRevision := "834a9874760de8a0107f7c1b32806e37f17fb017"
        cibRefs :=
          [ "engine/src/main/java/org/cibseven/bpm/engine/impl/bpmn/behavior/IntermediateCatchEventActivityBehavior.java"
          , "engine/src/main/java/org/cibseven/bpm/engine/impl/jobexecutor/TimerCatchIntermediateEventJobHandler.java"
          , "engine/src/test/java/org/cibseven/bpm/engine/test/bpmn/event/timer/IntermediateTimerEventTest.java#testCatchingTimerEvent" ] } }

def waitingObservation : StateObservation :=
  { instanceId := ⟨"Instance_1"⟩
    status := .running
    activeWaits :=
      [ { elementId := ⟨"TimerCatch_PT1S"⟩
          kind := .timer
          multiplicity := 1 } ]
    openUserTasks := []
    openMessageSubscriptions := []
    openTimers := [{ id := timerId, deadlineMs := 1000 }]
    openEffects := []
    variables := []
    enabledInteractions := []
    logicalTimeMs := 0 }

def completedObservation : StateObservation :=
  { instanceId := ⟨"Instance_1"⟩
    status := .completed
    activeWaits := []
    openUserTasks := []
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := []
    enabledInteractions := []
    logicalTimeMs := 1000 }

def expectedTrace : List CanonicalObservation :=
  [ .deployment .committed
  , .command ⟨"start-process"⟩ .committed
  , .state waitingObservation
  , .command fireCommandId .committed
  , .state completedObservation ]

example : checkedWellFormed checkedProcess = true := by decide
example : programWellFormed program = true := by decide
example : lowerCheckedProcess checkedProcess = program := by decide

example :
    runScenario program scenario =
      { outcome := .semantic .committed, trace := expectedTrace } := by
  decide

example :
    applyStimulus scenarioClosureLimit program
        (singletonTimerWaitingState timerWait)
        (.fireTimer fireCommandId timerId 999) =
      { outcome := .rejected
        state := singletonTimerWaitingState timerWait
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  timer_identity_or_time_mismatch_is_rejected
    program timerWait fireCommandId timerId 999 0 (by decide)

/-- The admitted timer does not permit early firing; exact deadline equality is semantically material rather than a host-scheduler convenience. -/
theorem early_timer_firing_is_not_permitted :
    (applyStimulus scenarioClosureLimit program
      (singletonTimerWaitingState timerWait)
      (.fireTimer fireCommandId timerId 999)).outcome ≠ .committed := by
  decide

example :
    applyStimulus scenarioClosureLimit program
        (singletonTimerWaitingState timerWait)
        (.fireTimer fireCommandId timerId 1001) =
      { outcome := .rejected
        state := singletonTimerWaitingState timerWait
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  timer_identity_or_time_mismatch_is_rejected
    program timerWait fireCommandId timerId 1001 0 (by decide)

end BpmnSemantics.IntermediateCatchTimerConformance

module

public import BpmnSemantics.SemanticProcess.ExecutionRuntime
import BpmnSemantics.SemanticProcess.Execution
public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
public import BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.StrictJson
import all BpmnSemantics.SemanticProcess.BoundedScope
import all BpmnSemantics.SemanticProcess.BoundedTask
import all BpmnSemantics.SemanticProcess.BusinessTaskCommandAdmission
import all BpmnSemantics.SemanticProcess.CallActivityAdmission
import all BpmnSemantics.SemanticProcess.CallDataStateValidation
import all BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import all BpmnSemantics.SemanticProcess.ClosureLimit
import all BpmnSemantics.SemanticProcess.CommandAdmission
import all BpmnSemantics.SemanticProcess.CommandStartBindings
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
import all BpmnSemantics.SemanticProcess.CompensationSourceLowering
import all BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import all BpmnSemantics.SemanticProcess.CompensationStartDataAdmission
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.ControlPositionProjection
import all BpmnSemantics.SemanticProcess.DeclaredScopeTransition
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
import all BpmnSemantics.SemanticProcess.ErrorDefinition
import all BpmnSemantics.SemanticProcess.EventBasedGateway
import all BpmnSemantics.SemanticProcess.ExecutionRuntime
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceEffectProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidityCore
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceUserTaskProgramValidity
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceWaitProgramValidity
import all BpmnSemantics.SemanticProcess.GraphReachability
import all BpmnSemantics.SemanticProcess.GraphValidation
import all BpmnSemantics.SemanticProcess.Incident
import all BpmnSemantics.SemanticProcess.InternalCommutationCore
import all BpmnSemantics.SemanticProcess.InternalCommutationRegion
import all BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
import all BpmnSemantics.SemanticProcess.InternalEndPreparation
import all BpmnSemantics.SemanticProcess.InternalExecutionFrontier
import all BpmnSemantics.SemanticProcess.InternalLocalControlPositionDelta
import all BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import all BpmnSemantics.SemanticProcess.InternalPreparedArming
import all BpmnSemantics.SemanticProcess.InternalPreparedFrontier
import all BpmnSemantics.SemanticProcess.InternalPreparedTransition
import all BpmnSemantics.SemanticProcess.InternalRegionalCompletionSelection
import all BpmnSemantics.SemanticProcess.InternalRegionalFootprint
import all BpmnSemantics.SemanticProcess.InternalRegionalLocalDataRetention
import all BpmnSemantics.SemanticProcess.InternalRegionalOwnerRetention
import all BpmnSemantics.SemanticProcess.InternalRegionalOwnershipClosure
import all BpmnSemantics.SemanticProcess.InternalRegionalPreparation
import all BpmnSemantics.SemanticProcess.InternalRegionalPublication
import all BpmnSemantics.SemanticProcess.InternalRegionalSelectedRetention
import all BpmnSemantics.SemanticProcess.InternalRegionalSelection
import all BpmnSemantics.SemanticProcess.InternalScheduledClosure
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import all BpmnSemantics.SemanticProcess.InternalTransitionAlternative
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation
import all BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.LoweringIdentity
import all BpmnSemantics.SemanticProcess.MergeTargetOperations
import all BpmnSemantics.SemanticProcess.MessageKeyCorrelationProfileAdmission
import all BpmnSemantics.SemanticProcess.MonitoredScope
import all BpmnSemantics.SemanticProcess.MonitoredTask
import all BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.OpenWaitProjection
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import all BpmnSemantics.SemanticProcess.PortableHandoffAdmission
import all BpmnSemantics.SemanticProcess.ProfileCardinalities
import all BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.RuntimePositionValidity
import all BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import all BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import all BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.ScenarioAdmission
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.SequentialMultiInstanceRewrite
import all BpmnSemantics.SemanticProcess.SequentialScopeObservation
import all BpmnSemantics.SemanticProcess.StructuredCompositionCommandAdmission
import all BpmnSemantics.SemanticProcess.StructuredHumanWorkAdmission
import all BpmnSemantics.SemanticProcess.TransactionSourceAdmission
import all BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.TransitionStates
import all BpmnSemantics.SemanticProcess.TransitionTrace
import all BpmnSemantics.SemanticProcess.WaitActivation
import all BpmnSemantics.SemanticProcess.WaitCompletion
import all BpmnSemantics.CheckedProcessContract

/-! # BpmnSemantics.IntermediateCatchTimerConformance — exact PT1S timer locks

These checks own the direct Lean account for the admitted Intermediate Catch Timer capsule: independent literal normalization, exact-deadline firing, full occurrence/time refusal, and canonical observations.
-/

public section

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
    definitionScopes :=
      [rootDefinitionScope ⟨"Process_IntermediateCatchTimer"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_IntermediateCatchTimer"⟩
      [⟨"EndEvent_1"⟩, ⟨"StartEvent_1"⟩, ⟨"TimerCatch_PT1S"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes
      ⟨"Process_IntermediateCatchTimer"⟩
      [⟨"Flow_StartToTimer"⟩, ⟨"Flow_TimerToEnd"⟩]
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
  lowerCheckedProcess checkedProcess

def timerId : TimerOccurrenceId :=
  { processInstanceId := ⟨"Instance_1"⟩
    elementId := ⟨"TimerCatch_PT1S"⟩
    activation := 1 }

def timerWait : TimerWait :=
  { processInstanceId := timerId.processInstanceId
    owner := rootScopeOccurrenceId timerId.processInstanceId program.processId
    elementId := ⟨timerId.elementId.value⟩
    activation := timerId.activation
    deadlineMs := 1000
    output := ⟨"place:Flow_TimerToEnd"⟩ }

def fireCommandId : SemanticId :=
  ⟨"fire-timer-sha256:6abd9ffaf10c2bcefd54580956fd16ca64043ce25367c6f8a5b697033bca5c3b"⟩

def observations : List ObservationKind :=
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
          "b3389192ebed301b9756441dbbbe860ca489917793287cf6ce907a273ce919d5"
        sourceOverlay := none }
    stimuli :=
      [ .startProcess
          ⟨"start-process"⟩
          ⟨"Process_IntermediateCatchTimer"⟩
          ⟨"Instance_1"⟩
          []
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

theorem checked_process_is_well_formed :
    checkedWellFormed checkedProcess = true := by decide +kernel

theorem lowered_program_is_well_formed :
    programWellFormed program = true := by decide +kernel


theorem exact_deadline_scenario_trace_is_exact :
    runScenario program scenario =
      { outcome := .semantic .committed, trace := expectedTrace } := by
  decide +kernel

theorem early_timer_firing_is_rejected :
    applyStimulus scenarioClosureLimit program
        (singletonTimerWaitingState timerWait)
        (.fireTimer fireCommandId timerId 999) =
      { outcome := .rejected
        state := singletonTimerWaitingState timerWait
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  timer_identity_or_time_mismatch_is_rejected
    program timerWait fireCommandId timerId 999 0
      (by decide +kernel) (by decide +kernel) (by decide +kernel)

/-- The admitted timer does not permit early firing; exact deadline equality is semantically material rather than a host-scheduler convenience. -/
theorem early_timer_firing_is_not_permitted :
    (applyStimulus scenarioClosureLimit program
      (singletonTimerWaitingState timerWait)
      (.fireTimer fireCommandId timerId 999)).outcome ≠ .committed := by
  decide +kernel

theorem late_timer_firing_is_rejected :
    applyStimulus scenarioClosureLimit program
        (singletonTimerWaitingState timerWait)
        (.fireTimer fireCommandId timerId 1001) =
      { outcome := .rejected
        state := singletonTimerWaitingState timerWait
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } :=
  timer_identity_or_time_mismatch_is_rejected
    program timerWait fireCommandId timerId 1001 0
      (by decide +kernel) (by decide +kernel) (by decide +kernel)

end BpmnSemantics.IntermediateCatchTimerConformance

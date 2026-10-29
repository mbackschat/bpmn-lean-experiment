module

public import BpmnSemantics.SemanticProcess.TransitionTrace
public import BpmnSemantics.SemanticProcess.InternalPreparedTransition
public import BpmnSemantics.SemanticProcess.ControlPosition
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import all BpmnSemantics.SemanticProcess.InternalEndPreparation
import all BpmnSemantics.SemanticProcess.InternalMergePreparation
import all BpmnSemantics.SemanticProcess.InternalPreparedTransition
import all BpmnSemantics.SemanticProcess.InternalScheduledClosure
import all BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import all BpmnSemantics.SemanticProcess.TransitionTrace
import all BpmnSemantics.SemanticProcess.ActivityBodyClaimUniqueness
import all BpmnSemantics.SemanticProcess.ActivityDataEndpointRuntime
import all BpmnSemantics.SemanticProcess.ActivityDataInput
import all BpmnSemantics.SemanticProcess.ActivityDataInputOutputRuntime
import all BpmnSemantics.SemanticProcess.ActivityDataOutput
import all BpmnSemantics.SemanticProcess.BoundedTask
import all BpmnSemantics.SemanticProcess.CallActivityIdentity
import all BpmnSemantics.SemanticProcess.CallDataAdmission
import all BpmnSemantics.SemanticProcess.CallDataTransfer
import all BpmnSemantics.SemanticProcess.CallVariableMapping
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionProducers
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.ConcurrentScopeDataAvailability
import all BpmnSemantics.SemanticProcess.CyclicControlFlow
import all BpmnSemantics.SemanticProcess.Data
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.EffectDataMapping
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceBoundaryStarts
import all BpmnSemantics.SemanticProcess.InclusiveGateway
import all BpmnSemantics.SemanticProcess.InternalArmingOrder
import all BpmnSemantics.SemanticProcess.InternalBoundedScopePreparation
import all BpmnSemantics.SemanticProcess.InternalChoiceSchedule
import all BpmnSemantics.SemanticProcess.InternalCommutationRegion
import all BpmnSemantics.SemanticProcess.InternalLocalControlBranchSelection
import all BpmnSemantics.SemanticProcess.InternalLocalControlPositionDelta
import all BpmnSemantics.SemanticProcess.InternalLocalControlSelection
import all BpmnSemantics.SemanticProcess.InternalOperationAttempt
import all BpmnSemantics.SemanticProcess.InternalRegionalFootprint
import all BpmnSemantics.SemanticProcess.InternalRegionalPublication
import all BpmnSemantics.SemanticProcess.InternalRegionalSelectedRetention
import all BpmnSemantics.SemanticProcess.InternalRegionalSelection
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPositionDelta
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import all BpmnSemantics.SemanticProcess.InternalSelectedBranchDependencies
import all BpmnSemantics.SemanticProcess.InternalSelectedBranchPatch
import all BpmnSemantics.SemanticProcess.InternalTransitionAlternative
import all BpmnSemantics.SemanticProcess.InternalTransitionPublicationCore
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessCompletion
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessFlowNodeOccurrence
import all BpmnSemantics.SemanticProcess.MergeRegionAdmission
import all BpmnSemantics.SemanticProcess.MergeTargetOperations
import all BpmnSemantics.SemanticProcess.MessageStart
import all BpmnSemantics.SemanticProcess.MonitoredTask
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceTransition
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.RepeatableSubscriptionAdmission
import all BpmnSemantics.SemanticProcess.RuntimeState
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.SemanticProcess.SequentialScopeCheckedAdmission
import all BpmnSemantics.SemanticProcess.SequentialScopeControlAdmission
import all BpmnSemantics.SemanticProcess.SequentialScopeProgramAdmission
import all BpmnSemantics.SemanticProcess.SimpleBooleanExpression
import all BpmnSemantics.SemanticProcess.StructuredCompositionAdmission
import all BpmnSemantics.SemanticProcess.StructuredParallelBodyAdmission
import all BpmnSemantics.SemanticProcess.TerminateEnd
import all BpmnSemantics.SemanticProcess.TimerStart
import all BpmnSemantics.StrictJson
import all BpmnSemantics.WireNatural
import all BpmnSemantics.SemanticProcess.BoundedScope
import all BpmnSemantics.SemanticProcess.BusinessTaskCommandAdmission
import all BpmnSemantics.SemanticProcess.CallDataStateValidation
import all BpmnSemantics.SemanticProcess.CommandStartBindings
import all BpmnSemantics.SemanticProcess.CompensationActivityRetention
import all BpmnSemantics.SemanticProcess.ControlPositionContract
import all BpmnSemantics.SemanticProcess.ControlPositionProjection
import all BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
import all BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation
import all BpmnSemantics.SemanticProcess.MonitoredScope
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceRuntimeWellFormedness
import all BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import all BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.RuntimeStateIdentityBound
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.SequentialScopeStateValidation
import all BpmnSemantics.SemanticProcess.GraphReachability

/-! A concurrent document review witnesses production closure over a local fork, human review, and a deadline. The selected account is [Internal Commutation](../docs/INTERNAL-COMMUTATION-PROPOSAL.md#local-control-preparation-prerequisite). These kernel-decided facts cover this structurally admitted Program and its actual Start command, not checked XML admission, a generalized closure-fuel theorem, or scheduled choice. -/

public section

namespace BpmnSemantics.MixedLocalControlClosureConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

def processId : ProcessId := ⟨"Process_ConcurrentReview"⟩
def instanceId : SemanticId := ⟨"review-4711"⟩
def commandId : SemanticId := ⟨"start-concurrent-review"⟩
def owner : ScopeOccurrenceId := rootScopeOccurrenceId instanceId processId

def place (name : String) : ControlPlaceId := ⟨"place:Flow_" ++ name⟩

def task (name : String) : SemanticOperation :=
  .awaitUserTask ⟨"operation:Task_" ++ name⟩ { elementId := ⟨"Task_" ++ name⟩ }
    (place name) (place (name ++ "_Done"))
    { id := ⟨"Task_" ++ name⟩, name := some name }

def initiation : SemanticOperation :=
  .initiate ⟨"operation:Start"⟩ { elementId := ⟨"Start"⟩ } (place "Start")

def fork : SemanticOperation :=
  .duplicate ⟨"operation:Fork"⟩ { elementId := ⟨"Fork"⟩ }
    (place "Start") [place "Checks", place "Deadline", place "Legal"]

def checks : SemanticOperation :=
  .duplicate ⟨"operation:Fork_Checks"⟩ { elementId := ⟨"Fork_Checks"⟩ }
    (place "Checks") [place "Content", place "Risk"]

def deadline : SemanticOperation :=
  .awaitTimer ⟨"operation:Timer_Deadline"⟩ { elementId := ⟨"Timer_Deadline"⟩ }
    (place "Deadline") (place "Deadline_Done")
    { elementId := ⟨"Timer_Deadline"⟩, durationMs := 1000 }

def operations : List SemanticOperation :=
  [ .reachNoneEnd ⟨"operation:End"⟩ { elementId := ⟨"End"⟩ } (place "End")
  , fork, checks
  , .synchronize ⟨"operation:Join"⟩ { elementId := ⟨"Join"⟩ }
      [place "Content_Done", place "Deadline_Done", place "Legal_Done", place "Risk_Done"]
      (place "End")
  , initiation, task "Content", task "Legal", task "Risk", deadline
  , .completeScope ⟨"operation:complete-scope:scope:Process_ConcurrentReview"⟩
      { elementId := ⟨"Process_ConcurrentReview"⟩ } (rootDefinitionScopeId processId) none ]

def places : List ControlPlace :=
  ["Checks", "Content", "Content_Done", "Deadline", "Deadline_Done", "End",
    "Legal", "Legal_Done", "Risk", "Risk_Done", "Start"].map fun name =>
      { id := place name, origin := { elementId := ⟨"Flow_" ++ name⟩ } }

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"bpmn-2.0.2-timer-user-task-composition-draft"⟩
        sourceId := ⟨"concurrent-review-il-witness"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000000" }
    internalSchedulingMode := .rejectObservableChoice
    processId
    definitionScopes := [rootDefinitionScope processId]
    operationScopes := operations.map fun operation =>
      { operationId := operation.id, scopeId := rootDefinitionScopeId processId }
    controlPlaceScopes := places.map fun controlPlace =>
      { controlPlaceId := controlPlace.id, scopeId := rootDefinitionScopeId processId }
    controlPlaces := places
    operations }

def start : Stimulus :=
  .startProcess commandId ⟨processId.value⟩ instanceId []

def beforeMixed : RuntimeState :=
  ((fire? program initiation (admitStimulus program initialState start).state).bind
    (fire? program fork)).getD initialState

def fixture_is_structurally_admitted : Bool := decide <|
    programWellFormed program = true ∧
      (admitStimulus program initialState start).outcome = .committed

theorem reached_frontier_contains_three_independent_preparations :
    runtimeStateWellFormed program instanceId beforeMixed = true ∧
      enabledInternalOperationCount program beforeMixed = 3 ∧
      (prepareInternalTransitionBatch? program beforeMixed
        [checks, task "Legal", deadline]).map List.length = some 3 := by
  decide +kernel

def trace : TracedStimulusResult :=
  applyStimulusTraced 7 program initialState start

def committed_start_closes_the_local_control_frontier : Bool := decide <|
    trace.result.outcome = .committed ∧
      trace.result.internalStepBoundExceeded = false ∧
      trace.result.ambiguousInternalChoice = false

theorem committed_state_retains_three_user_waits_and_one_deadline :
    trace.result.state.control = .running instanceId ∧
      trace.result.state.waits.map (·.task.id) =
        [⟨"Task_Content"⟩, ⟨"Task_Legal"⟩, ⟨"Task_Risk"⟩] ∧
      trace.result.state.timerWaits.length = 1 ∧
      trace.result.state.tokens = [] := by
  decide +kernel

def committed_runtime_and_both_public_projections_are_accepted : Bool := decide <|
    runtimeStateWellFormed program instanceId trace.result.state = true ∧
      (projectOpenFlowNodeOccurrences? program trace.result.state).isSome = true ∧
      (projectControlPosition? program instanceId trace.result.state).isSome = true

def committed_publication_has_one_external_and_seven_internal_rows : Bool := decide <|
    trace.committedTransitions.length = 8 ∧
      trace.flowNodeOccurrenceLifecycles.length = 8 ∧
      trace.committedTransitions.head? = some (.externalStimulus start) ∧
      (trace.committedTransitions.filterMap fun
        | .internalOperation record => some record.operationId
        | .externalStimulus _ => none) =
        [⟨"operation:Start"⟩, ⟨"operation:Fork"⟩, ⟨"operation:Fork_Checks"⟩,
          ⟨"operation:Task_Legal"⟩, ⟨"operation:Timer_Deadline"⟩,
          ⟨"operation:Task_Content"⟩, ⟨"operation:Task_Risk"⟩]

def committed_local_fork_lifecycle_uses_its_canonical_transition_index : Bool := decide <|
    trace.committedTransitions[3]? = some (.internalOperation
      { operationId := checks.id, operationKind := .duplicate,
        origin := checks.origin, owner }) ∧
      trace.flowNodeOccurrenceLifecycles[3]? = some
        { started :=
            [{ anchor := .transition commandId 3 0, processId,
               elementId := ⟨"Fork_Checks"⟩, owner }]
          ended := [{ anchor := .transition commandId 3 0, terminal := .completed }] }

def later_insufficient_batch_fuel_restores_the_whole_command : Bool := decide <|
    let refused := applyStimulusTraced 6 program initialState start
    refused.result =
        { outcome := .rolledBack, state := initialState,
          internalStepBoundExceeded := true, ambiguousInternalChoice := false } ∧
      refused.committedTransitions = [] ∧
      refused.flowNodeOccurrenceLifecycles = []

def noncanonical_program_storage_is_outside_the_admitted_batch_account : Bool := decide <|
    [operations.reverse, operations.drop 1 ++ operations.take 1].all (fun reordered =>
      !programWellFormed { program with operations := reordered } &&
        decide (canonicalInternalOperations reordered = operations)) = true

/-- Every executable check of this module, named for the driver's failure report. -/
def mixedLocalControlClosureConformanceChecks : List (String × Bool) := [
  ("fixture_is_structurally_admitted", fixture_is_structurally_admitted),
  ("committed_start_closes_the_local_control_frontier", committed_start_closes_the_local_control_frontier),
  ("committed_runtime_and_both_public_projections_are_accepted", committed_runtime_and_both_public_projections_are_accepted),
  ("committed_publication_has_one_external_and_seven_internal_rows", committed_publication_has_one_external_and_seven_internal_rows),
  ("committed_local_fork_lifecycle_uses_its_canonical_transition_index", committed_local_fork_lifecycle_uses_its_canonical_transition_index),
  ("later_insufficient_batch_fuel_restores_the_whole_command", later_insufficient_batch_fuel_restores_the_whole_command),
  ("noncanonical_program_storage_is_outside_the_admitted_batch_account", noncanonical_program_storage_is_outside_the_admitted_batch_account)
]

end BpmnSemantics.MixedLocalControlClosureConformance

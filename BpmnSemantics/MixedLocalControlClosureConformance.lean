module

public import BpmnSemantics.SemanticProcess.TransitionTrace
public import BpmnSemantics.SemanticProcess.InternalPreparedTransition
public import BpmnSemantics.SemanticProcess.ControlPosition
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.CallActivity

/-! A concurrent document review witnesses production closure over a local fork, human review, and a deadline. The selected account is [Internal Commutation](../docs/INTERNAL-COMMUTATION-PROPOSAL.md#local-control-preparation-prerequisite). These kernel-decided facts cover this structurally admitted Program and its actual Start command, not checked XML admission, a generalized closure-fuel theorem, or scheduled choice. -/

@[expose] public section

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

import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.InternalPreparedTransition
import BpmnSemantics.SemanticProcess.ControlPosition
import BpmnSemantics.SemanticProcess.RootScopeFixtures

/-! A concurrent document review witnesses production closure over a local fork, human review, and a deadline. The selected account is [Internal Commutation](../docs/INTERNAL-COMMUTATION-PROPOSAL.md#local-control-preparation-prerequisite). These kernel-decided facts cover this structurally admitted Program and its actual Start command, not checked XML admission, a generalized closure-fuel theorem, or scheduled choice. -/

namespace BpmnSemantics.MixedLocalControlClosureConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

private def processId : ProcessId := ⟨"Process_ConcurrentReview"⟩
private def instanceId : SemanticId := ⟨"review-4711"⟩
private def commandId : SemanticId := ⟨"start-concurrent-review"⟩
private def owner : ScopeOccurrenceId := rootScopeOccurrenceId instanceId processId

private def place (name : String) : ControlPlaceId := ⟨"place:Flow_" ++ name⟩

private def task (name : String) : SemanticOperation :=
  .awaitUserTask ⟨"operation:Task_" ++ name⟩ { elementId := ⟨"Task_" ++ name⟩ }
    (place name) (place (name ++ "_Done"))
    { id := ⟨"Task_" ++ name⟩, name := some name }

private def initiation : SemanticOperation :=
  .initiate ⟨"operation:Start"⟩ { elementId := ⟨"Start"⟩ } (place "Start")

private def fork : SemanticOperation :=
  .duplicate ⟨"operation:Fork"⟩ { elementId := ⟨"Fork"⟩ }
    (place "Start") [place "Checks", place "Deadline", place "Legal"]

private def checks : SemanticOperation :=
  .duplicate ⟨"operation:Fork_Checks"⟩ { elementId := ⟨"Fork_Checks"⟩ }
    (place "Checks") [place "Content", place "Risk"]

private def deadline : SemanticOperation :=
  .awaitTimer ⟨"operation:Timer_Deadline"⟩ { elementId := ⟨"Timer_Deadline"⟩ }
    (place "Deadline") (place "Deadline_Done")
    { elementId := ⟨"Timer_Deadline"⟩, durationMs := 1000 }

private def operations : List SemanticOperation :=
  [ .reachNoneEnd ⟨"operation:End"⟩ { elementId := ⟨"End"⟩ } (place "End")
  , fork, checks
  , .synchronize ⟨"operation:Join"⟩ { elementId := ⟨"Join"⟩ }
      [place "Content_Done", place "Deadline_Done", place "Legal_Done", place "Risk_Done"]
      (place "End")
  , initiation, task "Content", task "Legal", task "Risk", deadline
  , .completeScope ⟨"operation:complete-scope:scope:Process_ConcurrentReview"⟩
      { elementId := ⟨"Process_ConcurrentReview"⟩ } (rootDefinitionScopeId processId) none ]

private def places : List ControlPlace :=
  ["Checks", "Content", "Content_Done", "Deadline", "Deadline_Done", "End",
    "Legal", "Legal_Done", "Risk", "Risk_Done", "Start"].map fun name =>
      { id := place name, origin := { elementId := ⟨"Flow_" ++ name⟩ } }

private def program : Program :=
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

private def start : Stimulus :=
  .startProcess commandId ⟨processId.value⟩ instanceId []

private def beforeMixed : RuntimeState :=
  ((fire? program initiation (admitStimulus program initialState start).state).bind
    (fire? program fork)).getD initialState

theorem fixture_is_structurally_admitted :
    programWellFormed program = true ∧
      (admitStimulus program initialState start).outcome = .committed := by
  decide +kernel

theorem reached_frontier_contains_three_independent_preparations :
    runtimeStateWellFormed program instanceId beforeMixed = true ∧
      enabledInternalOperationCount program beforeMixed = 3 ∧
      (prepareInternalTransitionBatch? program beforeMixed
        [checks, task "Legal", deadline]).map List.length = some 3 := by
  decide +kernel

private def trace : TracedStimulusResult :=
  applyStimulusTraced 7 program initialState start

theorem committed_start_closes_the_local_control_frontier :
    trace.result.outcome = .committed ∧
      trace.result.internalStepBoundExceeded = false ∧
      trace.result.ambiguousInternalChoice = false := by
  decide +kernel

theorem committed_state_retains_three_user_waits_and_one_deadline :
    trace.result.state.control = .running instanceId ∧
      trace.result.state.waits.map (·.task.id) =
        [⟨"Task_Content"⟩, ⟨"Task_Legal"⟩, ⟨"Task_Risk"⟩] ∧
      trace.result.state.timerWaits.length = 1 ∧
      trace.result.state.tokens = [] := by
  decide +kernel

theorem committed_runtime_and_both_public_projections_are_accepted :
    runtimeStateWellFormed program instanceId trace.result.state = true ∧
      (projectOpenFlowNodeOccurrences? program trace.result.state).isSome = true ∧
      (projectControlPosition? program instanceId trace.result.state).isSome = true := by
  decide +kernel

theorem committed_publication_has_one_external_and_seven_internal_rows :
    trace.committedTransitions.length = 8 ∧
      trace.flowNodeOccurrenceLifecycles.length = 8 ∧
      trace.committedTransitions.head? = some (.externalStimulus start) ∧
      (trace.committedTransitions.filterMap fun
        | .internalOperation record => some record.operationId
        | .externalStimulus _ => none) =
        [⟨"operation:Start"⟩, ⟨"operation:Fork"⟩, ⟨"operation:Fork_Checks"⟩,
          ⟨"operation:Task_Legal"⟩, ⟨"operation:Timer_Deadline"⟩,
          ⟨"operation:Task_Content"⟩, ⟨"operation:Task_Risk"⟩] := by
  decide +kernel

theorem committed_local_fork_lifecycle_uses_its_canonical_transition_index :
    trace.committedTransitions[3]? = some (.internalOperation
      { operationId := checks.id, operationKind := .duplicate,
        origin := checks.origin, owner }) ∧
      trace.flowNodeOccurrenceLifecycles[3]? = some
        { started :=
            [{ anchor := .transition commandId 3 0, processId,
               elementId := ⟨"Fork_Checks"⟩, owner }]
          ended := [{ anchor := .transition commandId 3 0, terminal := .completed }] } := by
  decide +kernel

theorem later_insufficient_batch_fuel_restores_the_whole_command :
    let refused := applyStimulusTraced 6 program initialState start
    refused.result =
        { outcome := .rolledBack, state := initialState,
          internalStepBoundExceeded := true, ambiguousInternalChoice := false } ∧
      refused.committedTransitions = [] ∧
      refused.flowNodeOccurrenceLifecycles = [] := by
  decide +kernel

theorem noncanonical_program_storage_is_outside_the_admitted_batch_account :
    [operations.reverse, operations.drop 1 ++ operations.take 1].all (fun reordered =>
      !programWellFormed { program with operations := reordered } &&
        decide (canonicalInternalOperations reordered = operations)) = true := by
  decide +kernel

end BpmnSemantics.MixedLocalControlClosureConformance

import BpmnSemantics.SemanticProcess.WaitActivation
import BpmnSemantics.SemanticProcess.Execution
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.RootScopeFixtures

/-! # Representative resumption-bounded cycle fixtures

This module owns the reviewed root-scope User Task cycle, its independently lowered program, finite stimuli, and hostile graph/state witnesses. It contains no conformance claims.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def cyclicProcessId : ProcessId := ⟨"Process_CyclicControlFlow"⟩
def cyclicInstanceId : SemanticId := ⟨"Instance_CyclicControlFlow"⟩
def cyclicScopeId : DefinitionScopeId := rootDefinitionScopeId cyclicProcessId
def cyclicOwner : ScopeOccurrenceId :=
  rootScopeOccurrenceId cyclicInstanceId cyclicProcessId

def cyclicCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"bpmn-2.0.2-user-task-cycle-draft"⟩
        sourceId := ⟨"cyclic-control-flow"⟩
        sourceSha256 :=
          "bce35b0b73934026f7da34e8c26eb74d590ad1010a847e34aca6858e2dbdf8b9" }
    processId := cyclicProcessId
    definitionScopes := [rootDefinitionScope cyclicProcessId]
    nodeScopes := rootNodeScopes cyclicProcessId
      [⟨"Choice"⟩, ⟨"End"⟩, ⟨"Merge"⟩, ⟨"Review"⟩, ⟨"Start"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes cyclicProcessId
      [ ⟨"Flow_Exit"⟩, ⟨"Flow_Merge_Review"⟩, ⟨"Flow_Repeat"⟩
      , ⟨"Flow_Review_Choice"⟩, ⟨"Flow_Rework"⟩, ⟨"Flow_Start"⟩ ]
    nodes :=
      [ .exclusiveGateway ⟨"Choice"⟩
          [⟨"Flow_Repeat"⟩, ⟨"Flow_Rework"⟩] ⟨"Flow_Exit"⟩
      , .noneEndEvent ⟨"End"⟩
      , .exclusiveMerge ⟨"Merge"⟩
      , .userTask ⟨"Review"⟩ (some "Review request")
      , .noneStartEvent ⟨"Start"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Exit"⟩, sourceId := ⟨"Choice"⟩,
          targetId := ⟨"End"⟩ }
      , { id := ⟨"Flow_Merge_Review"⟩, sourceId := ⟨"Merge"⟩,
          targetId := ⟨"Review"⟩ }
      , { id := ⟨"Flow_Repeat"⟩, sourceId := ⟨"Choice"⟩,
          targetId := ⟨"Merge"⟩,
          condition := some
            { language := simpleBooleanExpressionLanguage
              body := "stringEquals(route,\"repeat\")" } }
      , { id := ⟨"Flow_Review_Choice"⟩, sourceId := ⟨"Review"⟩,
          targetId := ⟨"Choice"⟩ }
      , { id := ⟨"Flow_Rework"⟩, sourceId := ⟨"Choice"⟩,
          targetId := ⟨"Merge"⟩,
          condition := some
            { language := simpleBooleanExpressionLanguage
              body := "stringEquals(route,\"rework\")" } }
      , { id := ⟨"Flow_Start"⟩, sourceId := ⟨"Start"⟩,
          targetId := ⟨"Merge"⟩ } ] }

def cyclicMergeInputs : List ControlPlaceId :=
  [⟨"place:Flow_Repeat"⟩, ⟨"place:Flow_Rework"⟩,
    ⟨"place:Flow_Start"⟩]

def cyclicTask : UserTaskDefinition :=
  { id := ⟨"Review"⟩, name := some "Review request" }

def cyclicChoiceOperation : SemanticOperation :=
  .choose ⟨"operation:Choice"⟩ ⟨⟨"Choice"⟩⟩
    ⟨"place:Flow_Review_Choice"⟩
    [ { condition := .stringEquals "route" "repeat"
        output := ⟨"place:Flow_Repeat"⟩
        origin := ⟨⟨"Flow_Repeat"⟩⟩ }
    , { condition := .stringEquals "route" "rework"
        output := ⟨"place:Flow_Rework"⟩
        origin := ⟨⟨"Flow_Rework"⟩⟩ } ]
    ⟨"place:Flow_Exit"⟩ ⟨⟨"Flow_Exit"⟩⟩

def cyclicEndOperation : SemanticOperation :=
  .reachNoneEnd ⟨"operation:End"⟩ ⟨⟨"End"⟩⟩ ⟨"place:Flow_Exit"⟩

def cyclicMergeOperation : SemanticOperation :=
  .mergeExclusive ⟨"operation:Merge"⟩ ⟨⟨"Merge"⟩⟩
    cyclicMergeInputs ⟨"place:Flow_Merge_Review"⟩

def cyclicReviewOperation : SemanticOperation :=
  .awaitUserTask ⟨"operation:Review"⟩ ⟨⟨"Review"⟩⟩
    ⟨"place:Flow_Merge_Review"⟩ ⟨"place:Flow_Review_Choice"⟩
    cyclicTask

def cyclicStartOperation : SemanticOperation :=
  .initiate ⟨"operation:Start"⟩ ⟨⟨"Start"⟩⟩ ⟨"place:Flow_Start"⟩

def cyclicCompletionOperation : SemanticOperation :=
  .completeScope
    ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩
    ⟨⟨"Process_CyclicControlFlow"⟩⟩ cyclicScopeId none

def cyclicOperations : List SemanticOperation :=
  [ cyclicChoiceOperation
  , cyclicEndOperation
  , cyclicMergeOperation
  , cyclicReviewOperation
  , cyclicStartOperation
  , cyclicCompletionOperation ]

def cyclicProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := cyclicCheckedProcess.identity.semanticProfile
        sourceId := cyclicCheckedProcess.identity.sourceId
        sourceSha256 := cyclicCheckedProcess.identity.sourceSha256 }
    internalSchedulingMode := .rejectObservableChoice
    processId := cyclicProcessId
    definitionScopes := cyclicCheckedProcess.definitionScopes
    operationScopes := cyclicOperations.map fun operation =>
      { operationId := operation.id, scopeId := cyclicScopeId }
    controlPlaceScopes := cyclicCheckedProcess.sequenceFlowScopes.map fun owner =>
      { controlPlaceId := flowControlPlaceId owner.sequenceFlowId
        scopeId := owner.scopeId }
    controlPlaces := cyclicCheckedProcess.sequenceFlows.map
      CheckedSequenceFlow.toControlPlace
    operations := cyclicOperations }

def cyclicStartStimulus : Stimulus :=
  .startProcess ⟨"start-cycle"⟩ ⟨cyclicProcessId.value⟩ cyclicInstanceId []

def cyclicCompletionStimulus (activation : Nat) (route : String) : Stimulus :=
  .completeUserTaskInstance
    ⟨"complete-cycle"⟩
    { processInstanceId := cyclicInstanceId
      elementId := ⟨"Review"⟩
      activation }
    [{ name := "route", value := .string route }]

def cyclicCompletionFor (taskId : UserTaskInstanceId) : Stimulus :=
  .completeUserTaskInstance ⟨"complete-cycle"⟩ taskId
    [{ name := "route", value := .string "repeat" }]

def cyclicStartResult : StimulusResult :=
  applyStimulus 3 cyclicProgram initialState cyclicStartStimulus

def cyclicRepeatResult (state : RuntimeState) (activation : Nat)
    (route : String) : StimulusResult :=
  applyStimulus 3 cyclicProgram state
    (cyclicCompletionStimulus activation route)

def cyclicExitResult (state : RuntimeState) (activation : Nat) :
    StimulusResult :=
  applyStimulus 3 cyclicProgram state
    (cyclicCompletionStimulus activation "exit")

def cyclicCommittedResult (state : RuntimeState) : StimulusResult :=
  { outcome := .committed
    state
    internalStepBoundExceeded := false
    ambiguousInternalChoice := false }

def cyclicBoundedResult (state : RuntimeState) : StimulusResult :=
  { outcome := .committed
    state
    internalStepBoundExceeded := true
    ambiguousInternalChoice := false }

def cyclicRejectedResult (state : RuntimeState) : StimulusResult :=
  { outcome := .rejected
    state
    internalStepBoundExceeded := false
    ambiguousInternalChoice := false }

def cyclicWait (activation : Nat) : UserTaskWait :=
  { processInstanceId := cyclicInstanceId
    owner := cyclicOwner
    task := { id := ⟨"Review"⟩, name := some "Review request" }
    activation
    output := ⟨"place:Flow_Review_Choice"⟩ }

def cyclicVariables (route : Option String) : ScopedVariables :=
  match route with
  | none => emptyScopedVariables
  | some value =>
      { emptyScopedVariables with
        process :=
          { bindings := [{ name := "route", value := .string value }] } }

def cyclicWaitingState (activation : Nat)
    (route : Option String) : RuntimeState :=
  singletonWaitingState (cyclicWait activation) 0 (cyclicVariables route)

def cyclicPostCompletionState (activation : Nat) (route : String) :
    RuntimeState :=
  { cyclicWaitingState activation none with
    waits := []
    tokens :=
      [{ placeId := ⟨"place:Flow_Review_Choice"⟩
         owner := cyclicOwner }]
    variables := cyclicVariables (some route) }

def cyclicPostChooseState (activation : Nat) (route : String)
    (output : ControlPlaceId) : RuntimeState :=
  { cyclicPostCompletionState activation route with
    tokens := [{ placeId := output, owner := cyclicOwner }] }

def cyclicPostMergeState (activation : Nat) (route : String) :
    RuntimeState :=
  { cyclicPostCompletionState activation route with
    tokens :=
      [{ placeId := ⟨"place:Flow_Merge_Review"⟩
         owner := cyclicOwner }] }

def cyclicAwaitedState (activation : Nat) (route : String) : RuntimeState :=
  activateUserTask (cyclicPostMergeState activation route)
    cyclicInstanceId cyclicOwner ⟨"place:Flow_Merge_Review"⟩
    ⟨"place:Flow_Review_Choice"⟩ cyclicTask

def cyclicPostEndState (activation : Nat) (route : String) : RuntimeState :=
  { cyclicPostCompletionState activation route with
    tokens := []
    endOccurrences := (cyclicPostCompletionState activation route).endOccurrences + 1 }

def cyclicCompletedState (activation : Nat) (route : String) : RuntimeState :=
  { cyclicPostEndState activation route with
    control := .completed cyclicInstanceId
    scopeOccurrences := [] }

def cyclicAdmittedStartState : RuntimeState :=
  { runningStartState cyclicInstanceId [] with
    scopeOccurrences := [{ id := cyclicOwner, parent := none }]
    scopeActivations := [{ scopeId := cyclicScopeId, count := 1 }] }

def cyclicPostStartState : RuntimeState :=
  { cyclicAdmittedStartState with
    initiationPending := false
    tokens := [{ placeId := ⟨"place:Flow_Start"⟩, owner := cyclicOwner }] }

def cyclicInitialPostMergeState : RuntimeState :=
  { cyclicPostStartState with
    tokens :=
      [{ placeId := ⟨"place:Flow_Merge_Review"⟩, owner := cyclicOwner }] }

def cyclicRepeatChoices : List OperationId :=
  [⟨"operation:Choice"⟩, ⟨"operation:Merge"⟩,
    ⟨"operation:Review"⟩]

def cyclicExitChoices : List OperationId :=
  [⟨"operation:Choice"⟩, ⟨"operation:End"⟩,
    ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩]

def cyclicTwoInputState : RuntimeState :=
  { cyclicWaitingState 1 none with
    waits := []
    tokens :=
      [ { placeId := ⟨"place:Flow_Repeat"⟩, owner := cyclicOwner }
      , { placeId := ⟨"place:Flow_Rework"⟩, owner := cyclicOwner } ] }

def cyclicSameInputMultiplicityTwoState : RuntimeState :=
  { cyclicWaitingState 1 none with
    waits := []
    tokens :=
      [ { placeId := ⟨"place:Flow_Repeat"⟩, owner := cyclicOwner }
      , { placeId := ⟨"place:Flow_Repeat"⟩, owner := cyclicOwner } ] }

def cyclicOtherOwner : ScopeOccurrenceId :=
  rootScopeOccurrenceId ⟨"Instance_Other"⟩ cyclicProcessId

def cyclicDifferentOwnerState : RuntimeState :=
  { cyclicWaitingState 1 none with
    waits := []
    tokens :=
      [ { placeId := ⟨"place:Flow_Repeat"⟩, owner := cyclicOwner }
      , { placeId := ⟨"place:Flow_Rework"⟩, owner := cyclicOtherOwner } ] }

/-- Same cardinalities and full reachability/co-reachability as the selected graph, but its Choice/Merge cycle survives the User Task continuation cut. -/
def cyclicInternalOnlyCheckedProcess : CheckedProcess :=
  { cyclicCheckedProcess with
    sequenceFlows :=
      [ { id := ⟨"Flow_Exit"⟩, sourceId := ⟨"Choice"⟩,
          targetId := ⟨"End"⟩ }
      , { id := ⟨"Flow_Merge_Review"⟩, sourceId := ⟨"Merge"⟩,
          targetId := ⟨"Choice"⟩ }
      , { id := ⟨"Flow_Repeat"⟩, sourceId := ⟨"Choice"⟩,
          targetId := ⟨"Merge"⟩,
          condition := some
            { language := simpleBooleanExpressionLanguage
              body := "stringEquals(route,\"repeat\")" } }
      , { id := ⟨"Flow_Review_Choice"⟩, sourceId := ⟨"Review"⟩,
          targetId := ⟨"Merge"⟩ }
      , { id := ⟨"Flow_Rework"⟩, sourceId := ⟨"Choice"⟩,
          targetId := ⟨"Merge"⟩,
          condition := some
            { language := simpleBooleanExpressionLanguage
              body := "stringEquals(route,\"rework\")" } }
      , { id := ⟨"Flow_Start"⟩, sourceId := ⟨"Start"⟩,
          targetId := ⟨"Review"⟩ } ] }

def cyclicInternalOnlyProgram : Program :=
  lowerCheckedProcess cyclicInternalOnlyCheckedProcess

def cyclicOldProfileCheckedProcess : CheckedProcess :=
  { cyclicCheckedProcess with
    identity :=
      { cyclicCheckedProcess.identity with
        semanticProfile :=
          ⟨"bpmn-2.0.2-simple-boolean-exclusive-gateway-draft"⟩ } }

def cyclicOldProfileProgram : Program :=
  { cyclicProgram with
    identity :=
      { cyclicProgram.identity with
        semanticProfile :=
          ⟨"bpmn-2.0.2-simple-boolean-exclusive-gateway-draft"⟩ } }

private def genericMergeProgram (branchPlaces : List ControlPlace) : Program :=
  let entry : ControlPlace :=
    { id := ⟨"place:Entry"⟩, origin := ⟨⟨"Flow_Entry"⟩⟩ }
  let mergeReview : ControlPlace :=
    { id := ⟨"place:Merge_Review"⟩, origin := ⟨⟨"Flow_Merge_Review"⟩⟩ }
  let reviewEnd : ControlPlace :=
    { id := ⟨"place:Review_End"⟩, origin := ⟨⟨"Flow_Review_End"⟩⟩ }
  let places := branchPlaces ++ [entry, mergeReview, reviewEnd]
  let branchIds := branchPlaces.map (·.id)
  let operations : List SemanticOperation :=
    [ .reachNoneEnd ⟨"operation:End"⟩ ⟨⟨"End"⟩⟩ reviewEnd.id
    , .duplicate ⟨"operation:Fork"⟩ ⟨⟨"Fork"⟩⟩ entry.id branchIds
    , .mergeExclusive ⟨"operation:Merge"⟩ ⟨⟨"Merge"⟩⟩ branchIds
        mergeReview.id
    , .awaitUserTask ⟨"operation:Review"⟩ ⟨⟨"Review"⟩⟩
        mergeReview.id reviewEnd.id cyclicTask
    , .initiate ⟨"operation:Start"⟩ ⟨⟨"Start"⟩⟩ entry.id
    , .completeScope
        ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩
        ⟨⟨"Process_CyclicControlFlow"⟩⟩ cyclicScopeId none ]
  { cyclicProgram with
    operationScopes := operations.map fun operation =>
      { operationId := operation.id, scopeId := cyclicScopeId }
    controlPlaceScopes := places.map fun place =>
      { controlPlaceId := place.id, scopeId := cyclicScopeId }
    controlPlaces := places
    operations }

/-- Structurally complete generic two-input merge graph used to separate IL admission from the selected profile's exact payload. -/
def cyclicTwoInputMergeProgram : Program :=
  genericMergeProgram
    [ { id := ⟨"place:Branch_A"⟩, origin := ⟨⟨"Flow_Branch_A"⟩⟩ }
    , { id := ⟨"place:Branch_B"⟩, origin := ⟨⟨"Flow_Branch_B"⟩⟩ } ]

/-- Structurally complete generic four-distinct-input merge graph. Every place has exactly one producer and consumer. -/
def cyclicFourInputMergeProgram : Program :=
  genericMergeProgram
    [ { id := ⟨"place:Branch_A"⟩, origin := ⟨⟨"Flow_Branch_A"⟩⟩ }
    , { id := ⟨"place:Branch_B"⟩, origin := ⟨⟨"Flow_Branch_B"⟩⟩ }
    , { id := ⟨"place:Branch_C"⟩, origin := ⟨⟨"Flow_Branch_C"⟩⟩ }
    , { id := ⟨"place:Branch_D"⟩, origin := ⟨⟨"Flow_Branch_D"⟩⟩ } ]

def cyclicNestedScopeCheckedProcess : CheckedProcess :=
  { cyclicCheckedProcess with
    definitionScopes := cyclicCheckedProcess.definitionScopes ++
      [{ id := ⟨"scope:Nested"⟩
         parentScopeId := some cyclicScopeId
         originElementId := ⟨"Nested"⟩ }] }

def cyclicUnlistedWaitProgram : Program :=
  { cyclicProgram with
    operations := cyclicProgram.operations.map fun
      | .awaitUserTask id origin input output _ =>
          .awaitTimer id origin input output
            { elementId := ⟨"Review"⟩, durationMs := 1000 }
      | operation => operation }

end BpmnSemantics.SemanticProcess

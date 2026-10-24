module

public import BpmnSemantics.SemanticProcess.Execution
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario

/-! # Activity data-input conformance

Checked facts for the bounded Activity data-input account: the local-owner discriminator boundary and
the concrete invoice-review witnesses that separate an unavailable source from a present one carrying
explicit null. The family's quantified activation, copy, refusal, and disposal laws are stated at
their owner, [ActivityDataInput](SemanticProcess/ActivityDataInput.lean).

The owner-discriminator cases come first so an equal-coordinate effect occurrence cannot become an
Activity-local owner by structural coincidence before the transition family is introduced.
-/

@[expose] public section

namespace BpmnSemantics.ActivityDataInputConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def processInstanceId : SemanticId := ⟨"Instance_1"⟩

def inputEffectOccurrenceId : EffectOccurrenceId :=
  { processInstanceId
    elementId := ⟨"UserTask_Review"⟩
    activation := 1 }

def inputActivityOccurrenceId : ActivityOccurrenceId :=
  { processInstanceId
    activityElementId := ⟨"UserTask_Review"⟩
    activation := 1 }

def effectOwner : LocalDataOwner :=
  .effectOccurrence inputEffectOccurrenceId

def activityOwner : LocalDataOwner :=
  .activityOccurrence inputActivityOccurrenceId

theorem equalCoordinateOwnersRemainDistinct : effectOwner ≠ activityOwner := by
  decide +kernel

theorem crossFamilyOwnersDoNotMatch :
    localDataOwnerMatches effectOwner activityOwner = false := by
  decide +kernel

def activityScope : ActivityVariableScope :=
  { owner := activityOwner, bindings := [] }

def mixedVariables : ScopedVariables :=
  addActivityVariableScope
    { process := { bindings := [] }
      activities := [activityScope]
      processInterfaces := [], scopes := [] }
    inputEffectOccurrenceId
    []

theorem effectCompletionPreservesEqualCoordinateActivityScope :
    completeActivityVariableScope mixedVariables inputEffectOccurrenceId [] (.success []) =
      some
        { process := { bindings := [] }
          activities := [activityScope]
          processInterfaces := [], scopes := [] } := by
  decide +kernel

/-! ## The invoice-review witnesses

One User Task whose entry fills one required scalar `DataInput` from one Process-owned `Property`.
The same program and the same start command reach two different stable states depending on whether
`Property_ReviewContext` is bound, which is what separates an unavailable source from an available
one carrying explicit null. The quantified laws for this family are stated at their owner,
[ActivityDataInput](SemanticProcess/ActivityDataInput.lean). -/

def reviewDirectInput : DirectActivityDataInput :=
  { associationId := "DataInputAssociation_ReviewContext"
    source := .property "Property_ReviewContext"
    targetDataInputId := "DataInput_ReviewContext"
    targetDataInputName := some "Review context" }

def reviewProcessId : ProcessId := ⟨"Process_ActivityDataInputReview"⟩

def reviewCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := activityDataInputUserTaskProfileId
        sourceId := ⟨"activity-data-input-user-task"⟩
        sourceSha256 :=
          "d495a656950873515d17b25f4dd8a45bd4edcaceea85a30695b3d217d37e779d" }
    processId := reviewProcessId
    definitionScopes := [rootDefinitionScope reviewProcessId]
    nodeScopes := rootNodeScopes reviewProcessId
      [⟨"EndEvent_Completed"⟩, ⟨"StartEvent_Review"⟩, ⟨"UserTask_Review"⟩]
    sequenceFlowScopes := rootSequenceFlowScopes reviewProcessId
      [⟨"Flow_Review_Completed"⟩, ⟨"Flow_Start_Review"⟩]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_Completed"⟩
      , .noneStartEvent ⟨"StartEvent_Review"⟩
      , .dataInputUserTask ⟨"UserTask_Review"⟩ (some "Review invoice") reviewDirectInput ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Review_Completed"⟩
          sourceId := ⟨"UserTask_Review"⟩
          targetId := ⟨"EndEvent_Completed"⟩ }
      , { id := ⟨"Flow_Start_Review"⟩
          sourceId := ⟨"StartEvent_Review"⟩
          targetId := ⟨"UserTask_Review"⟩ } ] }

def reviewProgram : Program := lowerCheckedProcess reviewCheckedProcess

def reviewInstanceId : SemanticId := ⟨"ActivityDataInputInstance_1"⟩

def startReview (commandId : String)
    (initialVariables : List VariableBinding) : Stimulus :=
  .startProcess ⟨commandId⟩ ⟨reviewProcessId.value⟩ reviewInstanceId initialVariables

def presentContext : VariableBinding :=
  { name := reviewDirectInput.source.id, value := .string "invoice-4711" }

def nullContext : VariableBinding :=
  { name := reviewDirectInput.source.id, value := .null }

def startWithContext : Stimulus :=
  startReview "start-with-review-context" [presentContext]

def startWithNullContext : Stimulus :=
  startReview "start-with-null-context" [nullContext]

def startWithoutContext : Stimulus :=
  startReview "start-without-context" []

def runStart (stimulus : Stimulus) : StimulusResult :=
  applyStimulus scenarioClosureLimit reviewProgram initialState stimulus

def reviewTaskInstanceId : UserTaskInstanceId :=
  { processInstanceId := reviewInstanceId
    elementId := ⟨"UserTask_Review"⟩
    activation := 1 }

def completeReview : Stimulus :=
  .completeUserTaskInstance ⟨"complete-review"⟩ reviewTaskInstanceId []

def observed (result : StimulusResult) : Option StateObservation :=
  observeStableState reviewProgram result.state

theorem unavailableSourceStartCommits :
    (runStart startWithoutContext).outcome = CommandOutcome.committed := by
  decide +kernel

theorem unavailableSourceArmsNoTaskRecordOrScope :
    ((runStart startWithoutContext).state.waits,
      (runStart startWithoutContext).state.activityOccurrences,
      (runStart startWithoutContext).state.variables.activities) = ([], [], []) := by
  decide +kernel

theorem unavailableSourceLeavesTheProcessAtItsIncomingPlace :
    projectTokenMultiplicities reviewProgram (runStart startWithoutContext).state =
      [(⟨"place:Flow_Review_Completed"⟩, 0), (⟨"place:Flow_Start_Review"⟩, 1)] := by
  decide +kernel

/-- The capsule admits no later data ingress, so the unavailable-source state is durably stuck. It
still observes, which is what keeps absence visible rather than merely unpublishable and is what
gives the non-law below two `some` sides to separate. -/
theorem unavailableSourceStateIsStuckYetObservable :
    (stableStateResumable (runStart startWithoutContext).state,
      (observed (runStart startWithoutContext)).map (·.openUserTasks)) = (false, some []) := by
  decide +kernel

theorem presentStringSourceActivatesAndCopiesOnce :
    (runStart startWithContext).state.variables.activities =
      [{ owner := .activityOccurrence
           { processInstanceId := reviewInstanceId
             activityElementId := ⟨"UserTask_Review"⟩
             activation := 1 }
         bindings :=
           [{ name := reviewDirectInput.targetDataInputId
              value := presentContext.value }] }] := by
  decide +kernel

theorem activationPreservesTheSourcePropertyInProcessScope :
    (runStart startWithContext).state.variables.process.bindings = [presentContext] := by
  decide +kernel

theorem activationConsumesTheIncomingToken :
    projectTokenMultiplicities reviewProgram (runStart startWithContext).state =
      [(⟨"place:Flow_Review_Completed"⟩, 0), (⟨"place:Flow_Start_Review"⟩, 0)] := by
  decide +kernel

theorem explicitNullIsAvailableAndCopiedAsNull :
    (runStart startWithNullContext).state.variables.activities =
      [{ owner := .activityOccurrence
           { processInstanceId := reviewInstanceId
             activityElementId := ⟨"UserTask_Review"⟩
             activation := 1 }
         bindings :=
           [{ name := reviewDirectInput.targetDataInputId, value := .null }] }] := by
  decide +kernel

/-- The capsule's separating non-law: absence and explicit null are distinguished at the approved
public observation boundary, not only in runtime state. -/
theorem absentSourceIsNotAnAliasOfExplicitNull :
    observed (runStart startWithNullContext) ≠
      observed (runStart startWithoutContext) := by
  decide +kernel

theorem activeTaskPublishesExactlyItsOneSelectedInput :
    (observed (runStart startWithContext)).map (·.openUserTasks) =
      some
        [{ id := reviewTaskInstanceId
           name := some "Review invoice"
           state := .active
           inputs :=
             some
               [{ name := reviewDirectInput.targetDataInputId
                  value := presentContext.value }] }] := by
  decide +kernel

def completedReview : StimulusResult :=
  applyStimulus scenarioClosureLimit reviewProgram
    (runStart startWithContext).state completeReview

theorem emptyCompletionDisposesTaskRecordAndScopeTogether :
    (completedReview.state.waits, completedReview.state.activityOccurrences,
      completedReview.state.variables.activities) = ([], [], []) := by
  decide +kernel

theorem completionPreservesProcessDataAndReachesTheEnd :
    (completedReview.outcome, completedReview.state.variables.process.bindings) =
      (CommandOutcome.committed, [presentContext]) := by
  decide +kernel

theorem completedProcessPublishesNoOpenTask :
    (observeStableState reviewProgram completedReview.state).map (·.openUserTasks) =
      some [] := by
  decide +kernel

theorem staleCompletionPreservesTheCommittedState :
    applyStimulus scenarioClosureLimit reviewProgram completedReview.state
        completeReview =
      { outcome := .rejected
        state := completedReview.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- This profile's OutputSet is empty, so a submitted value has no admitted target and the
completion is refused rather than merged into Process scope. -/
theorem submittedValuesPreserveTheActiveState :
    applyStimulus scenarioClosureLimit reviewProgram (runStart startWithContext).state
        (.completeUserTaskInstance ⟨"complete-review-with-values"⟩ reviewTaskInstanceId
          [{ name := reviewDirectInput.source.id, value := .string "reviewed" }]) =
      { outcome := .rejected
        state := (runStart startWithContext).state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-! ## Ownership and identity refusals against a live task

`ADINPUT-REFUSE-01` over the three pre-states the account names but no retained fact reached: a
duplicated local owner, an absent one, and a well-formed command naming an activation the live wait
does not carry. Each perturbs the committed active state rather than a terminal one, so the refusal
cannot be attributed to the task already being gone. -/

def activeState : RuntimeState := (runStart startWithContext).state

def reviewLocalScope : ActivityVariableScope :=
  { owner := .activityOccurrence
      { processInstanceId := reviewInstanceId
        activityElementId := ⟨"UserTask_Review"⟩
        activation := 1 }
    bindings := [{ name := reviewDirectInput.targetDataInputId, value := presentContext.value }] }

def withLocalScopes (scopes : List ActivityVariableScope) : RuntimeState :=
  { activeState with
      variables := { activeState.variables with activities := scopes } }

def refused (state : RuntimeState) : StimulusResult :=
  { outcome := .rejected
    state := state
    internalStepBoundExceeded := false
    ambiguousInternalChoice := false }

/-- The perturbed scope is the one the committed activation actually produced, so a refusal here is
caused by its multiplicity rather than by a value the lookup would have rejected anyway. -/
theorem activationProducesExactlyTheDuplicatedScope :
    activeState.variables.activities = [reviewLocalScope] := by
  decide +kernel

theorem duplicateLocalOwnerRefusesCompletion :
    applyStimulus scenarioClosureLimit reviewProgram
        (withLocalScopes [reviewLocalScope, reviewLocalScope]) completeReview =
      refused (withLocalScopes [reviewLocalScope, reviewLocalScope]) := by
  decide +kernel

theorem absentLocalOwnerRefusesCompletion :
    applyStimulus scenarioClosureLimit reviewProgram (withLocalScopes []) completeReview =
      refused (withLocalScopes []) := by
  decide +kernel

/-- A live wait exists and carries activation `1`, so this separates identity checking from the
already-terminal case that [staleCompletionPreservesTheCommittedState] covers. -/
theorem wrongActivationAgainstALiveWaitRefuses :
    applyStimulus scenarioClosureLimit reviewProgram activeState
        (.completeUserTaskInstance ⟨"complete-wrong-activation"⟩
          { processInstanceId := reviewInstanceId
            elementId := ⟨"UserTask_Review"⟩
            activation := 2 } []) =
      refused activeState := by
  decide +kernel

def repeatedInputDeclarations (count : Nat) : Program :=
  { reviewProgram with
    operations := reviewProgram.operations.flatMap fun operation =>
      match operation with
      | .awaitDataInputUserTask .. => List.replicate count operation
      | _ => [operation] }

theorem multipleInputDeclarationsRefuseWithoutOrdinaryCompletion
    (count : Nat) (duplicated : count = 2 ∨ count = 3) :
    applyStimulus scenarioClosureLimit (repeatedInputDeclarations count)
      activeState completeReview = refused activeState := by
  rcases duplicated with rfl | rfl <;> decide +kernel

end BpmnSemantics.ActivityDataInputConformance

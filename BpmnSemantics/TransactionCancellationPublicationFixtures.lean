import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
import BpmnSemantics.SemanticProcess.ControlPositionProjection

/-! # Transaction Start-to-publication witnesses

The manual Program follows the reservation-withdrawal roles in
`packages/semantic-core/test/transaction-cancellation-fixtures.ts`. These finite executions check
TXC-CANCEL-01, TXC-EMPTY-01, TXC-JOIN-01 and TXC-FAIL-01 before source/profile registration;
they establish neither general conformance nor host refinement.
-/

namespace BpmnSemantics.TransactionCancellationPublicationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def instanceId : SemanticId := ⟨"Instance_Withdrawal"⟩
def rootScope : DefinitionScopeId := ⟨"scope:Process_Withdrawal"⟩
def childScope : DefinitionScopeId := ⟨"scope:Transaction_Reservation"⟩

def rootOwner : ScopeOccurrenceId :=
  { processInstanceId := instanceId, definitionScopeId := rootScope, activation := 1 }

def childOwner : ScopeOccurrenceId :=
  { processInstanceId := instanceId, definitionScopeId := childScope, activation := 1 }

def occurrence (element : String) : OccurrenceId :=
  { processInstanceId := instanceId, elementId := ⟨element⟩, activation := 1 }

private def task (element input output : String) : SemanticOperation :=
  .awaitUserTask ⟨"operation:" ++ element⟩ ⟨⟨element⟩⟩ ⟨"place:" ++ input⟩
    ⟨"place:" ++ output⟩ { id := ⟨element⟩, name := none }

def rootOperations : List SemanticOperation :=
  [ task "Acknowledge" "Cancel_Acknowledge" "Acknowledge_End"
  , .reachNoneEnd ⟨"operation:End_Cancelled"⟩ ⟨⟨"End_Cancelled"⟩⟩ ⟨"place:Acknowledge_End"⟩
  , .reachNoneEnd ⟨"operation:End_Normal"⟩ ⟨⟨"End_Normal"⟩⟩ ⟨"place:Transaction_End_Normal"⟩
  , .completeScope ⟨"operation:Process_Withdrawal"⟩ ⟨⟨"Process_Withdrawal"⟩⟩ rootScope none
  , .initiate ⟨"operation:Start"⟩ ⟨⟨"Start"⟩⟩ ⟨"place:Start_Transaction"⟩
  , .enterScope ⟨"operation:Transaction_Reservation"⟩ ⟨⟨"Transaction_Reservation"⟩⟩
      ⟨"place:Start_Transaction"⟩ ⟨"place:Child_Start_Split"⟩ childScope ]

def cancelOperation : SemanticOperation :=
  .cancelTransaction ⟨"operation:Cancel"⟩ ⟨⟨"Cancel"⟩⟩ childScope
    ⟨"place:Withdraw_Cancel"⟩ ⟨"place:Cancel_Acknowledge"⟩ ⟨"Boundary_Cancel"⟩

def childOperations : List SemanticOperation :=
  [ cancelOperation
  , .completeScope ⟨"operation:Complete_Transaction"⟩ ⟨⟨"Transaction_Reservation"⟩⟩
      childScope (some ⟨"place:Transaction_End_Normal"⟩)
  , .reachNoneEnd ⟨"operation:End_Prepared"⟩ ⟨⟨"End_Prepared"⟩⟩ ⟨"place:Prepare_End"⟩
  , task "Prepare" "Reserve_Prepare" "Prepare_End"
  , task "Reserve" "Split_Reserve" "Reserve_Prepare"
  , .duplicate ⟨"operation:Split"⟩ ⟨⟨"Split"⟩⟩ ⟨"place:Child_Start_Split"⟩
      [⟨"place:Split_Reserve"⟩, ⟨"place:Split_Withdraw"⟩]
  , task "Withdraw" "Split_Withdraw" "Withdraw_Cancel" ]

private def rootFlows : List String :=
  ["Acknowledge_End", "Cancel_Acknowledge", "Start_Transaction", "Transaction_End_Normal"]

private def childFlows : List String :=
  ["Child_Start_Split", "Prepare_End", "Reserve_Prepare", "Split_Reserve",
    "Split_Withdraw", "Withdraw_Cancel"]

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"cibseven-2.2.0-user-task-process-data-draft"⟩
        sourceId := ⟨"transaction-cancellation-semantics"⟩
        sourceSha256 := "2222222222222222222222222222222222222222222222222222222222222222" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"Process_Withdrawal"⟩
    definitionScopes :=
      [{ id := rootScope, parentScopeId := none, originElementId := ⟨"Process_Withdrawal"⟩ },
       { id := childScope, parentScopeId := some rootScope,
         originElementId := ⟨"Transaction_Reservation"⟩ }]
    operations := sortBy (fun a b => a.id.value < b.id.value) (rootOperations ++ childOperations)
    operationScopes := sortBy (fun a b => a.operationId.value < b.operationId.value)
      ((rootOperations.map fun op => { operationId := op.id, scopeId := rootScope }) ++
       (childOperations.map fun op => { operationId := op.id, scopeId := childScope }))
    controlPlaces := (sortBy (· < ·) (rootFlows ++ childFlows)).map fun flow =>
      { id := ⟨"place:" ++ flow⟩, origin := ⟨⟨flow⟩⟩ }
    controlPlaceScopes := sortBy (fun a b => a.controlPlaceId.value < b.controlPlaceId.value)
      ((rootFlows.map fun flow => { controlPlaceId := ⟨"place:" ++ flow⟩, scopeId := rootScope }) ++
       (childFlows.map fun flow => { controlPlaceId := ⟨"place:" ++ flow⟩, scopeId := childScope }))
    compensationActivityRetention := some
      { definitionScopeId := childScope
        targets := [
          { activityElementId := ⟨"Reserve"⟩
            boundaryEventElementId := ⟨"Boundary_Compensate"⟩
            compensationActivityElementId := ⟨"Release_Reservation"⟩ }]
        maxRecords := 1, maxCanonicalBytes := 4096 }
    compensationExecution := some
      { definitionScopeId := childScope, triggerOperationId := cancelOperation.id
        subjects := [.boundaryActivity ⟨"Reserve"⟩
          { handlerElementId := ⟨"Release_Reservation"⟩
            effectElementId := ⟨"Release_Reservation"⟩
            descriptor :=
              { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
                operation := "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" }
            input := .empty }]
        dependencies := []
        limits := { maxTriggers := 1, maxHandlers := 1, maxCanonicalBytes := 20480 } } }

def startStimulus : Stimulus :=
  .startProcess ⟨"publish-start"⟩ ⟨"Process_Withdrawal"⟩ instanceId []

def completeTask (element : String) : Stimulus :=
  .completeUserTaskInstance ⟨"publish-" ++ element⟩ (occurrence element) []

def successStimulus : Stimulus :=
  .completeEffect ⟨"complete-release"⟩ (occurrence "Release_Reservation") (.success [])

def failureStimulus : Stimulus :=
  .completeEffect ⟨"fail-release"⟩ (occurrence "Release_Reservation")
    (.bpmnError "release-refused" none [])

def run (before : RuntimeState) (stimulus : Stimulus) : TracedStimulusResult :=
  applyStimulusTracedWithCompensationSnapshots 8 program before stimulus

def started : TracedStimulusResult := run initialState startStimulus
def reserved : TracedStimulusResult := run started.result.state (completeTask "Reserve")
def cancelled : TracedStimulusResult := run reserved.result.state (completeTask "Withdraw")
def joined : TracedStimulusResult := run cancelled.result.state successStimulus
def completed : TracedStimulusResult := run joined.result.state (completeTask "Acknowledge")
def emptyCancelled : TracedStimulusResult := run started.result.state (completeTask "Withdraw")
def failed : TracedStimulusResult := run cancelled.result.state failureStimulus

private def openStart (anchor : SemanticFlowNodeOccurrenceAnchor) (element : String)
    (owner : ScopeOccurrenceId) : OpenSemanticFlowNodeOccurrence :=
  { anchor, processId := program.processId, elementId := ⟨element⟩, owner }

def transactionStart : OpenSemanticFlowNodeOccurrence :=
  openStart (.scope childOwner) "Transaction_Reservation" rootOwner

def taskStart (element : String) (owner : ScopeOccurrenceId) : OpenSemanticFlowNodeOccurrence :=
  openStart (.wait (occurrence element)) element owner

def handlerStart : OpenSemanticFlowNodeOccurrence :=
  openStart (.compensationHandler (occurrence "Release_Reservation")) "Release_Reservation" childOwner

private def instantaneous (command : String) (index localIndex : Nat) (element : String)
    (owner : ScopeOccurrenceId) : UnnumberedFlowNodeOccurrenceStart :=
  openStart (.transition ⟨command⟩ index localIndex) element owner

def cancelDelta : UnnumberedFlowNodeOccurrenceDelta :=
  { started := [handlerStart, instantaneous "publish-Withdraw" 1 0 "Cancel" childOwner]
    ended := [{ anchor := .wait (occurrence "Prepare"), terminal := .cancelled },
      { anchor := .transition ⟨"publish-Withdraw"⟩ 1 0, terminal := .completed }] }

def joinDelta : UnnumberedFlowNodeOccurrenceDelta :=
  { started := [instantaneous "complete-release" 0 0 "Boundary_Cancel" rootOwner]
    ended := [{ anchor := .scope childOwner, terminal := .cancelled },
      { anchor := handlerStart.anchor, terminal := .completed },
      { anchor := .transition ⟨"complete-release"⟩ 0 0, terminal := .completed }] }

def emptyDelta : UnnumberedFlowNodeOccurrenceDelta :=
  { started := [instantaneous "publish-Withdraw" 1 0 "Boundary_Cancel" rootOwner,
      instantaneous "publish-Withdraw" 1 1 "Cancel" childOwner]
    ended := [{ anchor := .wait (occurrence "Reserve"), terminal := .cancelled },
      { anchor := .scope childOwner, terminal := .cancelled },
      { anchor := .transition ⟨"publish-Withdraw"⟩ 1 0, terminal := .completed },
      { anchor := .transition ⟨"publish-Withdraw"⟩ 1 1, terminal := .completed }] }

private def acceptedCompanions (commandId : SemanticId) :
    Nat → RuntimeState → List CommittedTransition →
      List UnnumberedFlowNodeOccurrenceDelta → Option RuntimeState
  | _, before, [], [] => some before
  | index, before, transition :: transitions, lifecycle :: lifecycles => do
      let after ← match transition with
        | .externalStimulus stimulus =>
            let admission := admitStimulusWithCompensationSnapshots program before stimulus
            if admission.outcome == .committed then some admission.state else none
        | .internalOperation record =>
            replayInternalTransitionWithCompensationSnapshots? program before record
      let accepted ← match transition with
        | .externalStimulus stimulus =>
            flowNodeOccurrenceDeltaForStimulusWithCompensation? program before after stimulus index
        | .internalOperation record => do
            let operation ← program.operations.find? (fun op => op.id == record.operationId)
            flowNodeOccurrenceDeltaForOperationWithCompensation? program before after operation commandId index
      if accepted != lifecycle then none
      else
        let positionBefore ← projectControlPosition? program instanceId before
        let positionAfter ← projectControlPosition? program instanceId after
        let delta ← controlPositionDelta? program instanceId before after
        if applyControlPositionDelta? positionBefore delta != some positionAfter then none
        else acceptedCompanions commandId (index + 1) after transitions lifecycles
  | _, _, _, _ => none

def publicationAccepted (before : RuntimeState) (stimulus : Stimulus)
    (traced : TracedStimulusResult) : Bool :=
  traced.result.outcome == .committed && !traced.committedTransitions.isEmpty &&
    traced.committedTransitions.head? == some (.externalStimulus stimulus) &&
    acceptedCompanions (stimulusCommandId stimulus) 0 before traced.committedTransitions
      traced.flowNodeOccurrenceLifecycles == some traced.result.state &&
    (match projectOpenFlowNodeOccurrencesWithCompensation? program before,
        projectOpenFlowNodeOccurrencesWithCompensation? program traced.result.state with
      | some previous, some current =>
          foldFlowNodeOccurrenceDeltas previous traced.flowNodeOccurrenceLifecycles == some current
      | _, _ => false)

end BpmnSemantics.TransactionCancellationPublicationConformance

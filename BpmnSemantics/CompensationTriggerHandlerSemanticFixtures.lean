import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Shared compensation trigger and handler semantic fixtures -/

namespace BpmnSemantics.CompensationTriggerHandlerSemanticFixtures

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def instanceId : SemanticId := ⟨"compensation-semantic-instance"⟩

def rootOwner : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:process"⟩
    activation := 1 }

def parentB : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:B"⟩
    activation := 1 }

def occurrence (elementId : String) (activation : Nat := 1) : OccurrenceId :=
  { processInstanceId := instanceId, elementId := ⟨elementId⟩, activation }

def activityOccurrence (elementId : String) : ActivityOccurrenceId :=
  { processInstanceId := instanceId
    activityElementId := ⟨elementId⟩
    activation := 1 }

def compensationDescriptor : EffectDescriptor :=
  { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
    operation := "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" }

def boundaryBody (handler : String) : SingleEffectCompensationHandlerBody :=
  { handlerElementId := ⟨handler⟩
    effectElementId := ⟨handler⟩
    descriptor := compensationDescriptor
    input := .empty }

def eventBody : SingleEffectCompensationHandlerBody :=
  { handlerElementId := ⟨"HB"⟩
    effectElementId := ⟨"EB"⟩
    descriptor := compensationDescriptor
    input := .restoredProcessBinding "frozen" "argument" }

def subjectDefinitions : List CompensationSubjectDefinition :=
  [ .boundaryActivity ⟨"A"⟩ (boundaryBody "HA")
  , .eventSubProcess ⟨"scope:B"⟩ ⟨"scope:HB"⟩ eventBody
  , .boundaryActivity ⟨"C"⟩ (boundaryBody "HC") ]

def executionDeclaration : CompensationExecutionDeclaration :=
  { definitionScopeId := rootOwner.definitionScopeId
    triggerOperationId := ⟨"trigger"⟩
    subjects := subjectDefinitions
    dependencies :=
      [{ predecessorElementId := ⟨"A"⟩, successorElementId := ⟨"B"⟩ }]
    limits := { maxTriggers := 2, maxHandlers := 3, maxCanonicalBytes := 65536 } }

def triggerOperation : SemanticOperation :=
  .triggerCompensation ⟨"trigger"⟩ ⟨⟨"throw"⟩⟩ ⟨"scope:process"⟩
    ⟨"place:trigger"⟩ ⟨"place:done"⟩

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"compensation-semantic-checkpoint"⟩
        sourceId := ⟨"manual-program"⟩
        sourceSha256 := "manual-program-sha256" }
    internalSchedulingMode := .rejectObservableChoice
    processId := ⟨"process"⟩
    definitionScopes :=
      [{ id := ⟨"scope:process"⟩, parentScopeId := none, originElementId := ⟨"process"⟩ },
       { id := ⟨"scope:B"⟩, parentScopeId := some ⟨"scope:process"⟩,
         originElementId := ⟨"B"⟩ },
       { id := ⟨"scope:HB"⟩, parentScopeId := some ⟨"scope:B"⟩,
         originElementId := ⟨"HB"⟩ }]
    operationScopes :=
      [{ operationId := ⟨"op:A"⟩, scopeId := ⟨"scope:process"⟩ },
       { operationId := ⟨"op:C"⟩, scopeId := ⟨"scope:process"⟩ },
       { operationId := ⟨"op:enter-B"⟩, scopeId := ⟨"scope:process"⟩ },
       { operationId := ⟨"trigger"⟩, scopeId := ⟨"scope:process"⟩ }]
    controlPlaceScopes :=
      [{ controlPlaceId := ⟨"place:trigger"⟩, scopeId := ⟨"scope:process"⟩ },
       { controlPlaceId := ⟨"place:done"⟩, scopeId := ⟨"scope:process"⟩ }]
    controlPlaces :=
      [{ id := ⟨"place:trigger"⟩, origin := ⟨⟨"flow:trigger"⟩⟩ },
       { id := ⟨"place:done"⟩, origin := ⟨⟨"flow:done"⟩⟩ }]
    operations :=
      [.awaitUserTask ⟨"op:A"⟩ ⟨⟨"A"⟩⟩ ⟨"place:a-in"⟩ ⟨"place:a-out"⟩
        { id := ⟨"A"⟩, name := none },
       .awaitUserTask ⟨"op:C"⟩ ⟨⟨"C"⟩⟩ ⟨"place:c-in"⟩ ⟨"place:c-out"⟩
        { id := ⟨"C"⟩, name := none },
       .enterScope ⟨"op:enter-B"⟩ ⟨⟨"B"⟩⟩ ⟨"place:b-in"⟩ ⟨"place:b-entry"⟩
        ⟨"scope:B"⟩,
       triggerOperation]
    compensationActivityRetention := some
      { definitionScopeId := ⟨"scope:process"⟩
        targets :=
          [{ activityElementId := ⟨"A"⟩, boundaryEventElementId := ⟨"BA"⟩,
             compensationActivityElementId := ⟨"HA"⟩ },
           { activityElementId := ⟨"C"⟩, boundaryEventElementId := ⟨"BC"⟩,
             compensationActivityElementId := ⟨"HC"⟩ }]
        maxRecords := 2
        maxCanonicalBytes := 4096 }
    compensationEventSubProcessSnapshots := some
      { targets := [{ parentScopeId := ⟨"scope:B"⟩, handlerScopeId := ⟨"scope:HB"⟩ }]
        maxRecords := 1
        maxCanonicalBytes := 4096 }
    compensationExecution := some executionDeclaration }

def restoredContext : CompensationParentContextSnapshot :=
  { frames :=
      [{ owner := rootOwner, bindings := [{ name := "frozen", value := .string "old" }] },
       { owner := parentB, bindings := [] }] }

def subjectA : CompensationSubjectOccurrence := .boundaryActivity (activityOccurrence "A")
def subjectB : CompensationSubjectOccurrence := .eventSubProcess parentB
def subjectC : CompensationSubjectOccurrence := .boundaryActivity (activityOccurrence "C")

def pendingHandlerA : CompensationHandlerExecution :=
  { identity := { id := occurrence "HA", subject := subjectA, handlerElementId := ⟨"HA"⟩ }
    lifecycle := .pending none }

def compensatingHandlerB : CompensationHandlerExecution :=
  { identity := { id := occurrence "HB", subject := subjectB, handlerElementId := ⟨"HB"⟩ }
    lifecycle := .compensating (some restoredContext) (occurrence "EB") }

def compensatingHandlerC : CompensationHandlerExecution :=
  { identity := { id := occurrence "HC", subject := subjectC, handlerElementId := ⟨"HC"⟩ }
    lifecycle := .compensating none (occurrence "HC") }

def compensatingHandlerA : CompensationHandlerExecution :=
  { identity := pendingHandlerA.identity
    lifecycle := .compensating none (occurrence "HA") }

def compensatedHandlerA : CompensationHandlerExecution :=
  { identity := pendingHandlerA.identity, lifecycle := .compensated }

def compensatedHandlerB : CompensationHandlerExecution :=
  { identity := compensatingHandlerB.identity, lifecycle := .compensated }

def compensatedHandlerC : CompensationHandlerExecution :=
  { identity := compensatingHandlerC.identity, lifecycle := .compensated }

def failedHandlerC : CompensationHandlerExecution :=
  { identity := compensatingHandlerC.identity, lifecycle := .failed }

def terminatedHandlerA : CompensationHandlerExecution :=
  { identity := pendingHandlerA.identity, lifecycle := .terminated }

def terminatedHandlerB : CompensationHandlerExecution :=
  { identity := compensatingHandlerB.identity, lifecycle := .terminated }

def activeTrigger : CompensationTriggerExecution :=
  { id := occurrence "trigger"
    owner := rootOwner
    output := ⟨"place:done"⟩
    lifecycle := .active
    handlers := [pendingHandlerA, compensatingHandlerB, compensatingHandlerC]
    dependencies :=
      [{ predecessor := subjectA, successor := subjectB, reason := .sequenceFlow }] }

def waitB : CompensationHandlerEffectWait :=
  { id := occurrence "EB"
    triggerId := activeTrigger.id
    handlerId := compensatingHandlerB.identity.id
    descriptor := compensationDescriptor
    arguments := [{ name := "argument", value := .string "old" }] }

def waitC : CompensationHandlerEffectWait :=
  { id := occurrence "HC"
    triggerId := activeTrigger.id
    handlerId := compensatingHandlerC.identity.id
    descriptor := compensationDescriptor
    arguments := [] }

def waitA : CompensationHandlerEffectWait :=
  { id := occurrence "HA"
    triggerId := activeTrigger.id
    handlerId := compensatingHandlerA.identity.id
    descriptor := compensationDescriptor
    arguments := [] }

def activeState : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := rootOwner, parent := none }]
    compensationTriggers := [activeTrigger]
    compensationHandlerEffectWaits := [waitB, waitC]
    effectActivations :=
      [{ elementId := ⟨"EB"⟩, count := 1 }, { elementId := ⟨"HC"⟩, count := 1 }] }

def preTriggerState : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := rootOwner, parent := none }]
    tokens := [{ placeId := ⟨"place:trigger"⟩, owner := rootOwner }]
    compensationActivityRetentions :=
      [{ owner := rootOwner
         nextCompletionOrdinal := 3
         records :=
           [{ id := activityOccurrence "A", completionOrdinal := 1 },
            { id := activityOccurrence "C", completionOrdinal := 2 }] }]
    compensationParentContextRetentions :=
      [.promoted { id := parentB, parent := some rootOwner } ⟨"scope:HB"⟩ restoredContext] }

def triggeredState : RuntimeState :=
  { activeState with
    compensationActivityRetentions :=
      [{ owner := rootOwner, nextCompletionOrdinal := 3, records := [] }] }

def afterBTrigger : CompensationTriggerExecution :=
  { activeTrigger with
    handlers := [compensatingHandlerA, compensatedHandlerB, compensatingHandlerC] }

def afterBState : RuntimeState :=
  { triggeredState with
    compensationTriggers := [afterBTrigger]
    compensationHandlerEffectWaits := [waitA, waitC]
    effectActivations :=
      [{ elementId := ⟨"EB"⟩, count := 1 }, { elementId := ⟨"HA"⟩, count := 1 },
       { elementId := ⟨"HC"⟩, count := 1 }] }

def afterBThenATrigger : CompensationTriggerExecution :=
  { activeTrigger with
    handlers := [compensatedHandlerA, compensatedHandlerB, compensatingHandlerC] }

def afterBThenAState : RuntimeState :=
  { afterBState with
    compensationTriggers := [afterBThenATrigger]
    compensationHandlerEffectWaits := [waitC] }

def succeededTrigger : CompensationTriggerExecution :=
  { activeTrigger with
    lifecycle := .succeeded
    handlers := [compensatedHandlerA, compensatedHandlerB, compensatedHandlerC] }

def allSucceededState : RuntimeState :=
  { afterBThenAState with
    tokens := [{ placeId := ⟨"place:done"⟩, owner := rootOwner }]
    compensationTriggers := [succeededTrigger]
    compensationHandlerEffectWaits := [] }

def afterCFirstTrigger : CompensationTriggerExecution :=
  { activeTrigger with
    handlers := [pendingHandlerA, compensatingHandlerB, compensatedHandlerC] }

def afterCFirstState : RuntimeState :=
  { triggeredState with
    compensationTriggers := [afterCFirstTrigger]
    compensationHandlerEffectWaits := [waitB] }

def failureResult : EffectExecutionResult :=
  .bpmnError "compensation-rejected" (some "downstream rejected the reversal") []

def handlerFailure : CompensationHandlerFailure :=
  { kind := .compensationHandlerFailure
    triggerId := activeTrigger.id
    handlerId := compensatingHandlerC.identity.id
    effectId := waitC.id
    code := "compensation-rejected"
    message := some "downstream rejected the reversal" }

def failedTrigger : CompensationTriggerExecution :=
  { activeTrigger with
    lifecycle := .failed
    handlers := [terminatedHandlerA, terminatedHandlerB, failedHandlerC] }

def failedState : RuntimeState :=
  { triggeredState with
    control := .failed instanceId handlerFailure
    scopeOccurrences := []
    compensationActivityRetentions := []
    compensationTriggers := [failedTrigger]
    compensationHandlerEffectWaits := [] }

def delayedExecutionDeclaration : CompensationExecutionDeclaration :=
  { executionDeclaration with
    dependencies :=
      [{ predecessorElementId := ⟨"B"⟩, successorElementId := ⟨"C"⟩ }] }

def delayedProgram : Program :=
  { program with compensationExecution := some delayedExecutionDeclaration }

def delayedActiveTrigger : CompensationTriggerExecution :=
  { activeTrigger with
    handlers := [compensatingHandlerA,
      { compensatingHandlerB with lifecycle := .pending (some restoredContext) },
      compensatingHandlerC]
    dependencies :=
      [{ predecessor := subjectB, successor := subjectC, reason := .sequenceFlow }] }

def delayedWaitA : CompensationHandlerEffectWait :=
  { waitA with triggerId := delayedActiveTrigger.id }

def delayedWaitC : CompensationHandlerEffectWait :=
  { waitC with triggerId := delayedActiveTrigger.id }

def delayedTriggeredState : RuntimeState :=
  { triggeredState with
    compensationTriggers := [delayedActiveTrigger]
    compensationHandlerEffectWaits := [delayedWaitA, delayedWaitC]
    effectActivations :=
      [{ elementId := ⟨"HA"⟩, count := 1 }, { elementId := ⟨"HC"⟩, count := 1 }] }

def delayedAfterCTrigger : CompensationTriggerExecution :=
  { delayedActiveTrigger with
    handlers := [compensatingHandlerA, compensatingHandlerB, compensatedHandlerC] }

def delayedAfterCWaitB : CompensationHandlerEffectWait :=
  { waitB with triggerId := delayedActiveTrigger.id }

def delayedAfterCState : RuntimeState :=
  { delayedTriggeredState with
    compensationTriggers := [delayedAfterCTrigger]
    compensationHandlerEffectWaits := [delayedAfterCWaitB, delayedWaitA]
    effectActivations :=
      [{ elementId := ⟨"EB"⟩, count := 1 }, { elementId := ⟨"HA"⟩, count := 1 },
       { elementId := ⟨"HC"⟩, count := 1 }] }

def secondTriggerEmptySourceState : RuntimeState :=
  { triggeredState with
    tokens := [{ placeId := ⟨"place:trigger"⟩, owner := rootOwner }] }

def secondTriggerEligibleSourceState : RuntimeState :=
  { preTriggerState with
    compensationTriggers := [activeTrigger]
    compensationHandlerEffectWaits := [waitB, waitC]
    effectActivations := activeState.effectActivations }

def zeroSubjectDeclaration : CompensationExecutionDeclaration :=
  { executionDeclaration with
    subjects := []
    dependencies := []
    limits := { maxTriggers := 1, maxHandlers := 1, maxCanonicalBytes := 4096 } }

def zeroSubjectProgram : Program :=
  { program with
    operationScopes :=
      [{ operationId := ⟨"op:A"⟩, scopeId := ⟨"scope:process"⟩ },
       { operationId := ⟨"op:C"⟩, scopeId := ⟨"scope:process"⟩ },
       { operationId := ⟨"op:End"⟩, scopeId := ⟨"scope:process"⟩ },
       { operationId := ⟨"op:complete-root"⟩, scopeId := ⟨"scope:process"⟩ },
       { operationId := ⟨"op:enter-B"⟩, scopeId := ⟨"scope:process"⟩ },
       { operationId := ⟨"trigger"⟩, scopeId := ⟨"scope:process"⟩ }]
    operations :=
      [.awaitUserTask ⟨"op:A"⟩ ⟨⟨"A"⟩⟩ ⟨"place:a-in"⟩ ⟨"place:a-out"⟩
        { id := ⟨"A"⟩, name := none },
       .awaitUserTask ⟨"op:C"⟩ ⟨⟨"C"⟩⟩ ⟨"place:c-in"⟩ ⟨"place:trigger"⟩
        { id := ⟨"C"⟩, name := none },
       .reachNoneEnd ⟨"op:End"⟩ ⟨⟨"End"⟩⟩ ⟨"place:done"⟩,
       .completeScope ⟨"op:complete-root"⟩ ⟨⟨"process"⟩⟩
         ⟨"scope:process"⟩ none,
       .enterScope ⟨"op:enter-B"⟩ ⟨⟨"B"⟩⟩ ⟨"place:b-in"⟩ ⟨"place:b-entry"⟩
        ⟨"scope:B"⟩,
       triggerOperation]
    compensationActivityRetention := none
    compensationEventSubProcessSnapshots := none
    compensationExecution := some zeroSubjectDeclaration }

def succeededEmptyTrigger : CompensationTriggerExecution :=
  { id := occurrence "trigger"
    owner := rootOwner
    output := ⟨"place:done"⟩
    lifecycle := .succeeded
    handlers := []
    dependencies := [] }

def zeroSubjectAtRetainedLimitState : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := rootOwner, parent := none }]
    tokens := [{ placeId := ⟨"place:trigger"⟩, owner := rootOwner }]
    compensationTriggers := [succeededEmptyTrigger] }

def zeroSubjectAtRetainedLimitSuccessor : RuntimeState :=
  { zeroSubjectAtRetainedLimitState with
    tokens := [{ placeId := ⟨"place:done"⟩, owner := rootOwner }] }

def zeroSubjectWakeWait : UserTaskWait :=
  { processInstanceId := instanceId
    owner := rootOwner
    task := { id := ⟨"C"⟩, name := none }
    activation := 1
    output := ⟨"place:trigger"⟩ }

def zeroSubjectWakeState : RuntimeState :=
  { zeroSubjectAtRetainedLimitState with
    tokens := []
    waits := [zeroSubjectWakeWait]
    activations := [{ taskId := ⟨"C"⟩, count := 1 }] }

def zeroSubjectWakeStimulus : Stimulus :=
  .completeUserTaskInstance ⟨"complete-before-zero-subject-trigger"⟩
    (occurrence "C") []

def zeroSubjectWakeSuccessor : RuntimeState :=
  { zeroSubjectWakeState with
    control := .completed instanceId
    scopeOccurrences := []
    waits := []
    endOccurrences := 1 }

def dependencyDriftState : RuntimeState :=
  { activeState with
    compensationTriggers := [{ activeTrigger with dependencies := [] }] }

def contextDriftState : RuntimeState :=
  { activeState with
    compensationTriggers :=
      [{ activeTrigger with handlers :=
          [pendingHandlerA,
           { compensatingHandlerB with
             lifecycle := .compensating
               (some { restoredContext with frames :=
                 [{ owner := rootOwner,
                    bindings := [{ name := "frozen", value := .string "new" }] },
                  { owner := parentB, bindings := [] }] })
               (occurrence "EB") },
           compensatingHandlerC] }] }

def effectCollisionState : RuntimeState :=
  { activeState with
    effectWaits :=
      [{ processInstanceId := instanceId
         owner := rootOwner
         elementId := ⟨"EB"⟩
         activation := 1
         descriptor := compensationDescriptor
         arguments := []
         outputMappings := []
         output := ⟨"place:done"⟩
         bpmnErrorRoute := none }] }

def secondPendingHandlerA : CompensationHandlerExecution :=
  { identity :=
      { id := occurrence "HA" 2, subject := subjectA, handlerElementId := ⟨"HA"⟩ }
    lifecycle := .pending none }

def secondCompensatingHandlerB : CompensationHandlerExecution :=
  { identity :=
      { id := occurrence "HB" 2, subject := subjectB, handlerElementId := ⟨"HB"⟩ }
    lifecycle := .compensating (some restoredContext) (occurrence "EB" 2) }

def secondCompensatingHandlerC : CompensationHandlerExecution :=
  { identity :=
      { id := occurrence "HC" 2, subject := subjectC, handlerElementId := ⟨"HC"⟩ }
    lifecycle := .compensating none (occurrence "HC" 2) }

def secondActiveTrigger : CompensationTriggerExecution :=
  { id := occurrence "trigger" 2
    owner := rootOwner
    output := ⟨"place:done"⟩
    lifecycle := .active
    handlers :=
      [secondPendingHandlerA, secondCompensatingHandlerB, secondCompensatingHandlerC]
    dependencies :=
      [{ predecessor := subjectA, successor := subjectB, reason := .sequenceFlow }] }

def secondActiveTriggerState : RuntimeState :=
  { activeState with compensationTriggers := [activeTrigger, secondActiveTrigger] }

end BpmnSemantics.CompensationTriggerHandlerSemanticFixtures

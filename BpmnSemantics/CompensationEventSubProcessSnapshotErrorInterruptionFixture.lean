import BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance
import BpmnSemantics.SubProcessErrorPropagationConformance

/-! # Compensation Event Sub-Process snapshot Error interruption fixture -/

namespace BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def errorHandlerScopeId : DefinitionScopeId :=
  ⟨"scope:ErrorSnapshotHandler"⟩

def errorProgram : Program :=
  { SubProcessErrorPropagationConformance.program with
    definitionScopes :=
      [ { id := errorHandlerScopeId
          parentScopeId := some SubProcessErrorPropagationConformance.childScopeId
          originElementId := ⟨"ErrorSnapshotHandler"⟩ }
      , { id := SubProcessErrorPropagationConformance.rootScopeId
          parentScopeId := none
          originElementId := ⟨SubProcessErrorPropagationConformance.processId.value⟩ }
      , { id := SubProcessErrorPropagationConformance.childScopeId
          parentScopeId := some SubProcessErrorPropagationConformance.rootScopeId
          originElementId := ⟨"SubProcess_Work"⟩ } ]
    compensationEventSubProcessSnapshots := some
      { targets :=
          [{ parentScopeId := SubProcessErrorPropagationConformance.childScopeId
             handlerScopeId := errorHandlerScopeId }]
        maxRecords := 2
        maxCanonicalBytes := 4096 } }

def errorRootOccurrence : RuntimeScopeOccurrence :=
  { id :=
      { processInstanceId := SubProcessErrorPropagationConformance.instanceId
        definitionScopeId := SubProcessErrorPropagationConformance.rootScopeId
        activation := 1 }
    parent := none }

def errorChildOccurrence : RuntimeScopeOccurrence :=
  { id :=
      { processInstanceId := SubProcessErrorPropagationConformance.instanceId
        definitionScopeId := SubProcessErrorPropagationConformance.childScopeId
        activation := 1 }
    parent := some errorRootOccurrence.id }

def errorReadyState : RuntimeState :=
  { SubProcessErrorPropagationConformance.childWaiting.state with
    compensationParentContextRetentions :=
      [.provisional errorChildOccurrence errorHandlerScopeId] }

def errorInterrupted : StimulusResult :=
  applyStimulusWithCompensationSnapshots scenarioClosureLimit errorProgram errorReadyState
    (SubProcessErrorPropagationConformance.completeTask
      "interrupt-snapshot-by-error" "UserTask_TriggerError")

end BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance
